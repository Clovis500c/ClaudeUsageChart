// Uploads files to a GitHub repo through the REST contents API.
// Auth: $GITHUB_TOKEN, else the token of the GitHub CLI (`gh auth token`).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error('No GitHub token. Run `gh auth login` or set GITHUB_TOKEN.');
  }
}

async function api(token, method, url, body) {
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'claude-usage-chart',
    },
    body: body && JSON.stringify(body),
  });
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) throw new Error(`GitHub ${method} ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

export async function currentUser(token) {
  return (await api(token, 'GET', '/user')).login;
}

const blobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

// Returns true when the file changed and a commit was made.
export async function putFile(token, repo, filePath, content, { branch, message } = {}) {
  const buf = Buffer.from(content);
  const q = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  const existing = await api(token, 'GET', `/repos/${repo}/contents/${filePath}${q}`);
  if (existing && existing.sha === blobSha(buf)) return false;
  await api(token, 'PUT', `/repos/${repo}/contents/${filePath}`, {
    message: message || `chore: update ${filePath}`,
    content: buf.toString('base64'),
    sha: existing?.sha,
    branch,
  });
  return true;
}
