// Renders the stats card as a standalone SVG (no external fonts or images,
// so it displays inside a GitHub README). Written for profile visitors.
import { dayKey } from './collect.js';

const THEMES = {
  dark: {
    bg: '#262624', tile: '#30302e', label: '#8e8d88', value: '#e8e6e0', title: '#f5f4ef',
    muted: '#8e8d88', accent: '#d97757', accentText: '#fff',
    cells: ['#363634', '#8db3f4', '#6f9ef0', '#4f86e8', '#2563d9'],
  },
  light: {
    bg: '#faf9f5', tile: '#f0eee6', label: '#7a776f', value: '#1f1e1d', title: '#141413',
    muted: '#7a776f', accent: '#d97757', accentText: '#fff',
    cells: ['#e6e4da', '#a9c7f7', '#7fa9f2', '#5289ea', '#2563d9'],
  },
};

const I18N = {
  en: {
    locale: 'en-US',
    title: 'Claude Code usage',
    range: { all: 'All time', '30d': 'Last 30 days', '7d': 'Last 7 days' },
    updated: (d) => `updated ${d}`,
    sessions: 'Sessions', prompts: 'Prompts', tokens: 'Tokens processed',
    activeDays: 'Active days', peakHour: 'Peak hour', favorite: 'Favorite model',
    hour: (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`,
    gatsby: (n) => `Claude generated ≈ ${n}× the length of The Great Gatsby`,
    less: 'Less', more: 'More',
  },
  fr: {
    locale: 'fr-FR',
    title: 'Utilisation de Claude Code',
    range: { all: 'Depuis le début', '30d': '30 derniers jours', '7d': '7 derniers jours' },
    updated: (d) => `mis à jour le ${d}`,
    sessions: 'Sessions', prompts: 'Prompts', tokens: 'Tokens traités',
    activeDays: 'Jours actifs', peakHour: 'Heure de pointe', favorite: 'Modèle favori',
    hour: (h) => `${String(h).padStart(2, '0')} h`,
    gatsby: (n) => `Claude a généré ≈ ${n}× la longueur de Gatsby le Magnifique`,
    less: 'Moins', more: 'Plus',
  },
};

// The Great Gatsby: 47,094 words × ~1.3 tokens per English word ≈ 61k tokens.
// Compared against output tokens only (what Claude actually generated).
const GATSBY_TOKENS = 61000;
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

// Intensity relative to the busiest day: most days light, peaks dark.
function levels(counts) {
  const max = Math.max(0, ...counts.values());
  return (x) => (x <= 0 ? 0 : Math.min(4, Math.ceil((x / max) * 4)));
}

export function renderCard(stats, counts, { theme = 'dark', lang = 'en', name, weeks = 26, now = new Date() } = {}) {
  const c = THEMES[theme] || THEMES.dark;
  const t = I18N[lang] || I18N.en;
  const num = (n) => n.toLocaleString(t.locale);
  const W = 480, pad = 14;
  const out = [];

  // Header: badge + title, then who / period / freshness
  out.push(`<rect x="${pad}" y="${pad}" width="30" height="30" rx="7" fill="${c.accent}"/>`);
  out.push(`<text x="${pad + 15}" y="${pad + 20}" text-anchor="middle" font-size="13" font-weight="700" font-family="Consolas,Menlo,monospace" fill="${c.accentText}">&gt;_</text>`);
  out.push(`<text x="${pad + 40}" y="${pad + 13}" font-size="15" font-weight="600" fill="${c.title}">${esc(t.title)}</text>`);
  const date = now.toLocaleDateString(t.locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const sub = [name && `@${name}`, t.range[stats.range] || t.range.all, t.updated(date)].filter(Boolean).join(' · ');
  out.push(`<text x="${pad + 40}" y="${pad + 29}" font-size="11.5" fill="${c.muted}">${esc(sub)}</text>`);

  // Stat tiles, 3 x 2
  const tiles = [
    [t.sessions, num(stats.sessions)],
    [t.prompts, num(stats.prompts)],
    [t.tokens, compact(stats.tokensTotal)],
    [t.activeDays, num(stats.activeDays)],
    [t.peakHour, stats.peakHour == null ? '—' : t.hour(stats.peakHour)],
    [t.favorite, prettyModel(stats.favoriteModel)],
  ];
  const gap = 6, tw = (W - pad * 2 - gap * 2) / 3, th = 46, ty0 = pad + 44;
  tiles.forEach(([label, value], i) => {
    const x = pad + (i % 3) * (tw + gap);
    const y = ty0 + Math.floor(i / 3) * (th + gap);
    out.push(`<rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="6" fill="${c.tile}"/>`);
    out.push(`<text x="${x + 8}" y="${y + 18}" font-size="11.5" fill="${c.label}">${esc(label)}</text>`);
    out.push(`<text x="${x + 8}" y="${y + 37}" font-size="15" font-weight="600" fill="${c.value}">${esc(value)}</text>`);
  });

  // Heatmap: columns = weeks (oldest → current), rows = Sunday → Saturday
  const my = ty0 + th * 2 + gap + 22; // month labels baseline
  const hy = my + 6;
  const step = (W - pad * 2 + 2.5) / weeks, cell = step - 2.5;
  const level = levels(counts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - (weeks - 1) * 7);
  // Month labels at the column where each month starts; a label with no room
  // before the next one is dropped (like GitHub's graph).
  const monthCols = [];
  for (let w = 0; w < weeks; w++) {
    const first = new Date(start);
    first.setDate(start.getDate() + w * 7);
    if (!monthCols.length || first.getMonth() !== monthCols.at(-1).date.getMonth()) monthCols.push({ w, date: first });
  }
  monthCols.forEach(({ w, date }, i) => {
    const next = monthCols[i + 1]?.w ?? weeks + 2;
    if (next - w < 3) return;
    const m = date.toLocaleDateString(t.locale, { month: 'short' }).replace('.', '');
    out.push(`<text x="${(pad + w * step).toFixed(1)}" y="${my}" font-size="10.5" fill="${c.muted}">${esc(m)}</text>`);
  });
  for (let w = 0; w < weeks; w++) {
    const first = new Date(start);
    first.setDate(start.getDate() + w * 7);
    for (let d = 0; d < 7; d++) {
      const day = new Date(first);
      day.setDate(first.getDate() + d);
      if (day > today) continue;
      const n = counts.get(dayKey(day)) || 0;
      out.push(`<rect x="${(pad + w * step).toFixed(1)}" y="${(hy + d * step).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="2.5" fill="${c.cells[level(n)]}"/>`);
    }
  }

  // Footer: fun fact on the left, legend on the right
  const fy = hy + 7 * step + 16;
  const ratio = stats.tokens.output / GATSBY_TOKENS;
  if (ratio >= 0.1) {
    const n = ratio >= 10 ? num(Math.round(ratio)) : ratio.toLocaleString(t.locale, { maximumFractionDigits: 1 });
    out.push(`<text x="${pad}" y="${fy}" font-size="11" fill="${c.muted}">${esc(t.gatsby(n))}</text>`);
  }
  const sq = 10, sgap = 3;
  let lx = W - pad;
  out.push(`<text x="${lx}" y="${fy}" text-anchor="end" font-size="11" fill="${c.muted}">${esc(t.more)}</text>`);
  lx -= t.more.length * 5.8 + 5;
  for (let i = 4; i >= 0; i--) {
    lx -= sq;
    out.push(`<rect x="${lx.toFixed(1)}" y="${fy - 9}" width="${sq}" height="${sq}" rx="2" fill="${c.cells[i]}"/>`);
    lx -= sgap;
  }
  out.push(`<text x="${(lx - 3).toFixed(1)}" y="${fy}" text-anchor="end" font-size="11" fill="${c.muted}">${esc(t.less)}</text>`);

  const H = Math.round(fy + pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<title>${esc(name ? `${name} — ${t.title}` : t.title)}</title>
<rect width="${W}" height="${H}" rx="12" fill="${c.bg}"/>
${out.join('\n')}
</svg>
`;
}
