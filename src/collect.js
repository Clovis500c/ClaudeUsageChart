// Reads Claude Code transcripts (~/.claude/projects/**/*.jsonl) and computes
// usage stats. Transcripts need de-duplication to give honest numbers:
//  - one API response is written as several lines (one per content block),
//    each repeating the same usage → count each response id once;
//  - resumed/forked sessions copy earlier lines into a new file → count each
//    line uuid once;
//  - most "user" lines are tool results or system notices, not prompts.
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

// Text Claude Code injects as a "user" turn although nobody typed it.
const SYNTHETIC = /^(\[Request interrupted|This session is being continued|Caveat:|<(command-|local-command|task-notification|bash-))/;

function promptText(o) {
  const c = o.message?.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c) || c.some((b) => b.type === 'tool_result')) return null;
  return c.find((b) => b.type === 'text')?.text ?? '';
}

// Returns { prompts: [{ts, session}], responses: [{ts, session, model, usage}] }
export function loadEvents(dir = path.join(claudeDir(), 'projects')) {
  const prompts = new Map(); // uuid → prompt
  const responses = new Map(); // message id → response
  for (const file of listTranscripts(dir)) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (!o.timestamp || o.isSidechain) continue; // subagent traffic is not the user's
      const ts = new Date(o.timestamp);

      if (o.type === 'user' && !o.isMeta && o.uuid && !prompts.has(o.uuid)) {
        const t = promptText(o);
        if (t != null && !SYNTHETIC.test(t.trimStart())) prompts.set(o.uuid, { ts, session: o.sessionId });
      } else if (o.type === 'assistant' && o.message?.id && o.message.usage) {
        const u = o.message.usage;
        const prev = responses.get(o.message.id);
        // Streaming lines can carry partial counts; keep the largest of each.
        const pick = (k) => Math.max(prev?.usage[k] || 0, u[k] || 0);
        responses.set(o.message.id, {
          ts: prev?.ts ?? ts,
          session: o.sessionId,
          model: o.message.model,
          usage: {
            input_tokens: pick('input_tokens'),
            output_tokens: pick('output_tokens'),
            cache_creation_input_tokens: pick('cache_creation_input_tokens'),
            cache_read_input_tokens: pick('cache_read_input_tokens'),
          },
        });
      }
    }
  }
  return { prompts: [...prompts.values()], responses: [...responses.values()] };
}

const RANGES = { all: Infinity, '30d': 30, '7d': 7 };

export function aggregate({ prompts, responses }, range = 'all') {
  const days = RANGES[range] ?? Infinity;
  const since = days === Infinity ? 0 : Date.now() - days * 86400000;
  const P = prompts.filter((e) => e.ts.getTime() >= since);
  const R = responses.filter((e) => e.ts.getTime() >= since);

  const sessions = new Set();
  const activeDays = new Set();
  const hours = new Array(24).fill(0);
  for (const e of P) {
    sessions.add(e.session);
    activeDays.add(dayKey(e.ts));
    hours[e.ts.getHours()]++;
  }

  const tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  const models = new Map();
  for (const e of R) {
    const u = e.usage;
    tokens.input += u.input_tokens;
    tokens.output += u.output_tokens;
    tokens.cacheWrite += u.cache_creation_input_tokens;
    tokens.cacheRead += u.cache_read_input_tokens;
    sessions.add(e.session);
    activeDays.add(dayKey(e.ts));
    if (e.model && !e.model.startsWith('<')) models.set(e.model, (models.get(e.model) || 0) + u.output_tokens);
  }

  return {
    range,
    sessions: sessions.size,
    prompts: P.length,
    responses: R.length,
    tokens,
    tokensTotal: tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead,
    activeDays: activeDays.size,
    peakHour: P.length ? hours.indexOf(Math.max(...hours)) : null, // hour with the most prompts
    favoriteModel: [...models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, // most output
  };
}

// Prompts per local day, for the heatmap (always the full history).
export function dailyCounts({ prompts }) {
  const map = new Map();
  for (const e of prompts) {
    const k = dayKey(e.ts);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

export { dayKey };
