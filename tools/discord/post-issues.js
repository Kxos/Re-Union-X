#!/usr/bin/env node
// Posts the changes of docs/ISSUES.md (the issue table) to the Discord channel #github through a webhook.
// It compares the table at two commits and sends one block (embed) per issue that is new, changed status or was edited.
//   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token> node tools/discord/post-issues.js <before> <after>
//   node tools/discord/post-issues.js <before> <after> --dry-run      (prints the messages, no network)
// The webhook URL is a secret: it comes only from the environment (a GitHub Actions secret), never from the repo.
'use strict';
const { execFileSync } = require('child_process');

const FILE = 'docs/ISSUES.md';
const REPO = 'https://github.com/Re-Union-X/Re-Union-X';
const FIELDS_MAX = 20;
const TITLE_MAX = 140;
const COLORS = { new: 0x3fb950, status: 0xd29922, edit: 0x2aa7d6, removed: 0x8b949e };
const ICONS = { new: '🆕', status: '🔄', edit: '✏️', removed: '🗑️' };

function show(rev) {
  if (!rev || /^0+$/.test(rev)) return '';
  try { return execFileSync('git', ['show', `${rev}:${FILE}`], { encoding: 'utf8', maxBuffer: 64 << 20 }); }
  catch { return ''; }
}

// "| I-254 | OPEN | **Title** (details...) | [notes](...) | proof |" -> { id, status, title, text, line }
function parseIssues(md) {
  const out = new Map();
  md.replace(/\r/g, '').split('\n').forEach((row, i) => {
    const m = row.match(/^\|\s*(I-\d+)\s*\|\s*([^|]*?)\s*\|(.*)$/);
    if (!m) return;
    const rest = m[3];
    const t = rest.match(/\*\*(.+?)\*\*/);
    out.set(m[1], { id: m[1], status: plain(m[2]), title: t ? plain(t[1]) : '', text: rest.trim(), line: i + 1 });
  });
  return out;
}

function plain(s) {
  return s.replace(/\*\*|~~|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
}

function diff(before, after) {
  const a = parseIssues(before), b = parseIssues(after);
  const changes = [];
  for (const [id, row] of b) {
    const old = a.get(id);
    if (!old) changes.push({ kind: 'new', row });
    else if (old.status !== row.status) changes.push({ kind: 'status', row, from: old.status });
    else if (old.text !== row.text) changes.push({ kind: 'edit', row });
  }
  for (const [id, row] of a) if (!b.has(id)) changes.push({ kind: 'removed', row });
  const num = (c) => Number(c.row.id.slice(2));
  return changes.sort((x, y) => num(y) - num(x));
}

// One compact block per push: one field per issue (icon, id, status / title, link), no long text.
const LABELS = { new: 'New', status: 'Status changed', edit: 'Updated', removed: 'Removed' };
function field(c, sha) {
  const r = c.row;
  const status = c.kind === 'status' ? `${c.from} → ${r.status}` : r.status;
  const title = r.title.length > TITLE_MAX ? r.title.slice(0, TITLE_MAX - 1).trimEnd() + '…' : r.title;
  const link = c.kind === 'removed' ? '' : ` · [open](${REPO}/blob/${sha}/${FILE}#L${r.line})`;
  return { name: `${ICONS[c.kind]} ${r.id} · ${status}`.slice(0, 256), value: `${title}${link}`.slice(0, 1024) };
}

function messages(changes, sha) {
  const out = [];
  const counts = Object.keys(LABELS).map((k) => [k, changes.filter((c) => c.kind === k).length]).filter(([, n]) => n);
  const summary = counts.map(([k, n]) => `${ICONS[k]} ${LABELS[k]} ${n}`).join(' · ');
  for (let i = 0; i < changes.length; i += FIELDS_MAX) {
    const part = changes.slice(i, i + FIELDS_MAX);
    const kinds = new Set(part.map((c) => c.kind));
    out.push({ username: 'Re-Union X issues', embeds: [{
      title: i ? 'Issues updated (continued)' : 'Issues updated',
      url: `${REPO}/blob/${sha}/${FILE}`,
      description: i ? '' : summary,
      color: kinds.size === 1 ? COLORS[[...kinds][0]] : COLORS.edit,
      fields: part.map((c) => field(c, sha)),
      footer: { text: `commit ${sha.slice(0, 7)}` },
    }] });
  }
  return out;
}

async function post(url, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 429) { const j = await res.json().catch(() => ({})); await new Promise((r) => setTimeout(r, ((j.retry_after || 1) + 0.2) * 1000)); continue; }
    if (!res.ok) throw new Error(`Discord answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  throw new Error('Discord rate limit: gave up');
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dry = process.argv.includes('--dry-run');
  const [before, after = 'HEAD'] = args;
  if (!before) { console.error('usage: post-issues.js <before> <after> [--dry-run]'); process.exit(2); }
  const rev = (r) => { try { return execFileSync('git', ['rev-parse', r], { encoding: 'utf8' }).trim(); } catch { return ''; } };
  const sha = rev(after);
  const from = /^0+$/.test(before) ? '' : rev(before);
  if (!from) { console.log(`no previous commit (${before}): nothing to compare`); return; }
  const changes = diff(show(from), show(sha));
  console.log(`${changes.length} issue change(s) between ${from.slice(0, 7)} and ${sha.slice(0, 7)}`);
  const msgs = messages(changes, sha);
  if (dry) { console.log(JSON.stringify(msgs, null, 1)); return; }
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) { console.error('DISCORD_WEBHOOK_URL is not set'); process.exit(1); }
  for (const m of msgs) await post(url, m);
  console.log(`posted ${msgs.length} message(s)`);
}

module.exports = { parseIssues, diff, messages };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
