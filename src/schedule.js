// Automatic refresh. The OS job wakes up every hour and runs `push --every X`;
// push itself skips the upload until X has elapsed since the last success.
// So a refresh missed while the computer was off happens within an hour of
// it coming back, whatever the chosen frequency.
// Windows: Task Scheduler (XML definition). macOS/Linux: a tagged crontab line.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TASK = 'ClaudeUsageChart';
const TAG = '# claude-usage-chart';
const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const STATE = path.join(os.homedir(), '.claude-usage-chart.json');

export const FREQUENCIES = {
  '1h': { ms: 3600e3, label: 'every hour' },
  '6h': { ms: 6 * 3600e3, label: 'every 6 hours' },
  '12h': { ms: 12 * 3600e3, label: 'every 12 hours' },
  '1d': { ms: 86400e3, label: 'once a day' },
  '7d': { ms: 7 * 86400e3, label: 'once a week' },
};

const run = (cmd, args, input) =>
  execFileSync(cmd, args, { encoding: 'utf8', input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });

// ---- last-run bookkeeping -------------------------------------------------

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}

// True when a push for this repo is due for the given frequency.
export function isDue(repo, every) {
  const f = FREQUENCIES[every];
  if (!f) return true;
  const last = readState()[repo];
  // 5 min of slack so an hourly job doesn't skip because it fired a bit early
  return !last || Date.now() - last >= f.ms - 5 * 60e3;
}

export function markPushed(repo) {
  const s = readState();
  s[repo] = Date.now();
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

// ---- OS scheduler ---------------------------------------------------------

// Latest release tarball; the package is distributed through GitHub releases.
export const RELEASE_TGZ = 'https://github.com/Clovis500c/ClaudeUsageChart/releases/latest/download/claude-usage-chart.tgz';

// When launched through npx the script lives in a cache that can be wiped,
// so the job calls npx again (on the latest release) instead of that path.
export function argv(args, cli = CLI) {
  const viaNpx = /[\\/]_npx[\\/]/.test(cli);
  if (!viaNpx) return [process.execPath, cli, ...args];
  return [...(process.platform === 'win32' ? ['cmd', '/c'] : []), 'npx', '-y', `--package=${RELEASE_TGZ}`, 'claude-usage-chart', ...args];
}

// Windows command line: wrap in double quotes, doubling any inner quote.
const winQuote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
// POSIX shell inside a crontab: single quotes stop $, ` and \ from expanding,
// and % must be escaped because cron turns a bare % into a newline.
export const cronQuote = (a) =>
  (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`).replace(/%/g, '\\%');
const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function localIso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

export function taskXml(args) {
  const [cmd, ...rest] = argv(args);
  const start = new Date(Date.now() + 60e3);
  // conhost --headless keeps a console window from flashing up every hour
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Refreshes the ClaudeUsageChart card on GitHub</Description></RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <StartBoundary>${localIso(start)}</StartBoundary>
      <Repetition><Interval>PT1H</Interval></Repetition>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>conhost.exe</Command>
      <Arguments>${xmlEsc(['--headless', cmd, ...rest].map(winQuote).join(' '))}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
  return xml;
}

function windowsTask(args) {
  const xml = taskXml(args);
  const file = path.join(os.tmpdir(), `${TASK}.xml`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]));
  try {
    run('schtasks', ['/Create', '/F', '/TN', TASK, '/XML', file]);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function readCrontab() {
  try { return run('crontab', ['-l']); } catch { return ''; }
}

export function schedule(args, every) {
  if (!FREQUENCIES[every]) throw new Error(`Unknown frequency "${every}". Use one of: ${Object.keys(FREQUENCIES).join(', ')}`);
  const jobArgs = [...args, '--every', every];
  if (process.platform === 'win32') {
    windowsTask(jobArgs);
    return `Windows task "${TASK}", ${FREQUENCIES[every].label}`;
  }
  const lines = readCrontab().split('\n').filter((l) => l && !l.includes(TAG));
  lines.push(`0 * * * * ${argv(jobArgs).map(cronQuote).join(' ')} >/dev/null 2>&1 ${TAG}`);
  run('crontab', ['-'], lines.join('\n') + '\n');
  return `crontab entry, ${FREQUENCIES[every].label}`;
}

export function unschedule() {
  if (process.platform === 'win32') {
    try { run('schtasks', ['/Delete', '/F', '/TN', TASK]); return true; } catch { return false; }
  }
  const before = readCrontab();
  const after = before.split('\n').filter((l) => !l.includes(TAG)).join('\n');
  if (after === before) return false;
  run('crontab', ['-'], after.trim() ? after.trimEnd() + '\n' : '');
  return true;
}
