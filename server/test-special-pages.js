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
    e('kb2', 7102, { periods: [1] }),
    e('repl', 7103, { periods: [1, 2], replacedBy: 'kb' }),
    e('gone', 7104, { periods: [1], removed: 'no-use' }),
    e('later', 7105, { periods: [5] }),
    e('vipq', 7106, { periods: [3], vip: true, days: [] }),
  ],
};
const html = pages.catalogPage(index, { period: 4, pinnedKey: 'kb', vip: false, periods: PERIODS });
const idx = (s) => html.indexOf(s);
check(idx('id="p1"') > 0 && idx('id="p1"') < idx('id="p2"') && idx('id="p4"') < idx('id="p5"'), 'five period sections in order');
check((html.match(/class="per/g) || []).length >= 5, 'five sections');
check(/Period 4[\s\S]{0,200}Now/.test(html) && (html.match(/>Now</g) || []).length === 1, 'current period marked Now once');
const row = (id) => { const s = html.indexOf(`id="q${id}"`); return s < 0 ? '' : html.slice(s, html.indexOf('</div></div>', s)); };
check(row(7105) && !row(7105).includes('data-pin') && row(7105).includes('Reached later in the Story'), 'later: no pin, text');
check(row(7103).includes('Replaced by N-kb') && !row(7103).includes('data-pin'), 'replaced');
check(row(7104).includes('Not restored: its materials have no use in this version') && !row(7104).includes('data-pin'), 'removed');
check(row(7101).includes('Remove from Special') && row(7101).includes('data-pin="/web/special/unpin"'), 'pinned');
check(row(7102).includes('📌 Keep in Special') && row(7102).includes('Replaces: N-kb') && row(7102).includes('data-pin="/web/special/pin/7102"'), 'pinnable');
check(row(7106).includes('VIP only'), 'VIP');
check(row(7101).includes('/web/special/img/7101.png') && row(7101).includes('Tue'), 'image and days');
check(row(7102).includes('Every day'), 'every day');
const none = pages.catalogPage(index, { period: 4, pinnedKey: '', vip: false, periods: PERIODS });
check(!none.includes('Replaces:'), 'no Replaces without a pin');
if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('test-special-pages: OK');
