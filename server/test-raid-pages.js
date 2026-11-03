// Raid Catalog pages (plan docs/superpowers/plans/2026-11-02-raids-part2.md Task 9): one minimal row per census row (a raid
// week), period tabs and year chips, one status line, at most one Keep button, a details page per raid. Fixture index only.
//   node server/test-raid-pages.js
'use strict';
const assert = require('assert');
const pages = require('./raid-pages');
const calendar = require('./raid-calendar');

const PERIODS = [{ n: 1, name: 'Launch', from: '2016-04-07', to: '2016-09-18' }, { n: 2, name: 'Expansion', from: '2016-09-19', to: '2018-05-24' },
  { n: 3, name: 'Ver 2.6.0', from: '2018-05-25', to: '2020-05-22' }, { n: 4, name: 'Pre-Dark Road', from: '2020-05-23', to: '2020-11-15' },
  { n: 5, name: 'Last', from: '2020-11-16', to: '2021-05-31' }];

const tier = (censusId, evStageId, start, end, t, boss, extra = {}) => ({ key: `${censusId}/${t}`, censusId, family: 'weekly', start, end, tier: t, boss, available: true, why: null,
  stageId: 980000 + evStageId, evStageId, level: 25, hp: 150000000, upMinutes: 20, useAp: 10, questAp: [0, 5, 90], boards: ['Enhancement Boards'], sphereBoardIds: [3000000 + evStageId], ...extra });
function index() {
  return { reasons: { atk: 'No ATK of a raid is known after 2016.' }, catalog: { evStageId: 8000, stageIds: [970000] }, entries: [
    tier('WW-W-2018-09-03', 8071, '2018-09-03', '2018-09-09', 'single', 'Merry-Go-Rowdy', { family: 'radiant reward', boards: ['Radiant', 'Enhancement'] }),
    tier('WW-W-2019-10-07', 8100, '2019-10-07', '2019-10-13', 'Beginner', 'Trickmaster'),
    tier('WW-W-2019-10-07', 8100, '2019-10-07', '2019-10-13', 'Advanced', 'Blue Trident Tail', { reconstructed: ['atk'] }),
    tier('WW-W-2019-10-07', 8100, '2019-10-07', '2019-10-13', 'Epic', 'Blue Trident Tail', { available: false, why: 'graphics' }),
    tier('WW-W-2019-10-14', 8101, '2019-10-14', '2019-10-20', 'Beginner', 'Trickmaster'),
    tier('WW-W-2020-06-01', 8150, '2020-06-01', '2020-06-07', 'Beginner', 'Darkside', { available: false, why: 'graphics' }),
    tier('WW-W-2020-12-07', 8180, '2020-12-07', '2020-12-13', 'Legendary', "Tom & Jerry's Ω <Boss>", { boards: ['Moogle & Co. Board'] }),
  ] };
}
// the player's Shop week holds 2019-10-14: 2018-09-03 and 2019-10-07 are past, 2020 rows later
function ctx(extra = {}) {
  const ix = extra.index || index();
  const week = { shopFrom: '2019-10-17', shopTo: '2019-10-23' };
  return { ...week, current: new Set(calendar.weekRows(ix, week).map((r) => r.censusId)), kept: null, periods: PERIODS,
    unlockQuestOf: (row) => (row.start >= '2020-11-16' ? null : 612), boardItems: (id) => (id === 3008180 ? ['Sora & Moogle B', 'Mythril Shard'] : ['Lux Crystal']),
    imgVersion: 3, ...extra };
}
// the HTML of one catalogue row (from its opening div to the next row)
function rowOf(html, evStageId) {
  const i = html.indexOf(`id="q${evStageId}"`);
  assert(i >= 0, `row q${evStageId} present`);
  const start = html.lastIndexOf('<div class="row', i), end = html.indexOf('<div class="row', i);
  return html.slice(start, end < 0 ? html.indexOf('</div><div class="ov"', i) : end);
}
const count = (s, sub) => s.split(sub).length - 1;

const tests = {
  catalog_rows_group_by_census() {
    const rows = calendar.catalogRows(index());
    assert.deepStrictEqual(rows.map((r) => r.censusId), ['WW-W-2018-09-03', 'WW-W-2019-10-07', 'WW-W-2019-10-14', 'WW-W-2020-06-01', 'WW-W-2020-12-07'], 'one per census row, by date');
    const r = rows[1];
    assert.deepStrictEqual([r.evStageId, r.start, r.end, r.family], [8100, '2019-10-07', '2019-10-13', 'weekly']);
    assert.deepStrictEqual(r.bosses, ['Trickmaster', 'Blue Trident Tail']);
    assert.deepStrictEqual(r.entries.map((e) => e.tier), ['Beginner', 'Advanced', 'Epic']);
    assert.strictEqual(r.available, true, 'one available tier is enough');
    assert.strictEqual(rows[3].available, false);
  },
  row_states() {
    const c = ctx(), rows = calendar.catalogRows(index());
    const st = (id) => calendar.rowState(rows.find((r) => r.censusId === id), c);
    assert.strictEqual(st('WW-W-2018-09-03'), 'can');
    assert.strictEqual(st('WW-W-2019-10-07'), 'can');
    assert.strictEqual(st('WW-W-2019-10-14'), 'now');
    assert.strictEqual(st('WW-W-2020-06-01'), 'removed', 'no available tier: not restored, whatever the date');
    assert.strictEqual(st('WW-W-2020-12-07'), 'later');
    assert.strictEqual(calendar.rowState(rows[0], { ...c, kept: 'WW-W-2018-09-03' }), 'kept');
    assert.strictEqual(calendar.rowState(rows[0], { ...c, shopFrom: '', shopTo: '' }), 'later', 'no story week yet: every raid is later');
  },
  lists_every_row() {
    const html = pages.catalogPage(index(), ctx());
    for (const id of [8071, 8100, 8101, 8150, 8180]) assert.strictEqual(count(html, `id="q${id}"`), 1, `row ${id} once`);
    assert.strictEqual(count(html, '<div class="row'), 5, 'one row per census row, not per tier');
    const r = rowOf(html, 8100);
    assert(/Trickmaster/.test(r) && /Blue Trident Tail/.test(r), 'bosses');
    assert(/Beginner/.test(r) && /Advanced/.test(r), 'tiers');
    assert(/Oct 7, 2019/.test(r), 'dates');
    assert(/data-periods="3"/.test(r), 'period of its start');
    assert(/data-y="2019"/.test(r), 'year chip');
    assert(/Enhancement Boards/.test(r), 'boards (search)');
    assert(/src="\/web\/raid\/img\/v3\/8100\.png"/.test(r), 'the week card, versioned URL');
    assert(/href="\/web\/raid\/raid\/8100\?from=catalog"/.test(r), 'details page');
    // period tabs: All plus the five periods, the Story's period marked Now; year chips of the rows
    assert.strictEqual(count(html, ' data-p="'), 6);
    assert(/data-p="3"><b>Ver 2\.6\.0<\/b><span class="now">Now<\/span>/.test(html), 'current period marked');
    for (const y of ['2018', '2019', '2020']) assert(html.includes(`data-yr="${y}"`), `year ${y}`);
    assert(/<title>Raid Catalog<\/title>/.test(html));
    // the Filters sheet: FIND with the word-start rule, TYPE, TIER, SHOW; the «Matches:» line is the page script's
    assert(/id="fq"/.test(html) && /Matches the start of words/.test(html));
    assert(/data-g="type"/.test(html) && /data-g="tier"/.test(html) && /data-g="show"/.test(html));
    assert(html.includes("'Matches: '"), 'Matches line');
    // the search names: the board rewards of the row's boards
    assert(/Sora &amp; Moogle B/.test(rowOf(html, 8180)), 'board rewards are searchable');
    assert(pages.khuxMatch('sora moo', 'Sora & Moogle B') && !pages.khuxMatch('oogle', 'Sora & Moogle B'), 'word-start match');
  },
  // PROGRESS filter (user 03-11): Completed = every playable tier of the week (available) has all its objectives done
  // (ctx.stageDone, the crown rule); a tier not restored does not count; no playable tier = Incomplete. Gold crown after the name.
  progress_completed_incomplete() {
    const ix = index();
    ix.entries.forEach((t, i) => { t.stageId = 990000 + i; }); // 8071 | 8100 Beginner, Advanced, Epic (not restored) | 8101 | 8150 (not restored) | 8180
    const page = (done) => pages.catalogPage(ix, ctx({ index: ix, stageDone: (sid) => done.includes(sid) }));
    const dn = (html, id) => (/data-done="([01])"/.exec(rowOf(html, id)) || [])[1];
    const html = page([990000, 990001, 990004, 990005, 990006]);
    assert.strictEqual(dn(html, 8071), '1', 'one tier, done');
    assert.strictEqual(dn(html, 8100), '0', 'Advanced missing');
    assert.strictEqual(dn(html, 8101), '1');
    assert.strictEqual(dn(html, 8150), '0', 'no playable tier: incomplete');
    assert.strictEqual(dn(html, 8180), '1');
    assert.strictEqual(dn(page([990001, 990002]), 8100), '1', 'the tier not restored (Epic) does not count');
    const crown = '/web/special/icon/done.png';
    assert(rowOf(html, 8071).includes(crown) && !rowOf(html, 8100).includes(crown) && !rowOf(html, 8150).includes(crown), 'crown on completed rows only');
    assert.strictEqual(count(rowOf(html, 8071), 'class="s s-'), 1, 'still one status line');
    assert(/data-g="prog"/.test(html) && /PROGRESS/.test(html) && /data-v="done"><img[^>]*done\.png[^>]*>Completed</.test(html) && /data-v="todo"><img[^>]*todo\.png[^>]*>Incomplete</.test(html), 'PROGRESS chips');
    const none = pages.catalogPage(index(), ctx());
    assert(!/data-done="1"/.test(none) && !rowOf(none, 8071).includes(crown), 'no lookup: nothing completed');
  },
  // RAID BOARDS filter (user 03-11, ours): a raid's boards are completed when every Raid Board of its playable tiers is complete
  // in the save (ctx.boardDone, the rule of the board screen: every node unlocked); no board = neither completed nor not.
  raid_boards_filter() {
    const ix = index(); // boards: 8071 3008071 | 8100 3008100 + 3008200 (Advanced) + 3009100 (Epic, not restored) | 8101 none | 8180 3008180
    ix.entries[2].sphereBoardIds = [3008100, 3008200];
    ix.entries[3].sphereBoardIds = [3009100];
    ix.entries[4].sphereBoardIds = [];
    const page = (done) => pages.catalogPage(ix, ctx({ index: ix, boardDone: (id) => done.includes(id) }));
    const bd = (html, id) => (/data-boards="(\w+)"/.exec(rowOf(html, id)) || [])[1];
    const html = page([3008071, 3008100, 3008180]);
    assert.strictEqual(bd(html, 8071), 'done');
    assert.strictEqual(bd(html, 8100), 'todo', 'the Advanced board 3008200 is not complete');
    assert.strictEqual(bd(page([3008100, 3008200]), 8100), 'done', 'the board of a tier not restored (Epic) does not count');
    assert.strictEqual(bd(html, 8101), 'none', 'no board: neither');
    assert.strictEqual(bd(html, 8150), 'none', 'not restored, no board');
    assert.strictEqual(bd(html, 8180), 'done');
    assert.strictEqual(bd(pages.catalogPage(ix, ctx({ index: ix })), 8071), 'todo', 'no lookup: nothing completed');
    assert(/<h4>RAID BOARDS<\/h4><div class="opts" data-g="bd">/.test(html), 'RAID BOARDS group');
    assert(/data-v="done"><img[^>]*unlocked\.png[^>]*>Completed</.test(html) && /data-v="todo"><img[^>]*lock\.png[^>]*>Not completed</.test(html), 'chips with the padlock icons');
    assert(html.includes('Raid Boards: '), 'summary tag label');
    assert.strictEqual(count(rowOf(html, 8071), 'class="s s-'), 1, 'still one status line');
  },
  one_status_line_at_most_one_button() {
    const html = pages.catalogPage(index(), ctx({ kept: 'WW-W-2018-09-03' }));
    for (const id of [8071, 8100, 8101, 8150, 8180]) {
      const r = rowOf(html, id);
      assert.strictEqual(count(r, 'class="s s-'), 1, `row ${id}: one status line`);
      assert(count(r, 'class="pk"') <= 1, `row ${id}: at most one button`);
    }
    assert(/Kept in the raid list/.test(rowOf(html, 8071)));
    assert(/data-on="0"/.test(rowOf(html, 8071)), 'kept: Remove button');
    assert(/data-on="1"/.test(rowOf(html, 8100)) && /Keep in Events/.test(rowOf(html, 8100)), 'past: Keep button');
    assert(/Replaces: Merry-Go-Rowdy/.test(rowOf(html, 8100)), 'keeping replaces the kept one');
    assert(/In Events this week/.test(rowOf(html, 8101)) && !/class="pk"/.test(rowOf(html, 8101)), 'now: no button');
    assert(/class="row [^"]*\bpinned\b/.test(rowOf(html, 8071)) && /class="row [^"]*\bnow\b/.test(rowOf(html, 8101)) && /class="row [^"]*\bcan\b/.test(rowOf(html, 8100)), 'coloured side bars');
  },
  not_restored_row() {
    const html = pages.catalogPage(index(), ctx());
    const r = rowOf(html, 8150);
    assert(/Not restored yet/.test(r));
    assert(!/class="pk"/.test(r), 'no Keep button');
    assert(/class="row [^"]*\boff\b/.test(r));
    const d = pages.detailPage(index(), 8150, ctx());
    assert(/Not restored yet/.test(d) && !/class="pk"/.test(d));
    // a partial week: the missing tier says so on the details page, the row stays keepable
    const p = pages.detailPage(index(), 8100, ctx());
    assert(/Epic[\s\S]*Not restored yet/.test(p), 'the missing tier');
    assert(/class="pk"/.test(p));
  },
  later_locked() {
    const html = pages.catalogPage(index(), ctx());
    const r = rowOf(html, 8180);
    assert(/Unlocks at Story Quest 612/.test(rowOf(pages.catalogPage(index(), ctx({ unlockQuestOf: () => 612 })), 8180)));
    assert(/Not reached in this version of the Story/.test(r), 'no Story quest reaches it');
    assert(!/class="pk"/.test(r), 'cannot be kept');
    const d = pages.detailPage(index(), 8180, ctx({ unlockQuestOf: () => 612 }));
    assert(/Unlocks at Story Quest 612/.test(d) && !/class="pk"/.test(d));
  },
  detail_page() {
    const d = pages.detailPage(index(), 8100, ctx());
    assert(/<h1>Trickmaster · Blue Trident Tail<\/h1>/.test(d));
    assert(/src="\/web\/raid\/img\/v3\/8100\.png"/.test(d), 'banner');
    assert(/Oct 7, 2019/.test(d) && /Oct 13, 2019/.test(d), 'dates');
    assert(/<td>Beginner<\/td><td>Trickmaster<\/td>/.test(d) && /<td>Advanced<\/td><td>Blue Trident Tail<\/td>/.test(d), 'tier table');
    assert(/150,000,000/.test(d), 'HP');
    assert(/Enhancement Boards/.test(d) && /Lux Crystal/.test(d), 'boards and their rewards');
    assert(d.includes('<h2>Reconstructed values</h2><p>ATK.</p>'), 'reconstructed values in the player\'s words');
    assert(!/No ATK of a raid is known after 2016/.test(d), 'not the builder\'s notes');
    // other weeks of the same bosses, newest first, each a link to its page
    const other = d.slice(d.indexOf('Other weeks'));
    assert(other.indexOf('/web/raid/raid/8101') >= 0, 'Trickmaster again on 2019-10-14');
    assert(!d.includes('class="back"'), 'no BACK without from=catalog');
    assert(/class="back" href="\/web\/raid\/catalog#q8100"/.test(pages.detailPage(index(), 8100, ctx({ fromCatalog: true }))));
    assert.strictEqual(pages.detailPage(index(), 1234, ctx()), null, 'unknown id');
    // newest first
    const ix = index();
    ix.entries.push(tier('WW-W-2020-01-06', 8120, '2020-01-06', '2020-01-12', 'Beginner', 'Trickmaster'));
    const o = pages.detailPage(ix, 8100, ctx({ index: ix }));
    const tail = o.slice(o.indexOf('Other weeks'));
    assert(tail.indexOf('/web/raid/raid/8120') < tail.indexOf('/web/raid/raid/8101'), 'newest first');
  },
  off_today_row() {
    // review b597b99: a row of the Shop week that is not listed now (Task 10 weekend / daily rows): neither later nor keepable
    const ix = index();
    ix.entries.push(tier('WW-D-2019-10-19', 8110, '2019-10-19', '2019-10-20', 'Beginner', 'Darkside'));
    const html = pages.catalogPage(ix, ctx({ index: ix }));
    const r = rowOf(html, 8110);
    assert(/data-show="other"/.test(r) && /This week, not open now/.test(r), 'its own status');
    assert(!/Unlocks at Story Quest/.test(r) && !/class="pk"/.test(r));
  },
  html_escape() {
    const html = pages.catalogPage(index(), ctx());
    const r = rowOf(html, 8180);
    assert(r.includes("Tom &amp; Jerry's Ω &lt;Boss&gt;"), 'name intact, escaped');
    assert(!r.includes('<Boss>'), 'no raw tag');
    assert(r.includes('Moogle &amp; Co. Board'));
    const ix = index();
    ix.entries.push(tier('WW-Q', 8190, '2021-01-04', '2021-01-10', 'Odd"Tier<x>', 'Q'));
    const q = rowOf(pages.catalogPage(ix, ctx({ index: ix })), 8190);
    assert(q.includes('data-tier="odd&quot;tier&lt;x&gt;"') && q.includes('Odd&quot;Tier&lt;x&gt;'), 'tier values escaped');
    const d = pages.detailPage(index(), 8180, ctx());
    assert(d.includes("<h1>Tom &amp; Jerry's Ω &lt;Boss&gt;</h1>"));
    assert(d.includes("<title>Tom &amp; Jerry's Ω &lt;Boss&gt;</title>"));
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
if (failed) { console.error(`test-raid-pages: ${failed} FAIL`); process.exit(1); }
console.log('test-raid-pages: OK');
