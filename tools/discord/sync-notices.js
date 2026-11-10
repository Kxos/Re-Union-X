#!/usr/bin/env node
// Mirrors docs/NOTICES.md (the in-game Notices) into the Discord forum channel #in-game-notices through a webhook.
// Each notice is one forum post: its title is the post title, its IMPORTANT / INFORMATION badge a forum tag, and each
// sub-section of the notice its own block (embed), so people read one notice at a time, like the in-game list.
// The post and message ids live in docs/notices/discord-state.json: a changed notice is edited in place (extra
// messages are added to or removed from its post), a new notice becomes a new post, a removed one is emptied.
//   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token> node tools/discord/sync-notices.js
//   node tools/discord/sync-notices.js --dry-run      (prints the plan, no network)
// The webhook URL is a secret: it comes only from the environment (a GitHub Actions secret), never from the repo.
// The forum tag ids are not secret: tools/discord/forum-tags.json ({"IMPORTANT": "<id>", "INFORMATION": "<id>"}).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const NOTICES = path.join(ROOT, 'docs', 'NOTICES.md');
const STATE = path.join(ROOT, 'docs', 'notices', 'discord-state.json');
const TAGS = path.join(__dirname, 'forum-tags.json');
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
    return { title, kind, date, body: rest };
  });
}

// "### Heading" lines open a new section; the text before the first heading is the introduction.
function sections(body) {
  const out = [];
  let cur = { heading: '', text: [] };
  for (const line of body.split('\n')) {
    const h = line.match(/^#{3,6}\s+(.+)$/);
    if (h) { if (cur.heading || cur.text.join('').trim()) out.push(cur); cur = { heading: h[1].trim(), text: [] }; }
    else cur.text.push(line);
  }
  out.push(cur);
  return out.map((s) => ({ heading: s.heading, text: s.text.join('\n').replace(/\n{3,}/g, '\n\n').trim() }))
    .filter((s) => s.heading || s.text);
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
  const color = COLORS[n.kind] || 0x7f8c8d;
  const embeds = [];
  sections(n.body).forEach((s, si) => {
    chunk(s.text || '​', DESC_MAX).forEach((d, i) => {
      const e = { description: d || '​', color };
      if (i === 0 && s.heading) e.title = s.heading.slice(0, 256);
      if (si === 0 && i === 0) {
        e.author = { name: [n.kind, n.date].filter(Boolean).join(' · ') || 'Notice' };
        if (!e.title) e.title = n.title.slice(0, 256);
        e.url = noticeUrl(n.title);   // the portal opens that notice directly (routes-info-album.js, data-s slug)
      }
      embeds.push(e);
    });
  });
  // The link is also at the end: on a phone the post opens scrolled to the bottom (user, 10-11).
  const last = embeds[embeds.length - 1];
  last.description = (last.description === '​' ? '' : last.description + '\n\n') + `**[Read this notice on the website](${noticeUrl(n.title)})**`;
  last.footer = { text: 'Re-Union X · in-game Notices' };
  const msgs = [];
  let cur = [], size = 0;
  for (const e of embeds) {
    const len = (e.title || '').length + e.description.length + 120;
    if (cur.length && (cur.length >= EMBEDS_MAX || size + len > MSG_MAX)) { msgs.push(cur); cur = []; size = 0; }
    cur.push(e); size += len;
  }
  msgs.push(cur);
  const out = msgs.map((embeds) => ({ embeds, allowed_mentions: { parse: [] } }));
  out[0].content = preview(n.body);   // what the forum list shows under the post title
  return out;
}

// Same slug as the portal page (server/routes-info-album.js noticesPage): /notices/#<slug> opens that notice.
function noticeUrl(title) {
  return PORTAL + '#' + String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// The first sentence of the notice, for the forum list preview.
function preview(body) {
  const first = (sections(body)[0] || { text: '' }).text.split('\n\n')[0].replace(/\s+/g, ' ').trim();
  const m = first.match(/^(.{20,280}?[.!?])(\s|$)/);
  const s = m ? m[1] : first.slice(0, 280);
  return s.length < first.length && !m ? s.replace(/\s+\S*$/, '') + '…' : s;
}

const hash = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

// Posts are created oldest notice first, so a forum sorted by creation date shows the newest on top, like the game.
function plan(notices) {
  return notices.slice().reverse().map((n) => {
    const messages = noticeMessages(n);
    return { title: n.title, kind: n.kind, date: n.date, hash: hash(messages), messages };
  });
}

// Per notice: 'post' (new), 'keep', 'edit' (same post, messages edited/added/removed) or 'gone' (removed notice).
function actions(want, have) {
  const out = want.map((w) => {
    const old = have.find((h) => h.title === w.title);
    return { w, old, act: !old ? 'post' : old.hash === w.hash ? 'keep' : 'edit' };
  });
  for (const h of have) if (!want.find((w) => w.title === h.title)) out.push({ old: h, act: 'gone' });
  return out;
}

// An older state entry has no date: it is recorded quietly the first time, never announced.
function bumped(old, w) { return Boolean(old && old.date && w.date && old.date !== w.date); }
function bumpMessage(w) {
  return { content: `🔄 **Updated** · ${w.date} — the notice above has new information. [Read it on the website](<${noticeUrl(w.title)}>)`,
    allowed_mentions: { parse: [] } };
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

function webhookUrl() {
  const raw = String(process.env.DISCORD_WEBHOOK_URL || '').trim().replace(/^["'<]+|["'>]+$/g, '');
  if (!raw) return null;
  const m = raw.match(/^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/(\d+)\/([\w-]+)/);
  if (!m) {
    const shape = raw.replace(/[A-Za-z0-9_-]{6,}/g, (s) => `<${s.length}>`);   // never print the secret
    throw new Error(`DISCORD_WEBHOOK_URL is not a Discord webhook URL (shape: ${shape})`);
  }
  return `https://discord.com/api/webhooks/${m[1]}/${m[2]}`;   // drops a trailing /github, /slack or ?query
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const want = plan(parseNotices(fs.readFileSync(NOTICES, 'utf8')));
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  const have = state.mode === 'forum' ? (state.notices || []) : [];   // an older channel copy is not reused
  const tags = fs.existsSync(TAGS) ? JSON.parse(fs.readFileSync(TAGS, 'utf8')) : {};
  const todo = actions(want, have);

  if (dry) {
    for (const t of todo) {
      const name = (t.w || t.old).title;
      const n = t.w ? `${t.w.messages.length} message(s), ${t.w.messages.reduce((a, m) => a + m.embeds.length, 0)} block(s)` : '';
      console.log(`${t.act.padEnd(4)} ${name}${n ? ': ' + n : ''}${t.w && tags[t.w.kind] ? ' [tag ' + t.w.kind + ']' : ''}`);
    }
    return;
  }

  const hook = webhookUrl();
  if (!hook) { console.log('discord: no webhook configured, nothing sent'); return; }

  // The state is saved after every step, so a run that fails half way never leaves posts nobody tracks.
  const done = new Map(have.map((h) => [h.title, h]));
  const save = () => fs.writeFileSync(STATE, JSON.stringify({ mode: 'forum', portal: PORTAL,
    notices: [...want.map((w) => done.get(w.title)).filter(Boolean), ...have.filter((h) => !want.find((w) => w.title === h.title) && done.has(h.title))] }, null, 1) + '\n');

  for (const t of todo) {
    if (t.act === 'keep') {
      // older state entries have no date yet: record it now (no message), so the next date change is announced
      if (!t.old.date && t.w.date) { done.set(t.w.title, { ...t.old, date: t.w.date }); save(); }
      continue;
    }
    if (t.act === 'gone') {
      // a webhook cannot delete a forum post: its messages are deleted and the empty post can be removed by hand
      for (const id of t.old.ids) await api(hook, 'DELETE', `/messages/${id}?thread_id=${t.old.thread}`);
      done.delete(t.old.title); save(); continue;
    }
    const { w } = t;
    if (t.act === 'post') {
      const first = { ...w.messages[0], thread_name: w.title.slice(0, 100) };
      if (tags[w.kind]) first.applied_tags = [String(tags[w.kind])];
      const msg = await api(hook, 'POST', '?wait=true', first);
      const rec = { title: w.title, hash: '', date: w.date, thread: msg.channel_id, ids: [msg.id] };
      done.set(w.title, rec); save();
      for (const m of w.messages.slice(1)) { rec.ids.push((await api(hook, 'POST', `?wait=true&thread_id=${rec.thread}`, m)).id); save(); }
      rec.hash = w.hash; save();
      continue;
    }
    const rec = { ...t.old, ids: t.old.ids.slice() };
    for (let i = 0; i < w.messages.length; i++) {
      if (i < rec.ids.length) await api(hook, 'PATCH', `/messages/${rec.ids[i]}?thread_id=${rec.thread}`, w.messages[i]);
      else rec.ids.push((await api(hook, 'POST', `?wait=true&thread_id=${rec.thread}`, w.messages[i])).id);
      done.set(w.title, rec); save();
    }
    while (rec.ids.length > w.messages.length) {
      await api(hook, 'DELETE', `/messages/${rec.ids.pop()}?thread_id=${rec.thread}`);
      done.set(w.title, rec); save();
    }
    // A notice that became more recent (its date changed) gets a short reply: edits alone do not move a forum post,
    // a new message does, so the post goes back on top and its followers are notified. Typo fixes keep the date and stay quiet.
    if (bumped(t.old, w)) {
      await api(hook, 'POST', `?wait=true&thread_id=${rec.thread}`, bumpMessage(w));
    }
    rec.hash = w.hash; rec.date = w.date; done.set(w.title, rec); save();
  }
  save();
  console.log(`discord: synced ${want.length} notices (${todo.filter((t) => t.act !== 'keep').length} changed)`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { parseNotices, sections, chunk, noticeMessages, plan, actions, bumped, bumpMessage };
