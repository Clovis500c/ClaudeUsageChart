#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { loadEvents, aggregate, dailyCounts } from '../src/collect.js';
import { renderCard } from '../src/render.js';
import { getToken, currentUser, putFile } from '../src/github.js';
import { schedule, unschedule } from '../src/schedule.js';

const HELP = `claude-usage-chart — your Claude Code stats card, for your GitHub README

Usage
  claude-usage-chart setup              guided setup: push to your profile repo + hourly refresh
  claude-usage-chart [generate]         write the SVGs locally
  claude-usage-chart push --repo u/r    write the SVGs and upload them to a repo
  claude-usage-chart unschedule         remove the hourly refresh

Options
  --theme dark|light|auto  card theme (default: dark; auto follows the visitor's GitHub theme)
  --lang en|fr        card language (default: en)
  --range all|30d|7d  period for the numbers (default: all)
  --name <user>       name shown on the card (default for push: repo owner)
  --out <dir>         local output folder for generate (default: .)
  --repo <owner/name> target repo for push (default: <you>/<you>)
  --dir <path>        folder inside the repo (default: claude-stats)
  --branch <name>     target branch (default: repo default)
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
    help: { type: 'boolean', short: 'h' },
  },
});

function build() {
  const events = loadEvents();
  if (!events.length) throw new Error('No Claude Code transcripts found in ~/.claude/projects.');
  const stats = aggregate(events, opt.range);
  const counts = dailyCounts(events);
  const card = (theme) => renderCard(stats, counts, { lang: opt.lang, theme, name: opt.name });
  // auto = dark + light files, picked by the visitor's theme in the README
  const files = opt.theme === 'auto'
    ? { 'claude-stats.svg': card('dark'), 'claude-stats-light.svg': card('light') }
    : { 'claude-stats.svg': card(opt.theme === 'light' ? 'light' : 'dark') };
  return { stats, files };
}

function snippet(repo, dir, branch = 'HEAD') {
  const base = `https://raw.githubusercontent.com/${repo}/${branch}/${dir}`;
  if (opt.theme !== 'auto') return `<img alt="Claude stats" src="${base}/claude-stats.svg" />`;
  return `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${base}/claude-stats.svg" />
  <source media="(prefers-color-scheme: light)" srcset="${base}/claude-stats-light.svg" />
  <img alt="Claude stats" src="${base}/claude-stats.svg" />
</picture>`;
}

async function push(repo) {
  const token = getToken();
  if (!repo) { const login = await currentUser(token); repo = `${login}/${login}`; }
  opt.name ??= repo.split('/')[0];
  const { stats, files } = build();
  let changed = 0;
  for (const [name, svg] of Object.entries(files)) {
    const p = path.posix.join(opt.dir, name);
    if (await putFile(token, repo, p, svg, { branch: opt.branch, message: `chore(claude-stats): update ${name}` })) changed++;
  }
  console.log(changed ? `✔ Updated ${changed} file(s) in ${repo}` : `✔ ${repo} already up to date`);
  return { repo, stats };
}

async function setup() {
  const token = getToken();
  const login = await currentUser(token);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, d) => (await rl.question(`${q} (${d}) `)).trim() || d;
  const repo = await ask('Repo to publish to?', `${login}/${login}`);
  opt.lang = await ask('Language en/fr?', opt.lang);
  opt.theme = await ask('Theme dark/light/auto?', opt.theme);
  const auto = (await ask('Refresh automatically every hour? y/n', 'y')).toLowerCase().startsWith('y');
  rl.close();

  await push(repo);
  if (auto) {
    const args = ['push', '--repo', repo, '--theme', opt.theme, '--lang', opt.lang, '--range', opt.range, '--dir', opt.dir];
    if (opt.branch) args.push('--branch', opt.branch);
    console.log(`✔ Scheduled: ${schedule(args)}`);
  }
  console.log(`\nAdd this to your README.md:\n\n${snippet(repo, opt.dir, opt.branch)}\n`);
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
    case 'push': await push(opt.repo); break;
    case 'setup': await setup(); break;
    case 'unschedule': console.log(unschedule() ? '✔ Hourly refresh removed' : 'Nothing was scheduled'); break;
    default: console.log(HELP); process.exitCode = 1;
  }
}

main().catch((e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
