// Odds of enemy drop rows (original event rows, bench 07-11): rolled per position at /stage/start, paid as rolled at /stage/clear
//   node server/test-drop-odds.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };

const SAVE = path.join(os.tmpdir(), `khux-test-drop-odds-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.env.KHUX_SAVE = SAVE; delete process.env.KHUX_PET;
const { _test: t } = quiet(() => require('./server'));

// a reward row with odds below 10000 on medal drops (type 3): the original rows that make-events.js serves
const rows = require('./master_data/reward.json');
const used = new Set(Object.values(t.STAGE_POI).flatMap((p) => (p.enemies || []).map((e) => e.reward)));
const chance = (r) => r.type.slice(0, 4).some((ty) => ty === 3) && r.type.slice(0, 4).every((ty, i) => ty !== 3 || (r.odds[i] > 0 && r.odds[i] < 10000));
const row = rows.find((r) => chance(r) && used.has(r.rewardId)) || rows.find(chance);
if (!row) { log('SKIP: no reward row with odds below 10000 in this master'); process.exit(0); }
const full = t.enemyDropTypes(row.rewardId);
check(full.some(Boolean), `row ${row.rewardId}: drop types ${full}`);
check(t.rollDropTypes(row.rewardId, full, () => 0.9999).length === 0, 'roll above every odd: nothing');
check(JSON.stringify(t.rollDropTypes(row.rewardId, full, () => 0)) === JSON.stringify(full), 'roll 0: every position');
const low = Math.min(...row.odds.slice(0, full.length).filter((o, i) => full[i]));
const mid = t.rollDropTypes(row.rewardId, full, () => (low - 1) / 10000);
check(mid.every((ty, i) => !ty || row.odds[i] >= low), `roll just under the lowest odd keeps only positions with odds >= ${low}: ${mid}`);
// a 10000 row (story) always drops
const always = rows.find((r) => r.type[0] === 5 && r.odds[0] === 10000);
if (always) check(t.rollDropTypes(always.rewardId, t.enemyDropTypes(always.rewardId), () => 0.9999)[0] === 5, 'odds 10000: always');

// /stage/start -> /stage/clear on a stage whose map uses that row: only the rolled positions are paid
const stageId = Object.keys(t.STAGE_POI).map(Number).find((id) => (t.STAGE_POI[id].enemies || []).some((e) => e.reward === row.rewardId));
if (stageId) {
  const enemy = t.STAGE_POI[stageId].enemies.find((e) => e.reward === row.rewardId);
  const medalCount = () => Object.keys(t.player.medals || {}).length;
  t.player.created = true;
  for (const [r, label] of [[0.9999, 'nothing rolled'], [0, 'everything rolled']]) {
    const rnd = Math.random; Math.random = () => r;
    let drops;
    try { drops = t.startEnemyDrops({ stageId }); } finally { Math.random = rnd; }
    t.player.currentStageId = stageId;
    const sent = drops.find((d) => d.uniqueEnemyId === enemy.uid).dropItemTypeIds.filter(Boolean).length;
    const before = medalCount();
    quiet(() => t.respondStageClear({ writeHead() {}, end() {} }, { getEnemyDropItems: [enemy.uid], getMaterials: [] }));
    const paid = medalCount() - before;
    check(paid === sent * 1, `${label}: client told ${sent} drops, server paid ${paid} medals`);
    check(t.player.enemyDrops === null, `${label}: rolled drops cleared after /stage/clear`);
  }
} else log(`(no POI map uses row ${row.rewardId}: stage check skipped)`);

try { fs.unlinkSync(SAVE); } catch { /* gone */ }
if (errors.length) { log(`ERRORS (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log(`OK: drop odds (row ${row.rewardId}${stageId ? `, stage ${stageId}` : ''})`);
