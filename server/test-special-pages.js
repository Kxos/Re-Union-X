// Special catalogue page test: node server/test-special-pages.js
'use strict';
const pages = require('./special-pages');
const special = require('./special');
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
// round 13: the row (quest or campaign) that holds the element id="q<id>"
function itemOf(h, id) { const s0 = h.indexOf(`id="q${id}"`); if (s0 < 0) return ''; const a = h.lastIndexOf('<div class="row', s0); return h.slice(a, h.indexOf('</div>' + String.fromCharCode(10), s0)); }
check(!/class="(tl|tp|vr|vc)[ "]/.test(html), 'no timeline or version chips in the list (round 13)');
check(/Period 4[\s\S]{0,200}Now/.test(html) && (html.match(/>Now</g) || []).length === 1, 'current period marked Now once');
const row = (id) => itemOf(html, id);
check(row(7105) && !row(7105).includes('data-pin') && row(7105).includes('Reached later in the Story'), 'later: no pin, text');
check(row(7103).includes('Replaced by N-kb') && !row(7103).includes('data-pin'), 'replaced');
check(row(7104).includes('>Not restored<') && !row(7104).includes('data-pin'), 'removed');
check(row(7101).includes('Remove from Special') && row(7101).includes('data-pin="/web/special/unpin"'), 'pinned');
check(row(7102).includes('Keep in Special') && row(7102).includes('/web/special/icon/pin.png') && row(7102).includes('Replaces: N-kb') && row(7102).includes('data-pin="/web/special/pin/7102"'), 'pinnable');
check(row(7101).includes('/web/special/img/v' + require('./special').SPECIAL_IMG_VERSION + '/7101.png'), 'image');
// Task 13: tabs, filters sheet, data attributes, half-size banners
check(html.includes('class="tab on" data-p="all"'), 'All tab default');
for (const p of PERIODS) check(html.includes('data-p="' + p.n + '"') && html.includes('id="tc' + p.n + '"'), 'tab ' + p.n);
check(html.includes('id="tc1">3<') && html.includes('id="tcall">8<'), 'tab counts (3 in period 1, 8 total)');
const attr = (id, a) => { const r = row(id), m = new RegExp(a + '="([^"]*)"').exec(r.slice(0, r.indexOf('>') + 1)); return m ? m[1] : null; };
for (const id of [7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108]) check(['data-periods', 'data-type', 'data-show', 'data-search'].every((a) => attr(id, a) !== null), 'row attrs ' + id);
check(attr(7106, 'data-type').split(' ').includes('vip'), 'VIP');
check(attr(7102, 'data-search').toLowerCase().includes('huey') && attr(7102, 'data-search').toLowerCase().includes('mythril') && attr(7102, 'data-search').toLowerCase().includes('quest two'), 'search has drop names');
check(attr(7107, 'data-search') === 'N-cid', 'search plain name (as written)');
check(attr(7102, 'data-periods') === '1' && attr(7101, 'data-periods') === '2' && attr(7103, 'data-periods') === '1 2', 'data-periods');
check(attr(7107, 'data-type') === 'daily' && attr(7106, 'data-type').split(' ').includes('vip') && attr(7108, 'data-type') === 'camp' && attr(7101, 'data-type') === 'weekday', 'types');
check(attr(7101, 'data-show') === 'kept' && attr(7102, 'data-show') === 'can' && attr(7103, 'data-show') === 'replaced' && attr(7104, 'data-show') === 'removed' && attr(7105, 'data-show') === 'later' && attr(7106, 'data-show') === 'can' && attr(7108, 'data-show') === 'now', 'shows');
check(html.includes('id="sum"') && html.includes('>7 quests</span> · 1 campaign · all periods, no filters') && html.includes('id="fbtn"'), 'summary and filters button');
check(html.includes('id="sheet"') && html.includes('data-g="type"') && html.includes('data-g="show"') && html.includes('id="fq"') && html.includes('id="freset"') && html.includes('id="fok"'), 'filters sheet');
check(html.includes('FIND') && html.includes('TYPE') && html.includes('SHOW') && html.includes('Daily Cid') && html.includes('Later in the Story'), 'sheet groups');
check(row(7102).includes('width="320"') && row(7102).includes('height="70"') && html.includes('.im{'), 'half-size banner');
const rowFor = (id) => row(id).includes('khuxClick');
check(rowFor(7102) && rowFor(7101), 'pin buttons kept');
const nonames = pages.catalogPage(index, { period: 4, pinnedKey: '', periods: PERIODS });
check(nonames.includes('data-search="N-kb2 | Quest Two"'), 'works without names');
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
  const r = (id) => itemOf(h, id);
  const sh = (id) => (/data-show="([^"]*)"/.exec(r(id)) || [])[1];
  check(r(7201).includes('Open today') && sh(7201) === 'now', 'current entry: open now');
  check(r(7202).includes('This period, not this week') && !r(7202).includes('Open today') && sh(7202) !== 'now', `entry outside its from/to: ${sh(7202)}`);
  check(r(7203).includes('This week · VIP only — locked') && sh(7203) === 'now', 'campaign of this week: in the tab (VIP)');
  check(r(7204).includes('Coming in February 2016') && !r(7204).includes('This week') && sh(7204) !== 'now', `campaign of another week: ${sh(7204)}`);
  // the locked VIP banner is still in the Special tab (isLock 1): it stays under «In Special now»
  check(r(7205).includes('VIP only — locked') && !r(7205).includes('Open today') && sh(7205) === 'now', 'current VIP entry without VIP: locked');
  const hv = pages.catalogPage(ix, { ...ctx, vip: true });
  const rv = itemOf(hv, 7205);
  check(rv.includes('Open today') && !rv.includes('locked'), 'current VIP entry with VIP: open now');
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
  check((pages.SPECIAL_ICON_KEYS || []).join() === 'weekday,daily,vip,mog,skill,camp,lock,removed,pin,replaced,later,now,medal,avatar,jewel,material,unlocked', `icon keys ${pages.SPECIAL_ICON_KEYS}`);
  const cls = (id) => (/class="([^"]*)"/.exec(itemOf(html, id)) || [])[1];
  check(cls(7101) === 'row pinned' && cls(7102) === 'row can' && cls(7103) === 'row off' && cls(7104) === 'row off' && cls(7105) === 'row off' && cls(7108) === 'row cr locked', `row classes ${[7101, 7102, 7103, 7104, 7105, 7108].map(cls)}`);
  check(row(7101).includes('class="s s-pinned"') && row(7102).includes('class="s s-can"') && row(7105).includes('class="s s-off"') && row(7108).includes('class="s s-locked"'), 'status pills');
  check(/\.row\{[^}]*border-left:5px solid/.test(html) && /\.row\.now\{border-left-color:#2e9e3e/.test(html) && /\.row\.pinned\{border-left-color:#b8860b/.test(html) && /\.row\.can\{border-left-color:#1a6fa8/.test(html), 'side bars');
  check(/\.row\.off \.im img,\.row\.off \.th img\{[^}]*opacity/.test(html) && /\.row\.locked \.im img\{[^}]*opacity/.test(html), 'dimmed banners');
  check(row(7102).includes('href="/web/special/quest/7102?from=catalog"') && (row(7102).match(/ href="\/web\/special\/quest\/7102/g) || []).length === 3, 'banner, name and «›» open the details');
  const ix = { catalog: { evStageId: 7000 }, entries: [e('vipnow', 7205, { periods: [4], vip: true, days: 'all', family: 'SQ22' })] };
  const hl = pages.catalogPage(ix, { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon', vip: false });
  check(/class="row locked"/.test(hl) && hl.includes('class="s s-locked"') && hl.includes('/web/special/icon/lock.png'), 'VIP locked: grey bar, padlock pill');
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
  const r = (id) => itemOf(h, id);
  check(r(7501).includes('data-show="now"') && r(7501).includes('Open today'), 'Cid of today: now');
  check(r(7502).includes('data-show="other"') && r(7502).includes('Opens on Tuesday') && !r(7502).includes('Open today'), `Cid of another day: ${r(7502).slice(0, 300)}`);
}
// round 13 (user 31-10: round 12 too confusing): one minimal row per quest (banner, title, ONE status line, at most ONE
// button, «›»); versions, days and rewards on the quest's details page
{
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const ix = { catalog: { evStageId: 7000 }, entries: [
    e('vip-power', 7301, { name: 'EXP & Evolve Medals: Power', periods: [1, 2], vip: true, from: '2016-06-16', banner: 'up-power.png' }),
    e('exp-power', 7302, { name: 'EXP & Evolve Medals: Power', periods: [3, 4, 5], days: ['Tue'], banner: 'power.png' }),
    ...DAYS.map((d, i) => e('cid-vip-' + d, 7311 + i, { name: `Daily Challenge: Cid (${FULL[i]})`, periods: [1, 2], days: [d], vip: true, family: 'SQ12', resetGroup: 'cid-vip',
      from: '2016-05-19', to: '2017-04-19', replacedBy: 'cid-' + d, banner: 'vipcid.png' })),
    ...DAYS.map((d, i) => e('cid-' + d, 7321 + i, { name: `Daily Challenge: Cid (${FULL[i]})`, periods: [2, 3, 4], days: [d], family: 'SQ12', resetGroup: 'cid', from: '2017-04-20', banner: 'cid.png' })),
    e('mon', 7341, { name: 'Monday Quest', periods: [4], days: ['Mon'] }),
    e('vipq', 7342, { name: 'VIP Quest', periods: [4], vip: true, family: 'SQ22' }),
    e('kept', 7343, { name: 'Kept Quest', periods: [2] }),
    e('old', 7344, { name: 'Old Quest', periods: [1, 2] }),
    e('later', 7345, { name: 'Later Quest', periods: [5] }),
    e('repl', 7346, { name: 'Replaced Quest', periods: [1], replacedBy: 'old' }),
    e('gone', 7347, { name: 'Gone Quest', periods: [1], removed: 'no-use' }),
    e('c1', 7351, { name: 'Key Art #9 VIP Quests!', periods: [2], vip: true, campaign: { start: '2017-06-12', end: '2017-06-18' }, family: 'SQ21' }),
    e('c2', 7352, { name: 'Winter Board', periods: [4], vip: true, campaign: { start: '2019-03-04', end: '2019-03-10' }, family: 'SQ21' }),
  ] };
  const c4 = { period: 4, pinnedKey: 'kept', periods: PERIODS, shopFrom: '2019-03-04', shopTo: '2019-03-10', weekday: 'Tue', vip: false, unlockQuestOf: () => 946 };
  const h = pages.catalogPage(ix, c4);
  const rows = h.split('<div class="row').slice(1).map((x) => x.slice(0, x.indexOf('</div>' + String.fromCharCode(10))));
  const rowOf = (t) => rows.filter((x) => x.includes(`>${t}</a>`));
  const line = (x) => (/<span class="s s-[a-z]+">(?:<img[^>]*>)?([^<]*)<\/span>/.exec(x) || [])[1];
  const one = (t) => { const r = rowOf(t); return r.length === 1 ? r[0] : ''; };
  // no timeline / version / day chips in the list, one status line, at most one button, «›», one row per quest
  check(rows.length === 9 + 2, `rows: ${rows.length} (9 quests + 2 campaigns)`);
  check(rows.every((x) => !/class="(tl|tp|vr|vc|ch)[ "]/.test(x) && (x.match(/<span class="s s-/g) || []).length === 1 && (x.match(/class="pk"/g) || []).length <= 1 && x.includes('class="go"')),
    'rows: no timeline or chips, one status line, at most one button, «›»');
  check(one('EXP &amp; Evolve Medals: Power') && one('Daily Challenge: Cid'), 'one row per quest (versions and days inside)');
  // status lines (best version)
  check(line(one('EXP &amp; Evolve Medals: Power')) === 'Open today (Tue)', `open today Tue: ${line(one('EXP &amp; Evolve Medals: Power'))}`);
  check(line(one('Daily Challenge: Cid')) === 'Open today (Tue)', 'Cid: today open');
  check(line(one('Monday Quest')) === 'Opens on Monday' && one('Monday Quest').startsWith(' locked'), `opens on Monday: ${line(one('Monday Quest'))}`);
  check(line(one('VIP Quest')) === 'VIP only — locked', 'VIP only — locked');
  check(line(one('Kept Quest')) === 'Kept in Special' && one('Kept Quest').includes('Remove from Special'), 'kept + Remove');
  check(line(one('Old Quest')) === 'Old quest — can be kept' && one('Old Quest').includes('data-pin="/web/special/pin/7344"') && one('Old Quest').includes('Replaces: Kept Quest'), 'can be kept + Keep + Replaces');
  check(line(one('Later Quest')) === 'Unlocks at Story Quest 946', 'unlocks at Story Quest 946');
  check(line(one('Replaced Quest')) === 'Replaced by Old Quest', 'replaced');
  check(line(one('Gone Quest')) === 'Not restored', 'not restored');
  // buttons: none where the keepable version is ambiguous or absent
  check(!one('Daily Challenge: Cid').includes('class="pk"') && !one('Monday Quest').includes('class="pk"'), 'no button without a direct action');
  check(one('EXP &amp; Evolve Medals: Power').includes('data-pin="/web/special/pin/7301"'), 'the one keepable version: Keep on the row');
  // the row opens the quest's details page (banner, title, «›», and the row itself)
  const pw = one('EXP &amp; Evolve Medals: Power');
  check((pw.match(/ href="\/web\/special\/quest\/7301\?from=catalog"/g) || []).length === 3 && pw.includes('data-href="/web/special/quest/7301?from=catalog"'), 'row links to the quest');
  check(/location\.href=attr\(r\.el,'data-href'\)/.test(h) && /if\(t\.tagName==='A'\)return/.test(h), 'script: tap on the row opens the details, links and buttons keep theirs');
  check(['7301', '7302', '7311', '7327', '7351'].every((id) => (h.match(new RegExp(` id="q${id}"`, 'g')) || []).length === 1), 'one q<id> anchor per entry (BACK)');
  const ids = (h.match(/ id="[^"]+"/g) || []); check(ids.length === new Set(ids).size, 'unique element ids');
  // campaigns: the same minimal rows in the year / month list
  const camps = h.slice(h.indexOf('id="camps"'), h.indexOf('<div class="ov"'));
  check((camps.match(/<div class="row cr /g) || []).length === 2 && camps.includes('width="320" height="70"') && !camps.includes('class="pk"'), 'campaign rows: like the quest rows, no Keep');
  check(camps.includes('Jun 12, 2017 – Jun 18, 2017') && camps.includes('>June 2017</div>') && /class="yc on" data-yr="2019"/.test(camps), 'campaign dates, month labels, the Shop week year selected');
  // tabs / summary
  check(h.includes('<span class="n1">9 quests</span> · 2 campaigns · all periods, no filters') && h.includes('id="tcall">11<') && h.includes('id="tc4">5<'), `summary and tabs: ${(/<div class="sum"[^>]*>(.*?)<\/div>/.exec(h) || [])[1]} ${(h.match(/id="tc[^"]+">\d+</g) || []).join(' ')}`);
  // the quest's details page: versions newest first, their own Keep buttons, day text
  const q = pages.detailPage(ix, 7311, { ...c4, fromCatalog: true });
  check(q && q.includes('<title>Daily Challenge: Cid</title>') && q.includes('<h1>Daily Challenge: Cid</h1>'), 'details: one page for the quest');
  const vers = (q.match(/<div class="ver [^"]*" id="v\d"><h3>[^<]*<\/h3>/g) || []).map((x) => />([^<]*)<\/h3>/.exec(x)[1]);
  check(vers.length === 2 && /^2017–\d{4} · Free$/.test(vers[0]) && vers[1] === '2016–2017 · VIP', `versions newest first: ${vers}`);
  check(q.includes('One quest per day: Mon, Tue, Wed, Thu, Fri, Sat, Sun.') && (q.match(/<div class="mem"/g) || []).length === 7, 'days as text; one line per day only where the days differ (free version), none for the all-replaced VIP version');
  check(/id="m7322"><b>Tue<\/b><span class="s s-now">/.test(q) && /id="m7321"><b>Mon<\/b><span class="s s-other">/.test(q), 'each day with its own status');
  const qp = pages.detailPage(ix, 7302, { ...c4, fromCatalog: true });
  check(qp.indexOf('2016–2017 · VIP') > qp.indexOf('2018–2020 · Free') && /id="v1"[\s\S]*data-pin="\/web\/special\/pin\/7301"/.test(qp), 'Power: the VIP version (older, second) with its own Keep');
  check(/<details class="vq" open><summary>Quests · 2018–2020 · Free<\/summary>/.test(qp) && /<details class="vq"><summary>Quests · 2016–2017 · VIP<\/summary>/.test(qp), 'quests per version, newest open');
  check(qp.includes('class="back" href="/web/special/catalog#q7302"'), 'BACK to the row');
  check(pages.detailPage(ix, 7351, c4).includes('Week of Jun 12, 2017'), 'campaign details: its week');
  // REWARDS on rows
  const nm = { drop: (rid) => (rid === 1 ? ['Huey', 'Mythril'] : []), objective: () => [],
    dropTypes: (rid) => (rid === 1 ? [3, 5] : []), objectiveTypes: (sid) => (sid === 78140 ? [2, 20, 20] : []) };
  const hr = pages.catalogPage({ catalog: { evStageId: 7000 }, entries: [
    e('exp', 7813, { name: 'EXP Medals', periods: [4], days: ['Tue'], stages: [{ quest: 'EXP', dropRewardIds: [1] }] }),
    e('ava', 7814, { name: 'VIP! Jewels & Avatar Parts', periods: [4], vip: true, family: 'SQ22', stageIds: [78140] }),
  ] }, { ...c4, names: nm });
  const reward = (id) => (/data-reward="([^"]*)"/.exec(itemOf(hr, id)) || [])[1] || '';
  check(reward(7813).split(' ').includes('medal') && reward(7813).split(' ').includes('material'), `EXP quest: medals and materials (${reward(7813)})`);
  check(reward(7814).split(' ').includes('avatar') && reward(7814).split(' ').includes('jewel') && !reward(7814).includes('medal'), `avatar VIP quest: avatar parts, jewels (${reward(7814)})`);
  const sheet = hr.slice(hr.indexOf('id="sheet"'), hr.indexOf('class="foot"'));
  check(sheet.includes('REWARDS') && ['medal', 'avatar', 'jewel', 'material'].every((k) => sheet.includes(`data-v="${k}"`) && sheet.includes(`/web/special/icon/${k}.png`)), 'REWARDS chips with icons');
  check(/r\.rw/.test(hr) && /s\.reward/.test(hr), 'script filters by reward');
  const bn = pages.buildNames((n) => ({ reward: [{ rewardId: 5, type: [3, 5, 2], id: [9, 8, 0] }], stage: [{ stageId: 3, submissionRewardType: [20, 14, 0], submissionItemId: [1, 0, 0] }] }[n] || []));
  check(bn.dropTypes(5).join() === '3,5,2' && bn.objectiveTypes(3).join() === '20,14' && bn.dropTypes(99).length === 0, 'buildNames reward types');
  // real local index: 40 quest rows, 120 campaign rows
  let real = null; try { real = require('./game_data/special.json'); } catch { /* no local index */ }
  if (real) {
    const sp = require('./special');
    const hh = pages.catalogPage(real, { period: 4, pinnedKey: '', periods: sp.PERIODS, shopFrom: '2020-06-01', shopTo: '2020-06-07', weekday: 'Tue' });
    const nCamp = real.entries.filter((en) => en.campaign).length;
    const fams = new Set(real.entries.filter((en) => !en.campaign && en.periods).map((en) => en.name.replace(/\s*\((?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\)\s*$/, '').replace(/\s+\d+$/, '')));
    const crs = hh.split('<div class="row cr ').slice(1);
    check(nCamp === 120 && crs.length < nCamp && crs.reduce((t, x) => t + +(/data-nv="(\d+)"/.exec(x) || [0, 0])[1], 0) === nCamp, `real campaigns: ${crs.length} rows for ${nCamp} weeks`);
    check((hh.match(/<div class="row (?!cr )/g) || []).length === fams.size, `real quest rows ${(hh.match(/<div class="row (?!cr )/g) || []).length} = families ${fams.size}`);
    const realIds = (hh.match(/ id="[^"]+"/g) || []); check(realIds.length === new Set(realIds).size, 'real page: unique ids');
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
    e('cid-tue', 7601, { name: 'Cid T', periods: [2, 3, 4], days: ['Tue'], family: 'SQ12', resetGroup: 'cid', replacedBy: 'dwq' }),
    e('cid-wed', 7602, { name: 'Cid W', periods: [2, 3, 4], days: ['Wed'], family: 'SQ12', resetGroup: 'cid', replacedBy: 'dwq' }),
    e('dwq', 7603, { name: 'Day of the Weekly Quest', periods: [5], days: ['Tue'] }),
  ] };
  const ctx4 = { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Tue', vip: false };
  const h4 = pages.catalogPage(ix, ctx4), h5 = pages.catalogPage(ix, { ...ctx4, period: 5 });
  const r = (h, id) => itemOf(h, id);
  check(r(h4, 7601).includes('data-show="now"') && r(h4, 7601).includes('Open today') && !r(h4, 7601).includes('Replaced by'), `current replaced entry, today: ${r(h4, 7601).slice(0, 200)}`);
  check(r(h4, 7602).includes('data-show="other"') && r(h4, 7602).includes('Opens on Wednesday') && !r(h4, 7602).includes('Replaced by'), 'current replaced entry, other day: listed on its day');
  check(r(h5, 7601).includes('data-show="replaced"') && r(h5, 7601).includes('Replaced by Day of the Weekly Quest'), 'past replaced entry: replaced');
  const d4 = pages.detailPage(ix, 7601, ctx4);
  check(d4.includes('s-now') && !d4.includes('Replaced by'), 'details: current replaced entry not «replaced»');
}
// round 5: «later» rows name the Story quest that unlocks them (ctx.unlockQuestOf, built by server.js)
{
  const ix = { catalog: { evStageId: 7000 }, entries: [e('l5', 7701, { periods: [5] }), e('l9', 7702, { periods: [5], name: 'Never' })] };
  const ctxU = { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon', unlockQuestOf: (en) => (en.key === 'l5' ? 946 : null) };
  const h = pages.catalogPage(ix, ctxU);
  const r = (id) => itemOf(h, id);
  check(r(7701).includes('Unlocks at Story Quest 946') && r(7701).includes('data-show="later"'), 'later row: unlocking quest');
  check(r(7702).includes('Not reached in this version of the Story') && r(7702).includes('data-show="later"'), 'later row never reached');
  const d = pages.detailPage(ix, 7701, ctxU);
  check(d.includes('Unlocks at Story Quest 946') && d.includes('Story Quest 946'), 'details: unlocking quest');
  check(pages.catalogPage(ix, { ...ctxU, unlockQuestOf: undefined }).includes('Reached later in the Story'), 'no lookup: generic text');
}
// round 8: a current weekday quest on another day follows the Special tab (special.lockOf): locked today, or open with VIP
{
  const ix = { catalog: { evStageId: 7000 }, entries: [
    e('mon', 7901, { name: 'Mon Quest', periods: [4], days: ['Mon'] }),
    e('tue', 7902, { name: 'Tue Quest', periods: [4], days: ['Tue'] }),
    e('mw', 7903, { name: 'MW Quest', periods: [4], days: ['Mon', 'Wed'] }),
    e('g1', 7904, { name: 'Fam (Monday)', periods: [4], days: ['Mon'], banner: 'fam.png' }),
    e('g2', 7905, { name: 'Fam (Wednesday)', periods: [4], days: ['Wed'], banner: 'fam.png' }),
  ] };
  const c = { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Tue' };
  const h = pages.catalogPage(ix, { ...c, vip: false }), hv = pages.catalogPage(ix, { ...c, vip: true });
  const r = (hh, id) => itemOf(hh, id);
  check(r(h, 7901).includes('Opens on Monday') && r(h, 7901).includes('class="s s-locked"') && r(h, 7901).includes('/web/special/icon/lock.png')
    && r(h, 7901).includes('data-show="now"') && !r(h, 7901).includes('Open today'), `Mon quest on Tue without VIP: ${r(h, 7901).slice(0, 160)}`);
  check(/class="row locked"/.test(r(h, 7901)), 'grey bar');
  check(r(h, 7903).includes('Opens on Mon, Wed'), 'two days');
  check(r(hv, 7901).includes('Open today with VIP') && r(hv, 7901).includes('/web/special/icon/vip.png') && /class="row vipnow"/.test(r(hv, 7901)) && r(hv, 7901).includes('data-show="now"'), 'Mon quest on Tue with VIP');
  check(r(h, 7902).includes('Open today (Tue)') && r(hv, 7902).includes('Open today (Tue)'), 'own day: open');
  const grp = itemOf(h, 7904);
  check(/data-mcls="locked locked"/.test(grp) && grp.includes('class="s s-locked"'), `group chips locked today: ${grp.slice(0, 200)}`);
  const d = pages.detailPage(ix, 7901, { ...c, vip: false });
  check(d.includes('Opens on Monday') && !d.includes('Open today'), 'details page');
}
// round 9 (+ ruling: a kept member takes over the group row): one rank for the group's best member, on the server and in the page script (regroup after a pin)
{
  const rk = pages.khuxRank, page = new Function(`${pages.RANK_JS};return khuxRank;`)();
  const cases = [['now', 'now'], ['now', 'vipnow'], ['now', 'locked'], ['kept', 'pinned'], ['can', 'can'], ['other', 'other'], ['replaced', 'off'], ['later', 'off'], ['removed', 'off']];
  check(cases.every(([a, b]) => rk(a, b) === page(a, b)), 'same rank in node and in the page');
  check(cases.every((c, i) => i === 0 || rk(...cases[i - 1]) < rk(...c)), `rank order ${cases.map((c) => rk(...c))}`);
  const ix = { catalog: { evStageId: 7000 }, entries: [
    e('o1', 7951, { name: 'Old (Monday)', periods: [1], days: ['Mon'], banner: 'old.png' }),
    e('o2', 7952, { name: 'Old (Tuesday)', periods: [1, 4], days: ['Tue'], banner: 'old.png' }),
    e('kp', 7953, { name: 'Kept One', periods: [2] }),
  ] };
  const h = pages.catalogPage(ix, { period: 4, pinnedKey: 'kp', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Tue' });
  const g = itemOf(h, 7951);
  check(g.includes('<div class="rp">Replaces: Kept One</div>') && g.indexOf('class="rp"') < g.indexOf('class="pk"'), 'group with one keepable member: «Replaces» before its pin button');
  check(/data-mcls="can [a-z]+"/.test(g) && /data-mpill="[^"]*Old quest/.test(g), 'rows carry the status class and line of every entry');
  check(h.includes('function khuxRank(') && h.includes('function paint(') && h.includes('khuxRank(r.ss[j],r.mc[j])'), 'page script: rank, regroup, chip icons');
}
// round 11: FIND matches at word starts, item name by item name (khuxMatch, shared with the page)
{
  const m = pages.khuxMatch, page = new Function(`${pages.MATCH_JS};return khuxMatch;`)();
  const cases = [['key', 'Fantasia Mickey Ver. A', false], ['key', 'Key Art #3', true], ['key', 'Keyblade Materials', true],
    ['key art', 'Key Art #19', true], ['key art', 'Keyblade Materials: Olympia', false], ['key', 'Monkey', false],
    ['KEY  art', 'key art #19', true], ['#19', 'Key Art #19', true], ['art #1', 'Key Art #19', true], ['olympia', 'Keyblade Materials: Olympia', true],
    ["donald's", "Donald's Hat", true], ['', 'anything', true]];
  for (const [q, n, want] of cases) check(m(q, n) === want && page(q, n) === want, `khuxMatch(${q}, ${n}) = ${m(q, n)} (want ${want})`);
  check(h0().includes('function khuxMatch(') && /split\(' \| '\)/.test(h0()), 'page script matches per item name');
  check(h0().includes('class="mt"') && h0().includes('Matches') && h0().includes('id="none"') && h0().includes('No quests match'), '«Matches:» line and «No quests match» message');
}
function h0() { return html; }
// round 14 (user 31-10): VIP campaigns in the same minimal rows; weeks with the same art merged; a year selector
{
  const ix = { catalog: { evStageId: 7000 }, entries: [
    e('ka9', 7401, { name: 'Key Art #9 VIP Quests!', periods: [2], vip: true, family: 'SQ21', campaign: { start: '2017-06-12', end: '2017-06-18' }, banner: 'Special - VIP Key Art 9 Challenge banner KHUX.png' }),
    e('ka9b', 7402, { name: 'Key Art #9 Pt.2 & Combo VIP Quests!', periods: [2], vip: true, family: 'SQ21', campaign: { start: '2017-06-19', end: '2017-06-25' }, banner: 'Special - VIP Key Art 9 Challenge 2 banner KHUX.png' }),
    e('brooms', 7403, { name: 'VIP Magic Broom Quests!', periods: [2], vip: true, family: 'SQ21', campaign: { start: '2017-07-03', end: '2017-07-09' }, banner: 'Special - VIP Brooms banner KHUX.png' }),
    e('kept', 7404, { name: 'Kept Campaign', periods: [2], vip: true, family: 'SQ21', campaign: { start: '2016-11-07', end: '2016-11-13' }, banner: 'k.png' }),
    e('now', 7405, { name: 'This Week Campaign', periods: [4], vip: true, family: 'SQ21', campaign: { start: '2019-03-04', end: '2019-03-10' }, banner: 'n.png' }),
    e('future', 7406, { name: 'Future Campaign', periods: [5], vip: true, family: 'SQ21', campaign: { start: '2020-03-02', end: '2020-03-08' }, banner: 'f.png' }),
  ] };
  const c = { period: 4, pinnedKey: 'kept', periods: PERIODS, shopFrom: '2019-03-04', shopTo: '2019-03-10', weekday: 'Tue', vip: false, unlockQuestOf: () => 951 };
  const h = pages.catalogPage(ix, c), hv = pages.catalogPage(ix, { ...c, vip: true });
  const camps = h.slice(h.indexOf('id="camps"'), h.indexOf('<div class="ov"'));
  const rows = camps.split('<div class="row cr').slice(1).map((x) => x.slice(0, x.indexOf('</div>' + String.fromCharCode(10))));
  const line = (x) => (/<span class="s s-[a-z]+">(?:<img[^>]*>)?([^<]*)<\/span>/.exec(x || '') || [])[1];
  const rowOf = (t, list = rows) => list.find((x) => x.includes(`>${t}</a>`)) || '';
  check(rows.length === 5 && !camps.includes('class="pk"'), `campaign rows: ${rows.length}, no Keep buttons in the list`);
  check(rows.every((x) => x.includes('width="320" height="70"') && x.includes('class="go"') && (x.match(/<span class="s s-/g) || []).length === 1), 'same row as the quests: half-size banner, one status line, «›»');
  const ka = rowOf('Key Art #9 VIP Quests');
  check(ka && ka.includes('2 weeks · Jun 12, 2017 – Jun 25, 2017') && ka.includes('data-eid="7401 7402"') && ka.includes('data-nv="2"'), `merged Key Art #9 row: ${ka.slice(0, 160)}`);
  check(line(ka) === 'June 2017 · can be kept with VIP' && /^ can"/.test(ka), `past: ${line(ka)}`);
  check(line(rowOf('Kept Campaign')) === 'Kept in Special', 'kept');
  check(line(rowOf('This Week Campaign')) === 'This week · VIP only — locked' && line(rowOf('This Week Campaign', hv.slice(hv.indexOf('id="camps"')).split('<div class="row cr').slice(1))) === 'This week · VIP', 'this week, without and with VIP');
  check(line(rowOf('Future Campaign')) === 'Coming in March 2020 · Story Quest 951' && /^ off"/.test(rowOf('Future Campaign')), `future: ${line(rowOf('Future Campaign'))}`);
  // year selector (the Shop week's year selected), month labels
  check(camps.includes('data-defy="2019"') && /<button type="button" class="yc" data-yr="all">All years <span class="yn">5<\/span><\/button>/.test(camps)
    && /<button type="button" class="yc on" data-yr="2019">2019 <span class="yn">1<\/span><\/button>/.test(camps) && /data-yr="2017">2017 <span class="yn">2<\/span>/.test(camps), 'year chips with counts, the Shop week year on');
  check(camps.includes('<div class="ml" data-y="2017" data-m="2017-06">June 2017</div>') && camps.includes('>July 2017</div>') && !camps.includes('<details'), 'plain month labels, no accordions');
  check(rows.every((x) => /data-y="\d{4}"/.test(x)) && /yr==='all'\|\|r\.y===yr/.test(h) && /if\(cur\.q\)yr=ys\.length===1\?ys\[0\]:'all'/.test(h), 'script: year filter; a search goes to its year');
  check(/attr\(d,'data-y'\)\)\{yr=attr\(d,'data-y'\)/.test(h), 'BACK selects the year of the row');
  // filters and search still find campaigns
  check(rows.every((x) => ['data-type', 'data-show', 'data-search', 'data-periods', 'data-reward'].every((a) => x.includes(a + '="'))) && ka.includes('Key Art #9 Pt.2 &amp; Combo VIP Quests!'), 'filter and search attributes (both week titles)');
  // details page: each week a version with its own Keep button
  const d = pages.detailPage(ix, 7402, { ...c, fromCatalog: true });
  const vers = (d.match(/<div class="ver [^"]*" id="v\d"><h3>[^<]*<\/h3>/g) || []).map((x) => />([^<]*)<\/h3>/.exec(x)[1]);
  check(d.includes('<title>Key Art #9 VIP Quests</title>') && vers.join() === 'Week of Jun 19, 2017,Week of Jun 12, 2017', `details weeks: ${vers}`);
  check(d.includes('data-pin="/web/special/pin/7401"') && d.includes('data-pin="/web/special/pin/7402"'), 'each week its own Keep button');
  check(d.includes('class="back" href="/web/special/catalog#q7402"') && (h.match(/ id="q7402"/g) || []).length === 1, 'BACK to the row');
  check(pages.familiesOf(ix.entries).filter((x) => x.campaign).length === 5, 'familiesOf merges consecutive weeks of the same art');
}
// round 15 (user 31-10): «In Special now» = exactly the banners of the Special tab (special.specialEvents for the same
// ctx, the KEPT one included); new «Unlocked, not in Special now» = reached by the Story (not later, not removed) and not
// in the tab. Like the Shop's «In the Shop now» / «Unlocked, not in the Shop now».
{
  check(SHOW_OPTS_OF(html).now === 'In Special now' && SHOW_OPTS_OF(html).unl === 'Unlocked, not in Special now', `SHOW chips: ${JSON.stringify(SHOW_OPTS_OF(html))}`);
  check(/class="o st-unl" data-v="unl">/.test(html) && html.includes('/web/special/icon/unlocked.png'), 'chip «Unlocked, not in Special now» with its icon');
  check(/\.o\.st-unl\.on\{[^}]*#1a6fa8/.test(html), 'chip colour like the Shop (blue)');
  check(/SHOWSET=\{"now":\["now","kept"\],"unl":\["can","replaced","other"\]\}/.test(html) && /SHOWSET\[s\.show\]/.test(html), 'script: the two chips cover several statuses');
  check(pages.SHOW_SETS.now.join() === 'now,kept' && pages.SHOW_SETS.unl.join() === 'can,replaced,other', 'shared status sets');
  // entry -> its status in the page (one per entry, from the rows' data-eid / data-show)
  const statusesOf = (h) => {
    const m = new Map();
    for (const r of h.split('<div class="row').slice(1)) {
      const ids = (/data-eid="([^"]*)"/.exec(r) || [])[1].split(' '), ss = (/data-show="([^"]*)"/.exec(r) || [])[1].split(' ');
      ids.forEach((id, j) => m.set(+id, ss[j]));
    }
    return m;
  };
  const sets = (h) => { const st = statusesOf(h), now = [], unl = [];
    for (const [id, s] of st) { if (pages.SHOW_SETS.now.includes(s)) now.push(id); if (pages.SHOW_SETS.unl.includes(s)) unl.push(id); }
    return { st, now: now.sort((a, b) => a - b), unl: unl.sort((a, b) => a - b) }; };
  const tabIds = (ix, c) => special.specialEvents({ ...ix, catalog: { stageIds: [970000], useAp: [0], ...ix.catalog } }, { imgBase: '', dayEndStr: 'D', weekEndStr: 'W', ...c })
    .map((x) => x.eventStageId).filter((id) => id !== ix.catalog.evStageId).sort((a, b) => a - b);
  // fixture: kept, current (today, other day, VIP), Daily Cid days, campaigns of this and another week, past, later, removed
  const fx = { catalog: { evStageId: 7000 }, entries: [
    e('tue', 7601, { periods: [4], days: ['Tue'] }), e('mon', 7602, { periods: [4], days: ['Mon'] }), e('vipq', 7603, { periods: [4], vip: true, family: 'SQ22' }),
    e('cid-tue', 7604, { name: 'C (Tuesday)', periods: [4], days: ['Tue'], family: 'SQ12', resetGroup: 'cid' }), e('cid-wed', 7605, { name: 'C (Wednesday)', periods: [4], days: ['Wed'], family: 'SQ12', resetGroup: 'cid' }),
    e('campnow', 7606, { periods: [4], vip: true, campaign: { start: '2019-03-04', end: '2019-03-10' } }), e('camplater', 7607, { periods: [4], vip: true, campaign: { start: '2019-05-06', end: '2019-05-12' } }),
    e('kept', 7608, { periods: [2] }), e('old', 7609, { periods: [1, 2] }), e('repl', 7610, { periods: [1], replacedBy: 'old' }),
    e('later', 7611, { periods: [5] }), e('gone', 7612, { periods: [1], removed: 'no-use' }), e('notyet', 7613, { periods: [4], from: '2019-06-01' }),
  ] };
  for (const vip of [false, true]) {
    const c = { period: 4, pinnedKey: 'kept', periods: PERIODS, shopFrom: '2019-03-04', shopTo: '2019-03-10', weekday: 'Tue', vip };
    const s = sets(pages.catalogPage(fx, c));
    check(s.now.join() === tabIds(fx, c).join(), `fixture vip=${vip}: «In Special now» ${s.now} = tab ${tabIds(fx, c)}`);
    check(s.unl.join() === '7605,7607,7609,7610,7613', `fixture vip=${vip}: «Unlocked, not in Special now» ${s.unl}`);
    check(s.st.get(7611) === 'later' && s.st.get(7612) === 'removed', 'later and removed in neither');
  }
  // real local index, story in period 4, Tuesday, without and with VIP
  let real = null; try { real = require('./game_data/special.json'); } catch { /* no local index */ }
  if (real) {
    const pin = real.entries.find((en) => special.pinnable(en, 4).ok && !en.campaign);
    for (const vip of [false, true]) {
      const c = { period: 4, pinnedKey: pin.key, periods: special.PERIODS, shopFrom: '2020-06-02', shopTo: '2020-06-08', weekday: 'Tue', vip };
      const s = sets(pages.catalogPage(real, c)), tab = tabIds(real, c);
      check(s.now.join() === tab.join(), `real vip=${vip}: «In Special now» ${s.now.length} entries vs tab ${tab.length}: ${s.now.filter((x) => !tab.includes(x))} / ${tab.filter((x) => !s.now.includes(x))}`);
      const reached = [...s.st].filter(([, x]) => x !== 'later' && x !== 'removed').map(([id]) => id).sort((a, b) => a - b);
      check(s.unl.join() === reached.filter((id) => !tab.includes(id)).join(), `real vip=${vip}: «Unlocked, not in Special now» = reached minus tab`);
    }
  }
}
function SHOW_OPTS_OF(h) { const box = h.slice(h.indexOf('data-g="show"'), h.indexOf('class="foot"')); return Object.fromEntries([...box.matchAll(/data-v="([a-z]+)">(?:<img[^>]*>)?([^<]*)</g)].map((m) => [m[1], m[2]])); }
// round 15 (+ user bug): the KEPT banner is in the tab -> «In Special now», never «Unlocked, not in Special now»; also a
// kept campaign and a kept single day of a quest with one quest per day
{
  const sts = (h) => { const m = new Map(); for (const r of h.split('<div class="row').slice(1)) { const ids = (/data-eid="([^"]*)"/.exec(r) || [])[1].split(' '), ss = (/data-show="([^"]*)"/.exec(r) || [])[1].split(' '); ids.forEach((id, j) => m.set(+id, ss[j])); } return m; };
  const fx = { catalog: { evStageId: 7000 }, entries: [
    e('d-mon', 7701, { name: 'Days (Monday)', periods: [1], days: ['Mon'], banner: 'd.png' }), e('d-tue', 7702, { name: 'Days (Tuesday)', periods: [1], days: ['Tue'], banner: 'd.png' }),
    e('oldcamp', 7703, { name: 'Old Campaign', periods: [2], vip: true, campaign: { start: '2017-06-12', end: '2017-06-18' } }),
  ] };
  for (const [key, id] of [['d-mon', 7701], ['oldcamp', 7703]]) {
    for (const vip of [false, true]) {
      const c = { period: 4, pinnedKey: key, periods: PERIODS, shopFrom: '2019-03-04', shopTo: '2019-03-10', weekday: 'Tue', vip };
      const h = pages.catalogPage(fx, c), st = sts(h);
      const tab = special.specialEvents({ ...fx, catalog: { stageIds: [970000], useAp: [0], ...fx.catalog } }, { imgBase: '', dayEndStr: 'D', weekEndStr: 'W', ...c }).map((x) => x.eventStageId).filter((x) => x !== 7000);
      check(tab.join() === String(id) && pages.SHOW_SETS.now.includes(st.get(id)) && !pages.SHOW_SETS.unl.includes(st.get(id)), `kept ${key} (vip=${vip}): tab ${tab}, status ${st.get(id)}`);
      check([...st].filter(([x]) => x !== id).every(([, s]) => !pages.SHOW_SETS.now.includes(s)), `kept ${key}: nothing else «In Special now»`);
    }
  }
  // the row of the kept day shows «Kept in Special» (its best entry) and counts under «In Special now»
  const h = pages.catalogPage(fx, { period: 4, pinnedKey: 'd-mon', periods: PERIODS, shopFrom: '2019-03-04', shopTo: '2019-03-10', weekday: 'Tue' });
  const row = itemOf(h, 7701);
  check(/^<div class="row pinned"/.test(row) && row.includes('Kept in Special') && /data-show="kept can"/.test(row), `kept day: row ${row.slice(0, 120)}`);
}
// round 16 (bench rev 221): with SHOW «In Special now» the campaign rows of other years stayed visible (and the
// summary said «0 campaigns»). The page script runs in headless Edge when it is installed: apply a SHOW filter, then
// every row that is really displayed (computed style) must match it, the counts must agree, and the month labels / year
// chips must follow. Skipped without Edge.
{
  const cp = require('child_process'), os = require('os'), path = require('path'), fs = require('fs');
  const EDGE = process.env.KHUX_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(EDGE)) console.log('(headless Edge not found: browser checks of the catalogue skipped)');
  else {
    // the Shop week is Dec 30, 2019 - Jan 5, 2020: its campaign starts in 2019 while the week's first day is in 2019 too,
    // and an old campaign (2017) and a kept quest; story in period 4
    const fx = { catalog: { evStageId: 7000 }, entries: [
      e('tue', 7801, { name: 'Tue Quest', periods: [4], days: ['Tue'] }), e('kept', 7802, { name: 'Kept Quest', periods: [3] }),
      e('old', 7803, { name: 'Old Quest', periods: [2] }), e('later', 7804, { name: 'Later Quest', periods: [5] }),
      e('cnow', 7811, { name: 'Year End Campaign', periods: [4], vip: true, campaign: { start: '2019-12-30', end: '2020-01-05' }, banner: 'y.png' }),
      e('cold', 7812, { name: 'Old Campaign', periods: [2], vip: true, campaign: { start: '2017-08-07', end: '2017-08-13' }, banner: 'o.png' }),
      e('cold2', 7813, { name: 'Older Campaign', periods: [2], vip: true, campaign: { start: '2017-09-04', end: '2017-09-10' }, banner: 'p.png' }),
      e('cnext', 7814, { name: 'Next Year Campaign', periods: [4], vip: true, campaign: { start: '2020-02-03', end: '2020-02-09' }, banner: 'n.png' }),
    ] };
    const c = { period: 4, pinnedKey: 'kept', periods: PERIODS, shopFrom: '2020-01-02', shopTo: '2020-01-08', weekday: 'Tue', vip: false };
    const tab = special.specialEvents({ ...fx, catalog: { stageIds: [970000], useAp: [0], ...fx.catalog } }, { imgBase: '', dayEndStr: 'D', weekEndStr: 'W', ...c })
      .map((x) => x.eventStageId).filter((x) => x !== 7000).sort((a, b) => a - b);
    const probe = `<script>window.addEventListener('load',function(){var R={};
function shown(el){while(el&&el.nodeType===1){if(getComputedStyle(el).display==='none')return false;el=el.parentNode;}return true;}
function rows(cr){return [].filter.call(document.querySelectorAll('.row'),function(r){return (r.className.indexOf(' cr')>=0)===cr&&shown(r);});}
function ids(list){var o=[];list.forEach(function(r){o.push(r.getAttribute('data-eid'));});return o.join(',');}
function state(tag){R[tag]={q:ids(rows(false)),c:ids(rows(true)),ml:[].filter.call(document.querySelectorAll('.ml'),shown).map(function(m){return m.getAttribute('data-m');}).join(','),
sum:document.getElementById('sum').textContent,year:(document.querySelector('.yc.on')||{}).getAttribute?document.querySelector('.yc.on').getAttribute('data-yr'):'',
yn:[].map.call(document.querySelectorAll('.yc'),function(y){return y.getAttribute('data-yr')+':'+y.querySelector('.yn').textContent;}).join(','),camps:shown(document.getElementById('camps'))};}
function show(v){document.getElementById('fbtn').click();document.querySelector('.opts[data-g="show"] [data-v="'+v+'"]').click();document.getElementById('fok').click();}
state('start');show('now');state('now');document.querySelector('.yc[data-yr="all"]').click();state('nowAll');show('unl');state('unl');
var p=document.createElement('pre');p.id='probe';p.textContent=JSON.stringify(R);document.body.appendChild(p);});</script>`;
    const file = path.join(os.tmpdir(), `khux-r16-${process.pid}.html`);
    fs.writeFileSync(file, pages.catalogPage(fx, c).replace('</body>', probe + '</body>'));
    let R = null;
    try {
      const out = cp.execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--dump-dom', 'file:///' + file.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
      const m = /<pre id="probe">([^<]*)<\/pre>/.exec(out);
      R = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
    } catch (err) { errors.push('headless Edge failed: ' + err.message); }
    try { fs.unlinkSync(file); } catch { /* gone */ }
    if (R) {
      check(tab.join() === '7801,7802,7811', `fixture tab ${tab}`);
      check(R.start.year === '2019' && R.start.c === '7811', `start: the year of this week's campaign (2019) selected: ${JSON.stringify(R.start)}`);
      check(R.now.q === '7801,7802' && R.now.c === '7811' && R.now.ml === '2019-12' && R.now.camps === true, `«In Special now»: only tab rows displayed ${JSON.stringify(R.now)}`);
      check(/^2 quests · 1 campaign /.test(R.now.sum), `summary agrees: ${R.now.sum}`);
      check(R.nowAll.c === '7811' && R.nowAll.ml === '2019-12' && /all:1,2017:0,2019:1,2020:0/.test(R.nowAll.yn), `All years: still only the tab's campaign; chips ${R.nowAll.yn}`);
      check(R.unl.q === '7803' && R.unl.c.split(',').sort().join() === '7812,7813,7814' && R.unl.ml === '2017-08,2017-09,2020-02', `«Unlocked, not in Special now»: ${JSON.stringify(R.unl)}`);
    }
  }
}
if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('test-special-pages: OK');
