// Reads Claude Code transcripts (~/.claude/projects/**/*.jsonl) and aggregates
// the same numbers the Claude desktop client shows on its stats card.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function listTranscripts(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Loads every user/assistant event once; ranges are filtered afterwards.
export function loadEvents(dir = path.join(claudeDir(), 'projects')) {
  const events = [];
  for (const file of listTranscripts(dir)) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (o.type !== 'user' && o.type !== 'assistant') continue;
      if (!o.timestamp) continue;
      const u = o.message?.usage;
      events.push({
        ts: new Date(o.timestamp),
        session: o.sessionId,
        sidechain: !!o.isSidechain,
        model: o.type === 'assistant' ? o.message?.model : undefined,
        // The client sums input + output over every transcript line.
        tokens: u ? (u.input_tokens || 0) + (u.output_tokens || 0) : 0,
      });
    }
  }
  return events;
}

const RANGES = { all: Infinity, '30d': 30, '7d': 7 };

export function aggregate(events, range = 'all') {
  const days = RANGES[range] ?? Infinity;
  const since = days === Infinity ? 0 : Date.now() - days * 86400000;
  const inRange = events.filter((e) => e.ts.getTime() >= since);

  const sessionStart = new Map();
  const models = new Map();
  const activeDays = new Set();
  let messages = 0;
  let tokens = 0;

  for (const e of inRange) {
    tokens += e.tokens;
    if (e.sidechain) continue; // subagent traffic is not counted as messages
    messages++;
    activeDays.add(dayKey(e.ts));
    if (e.session) {
      const prev = sessionStart.get(e.session);
      if (!prev || e.ts < prev) sessionStart.set(e.session, e.ts);
    }
    if (e.model && !e.model.startsWith('<')) models.set(e.model, (models.get(e.model) || 0) + 1);
  }

  // Peak hour = the hour at which sessions most often start.
  const hours = new Array(24).fill(0);
  for (const ts of sessionStart.values()) hours[ts.getHours()]++;
  const peakHour = sessionStart.size ? hours.indexOf(Math.max(...hours)) : null;

  const favorite = [...models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    range,
    sessions: sessionStart.size,
    messages,
    tokens,
    activeDays: activeDays.size,
    peakHour,
    favoriteModel: favorite,
  };
}

// Messages per local day, for the heatmap (always the full history).
export function dailyCounts(events) {
  const map = new Map();
  for (const e of events) {
    if (e.sidechain) continue;
    const k = dayKey(e.ts);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

export { dayKey };
