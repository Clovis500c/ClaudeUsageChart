// Renders the stats card as a standalone SVG (no external fonts or images,
// so it displays inside a GitHub README).
import { dayKey } from './collect.js';

const THEMES = {
  dark: {
    bg: '#262624', tile: '#30302e', border: '#3a3a37', label: '#a6a39a', value: '#f5f4ef',
    pill: '#3d3d3a', pillText: '#f5f4ef', muted: '#8f8c84',
    cells: ['#383836', '#9cc3fb', '#74a8f5', '#4d8bef', '#2f6ee0'],
  },
  light: {
    bg: '#faf9f5', tile: '#f0eee6', border: '#e3e0d6', label: '#6b6860', value: '#1f1e1d',
    pill: '#e3e0d6', pillText: '#1f1e1d', muted: '#7a776f',
    cells: ['#e8e6dc', '#c3dafe', '#8fb8fa', '#5b95f0', '#2f6ee0'],
  },
};

const I18N = {
  fr: {
    overview: 'Aperçu', models: 'Modèles', all: 'Tous', '30d': '30j', '7d': '7j',
    sessions: 'Sessions', messages: 'Messages', tokens: 'Total de tokens',
    activeDays: 'Jours actifs', peakHour: 'Heure de pointe', favorite: 'Modèle favori',
    hour: (h) => `${String(h).padStart(2, '0')} h`,
    gatsby: (n) => `Vous avez utilisé ~${n}× plus de tokens que The Great Gatsby.`,
  },
  en: {
    overview: 'Overview', models: 'Models', all: 'All', '30d': '30d', '7d': '7d',
    sessions: 'Sessions', messages: 'Messages', tokens: 'Total tokens',
    activeDays: 'Active days', peakHour: 'Peak hour', favorite: 'Favorite model',
    hour: (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`,
    gatsby: (n) => `You've used ~${n}× more tokens than The Great Gatsby.`,
  },
};

const GATSBY_TOKENS = 62000;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function prettyModel(id) {
  if (!id) return '—';
  const parts = id.replace(/^claude-/, '').replace(/-\d{8}$/, '').split('-');
  const family = parts.shift();
  return `${family[0].toUpperCase()}${family.slice(1)} ${parts.join('.')}`.trim();
}

export function compact(n) {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return String(n);
}

// Quartiles of the non-zero days decide the 4 color levels, like GitHub.
function levels(counts) {
  const v = [...counts.values()].filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return () => 0;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const t = [q(0.25), q(0.5), q(0.75)];
  return (x) => (x <= 0 ? 0 : x <= t[0] ? 1 : x <= t[1] ? 2 : x <= t[2] ? 3 : 4);
}

export function renderCard(stats, counts, { theme = 'dark', lang = 'fr', weeks = 26, now = new Date() } = {}) {
  const c = THEMES[theme] || THEMES.dark;
  const t = I18N[lang] || I18N.fr;
  const W = 480, pad = 12;
  const out = [];

  // Tabs row
  const tab = (x, label, active, w) => {
    if (active) out.push(`<rect x="${x}" y="${pad}" width="${w}" height="20" rx="5" fill="${c.pill}"/>`);
    out.push(`<text x="${x + w / 2}" y="${pad + 14}" text-anchor="middle" font-size="12" ${active ? `font-weight="600" fill="${c.pillText}"` : `fill="${c.muted}"`}>${esc(label)}</text>`);
  };
  tab(pad, t.overview, true, 52);
  tab(pad + 54, t.models, false, 54);
  const ranges = ['all', '30d', '7d'];
  let rx = W - pad;
  for (const r of [...ranges].reverse()) {
    const w = r === 'all' ? 36 : 26;
    rx -= w;
    tab(rx, t[r], stats.range === r, w);
    rx -= 2;
  }

  // Stat tiles, 3 x 2
  const tiles = [
    [t.sessions, stats.sessions],
    [t.messages, stats.messages],
    [t.tokens, compact(stats.tokens)],
    [t.activeDays, stats.activeDays],
    [t.peakHour, stats.peakHour == null ? '—' : t.hour(stats.peakHour)],
    [t.favorite, prettyModel(stats.favoriteModel)],
  ];
  const gap = 6, tw = (W - pad * 2 - gap * 2) / 3, th = 44, ty0 = 44;
  tiles.forEach(([label, value], i) => {
    const x = pad + (i % 3) * (tw + gap);
    const y = ty0 + Math.floor(i / 3) * (th + gap);
    out.push(`<rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="5" fill="${c.tile}"/>`);
    out.push(`<text x="${x + 6}" y="${y + 16}" font-size="12" fill="${c.label}">${esc(label)}</text>`);
    out.push(`<text x="${x + 6}" y="${y + 35}" font-size="14" font-weight="700" fill="${c.value}">${esc(value)}</text>`);
  });

  // Heatmap: columns = weeks (oldest → current), rows = Monday → Sunday
  const hy = ty0 + th * 2 + gap + 12;
  const step = (W - pad * 2 + 2.5) / weeks, cell = step - 2.5;
  const level = levels(counts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(today);
  start.setDate(today.getDate() - dow - (weeks - 1) * 7);
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      if (day > today) continue;
      const n = counts.get(dayKey(day)) || 0;
      out.push(`<rect x="${(pad + w * step).toFixed(1)}" y="${(hy + d * step).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="2" fill="${c.cells[level(n)]}"><title>${dayKey(day)}: ${n}</title></rect>`);
    }
  }

  // Footer fun fact
  const fy = hy + 7 * step + 14;
  const ratio = Math.round(stats.tokens / GATSBY_TOKENS);
  if (ratio >= 2) out.push(`<text x="${pad}" y="${fy}" font-size="11" fill="${c.label}">${esc(t.gatsby(ratio))}</text>`);

  const H = Math.round(fy + pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<title>Claude stats</title>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="9" fill="${c.bg}" stroke="${c.border}"/>
${out.join('\n')}
</svg>
`;
}
