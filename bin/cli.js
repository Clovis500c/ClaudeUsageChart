#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { loadEvents, aggregate, dailyCounts } from '../src/collect.js';
import { renderCard, PALETTES, SECTIONS, TILES, DEFAULT_TILES, parseColor } from '../src/render.js';
import { getToken, currentUser, putFile } from '../src/github.js';
import { schedule, unschedule, isDue, markPushed, FREQUENCIES } from '../src/schedule.js';

const HELP = `claude-usage-chart — your Claude Code usage card, for your GitHub README

Usage
  claude-usage-chart setup               guided setup: publish to your profile + automatic refresh
  claude-usage-chart [generate]          write the SVG(s) locally
  claude-usage-chart push                render and upload to GitHub
  claude-usage-chart schedule --every X  refresh automatically (1h, 6h, 12h, 1d, 7d)
  claude-usage-chart unschedule          stop the automatic refresh

Options
  --repo <owner/name>      target repo (default: <you>/<you>, your profile repo)
  --theme dark|light|auto  card theme (default: dark; auto follows the visitor's GitHub theme)
  --lang en|fr             card language (default: en)
  --range all|30d|7d       period for the numbers (default: all)
  --name <user>            name shown on the card (default: repo owner)

Look
  --title <text>           card title (default: "Claude Code usage")
  --palette <name>         heatmap colors: ${Object.keys(PALETTES).join(', ')} (default: blue)
  --accent <hex>           accent color for the badge and bars (default: #d97757)
  --weeks <n>              weeks shown in the heatmap, 8-52 (default: 26)
  --tiles <list>           stat tiles to show, in order (default: ${DEFAULT_TILES.join(',')})
                           available: ${TILES.join(', ')}
  --hide <list>            sections to leave out: ${SECTIONS.join(', ')}
  --hide-tools             same as --hide tools
  --transparent            no card background
  --dir <path>             folder inside the repo (default: claude-stats)
  --branch <name>          target branch (default: repo default)
  --out <dir>              local output folder for generate (default: .)
  --every <freq>           with push: skip the upload if the last one is more recent than <freq>
`;

const { positionals, values: opt } = parseArgs({
  allowPositionals: true,
  options: {
    theme: { type: 'string', default: 'dark' },
    lang: { type: 'string', default: 'en' },
    range: { type: 'string', default: 'all' },
    name: { type: 'string' },
    out: { type: 'string', default: '.' },
    repo: { type: 'string' },
    dir: { type: 'string', default: 'claude-stats' },
    branch: { type: 'string' },
    every: { type: 'string' },
    'hide-tools': { type: 'boolean', default: false },
    title: { type: 'string' },
    palette: { type: 'string', default: 'blue' },
    accent: { type: 'string' },
    weeks: { type: 'string', default: '26' },
    tiles: { type: 'string' },
    hide: { type: 'string' },
    transparent: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

// Validates look options up front so a typo fails loudly instead of silently.
function lookOptions() {
  const oneOf = (name, allowed) => {
    if (!allowed.includes(opt[name])) throw new Error(`Invalid --${name} "${opt[name]}". Use one of: ${allowed.join(', ')}`);
  };
  oneOf('theme', ['dark', 'light', 'auto']);
  oneOf('lang', ['en', 'fr']);
  oneOf('range', ['all', '30d', '7d']);
  if (opt.repo && !/^[\w.-]+\/[\w.-]+$/.test(opt.repo)) throw new Error(`Invalid --repo "${opt.repo}". Use the form owner/name`);
  if (!PALETTES[opt.palette]) throw new Error(`Unknown palette "${opt.palette}". Use one of: ${Object.keys(PALETTES).join(', ')}`);
  if (opt.accent && !parseColor(opt.accent)) throw new Error(`Invalid --accent "${opt.accent}". Use a hex color like #d97757`);
  const weeks = Number(opt.weeks);
  if (!Number.isInteger(weeks) || weeks < 8 || weeks > 52) throw new Error('--weeks must be a whole number from 8 to 52');
  const hide = list(opt.hide);
  if (opt['hide-tools']) hide.push('tools');
  const badHide = hide.filter((h) => !SECTIONS.includes(h));
  if (badHide.length) throw new Error(`Unknown section(s) in --hide: ${badHide.join(', ')}. Available: ${SECTIONS.join(', ')}`);
  const tiles = opt.tiles ? list(opt.tiles) : DEFAULT_TILES;
  const badTiles = tiles.filter((k) => !TILES.includes(k));
  if (badTiles.length) throw new Error(`Unknown tile(s) in --tiles: ${badTiles.join(', ')}. Available: ${TILES.join(', ')}`);
  return { title: opt.title, palette: opt.palette, accent: opt.accent, weeks, hide, tiles, transparent: opt.transparent };
}

function build() {
  const look = lookOptions();
  const events = loadEvents();
  if (!events.prompts.length && !events.responses.length) throw new Error('No Claude Code transcripts found in ~/.claude/projects.');
  const stats = aggregate(events, opt.range);
  const counts = dailyCounts(events);
  const card = (theme) => renderCard(stats, counts, { ...look, lang: opt.lang, theme, name: opt.name });
  // auto = dark + light files, picked by the visitor's theme in the README
  const files = opt.theme === 'auto'
    ? { 'claude-stats.svg': card('dark'), 'claude-stats-light.svg': card('light') }
    : { 'claude-stats.svg': card(opt.theme === 'light' ? 'light' : 'dark') };
  return { stats, files };
}

function snippet(repo, dir, branch = 'HEAD') {
  const base = `https://raw.githubusercontent.com/${repo}/${branch}/${dir}`;
  if (opt.theme !== 'auto') return `<img alt="Claude Code usage" src="${base}/claude-stats.svg" />`;
  return `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${base}/claude-stats.svg" />
  <source media="(prefers-color-scheme: light)" srcset="${base}/claude-stats-light.svg" />
  <img alt="Claude Code usage" src="${base}/claude-stats.svg" />
</picture>`;
}

async function resolveRepo(token) {
  if (!opt.repo) {
    const login = await currentUser(token);
    opt.repo = `${login}/${login}`;
  }
  opt.name ??= opt.repo.split('/')[0];
  return opt.repo;
}

async function push() {
  // Scheduled runs pass --every; bail out before any work if it's not time yet.
  if (opt.repo && opt.every && !isDue(opt.repo, opt.every)) return console.log('Not due yet, skipping.');
  const token = getToken();
  const repo = await resolveRepo(token);
  const { files } = build();
  let changed = 0;
  for (const [name, svg] of Object.entries(files)) {
    const p = path.posix.join(opt.dir, name);
    if (await putFile(token, repo, p, svg, { branch: opt.branch, message: `chore(claude-stats): update ${name}` })) changed++;
  }
  markPushed(repo);
  console.log(changed ? `✔ Updated ${changed} file(s) in ${repo}` : `✔ ${repo} already up to date`);
}

// Arguments the scheduled job re-runs push with.
const jobArgs = () => {
  const a = ['push', '--repo', opt.repo, '--theme', opt.theme, '--lang', opt.lang, '--range', opt.range, '--dir', opt.dir, '--name', opt.name];
  // Forward every option the user set, so the scheduled card looks the same.
  for (const k of ['branch', 'title', 'palette', 'accent', 'weeks', 'tiles', 'hide']) if (opt[k] != null) a.push(`--${k}`, String(opt[k]));
  for (const k of ['hide-tools', 'transparent']) if (opt[k]) a.push(`--${k}`);
  return a;
};

const MENU = [
  ['1h', 'Every hour'],
  ['6h', 'Every 6 hours'],
  ['12h', 'Every 12 hours'],
  ['1d', 'Once a day (recommended)'],
  ['7d', 'Once a week'],
  ['off', 'Never, I\'ll run "claude-usage-chart push" myself'],
];

async function setup() {
  const token = getToken();
  const login = await currentUser(token);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, d) => (await rl.question(`${q} (${d}) `)).trim() || d;

  opt.repo = await ask('Repo to publish to?', opt.repo || `${login}/${login}`);
  opt.lang = await ask('Language en/fr?', opt.lang);
  opt.theme = await ask('Theme dark/light/auto?', opt.theme);
  if ((await ask('Customize colors and sections? y/n', 'n')).toLowerCase().startsWith('y')) {
    opt.palette = await ask(`Heatmap palette (${Object.keys(PALETTES).join('/')})?`, opt.palette);
    opt.accent = await ask('Accent color (hex)?', opt.accent || '#d97757');
    opt.title = await ask('Card title?', opt.title || 'Claude Code usage');
    const hide = await ask(`Sections to hide, comma-separated (${SECTIONS.join(', ')})?`, opt.hide || 'none');
    opt.hide = hide === 'none' ? undefined : hide;
  }
  lookOptions(); // fail before publishing if an answer is invalid

  let every = opt.every;
  if (!every) {
    console.log('\nHow often should the card update?');
    MENU.forEach(([, label], i) => console.log(`  ${i + 1}) ${label}`));
    for (;;) {
      const a = await ask('Choice', '4');
      every = MENU[Number(a) - 1]?.[0] ?? (FREQUENCIES[a] || a === 'off' ? a : null);
      if (every) break;
      console.log('  Please type a number from 1 to 6.');
    }
  }
  rl.close();

  opt.every = undefined; // the first push always happens
  await push();
  if (every === 'off') {
    unschedule();
    console.log('✔ No automatic refresh. Run "claude-usage-chart push" whenever you want to update the card.');
  } else {
    console.log(`✔ Scheduled: ${schedule(jobArgs(), every)}`);
    console.log('  If the computer is off at that time, it updates within an hour of being back on.');
  }
  console.log(`\nAdd this to your README.md:\n\n${snippet(opt.repo, opt.dir, opt.branch)}\n`);
}

async function main() {
  const cmd = positionals[0] || 'generate';
  if (opt.help || cmd === 'help') return console.log(HELP);
  switch (cmd) {
    case 'generate': {
      const { stats, files } = build();
      fs.mkdirSync(opt.out, { recursive: true });
      for (const [name, svg] of Object.entries(files)) fs.writeFileSync(path.join(opt.out, name), svg);
      console.log(`✔ Wrote ${Object.keys(files).join(', ')} to ${path.resolve(opt.out)}`);
      console.log(stats);
      break;
    }
    case 'push': await push(); break;
    case 'setup': await setup(); break;
    case 'schedule': {
      if (!opt.every) throw new Error(`--every is required: ${Object.keys(FREQUENCIES).join(', ')}`);
      await resolveRepo(getToken());
      console.log(`✔ Scheduled: ${schedule(jobArgs(), opt.every)}`);
      break;
    }
    case 'unschedule': console.log(unschedule() ? '✔ Automatic refresh stopped' : 'Nothing was scheduled'); break;
    default: console.log(HELP); process.exitCode = 1;
  }
}

main().catch((e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
