// Cost 999 on the non-battle Medals (I-211): support types 2/3/4/5/6/8 get cost and minCost 999, battle Medals
// (type 1, system rows included) and Trait Medals (type 9) keep theirs; the in-place patch is idempotent.
//   node server/test-support-medal-cost.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const fix = require('./support-medal-cost');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

const rows = () => [
  { medalId: 90021, type: 2, cost: 0, minCost: 0 },      // Huey (EXP)
  { medalId: 90011, type: 3, cost: 0, minCost: 0 },      // Moogle (sell)
  { medalId: 90053, type: 4, cost: 0, minCost: 0 },      // Chip (Boost)
  { medalId: 90076, type: 5, cost: 0, minCost: 0 },      // Cid (Cost)
  { medalId: 90085, type: 6, cost: 0, minCost: 0 },      // Fantasia Mickey A (Evolve)
  { medalId: 300913, type: 8, cost: 0, minCost: 0 },     // Fantasia Mickey B
  { medalId: 11021, type: 1, cost: 1, minCost: 1 },      // Goofy Ver. A (battle)
  { medalId: 1, type: 1, cost: 0, minCost: 0 },          // Stock Medal
  { medalId: 9000001, type: 9, cost: 999, minCost: 999 } // Trait Medal #1
];

const medals = rows();
check(fix.applySupportCost(medals) === 6, 'applySupportCost: 6 support rows expected');
for (const m of medals.slice(0, 6)) check(m.cost === 999 && m.minCost === 999, `${m.medalId}: cost ${m.cost}/${m.minCost}`);
check(medals[6].cost === 1 && medals[6].minCost === 1, 'battle Medal touched');
check(medals[7].cost === 0, 'Stock Medal touched');
check(fix.applySupportCost(medals) === 0, 'not idempotent');

// in-place patch of a master folder
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'support-cost-'));
fs.writeFileSync(path.join(dir, 'medal.json'), JSON.stringify(rows()));
fix.patch(dir); fix.patch(dir);
const out = JSON.parse(fs.readFileSync(path.join(dir, 'medal.json'), 'utf8'));
check(out.filter((m) => m.cost === 999).length === 7, `patch: ${JSON.stringify(out.map((m) => m.cost))}`);
fs.rmSync(dir, { recursive: true, force: true });

// the served master: no support Medal below 999, battle Medals unchanged
const masterFile = path.join(__dirname, 'master_data', 'medal.json');
if (fs.existsSync(masterFile)) {
  const master = JSON.parse(fs.readFileSync(masterFile, 'utf8'));
  const bad = master.filter((m) => fix.isSupportMedal(m) && (m.cost !== 999 || m.minCost !== 999));
  check(!bad.length, `master: support Medals without cost 999: ${bad.map((m) => m.medalId).join(', ')}`);
  check(master.some((m) => m.type === 1 && m.cost === 46), 'master: battle Medal costs changed');
}

console.log(errors.length ? errors.map((e) => 'FAIL: ' + e).join('\n') : 'OK');
process.exit(errors.length ? 1 : 0);
