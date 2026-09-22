// Registers an hourly job that re-runs the push, so the README stays fresh.
// Windows: Task Scheduler. macOS/Linux: a tagged line in the user's crontab.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TASK = 'ClaudeUsageChart';
const TAG = '# claude-usage-chart';
const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

const run = (cmd, args, input) =>
  execFileSync(cmd, args, { encoding: 'utf8', input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });

function readCrontab() {
  try { return run('crontab', ['-l']); } catch { return ''; }
}

// When launched through npx the script lives in a cache that can be wiped,
// so the job calls npx again instead of that path.
function command(args) {
  const viaNpx = /[\\/]_npx[\\/]/.test(CLI);
  const win = process.platform === 'win32';
  const argv = viaNpx
    ? [...(win ? ['cmd', '/c'] : []), 'npx', '-y', 'claude-usage-chart@latest', ...args]
    : [process.execPath, CLI, ...args];
  return argv.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(' ');
}

export function schedule(args) {
  const quoted = command(args);
  if (process.platform === 'win32') {
    // conhost --headless keeps a console window from popping up every hour
    const tr = `conhost.exe --headless ${quoted}`;
    if (tr.length > 261) throw new Error('Command too long for Task Scheduler; install globally: npm i -g claude-usage-chart');
    run('schtasks', ['/Create', '/F', '/SC', 'HOURLY', '/TN', TASK, '/TR', tr]);
    return `Windows task "${TASK}" (hourly)`;
  }
  const lines = readCrontab().split('\n').filter((l) => l && !l.includes(TAG));
  lines.push(`0 * * * * ${quoted} >/dev/null 2>&1 ${TAG}`);
  run('crontab', ['-'], lines.join('\n') + '\n');
  return 'crontab entry (hourly)';
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
