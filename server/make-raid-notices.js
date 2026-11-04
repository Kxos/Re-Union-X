#!/usr/bin/env node
// Original notices of the raids, for the Details button of their banners in the Events tab (in the original game the Details
// of an event card opened the event's notice). Reads the private sources under KHUX_RAID_SRC (as make-raid.js), never copied
// into the repo:
// - raid_census/raid_census.json: the census rows (id, family, start, end, bosses, catalog);
// - raid_census/work/notice_text.json: {notice id: plain text of the SQUARE ENIX BRIDGE notice page}.
// Writes server/game_data/raid_notices.json (git-ignored: the notice text is SQUARE ENIX's, it never goes in the public repo):
//   {note, rows: {censusId: {noticeId, how, confidence, checks, alt?, note?}}, notices: {noticeId: {title, date, time, category,
//   body: [lines]}}, unmatched: [censusId]}
// The notice text is kept as it is (lines trimmed, empty lines dropped): the page shows it unchanged.
// Matching a census row to its notice:
// - event rows WW-E<n>-<k>: notice <n> ('census id');
// - weekly rows WW-W-<date>: the catalogue reference of the census row, «E<notice>-<k>» ('census catalogue'); without one, the
//   notice dated from 3 days before the week to its end whose title names a raid and whose text names every boss of the week
//   ('date and title');
// - the weeks of the end of service (from 2021-03-01) had no weekly notice: the end-of-service notice that announced the Weekly
//   Raid Event until the end ('end-of-service notice', confidence low, the page says so).
// confidence: high = every boss named and the week's start date written in the notice (or the notice dated within 3 days of it);
// medium = one of the two (from 2019 most notices name the boss only in their pictures: date only); low = neither, or the
// end-of-service notice.
// make-raid.js reads the file: a raid evStage row gets detailUrl /web/raid/notice/<evStageId> only when its census row is here.
//
//   node server/make-raid-notices.js [--report <file.tsv>]     (after it: make-raid / make-game-tables, then a master revision)
'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'game_data', 'raid_notices.json');
const DEFAULT_SRC = 'D:\\Progetto_Restauro_KH_UX\\private\\events\\sources';
const EOS = { from: '2021-03-01', noticeId: 74823, mark: /Weekly Raid Event/,
  note: 'This week had no notice of its own: this is the notice that announced the Weekly Raid Events until the end of service.' };
const MONTHS = [['Jan', 'January'], ['Feb', 'February'], ['Mar', 'March'], ['Apr', 'April'], ['May', 'May'], ['Jun', 'June'], ['Jul', 'July'], ['Aug', 'August'],
  ['Sep', 'September', 'Sept'], ['Oct', 'October'], ['Nov', 'November'], ['Dec', 'December']];
const DAY = 86400000;

// plain text of a notice page -> {title, date (YYYY-MM-DD, UTC), time (HH:MM), category, body: [lines]} | null
function parseNotice(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l.replace(/\u00a0/g, '').trim());
  const at = lines.findIndex((l) => /^\d\d\/\d\d\/\d{4} \d\d:\d\d(:\d\d)? \(UTC\)$/.test(l));
  if (at < 1) return null;
  const [, mm, dd, yyyy, time] = /^(\d\d)\/(\d\d)\/(\d{4}) (\d\d:\d\d)/.exec(lines[at]);
  let from = at + 2;
  if (/^KINGDOM HEARTS Union/.test(lines[from] || '')) from++;
  let to = lines.length;
  while (to > from && /^Top of Page$/i.test(lines[to - 1])) to--;
  return { title: lines[at - 1], date: `${yyyy}-${mm}-${dd}`, time, category: lines[at + 1] || '', body: lines.slice(from, to) };
}

const compact = (s) => String(s || '').replace(/\u00a0/g, ' ').toLowerCase().replace(/[\s\-.'’]/g, '');
const bossNamed = (boss, hay) => hay.includes(compact(boss)) || hay.includes(compact(boss.replace(/Ω/g, 'omega')));
const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);
// the start day written in a notice: «Oct. 7, 2019», «October 7, 2019», «10/7» or «10/07/2019»
function startWritten(start, n) {
  const [y, m, d] = start.split('-').map(Number);
  const names = MONTHS[m - 1].join('|');
  const text = [n.title, ...n.body].join('\n').replace(/\u00a0/g, ' ');
  return new RegExp(`\\b(${names})\\.?\\s*${d},\\s*${y}\\b`).test(text) || new RegExp(`(^|[^\\d/])0?${m}/0?${d}([^\\d]|$)`).test(text);
}
// boss: 'named' (every boss of the row in the text), 'not named' (no raid boss in the text: from 2019 the notices show it only
// in their pictures), 'other boss' (the text names other raid bosses only: in the notices of several events, the bosses of the
// other events, e.g. «Defeat Closehanded Captain!»; for review, it does not lower the confidence); bosses = every raid boss
// name of the census
function checks(row, n, bosses = []) {
  const hay = compact([n.title, ...n.body].join(' '));
  const own = (row.bosses || []).filter(Boolean);
  const named = own.length > 0 && own.every((b) => bossNamed(b, hay));
  const boss = named ? 'named' : bosses.some((b) => !own.includes(b) && bossNamed(b, hay)) ? 'other boss' : 'not named';
  const date = !!row.start && (startWritten(row.start, n) || Math.abs(days(n.date, row.start)) <= 3);
  return { boss, date, title: /raid/i.test(n.title) };
}
const confidenceOf = (c) => (c.date && c.boss === 'named' ? 'high' : c.date || c.boss === 'named' ? 'medium' : 'low');
const score = (c) => 2 * (c.boss === 'named') - 2 * (c.boss === 'other boss') + c.date + c.title;

// census + {id: text} -> the document written to OUT
function build({ census, noticeText }) {
  const parsed = new Map();
  const notice = (id) => {
    if (!parsed.has(id)) parsed.set(id, noticeText[id] === undefined ? null : parseNotice(noticeText[id]));
    return parsed.get(id);
  };
  const bosses = [...new Set((census.rows || []).flatMap((r) => r.bosses || []).filter(Boolean))];
  const all = () => Object.keys(noticeText).map(Number).map((id) => [id, notice(id)]).filter(([, n]) => n);
  const rows = {}, unmatched = [];
  for (const row of census.rows || []) {
    const id = String(row.id || '');
    if (!/^WW-(W-\d|E\d)/.test(id) || !row.start) continue;
    let hit = null;
    const ev = /^WW-E(\d+)-/.exec(id);
    if (ev) {
      const n = notice(Number(ev[1]));
      if (n) { const c = checks(row, n, bosses); hit = { noticeId: Number(ev[1]), how: 'census id', confidence: confidenceOf(c), checks: c }; }
    } else {
      const refs = [...new Set([...String(row.catalog || '').matchAll(/E(\d+)-\d+/g)].map((m) => Number(m[1])))].filter((n) => notice(n));
      if (refs.length) {
        const ranked = refs.map((n) => [n, checks(row, notice(n), bosses)]).sort((a, b) => score(b[1]) - score(a[1]));
        const [best, c] = ranked[0];
        hit = { noticeId: best, how: 'census catalogue', confidence: confidenceOf(c), checks: c, ...(ranked.length > 1 ? { alt: ranked.slice(1).map(([n]) => n) } : {}) };
      } else {
        const end = row.end || row.start;
        const found = all().filter(([, n]) => days(n.date, row.start) >= -3 && n.date <= end).map(([n, x]) => [n, x, checks(row, x, bosses)])
          .filter(([, , c]) => c.boss === 'named' && c.title).sort((a, b) => score(b[2]) - score(a[2]) || Math.abs(days(a[1].date, row.start)) - Math.abs(days(b[1].date, row.start)));
        if (found.length) {
          const [n, x, c] = found[0];
          hit = { noticeId: n, how: 'date and title', confidence: startWritten(row.start, x) ? 'high' : 'medium', checks: c };
        } else if (row.start >= EOS.from && notice(EOS.noticeId) && EOS.mark.test(notice(EOS.noticeId).body.join('\n'))) {
          hit = { noticeId: EOS.noticeId, how: 'end-of-service notice', confidence: 'low', checks: checks(row, notice(EOS.noticeId), bosses), note: EOS.note };
        }
      }
    }
    if (hit) rows[id] = hit; else unmatched.push(id);
  }
  const used = [...new Set(Object.values(rows).map((r) => r.noticeId))].sort((a, b) => a - b);
  return { note: 'Generated by server/make-raid-notices.js from the private notice texts: SQUARE ENIX text, git-ignored, never committed.',
    rows, notices: Object.fromEntries(used.map((n) => [n, notice(n)])), unmatched };
}

function buildFrom(src) {
  const read = (...p) => JSON.parse(fs.readFileSync(path.join(src, 'raid_census', ...p), 'utf8'));
  return build({ census: read('raid_census.json'), noticeText: read('work', 'notice_text.json') });
}

// one line per census row, for review (written outside the repo)
function reportLines(doc, census) {
  const by = new Map((census.rows || []).map((r) => [r.id, r]));
  const head = ['censusId', 'family', 'start', 'bosses', 'noticeId', 'notice date', 'title', 'how', 'confidence', 'boss', 'date', 'raid title', 'alt'].join('\t');
  const line = (id) => {
    const r = by.get(id) || {}, h = doc.rows[id], n = h ? doc.notices[h.noticeId] : null;
    return [id, r.family, r.start, (r.bosses || []).join(' + '), h ? h.noticeId : '', n ? n.date : '', n ? n.title : '', h ? h.how : 'none', h ? h.confidence : '',
      h ? h.checks.boss : '', h ? h.checks.date : '', h ? h.checks.title : '', h && h.alt ? h.alt.join(' ') : ''].join('\t');
  };
  return [head, ...Object.keys(doc.rows).map(line), ...doc.unmatched.map(line)].join('\n') + '\n';
}

if (require.main === module) {
  const src = process.env.KHUX_RAID_SRC || DEFAULT_SRC;
  const doc = buildFrom(src);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(doc));
  const count = (f) => Object.values(doc.rows).filter(f).length;
  console.log(`raid notices: ${Object.keys(doc.rows).length} census rows with a notice (${Object.keys(doc.notices).length} notices), ${doc.unmatched.length} without -> ${OUT}`);
  for (const how of ['census id', 'census catalogue', 'date and title', 'end-of-service notice']) {
    console.log(`  ${how}: ${count((r) => r.how === how)} (high ${count((r) => r.how === how && r.confidence === 'high')}, medium ${count((r) => r.how === how && r.confidence === 'medium')}, low ${count((r) => r.how === how && r.confidence === 'low')})`);
  }
  const i = process.argv.indexOf('--report');
  if (i > 0 && process.argv[i + 1]) {
    fs.writeFileSync(process.argv[i + 1], reportLines(doc, JSON.parse(fs.readFileSync(path.join(src, 'raid_census', 'raid_census.json'), 'utf8'))));
    console.log(`  report -> ${process.argv[i + 1]}`);
  }
}

module.exports = { parseNotice, build, buildFrom, reportLines, OUT, EOS };
