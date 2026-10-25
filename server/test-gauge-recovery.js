// «Gauge +N» of the specials (burst.recovery) in the client's unit: the SPECIAL gauge is counted in ten-thousandths
// (1 gauge = 10000, same as the cost check), so +5 gauges = 50000 (bench 25-10: with 5 the gauge never rose).
//   node server/test-gauge-recovery.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { applyBurstBuffs } = require('./burst-buffs');
const fix = require('./gauge-recovery-fix');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

// generator: a Roboloid ability with GaugeRecovery 5 gives recovery 50000
const medals = [{ medalId: 1, burstId: 10, validBurst: 1 }];
const bursts = [{ burstId: 10, description: 'Gauge +5.', target: 1, recovery: 0 }];
const roboOf = () => ({ Ability: { Text: 'Gauge +5.', SelfBuffs: { GaugeRecovery: 5 } } });
try { applyBurstBuffs(medals, bursts, roboOf); } catch (e) { errors.push(`applyBurstBuffs: ${e.message}`); }
check(bursts[0].recovery === 50000, `generator: recovery ${bursts[0].recovery}, expected 50000`);

// in-place fix of an existing master: whole gauges -> ten-thousandths, idempotent
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-rec-'));
fs.writeFileSync(path.join(dir, 'burst.json'), JSON.stringify([{ burstId: 1, recovery: 5 }, { burstId: 2, recovery: 0 }, { burstId: 3, recovery: 30000 }]));
fix.apply(dir); fix.apply(dir);
const rows = JSON.parse(fs.readFileSync(path.join(dir, 'burst.json'), 'utf8'));
check(rows[0].recovery === 50000 && rows[1].recovery === 0 && rows[2].recovery === 30000, `fix: ${JSON.stringify(rows.map((r) => r.recovery))}`);
fs.rmSync(dir, { recursive: true, force: true });

// the served master: Illus. KH III Xion (cost 3, Gauge +5) and MoM Kairi B (Gauge +3)
const master = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'burst.json'), 'utf8'));
const byId = new Map(master.map((r) => [r.burstId, r]));
check(byId.get(3002028)?.recovery === 50000, `master 3002028 recovery ${byId.get(3002028)?.recovery}`);
check(byId.get(3002084)?.recovery === 30000, `master 3002084 recovery ${byId.get(3002084)?.recovery}`);
check(!master.some((r) => r.recovery > 0 && r.recovery < 10000), 'master still has recovery in whole gauges');

console.log(errors.length ? errors.map((e) => 'FAIL: ' + e).join('\n') : 'OK');
process.exit(errors.length ? 1 : 0);
