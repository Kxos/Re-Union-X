// Raid Catalog pages (plan docs/superpowers/plans/2026-11-02-raids-part2.md Task 9): one minimal row per census row (a raid
// week), period tabs and year chips, one status line, at most one Keep button, a details page per raid. Fixture index only.
//   node server/test-raid-pages.js
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const pages = require('./raid-pages');
const calendar = require('./raid-calendar');
const special = require('./special-pages');

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
// the catalogue page with its packed rows written out (task 3, 06-11: the page builds them in the browser)
const catalog = (...a) => pages.expandCatalog(pages.catalogPage(...a));
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
  jp_rows_typed_and_marked() {
    // I-232: a Japan-only raid sits in the Japan only section (user 06-11: a section, not a TYPE chip), typed by its JP family,
    // named by its JP family, and can be kept once past
    const ix = index();
    ix.entries.push(tier('JP-SHR-6', 8300, '2016-08-19', '2016-08-21', 'single', 'Blue Trident Tail', { family: 'super-hard weekend', jp: true, region: 'JP', reconstructed: ['jp', 'jpQuest', 'jpBoard'], boards: [] }));
    const c = ctx({ index: ix }), html = catalog(ix, c);
    const row = rowOf(html, 8300);
    assert(row.includes('data-sec="jp"') && row.includes('data-type="jpshw"') && !row.includes('Japan only'), row);
    assert(!html.includes('data-v="jp"') && html.includes('data-v="jpshw" data-sec="jp"'), 'no Japan only TYPE chip: the JP families, shown only in the JP section');
    assert.strictEqual(calendar.rowState(calendar.catalogRows(ix).find((r) => r.censusId === 'JP-SHR-6'), c), 'can');
    const det = pages.detailPage(ix, 8300, c);
    assert(det.includes('<td>Super-Hard Weekend Raid (Japan)</td>') && det.includes('<b>Japan only</b>') && det.includes('Japanese super-hard board'), 'details');
    // its board has no census name (only the served board's own): no «No Raid Boards this week» above the listed board (bench 05-11)
    assert(!det.includes('No Raid Boards this week') && det.includes('<ul class="pl"><li>'), 'board listed without the empty line');
    assert(det.includes('gains a level at every win'), 'the usual level step');
    // user decision 06-11: a JP raid with nothing known of its board has none, and its page says why; a reconstructed one says so
    ix.entries.push(tier('JP-RAID-3', 8301, '2015-11-13', '2015-11-19', 'single', 'Trident Tail', { family: 'event', jp: true, region: 'JP', reconstructed: ['jp', 'jpNoBoard'], boards: [], sphereBoardIds: [] }),
      tier('JP-RAID-16', 8302, '2016-09-04', '2016-09-11', 'single', 'Circus Crab', { family: 'event', jp: true, region: 'JP', reconstructed: ['jp', 'jpBoardDeduced'], boards: [] }));
    const none = pages.detailPage(ix, 8301, c), rec = pages.detailPage(ix, 8302, c);
    assert(none.includes('No Raid Boards: the Japanese board of this raid is not known') && none.includes('Raid Boards (none: not known)') && !none.includes('No Raid Boards this week'), 'no board line');
    assert(rec.includes('Raid Boards (reconstructed)') && rec.includes('on the model of the original Japanese boards'), 'reconstructed board line');
  },
  jp_reconstructed_banner_note() {
    // a JP banner rebuilt by this server (raid_jp_banners.json `reconstructed`, 06a7f9e) says so in the banner box of its Details
    // page, instead of «The Japanese text printed on the original banner»; an original banner keeps that line
    const b = require('./raid_jp_banners.json').rows;
    const ix = index();
    ix.entries.push(tier('JP-SHR-80', 8360, '2018-01-19', '2018-01-21', 'single', 'Scourge Spider', { family: 'super-hard weekend', jp: true, region: 'JP', reconstructed: ['jp'], boards: [], sphereBoardIds: [] }),
      tier('JP-SHR-79', 8361, '2018-01-12', '2018-01-13', 'single', 'Fortress Crab Ω', { family: 'super-hard weekend', jp: true, region: 'JP', reconstructed: ['jp'], boards: [], sphereBoardIds: [] }));
    const c = ctx({ index: ix }), doc = { rows: {}, notices: {}, jp: {} };
    const rec = pages.noticePage(ix, 8360, doc, c), orig = pages.noticePage(ix, 8361, doc, c);
    assert(b['JP-SHR-80'] && b['JP-SHR-80'].reconstructed && !b['JP-SHR-79'].reconstructed, 'fixture rows of raid_jp_banners.json');
    assert(rec.includes('Reconstructed banner:') && !rec.includes('The Japanese text printed on the original banner'), 'reconstructed banner note');
    assert(orig.includes('The Japanese text printed on the original banner') && !orig.includes('Reconstructed banner:'), 'original banner note');
  },
  jp_research_labels() {
    // jpCensus (06-11): the probable boss / HP / reward and the opening hours (I-228) are named on the details page; the year-end 2016
    // raid's +10 levels per win (entry.levelStep) is in its level line
    const ix = index();
    ix.entries.push(tier('JP-RAID-21', 8350, '2016-12-25', '2017-01-01', 'single', 'Green Trident Tail', { family: 'daily rotating', jp: true, region: 'JP', levelStep: 10,
      reconstructed: ['jp', 'jpQuest', 'jpBossProbable'], boards: [] }),
    tier('JP-D-2018-08-04', 8353, '2018-08-04', '2018-08-04', 'single', 'Gear Golem', { family: 'super-hard weekend', jp: true, region: 'JP', reconstructed: ['jp', 'jpHpProbable'], boards: [] }),
    tier('JP-RAID-30', 8352, '2017-09-01', '2017-09-30', 'single', 'Crabby Cake', { family: 'monthly (30-minute)', jp: true, region: 'JP', reconstructed: ['jp', 'jpWindow', 'jpRewardProbable'], boards: [] }));
    const c = ctx({ index: ix });
    const ye = pages.detailPage(ix, 8350, c), we = pages.detailPage(ix, 8353, c), mo = pages.detailPage(ix, 8352, c);
    assert(ye.includes('gains 10 levels at every win') && ye.includes('<b>boss (probable)</b>') && ye.includes('2016 Showdown!'), 'year-end 2016');
    assert(we.includes('<b>boss HP (probable)</b>') && we.includes('1.5 billion'), 'weekend 2018');
    assert(!/next boss of the Japanese weekend cycle/.test(we), 'the 2018 weekends are named by their own notices (43217, 44270): no cycle guess in the label');
    assert(mo.includes('<b>opening hours (open outside them at 90 AP)</b>') && mo.includes('12:00-12:29 and 22:00-22:29 Japan time') && mo.includes('in 2018 its level carried over') && !mo.includes('no reset after each window') && mo.includes('<b>level reward (probable match)</b>') && mo.includes('gains a level at every win'), 'monthly 2017');
  },
  weekday_weekend_labels() {
    // I-228 (06-11): every raid names the one rule; a free quest names its weekday AP; the detail page states the rule
    const ix = index();
    ix.entries.push(tier('WW-E31611-1', 8022, '2017-09-04', '2017-09-11', 'single', 'Jewel Sorceress', { family: 'daily', reconstructed: ['weekRule', 'weekdayAp'] }));
    const d = pages.detailPage(ix, 8022, ctx({ index: ix }));
    assert(d.includes('<b>AP and Bonus Time (one rule for all raids)</b>') && d.includes('<b>weekday AP of a quest that was free</b>') && d.includes('costs 5 AP from Monday to Friday'));
    // the rule callout (user 06-11, graphics): title, NOT ORIGINAL tag, the two blocks with their icons, the Raid Bosses notice link
    assert(/<div class="rc"><div class="rch"><img[^>]*raid\.png[^>]*>One raid rule on this server<span class="ng">NOT ORIGINAL<\/span><\/div>/.test(d), 'the rule callout');
    assert(/<b><img[^>]*weekday\.png[^>]*>Monday – Friday<\/b><span><img[^>]*ap\.png[^>]*>Original AP \(5 AP if it was free\)<\/span><span class="ni">No Bonus Time<\/span>/.test(d), 'weekday block');
    assert(/<div class="rcd we"><b><img[^>]*weekday\.png[^>]*>Saturday – Sunday<\/b><span><img[^>]*ap\.png[^>]*>0 AP<\/span><span><img[^>]*lux\.png[^>]*>Lux of raid bosses doubled<\/span><span><img[^>]*bonus\.png[^>]*>Bonus Time all day<\/span>/.test(d), 'weekend block');
    assert(d.includes('Every raid, Pacific time.') && d.includes('<a href="/web/notices#raid-bosses">«Raid Bosses» notice ›</a>') && /\.rc\{/.test(d), 'foot line, link, CSS');
    assert(!/open all day|30-minute window|stays open outside/i.test(d.replace(/<li><b>opening hours[^]*?<\/li>/g, '')), 'no hours claim');
  },
  notice_server_box() {
    // «On this server» box of the notice pages (user 06-11, graphics): callout header, compact status row, grouped cards of short
    // lines (no bullet wall), the full sentences folded, the rule label not repeated under the rule callout, two pill links
    const ix = index();
    ix.entries.push(tier('WW-E31611-1', 8022, '2017-09-04', '2017-09-11', 'single', 'Jewel Sorceress',
      { family: 'daily', reconstructed: ['atk', 'def', 'lux', 'coinOdds', 'boardPath', 'upMinutes', 'useAp', 'weekRule', 'weekdayAp', 'mystery'] }));
    const doc = { rows: { 'WW-E31611-1': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2017-09-04', body: ['★ Raid!', 'x'] } } };
    const n = pages.noticePage(ix, 8022, doc, ctx({ index: ix }));
    const box = n.slice(n.indexOf('<div class="sb">'));
    assert(/<div class="sb"><div class="rch"><img[^>]*raid\.png[^>]*>On this server<span class="ng">NOT ORIGINAL<\/span><\/div><div class="why [a-z]*"><span class="s /.test(box), 'callout header, status row with its pill');
    for (const [g, cls] of [['Boss', 'rg'], ['Rewards', 'rg rw'], ['Rules', 'rg ru'], ['Other', 'rg ot']]) assert(new RegExp(`<div class="${cls}"><b><img[^>]*>${g}</b>`).test(box), `group ${g}`);
    assert(/<div class="ri"><img[^>]*tleg\.png[^>]*><b>ATK<\/b><span>Deduced from bosses with original values<\/span><\/div>/.test(box), 'icon, short label, one line');
    assert(box.split('Deduced from bosses with original values').length === 3 && /<b>Lux<\/b>/.test(box) && /<b>Weekday AP<\/b>/.test(box) && /<b>mystery<\/b>/.test(box));
    assert(!/<ul class="pl">/.test(box.replace(/<details class="fold">[^]*?<\/details>/, '')), 'no bullet list outside the fold');
    assert(/<details class="fold"><summary>Why these values\?<\/summary><ul class="pl">/.test(box) && box.includes('deduced from the bosses with original values.'), 'full sentences folded');
    // the rule callout is on the page: its label is not repeated in the box (nor in the fold)
    assert((n.match(/One raid rule on this server/g) || []).length === 1);
    assert(!box.includes('AP and Bonus Time') && !box.includes('One rule for all raids'), 'rule line not duplicated');
    assert(box.includes('<p class="sbl"><a href="/web/raid/raid/8022">This raid in the Raid Catalog ›</a><a href="/web/raid/catalog">Raid Catalog ›</a></p>'), 'pill links');
    assert(/\.sbl a\{display:inline-block/.test(n) && /\.rgs\{display:-webkit-box;display:-webkit-flex;display:flex/.test(n), 'CSS: flex with the old WebView prefixes');
    // a tier not restored is named in the box
    const o = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: doc.notices }, ctx());
    assert(/<p class="sbo"><img[^>]*lock\.png[^>]*>Not restored yet: Epic \(Blue Trident Tail\)/.test(o));
  },
  opening_hours_labels() {
    // I-228: the WW daily raids and the weekday weekly raids of 2018-09 .. 2019-07 name their hours and the 90 AP outside them
    const ix = index();
    ix.entries.push(tier('WW-E29805-1', 8020, '2017-07-03', '2017-07-10', 'single', 'Submarine Carp', { family: 'daily', reconstructed: ['raidWindow'] }),
      tier('WW-W-2018-11-12', 8021, '2018-11-12', '2018-11-18', 'single', 'Jewel Princess', { reconstructed: ['weeklyWindow'] }));
    const c = ctx({ index: ix }), d = pages.detailPage(ix, 8020, c), w = pages.detailPage(ix, 8021, c);
    assert(d.includes('<b>opening hours (open outside them at 90 AP)</b>') && d.includes('12:00 and 19:00 for one hour') && d.includes('not original'), 'daily');
    assert(w.includes('<b>weekday hours (probable; open outside them at 90 AP)</b>') && w.includes('probable'), 'weekly');
  },
  event_families_typed() {
    // Task 10 review M-5: the event raids of 2016-2018 are Raid Events, with a readable family name, not Weekly
    const ix = index();
    ix.entries.push(tier('WW-E22111-1', 8013, '2016-11-05', '2016-11-07', 'single', 'Closehanded Captain', { family: 'weekend-only' }),
      tier('WW-E22563-1', 8014, '2016-11-21', '2016-11-28', 'single', 'Wicked Spider', { family: 'monthly' }));
    const html = catalog(ix, ctx({ index: ix }));
    for (const id of [8013, 8014]) assert(rowOf(html, id).includes('data-type="event"'), `row ${id} is a Raid Event`);
    assert(rowOf(html, 8100).includes('data-type="weekly"'));
    assert(pages.detailPage(ix, 8013, ctx({ index: ix })).includes('<td>Weekend Raid</td>'));
    assert(pages.detailPage(ix, 8014, ctx({ index: ix })).includes('<td>Monthly Raid</td>'));
  },
  lists_every_row() {
    const html = catalog(index(), ctx());
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
    // tabs = the Shop's game years (user 06-11): All years plus one per game year that has raids, no «Now» mark (the Shop has none)
    const years = new Set(calendar.catalogRows(index()).map((r) => special.gameYearOf(r.start)));
    assert.strictEqual(count(html, ' data-p="'), 1 + years.size);
    assert(html.includes('data-p="3" data-nww="2" data-njp="0"><b>Year 4</b><small>3rd 🎂 → 4th 🎂</small>') && html.includes('data-p="all" data-nww="5" data-njp="0"><b>All years</b><small id="span" data-ww="2016–2021" data-jp="2016–2021">2016–2021</small>'), 'Shop tab names');
    assert(!html.includes('class="now"'), 'no Now mark');
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
    const page = (done) => catalog(ix, ctx({ index: ix, stageDone: (sid) => done.includes(sid) }));
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
    const none = catalog(index(), ctx());
    assert(!/data-done="1"/.test(none) && !rowOf(none, 8071).includes(crown), 'no lookup: nothing completed');
  },
  // RAID BOARDS filter (user 03-11, ours): a raid's boards are completed when every Raid Board of its playable tiers is complete
  // in the save (ctx.boardDone, the rule of the board screen: every node unlocked); no board = neither completed nor not.
  raid_boards_filter() {
    const ix = index(); // boards: 8071 3008071 | 8100 3008100 + 3008200 (Advanced) + 3009100 (Epic, not restored) | 8101 none | 8180 3008180
    ix.entries[2].sphereBoardIds = [3008100, 3008200];
    ix.entries[3].sphereBoardIds = [3009100];
    ix.entries[4].sphereBoardIds = [];
    const page = (done) => catalog(ix, ctx({ index: ix, boardDone: (id) => done.includes(id) }));
    const bd = (html, id) => (/data-boards="(\w+)"/.exec(rowOf(html, id)) || [])[1];
    const html = page([3008071, 3008100, 3008180]);
    assert.strictEqual(bd(html, 8071), 'done');
    assert.strictEqual(bd(html, 8100), 'todo', 'the Advanced board 3008200 is not complete');
    assert.strictEqual(bd(page([3008100, 3008200]), 8100), 'done', 'the board of a tier not restored (Epic) does not count');
    assert.strictEqual(bd(html, 8101), 'none', 'no board: neither');
    assert.strictEqual(bd(html, 8150), 'none', 'not restored, no board');
    assert.strictEqual(bd(html, 8180), 'done');
    assert.strictEqual(bd(catalog(ix, ctx({ index: ix })), 8071), 'todo', 'no lookup: nothing completed');
    assert(/<h4>RAID BOARDS<\/h4><div class="opts" data-g="bd">/.test(html), 'RAID BOARDS group');
    assert(/data-v="done"><img[^>]*bdone\.png[^>]*>Completed</.test(html) && /data-v="todo"><img[^>]*btodo\.png[^>]*>Not completed</.test(html), 'chips with the board icons (completed board with a check, partly lit board), not padlocks');
    assert(html.includes('Raid Boards: '), 'summary tag label');
    assert.strictEqual(count(rowOf(html, 8071), 'class="s s-'), 1, 'still one status line');
  },
  one_status_line_at_most_one_button() {
    const html = catalog(index(), ctx({ kept: 'WW-W-2018-09-03' }));
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
    const html = catalog(index(), ctx());
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
    const html = catalog(index(), ctx());
    const r = rowOf(html, 8180);
    assert(/Unlocks at Story Quest 612/.test(rowOf(catalog(index(), ctx({ unlockQuestOf: () => 612 })), 8180)));
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
    assert(d.includes('<h2>Reconstructed values</h2><ul class="pl"><li><b>ATK</b>: The boss') && d.includes('deduced from the bosses with original values.'), 'reconstructed values: one short sentence each (user 04-11)');
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
    const html = catalog(ix, ctx({ index: ix }));
    const r = rowOf(html, 8110);
    assert(/data-show="other"/.test(r) && /This week, not open now/.test(r), 'its own status');
    assert(!/Unlocks at Story Quest/.test(r) && !/class="pk"/.test(r));
  },
  filter_icons() {
    // 06-11 (user): every chip of the Filters sheet but «All» carries an icon of the catalogues' set (/web/special/icon/<key>.png),
    // as the Special Catalog: TYPE, TIER, SHOW, PROGRESS, RAID BOARDS; the keys are served (SPECIAL_ICON_KEYS)
    const html = catalog(index(), ctx()), keys = special.SPECIAL_ICON_KEYS;
    const want = { type: { weekly: 'weekday', radiant: 'jewel', event: 'camp', jpev: 'camp', jpshw: 'raid', jpmo: 'bonus', jpday: 'daily' },
      tier: { beginner: 'tbeg', intermediate: 'tint', advanced: 'tadv', legendary: 'tleg', epic: 'tepic', single: 'tone' },
      show: { now: 'now', can: 'pin', kept: 'pin', later: 'later', removed: 'removed' }, prog: { done: 'done', todo: 'todo' }, bd: { done: 'bdone', todo: 'btodo' } };
    for (const [g, m] of Object.entries(want)) {
      const box = (new RegExp(`<div class="opts" data-g="${g}">([\\s\\S]*?)</div>`).exec(html) || [])[1] || '';
      const chips = box.match(/<button[^>]*data-v="[^"]+"[^>]*>[\s\S]*?<\/button>/g) || [];
      assert(chips.length === Object.keys(m).length + 1, `${g}: ${chips.length} chips`);
      for (const c of chips) {
        const v = /data-v="([^"]+)"/.exec(c)[1], k = (/\/web\/special\/icon\/([a-z]+)\.png/.exec(c) || [])[1];
        if (v === 'all') { assert(!k, `${g} All: no icon, as the other catalogues`); continue; }
        assert.strictEqual(k, m[v], `${g} ${v}: icon`);
        assert(keys.includes(k), `${k} is served`);
      }
    }
    // the summary tag of a chosen chip shows the same icon (LAB of the page script)
    assert(/"epic":"<img class=\\"ic\\" src=\\"\/web\/special\/icon\/tepic\.png\\"/.test(html), 'TIER tag with its icon');
  },
  two_sections() {
    // user 06-11: two big tabs above the year tabs, Worldwide (opened first) and Japan only, each with its own counts, year tabs,
    // default year and Filters; the Japan only section opens with an intro box; its rows carry no «Japan only» label and a Keep
    // button that stands out (pk jk); the kept raid is one for both sections
    const ix = index();
    ix.entries.push(tier('JP-SHR-6', 8300, '2016-08-19', '2016-08-21', 'single', 'Blue Trident Tail', { family: 'super-hard weekend', jp: true, region: 'JP', boards: [] }),
      tier('JP-RAID-30', 8301, '2017-09-01', '2017-09-30', 'single', 'Crabby Cake', { family: 'monthly (30-minute)', jp: true, region: 'JP', boards: [] }));
    const c = ctx({ index: ix }), html = catalog(ix, c);
    const secs = (/<div class="secs" id="secs">([\s\S]*?)<\/div>/.exec(html) || [])[1] || '';
    assert(/<button type="button" class="sec on" data-sec="ww">[\s\S]*?Worldwide<\/span><span class="sn">5<\/span>/.test(secs), `Worldwide first, on, 5 raids: ${secs}`);
    assert(/<button type="button" class="sec" data-sec="jp">[\s\S]*?Japan only<\/span><span class="sn">2<\/span>/.test(secs), 'Japan only, 2 raids');
    assert(html.indexOf('id="secs"') < html.indexOf('id="tabs"'), 'the sections above the year tabs');
    // opened on Worldwide: the counts of the summary, «Show N results», «All years» and the year chips are the worldwide ones
    assert(html.includes('<span class="n1">5 raids</span>') && html.includes('id="fok">Show 5 results') && html.includes('data-yr="all">All years <span class="yn">5</span>'), 'worldwide counts');
    assert(/class="yc hide" data-yr="2016">2016 <span class="yn">0<\/span>/.test(html), 'a year with only Japanese raids hidden on Worldwide');
    assert(/data-p="0" data-nww="0" data-njp="1"/.test(html) && /class="tab hide" data-p="0"/.test(html), 'a game year with only Japanese raids: its tab hidden on Worldwide');
    assert(/<div id="rows" data-defy="2019" data-defy-jp="all">/.test(html), 'default years per section (the Shop year when the section has raids in it)');
    assert(/data-defy-jp="2016"/.test(catalog(ix, ctx({ index: ix, shopFrom: '2016-09-01', shopTo: '2016-09-07' }))), 'JP default year = the Shop year');
    assert(/id="span" data-ww="2016–2021" data-jp="2016–2017"/.test(html), 'the span under All years per section');
    // the Japan only intro: hidden on Worldwide, one line per rule
    const intro = (/<div class="rc rcl hide" id="jpi">([\s\S]*?)<\/p><\/div>/.exec(html) || [])[1] || '';
    assert(intro.includes('NOT ORIGINAL') && intro.includes('only in the Japanese version') && intro.includes('never appear in Events by themselves') && intro.includes('keep it here')
      && intro.includes('unlocks when your Story reaches its dates') && intro.includes('One kept raid for both sections') && intro.includes('releases the kept worldwide raid')
      && intro.includes('translations are ours') && intro.includes('/web/notices#raid-bosses'), `JP intro: ${intro}`);
    // rows: their section, no «Japan only» label, the JP Keep button marked
    for (const id of [8300, 8301]) assert(rowOf(html, id).includes('data-sec="jp"') && !rowOf(html, id).includes('Japan only'), `JP row ${id}`);
    for (const id of [8071, 8100, 8180]) assert(rowOf(html, id).includes('data-sec="ww"'), `WW row ${id}`);
    assert(rowOf(html, 8300).includes('class="pk jk" data-id="8300" data-on="1"') && rowOf(html, 8071).includes('class="pk" data-id="8071"'), 'Keep on JP rows marked');
    // TYPE chips per section, TIER: only One tier has Japanese raids
    assert(/data-v="weekly" data-sec="ww"/.test(html) && /data-v="jpmo" data-sec="jp"/.test(html) && /data-v="jpday" data-sec=""/.test(html), 'TYPE chips by section');
    assert(/data-v="single" data-sec="ww jp"/.test(html) && /data-v="beginner" data-sec="ww"/.test(html), 'TIER chips by section');
    // one kept raid for both: a kept JP raid shows as «Replaces» over the worldwide Keep buttons, and the other way round
    const kj = catalog(ix, ctx({ index: ix, kept: 'JP-SHR-6' }));
    assert(rowOf(kj, 8300).includes('data-show="kept"') && rowOf(kj, 8071).includes('Replaces: Blue Trident Tail'), 'kept JP raid replaced by a WW keep');
    const kw = catalog(ix, ctx({ index: ix, kept: 'WW-W-2018-09-03' }));
    assert(rowOf(kw, 8300).includes('Replaces: Merry-Go-Rowdy') && rowOf(kw, 8300).includes('class="pk jk"'), 'kept WW raid replaced by a JP keep');
    // the page scripts compile (the JSON of the packed rows aside)
    for (const m of pages.catalogPage(ix, c).matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]); // eslint-disable-line no-new-func
    const real = path.join(__dirname, 'game_data', 'raids.json');
    if (fs.existsSync(real)) {
      const rix = JSON.parse(fs.readFileSync(real, 'utf8')), rows = calendar.catalogRows(rix), page = catalog(rix, ctx({ index: rix }));
      const n = (s) => Number((new RegExp(`data-sec="${s}">[\\s\\S]*?<span class="sn">(\\d+)<`).exec(page) || [])[1]);
      assert.strictEqual(n('ww') + n('jp'), rows.length);
      assert.strictEqual(n('jp'), rows.filter((r) => r.jp).length);
      assert.strictEqual(count(page, 'data-sec="jp" data-periods'), n('jp'));
      console.log(`  (real catalogue: Worldwide ${n('ww')}, Japan only ${n('jp')})`);
    }
  },
  catalog_light() {
    // task 3 (06-11): the rows travel packed (templates + one dictionary) and the page builds them before its filter script; the
    // expansion gives back every row; the card pictures wait in data-src until their row is shown (kxImgs after every render)
    const ix = index(), raw = pages.catalogPage(ix, ctx({ index: ix })), full = pages.expandCatalog(raw);
    assert(!raw.includes('<div class="row') && raw.includes('<script id="kxrows" type="application/json">') && raw.includes('kxImgs();'), 'packed');
    assert(full.includes('id="q8100"') && full.includes('data-src="/web/raid/img/v3/8100.png"') && !/<img[^>]* src="\/web\/raid\/img\//.test(full), 'expanded, cards deferred');
    assert(!/<\/(?!script>)/.test((/<script id="kxrows"[^>]*>([\s\S]*?)<\/script>/.exec(raw) || [])[1] || ''), 'no </ inside the packed rows');
    const real = path.join(__dirname, 'game_data', 'raids.json');
    if (fs.existsSync(real)) {
      const rix = JSON.parse(fs.readFileSync(real, 'utf8')), page = pages.catalogPage(rix, ctx({ index: rix }));
      console.log(`  (real catalogue: ${Buffer.byteLength(page)} bytes packed, ${Buffer.byteLength(pages.expandCatalog(page))} written out)`);
      assert(Buffer.byteLength(page) < 160 * 1024, 'the real catalogue stays light');
    }
  },
  html_escape() {
    const html = catalog(index(), ctx());
    const r = rowOf(html, 8180);
    assert(r.includes("Tom &amp; Jerry's Ω &lt;Boss&gt;"), 'name intact, escaped');
    assert(!r.includes('<Boss>'), 'no raw tag');
    assert(r.includes('Moogle &amp; Co. Board'));
    const ix = index();
    ix.entries.push(tier('WW-Q', 8190, '2021-01-04', '2021-01-10', 'Odd"Tier<x>', 'Q'));
    const q = rowOf(catalog(ix, ctx({ index: ix })), 8190);
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
