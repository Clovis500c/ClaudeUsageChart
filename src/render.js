// Renders the stats card as a standalone SVG (no external fonts or images,
// so it displays inside a GitHub README).
import { dayKey } from './collect.js';

const THEMES = {
  dark: {
    bg: '#262624', tile: '#30302e', label: '#8e8d88', value: '#e8e6e0',
    pill: '#3a3a37', pillText: '#e8e6e0', muted: '#8e8d88', footer: '#9a9892',
    cells: ['#363634', '#8db3f4', '#6f9ef0', '#4f86e8', '#2563d9'],
  },
  light: {
    bg: '#faf9f5', tile: '#f0eee6', label: '#7a776f', value: '#1f1e1d',
    pill: '#e3e0d6', pillText: '#1f1e1d', muted: '#7a776f', footer: '#6b6860',
    cells: ['#e6e4da', '#a9c7f7', '#7fa9f2', '#5289ea', '#2563d9'],
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

// Intensity relative to the busiest day, like the client: most days light, peaks dark.
function levels(counts) {
  const max = Math.max(0, ...counts.values());
  return (x) => (x <= 0 ? 0 : Math.min(4, Math.ceil((x / max) * 4)));
}

export function renderCard(stats, counts, { theme = 'dark', lang = 'en', weeks = 26, now = new Date() } = {}) {
  const c = THEMES[theme] || THEMES.dark;
  const t = I18N[lang] || I18N.en;
  const num = (n) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
  const W = 480, pad = 12;
  const out = [];

  // Tabs row; width is estimated from the label since SVG can't measure text
  const tabW = (label) => Math.round(label.length * 6.8 + 14);
  const tab = (x, label, active, w = tabW(label)) => {
    if (active) out.push(`<rect x="${x}" y="${pad}" width="${w}" height="20" rx="5" fill="${c.pill}"/>`);
    out.push(`<text x="${x + w / 2}" y="${pad + 14}" text-anchor="middle" font-size="12" ${active ? `font-weight="600" fill="${c.pillText}"` : `fill="${c.muted}"`}>${esc(label)}</text>`);
  };
  tab(pad, t.overview, true);
  tab(pad + tabW(t.overview) + 2, t.models, false);
  const ranges = ['all', '30d', '7d'];
  let rx = W - pad;
  for (const r of [...ranges].reverse()) {
    const w = tabW(t[r]);
    rx -= w;
    tab(rx, t[r], stats.range === r, w);
    rx -= 2;
  }

  // Stat tiles, 3 x 2
  const tiles = [
    [t.sessions, num(stats.sessions)],
    [t.messages, num(stats.messages)],
    [t.tokens, compact(stats.tokens)],
    [t.activeDays, num(stats.activeDays)],
    [t.peakHour, stats.peakHour == null ? '—' : t.hour(stats.peakHour)],
    [t.favorite, prettyModel(stats.favoriteModel)],
  ];
  const gap = 6, tw = (W - pad * 2 - gap * 2) / 3, th = 44, ty0 = 44;
  tiles.forEach(([label, value], i) => {
    const x = pad + (i % 3) * (tw + gap);
    const y = ty0 + Math.floor(i / 3) * (th + gap);
    out.push(`<rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="5" fill="${c.tile}"/>`);
    out.push(`<text x="${x + 6}" y="${y + 17}" font-size="12.5" fill="${c.label}">${esc(label)}</text>`);
    out.push(`<text x="${x + 6}" y="${y + 36}" font-size="13.5" font-weight="600" fill="${c.value}">${esc(value)}</text>`);
  });

  // Heatmap: columns = weeks (oldest → current), rows = Sunday → Saturday
  const hy = ty0 + th * 2 + gap + 8;
  const step = (W - pad * 2 + 2.5) / weeks, cell = step - 2.5;
  const level = levels(counts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay(); // 0 = Sunday
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
  const fy = hy + 7 * step + 16;
  const ratio = Math.round(stats.tokens / GATSBY_TOKENS);
  if (ratio >= 2) out.push(`<text x="${pad}" y="${fy}" font-size="11.5" fill="${c.footer}">${esc(t.gatsby(ratio))}</text>`);

  const H = Math.round(fy + pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<title>Claude stats</title>
<rect width="${W}" height="${H}" rx="10" fill="${c.bg}"/>
${out.join('\n')}
</svg>
`;
}
