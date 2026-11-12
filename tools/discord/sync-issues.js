#!/usr/bin/env node
// Mirrors docs/ISSUES.md into the Discord forum channel #issues through the project's bot.
// One forum post per issue; its forum tag is the issue's status (OPEN, IN PROGRESS, TO VERIFY, CLOSED, ON HOLD,
// OBSOLETE), so people filter the list by status. When the status changes the tag is changed and a short line is
// added to the post; when the text changes the first message is edited in place. Closed issues get a post only if
// they had one before (the first run posts only the issues that are not closed).
// A webhook cannot change the tags of an existing post, hence a bot (token in the secret DISCORD_BOT_TOKEN, with
// View Channels, Send Messages, Send Messages in Threads, Embed Links, Read Message History, Manage Threads).
//   DISCORD_BOT_TOKEN=... node tools/discord/sync-issues.js
//   node tools/discord/sync-issues.js --dry-run      (prints the plan, no network)
// Post and message ids live in docs/discord/issues-state.json (committed back by the GitHub Action).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ISSUES = path.join(ROOT, 'docs', 'ISSUES.md');
const STATE = path.join(ROOT, 'docs', 'discord', 'issues-state.json');
const CONFIG = path.join(__dirname, 'issues-forum.json');
const REPO = 'https://github.com/Re-Union-X/Re-Union-X';
const API = 'https://discord.com/api/v10';
const DESC_MAX = 700;
const GROUPS = ['OPEN', 'IN PROGRESS', 'TO VERIFY', 'ON HOLD', 'CLOSED', 'OBSOLETE'];
const ICONS = { OPEN: '🔴', 'IN PROGRESS': '🛠️', 'TO VERIFY': '🔍', 'ON HOLD': '⏸️', CLOSED: '✅', OBSOLETE: '🗃️' };
const COLORS = { OPEN: 0xe0435a, 'IN PROGRESS': 0xd29922, 'TO VERIFY': 0x2aa7d6, 'ON HOLD': 0x8b949e, CLOSED: 0x3fb950, OBSOLETE: 0x6e7681 };

const plain = (s) => String(s).replace(/\*\*|~~|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ').trim();

// The status cell starts with the status word(s); DONE counts as CLOSED.
function group(status) {
  const s = plain(status).toUpperCase();
  if (s.startsWith('DONE')) return 'CLOSED';
  return GROUPS.find((g) => s.startsWith(g)) || 'OPEN';
}

// Rows of the «## Open» tables: | ID | Status | Title (bold) + details | Detail link | Proof |
// Rows of the «## Closed» table: | ID | Area | Title (bold or text) + details | Proof |
function parseIssues(md) {
  const out = new Map();
  let part = '', area = '';
  md.replace(/\r/g, '').split('\n').forEach((line, i) => {
    let h;
    if ((h = line.match(/^## (.+)/))) { part = h[1].trim().toLowerCase(); area = ''; return; }
    if ((h = line.match(/^### (.+)/))) { area = h[1].trim(); return; }
    const m = line.match(/^\|\s*(I-\d+)\s*\|(.*)\|\s*$/);
    if (!m) return;
    const cells = m[2].split(' | ').map((c) => c.trim());
    const closed = part.startsWith('closed');
    const status = closed ? 'CLOSED' : plain(cells[0]);
    const rowArea = closed ? plain(cells[0]) : area;
    const body = cells[1] || '';
    const t = body.match(/^\*\*(.+?)\*\*\s*/);
    const title = plain(t ? t[1] : body.split(/[.(:]/)[0]).slice(0, 200);
    const details = plain(t ? body.slice(t[0].length) : body);
    out.set(m[1], { id: m[1], status, group: group(status), area: rowArea, title, details, line: i + 1 });
  });
  return out;
}

// Readable on a phone: the leading «(context):» on its own line in italics, numbered items «(1) … (2) …» as bullets.
function format(details) {
  let s = details;
  let head = '';
  const m = s.match(/^\(([^()]{3,120})\):?\s*/);
  if (m) { head = `*${m[1]}*\n`; s = s.slice(m[0].length); }
  const items = s.split(/\s*(?:^|[;,.]?\s)\((\d{1,2})\)\s+/);
  if (items.length > 3) {
    const intro = items[0].replace(/[:;,]\s*$/, '').trim();
    const bullets = [];
    for (let i = 1; i < items.length; i += 2) bullets.push('• ' + items[i + 1].replace(/[;,]\s*$/, '').trim());
    s = (intro ? intro + '\n' : '') + bullets.join('\n');
  }
  return head + s;
}

function clip(s, max) { return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'; }

function postMessage(r, sha) {
  const url = `${REPO}/blob/${sha}/docs/ISSUES.md#L${r.line}`;
  const extra = r.status.toUpperCase() !== r.group ? plain(r.status).slice(r.group.length).replace(/^[\s(]+|\)$/g, '') : '';
  const e = {
    author: { name: `${ICONS[r.group]} ${r.group}${r.area ? ' · ' + r.area : ''}` },
    title: clip(`${r.id} · ${r.title}`, 256),
    url,
    color: COLORS[r.group],
    description: (r.details ? clip(format(r.details), DESC_MAX) + '\n\n' : '') + `**[Full entry on GitHub](${url})**`,
    footer: { text: 'Re-Union X · issues' },
  };
  if (extra) e.fields = [{ name: 'Status', value: clip(extra, 1024) }];
  return { content: clip(r.title, 200), embeds: [e], allowed_mentions: { parse: [] } };
}

const threadName = (r) => clip(`${r.id} · ${r.title}`, 100);
// HASH_V: raise it to edit every post once (e.g. after a history rewrite changed the commit ids in the row links).
const HASH_V = 2;
const hash = (x) => crypto.createHash('sha256').update(HASH_V + JSON.stringify(x)).digest('hex').slice(0, 16);

// Per issue: 'post' (new post), 'tag' (status group changed), 'edit' (text changed), 'keep'.
// The link to the row changes with every commit, so the hash ignores it.
function actions(rows, have) {
  const out = [];
  const ids = [...rows.keys()].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));   // oldest first: newest on top
  for (const id of ids) {
    const r = rows.get(id);
    const h = hash(postMessage({ ...r, line: 0 }, ''));
    const old = have[id];
    if (!old) { if (r.group !== 'CLOSED' && r.group !== 'OBSOLETE') out.push({ act: 'post', r, h }); continue; }
    if (old.group !== r.group) out.push({ act: 'tag', r, h, old });
    else if (old.hash !== h || old.name !== threadName(r)) out.push({ act: 'edit', r, h, old });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(token, method, route, body) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(API + route, {
      method, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { const j = await res.json().catch(() => ({})); await sleep(Math.ceil((j.retry_after || 2) * 1000) + 250); continue; }
    if (!res.ok) throw new Error(`${method} ${route}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    await sleep(400);
    return res.status === 204 ? {} : res.json();
  }
  throw new Error('rate limited too long');
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const rows = parseIssues(fs.readFileSync(ISSUES, 'utf8'));
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { issues: {} };
  const have = state.issues || {};
  const todo = actions(rows, have);
  let sha = process.env.GITHUB_SHA || '';
  if (!sha) { try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { sha = 'main'; } }

  if (dry) {
    for (const t of todo) console.log(`${t.act.padEnd(4)} ${t.r.id} [${t.old ? t.old.group + ' -> ' : ''}${t.r.group}] ${t.r.title}`);
    console.log(`${rows.size} issues, ${todo.length} action(s)`);
    return;
  }
  const token = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  if (!token) { console.log('discord: no bot token configured, nothing sent'); return; }
  const forum = JSON.parse(fs.readFileSync(CONFIG, 'utf8')).channel;

  const channel = await api(token, 'GET', `/channels/${forum}`);
  const tagIds = {};
  for (const t of channel.available_tags || []) {
    const g = GROUPS.find((x) => plain(t.name).toUpperCase() === x);
    if (g) tagIds[g] = t.id;
  }
  const missing = GROUPS.filter((g) => !tagIds[g]);
  if (missing.length) console.log(`discord: forum tags not found: ${missing.join(', ')}`);
  const tags = (g) => (tagIds[g] ? [tagIds[g]] : []);

  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  const save = () => fs.writeFileSync(STATE, JSON.stringify({ forum, issues: have }, null, 1) + '\n');
  const today = new Date().toISOString().slice(0, 10);

  for (const t of todo) {
    const { r } = t;
    const msg = postMessage(r, sha);
    if (t.act === 'post') {
      const th = await api(token, 'POST', `/channels/${forum}/threads`, { name: threadName(r), applied_tags: tags(r.group), message: msg });
      have[r.id] = { thread: th.id, msg: th.id, group: r.group, hash: t.h, name: threadName(r) };
      save(); continue;
    }
    const rec = t.old;
    // an archived post must be reopened before it can be changed
    await api(token, 'PATCH', `/channels/${rec.thread}`, { archived: false, name: threadName(r), applied_tags: tags(r.group) });
    await api(token, 'PATCH', `/channels/${rec.thread}/messages/${rec.msg}`, msg);
    if (t.act === 'tag') {
      await api(token, 'POST', `/channels/${rec.thread}/messages`, {
        content: `${ICONS[rec.group]} **${rec.group}** → ${ICONS[r.group]} **${r.group}** · ${today} · commit ${sha.slice(0, 7)}`,
        allowed_mentions: { parse: [] },
      });
    }
    have[r.id] = { ...rec, group: r.group, hash: t.h, name: threadName(r) };
    save();
  }
  save();
  console.log(`discord: ${rows.size} issues, ${todo.length} change(s) sent`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { parseIssues, group, postMessage, actions };
