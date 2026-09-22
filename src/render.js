// Renders the stats card as a standalone SVG (no external fonts or images,
// so it displays inside a GitHub README). Written for profile visitors.
import { dayKey } from './collect.js';
import { pickBook } from './books.js';

const THEMES = {
  dark: {
    bg: '#262624', tile: '#30302e', rule: '#3a3a37', label: '#8e8d88', value: '#e8e6e0', title: '#f5f4ef',
    muted: '#8e8d88', empty: '#363634',
    // tokens bar: generated (accent), added to context, re-read from cache
    tok: ['#6f9ef0', '#57574f'],
    series: ['#6f9ef0', '#b7b4aa', '#6b6a64'],
  },
  light: {
    bg: '#faf9f5', tile: '#f0eee6', rule: '#e3e0d6', label: '#7a776f', value: '#1f1e1d', title: '#141413',
    muted: '#7a776f', empty: '#e6e4da',
    tok: ['#5289ea', '#cfccc1'],
    series: ['#5289ea', '#9d9a90', '#cfccc1'],
  },
};

// Heatmap scales, low → high activity, for dark and light backgrounds.
export const PALETTES = {
  blue: { dark: ['#8db3f4', '#6f9ef0', '#4f86e8', '#2563d9'], light: ['#a9c7f7', '#7fa9f2', '#5289ea', '#2563d9'] },
  green: { dark: ['#0e4429', '#006d32', '#26a641', '#39d353'], light: ['#9be9a8', '#40c463', '#30a14e', '#216e39'] },
  orange: { dark: ['#f4c7b0', '#eba483', '#e0825a', '#c9602f'], light: ['#f6d3c1', '#efb294', '#e48d66', '#c9602f'] },
  purple: { dark: ['#cdbdf7', '#ad97f0', '#8c70e6', '#6b4bd8'], light: ['#dccff9', '#bba7f2', '#9a7fe8', '#6b4bd8'] },
  pink: { dark: ['#f7bdd8', '#f096c0', '#e46ea6', '#cc4589'], light: ['#f9d3e5', '#f2a9cb', '#e67daf', '#cc4589'] },
  gray: { dark: ['#6b6a64', '#8e8d88', '#b7b4aa', '#e8e6e0'], light: ['#cfccc1', '#a9a69c', '#7a776f', '#3d3c38'] },
};

export const SECTIONS = ['header', 'tiles', 'heatmap', 'book', 'tokens', 'models', 'tools'];

export const TILES = ['sessions', 'prompts', 'activeDays', 'streak', 'generated', 'toolCalls', 'peakHour', 'favorite', 'responses', 'processed'];
export const DEFAULT_TILES = TILES.slice(0, 8);

const I18N = {
  en: {
    locale: 'en-US',
    title: 'Claude Code usage',
    range: { all: 'All time', '30d': 'Last 30 days', '7d': 'Last 7 days' },
    updated: (d) => `updated ${d}`,
    sessions: 'Sessions', prompts: 'Prompts', activeDays: 'Active days', streak: 'Longest streak',
    generated: 'Tokens generated', toolCalls: 'Tool calls', peakHour: 'Peak hour', favorite: 'Favorite model',
    responses: 'Claude responses', processed: 'Tokens processed',
    days: (n) => `${n} day${n === 1 ? '' : 's'}`,
    hour: (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`,
    book: (n, title) => `Claude wrote ≈ ${n}× the length of ${title}`,
    less: 'Less', more: 'More',
    tokens: 'Tokens', processedTotal: (n) => `${n} processed in total`,
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
    responses: 'Réponses de Claude', processed: 'Tokens traités',
    days: (n) => `${n} jour${n > 1 ? 's' : ''}`,
    hour: (h) => `${String(h).padStart(2, '0')} h`,
    book: (n, title) => `Claude a écrit ≈ ${n}× la longueur ${title}`,
    less: 'Moins', more: 'Plus',
    tokens: 'Tokens', processedTotal: (n) => `${n} traités au total`,
    tokGenerated: 'Écrits par Claude', tokAdded: 'Ajoutés au contexte', tokReread: 'Relus depuis le cache',
    models: 'Modèles', byOutput: 'part des tokens générés',
    tools: 'Outils les plus utilisés', other: 'Autres',
  },
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const DEFAULT_ACCENT = '#d97757';

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

// Accepts "#d97757", "d97757" or "#abc"; returns null when invalid.
export function parseColor(s) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s ?? '').trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

// Dark or light text, whichever reads better on the given background.
function textOn(hex) {
  const h = hex.length === 4 ? hex.replace(/w/g, (x) => x + x) : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1f1e1d' : '#ffffff';
}

// SVG can't measure text; a rough per-character width is enough for layout.
const textW = (s, size) => String(s).length * size * 0.52;

// Intensity relative to the busiest day: most days light, peaks dark.
function levels(counts) {
  const max = Math.max(0, ...counts.values());
  return (x) => (x <= 0 ? 0 : Math.min(4, Math.ceil((x / max) * 4)));
}

export function renderCard(stats, counts, opts = {}) {
  const {
    theme = 'dark', lang = 'en', name, title, now = new Date(),
    palette = 'blue', accent = DEFAULT_ACCENT, transparent = false,
    weeks = 26, hide = [], tiles: tileKeys = DEFAULT_TILES,
  } = opts;
  const c = THEMES[theme] || THEMES.dark;
  const t = I18N[lang] || I18N.en;
  const show = (s) => !hide.includes(s);
  const cells = [c.empty, ...(PALETTES[palette] || PALETTES.blue)[theme === 'light' ? 'light' : 'dark']];
  const acc = parseColor(accent) || DEFAULT_ACCENT;
  const num = (n) => n.toLocaleString(t.locale);
  const pct = (x) => (x > 0 && x < 0.001 ? '<0.1%' : `${x >= 0.995 ? 100 : x >= 0.1 ? Math.round(x * 100) : +(x * 100).toFixed(1)}%`);
  const W = 520, pad = 16, inner = W - pad * 2;
  const out = [];
  const text = (x, y, s, { size = 11, fill = c.muted, weight, anchor } = {}) =>
    out.push(`<text x="${+x.toFixed(1)}" y="${+y.toFixed(1)}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''} fill="${fill}">${esc(s)}</text>`);
  const rect = (x, y, w, h, fill, rx = 0) =>
    out.push(`<rect x="${+x.toFixed(1)}" y="${+y.toFixed(1)}" width="${+w.toFixed(1)}" height="${+h.toFixed(1)}"${rx ? ` rx="${rx}"` : ''} fill="${fill}"/>`);

  // Blocks are laid out top to bottom; `y` is the bottom of what's drawn so far.
  let y = pad;
  let first = true;
  const gapBefore = (n) => { if (!first) y += n; first = false; };

  // Section title with a note on the right and a thin rule above it.
  const section = (title, note) => {
    gapBefore(14);
    if (y > pad) rect(pad, y, inner, 1, c.rule);
    y += 20;
    text(pad, y, title, { size: 12, fill: c.value, weight: 600 });
    if (note) text(W - pad, y, note, { anchor: 'end' });
  };

  // Horizontal stacked bar + legend underneath. Tiny parts keep a 3px sliver
  // so they stay visible; the legend carries the exact numbers.
  const stacked = (parts) => {
    const by = y + 12;
    const total = parts.reduce((s, p) => s + p.value, 0) || 1;
    const vis = parts.filter((p) => p.value > 0);
    const widths = vis.map((p) => Math.max(3, (p.value / total) * inner));
    const scale = inner / widths.reduce((a, b) => a + b, 0);
    out.push(`<clipPath id="bar${by}"><rect x="${pad}" y="${by}" width="${inner}" height="8" rx="4"/></clipPath><g clip-path="url(#bar${by})">`);
    let x = pad;
    vis.forEach((p, i) => { rect(x, by, widths[i] * scale, 8, p.color); x += widths[i] * scale; });
    out.push('</g>');
    // Legend in equal columns; the value is a tspan so it sits right after
    // the label whatever the font's real widths are.
    const col = inner / parts.length;
    const ly = by + 24;
    parts.forEach((p, i) => {
      const lx = pad + i * col;
      out.push(`<circle cx="${+(lx + 4).toFixed(1)}" cy="${ly - 4}" r="4" fill="${p.color}"/>`);
      out.push(`<text x="${+(lx + 12).toFixed(1)}" y="${ly}" font-size="11" fill="${c.muted}">${esc(p.label)} <tspan font-weight="600" fill="${c.value}">${esc(p.note)}</tspan></text>`);
    });
    y = ly + 2;
  };

  // ---- Header ----
  if (show('header')) {
    gapBefore(0);
    rect(pad, y, 32, 32, acc, 8);
    out.push(`<text x="${pad + 16}" y="${y + 21}" text-anchor="middle" font-size="14" font-weight="700" font-family="Consolas,Menlo,monospace" fill="${textOn(acc)}">&gt;_</text>`);
    text(pad + 44, y + 14, title || t.title, { size: 16, fill: c.title, weight: 600 });
    const date = now.toLocaleDateString(t.locale, { month: 'short', day: 'numeric', year: 'numeric' });
    text(pad + 44, y + 30, [name && `@${name}`, t.range[stats.range] || t.range.all, t.updated(date)].filter(Boolean).join(' · '), { size: 11.5 });
    y += 32;
  }

  // ---- Stat tiles ----
  const tileValue = {
    sessions: () => num(stats.sessions),
    prompts: () => num(stats.prompts),
    activeDays: () => num(stats.activeDays),
    streak: () => t.days(stats.longestStreak),
    generated: () => compact(stats.tokens.output),
    toolCalls: () => num(stats.toolCalls),
    peakHour: () => (stats.peakHour == null ? '—' : t.hour(stats.peakHour)),
    favorite: () => prettyModel(stats.favoriteModel),
    responses: () => num(stats.responses),
    processed: () => compact(stats.tokensTotal),
  };
  const keys = tileKeys.filter((k) => tileValue[k]);
  if (show('tiles') && keys.length) {
    gapBefore(16);
    const gap = 6, cols = Math.min(4, keys.length), tw = (inner - gap * (cols - 1)) / cols, th = 46;
    keys.forEach((k, i) => {
      const x = pad + (i % cols) * (tw + gap);
      const ty = y + Math.floor(i / cols) * (th + gap);
      rect(x, ty, tw, th, c.tile, 6);
      text(x + 9, ty + 18, t[k], { size: 11, fill: c.label });
      text(x + 9, ty + 37, tileValue[k](), { size: 15, fill: c.value, weight: 600 });
    });
    y += Math.ceil(keys.length / cols) * (th + gap) - gap;
  }

  // ---- Heatmap: columns = weeks (oldest → current), rows = Sunday → Saturday ----
  if (show('heatmap')) {
    const wasFirst = first;
    gapBefore(22);
    const my = y + (wasFirst ? 10 : 0);
    const hy = my + 6;
    const cgap = weeks > 40 ? 2 : 3;
    const step = (inner + cgap) / weeks, cell = step - cgap;
    const level = levels(counts);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - (weeks - 1) * 7);
    // Month labels where each month starts; one with no room before the next is dropped.
    const monthCols = [];
    for (let w = 0; w < weeks; w++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7);
      if (!monthCols.length || d.getMonth() !== monthCols.at(-1).date.getMonth()) monthCols.push({ w, date: d });
    }
    const minCols = Math.ceil(28 / step);
    monthCols.forEach(({ w, date }, i) => {
      if ((monthCols[i + 1]?.w ?? weeks + minCols) - w < minCols) return;
      text(pad + w * step, my, date.toLocaleDateString(t.locale, { month: 'short' }).replace('.', ''), { size: 10.5 });
    });
    const rx = cell > 10 ? 3 : 2;
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        if (day > today) continue;
        rect(pad + w * step, hy + d * step, cell, cell, cells[level(counts.get(dayKey(day)) || 0)], rx);
      }
    }
    y = hy + 7 * step - cgap;
  }

  // Book comparison (left) and heatmap legend (right) share one line.
  const book = pickBook(stats.tokens.output);
  const showBook = show('book') && book.ratio >= 0.1;
  if (showBook || show('heatmap')) {
    gapBefore(16);
    const fy = y + 1;
    if (showBook) {
      const n = book.ratio >= 10 ? num(Math.round(book.ratio)) : book.ratio.toLocaleString(t.locale, { maximumFractionDigits: 1 });
      text(pad, fy, t.book(n, book[lang] || book.en));
    }
    if (show('heatmap')) {
      let lx = W - pad;
      text(lx, fy, t.more, { anchor: 'end' });
      lx -= textW(t.more, 11) + 5;
      for (let i = 4; i >= 0; i--) { lx -= 10; rect(lx, fy - 9, 10, 10, cells[i], 2); lx -= 3; }
      text(lx - 3, fy, t.less, { anchor: 'end' });
    }
    y = fy + 3;
  }

  // ---- Tokens ----
  if (show('tokens')) {
    const tk = stats.tokens;
    section(t.tokens, t.processedTotal(compact(stats.tokensTotal)));
    stacked([
      { label: t.tokGenerated, value: tk.output, note: compact(tk.output), color: acc },
      { label: t.tokAdded, value: tk.input + tk.cacheWrite, note: compact(tk.input + tk.cacheWrite), color: c.tok[0] },
      { label: t.tokReread, value: tk.cacheRead, note: compact(tk.cacheRead), color: c.tok[1] },
    ]);
  }

  // ---- Models ----
  if (show('models') && stats.models.length) {
    section(t.models, t.byOutput);
    const colors = [acc, ...c.series];
    const total = stats.models.reduce((s, m) => s + m.output, 0) || 1;
    const rest = stats.models.slice(3).reduce((s, m) => s + m.output, 0);
    const parts = stats.models.slice(0, 3).map((m, i) => ({ label: prettyModel(m.model), value: m.output, note: pct(m.output / total), color: colors[i] }));
    if (rest > 0) parts.push({ label: t.other, value: rest, note: pct(rest / total), color: colors[3] });
    stacked(parts);
  }

  // ---- Top tools, as chips ----
  if (show('tools') && stats.topTools.length) {
    section(t.tools, `${num(stats.toolCalls)} ${t.toolCalls.toLowerCase()}`);
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

  const H = Math.round(y + pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<title>${esc([name, title || t.title].filter(Boolean).join(' — '))}</title>
${transparent ? '' : `<rect width="${W}" height="${H}" rx="12" fill="${c.bg}"/>`}
${out.join('\n')}
</svg>
`;
}
