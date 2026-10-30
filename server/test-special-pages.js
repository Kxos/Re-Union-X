// Special catalogue page test: node server/test-special-pages.js
'use strict';
const pages = require('./special-pages');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const PERIODS = [1, 2, 3, 4, 5].map((n) => ({ n, name: `Period ${n}`, from: `20${15 + n}-01-01`, to: `20${15 + n}-12-31` }));
const e = (key, evStageId, o) => ({ key, evStageId, name: `N-${key}`, family: key, periods: [1], days: 'all', vip: false,
  replacedBy: null, removed: '', campaign: null, stageIds: [evStageId * 10], useAp: [5], ...o });
const index = {
  catalog: { evStageId: 7000 },
  entries: [
    e('kb', 7101, { periods: [2], days: ['Tue'] }),
    e('kb2', 7102, { periods: [1], family: 'SQ13', stages: [{ quest: 'Quest Two', dropRewardIds: [1] }] }),
    e('repl', 7103, { periods: [1, 2], replacedBy: 'kb' }),
    e('gone', 7104, { periods: [1], removed: 'no-use' }),
    e('later', 7105, { periods: [5] }),
    e('vipq', 7106, { periods: [3], vip: true, days: [], family: 'SQ22' }),
    e('cid', 7107, { periods: [2], family: 'SQ12' }),
    e('camp', 7108, { periods: [3, 4], campaign: { start: '2016-01-01', end: '2016-02-01' } }),
  ],
};
const names = { drop: (rid) => (rid === 1 ? ['Huey Ver. A', 'Mythril Shard'] : []), objective: (sid) => (sid === 71020 ? ['Cid Ver. B'] : []) };
const html = pages.catalogPage(index, { period: 4, pinnedKey: 'kb', vip: false, periods: PERIODS, names, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon' });
const idx = (s) => html.indexOf(s);
check(idx('id="p1"') > 0 && idx('id="p1"') < idx('id="p2"') && idx('id="p4"') < idx('id="p5"'), 'five period sections in order');
check((html.match(/class="per/g) || []).length >= 5, 'five sections');
check(/Period 4[\s\S]{0,200}Now/.test(html) && (html.match(/>Now</g) || []).length === 1, 'current period marked Now once');
const row = (id) => { const s = html.indexOf(`id="q${id}"`); return s < 0 ? '' : html.slice(s, html.indexOf('</div>\n', s)); };
check(row(7105) && !row(7105).includes('data-pin') && row(7105).includes('Reached later in the Story'), 'later: no pin, text');
check(row(7103).includes('Replaced by N-kb') && !row(7103).includes('data-pin'), 'replaced');
check(row(7104).includes('Not restored: its materials have no use in this version') && !row(7104).includes('data-pin'), 'removed');
check(row(7101).includes('Remove from Special') && row(7101).includes('data-pin="/web/special/unpin"'), 'pinned');
check(row(7102).includes('Keep in Special') && row(7102).includes('/web/special/icon/pin.png') && row(7102).includes('Replaces: N-kb') && row(7102).includes('data-pin="/web/special/pin/7102"'), 'pinnable');
check(row(7106).includes('VIP only'), 'VIP');
check(row(7101).includes('/web/special/img/v' + require('./special').SPECIAL_IMG_VERSION + '/7101.png') && row(7101).includes('Tue'), 'image and days');
check(row(7102).includes('Every day'), 'every day');
// Task 13: tabs, filters sheet, data attributes, half-size banners
check(html.includes('class="tab on" data-p="all"'), 'All tab default');
for (const p of PERIODS) check(html.includes('data-p="' + p.n + '"') && html.includes('id="tc' + p.n + '"'), 'tab ' + p.n);
check(html.includes('id="tc1">3<') && html.includes('id="tcall">8<'), 'tab counts (3 in period 1, 8 total)');
const attr = (id, a) => { const r = row(id), m = new RegExp(a + '="([^"]*)"').exec(r.slice(0, r.indexOf('>') + 1)); return m ? m[1] : null; };
for (const id of [7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108]) check(['data-period', 'data-type', 'data-show', 'data-search'].every((a) => attr(id, a) !== null), 'row attrs ' + id);
check(attr(7102, 'data-search').includes('huey') && attr(7102, 'data-search').includes('mythril') && attr(7102, 'data-search').includes('quest two'), 'search has drop names');
check(attr(7107, 'data-search') === 'n-cid', 'search plain name');
check(attr(7102, 'data-period') === '1' && attr(7101, 'data-period') === '2', 'data-period');
check(attr(7107, 'data-type') === 'daily' && attr(7106, 'data-type').split(' ').includes('vip') && attr(7108, 'data-type') === 'camp' && attr(7101, 'data-type') === 'weekday', 'types');
check(attr(7101, 'data-show') === 'kept' && attr(7102, 'data-show') === 'can' && attr(7103, 'data-show') === 'replaced' && attr(7104, 'data-show') === 'removed' && attr(7105, 'data-show') === 'later' && attr(7106, 'data-show') === 'can' && attr(7108, 'data-show') === 'now', 'shows');
check(html.includes('id="sum"') && html.includes('>8 quests</span> · all periods, no filters') && html.includes('id="fbtn"'), 'summary and filters button');
check(html.includes('id="sheet"') && html.includes('data-g="type"') && html.includes('data-g="show"') && html.includes('id="fq"') && html.includes('id="freset"') && html.includes('id="fok"'), 'filters sheet');
check(html.includes('FIND') && html.includes('TYPE') && html.includes('SHOW') && html.includes('Daily Cid') && html.includes('Later in the Story'), 'sheet groups');
check(row(7102).includes('width="320"') && row(7102).includes('height="70"') && html.includes('.im{'), 'half-size banner');
const rowFor = (id) => row(id).includes('khuxClick');
check(rowFor(7102) && rowFor(7101), 'pin buttons kept');
const nonames = pages.catalogPage(index, { period: 4, pinnedKey: '', periods: PERIODS });
check(nonames.includes('data-search="n-kb2 | quest two"'), 'works without names');
const built = pages.buildNames((n) => ({ reward: [{ rewardId: 5, type: [3, 5, 2], id: [9, 8, 0] }], medal: [{ medalId: 9, name: 'Huey' }], material: [{ materialId: 8, name: 'Mythril' }],
  enemy: [{ enemyId: 77, name: 'Huey' }],
  stage: [{ stageId: 3, validSubmission: 2, submissionName: ['Defeat %s x %d', 'Defeat the ${1:%s} within ${2:%d :#turn:#turns}', ''], submissionIdType: [1, 1, 0],
    submissionId: [77, 77, 0], submissionNum: [2, 1, 0], submissionRewardType: [5, 14, 0], submissionItemId: [8, 0, 0], submissionItemNum: [4, 5, 0] }] }[n] || []));
check(built.drop(5).join() === 'Huey,Mythril,Jewels' && built.objective(3).join() === 'Mythril,Avatar Coin' && built.drop(99).length === 0, 'buildNames');
const none = pages.catalogPage(index, { period: 4, pinnedKey: '', vip: false, periods: PERIODS });
check(!none.includes('Replaces:'), 'no Replaces without a pin');
// final review: the status of a current-period entry comes from special.currentEntries (the quests of this Shop week)
{
  const ix = { catalog: { evStageId: 7000 }, entries: [
    e('open', 7201, { periods: [4] }),
    e('notyet', 7202, { periods: [4], from: '2016-03-01' }),
    e('campnow', 7203, { periods: [4], campaign: { start: '2016-01-11', end: '2016-01-17' } }),
    e('camplater', 7204, { periods: [4], campaign: { start: '2016-02-01', end: '2016-02-07' } }),
    e('vipnow', 7205, { periods: [4], vip: true, days: 'all', family: 'SQ22' }),
  ] };
  const ctx = { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon' };
  const h = pages.catalogPage(ix, { ...ctx, vip: false });
  const r = (id) => { const s0 = h.indexOf(`id="q${id}"`); return s0 < 0 ? '' : h.slice(s0, h.indexOf('</div>\n', s0)); };
  const sh = (id) => (/data-show="([^"]*)"/.exec(r(id)) || [])[1];
  check(r(7201).includes('Open in Special now') && sh(7201) === 'now', 'current entry: open now');
  check(r(7202).includes('This period, not this week') && !r(7202).includes('Open in Special now') && sh(7202) !== 'now', `entry outside its from/to: ${sh(7202)}`);
  check(r(7203).includes('Open in Special now') && sh(7203) === 'now', 'campaign of this week: open now');
  check(r(7204).includes('Week of Feb 1, 2016') && !r(7204).includes('Open in Special now') && sh(7204) !== 'now', `campaign of another week: ${sh(7204)}`);
  // the locked VIP banner is still in the Special tab (isLock 1): it stays under «In Special now»
  check(r(7205).includes('VIP only (locked)') && !r(7205).includes('Open in Special now') && sh(7205) === 'now', 'current VIP entry without VIP: locked');
  const hv = pages.catalogPage(ix, { ...ctx, vip: true });
  const rv = hv.slice(hv.indexOf('id="q7205"'), hv.indexOf('</div>\n', hv.indexOf('id="q7205"')));
  check(rv.includes('Open in Special now') && !rv.includes('(locked)'), 'current VIP entry with VIP: open now');
  check((h.match(/data-show="now"/g) || []).length === 3, `SHOW «In Special now»: ${(h.match(/data-show="now"/g) || []).length} rows`);
}
// polish 31-10 (user feedback): chip icons, status bars and pills, details page
{
  const sheet = html.slice(html.indexOf('id="sheet"'), html.indexOf('class="foot"'));
  const chip = (g, v) => { const box = sheet.slice(sheet.indexOf(`data-g="${g}"`)); const s0 = box.indexOf(`data-v="${v}"`); return s0 < 0 ? '' : box.slice(box.lastIndexOf('<button', s0), box.indexOf('</button>', s0)); };
  const TYPE_ICON = { weekday: 'weekday', daily: 'daily', vip: 'vip', mog: 'mog', skill: 'skill', camp: 'camp' };
  for (const [v, k] of Object.entries(TYPE_ICON)) check(chip('type', v).includes(`/web/special/icon/${k}.png`), `TYPE chip ${v}: icon ${k}`);
  const SHOW_ICON = { can: 'pin', now: 'now', kept: 'pin', replaced: 'replaced', removed: 'removed', later: 'later' };
  for (const [v, k] of Object.entries(SHOW_ICON)) check(chip('show', v).includes(`/web/special/icon/${k}.png`) && chip('show', v).includes(`st-${v}`), `SHOW chip ${v}: icon ${k}, class st-${v}`);
  check(!/\p{Extended_Pictographic}/u.test(sheet.replace(/<div class="search">[\s\S]*?<\/div>/, '')), 'no emoji in the chips');
  check(!html.includes('📌'), 'no pin emoji in the page');
  check(/\.o\.st-now\.on\{[^}]*#2e9e3e/.test(html) && /\.o\.st-kept\.on\{[^}]*#b8860b/.test(html) && /\.o\.st-can\.on\{[^}]*#1a6fa8/.test(html), 'SHOW chips coloured like the pills');
  check((pages.SPECIAL_ICON_KEYS || []).join() === 'weekday,daily,vip,mog,skill,camp,lock,removed,pin,replaced,later,now,medal,avatar,jewel,material', `icon keys ${pages.SPECIAL_ICON_KEYS}`);
  const cls = (id) => { const s0 = html.indexOf(`id="q${id}"`); return (/class="([^"]*)"/.exec(html.slice(html.lastIndexOf('<div', s0), s0 + 200)) || [])[1]; };
  check(cls(7101) === 'q pinned' && cls(7102) === 'q can' && cls(7103) === 'q off' && cls(7104) === 'q off' && cls(7105) === 'q off' && cls(7108) === 'q now', `row classes ${[7101, 7102, 7103, 7104, 7105, 7108].map(cls)}`);
  check(row(7101).includes('class="s s-pinned"') && row(7102).includes('class="s s-can"') && row(7105).includes('class="s s-off"') && row(7108).includes('class="s s-now"'), 'status pills');
  check(/\.q\{[^}]*border-left:5px solid/.test(html) && /\.q\.now\{border-left-color:#2e9e3e/.test(html) && /\.q\.pinned\{border-left-color:#b8860b/.test(html) && /\.q\.can\{border-left-color:#1a6fa8/.test(html), 'side bars');
  check(/\.q\.off \.im img\{[^}]*opacity/.test(html) && /\.q\.locked \.im img\{[^}]*opacity/.test(html), 'dimmed banners');
  check(row(7102).includes('href="/web/special/detail/7102?from=catalog"') && (row(7102).match(/\/web\/special\/detail\/7102/g) || []).length === 2, 'banner and name open the details');
  const ix = { catalog: { evStageId: 7000 }, entries: [e('vipnow', 7205, { periods: [4], vip: true, days: 'all', family: 'SQ22' })] };
  const hl = pages.catalogPage(ix, { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon', vip: false });
  check(/class="q locked"/.test(hl) && hl.includes('class="s s-locked"') && hl.includes('/web/special/icon/lock.png'), 'VIP locked: grey bar, padlock pill');
  // details page
  const stageInfo = (sid) => (sid === 71020 ? { objectives: [{ text: 'Defeat Shadow x 3', reward: 'Cid Ver. B x1' }, { text: 'Complete without having to continue', reward: 'Munny x100' }] } : null);
  const dn = { ...names, stage: stageInfo };
  const ctxD = { period: 4, pinnedKey: 'kb', vip: false, periods: PERIODS, names: dn, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon', fromCatalog: true };
  const ix2 = { catalog: { evStageId: 7000 }, entries: [...index.entries.slice(0, 1),
    e('kb2', 7102, { periods: [1, 2], family: 'SQ13', useAp: [12], stages: [{ stageId: 71020, quest: 'Quest Two', target: 'King Pretender', wikiLv: 80, world: 'Agrabah', room: 'Bazaar', dropRewardIds: [1] }] })] };
  const d = pages.detailPage(ix2, 7102, ctxD);
  check(typeof d === 'string' && d.includes('<title>N-kb2</title>') && d.includes('/web/special/img/v' + require('./special').SPECIAL_IMG_VERSION + '/7102.png'), 'details: title and banner');
  check(d.includes('Every day') && d.includes('Period 1') && d.includes('Period 2') && d.includes('Jan 1, 2016'), 'details: days and periods with dates');
  check(d.includes('class="s s-can"') && d.includes('data-pin="/web/special/pin/7102"') && d.includes('khuxPin') && d.includes('Replaces: N-kb'), 'details: pill and pin button');
  check(d.includes('Quest Two') && /AP[\s\S]{0,80}12/.test(d) && d.includes('80') && d.includes('King Pretender') && d.includes('Agrabah'), 'details: quest name, AP, level, target, world');
  check(d.includes('Defeat Shadow x 3') && d.includes('Cid Ver. B x1') && d.includes('Munny x100'), 'details: objectives with rewards');
  check(d.includes('Huey Ver. A') && d.includes('Mythril Shard') && /reconstructed/.test(d), 'details: drops, reconstructed note');
  check(d.includes('class="back" href="/web/special/catalog#q7102"'), 'details: BACK to the catalogue');
  check(!pages.detailPage(ix2, 7102, { ...ctxD, fromCatalog: false }).includes('class="back"'), 'details: no BACK without from=catalog');
  check(pages.detailPage(ix2, 9999, ctxD) === null && pages.detailPage(ix2, 7000, ctxD) === null, 'details: unknown id -> null');
  const dv = pages.detailPage({ catalog: { evStageId: 7000 }, entries: [e('vipq', 7106, { periods: [3], vip: true, days: ['Mon', 'Wed'], family: 'SQ22' })] }, 7106, ctxD);
  check(dv.includes('VIP only') && dv.includes('Mon, Wed'), 'details: VIP only, days');
  const st = built.stage(3);
  check(st && st.objectives.length === 2 && st.objectives[0].text === 'Defeat Huey x 2' && st.objectives[0].reward === 'Mythril x4'
    && st.objectives[1].text === 'Defeat the Huey within 1 turn' && st.objectives[1].reward === 'Avatar Coin x5', `buildNames.stage ${JSON.stringify(st)}`);
}
// round 2: the catalogue lists every Daily Cid variant; only today's is «In Special now», the others say their day
{
  const ix = { catalog: { evStageId: 7000 }, entries: ['Mon', 'Tue'].map((d, i) => e('cid-' + d, 7501 + i, { periods: [4], days: [d], family: 'SQ12', resetGroup: 'cid' })) };
  const h = pages.catalogPage(ix, { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon', vip: true });
  const r = (id) => { const s0 = h.indexOf(`id="q${id}"`); return s0 < 0 ? '' : h.slice(s0, h.indexOf('</div>'+String.fromCharCode(10), s0)); };
  check(r(7501).includes('data-show="now"') && r(7501).includes('Open in Special now'), 'Cid of today: now');
  check(r(7502).includes('data-show="other"') && r(7502).includes('Listed on Tue only') && !r(7502).includes('Open in Special now'), `Cid of another day: ${r(7502).slice(0, 300)}`);
}
// round 3 (bench rev 220): an entry is listed under EVERY period it belongs to; «All» shows each entry once
{
  const sec = (h, n) => { const a = h.indexOf(`<div class="sec" data-p="${n}">`); const b = h.indexOf('<div class="sec"', a + 10); return h.slice(a, b < 0 ? h.indexOf('<div class="ov"') : b); };
  const rowsIn = (h, n) => (sec(h, n).match(/<div class="q /g) || []).length;
  // fixture: kb [2], kb2 [1], repl [1,2], gone [1], later [5], vipq [3], cid [2], camp [3,4]
  check(rowsIn(html, 1) === 3 && rowsIn(html, 2) === 3 && rowsIn(html, 3) === 2 && rowsIn(html, 4) === 1 && rowsIn(html, 5) === 1,
    `rows per period section: ${[1, 2, 3, 4, 5].map((n) => rowsIn(html, n))}`);
  check(html.includes('id="tc2">3<') && html.includes('id="tc3">2<') && html.includes('id="tc4">1<') && html.includes('id="tcall">8<'), 'tab counts per period (entries in that period), All unique');
  check((html.match(/data-first="1"/g) || []).length === 8, `one first row per entry: ${(html.match(/data-first="1"/g) || []).length}`);
  check((html.match(/ id="q7103"/g) || []).length === 1 && html.includes('id="q7103-p2"'), 'unique element ids for repeated rows');
  check(/data-eid="7103"[^>]*data-period="2"|data-period="2"[^>]*data-eid="7103"/.test(html), 'repeated row carries the entry id');
  check(sec(html, 2).includes('Replaced by N-kb') && sec(html, 1).includes('Replaced by N-kb'), 'same status in every section');
  check(/if\(s\.p==='all'&&!r\.f\)return false/.test(html), 'All tab: first rows only');
  // real counts of the local index (bench 31-10: 33 / 113 / 64 / 23 / 19)
  let real = null; try { real = require('./game_data/special.json'); } catch { /* no local index */ }
  if (real) {
    const sp = require('./special');
    const h = pages.catalogPage(real, { period: 4, pinnedKey: '', periods: sp.PERIODS, shopFrom: '2020-06-01', shopTo: '2020-06-07', weekday: 'Mon' });
    const want = sp.PERIODS.map((p) => real.entries.filter((en) => en.periods && !en.training && en.periods.includes(p.n)).length);
    // round 7: entries sharing a banner are one row; the members of the rows of a section add up to its entries
    const secOf = (n) => { const a = h.indexOf(`<div class="sec" data-p="${n}">`); const b = h.indexOf('<div class="sec"', a + 10); return h.slice(a, b < 0 ? h.indexOf('<div class="ov"') : b); };
    const members = sp.PERIODS.map((p) => (secOf(p.n).match(/ data-n="(\d+)"/g) || []).reduce((t, m) => t + +/\d+/.exec(m)[0], 0));
    const rowsN = sp.PERIODS.map((p) => (secOf(p.n).match(/<div class="q /g) || []).length);
    const got = sp.PERIODS.map((p) => +(new RegExp(`id="tc${p.n}">(\\d+)<`).exec(h) || [])[1]);
    check(members.join() === want.join() && got.join() === rowsN.join() && got[3] > 3 && got[1] < want[1], `real sections: members ${members} (want ${want}), tabs ${got} = rows ${rowsN}`);
  }
}
// round 3 (b): «Replaced by» with the same name says what tells them apart
{
  const ix = { catalog: { evStageId: 7000 }, entries: [
    e('cid-vip-mon', 7030, { name: 'Daily Challenge: Cid (Monday)', periods: [1, 2], vip: true, days: ['Mon'], family: 'SQ12', replacedBy: 'cid-mon', to: '2017-04-19' }),
    e('cid-mon', 7001, { name: 'Daily Challenge: Cid (Monday)', periods: [2, 3, 4], days: ['Mon'], family: 'SQ12', from: '2017-04-20' }),
    e('other', 7002, { name: 'Other', periods: [1], replacedBy: 'newer' }),
    e('newer', 7003, { name: 'Newer', periods: [3] }),
  ] };
  const h = pages.catalogPage(ix, { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon' });
  check(h.includes('Replaced by Daily Challenge: Cid (Monday) — free from Apr 20, 2017'), 'same name: «— free from <date>»');
  check(h.includes('Replaced by Newer<') || h.includes('Replaced by Newer</'), 'different name: plain «Replaced by»');
  const ix2 = { catalog: { evStageId: 7000 }, entries: [e('a', 7010, { name: 'Same', periods: [1], replacedBy: 'b' }), e('b', 7011, { name: 'Same', periods: [3] })] };
  check(pages.catalogPage(ix2, { period: 4, periods: PERIODS }).includes('Replaced by Same — from Period 3'), 'same name, no date: first period name');
}
// round 4 (bench k5): «Replaced by» only for an entry already in the past (its last period before the current one);
// a replaced entry of the current period has the normal current status
{
  const ix = { catalog: { evStageId: 7000 }, entries: [
    e('cid-tue', 7601, { name: 'Cid (Tuesday)', periods: [2, 3, 4], days: ['Tue'], family: 'SQ12', resetGroup: 'cid', replacedBy: 'dwq' }),
    e('cid-wed', 7602, { name: 'Cid (Wednesday)', periods: [2, 3, 4], days: ['Wed'], family: 'SQ12', resetGroup: 'cid', replacedBy: 'dwq' }),
    e('dwq', 7603, { name: 'Day of the Weekly Quest', periods: [5], days: ['Tue'] }),
  ] };
  const ctx4 = { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Tue', vip: false };
  const h4 = pages.catalogPage(ix, ctx4), h5 = pages.catalogPage(ix, { ...ctx4, period: 5 });
  const r = (h, id) => { const s0 = h.indexOf(`id="q${id}"`); return s0 < 0 ? '' : h.slice(s0, h.indexOf('</div>' + String.fromCharCode(10), s0)); };
  check(r(h4, 7601).includes('data-show="now"') && r(h4, 7601).includes('Open in Special now') && !r(h4, 7601).includes('Replaced by'), `current replaced entry, today: ${r(h4, 7601).slice(0, 200)}`);
  check(r(h4, 7602).includes('data-show="other"') && r(h4, 7602).includes('Listed on Wed only') && !r(h4, 7602).includes('Replaced by'), 'current replaced entry, other day: listed on its day');
  check(r(h5, 7601).includes('data-show="replaced"') && r(h5, 7601).includes('Replaced by Day of the Weekly Quest'), 'past replaced entry: replaced');
  const d4 = pages.detailPage(ix, 7601, ctx4);
  check(d4.includes('s-now') && !d4.includes('Replaced by'), 'details: current replaced entry not «replaced»');
}
// round 5: «later» rows name the Story quest that unlocks them (ctx.unlockQuestOf, built by server.js)
{
  const ix = { catalog: { evStageId: 7000 }, entries: [e('l5', 7701, { periods: [5] }), e('l9', 7702, { periods: [5], name: 'Never' })] };
  const ctxU = { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon', unlockQuestOf: (en) => (en.key === 'l5' ? 946 : null) };
  const h = pages.catalogPage(ix, ctxU);
  const r = (id) => { const s0 = h.indexOf(`id="q${id}"`); return s0 < 0 ? '' : h.slice(s0, h.indexOf('</div>' + String.fromCharCode(10), s0)); };
  check(r(7701).includes('Unlocks at Story Quest 946') && r(7701).includes('data-show="later"'), 'later row: unlocking quest');
  check(r(7702).includes('Not reached in this version of the Story') && r(7702).includes('data-show="later"'), 'later row never reached');
  const d = pages.detailPage(ix, 7701, ctxU);
  check(d.includes('Unlocks at Story Quest 946') && d.includes('Story Quest 946'), 'details: unlocking quest');
  check(pages.catalogPage(ix, { ...ctxU, unlockQuestOf: undefined }).includes('Reached later in the Story'), 'no lookup: generic text');
}
// round 7: entries of a section sharing a banner are one group row with day / variant chips; REWARDS filter
{
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const ix = { catalog: { evStageId: 7000 }, entries: [
    ...DAYS.map((d, i) => e('cid-' + d, 7801 + i, { name: `Daily Challenge: Cid (${FULL[i]})`, periods: [2, 3, 4], days: [d], family: 'SQ12', resetGroup: 'cid', banner: 'cid.png' })),
    e('mat', 7811, { name: 'VIP! Materials', periods: [4, 5], vip: true, family: 'SQ23', banner: 'mat.png' }),
    e('mat2', 7812, { name: 'VIP! Materials 2', periods: [4, 5], vip: true, family: 'SQ23', banner: 'mat.png' }),
    e('exp', 7813, { name: 'EXP Medals', periods: [4], days: ['Tue'], banner: 'exp.png', stages: [{ quest: 'EXP', dropRewardIds: [1] }] }),
    e('ava', 7814, { name: 'VIP! Jewels & Avatar Parts', periods: [4], vip: true, family: 'SQ22', banner: 'ava.png', stageIds: [78140] }),
    e('old1', 7815, { name: 'Old Quest', periods: [1], days: ['Mon'], banner: 'old.png' }),
    e('old2', 7816, { name: 'Old Quest 2', periods: [1], days: ['Mon'], banner: 'old.png' }),
  ] };
  const nm = { drop: (rid) => (rid === 1 ? ['Huey', 'Mythril'] : []), objective: () => [],
    dropTypes: (rid) => (rid === 1 ? [3, 5] : []), objectiveTypes: (sid) => (sid === 78140 ? [2, 20, 20] : []) };
  const h = pages.catalogPage(ix, { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Tue', vip: true, names: nm });
  const secOf = (n) => { const a = h.indexOf(`<div class="sec" data-p="${n}">`); const b = h.indexOf('<div class="sec"', a + 10); return h.slice(a, b < 0 ? h.indexOf('<div class="ov"') : b); };
  const rowsOf = (n) => secOf(n).split('<div class="q ').slice(1);
  const cidRow = rowsOf(4).find((r) => r.includes('Daily Challenge: Cid'));
  check(rowsOf(4).filter((r) => r.includes('Daily Challenge: Cid')).length === 1 && cidRow, 'Cid days: one row in the period');
  const chips = (r) => (r.match(/<a class="ch [^"]*"[^>]*>/g) || []);
  check(chips(cidRow).length === 7, `Cid row: 7 chips (${chips(cidRow).length})`);
  check(cidRow.includes('>Daily Challenge: Cid<') && !/>Daily Challenge: Cid \(/.test(cidRow), 'family title without the day');
  const chip = (r, id) => chips(r).find((c) => c.includes(`data-eid="${id}"`)) || '';
  check(/class="ch c-now"/.test(chip(cidRow, 7802)) && /class="ch c-other"/.test(chip(cidRow, 7801)) && /class="ch c-other"/.test(chip(cidRow, 7807)), `chip statuses: ${chip(cidRow, 7802)} ${chip(cidRow, 7801)}`);
  check(chip(cidRow, 7802).includes('href="/web/special/detail/7802?from=catalog"'), 'chip opens the details');
  check(cidRow.includes('>Tue<') && cidRow.includes('>Sun<'), 'chip labels: days');
  check(cidRow.includes('class="s s-now"') && cidRow.startsWith('now'), 'group pill and bar: best member (now)');
  check(cidRow.includes(' data-n="7"') && cidRow.includes('7 days'), 'group: 7 members, «7 days» line');
  check(/data-show="[^"]*\bnow\b[^"]*\bother\b|data-show="[^"]*\bother\b[^"]*\bnow\b/.test(cidRow), 'group data-show lists the member statuses');
  // ids: anchors q<id> once each (first period of the member), group rows with their own ids
  check((h.match(/ id="q7802"/g) || []).length === 1 && secOf(2).includes('id="q7802"'), 'chip anchor q<id> in the first period only');
  const ids = (h.match(/ id="[^"]+"/g) || []); check(ids.length === new Set(ids).size, 'unique element ids');
  const matRow = rowsOf(4).find((r) => r.includes('VIP! Materials'));
  check(rowsOf(4).filter((r) => r.includes('VIP! Materials')).length === 1 && chips(matRow).length === 2 && matRow.includes('>1<') && matRow.includes('>2<') && matRow.includes('2 variants'), 'Materials 1 / 2: one row, chips 1 and 2');
  // pin button on the row only when exactly one member can be kept (Old Quest / Old Quest 2 in period 1: two -> none)
  const oldRow = rowsOf(1).find((r) => r.includes('Old Quest'));
  check(oldRow && chips(oldRow).length === 2 && !oldRow.includes('class="pk"'), 'two keepable members: pin only on the details page');
  const ix1 = { catalog: { evStageId: 7000 }, entries: [ix.entries[11], { ...ix.entries[12], periods: [1, 4] }] };
  const h1 = pages.catalogPage(ix1, { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Tue' });
  check((h1.match(/class="pk"/g) || []).length === 1 && h1.includes('data-pin="/web/special/pin/7815"'), 'one keepable member: its pin button on the row');
  // REWARDS
  const reward = (id) => (new RegExp(`data-eid="${id}"[^>]*data-reward="([^"]*)"`).exec(h) || [])[1] || '';
  check(reward(7813).split(' ').includes('medal') && reward(7813).split(' ').includes('material'), `EXP quest: medals and materials (${reward(7813)})`);
  check(reward(7814).split(' ').includes('avatar') && reward(7814).split(' ').includes('jewel') && !reward(7814).includes('medal'), `avatar VIP quest: avatar parts, jewels (${reward(7814)})`);
  const sheet = h.slice(h.indexOf('id="sheet"'), h.indexOf('class="foot"'));
  check(sheet.includes('REWARDS') && sheet.includes('data-g="reward"') && ['medal', 'avatar', 'jewel', 'material'].every((k) => sheet.includes(`data-v="${k}"`) && sheet.includes(`/web/special/icon/${k}.png`)), 'REWARDS chips with icons');
  check(/r\.rw/.test(h) && /cur\.reward|s\.reward/.test(h), 'script filters by reward');
  const bn = pages.buildNames((n) => ({ reward: [{ rewardId: 5, type: [3, 5, 2], id: [9, 8, 0] }], stage: [{ stageId: 3, submissionRewardType: [20, 14, 0], submissionItemId: [1, 0, 0] }] }[n] || []));
  check(bn.dropTypes(5).join() === '3,5,2' && bn.objectiveTypes(3).join() === '20,14' && bn.dropTypes(99).length === 0, 'buildNames reward types');
}
if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('test-special-pages: OK');
