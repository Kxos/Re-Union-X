// Tricks dello Spirit (I-137): tabelle (make-pet-tables.js), un id per posto (pet.js) e Steal (server.js):
//   node server/test-pet-tricks.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const tables = require('./make-pet-tables');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

// tabelle: 22 trick, posti e valori dalla ricerca del 20-10
const skills = new Map(tables.petSkillRows().map((r) => [r.skillId, r]));
check(skills.size === 22, `petSkill: ${skills.size} righe`);
const sv = (id) => { const r = skills.get(id); return [r.invokeType, r.skillValue1, r.skillValue2, r.skillValue3, r.skillValue4].join(); };
check(sv(1) === '1,1,0,2,0' && sv(3) === '1,1,0,4,0', `Steal: ${sv(1)} / ${sv(3)}`);
check(sv(11) === '3,1,3,10000,25' && sv(12) === '3,1,4,30000,25' && sv(13) === '3,1,5,100000,25' && sv(14) === '3,1,6,500000,25' && sv(15) === '3,1,7,750000,25', 'Blast I-V');
check(sv(51) === '4,0,1,1,1' && sv(55) === '4,0,1,2,2' && sv(56) === '4,0,1,3,2', 'P/S/M Attack Boost');
check(sv(61) === '10,6,2500,4000,0' && sv(63) === '10,6,5000,4000,0', 'Combo');
check(sv(21) === '5,1,7,0,0' && sv(31) === '6,1,0,0,0' && sv(42) === '9,1,0,0,0' && sv(43) === '8,2,4,0,0', 'Esuna, HP Recovery, Boost di stato');
const ranks = tables.petRankRows();
check(JSON.stringify(ranks[16].openSkillIds) === '[3,15,21,31,41,42,43,54,55,56,63]', `rango 17: ${ranks[16].openSkillIds}`);
check(ranks.map((r) => r.validOpenSkill).join() === '0,1,2,3,4,4,7,7,10,10,11,11,11,11,11,11,11', 'validOpenSkill = numero di id');
check(JSON.stringify(ranks[0].openSkillIds) === '[]' && JSON.stringify(ranks[1].openSkillIds) === '[1]' && ranks[2].rankUpSkill === 11, 'ranghi 1-3');
// Blast: medaglie 3-7 con burst 12-16 a danno fisso esatto, idempotente
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-tricks-'));
const M = path.join(__dirname, 'master_data');
for (const n of ['medal', 'burst', 'shuffleskill']) fs.copyFileSync(path.join(M, n + '.json'), path.join(tmp, n + '.json'));
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
quiet(() => tables.patch(tmp));
const before = fs.readFileSync(path.join(tmp, 'burst.json'), 'utf8') + fs.readFileSync(path.join(tmp, 'medal.json'), 'utf8');
quiet(() => tables.patch(tmp));
check(before === fs.readFileSync(path.join(tmp, 'burst.json'), 'utf8') + fs.readFileSync(path.join(tmp, 'medal.json'), 'utf8'), 'Blast: seconda esecuzione identica');
const medals = JSON.parse(fs.readFileSync(path.join(tmp, 'medal.json'), 'utf8')), bursts = JSON.parse(fs.readFileSync(path.join(tmp, 'burst.json'), 'utf8'));
for (const [mid, bid, dmg] of [[3, 12, 1e4], [5, 14, 1e5], [7, 16, 75e4]]) {
  const m = medals.find((r) => r.medalId === mid), b = bursts.find((r) => r.burstId === bid);
  check(m && m.burstId === bid && m.addPetPt === 0 && b && b.damageType === 2 && b.specialPowerType === 2 && b.sp1 === dmg * 1e4
    && b.basePower === 0 && b.hitCount === 1 && b.target === 2 && b.bufAttack === 0, `Blast medal ${mid} / burst ${bid}`);
}
fs.rmSync(tmp, { recursive: true, force: true });

// server: un id per posto e Steal
const SAVE = path.join(os.tmpdir(), `khux-test-tricks-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE; process.env.KHUX_PET = '1'; delete process.env.KHUX_PET_SKILLS;
const { _test: t } = quiet(() => require('./server'));
const sub = t.pet().petSubslotData();
check(Array.isArray(sub.openSkillIds), 'petSubslot.openSkillIds');
// Steal su uno stage vero: il drop del primo nemico che supera il tiro, x moltiplicatore a /stage/clear
const stageId = Object.keys(t.STAGE_POI).map(Number).find((id) => (t.STAGE_POI[id].enemies || []).some((e) => t.rewardRowById(e.reward)?.type.includes(t.ENEMY_DROP_TYPE)));
const enemy = t.STAGE_POI[stageId].enemies.find((e) => t.rewardRowById(e.reward)?.type.includes(t.ENEMY_DROP_TYPE));
const row = t.rewardRowById(enemy.reward), at = row.type.indexOf(t.ENEMY_DROP_TYPE);
const drops = [{ uniqueEnemyId: enemy.uid, dropItemTypeIds: [5], stealType: 0 }];
check(t.applySteal(stageId, [{ uniqueEnemyId: 999999, dropItemTypeIds: [5], stealType: 0 }], () => 0, 3)[0].stealType === 0, 'Steal: uid senza record nella mappa scartato');
check(t.applySteal(stageId, drops, () => 0.9, 3).every((d) => d.stealType === 0) && t.player.steal === null, 'Steal: tiro fallito, niente');
check(t.applySteal(stageId, drops, () => 0, 1).every((d) => d.stealType === 0), 'senza Steal aperto (moltiplicatore < 2): niente');
const out = quiet(() => t.applySteal(stageId, drops, () => 0, 3));
check(out[0].stealType === 1 && t.player.steal && t.player.steal.mult === 3, `Steal: drop marcato (${JSON.stringify(t.player.steal)})`);
t.player.created = true; t.player.currentStageId = stageId;
t.player.materials = {}; const id = row.id[at];
let b = null; quiet(() => t.respondStageClear({ writeHead() {}, end(x) { b = x; } }, { getEnemyDropItems: [enemy.uid], getMaterials: [] }));
check((t.player.materials[id] || 0) === row.num[at] * 3, `Steal x3 a /stage/clear: ${t.player.materials[id]} invece di ${row.num[at] * 3}`);
check(t.player.steal === null, 'Steal azzerato dopo /stage/clear');

try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: pet tricks');
