// Raid calendar: node server/test-raid-calendar.js
// Fixture rows first; the `real_*` tests build the index from the private sources (as test-make-raid.js real_census_week)
// and skip when they are not readable.
'use strict';
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const cal = require('./raid-calendar');
const special = require('./special');
const gachaData = require('./gacha-data');

const entry = (censusId, family, start, end, tier, extra = {}) => ({ key: `${censusId}/${tier}`, censusId, family, start, end, tier, available: true, why: null,
  evStageId: 8000 + Number(String(censusId).replace(/\D/g, '').slice(-3) || 0), stageId: 980000, ...extra });
const keys = (list) => list.map((e) => e.key).join(',');
const week = (from, to) => ({ shopFrom: from, shopTo: to });

// Weekly rows of autumn 2019 (a Tuesday-to-Sunday row, a radiant row beside a weekly one, a gap)
const FIX = { entries: [
  entry('W0923', 'radiant reward', '2019-09-23', '2019-09-30', 'Beginner'),
  entry('W1001', 'weekly', '2019-10-01', '2019-10-06', 'Beginner'),
  entry('W1007', 'weekly', '2019-10-07', '2019-10-13', 'Beginner'),
  entry('W1007', 'weekly', '2019-10-07', '2019-10-13', 'Advanced'),
  entry('R1007', 'radiant reward', '2019-10-07', '2019-10-13', 'Beginner'),
  entry('W1014', 'weekly', '2019-10-14', '2019-10-20', 'Beginner'),
  entry('W1014', 'weekly', '2019-10-14', '2019-10-20', 'Advanced', { available: false, why: 'graphics' }),
  entry('W1021', 'weekly', '2019-10-21', '2019-10-27', 'Beginner', { available: false, why: 'graphics' }),
  entry('W1104', 'weekly', '2019-11-04', '2019-11-10', 'Beginner'),
] };

// The index of the real sources, built as make-raid.js does (raid_models.json when present, else every model complete).
let realMemo;
function realIndex() {
  if (realMemo !== undefined) return realMemo;
  realMemo = null;
  const mr = require('./make-raid');
  let sources;
  try { sources = mr.readSources(process.env.KHUX_RAID_SRC || mr.DEFAULT_SRC, process.env.KHUX_RAID_2016 || mr.DEFAULT_2016); } catch (e) {
    console.log(`  (skipped: private sources not readable, ${e.code || e.message})`);
    return null;
  }
  const dir = path.join(__dirname, 'master_data');
  if (!fs.existsSync(path.join(dir, 'stage.json'))) { console.log('  (skipped: no master_data)'); return null; }
  const master = {};
  for (const n of ['stage', 'world', 'enemy', 'raidEnemy', 'raidEnemyAttack', 'medal', 'material', 'avatarParts', 'title']) master[n] = JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
  master.petParts = JSON.parse(fs.readFileSync(path.join(__dirname, 'tables', 'petParts.json'), 'utf8'));
  require('./make-campaign-medals').addCampaignMedals(master.medal);
  master.stage = master.stage.filter((r) => !(r.stageId >= 980000 && r.stageId <= 989999));
  master.raidEnemy = master.raidEnemy.filter((r) => r.raidEnemyId < 2000000);
  Object.assign(master, { evStage: [], raidSetting: [], raidReward: [], sphere: [], sphereArray: [], sphereMasu: [] });
  const file = path.join(__dirname, 'game_data', 'raid_models.json');
  const all = { fight: true, start: true, escape: true, put_down: true };
  const models = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : new Proxy({}, { get: () => all });
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_config.json'), 'utf8'));
  const config = { ...cfg, stats: JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_stats.json'), 'utf8')) };
  delete config.onlyCensusIds;
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'raid_ids.json'), 'utf8'));
  realMemo = { ...mr.buildRaid({ ...sources, master, models, config, ids }).index, census: sources.census };
  return realMemo;
}
// the real part of a test, or a visible SKIP line when the private sources are not readable (the fixture part still ran)
function realOrSkip(what) {
  const ix = realIndex();
  if (!ix) console.log(`  SKIP ${what}: private sources not readable, fixture part only`);
  return ix;
}
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// Pacific moments: 2016-11-12 is a Saturday, 11-16 a Wednesday; 20:00 UTC = 12:00 PST
const PT_NOON = (iso) => Date.parse(`${iso}T20:00:00Z`);
// WW-E22111-1 (Closehanded Captain, weekend-only): the census weekend and the two other periods of its notice
const WEEKEND = entry('WW-E22111-1', 'weekend-only', '2016-11-05', '2016-11-07', 'single', { event: true, open: 'weekend',
  periods: [['2016-11-05', '2016-11-06'], ['2016-11-12', '2016-11-13'], ['2016-11-26', '2016-11-27']] });
const MONTHLY = entry('WW-E22563-1', 'monthly', '2016-11-21', '2016-11-28', 'single', { event: true, periods: [['2016-11-21', '2016-11-28']] });
// a daily showdown: one boss per day (Mon 12-26 .. Sun 01-01)
const SHOWDOWN = ['2016-12-26', '2016-12-27', '2016-12-28'].map((day) => entry('WW-E23794-1', 'daily showdown', '2016-12-26', '2017-01-02', 'single',
  { key: `WW-E23794-1/single@${day}`, event: true, open: 'day', day, periods: [['2016-12-26', '2017-01-01']] }));
const DAILY = entry('WW-E29805-1', 'daily', '2017-07-03', '2017-07-10', 'single', { event: true, open: 'daily', periods: [['2017-07-03', '2017-07-09']] });
const EV = { entries: [WEEKEND, MONTHLY, ...SHOWDOWN, DAILY] };

const tests = {
  weekend_only_real_days() {
    // shown on a real Saturday or Sunday of a Shop week holding one of its periods, never on another day
    const w = week('2016-11-10', '2016-11-16');
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...w, nowMs: PT_NOON('2016-11-12') })), 'WW-E22111-1/single', 'Saturday');
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...w, nowMs: PT_NOON('2026-11-08') })), 'WW-E22111-1/single', 'any real Sunday');
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...w, nowMs: PT_NOON('2016-11-16') })), '', 'Wednesday');
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...w, nowMs: Date.parse('2016-11-14T07:30:00Z') })), 'WW-E22111-1/single', 'Sunday 23:30 PST is still the weekend');
    assert.strictEqual(keys(cal.raidsForWeek(EV, w)), '', 'no clock: no weekend raid');
    assert.strictEqual(keys(cal.weekRaids(EV, { ...w, nowMs: PT_NOON('2016-11-16') }).closed), 'WW-E22111-1/single', 'closed today, apart from unavailable');
    // its other periods: the last weekend beside the monthly raid of the same week
    const late = week('2016-11-24', '2016-11-30');
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...late, nowMs: PT_NOON('2016-11-26') })), 'WW-E22111-1/single,WW-E22563-1/single');
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...late, nowMs: PT_NOON('2016-11-30') })), 'WW-E22563-1/single');
    // a week between its periods: nothing
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...week('2016-11-17', '2016-11-20'), nowMs: PT_NOON('2016-11-19') })), '');
    assert.strictEqual(cal.openNow(WEEKEND, PT_NOON('2016-11-12')), true);
    const ix = realOrSkip('weekend_only_real_days');
    if (!ix) return;
    const real = ix.entries.filter((e) => e.censusId === 'WW-E22111-1');
    assert.ok(real.length && real.every((e) => e.open === 'weekend'));
    assert.deepStrictEqual(real[0].periods, [['2016-11-05', '2016-11-06'], ['2016-11-12', '2016-11-13'], ['2016-11-26', '2016-11-27']]);
    const listed = (now) => cal.weekRaids(ix, { ...w, nowMs: now });
    const sat = listed(PT_NOON('2016-11-12')), wed = listed(PT_NOON('2016-11-16'));
    assert.ok([...sat.entries, ...sat.unavailable].some((e) => e.censusId === 'WW-E22111-1'), 'Saturday');
    assert.ok(![...wed.entries, ...wed.unavailable].some((e) => e.censusId === 'WW-E22111-1'), 'Wednesday');
  },
  daily_real_day() {
    // a daily showdown lists the boss of the real weekday only; a daily raid runs every day of its week
    const w = week('2016-12-26', '2017-01-01');
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...w, nowMs: PT_NOON('2016-12-27') })), 'WW-E23794-1/single@2016-12-27', 'Tuesday');
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...w, nowMs: PT_NOON('2026-11-04') })), 'WW-E23794-1/single@2016-12-28', 'any real Wednesday');
    assert.strictEqual(keys(cal.raidsForWeek(EV, { ...w, nowMs: PT_NOON('2026-11-06') })), '', 'Friday: its boss is not in the fixture');
    const d = week('2017-07-06', '2017-07-12');
    for (const day of ['2026-11-02', '2026-11-04', '2026-11-08']) assert.strictEqual(keys(cal.raidsForWeek(EV, { ...d, nowMs: PT_NOON(day) })), 'WW-E29805-1/single', day);
  },
  follows_story() {
    assert.strictEqual(keys(cal.raidsForWeek(FIX, week('2019-10-14', '2019-10-20'))), 'W1014/Beginner');
    const ix = realOrSkip('follows_story');
    if (!ix) return;
    const got = cal.raidsForWeek(ix, week('2019-10-07', '2019-10-13'));
    assert.deepStrictEqual(got.map((e) => [e.boss, e.tier]), [['Trickmaster', 'Beginner'], ['Blue Trident Tail', 'Advanced']]);
    assert.ok(got.every((e) => e.censusId === 'WW-W-2019-10-07'));
  },
  shop_week_overlap() {
    // a Thursday-to-Wednesday Shop week: the row holding shopFrom
    assert.strictEqual(keys(cal.raidsForWeek(FIX, week('2019-10-03', '2019-10-09'))), 'W1001/Beginner');
    // shopFrom in a gap: the largest overlap (W1104 4 days against W1021's 0)
    assert.strictEqual(keys(cal.raidsForWeek(FIX, week('2019-10-31', '2019-11-06'))), 'W1104/Beginner');
    // tie (3 days each): the later row
    const tie = { entries: [entry('A', 'weekly', '2019-10-01', '2019-10-05', 'Beginner'), entry('B', 'weekly', '2019-10-08', '2019-10-14', 'Beginner')] };
    assert.strictEqual(keys(cal.raidsForWeek(tie, week('2019-10-06', '2019-10-10'))), 'B/Beginner');
    assert.strictEqual(keys(cal.raidsForWeek(tie, week('2019-10-04', '2019-10-09'))), 'A/Beginner', 'holding shopFrom wins over a larger overlap');
    // the same choice as special.currentEntries on the weekly VIP versions, every day of the fixture and of the real calendar
    const mirror = (index, from, to) => {
      const rows = cal.weekRows({ entries: index.entries }, { shopFrom: from, shopTo: to });
      const seen = new Set();
      const versions = index.entries.filter((e) => !seen.has(e.censusId) && seen.add(e.censusId))
        .map((e) => ({ key: e.censusId, periods: [1], weekOf: 'raid', evStageId: e.evStageId, campaign: { start: e.start, end: e.end } }));
      const sp = special.currentEntries({ entries: [{ key: 'raid', periods: [1] }, ...versions] }, { period: 1, shopFrom: from, shopTo: to })
        .map((e) => e.key).filter((k) => k !== 'raid');
      return [rows.map((r) => r.censusId).sort().join(), sp.sort().join()];
    };
    const sweep = (index, first, last) => {
      let n = 0;
      for (let d = first; d <= last; d = addDays(d, 1)) {
        for (const len of [6, 3]) {
          const [a, b] = mirror(index, d, addDays(d, len));
          assert.strictEqual(a, b, `${d} + ${len}`);
          n++;
        }
      }
      return n;
    };
    // FIX has a radiant row beside a weekly one (R1007, W1007): special keeps both only when they hold shopFrom, so the
    // sweep runs without R1007
    sweep({ entries: FIX.entries.filter((e) => e.censusId !== 'R1007') }, '2019-09-15', '2019-11-15');
    const ix = realOrSkip('shop_week_overlap');
    // the event raids of 2016-2018 (Task 10) run beside this rule, by their periods: weekend_only_real_days, daily_real_day
    if (ix) console.log(`  (real calendar: ${sweep({ entries: ix.entries.filter((e) => !e.event) }, '2018-08-20', '2021-07-10')} Shop weeks agree with special.currentEntries)`);
  },
  radiant_beside_weekly() {
    assert.strictEqual(keys(cal.raidsForWeek(FIX, week('2019-10-07', '2019-10-13'))), 'W1007/Beginner,W1007/Advanced,R1007/Beginner');
    // also when neither holds shopFrom: the rows of the same dates go together
    assert.strictEqual(keys(cal.raidsForWeek({ entries: FIX.entries.filter((e) => e.censusId !== 'W1001') }, week('2019-10-03', '2019-10-09'))),
      'W1007/Beginner,W1007/Advanced,R1007/Beginner');
  },
  no_raid_week() {
    assert.deepStrictEqual(cal.raidsForWeek(FIX, week('2016-04-25', '2016-05-01')), []);
    assert.deepStrictEqual(cal.raidsForWeek(FIX, week('2019-10-24', '2019-10-27')), [], 'only an unavailable tier');
    assert.strictEqual(keys(cal.weekRaids(FIX, week('2019-10-24', '2019-10-27')).unavailable), 'W1021/Beginner');
    assert.deepStrictEqual(cal.raidsForWeek(FIX, {}), [], 'no Shop week');
    assert.deepStrictEqual(cal.raidsForWeek({ entries: [] }, week('2019-10-07', '2019-10-13')), []);
    assert.deepStrictEqual(cal.raidsForWeek(undefined, week('2019-10-07', '2019-10-13')), []);
    const ix = realOrSkip('no_raid_week');
    if (!ix) return;
    for (const d of ['2016-04-07', '2016-04-25', '2016-05-01']) assert.deepStrictEqual(cal.raidsForWeek(ix, week(d, d)), [], d);
    assert.ok(ix.entries.every((e) => e.start >= '2016-05-02'), 'no row before the first WW raid');
  },
  partial_week() {
    const w = cal.weekRaids(FIX, week('2019-10-14', '2019-10-20'));
    assert.strictEqual(keys(w.entries), 'W1014/Beginner');
    assert.strictEqual(keys(w.unavailable), 'W1014/Advanced');
    assert.ok(cal.raidsForWeek(FIX, week('2019-10-14', '2019-10-20')).every((e) => e.available));
  },
  monday_changes() {
    // a story tranche of four weeks: weekIndex + 1 moves the Shop week, and the raid with it
    const catalog = { story: [[1, 10, '2019-09-26'], [11, 20, '2019-10-24']] };
    const W = 400, rot = { day: '2019-09-26', week: W };
    const at = (k) => { const w = gachaData.shopWindow(catalog, 5, W + k, rot); return { shopFrom: w.from, shopTo: w.to }; };
    assert.deepStrictEqual([0, 1, 2, 3, 4].map((k) => at(k).shopFrom), ['2019-09-26', '2019-10-03', '2019-10-10', '2019-10-17', '2019-09-26']);
    assert.deepStrictEqual([0, 1, 2, 3].map((k) => keys(cal.raidsForWeek(FIX, at(k)))),
      ['W0923/Beginner', 'W1001/Beginner', 'W1007/Beginner,W1007/Advanced,R1007/Beginner', 'W1014/Beginner']);
    const ix = realOrSkip('monday_changes');
    if (!ix) return;
    const file = path.join(__dirname, 'game_data', 'gacha_catalog.json');
    if (!fs.existsSync(file)) return;
    // the real story: from one Monday to the next inside a tranche (a row longer than a week, 2021-05-24 to 06-29, stays)
    const real = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = 0, same = 0, weeks = 0;
    const empty = [];
    const seen = new Set();
    for (const [qFrom, , day] of real.story) {
      if (seen.has(day)) continue;
      seen.add(day);
      const n = gachaData.shopWindow(real, qFrom, W, { day, week: W }).n;
      const list = Array.from({ length: n }, (_, k) => {
        const w = gachaData.shopWindow(real, qFrom, W + k, { day, week: W });
        return { from: w.from, raids: keys(cal.raidsForWeek(ix, { shopFrom: w.from, shopTo: w.to })) };
      });
      weeks += n;
      for (const x of list) if (!x.raids) empty.push(x.from);
      for (let k = 0; k + 1 < n; k++) if (list[k].raids && list[k + 1].raids) { if (list[k].raids !== list[k + 1].raids) changed++; else same++; }
    }
    const raidEra = empty.filter((d) => d >= '2018-08-30');
    console.log(`  (real story: ${weeks} Shop weeks, ${changed} Monday changes, ${same} unchanged, ${empty.length} with no raid, `
      + `${raidEra.length} of them from 2018-08-30${raidEra.length ? ': ' + raidEra.join(' ') : ''})`);
    assert.ok(changed > same, `${changed} changes, ${same} unchanged`);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(failed ? `${failed} of ${Object.keys(tests).length} failed` : `all ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
