// Event Catalog pages (Events Part 1, plan docs/superpowers/plans/2026-11-06-events-part1-framework.md Task 5): the catalogue by
// month with the states of calendar-util.js rowState, the details page with its «On this server» box, the original notice page
// (text read at request time from git-ignored data) and the kept event. Synthetic fixtures only (no notice text of the game).
//   node server/test-event-pages.js
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const pages = require('./event-pages');
const routesEvents = require('./routes-events');
const { rowState } = require('./calendar-util');

const REASONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_config.json'), 'utf8')).reconstructedWhy;
const quest = (stageId, extra = {}) => ({ key: `k${stageId}`, stageId, name: `Quest ${stageId}`, ap: 5, level: 10, served: true, status: 'served', why: null, labels: [], ...extra });
const NOT_SERVED = (stageId, why) => quest(stageId, { served: false, status: 'not served yet', why });
// the player's Shop week: 2019-04-08 .. 04-14. E-0 past (can), E-1 now, E-3 later, E-9 no served quest (removed)
const INDEX = () => ({ reasons: REASONS, catalog: { evStageId: 20000, stageIds: [970000], useAp: [0] }, entries: [
  { censusId: 'E-0', evStageId: 29900, name: 'March Fun', start: '2019-03-01', end: '2019-03-07', stageIds: [4009904], available: true, labels: ['dramaOff', 'eventCoins'], noticeIds: [9001],
    quests: [quest(4009904, { labels: ['donorKept'] }), NOT_SERVED(4009905, 'enemies not in the master: 2001234, 2001235')] },
  { censusId: 'E-1', evStageId: 29901, name: 'April Fun', start: '2019-04-01', end: '2019-04-14', stageIds: [4009901], available: true, labels: [], noticeIds: [9002], quests: [quest(4009901)] },
  { censusId: 'E-3', evStageId: 29903, name: 'May Fun', start: '2019-05-01', end: '2019-05-07', stageIds: [4009903], available: true, labels: ['wholeDay'], days: ['2019-05-02'], noticeIds: [],
    quests: [quest(4009903)] },
  { censusId: 'E-9', evStageId: 29909, name: 'Lost Fun', start: '2019-03-10', end: '2019-03-12', stageIds: [], available: false, labels: [], noticeIds: [],
    quests: [NOT_SERVED(4009910, 'enemies not in the master: 2009999')] },
] });
const ctx = (extra = {}) => ({ shopFrom: '2019-04-08', shopTo: '2019-04-14', current: new Set(['E-1']), kept: null, imgVersion: 1, unlockQuestOf: () => 612, ...extra });
// one catalogue row (its opening div to the next one)
function rowOf(html, id) {
  const i = html.indexOf(`id="q${id}"`);
  assert(i >= 0, `row q${id} present`);
  const start = html.lastIndexOf('<div class="row', i), end = html.indexOf('<div class="row', i);
  return html.slice(start, end < 0 ? html.length : end);
}
const NOTICE_LINE = 'Fixture line of an event notice, never in the repository.';
const DOC = () => ({ rows: { 'E-0': { noticeIds: [9001] } }, notices: { 9001: { title: 'March Fun notice', date: '2019-02-28', time: '07:00', category: 'EVENT',
  body: ['● March Fun', NOTICE_LINE, '・ a list line', 'Potion x 3'] } } });

const tests = {
  // rows by month (month labels in date order), each with the state of rowState: now / can / kept / later / removed
  catalog_by_period() {
    const html = pages.catalogPage(INDEX(), ctx());
    const months = [...html.matchAll(/<div class="ml" data-m="([\d-]+)">([^<]+)<\/div>/g)].map((m) => [m[1], m[2]]);
    assert.deepStrictEqual(months, [['2019-03', 'March 2019'], ['2019-04', 'April 2019'], ['2019-05', 'May 2019']]);
    const show = (id) => (/data-show="(\w+)"/.exec(rowOf(html, id)) || [])[1];
    for (const e of INDEX().entries) assert.strictEqual(show(e.evStageId), rowState(e, ctx()), e.censusId);
    assert.deepStrictEqual([29900, 29901, 29903, 29909].map(show), ['can', 'now', 'later', 'removed']);
    assert.ok(rowOf(html, 29903).includes('Unlocks at Story Quest 612'));
    assert.ok(rowOf(html, 29909).includes('Not restored yet'), 'a record with no served quest is listed, never hidden');
    const kept = pages.catalogPage(INDEX(), ctx({ kept: 'E-0' }));
    assert.strictEqual((/data-show="(\w+)"/.exec(rowOf(kept, 29900)) || [])[1], 'kept');
    assert.ok(rowOf(kept, 29900).includes('Remove from Events'));
    assert.ok(html.includes('Event Catalog') && html.includes('/web/event/event/29900?from=catalog'));
  },
  // only a past event can be kept: the page offers Keep only there, and the route refuses the others
  keep_past_only() {
    const html = pages.catalogPage(INDEX(), ctx());
    assert.ok(rowOf(html, 29900).includes('data-pin="/web/event/keep/29900"'), 'past: Keep');
    for (const id of [29901, 29903, 29909]) assert.ok(!rowOf(html, id).includes('class="pk'), `no Keep on ${id}`);
    const player = {};
    const ev = routesEvents({ player, savePlayer() {}, masterRows: () => [], eventIndex: INDEX, storyWeek: () => ({ shopFrom: '2019-04-08', shopTo: '2019-04-14' }),
      realNow: () => Date.parse('2026-11-03T20:00:00Z'), serverTimeAt: String, clock: { weekEnd: (x) => x, dayEnd: (x) => x }, stageState: () => ({}), grantItem() {}, grantObjective() {},
      webBase: '', log() {} });
    assert.deepStrictEqual(ev.keep(29901).body, { ok: false, why: 'now' }, 'current');
    assert.deepStrictEqual(ev.keep(29903).body, { ok: false, why: 'later' }, 'future');
    assert.deepStrictEqual(ev.keep(29909).body, { ok: false, why: 'removed' }, 'nothing served');
    assert.deepStrictEqual(ev.keep(29900).body, { ok: true });
    assert.strictEqual(player.events.kept, 'E-0');
  },
  // a kept census id the index no longer has (a record dropped): inert in the lists, cleared when the catalogue opens
  kept_unknown_cleared() {
    const player = { events: { kept: 'E-GONE', cleared: {} } };
    let saves = 0;
    const ev = routesEvents({ player, savePlayer() { saves++; }, masterRows: () => [], eventIndex: INDEX, storyWeek: () => ({ shopFrom: '2019-04-08', shopTo: '2019-04-14' }),
      realNow: () => Date.parse('2026-11-03T20:00:00Z'), serverTimeAt: String, clock: { weekEnd: (x) => x, dayEnd: (x) => x }, stageState: () => ({}), grantItem() {}, grantObjective() {},
      webBase: '', log() {} });
    assert.strictEqual(ev.catalogCtx().kept, null, 'unknown: not kept');
    assert.deepStrictEqual(ev.events().map((e) => e.eventStageId), [29901], 'no kept card');
    assert.strictEqual(player.events.kept, 'E-GONE', 'listing never writes the save');
    ev.pruneKept();
    assert.strictEqual(player.events.kept, null);
    assert.strictEqual(saves, 1);
    ev.pruneKept();
    assert.strictEqual(saves, 1, 'nothing to clear: no save');
    // a known kept event stays
    player.events.kept = 'E-0';
    ev.pruneKept();
    assert.strictEqual(player.events.kept, 'E-0');
  },
  // the original notice: from the doc handed in (git-ignored data read at request time), laid out in the Original notice card;
  // without the doc or the notice a friendly page; the text is never in the repository
  notice_page_private() {
    const html = pages.noticePage(INDEX(), 29900, DOC(), { ...ctx(), from: 'event' });
    assert.ok(html.includes(NOTICE_LINE) && html.includes('<div class="onc">') && html.includes('Original notice'));
    assert.ok(html.includes('<table class="rw">') && html.includes('<ul class="nl">'), 'laid out as the raid notices');
    assert.ok(html.includes('href="/web/event/event/29900?from=catalog"'), 'BACK to the details page');
    assert.ok(html.includes('On this server'));
    const none = pages.noticePage(INDEX(), 29900, null, ctx());
    assert.ok(/not available/i.test(none) && !none.includes(NOTICE_LINE));
    assert.ok(/not available/i.test(pages.noticePage(INDEX(), 29901, DOC(), ctx())), 'no notice for that event');
    assert.ok(/not available/i.test(pages.noticePage(INDEX(), 1, DOC(), ctx())), 'unknown id: a page, not an error');
    for (const f of ['event-pages.js', 'catalog-pages.js', 'server.js', 'make-event-notices.js']) {
      assert.ok(!fs.readFileSync(path.join(__dirname, f), 'utf8').includes('SQUARE ENIX BRIDGE |'), f);
    }
  },
  // the details page: the merged «On this server» box at the top, every label in use (event and quests) with its reason,
  // Rebuilt values closed; quests not served yet shown with the reason in plain words
  on_this_server_box() {
    const html = pages.detailPage(INDEX(), 29900, { ...ctx(), fromCatalog: true, hasNotice: (id) => id === 'E-0' });
    const box = html.slice(html.indexOf('<div class="sb">'), html.indexOf('<h2>'));
    assert.ok(box.includes('On this server') && box.includes('NOT ORIGINAL'));
    assert.ok(/<details class="rb">/.test(box) && !/<details class="rb" open/.test(box), 'Rebuilt values closed');
    for (const l of ['dramaOff', 'eventCoins', 'donorKept']) assert.ok(box.includes(REASONS[l].replace(/'/g, '&#39;')) || box.includes(REASONS[l]), `reason of ${l}`);
    assert.ok(box.includes('Past event'), 'status');
    assert.ok(box.includes('data-pin="/web/event/keep/29900"'), 'Keep button in the box');
    assert.ok(box.includes('/web/event/notice/29900?from=event'), 'link to the original notice');
    assert.ok(box.includes('/web/event/catalog'), 'link to the catalogue');
    assert.ok(html.indexOf('<div class="sb">') < html.indexOf('<h2>'), 'box first');
    assert.ok(html.includes('Not served yet') && /being searched/.test(html), 'not served quest in plain words');
    assert.ok(!html.includes('2001234'), 'no enemy id for the player');
    assert.ok(html.includes('href="/web/event/catalog#q29900"'), 'BACK');
    assert.strictEqual(pages.detailPage(INDEX(), 12345, ctx()), null, 'unknown id');
    // a record with nothing served: listed with its quests and why
    const lost = pages.detailPage(INDEX(), 29909, ctx());
    assert.ok(lost.includes('Not restored yet') && lost.includes('Not served yet'));
  },
  // the shared parts are one module: the raid pages use it (no copy of the box, bands or notice card CSS)
  // one card per original evStage row (Part 2 Task 5): the catalogue keeps one entry per record, its details page lists the rows
  // (card, dates, quests) and the Details of a row card (its own id) open the record's notice and details
  rows_listed() {
    const ix = INDEX();
    ix.entries[0].rows = [{ evStageId: 29900, start: '2019-03-01', end: '2019-03-07', stageIds: [4009904], quests: 1, available: true },
      { evStageId: 29930, start: '2019-03-02', end: '2019-03-02', days: ['2019-03-02'], stageIds: [], quests: 1, available: false }];
    const cat = pages.catalogPage(ix, ctx());
    assert.strictEqual((cat.match(/class="row /g) || []).length, 4, 'one catalogue row per record');
    assert.ok(!cat.includes('id="q29930"'));
    const d = pages.detailPage(ix, 29900, ctx());
    assert.ok(d.includes('<h2>Cards</h2>') && d.includes('Mar 2, 2019'), 'the rows with dates');
    assert.ok(!d.includes('/img/v1/29930.png'), 'no card image for a row not built (its card is never written)');
    assert.ok(/Not served yet/.test(d.slice(d.indexOf('<h2>Cards</h2>'))), 'a row without a served quest says so');
    assert.ok(pages.detailPage(ix, 29930, ctx()).includes('<h1>March Fun</h1>'), 'a row id opens the record');
    assert.ok(pages.noticePage(ix, 29930, DOC(), ctx()).includes(NOTICE_LINE), 'Details of a row card: the record notice');
  },
  // Part 3 Task 6: an entry with a board set lists its boards and their cells; the unlocked cells are marked done (every cell of a
  // served board has a cost and a reward since 08-11: no «not restored yet» cell)
  event_board_items() {
    const ix = INDEX();
    ix.entries[0].boardSet = 'S1';
    ix.boardSets = { S1: { boardIds: [7001, 7002], chains: { 7002: 7001 }, censusIds: ['E-0', 'E-1'] } };
    const boards = {
      7001: { id: 7001, name: 'Board #1: Fixture', done: false, finish: 'Fixture Medal', cells: [{ n: 1, cost: 100, reward: 'Fixture Gem', done: true }, { n: 2, cost: 200, reward: 'Jewels x50', done: false },
        { n: 3, cost: 900, reward: 'Fixture Medal x2', done: true }, { n: 5, cost: 1000, reward: 'Jewels x500', done: false }] },
      7002: { id: 7002, name: 'Board #2: Fixture', done: true, finish: '', cells: [{ n: 3, cost: 50, reward: 'Max HP +3', done: true }] },
    };
    const c = ctx({ eventBoard: (id) => boards[id] || null, eventCoins: () => 1234 });
    const d = pages.detailPage(ix, 29900, c);
    const sec = d.slice(d.indexOf('<h2>Event Boards</h2>'));
    assert.ok(sec.length < d.length, 'an Event Boards section');
    assert.ok(sec.includes('Board #1: Fixture') && sec.includes('Board #2: Fixture'), 'both boards, in set order');
    assert.ok(sec.indexOf('Board #1') < sec.indexOf('Board #2'));
    const b1 = sec.slice(sec.indexOf('Board #1'), sec.indexOf('Board #2'));
    assert.ok(b1.includes('Fixture Medal x2') && b1.includes('Jewels x500') && b1.includes('900') && b1.includes('1,000'), 'rewards and costs');
    assert.strictEqual((b1.match(/class="cd"/g) || []).length, 2, 'two unlocked cells carry the done mark (1 and 3)');
    assert.ok(!/Not restored yet/.test(sec), 'no pass-through cell any more');
    assert.strictEqual((b1.match(/<td>Not unlocked<\/td>/g) || []).length, 2);
    assert.ok(b1.includes('Board complete') && b1.includes('Fixture Medal'), 'the reward of the finished board');
    assert.ok(sec.includes('Max HP +3'));
    // an entry without a set, or a master without that board: no section, no error
    assert.ok(!pages.detailPage(ix, 29901, c).includes('Event Boards</h2>'), 'no set: no section');
    assert.ok(!pages.detailPage(ix, 29900, ctx()).includes('<h2>Event Boards</h2>'), 'no lookups: no section');
    assert.ok(!pages.detailPage(ix, 29900, ctx({ eventBoard: () => null, eventCoins: () => 0 })).includes('<h2>Event Boards</h2>'), 'no board served: no section');
  },
  // user 08-11: an informative notice with no original banner and no quest (noQuests 'board', e.g. EV-0579 «New Event Coins
  // Available in October!») is not an event: not in the catalogue, no page. A playable event with a banner whose quests are not
  // served yet stays listed with its reason (E-9), and so does a coin event with its card (noQuests 'coin', EV-0242)
  informative_notice_not_listed() {
    const ix = INDEX();
    ix.entries.push({ censusId: 'E-579', evStageId: 29979, name: 'New Coins Notice', start: '2019-03-20', end: '2019-04-20', stageIds: [], available: false, labels: [], noticeIds: [9003],
      quests: [], noQuests: 'board', boardSetKey: 'S1', reason: 'board', why: 'no quests of its own' },
    { censusId: 'E-242', evStageId: 29942, name: 'Coin Challenge', start: '2019-03-21', end: '2019-03-28', stageIds: [], available: false, labels: [], noticeIds: [], quests: [], noQuests: 'coin', reason: 'coin' });
    ix.boardSets = { S1: { boardIds: [7001], chains: {}, censusIds: ['E-0', 'E-579'] } };
    const html = pages.catalogPage(ix, ctx());
    assert.ok(!html.includes('id="q29979"') && !html.includes('New Coins Notice'), 'the informative notice is not listed');
    assert.ok(rowOf(html, 29909).includes('Not restored yet'), 'an unserved playable event stays');
    assert.ok(rowOf(html, 29942), 'a coin event with its card stays');
    assert.ok(html.includes('5 events'), 'not counted');
    assert.strictEqual(pages.detailPage(ix, 29979, ctx({ eventBoard: () => ({ id: 7001, name: 'B', done: false, finish: '', cells: [] }) })), null, 'no page');
    // the boards stay reachable through the playable event of the set
    ix.entries[0].boardSet = 'S1';
    const d = pages.detailPage(ix, 29900, ctx({ eventBoard: (id) => ({ id, name: 'Board #1: Fixture', done: false, finish: '', cells: [] }), eventCoins: () => 7 }));
    assert.ok(d.includes('<h2>Event Boards</h2>') && d.includes('Board #1: Fixture'));
  },
  // Part 3 Task 8: «shared by N events» counts only the events listed in the catalogue (an informative notice of the set, like
  // EV-0579 on the 2018-10 pages, is not counted: 9 censusIds, 8 listed events)
  shared_count_listed_only() {
    const ix = INDEX();
    ix.entries.push({ censusId: 'E-579', evStageId: 29979, name: 'New Coins Notice', start: '2019-03-20', end: '2019-04-20', stageIds: [], available: false, labels: [], noticeIds: [9003],
      quests: [], noQuests: 'board', boardSetKey: 'S1', reason: 'board', why: 'no quests of its own' });
    ix.entries[0].boardSet = 'S1'; ix.entries[1].boardSet = 'S1';
    ix.boardSets = { S1: { boardIds: [7001], chains: {}, censusIds: ['E-0', 'E-1', 'E-579'] } };
    const c = ctx({ eventBoard: () => ({ id: 7001, name: 'Board #1', done: false, finish: '', cells: [] }), eventCoins: () => 0 });
    const line = (/<p class="ecoin">(.*?)<\/p>/.exec(pages.detailPage(ix, 29900, c)) || [])[1] || '';
    assert.ok(line.includes('shared by 2 events'), line);
    // only one listed event left in the set: no «shared by» at all
    ix.boardSets.S1.censusIds = ['E-0', 'E-579'];
    const one = (/<p class="ecoin">(.*?)<\/p>/.exec(pages.detailPage(ix, 29900, c)) || [])[1] || '';
    assert.ok(!/shared by/.test(one), one);
  },
  // the coin line: the balance of the set and the note that coins never expire (one balance per set, shared by its events)
  event_coins_label() {
    const ix = INDEX();
    ix.entries[0].boardSet = 'S1';
    ix.boardSets = { S1: { boardIds: [7001], chains: {}, censusIds: ['E-0', 'E-1'] } };
    const c = ctx({ eventBoard: () => ({ id: 7001, name: 'Board #1', done: false, finish: '', cells: [] }), eventCoins: (k) => (k === 'S1' ? 1234 : 0) });
    const d = pages.detailPage(ix, 29900, c);
    const line = (/<p class="ecoin">(.*?)<\/p>/.exec(d) || [])[1] || '';
    assert.ok(line.includes('1,234'), line);
    assert.ok(/never expire/i.test(line) && /one balance/i.test(line), line);
    assert.ok(line.includes('2 events'), 'the set is shared by its events');
    // texts: paid now, and the two reasons a set is not handed out
    const e = ix.entries[0];
    e.labels = ['eventCoins', 'boardsLater'];
    e.quests[0].labels = ['noCoinSource'];
    const r = pages.detailPage(ix, 29900, ctx());
    assert.ok(!/not paid yet|come with the event boards/i.test(r), 'no stale text');
    assert.ok(/Boosters/.test(r) && /no quest pays/i.test(r), 'short texts of boardsLater and noCoinSource');
  },
  shared_parts_not_copied() {
    const src = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
    for (const f of ['raid-pages.js', 'event-pages.js']) {
      assert.ok(src(f).includes("require('./catalog-pages')"), f);
      assert.ok(!src(f).includes('.rg>b{display:block'), `${f}: no copy of the band CSS`);
      assert.ok(!src(f).includes('.onc{border:1px solid'), `${f}: no copy of the notice card CSS`);
    }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}

// ---- make-event-notices.js: the notices of the events, from the private notice texts (synthetic here) ----
try {
  const mk = require('./make-event-notices');
  const text = ['3rd Fun | KINGDOM HEARTS Union χ | SQUARE ENIX BRIDGE', 'March Fun notice', '02/28/2019 07:00 (UTC)', 'EVENT', 'KINGDOM HEARTS Union χ', NOTICE_LINE, 'Top of Page'].join('\n');
  const doc = mk.build({ entries: INDEX().entries, noticeText: { 9001: text } });
  assert.deepStrictEqual(doc.rows['E-0'], { noticeIds: [9001] });
  assert.strictEqual(doc.notices[9001].title, 'March Fun notice');
  assert.deepStrictEqual(doc.notices[9001].body, [NOTICE_LINE]);
  assert.deepStrictEqual(doc.missing, [{ censusId: 'E-1', noticeId: 9002 }]);
  assert.ok(/git-ignored/.test(doc.note));
  assert.ok(mk.OUT.replace(/\\/g, '/').endsWith('game_data/event_notices.json'), 'written under the git-ignored game_data');
  console.log('ok notice_generator');
} catch (e) { failed++; console.error(`FAIL notice_generator: ${e.message}`); }

// ---- server.js: the routes on fixture files; the notice file read at request time ----
function wiring() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-test-event-pages-'));
  process.env.KHUX_SAVE = path.join(dir, 'save.json');
  process.env.KHUX_RAID_INDEX = path.join(dir, 'raids.json');
  process.env.KHUX_EVENT_INDEX = path.join(dir, 'events.json');
  process.env.KHUX_EVENT_NOTICES = path.join(dir, 'event_notices.json');
  process.env.KHUX_EVENT_IMG = path.join(dir, 'event_img');
  fs.writeFileSync(process.env.KHUX_RAID_INDEX, JSON.stringify({ entries: [], reasons: {} }));
  // dates far from the Story of a new save: E-0 past (2015), E-3 later (2099)
  const ix = INDEX();
  Object.assign(ix.entries[0], { start: '2015-01-01', end: '2015-01-07' });
  Object.assign(ix.entries[2], { start: '2099-01-01', end: '2099-01-07' });
  fs.writeFileSync(process.env.KHUX_EVENT_INDEX, JSON.stringify(ix));
  const log = console.log, warn = console.warn;
  const quiet = (fn) => { console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = log; console.warn = warn; } };
  try {
    const { _test: t } = quiet(() => require('./server'));
    const web = (fn, url) => { const r = { code: 0, body: '' }; quiet(() => fn({ writeHead(c) { r.code = c; }, end(x) { r.body = x ? x.toString('utf8') : ''; } }, url)); return r; };
    quiet(() => t.respondUserCreate({ writeHead() {}, end() {} }, { name: 'Prova', unionId: 1 }));
    assert.strictEqual(t.route('/web/event/catalog'), 'eventweb');
    const cat = web(t.respondEventWeb, '/web/event/catalog');
    assert.strictEqual(cat.code, 200);
    assert.ok(cat.body.includes('Event Catalog') && cat.body.includes('id="q29900"'));
    assert.strictEqual(web(t.respondEventWeb, '/web/event/event/29900?from=catalog').code, 200);
    assert.strictEqual(web(t.respondEventWeb, '/web/event/event/1').code, 404);
    // no notice file yet: a page that says so; written now: seen at the next request, no restart
    assert.ok(/not available/i.test(web(t.respondEventWeb, '/web/event/notice/29900').body));
    fs.writeFileSync(process.env.KHUX_EVENT_NOTICES, JSON.stringify(DOC()));
    assert.ok(web(t.respondEventWeb, '/web/event/notice/29900?from=event').body.includes(NOTICE_LINE));
    // card pictures: the card, else 0.png, else 404
    assert.strictEqual(web(t.respondEventWeb, '/web/event/img/v1/29900.png').code, 404);
    fs.mkdirSync(process.env.KHUX_EVENT_IMG);
    fs.writeFileSync(path.join(process.env.KHUX_EVENT_IMG, '0.png'), 'png');
    assert.strictEqual(web(t.respondEventWeb, '/web/event/img/v1/29900-kept.png').code, 200);
    // keep / unkeep (POST)
    const k = web(t.respondEventPost, '/web/event/keep/29900');
    assert.deepStrictEqual([k.code, JSON.parse(k.body)], [200, { ok: true }]);
    assert.strictEqual(web(t.respondEventPost, '/web/event/keep/29903').code, 409);
    assert.deepStrictEqual(JSON.parse(web(t.respondEventPost, '/web/event/unkeep').body), { ok: true });
    console.log('ok wiring_pages');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}
try { wiring(); } catch (e) { failed++; console.error(`FAIL wiring: ${e.stack}`); }

if (failed) { console.error(`test-event-pages: ${failed} FAIL`); process.exit(1); }
console.log('test-event-pages: OK');
process.exit(0);
