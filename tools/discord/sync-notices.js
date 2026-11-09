#!/usr/bin/env node
// Mirrors docs/NOTICES.md (the in-game Notices) into the Discord channel #in-game-notices through a webhook.
// One notice = one or more webhook messages (embeds). The message ids live in docs/notices/discord-state.json, so a
// changed notice is edited in place, a removed one deleted, a new one appended at the bottom of the channel.
// If the order changes or a changed notice needs a different number of messages, the channel copy is rebuilt.
//   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token> node tools/discord/sync-notices.js
//   node tools/discord/sync-notices.js --dry-run      (prints the plan, no network)
// The webhook URL is a secret: it comes only from the environment (a GitHub Actions secret), never from the repo.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const NOTICES = path.join(ROOT, 'docs', 'NOTICES.md');
const STATE = path.join(ROOT, 'docs', 'notices', 'discord-state.json');
const PORTAL = 'https://re-union-x.github.io/Re-Union-X/notices/';
const DESC_MAX = 3900;   // embed description limit 4096
const MSG_MAX = 5600;    // all embeds of one message: 6000
const EMBEDS_MAX = 10;
const COLORS = { IMPORTANT: 0xe0435a, INFORMATION: 0x2aa7d6 };

function parseNotices(md) {
  return md.replace(/\r/g, '').split(/^## /m).slice(1).filter((p) => !p.startsWith('Contents')).map((p) => {
    const lines = p.split('\n');
    const title = lines[0].trim();
    let rest = lines.slice(1).join('\n').trim();
    let kind = '', date = '';
    const m = rest.match(/^\*\*([A-Z]+)\*\*\s*·\s*(\S+)\s*(\n|$)/);
    if (m) { kind = m[1]; date = m[2]; rest = rest.slice(m[0].length).trim(); }
    return { title, kind, date, body: toDiscord(rest) };
  });
}

// Embeds render bold, italic, links and lists; sub-headings become bold lines.
function toDiscord(text) {
  return text.replace(/^#{3,6}\s+(.+)$/gm, '**$1**').replace(/\n{3,}/g, '\n\n');
}

// Paragraphs first, then lines, then a hard cut, so each piece fits one embed description.
function chunk(text, max) {
  const out = [];
  let cur = '';
  const add = (piece, sep) => {
    if (!cur) cur = piece;
    else if (cur.length + sep.length + piece.length <= max) cur += sep + piece;
    else { out.push(cur); cur = piece; }
  };
  for (const para of text.split('\n\n')) {
    if (para.length <= max) { add(para, '\n\n'); continue; }
    for (const line of para.split('\n')) {
      if (line.length <= max) { add(line, '\n'); continue; }
      for (let i = 0; i < line.length; i += max) add(line.slice(i, i + max), '');
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

function noticeMessages(n) {
  const embeds = chunk(n.body, DESC_MAX).map((d, i) => {
    const e = { description: d || '​', color: COLORS[n.kind] || 0x7f8c8d };
    if (i === 0) {
      e.title = n.title;
      e.url = PORTAL;
      if (n.kind || n.date) e.author = { name: [n.kind, n.date].filter(Boolean).join(' · ') };
    }
    return e;
  });
  embeds[embeds.length - 1].footer = { text: 'Re-Union X · in-game Notices' };
  const msgs = [];
  let cur = [], size = 0;
  for (const e of embeds) {
    const len = (e.title || '').length + e.description.length + 80;
    if (cur.length && (cur.length >= EMBEDS_MAX || size + len > MSG_MAX)) { msgs.push(cur); cur = []; size = 0; }
    cur.push(e); size += len;
  }
  msgs.push(cur);
  return msgs.map((embeds) => ({ embeds, allowed_mentions: { parse: [] } }));
}

const hash = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

// Channel order: oldest notice first, so the newest sits at the bottom, where people read.
function plan(notices) {
  return notices.slice().reverse().map((n) => {
    const messages = noticeMessages(n);
    return { title: n.title, hash: hash(messages), messages };
  });
}

// What to do with the saved state: 'rebuild' when the kept notices changed order, a new notice is not at the end,
// or a changed notice needs a different number of messages; otherwise 'sync' (post new, edit changed, delete gone).
function decide(want, have) {
  const has = (t) => have.find((h) => h.title === t);
  const kept = want.filter((w) => has(w.title)).map((w) => w.title);
  const haveOrder = have.map((h) => h.title).filter((t) => kept.includes(t));
  const order = JSON.stringify(kept) === JSON.stringify(haveOrder);
  const lastKept = kept.length ? want.findIndex((w) => w.title === kept[kept.length - 1]) : -1;
  const newAtEnd = want.every((w, i) => has(w.title) || i > lastKept);
  const counts = want.every((w) => !has(w.title) || has(w.title).ids.length === w.messages.length);
  return order && newAtEnd && counts ? 'sync' : 'rebuild';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(base, method, suffix, body) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(base + suffix, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}));
      await sleep(Math.ceil((j.retry_after || 2) * 1000) + 250);
      continue;
    }
    if (res.status === 404 && method === 'DELETE') return {};   // already deleted by hand
    if (!res.ok) throw new Error(`${method} ${suffix.replace(/\?.*/, '')}: ${res.status} ${await res.text()}`);
    await sleep(800);
    return res.status === 204 ? {} : res.json();
  }
  throw new Error('rate limited too long');
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const want = plan(parseNotices(fs.readFileSync(NOTICES, 'utf8')));
  const have = fs.existsSync(STATE) ? (JSON.parse(fs.readFileSync(STATE, 'utf8')).notices || []) : [];
  const mode = decide(want, have);

  if (dry) {
    console.log(`mode: ${mode}`);
    for (const w of want) {
      const old = have.find((h) => h.title === w.title);
      const act = mode === 'rebuild' || !old ? 'post' : old.hash === w.hash ? 'keep' : 'edit';
      const n = w.messages.reduce((a, m) => a + m.embeds.length, 0);
      console.log(`${act.padEnd(4)} ${w.title}: ${w.messages.length} message(s), ${n} embed(s)`);
    }
    for (const h of have) if (!want.find((w) => w.title === h.title)) console.log(`del  ${h.title}`);
    return;
  }

  const hook = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!hook) { console.log('discord: no webhook configured, nothing sent'); return; }
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(hook)) {
    throw new Error('DISCORD_WEBHOOK_URL is missing or is not a Discord webhook URL');
  }
  const postAll = async (messages) => {
    const ids = [];
    for (const m of messages) ids.push((await api(hook, 'POST', '?wait=true', m)).id);
    return ids;
  };

  // The state is saved after every step, so a run that fails half way never leaves messages nobody tracks.
  let out = [];
  const save = (rest = []) => fs.writeFileSync(STATE, JSON.stringify({ portal: PORTAL, notices: [...out, ...rest] }, null, 1) + '\n');
  if (mode === 'rebuild') {
    const left = have.slice();
    while (left.length) {
      for (const id of left[0].ids) await api(hook, 'DELETE', `/messages/${id}`);
      left.shift(); save(left);
    }
    for (const w of want) { out.push({ title: w.title, hash: w.hash, ids: await postAll(w.messages) }); save(); }
  } else {
    let left = have.slice();
    for (const h of have) {
      if (want.find((w) => w.title === h.title)) continue;
      for (const id of h.ids) await api(hook, 'DELETE', `/messages/${id}`);
      left = left.filter((x) => x !== h); out = []; save(left);
    }
    out = [];
    for (const w of want) {
      const old = have.find((h) => h.title === w.title);
      if (!old) out.push({ title: w.title, hash: w.hash, ids: await postAll(w.messages) });
      else {
        if (old.hash !== w.hash) {
          for (let i = 0; i < w.messages.length; i++) await api(hook, 'PATCH', `/messages/${old.ids[i]}`, w.messages[i]);
        }
        out.push({ title: w.title, hash: w.hash, ids: old.ids });
      }
      save(left.filter((x) => !out.find((o) => o.title === x.title)));
    }
  }
  save();
  console.log(`discord: ${mode} done, ${out.length} notices`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { parseNotices, chunk, noticeMessages, plan, decide };
