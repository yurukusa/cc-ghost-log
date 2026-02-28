#!/usr/bin/env node

// cc-ghost-log — What your AI did while you were gone.
// Shows git commits from Ghost Days: days AI ran but you didn't touch Claude Code.
// Zero dependencies. Reads ~/.claude/projects/ + local git history.

import { readdir, stat, open } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', yellow: '\x1b[33m', magenta: '\x1b[35m',
  green: '\x1b[32m',
};

// ── Session scanning ──────────────────────────────────────────────────────────

async function readFirstLastLine(filePath) {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fh.read(buf, 0, 8192, 0);
    if (bytesRead === 0) return null;
    const chunk = buf.toString('utf8', 0, bytesRead);
    const nl = chunk.indexOf('\n');
    const firstLine = nl >= 0 ? chunk.substring(0, nl) : chunk;
    const fileStat = await fh.stat();
    const fileSize = fileStat.size;
    if (fileSize < 2) return { firstLine, lastLine: firstLine };
    const readSize = Math.min(65536, fileSize);
    const tailBuf = Buffer.alloc(readSize);
    const { bytesRead: tailBytes } = await fh.read(tailBuf, 0, readSize, fileSize - readSize);
    const lines = tailBuf.toString('utf8', 0, tailBytes).split('\n').filter(l => l.trim());
    return { firstLine, lastLine: lines[lines.length - 1] || firstLine };
  } finally {
    await fh.close();
  }
}

function parseTimestamp(jsonLine) {
  try {
    const data = JSON.parse(jsonLine);
    const ts = data.timestamp || data.ts;
    if (ts) return new Date(ts);
  } catch {}
  return null;
}

async function addSession(filePath, bucket) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || fileStat.size < 50) return;
  try {
    const result = await readFirstLastLine(filePath);
    if (!result) return;
    const start = parseTimestamp(result.firstLine);
    const end = parseTimestamp(result.lastLine);
    if (start && end) {
      const durationMs = end - start;
      if (durationMs >= 0 && durationMs < 7 * 24 * 60 * 60 * 1000) {
        const day = start.toLocaleDateString('en-CA');
        if (!bucket.byDate[day]) bucket.byDate[day] = 0;
        bucket.byDate[day] += durationMs / (1000 * 60 * 60);
      }
    }
  } catch {}
}

async function scanSessions() {
  const projectsDir = join(homedir(), '.claude', 'projects');
  const main = { byDate: {} };
  const sub = { byDate: {} };
  let dirs;
  try { dirs = await readdir(projectsDir); } catch { return { main, sub }; }

  for (const projDir of dirs) {
    const projPath = join(projectsDir, projDir);
    const s = await stat(projPath).catch(() => null);
    if (!s?.isDirectory()) continue;
    const files = await readdir(projPath).catch(() => []);
    for (const f of files) {
      if (f.endsWith('.jsonl')) await addSession(join(projPath, f), main);
    }
    for (const f of files) {
      const subPath = join(projPath, f, 'subagents');
      const ss = await stat(subPath).catch(() => null);
      if (!ss?.isDirectory()) continue;
      const subs = await readdir(subPath).catch(() => []);
      for (const sf of subs) {
        if (sf.endsWith('.jsonl')) await addSession(join(subPath, sf), sub);
      }
    }
  }
  return { main, sub };
}

// ── Path decoding ─────────────────────────────────────────────────────────────

function resolveProjectPath(dirName) {
  // -home-namakusa-projects-cc-loop → /home/namakusa/projects/cc-loop
  // Tries all dash→slash splits, returns longest existing directory path
  if (!dirName.startsWith('-')) return null;
  const parts = dirName.slice(1).split('-');
  for (let i = parts.length; i > 0; i--) {
    const candidate = '/' + parts.slice(0, i).join('/') +
      (i < parts.length ? '-' + parts.slice(i).join('-') : '');
    try {
      if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    } catch {}
  }
  return null;
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function isGitRepo(path) {
  try {
    execSync(`git -C "${path}" rev-parse --show-toplevel`, { stdio: 'pipe', timeout: 2000 });
    return true;
  } catch { return false; }
}

function getGitCommits(repoPath, dateStr) {
  try {
    const out = execSync(
      `git -C "${repoPath}" log --after="${dateStr} 00:00:00" --before="${dateStr} 23:59:59" --format="%h|%s|%ai" 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return out.trim().split('\n').filter(l => l.trim()).map(line => {
      const [hash, ...rest] = line.split('|');
      const time = rest.pop() || '';
      const subject = rest.join('|');
      return {
        hash: hash?.trim(),
        subject: subject?.trim(),
        time: time?.trim().slice(11, 16),
      };
    });
  } catch { return []; }
}

async function getGitRepoPaths() {
  const projectsDir = join(homedir(), '.claude', 'projects');
  let dirs;
  try { dirs = await readdir(projectsDir); } catch { return []; }
  const seen = new Set();
  const repos = [];
  for (const dir of dirs) {
    const resolved = resolveProjectPath(dir);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    if (isGitRepo(resolved)) {
      repos.push({ name: resolved.replace(homedir(), '~'), path: resolved });
    }
  }
  return repos;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const jsonMode = process.argv.includes('--json');
const limitDays = parseInt(
  process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '10'
);

if (!jsonMode) process.stdout.write(`  ${C.dim}Scanning...${C.reset}\r`);

const [{ main, sub }, repos] = await Promise.all([scanSessions(), getGitRepoPaths()]);

// Ghost Days: dates where main === 0 and sub > 0
const allDates = new Set([...Object.keys(main.byDate), ...Object.keys(sub.byDate)]);
const ghostDays = [];
for (const date of allDates) {
  const mainH = main.byDate[date] || 0;
  const subH = sub.byDate[date] || 0;
  if (mainH === 0 && subH > 0) ghostDays.push({ date, hours: subH });
}
ghostDays.sort((a, b) => b.date.localeCompare(a.date)); // most recent first
const shown = ghostDays.slice(0, limitDays);
const totalGhostH = ghostDays.reduce((s, d) => s + d.hours, 0);

if (shown.length === 0) {
  process.stdout.write('\r' + ' '.repeat(40) + '\r');
  console.log(`\n  ${C.bold}${C.cyan}cc-ghost-log${C.reset}`);
  console.log(`  ${C.dim}No Ghost Days found yet.${C.reset}\n`);
  process.exit(0);
}

// Collect commits
const results = [];
for (const ghost of shown) {
  const repoEntries = [];
  for (const { name, path } of repos) {
    const commits = getGitCommits(path, ghost.date);
    if (commits.length > 0) repoEntries.push({ repo: name, commits });
  }
  results.push({ ...ghost, repos: repoEntries });
}

if (jsonMode) {
  console.log(JSON.stringify({
    version: '1.0',
    ghostDaysTotal: ghostDays.length,
    ghostHoursTotal: Math.round(totalGhostH * 10) / 10,
    shown: results,
  }, null, 2));
  process.exit(0);
}

// ── Display ───────────────────────────────────────────────────────────────────
process.stdout.write('\r' + ' '.repeat(40) + '\r');
console.log();
console.log(`  ${C.bold}${C.cyan}cc-ghost-log${C.reset}  ${C.dim}What your AI did while you were gone${C.reset}`);
console.log(`  ${'═'.repeat(52)}`);
console.log();
console.log(`  ${C.yellow}${ghostDays.length} Ghost Days${C.reset}  ${C.dim}· ${totalGhostH.toFixed(1)}h total · showing ${shown.length}${C.reset}`);
console.log();

for (const day of results) {
  const dt = new Date(day.date + 'T12:00:00');
  const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  console.log(`  ${C.bold}${C.magenta}▸ ${day.date}${C.reset}  ${C.dim}${label}${C.reset}  ${C.yellow}AI: ${day.hours.toFixed(1)}h${C.reset}  ${C.dim}You: 0h${C.reset}`);
  if (day.repos.length === 0) {
    console.log(`  ${C.dim}  no git commits found${C.reset}`);
  } else {
    for (const { repo, commits } of day.repos) {
      console.log(`  ${C.dim}  ${repo}${C.reset}`);
      for (const c of commits.slice(0, 5)) {
        const subj = c.subject.length > 60 ? c.subject.slice(0, 57) + '...' : c.subject;
        console.log(`  ${C.green}    ${c.hash}${C.reset}  ${C.dim}${c.time}${C.reset}  ${subj}`);
      }
      if (commits.length > 5) console.log(`  ${C.dim}    +${commits.length - 5} more${C.reset}`);
    }
  }
  console.log();
}

console.log(`  ${C.dim}── npx cc-ghost-log · #ClaudeCode #AIAutonomy ──${C.reset}`);
console.log();
