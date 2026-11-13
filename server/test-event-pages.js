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
// the catalogue with its rows written out (sent packed since Events Part 4 Task 4, as the Raid Catalog: catalog-pages.js packCatalog)
const catalog = (...a) => pages.expandCatalog(pages.catalogPage(...a));

const REASONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_config.json'), 'utf8')).reconstructedWhy;
const REASON_TEXT = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_config.json'), 'utf8')).reasonText;
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
// A minimal DOM of the catalogue page for its year-tab and filter script (run in vm, ES5 as in the WebView): the rows and month
// labels of #rows, the tabs with their counts, the chips of the Filters sheet, the ids the script reads. apply(f) drives the
// sheet as a player does (Filters, Reset, a chip per group, FIND, «Show N results»); shown() = the evStageIds of the rows shown.
function fakePage(raw, hash = '') {
  const html = pages.expandCatalog(raw);
  const attrsOf = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const mk = (tag = '<x>') => {
    const e = { attrs: attrsOf(tag), textContent: '', innerHTML: '', value: '', style: {}, children: [], parentNode: null, q: {}, qa: {} };
    e.className = e.attrs.class || '';
    e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
    e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
    e.querySelector = (sel) => e.q[sel] || null;
    e.querySelectorAll = (sel) => e.qa[sel] || [];
    return e;
  };
  const rowsHtml = html.slice(html.indexOf('<div id="rows">'), html.indexOf('<div id="pinmsg"'));
  const kids = [...rowsHtml.matchAll(/<div class="(?:row [^"]*|ml)"[^>]*>/g)].map((m) => { const e = mk(m[0]); e.q['.mt'] = mk('<div class="mt">'); return e; });
  const byId = {};
  for (const id of ['sum', 'fdot', 'none', 'fbtn', 'fx', 'dim', 'fq', 'freset', 'fok']) byId[id] = mk(`<x id="${id}">`);
  byId.rows = mk('<div id="rows">');
  byId.rows.children = kids;
  for (const k of kids) if (k.attrs.id) byId[k.attrs.id] = k;
  byId.tabs = mk(/<div class="tabs"[^>]*>/.exec(html)[0]);
  byId.tabs.qa['.tab'] = [...html.matchAll(/<button type="button" class="tab[^"]*" data-p="\w+">/g)].map((m) => { const t = mk(m[0]); t.q['.c'] = mk(); t.parentNode = byId.tabs; return t; });
  const boxes = [...html.matchAll(/<div class="opts" data-g="(\w+)">([\s\S]*?)<\/div>/g)].map((m) => {
    const box = mk(`<div class="opts" data-g="${m[1]}">`);
    box.children = [...m[2].matchAll(/<button type="button" class="o[^"]*" data-v="[^"]*"[^>]*>/g)].map((c) => { const o = mk(c[0]); o.parentNode = box; return o; });
    return box;
  });
  let loads = 0;
  const doc = { body: { className: '' }, getElementById: (id) => byId[id] || null, querySelectorAll: (sel) => (sel === '.sheet .opts' ? boxes : []) };
  const win = {};
  const src = /<script>(\(function\(\)\{\/\* year tabs and filters \*\/[\s\S]*?)<\/script>/.exec(raw);
  assert.ok(src, 'filter script');
  require('vm').runInNewContext(src[1], { document: doc, location: { hash }, window: win, kxImgs: () => { loads++; } });
  const box = (g) => boxes.find((b) => b.attrs['data-g'] === g);
  const chip = (g, v) => box(g).children.find((o) => o.attrs['data-v'] === v);
  const apply = (f) => {
    byId.fbtn.onclick();
    byId.freset.onclick({ preventDefault() {} });
    for (const g of ['show', 'prog', 'type']) if (f[g]) box(g).onclick({ target: chip(g, f[g]) });
    if (f.q) { byId.fq.value = f.q; byId.fq.oninput.call(byId.fq); }
    const fok = byId.fok.textContent;
    byId.fok.onclick();
    return fok;
  };
  const shown = () => kids.filter((k) => /(^| )row /.test(k.className) && !/ hide/.test(k.className)).map((k) => Number(k.attrs['data-eid']));
  const tab = (p) => byId.tabs.onclick({ target: byId.tabs.qa['.tab'].find((t) => t.attrs['data-p'] === p) });
  return { html, kids, byId, boxes, chip, apply, shown, tab, win, loads: () => loads };
}
const NOTICE_LINE = 'Fixture line of an event notice, never in the repository.';
const DOC = () => ({ rows: { 'E-0': { noticeIds: [9001] } }, notices: { 9001: { title: 'March Fun notice', date: '2019-02-28', time: '07:00', category: 'EVENT',
  body: ['● March Fun', NOTICE_LINE, '・ a list line', 'Potion x 3'] } } });

const tests = {
  // rows by month (month labels in date order), each with the state of rowState: now / can / kept / later / removed
  catalog_by_period() {
    const html = catalog(INDEX(), ctx());
    const months = [...html.matchAll(/<div class="ml" data-m="([\d-]+)">([^<]+)<\/div>/g)].map((m) => [m[1], m[2]]);
    assert.deepStrictEqual(months, [['2019-03', 'March 2019'], ['2019-04', 'April 2019'], ['2019-05', 'May 2019']]);
    const show = (id) => (/data-show="(\w+)"/.exec(rowOf(html, id)) || [])[1];
    for (const e of INDEX().entries) assert.strictEqual(show(e.evStageId), rowState(e, ctx()), e.censusId);
    assert.deepStrictEqual([29900, 29901, 29903, 29909].map(show), ['can', 'now', 'later', 'removed']);
    assert.ok(rowOf(html, 29903).includes('Unlocks at Story Quest 612'));
    assert.ok(rowOf(html, 29909).includes('Not restored yet'), 'a record with no served quest is listed, never hidden');
    const kept = catalog(INDEX(), ctx({ kept: 'E-0' }));
    assert.strictEqual((/data-show="(\w+)"/.exec(rowOf(kept, 29900)) || [])[1], 'kept');
    assert.ok(rowOf(kept, 29900).includes('Remove from Events'));
    assert.ok(html.includes('Event Catalog') && html.includes('/web/event/event/29900?from=catalog'));
  },
  // only a past event can be kept: the page offers Keep only there, and the route refuses the others
  keep_past_only() {
    const html = catalog(INDEX(), ctx());
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
    const cat = catalog(ix, ctx());
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
    const html = catalog(ix, ctx());
    assert.ok(!html.includes('id="q29979"') && !html.includes('New Coins Notice'), 'the informative notice is not listed');
    assert.ok(rowOf(html, 29909).includes('Not restored yet'), 'an unserved playable event stays');
    assert.ok(rowOf(html, 29942), 'a coin event with its card stays');
    assert.ok(/data-p="all"><b>All years<\/b><small>[^<]*<\/small><span class="c">5<\/span>/.test(html), 'not counted');
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
  // Events Part 4 Task 4: about 340 events in place of 110; a fixture of 400 entries with 6 quests each stays under the budget
  // (the Raid Catalog's: about 100 KB, 150 KB at most), with one row per event and the year tabs usable
  catalog_size_budget() {
    const entries = [];
    for (let i = 0; i < 400; i++) {
      const y = 2018 + Math.floor(i / 100), m = String(1 + (Math.floor(i / 9) % 12)).padStart(2, '0'), d = String(1 + (i % 27)).padStart(2, '0');
      entries.push({ censusId: `EV-${1000 + i}`, evStageId: 21000 + i, name: `Challenge Event Number ${i}: The Long Name`, start: `${y}-${m}-${d}`, end: `${y}-${m}-${d}`,
        stageIds: [4001000 + i * 6], available: i % 3 !== 0, labels: ['wholeDay', 'dramaOff'], noticeIds: [1],
        quests: Array.from({ length: 6 }, (_, k) => (k < 2 ? quest(4001000 + i * 6 + k, { labels: ['donorKept'] }) : NOT_SERVED(4001000 + i * 6 + k, 'enemies not in the master: 2001234'))) });
    }
    const raw = pages.catalogPage({ reasons: REASONS, entries }, ctx({ current: new Set() })), html = pages.expandCatalog(raw);
    const kb = Buffer.byteLength(raw, 'utf8') / 1024;
    assert.ok(kb < 150, `catalogue ${kb.toFixed(1)} KB`);
    assert.strictEqual((html.match(/<div class="row /g) || []).length, 400, 'one row per event');
    assert.deepStrictEqual([...new Set([...html.matchAll(/data-y="(\d+)"/g)].map((x) => x[1]))], ['2018', '2019', '2020', '2021'], 'year of every row (the year tabs)');
  },
  // Part 4 Task 6 (review minor M6): game-year tabs as the Raid Catalog's (All years + one tab per game year with events, count),
  // every row and month label carries its game year; the tab of the player's Story week is open first and only its rows load
  // their cards (lazy loading per tab: kxImgs after the tab filter, never right after the rows are built)
  catalog_year_tabs() {
    const ix = INDEX();
    ix.entries.push({ censusId: 'E-7', evStageId: 29907, name: 'Old Fun', start: '2018-06-01', end: '2018-06-07', stageIds: [4009907], available: true, labels: [], noticeIds: [], quests: [quest(4009907)] },
      { censusId: 'E-8', evStageId: 29908, name: 'Early April', start: '2019-04-02', end: '2019-04-05', stageIds: [4009908], available: true, labels: [], noticeIds: [], quests: [quest(4009908)] });
    const raw = pages.catalogPage(ix, ctx()), html = pages.expandCatalog(raw);
    const tabs = [...raw.matchAll(/<button type="button" class="tab( on)?" data-p="(\w+)"><b>([^<]*)<\/b><small>[^<]*<\/small><span class="c">(\d+)<\/span>/g)].map((m) => [m[2], m[3], Number(m[4]), !!m[1]]);
    // shopFrom 2019-04-08 is game year 3 (Apr 7, 2019 -> Apr 6, 2020): open first; 2019-03 and 2019-04-02 are game year 2
    assert.deepStrictEqual(tabs, [['all', 'All years', 6, false], ['2', 'Year 3', 5, false], ['3', 'Year 4', 1, true]]);
    assert.ok(/<div class="tabs" id="tabs" data-def="3">/.test(raw), 'default tab = game year of the Story week');
    assert.strictEqual(rowOf(html, 29907).match(/data-p="(\d)"/)[1], '2');
    assert.strictEqual(rowOf(html, 29908).match(/data-p="(\d)"/)[1], '2', 'April 2-5 is still the year before the anniversary');
    assert.strictEqual(rowOf(html, 29903).match(/data-p="(\d)"/)[1], '3');
    // the page script: rows built first, then the tab filter, then the cards of the shown rows only
    assert.ok(!/kxImgs\(\);<\/script>/.test(raw.split('id="kxrows"')[1].split('</script>')[1] + '</script>'), 'no card load before the tab filter');
    // run the tab and filter script on the page: only the rows of the open tab are shown, the month label of a hidden month is hidden
    const fp = fakePage(raw), labels = () => fp.kids.filter((k) => k.className.startsWith('ml')).map((k) => [k.attrs['data-m'], !/ hide/.test(k.className)]);
    assert.deepStrictEqual(fp.shown(), [29903]);
    assert.deepStrictEqual(labels(), [['2018-06', false], ['2019-03', false], ['2019-04', false], ['2019-05', true]]);
    assert.ok(fp.loads() >= 1, 'cards of the open tab requested after the filter');
    assert.deepStrictEqual(fp.byId.tabs.qa['.tab'].map((t) => / on/.test(t.className)), [false, false, true]);
    fp.tab('all');
    assert.strictEqual(fp.shown().length, 6, 'All years shows every row');
    fp.tab('2');
    assert.deepStrictEqual(fp.shown(), [29907, 29900, 29909, 29901, 29908]);
    assert.ok(/^<span class="n1">5 events<\/span> in <b>Year 3<\/b> · no filters$/.test(fp.byId.sum.innerHTML), fp.byId.sum.innerHTML);
    // a keep / remove keeps a hidden row hidden (ROWS_JS setRow)
    assert.ok(/el\.className='row '\+pc\[0\]\+\(\/ hide\/\.test\(el\.className\)\?' hide':''\)/.test(raw), 'setRow keeps the tab filter');
  },
  // Filters (user 13-11: «filters like the Raid Catalog»): the «⚙ Filters» button and the sheet with FIND, SHOW, PROGRESS, TYPE in
  // the Raid Catalog's order; TYPE lists only the kinds of the index; every row carries data-type / data-done / data-search
  catalog_filter_sheet() {
    const ix = INDEX();
    ix.entries[1].type = 'GEM';
    ix.entries[2].type = 'QUIZ';
    const raw = pages.catalogPage(ix, ctx()), html = pages.expandCatalog(raw);
    assert.ok(raw.includes('<div class="hdr"><h1>Event Catalog</h1><button type="button" class="fbtn" id="fbtn">⚙ Filters<span class="dot" id="fdot"></span></button></div>'));
    const sheet = html.slice(html.indexOf('<div class="sheet" id="sheet"'), html.indexOf('<div id="pinmsg"'));
    assert.deepStrictEqual([...sheet.matchAll(/<h4>([^<]+)<\/h4>/g)].map((m) => m[1]), ['FIND', 'SHOW', 'PROGRESS', 'TYPE']);
    assert.ok(sheet.includes('placeholder="Event, quest or reward name"') && /<div class="hint">Matches the start of words/.test(sheet));
    const group = (g) => [...((new RegExp(`<div class="opts" data-g="${g}">([\\s\\S]*?)</div>`).exec(sheet) || [])[1] || '').matchAll(/data-v="([^"]+)"[^>]*>(?:<img[^>]*>)?([^<]+)</g)].map((m) => [m[1], m[2]]);
    assert.deepStrictEqual(group('show'), [['all', 'All events'], ['now', 'In Events now'], ['can', 'Can be kept now'], ['kept', 'Kept'], ['later', 'Later in the Story'], ['removed', 'Not restored yet']]);
    assert.deepStrictEqual(group('prog'), [['all', 'All'], ['done', 'Completed'], ['todo', 'Incomplete']]);
    // only the kinds in the index (E-0 and E-9 have no type: Event Quests), in the order of the list
    assert.deepStrictEqual(group('type'), [['all', 'All'], ['EQ', 'Event Quests'], ['GEM', 'Gem Quests'], ['QUIZ', 'Quizzes']]);
    assert.ok(/<div class="foot"><a href="#" class="reset" id="freset">Reset filters<\/a><button type="button" class="ok" id="fok">Show 1 result<\/button><\/div>/.test(sheet), 'results of the open tab');
    assert.ok(raw.includes('<div class="sum" id="sum">') && raw.includes('<div id="none" class="none" style="display:none"></div>'));
    for (const e of ix.entries) {
      const r = rowOf(html, e.evStageId);
      assert.ok(new RegExp(`data-type="${e.type || 'EQ'}" data-done="[01]" data-search="[^"]+">`).test(r), `data attributes of ${e.censusId}`);
      assert.ok(r.includes('<div class="mt"></div>'), 'the «Matches:» line');
    }
    // the narrow layout of the shared catalogues applies (NARROW_CSS: full-width button, one chip per row)
    assert.ok(raw.includes('@media (max-width:700px)') && raw.includes('.fbtn{-webkit-flex:1 1 100%'));
    for (const m of raw.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]); // eslint-disable-line no-new-func
  },
  // FIND: event and quest names (served or not), the type, the Event Board names and rewards (without amounts and stat cells) and
  // the objective rewards of the served quests (ctx.questRewards), each once; PROGRESS: every served quest with all its objectives
  // done (the crown), an event with no served quest is never completed (the Raid Catalog's rule: incomplete)
  catalog_filter_data() {
    const ix = INDEX();
    ix.entries[0].boardSet = 'S1';
    ix.boardSets = { S1: { boardIds: [7001, 7002], chains: {}, censusIds: ['E-0'] } };
    const boards = { 7001: { id: 7001, name: 'Spooky Board', done: false, finish: 'Pumpkin Hat', cells: [{ n: 1, cost: 5, reward: 'Mythril Shard x3', done: false }, { n: 2, cost: 5, reward: 'Max HP +5', done: false }] } };
    let calls = 0;
    const c = ctx({ eventBoard: (id) => { calls++; return boards[id] || null; }, questRewards: (id) => (id === 4009904 ? ['Dewey', 'Jewels', 'Mythril Shard'] : id === 4009905 ? ['Hidden Reward'] : []),
      stageDone: (id) => id === 4009904 || id === 4009910 });
    const html = catalog(ix, c), search = (id) => (/data-search="([^"]*)"/.exec(rowOf(html, id)) || [])[1].split(' | ');
    // a numbered series (Quest 4009904, Quest 4009905) counts once by its name without the number
    assert.deepStrictEqual(search(29900), ['March Fun', 'Quest', 'Event Quests', 'Spooky Board', 'Mythril Shard', 'Pumpkin Hat', 'Dewey', 'Jewels']);
    assert.ok(!search(29900).includes('Hidden Reward'), 'only the rewards of the served quests');
    assert.strictEqual(calls, 2, 'each board asked once');
    assert.deepStrictEqual(search(29909), ['Lost Fun', 'Quest 4009910', 'Event Quests']);
    const ix3 = INDEX();
    ix3.entries[1].quests = ['Organization XIII No. 11 Marluxia I', 'Organization XIII No. 11 Marluxia XIII', 'Coco Challenge 1/10', 'Coco Challenge 10/10', 'The Hidden Menace: Advanced #2',
      'The Hidden Menace: Advanced #3', 'Mickey 90th Anniversary Quiz'].map((name, k) => quest(4009930 + k, { name }));
    assert.deepStrictEqual(catalog(ix3, ctx()).match(/id="q29901"[^>]*data-search="([^"]*)"/)[1].split(' | '),
      ['April Fun', 'Organization XIII No. 11 Marluxia', 'Coco Challenge', 'The Hidden Menace: Advanced', 'Mickey 90th Anniversary Quiz', 'Event Quests']);
    const done = (id) => (/data-done="(\d)"/.exec(rowOf(html, id)) || [])[1];
    // E-0: its one served quest done (the unserved one does not count); E-9: no served quest -> not completed even if its stage is
    assert.deepStrictEqual([29900, 29901, 29903, 29909].map(done), ['1', '0', '0', '0']);
    assert.ok(rowOf(html, 29900).includes('class="ic cw"') && !rowOf(html, 29909).includes('class="ic cw"'), 'the crown of a completed event');
    // the catalogue name and the census name are both found
    const ix2 = INDEX();
    ix2.entries[1].catalogName = 'Spring Party';
    assert.deepStrictEqual(catalog(ix2, ctx()).match(/id="q29901"[^>]*data-search="([^"]*)"/)[1].split(' | ').slice(0, 2), ['Spring Party', 'April Fun']);
  },
  // the filters at work in the page script: SHOW (now + kept), PROGRESS, TYPE, FIND with «Matches:», the summary chips, the
  // counts of the tabs and of «Show N results», the empty-state line, Clear all; a keep re-renders (kxRender)
  catalog_filter_script() {
    const ix = INDEX();
    ix.entries[2].type = 'QUIZ';
    ix.entries.push({ censusId: 'E-7', evStageId: 29907, name: 'Old Fun', start: '2018-06-01', end: '2018-06-07', stageIds: [4009907], available: true, labels: [], noticeIds: [], quests: [quest(4009907)] });
    const raw = pages.catalogPage(ix, ctx({ kept: 'E-7', stageDone: (id) => id === 4009904, questRewards: (id) => (id === 4009901 ? ['Dewey'] : []) }));
    const fp = fakePage(raw), sum = () => fp.byId.sum.innerHTML;
    fp.tab('all');
    assert.deepStrictEqual(fp.shown(), [29907, 29900, 29909, 29901, 29903]);
    assert.strictEqual(fp.apply({ show: 'now' }), 'Show 2 results');
    assert.deepStrictEqual(fp.shown(), [29907, 29901], 'In Events now: the event of the week and the kept one');
    assert.ok(sum().startsWith('<span class="n1">2 events</span> match your filters: <span class="tag">') && sum().includes('In Events now') && sum().includes('Clear all'));
    assert.strictEqual(fp.byId.fdot.textContent, 1);
    assert.deepStrictEqual(fp.byId.tabs.qa['.tab'].map((t) => [t.attrs['data-p'], t.q['.c'].textContent]), [['all', 2], ['2', 2], ['3', 0]]);
    fp.apply({ show: 'kept' });
    assert.deepStrictEqual(fp.shown(), [29907]);
    fp.apply({ show: 'removed' });
    assert.deepStrictEqual(fp.shown(), [29909]);
    fp.apply({ prog: 'done' });
    assert.deepStrictEqual(fp.shown(), [29900]);
    assert.ok(sum().includes('Completed'));
    fp.apply({ prog: 'todo' });
    assert.deepStrictEqual(fp.shown(), [29907, 29909, 29901, 29903], 'an event with no served quest is incomplete');
    fp.apply({ type: 'QUIZ' });
    assert.deepStrictEqual(fp.shown(), [29903]);
    fp.apply({ q: 'dew' });
    assert.deepStrictEqual(fp.shown(), [29901], 'a quest reward');
    const mt = fp.byId.q29901.q['.mt'];
    assert.deepStrictEqual([mt.textContent, mt.style.display], ['Matches: Dewey', 'block'], 'shown over the .mt{display:none} of the CSS');
    assert.ok(sum().includes('Find: &quot;dew&quot;'));
    fp.apply({ q: 'quest 4009903' });
    assert.deepStrictEqual(fp.shown(), [29903], 'a quest name');
    fp.apply({ type: 'QUIZ', prog: 'done' });
    assert.deepStrictEqual(fp.shown(), []);
    assert.deepStrictEqual([fp.byId.none.textContent, fp.byId.none.style.display], ['No completed events match your filters', '']);
    assert.ok(fp.kids.filter((k) => k.className.startsWith('ml')).every((k) => / hide/.test(k.className)), 'no month label without rows');
    fp.byId.sum.onclick.call(fp.byId.sum, { target: { getAttribute: (a) => (a === 'data-x' ? 'all' : null) }, preventDefault() {} });
    assert.strictEqual(fp.shown().length, 5, 'Clear all');
    assert.ok(sum().endsWith(' · no filters'));
    // a keep (ROWS_JS kxRow) changes data-show, then renders the filters again
    fp.apply({ show: 'kept' });
    fp.byId.q29907.attrs['data-show'] = 'can';
    fp.byId.q29900.attrs['data-show'] = 'kept';
    fp.win.kxRender();
    assert.deepStrictEqual(fp.shown(), [29900]);
    assert.ok(/if\(window\.kxRender\)kxRender\(\);\};/.test(raw), 'kxRow renders the filters');
    // BACK from a details page: #q<id> opens the year of that row
    const back = fakePage(raw, '#q29900');
    assert.ok(back.shown().includes(29900));
  },
  // Booster rewards (boosterLater): a served quest with a Booster says it comes with the Boosters; the new reasons in plain words
  booster_and_new_reasons() {
    const ix = INDEX();
    ix.entries[1].quests[0].boosters = [{ objective: 1, emblemName: 'P Booster +25%' }];
    ix.entries[1].quests[0].labels = ['boosterLater'];
    ix.entries[1].quests.push(quest(4009920, { served: false, status: 'not served yet', reason: 'quizTextMissing', why: REASON_TEXT.quizTextMissing }),
      quest(4009921, { served: false, status: 'not served yet', reason: 'boosterOnly', why: REASON_TEXT.boosterOnly }));
    const d = pages.detailPage(ix, 29901, ctx());
    assert.ok(/P Booster \+25%.{0,80}comes with the Boosters/.test(d), 'the Booster line of the quest');
    assert.ok(d.includes('Boosters'), 'the rebuilt values name it');
    assert.ok(d.includes(pages.whyPlain(REASON_TEXT.quizTextMissing, 'quizTextMissing')) && /question/i.test(pages.whyPlain(REASON_TEXT.quizTextMissing, 'quizTextMissing')));
    assert.ok(/Booster/.test(pages.whyPlain(REASON_TEXT.boosterOnly, 'boosterOnly')));
    assert.ok(/reward/i.test(pages.whyPlain('', 'rewardTypeUnknown')));
    // Part 5 Task 3: an objective known only as text (objectiveUnmapped), in plain words without the builder's note
    assert.ok(/objective/i.test(pages.whyPlain('x («Clear within 75 seconds»)', 'objectiveUnmapped')) && !/75/.test(pages.whyPlain('x («Clear within 75 seconds»)', 'objectiveUnmapped')));
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
    assert.ok(cat.body.includes('Event Catalog') && pages.expandCatalog(cat.body).includes('id="q29900"'));
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
