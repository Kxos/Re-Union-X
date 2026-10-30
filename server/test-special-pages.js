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
check(row(7102).includes('📌 Keep in Special') && row(7102).includes('Replaces: N-kb') && row(7102).includes('data-pin="/web/special/pin/7102"'), 'pinnable');
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
  stage: [{ stageId: 3, submissionRewardType: [5, 14, 0], submissionItemId: [8, 0, 0] }] }[n]));
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
if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('test-special-pages: OK');
