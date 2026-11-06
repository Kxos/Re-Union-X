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
