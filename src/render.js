// Renders the stats card as a standalone SVG (no external fonts or images,
// so it displays inside a GitHub README). Written for profile visitors.
import { dayKey } from './collect.js';
import { pickBook } from './books.js';

const THEMES = {
  dark: {
    bg: '#262624', tile: '#30302e', rule: '#3a3a37', label: '#8e8d88', value: '#e8e6e0', title: '#f5f4ef',
    muted: '#8e8d88', accent: '#d97757', accentText: '#fff',
    cells: ['#363634', '#8db3f4', '#6f9ef0', '#4f86e8', '#2563d9'],
    // tokens bar: generated, added to context, re-read from cache
    tok: ['#d97757', '#6f9ef0', '#57574f'],
    series: ['#d97757', '#6f9ef0', '#b7b4aa', '#6b6a64'],
  },
  light: {
    bg: '#faf9f5', tile: '#f0eee6', rule: '#e3e0d6', label: '#7a776f', value: '#1f1e1d', title: '#141413',
    muted: '#7a776f', accent: '#d97757', accentText: '#fff',
    cells: ['#e6e4da', '#a9c7f7', '#7fa9f2', '#5289ea', '#2563d9'],
    tok: ['#d97757', '#5289ea', '#cfccc1'],
    series: ['#d97757', '#5289ea', '#9d9a90', '#cfccc1'],
  },
};

const I18N = {
  en: {
    locale: 'en-US',
    title: 'Claude Code usage',
    range: { all: 'All time', '30d': 'Last 30 days', '7d': 'Last 7 days' },
    updated: (d) => `updated ${d}`,
    sessions: 'Sessions', prompts: 'Prompts', activeDays: 'Active days', streak: 'Longest streak',
    generated: 'Tokens generated', toolCalls: 'Tool calls', peakHour: 'Peak hour', favorite: 'Favorite model',
    days: (n) => `${n} day${n === 1 ? '' : 's'}`,
    hour: (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`,
    book: (n, title) => `Claude wrote ≈ ${n}× the length of ${title}`,
    less: 'Less', more: 'More',
    tokens: 'Tokens', processed: (n) => `${n} processed in total`,
    tokGenerated: 'Written by Claude', tokAdded: 'Added to context', tokReread: 'Re-read from cache',
    models: 'Models', byOutput: 'share of generated tokens',
    tools: 'Top tools', other: 'Other',
  },
  fr: {
    locale: 'fr-FR',
    title: 'Utilisation de Claude Code',
    range: { all: 'Depuis le début', '30d': '30 derniers jours', '7d': '7 derniers jours' },
    updated: (d) => `mis à jour le ${d}`,
    sessions: 'Sessions', prompts: 'Prompts', activeDays: 'Jours actifs', streak: 'Plus longue série',
    generated: 'Tokens générés', toolCalls: "Appels d'outils", peakHour: 'Heure de pointe', favorite: 'Modèle favori',
    days: (n) => `${n} jour${n > 1 ? 's' : ''}`,
    hour: (h) => `${String(h).padStart(2, '0')} h`,
    book: (n, title) => `Claude a écrit ≈ ${n}× la longueur ${title}`,
    less: 'Moins', more: 'Plus',
    tokens: 'Tokens', processed: (n) => `${n} traités au total`,
    tokGenerated: 'Écrits par Claude', tokAdded: 'Ajoutés au contexte', tokReread: 'Relus depuis le cache',
    models: 'Modèles', byOutput: 'part des tokens générés',
    tools: 'Outils les plus utilisés', other: 'Autres',
  },
};

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

// SVG can't measure text; a rough per-character width is enough for layout.
const textW = (s, size) => String(s).length * size * 0.52;

// Intensity relative to the busiest day: most days light, peaks dark.
function levels(counts) {
  const max = Math.max(0, ...counts.values());
  return (x) => (x <= 0 ? 0 : Math.min(4, Math.ceil((x / max) * 4)));
}

export function renderCard(stats, counts, { theme = 'dark', lang = 'en', name, hideTools = false, weeks = 26, now = new Date() } = {}) {
  const c = THEMES[theme] || THEMES.dark;
  const t = I18N[lang] || I18N.en;
  const num = (n) => n.toLocaleString(t.locale);
  const pct = (x) => (x > 0 && x < 0.001 ? '<0.1%' : `${x >= 0.995 ? 100 : x >= 0.1 ? Math.round(x * 100) : +(x * 100).toFixed(1)}%`);
  const W = 520, pad = 16, inner = W - pad * 2;
  const out = [];
  const text = (x, y, s, { size = 11, fill = c.muted, weight, anchor } = {}) =>
    out.push(`<text x="${+x.toFixed(1)}" y="${+y.toFixed(1)}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''} fill="${fill}">${esc(s)}</text>`);
  const rect = (x, y, w, h, fill, rx = 0) =>
    out.push(`<rect x="${+x.toFixed(1)}" y="${+y.toFixed(1)}" width="${+w.toFixed(1)}" height="${+h.toFixed(1)}"${rx ? ` rx="${rx}"` : ''} fill="${fill}"/>`);

  // Section title with a note on the right, then a thin rule above it.
  const section = (y, title, note) => {
    rect(pad, y - 20, inner, 1, c.rule);
    text(pad, y, title, { size: 12, fill: c.value, weight: 600 });
    if (note) text(W - pad, y, note, { anchor: 'end' });
  };

  // Horizontal stacked bar + legend underneath. Tiny parts keep a 3px sliver
  // so they stay visible; the legend carries the exact numbers.
  const stacked = (y, parts) => {
    const total = parts.reduce((s, p) => s + p.value, 0) || 1;
    const vis = parts.filter((p) => p.value > 0);
    const widths = vis.map((p) => Math.max(3, (p.value / total) * inner));
    const scale = inner / widths.reduce((a, b) => a + b, 0);
    out.push(`<clipPath id="bar${y}"><rect x="${pad}" y="${y}" width="${inner}" height="8" rx="4"/></clipPath><g clip-path="url(#bar${y})">`);
    let x = pad;
    vis.forEach((p, i) => { rect(x, y, widths[i] * scale, 8, p.color); x += widths[i] * scale; });
    out.push('</g>');
    // Legend in equal columns; the value is a tspan so it sits right after
    // the label whatever the font's real widths are.
    const col = inner / parts.length;
    const ly = y + 24;
    parts.forEach((p, i) => {
      const lx = pad + i * col;
      out.push(`<circle cx="${+(lx + 4).toFixed(1)}" cy="${ly - 4}" r="4" fill="${p.color}"/>`);
      out.push(`<text x="${+(lx + 12).toFixed(1)}" y="${ly}" font-size="11" fill="${c.muted}">${esc(p.label)} <tspan font-weight="600" fill="${c.value}">${esc(p.note)}</tspan></text>`);
    });
  };

  // ---- Header ----
  rect(pad, pad, 32, 32, c.accent, 8);
  out.push(`<text x="${pad + 16}" y="${pad + 21}" text-anchor="middle" font-size="14" font-weight="700" font-family="Consolas,Menlo,monospace" fill="${c.accentText}">&gt;_</text>`);
  text(pad + 44, pad + 14, t.title, { size: 16, fill: c.title, weight: 600 });
  const date = now.toLocaleDateString(t.locale, { month: 'short', day: 'numeric', year: 'numeric' });
  text(pad + 44, pad + 30, [name && `@${name}`, t.range[stats.range] || t.range.all, t.updated(date)].filter(Boolean).join(' · '), { size: 11.5 });

  // ---- Stat tiles, 4 x 2 ----
  const tiles = [
    [t.sessions, num(stats.sessions)],
    [t.prompts, num(stats.prompts)],
    [t.activeDays, num(stats.activeDays)],
    [t.streak, t.days(stats.longestStreak)],
    [t.generated, compact(stats.tokens.output)],
    [t.toolCalls, num(stats.toolCalls)],
    [t.peakHour, stats.peakHour == null ? '—' : t.hour(stats.peakHour)],
    [t.favorite, prettyModel(stats.favoriteModel)],
  ];
  const gap = 6, cols = 4, tw = (inner - gap * (cols - 1)) / cols, th = 46, ty0 = pad + 48;
  tiles.forEach(([label, value], i) => {
    const x = pad + (i % cols) * (tw + gap);
    const y = ty0 + Math.floor(i / cols) * (th + gap);
    rect(x, y, tw, th, c.tile, 6);
    text(x + 9, y + 18, label, { size: 11, fill: c.label });
    text(x + 9, y + 37, value, { size: 15, fill: c.value, weight: 600 });
  });

  // ---- Heatmap: columns = weeks (oldest → current), rows = Sunday → Saturday ----
  const my = ty0 + th * 2 + gap + 22;
  const hy = my + 6;
  const step = (inner + 3) / weeks, cell = step - 3;
  const level = levels(counts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - (weeks - 1) * 7);
  // Month labels where each month starts; one with no room before the next is dropped.
  const monthCols = [];
  for (let w = 0; w < weeks; w++) {
    const first = new Date(start);
    first.setDate(start.getDate() + w * 7);
    if (!monthCols.length || first.getMonth() !== monthCols.at(-1).date.getMonth()) monthCols.push({ w, date: first });
  }
  monthCols.forEach(({ w, date }, i) => {
    if ((monthCols[i + 1]?.w ?? weeks + 2) - w < 3) return;
    text(pad + w * step, my, date.toLocaleDateString(t.locale, { month: 'short' }).replace('.', ''), { size: 10.5 });
  });
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      if (day > today) continue;
      rect(pad + w * step, hy + d * step, cell, cell, c.cells[level(counts.get(dayKey(day)) || 0)], 3);
    }
  }

  // Under the heatmap: book comparison (left), legend (right)
  const fy = hy + 7 * step + 14;
  const book = pickBook(stats.tokens.output);
  if (book.ratio >= 0.1) {
    const n = book.ratio >= 10 ? num(Math.round(book.ratio)) : book.ratio.toLocaleString(t.locale, { maximumFractionDigits: 1 });
    text(pad, fy, t.book(n, book[lang] || book.en));
  }
  let lx = W - pad;
  text(lx, fy, t.more, { anchor: 'end' });
  lx -= textW(t.more, 11) + 5;
  for (let i = 4; i >= 0; i--) { lx -= 10; rect(lx, fy - 9, 10, 10, c.cells[i], 2); lx -= 3; }
  text(lx - 3, fy, t.less, { anchor: 'end' });

  // ---- Tokens ----
  let y = fy + 42;
  const tk = stats.tokens;
  section(y, t.tokens, t.processed(compact(stats.tokensTotal)));
  stacked(y + 12, [
    { label: t.tokGenerated, value: tk.output, note: compact(tk.output), color: c.tok[0] },
    { label: t.tokAdded, value: tk.input + tk.cacheWrite, note: compact(tk.input + tk.cacheWrite), color: c.tok[1] },
    { label: t.tokReread, value: tk.cacheRead, note: compact(tk.cacheRead), color: c.tok[2] },
  ]);

  // ---- Models ----
  if (stats.models.length) {
    y += 72;
    section(y, t.models, t.byOutput);
    const total = stats.models.reduce((s, m) => s + m.output, 0) || 1;
    const top = stats.models.slice(0, 3);
    const rest = stats.models.slice(3).reduce((s, m) => s + m.output, 0);
    const parts = top.map((m, i) => ({ label: prettyModel(m.model), value: m.output, note: pct(m.output / total), color: c.series[i] }));
    if (rest > 0) parts.push({ label: t.other, value: rest, note: pct(rest / total), color: c.series[3] });
    stacked(y + 12, parts);
  }

  // ---- Top tools, as chips ----
  if (!hideTools && stats.topTools.length) {
    y += 72;
    section(y, t.tools, `${num(stats.toolCalls)} ${t.toolCalls.toLowerCase()}`);
    let cx = pad;
    const cy = y + 12;
    for (const [tool, n] of stats.topTools.slice(0, 5)) {
      const label = tool.length > 16 ? `${tool.slice(0, 15)}…` : tool;
      const w = textW(label, 11) + textW(compact(n), 11) + 24;
      if (cx + w > W - pad) break;
      rect(cx, cy, w, 22, c.tile, 11);
      text(cx + 10, cy + 15, label, { size: 11, fill: c.value });
      text(cx + w - 10, cy + 15, compact(n), { size: 11, weight: 600, anchor: 'end' });
      cx += w + 6;
    }
    y = cy + 22;
  }

  const H = Math.round(y + pad + 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<title>${esc(name ? `${name} — ${t.title}` : t.title)}</title>
<rect width="${W}" height="${H}" rx="12" fill="${c.bg}"/>
${out.join('\n')}
</svg>
`;
}
