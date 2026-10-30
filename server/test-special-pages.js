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
// round 12: the item (quest card or campaign row) that holds the element id="q<id>"
function itemOf(h, id) { const s0 = h.indexOf(`id="q${id}"`); if (s0 < 0) return ''; const a = Math.max(h.lastIndexOf('<div class="card ', s0), h.lastIndexOf('<div class="cr ', s0)); return h.slice(a, h.indexOf('</div>' + String.fromCharCode(10), s0)); }
check((html.match(/<span class="tp/g) || []).length === 5 * 7 && (html.match(/<span class="tp cur">/g) || []).length === 7, 'a five-period timeline on every card, the current period marked');
check(/Period 4[\s\S]{0,200}Now/.test(html) && (html.match(/>Now</g) || []).length === 1, 'current period marked Now once');
const row = (id) => itemOf(html, id);
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
for (const id of [7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108]) check(['data-periods', 'data-type', 'data-show', 'data-search'].every((a) => attr(id, a) !== null), 'row attrs ' + id);
check(attr(7102, 'data-search').toLowerCase().includes('huey') && attr(7102, 'data-search').toLowerCase().includes('mythril') && attr(7102, 'data-search').toLowerCase().includes('quest two'), 'search has drop names');
check(attr(7107, 'data-search') === 'N-cid', 'search plain name (as written)');
check(attr(7102, 'data-periods') === '1' && attr(7101, 'data-periods') === '2' && attr(7103, 'data-periods') === '1 2', 'data-periods');
check(attr(7107, 'data-type') === 'daily' && attr(7106, 'data-type').split(' ').includes('vip') && attr(7108, 'data-type') === 'camp' && attr(7101, 'data-type') === 'weekday', 'types');
check(attr(7101, 'data-show') === 'kept' && attr(7102, 'data-show') === 'can' && attr(7103, 'data-show') === 'replaced' && attr(7104, 'data-show') === 'removed' && attr(7105, 'data-show') === 'later' && attr(7106, 'data-show') === 'can' && attr(7108, 'data-show') === 'now', 'shows');
check(html.includes('id="sum"') && html.includes('>7 quests</span> · 7 versions · 1 campaign · all periods, no filters') && html.includes('id="fbtn"'), 'summary and filters button');
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
  check(r(7201).includes('Open in Special now') && sh(7201) === 'now', 'current entry: open now');
  check(r(7202).includes('This period, not this week') && !r(7202).includes('Open in Special now') && sh(7202) !== 'now', `entry outside its from/to: ${sh(7202)}`);
  check(r(7203).includes('Open in Special now') && sh(7203) === 'now', 'campaign of this week: open now');
  check(r(7204).includes('Week of Feb 1, 2016') && !r(7204).includes('Open in Special now') && sh(7204) !== 'now', `campaign of another week: ${sh(7204)}`);
  // the locked VIP banner is still in the Special tab (isLock 1): it stays under «In Special now»
  check(r(7205).includes('VIP only (locked)') && !r(7205).includes('Open in Special now') && sh(7205) === 'now', 'current VIP entry without VIP: locked');
  const hv = pages.catalogPage(ix, { ...ctx, vip: true });
  const rv = itemOf(hv, 7205);
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
  const cls = (id) => (/class="([^"]*)"/.exec(itemOf(html, id)) || [])[1];
  check(cls(7101) === 'card pinned' && cls(7102) === 'card can' && cls(7103) === 'card off' && cls(7104) === 'card off' && cls(7105) === 'card off' && cls(7108) === 'cr now', `row classes ${[7101, 7102, 7103, 7104, 7105, 7108].map(cls)}`);
  check(row(7101).includes('class="s s-pinned"') && row(7102).includes('class="s s-can"') && row(7105).includes('class="s s-off"') && row(7108).includes('class="s s-now"'), 'status pills');
  check(/\.card,\.cr\{[^}]*border-left:5px solid/.test(html) && /\.card\.now,\.cr\.now\{border-left-color:#2e9e3e/.test(html) && /\.card\.pinned,\.cr\.pinned\{border-left-color:#b8860b/.test(html) && /\.card\.can,\.cr\.can\{border-left-color:#1a6fa8/.test(html), 'side bars');
  check(/\.card\.off \.im img,\.cr\.off \.th img\{[^}]*opacity/.test(html) && /\.card\.locked \.im img\{[^}]*opacity/.test(html), 'dimmed banners');
  check(row(7102).includes('href="/web/special/detail/7102?from=catalog"') && (row(7102).match(/\/web\/special\/detail\/7102/g) || []).length === 3, 'banner, name and version chip open the details');
  const ix = { catalog: { evStageId: 7000 }, entries: [e('vipnow', 7205, { periods: [4], vip: true, days: 'all', family: 'SQ22' })] };
  const hl = pages.catalogPage(ix, { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2016-01-11', shopTo: '2016-01-17', weekday: 'Mon', vip: false });
  check(/class="card locked"/.test(hl) && hl.includes('class="s s-locked"') && hl.includes('/web/special/icon/lock.png'), 'VIP locked: grey bar, padlock pill');
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
  check(r(7501).includes('data-show="now"') && r(7501).includes('Open in Special now'), 'Cid of today: now');
  check(r(7502).includes('data-show="other"') && r(7502).includes('Listed on Tue only') && !r(7502).includes('Open in Special now'), `Cid of another day: ${r(7502).slice(0, 300)}`);
}
// round 12 (user 31-10): one card per quest with its versions on a period timeline; period tabs are filters; the VIP
// campaigns in a compact list by year and month
{
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const ix = { catalog: { evStageId: 7000 }, entries: [
    e('vip-power', 7301, { name: 'EXP & Evolve Medals: Power', periods: [1, 2], vip: true, from: '2016-06-16', banner: 'up-power.png' }),
    e('exp-power', 7302, { name: 'EXP & Evolve Medals: Power', periods: [3, 4, 5], days: ['Tue'], banner: 'power.png' }),
    ...DAYS.map((d, i) => e('cid-vip-' + d, 7311 + i, { name: `Daily Challenge: Cid (${FULL[i]})`, periods: [1, 2], days: [d], vip: true, family: 'SQ12', resetGroup: 'cid-vip',
      from: '2016-05-19', to: '2017-04-19', replacedBy: 'cid-' + d, banner: 'vipcid.png' })),
    ...DAYS.map((d, i) => e('cid-' + d, 7321 + i, { name: `Daily Challenge: Cid (${FULL[i]})`, periods: [2, 3, 4], days: [d], family: 'SQ12', resetGroup: 'cid', from: '2017-04-20', banner: 'cid.png' })),
    e('mat', 7331, { name: 'VIP! Materials', periods: [4, 5], vip: true, family: 'SQ23', banner: 'mat.png' }),
    e('mat2', 7332, { name: 'VIP! Materials 2', periods: [4, 5], vip: true, family: 'SQ23', banner: 'mat.png' }),
    e('c1', 7341, { name: 'Key Art #9 VIP Quests!', periods: [2], vip: true, campaign: { start: '2017-06-12', end: '2017-06-18' }, family: 'SQ21', banner: 'c1.png' }),
    e('c2', 7342, { name: 'Pt. 2 Quests', periods: [2], vip: true, campaign: { start: '2017-06-19', end: '2017-06-25' }, family: 'SQ21', banner: 'c2.png' }),
    e('c3', 7343, { name: 'Winter Board', periods: [4], vip: true, campaign: { start: '2019-03-04', end: '2019-03-10' }, family: 'SQ21', banner: 'c3.png' }),
  ] };
  const c4 = { period: 4, pinnedKey: '', periods: PERIODS, shopFrom: '2019-03-04', shopTo: '2019-03-10', weekday: 'Tue', vip: false };
  const h = pages.catalogPage(ix, c4);
  const cards = h.split('<div class="card ').slice(1).map((x) => x.slice(0, x.indexOf('</div>' + String.fromCharCode(10))));
  const cardOf = (t) => cards.filter((x) => x.includes(`>${t}</a>`));
  // EXP & Evolve Power: one card, two version chips under their periods, each with its own status
  const pw = cardOf('EXP &amp; Evolve Medals: Power');
  check(pw.length === 1, `one card for EXP & Evolve Power (${pw.length})`);
  const vrs = (x) => (x.match(/<div class="vr[^"]*"[^>]*>[\s\S]*?<\/div>/g) || []);
  const v = vrs(pw[0] || '');
  check(v.length === 2 && v[0].includes('grid-column:1 / 3') && v[0].includes('data-periods="1 2"') && v[1].includes('grid-column:3 / 6'), `Power versions on the timeline: ${v.map((x) => x.slice(0, 80))}`);
  check(/class="vc mb c-can"[^>]*data-eid="7301"/.test(v[0]) && /class="vc mb c-now"[^>]*data-eid="7302"/.test(v[1]), 'version chips coloured by their status (past VIP version can be kept, current one open)');
  check(v[0].includes('>VIP 2016–17<') || v[0].includes('VIP 2016–18'), `version label with years: ${v[0]}`);
  check(v[1].includes('href="/web/special/detail/7302?from=catalog"'), 'version chip opens its details');
  check((pw[0] || '').startsWith('now') && (pw[0] || '').includes('class="s s-now"') && (pw[0] || '').includes('2 versions'), 'card bar and pill: best version');
  check((pw[0] || '').includes('/web/special/img/v' + require('./special').SPECIAL_IMG_VERSION + '/7302.png'), 'card banner: the most recent version');
  check((pw[0] || '').includes('<span class="tp cur">Period 4</span>') && ((pw[0] || '').match(/class="tp/g) || []).length === 5, 'timeline: five periods, the current one marked');
  // Daily Cid: one card, two versions (VIP 2016-17 and free 2017-), seven day chips each
  const cid = cardOf('Daily Challenge: Cid');
  check(cid.length === 1, `one Cid card (${cid.length})`);
  const cv = vrs(cid[0] || '');
  const days = (x) => (x.match(/<a class="ch mb [^"]*"/g) || []).length;
  check(cv.length === 2 && days(cv[0]) === 7 && days(cv[1]) === 7, `Cid: 2 versions with 7 days each (${cv.map(days)})`);
  check(/>VIP 2016/.test(cv[0]) && />Free 2017/.test(cv[1]), `Cid version labels: ${cv.map((x) => (/class="vc[^>]*>(?:<img[^>]*>)?([^<]*)/.exec(x) || [])[1])}`);
  check(/class="ch mb c-now"[^>]*data-eid="7322"/.test(cv[1]) && /class="ch mb c-other"[^>]*data-eid="7321"/.test(cv[1]) && /class="ch mb c-off"[^>]*data-eid="7311"/.test(cv[0]), 'day chips: today open, other days listed, VIP version replaced');
  check(/class="vc c-now"/.test(cv[1]) && /class="vc c-off"/.test(cv[0]), 'version chip of a multi-day version: its best day');
  // VIP! Materials 1 / 2: one card, one version, two variant chips
  const mat = cardOf('VIP! Materials');
  check(mat.length === 1 && vrs(mat[0]).length === 1 && days(mat[0]) === 2 && mat[0].includes('>1<') && mat[0].includes('>2<'), 'Materials: one card, variants 1 and 2');
  // period tabs are filters: counts = cards (+ campaign rows) that have a version in the period; each item lists its periods
  check(h.includes('id="tc1">2<') && h.includes('id="tc2">4<') && h.includes('id="tc4">4<') && h.includes('id="tcall">6<'), `tab counts: ${(h.match(/id="tc[^"]+">\d+</g) || []).join(' ')}`);
  check(/data-periods="1 2 3 4 5"/.test(cardOf('EXP &amp; Evolve Medals: Power')[0] ? h.slice(h.indexOf('<div class="card', h.indexOf('id="q7301"') - 3000)) : ''), 'card lists all its periods');
  check(/r\.ps\.indexOf\(' '\+s\.p\+' '\)<0/.test(h) && /\(x\?' hl':''\)\+\(d\?' dim':''\)/.test(h), 'script: period tab filters cards and highlights the version');
  // campaigns: a separate compact section by year and month, no half-size banners
  const camps = h.slice(h.indexOf('id="camps"'), h.indexOf('<div class="ov"'));
  check(camps.includes('VIP Campaigns (<span id="cc">3</span>)') && (camps.match(/<div class="cr /g) || []).length === 3, 'campaigns section: 3 rows');
  check(!camps.includes('width="320"') && !camps.includes('width="640"') && camps.includes('width="160" height="35"'), 'campaign rows: small thumbnails only');
  check(camps.includes('<summary>2017 ▸ Jun (<span class="mc">2</span>)</summary>') && camps.includes('data-y="2019"') && camps.includes('data-y="2017"'), 'grouped by year and month');
  check(/<details class="cm" data-y="2019" data-m="2019-03" open>/.test(camps) && /<details class="cm" data-y="2017" data-m="2017-06">/.test(camps), 'the month of the current Shop week is open');
  check(camps.includes('Jun 12, 2017 – Jun 18, 2017') && /class="ch mb c-[a-z]+"[^>]*data-eid="7341"[^>]*>(?:<img[^>]*>)?Details</.test(camps), 'campaign row: dates and a details chip');
  check(!cards.some((x) => x.includes('Key Art #9')), 'no campaign among the cards');
  // filters apply to cards and campaign rows alike
  for (const k of ['data-type', 'data-show', 'data-reward', 'data-search', 'data-periods', 'data-eid', 'data-nv']) check(cards.every((x) => x.includes(k + '="')) && (camps.match(new RegExp(k + '="', 'g')) || []).length >= 3, 'filter attribute ' + k);
  check(cards.every((x) => x.includes('class="mt"')) && (camps.match(/class="mt"/g) || []).length === 3, '«Matches:» line in cards and rows');
  // summary: cards, versions, campaigns
  check(h.includes('<span class="n1">3 quests</span> · 5 versions · 3 campaigns · all periods, no filters'), `summary: ${(/<div class="sum"[^>]*>(.*?)<\/div>/.exec(h) || [])[1]}`);
  check(/plural\(n,'quest'\)\+'<\/span> · '\+plural\(m,'version'\)\+' · '\+plural\(k,'campaign'\)/.test(h), 'script summary counts');
  const ids = (h.match(/ id="[^"]+"/g) || []); check(ids.length === new Set(ids).size, 'unique element ids');
  check(['7301', '7302', '7311', '7327', '7331', '7341'].every((id) => (h.match(new RegExp(` id="q${id}"`, 'g')) || []).length === 1), 'one q<id> anchor per entry');
  // pin on the card only when exactly one entry of it can be kept
  check((pw[0] || '').includes('data-pin="/web/special/pin/7301"'), 'Power card: the one keepable version, pin on the card');
  check(!(cid[0] || '').includes('class="pk"'), 'Cid card: no keepable day, no pin');
  // REWARDS (round 7) on cards
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
  check(sheet.includes('REWARDS') && sheet.includes('data-g="reward"') && ['medal', 'avatar', 'jewel', 'material'].every((k) => sheet.includes(`data-v="${k}"`) && sheet.includes(`/web/special/icon/${k}.png`)), 'REWARDS chips with icons');
  check(/r\.rw/.test(hr) && /s\.reward/.test(hr), 'script filters by reward');
  const bn = pages.buildNames((n) => ({ reward: [{ rewardId: 5, type: [3, 5, 2], id: [9, 8, 0] }], stage: [{ stageId: 3, submissionRewardType: [20, 14, 0], submissionItemId: [1, 0, 0] }] }[n] || []));
  check(bn.dropTypes(5).join() === '3,5,2' && bn.objectiveTypes(3).join() === '20,14' && bn.dropTypes(99).length === 0, 'buildNames reward types');
  // real local index: 120 campaign rows by year and month, one card per family
  let real = null; try { real = require('./game_data/special.json'); } catch { /* no local index */ }
  if (real) {
    const sp = require('./special');
    const hh = pages.catalogPage(real, { period: 4, pinnedKey: '', periods: sp.PERIODS, shopFrom: '2020-06-01', shopTo: '2020-06-07', weekday: 'Tue' });
    const cs = hh.slice(hh.indexOf('id="camps"'), hh.indexOf('<div class="ov"'));
    const nCamp = real.entries.filter((en) => en.campaign).length;
    check((cs.match(/<div class="cr /g) || []).length === nCamp && nCamp === 120 && !cs.includes('width="320"'), `real campaigns: ${(cs.match(/<div class="cr /g) || []).length} rows (${nCamp})`);
    const fams = new Set(real.entries.filter((en) => !en.campaign && en.periods).map((en) => en.name.replace(/\s*\((?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\)\s*$/, '').replace(/\s+\d+$/, '')));
    check((hh.match(/<div class="card /g) || []).length === fams.size, `real cards ${(hh.match(/<div class="card /g) || []).length} = families ${fams.size}`);
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
  check(r(h, 7901).includes('Locked today · opens on Mon') && r(h, 7901).includes('class="s s-locked"') && r(h, 7901).includes('/web/special/icon/lock.png')
    && r(h, 7901).includes('data-show="now"') && !r(h, 7901).includes('Open in Special now'), `Mon quest on Tue without VIP: ${r(h, 7901).slice(0, 160)}`);
  check(/class="card locked"/.test(r(h, 7901)), 'grey bar');
  check(r(h, 7903).includes('Locked today · opens on Mon, Wed'), 'two days');
  check(r(hv, 7901).includes('Open today with VIP') && r(hv, 7901).includes('/web/special/icon/vip.png') && /class="card vipnow"/.test(r(hv, 7901)) && r(hv, 7901).includes('data-show="now"'), 'Mon quest on Tue with VIP');
  check(r(h, 7902).includes('Open in Special now') && r(hv, 7902).includes('Open in Special now'), 'own day: open');
  const grp = itemOf(h, 7904);
  check(/class="ch mb c-locked"[^>]*data-eid="7904"/.test(grp) && grp.includes('class="s s-locked"'), `group chips locked today: ${grp.slice(0, 200)}`);
  const d = pages.detailPage(ix, 7901, { ...c, vip: false });
  check(d.includes('Locked today · opens on Mon') && !d.includes('Open in Special now'), 'details page');
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
  check(/class="vc mb c-can"[^>]*data-cls="can"[^>]*data-pill="[^"]*Past quest/.test(g), 'chips carry their status class and pill');
  check(h.includes('function khuxRank(') && h.includes('function best(') && h.includes('function paint(') && /CHIP_ICON=\{/.test(h), 'page script: rank, regroup, chip icons');
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
if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('test-special-pages: OK');
