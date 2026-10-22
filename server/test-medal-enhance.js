// Prova del Level Up (POST /user/medal/enhance, azione 55) con medaglie speciali, senza client:
// chiama respondMedalEnhance di server.js su un salvataggio temporaneo. Serve un master
// rigenerato con make-game-tables.js (guiltProb piena, burst con pallini, 300948/300913):
//
//   node server/test-medal-enhance.js [cartella master]   (default server/master_data)
//
// Non tocca server/save: KHUX_SAVE punta a un file temporaneo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const SAVE = path.join(os.tmpdir(), `khux-test-enhance-${process.pid}.json`);
process.env.KHUX_MASTER_DIR = MASTER;
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_GUILT_BURST_LV;
delete process.env.KHUX_GUILT_BURST_POPUP;
const log = console.log;
console.log = () => {};   // il server stampa molto al caricamento e a ogni Level Up
const { _test: t } = require('./server');
console.log = log;
const g = require('./medal-guilt');

const medal = JSON.parse(fs.readFileSync(path.join(MASTER, 'medal.json'), 'utf8'));
const burst = JSON.parse(fs.readFileSync(path.join(MASTER, 'burst.json'), 'utf8'));
const stage = JSON.parse(fs.readFileSync(path.join(MASTER, 'stage.json'), 'utf8'));
const gp = JSON.parse(fs.readFileSync(path.join(MASTER, 'guiltProb.json'), 'utf8'));
assert.ok(gp.length > 0, 'guiltProb vuota: rigenerare il master con make-game-tables.js');
const byId = new Map(medal.map((r) => [r.medalId, r]));
const bById = new Map(burst.map((r) => [r.burstId, r]));

// una 6★ con tier e attacco speciale (come test-medal-guilt.js)
const base = medal.find((r) => r.type === 1 && r.rare === 6 && r.guiltValue >= 3 && r.medalId < 300000 && r.validBurst);
const maxDots = bById.get(base.burstId).maxEnhanceCount;
const range = g.guiltRange(gp, base.guiltValue);
log('base', base.medalId, base.name, 'tier', base.guiltValue, 'pallini max', maxDots, 'guilt', range,
  'addMaxAttack', base.addMaxAttack, 'addMaxDefense', base.addMaxDefense, 'cost', base.cost, base.minCost);
assert.equal(maxDots, 5, 'la burst di una 6★ deve avere 5 pallini');
assert.equal(base.cost - base.minCost, 20, 'Cid: 6★ con 20 riduzioni');

const p = t.player;
Object.assign(p, { created: true, money: 10000000, medals: [], medalState: {}, lastClearStageId: 0, guiltBurst: undefined });
let nextId = 101;
const give = (medalId, n = 1) => Array.from({ length: n }, () => {
  const m = { userMedalId: nextId++, medalId, level: 1, exp: 0 };
  p.medals.push(m);
  return m.userMedalId;
});
function enhance(baseId, cells, numbers = [], isOverwriteSkill = 0) {
  let out;
  const res = { writeHead: () => {}, end: (b) => { out = JSON.parse(b.toString('utf8')); } };
  console.log = () => {};
  try { t.respondMedalEnhance(res, { baseUserMedalId: baseId, componentUserMedalIds: cells, numbers, isOverwriteSkill, isGreatSuccess: 0 }); }
  finally { console.log = log; }
  return out;
}
const state = (id) => t.userMedalList().find((m) => m.userMedalId === id);

const b = give(base.medalId)[0];
// 1. cinque copie: 5 pallini, EXP e livello come prima, materiali consumati
let r = enhance(b, give(base.medalId, 5));
assert.equal(r.afterEnhanceUserMedal.burstUpperNumber, 5);
assert.equal(r.afterEnhanceUserMedal.guiltFactor, 0);
assert.ok(r.afterEnhanceUserMedal.level > 1 && r.afterEnhanceUserMedal.exp > 0, 'EXP del Level Up normale');
assert.equal(r.beforeEnhanceUserMedal.burstUpperNumber, 0);
assert.equal(r.componentUserMedalIds.length, 5);
assert.equal(r.userMedals.find((m) => m.userMedalId === b).burstUpperNumber, 5);
log('1. 5 copie: pallini', r.afterEnhanceUserMedal.burstUpperNumber, 'LV', r.afterEnhanceUserMedal.level, 'exp', r.afterEnhanceUserMedal.exp);

// 2. senza Power Bangle (Quest 34) una copia in piu' non sblocca la guilt
assert.equal(t.isGuiltUnlocked(), 0);
r = enhance(b, give(base.medalId));
assert.equal(r.afterEnhanceUserMedal.guiltFactor, 0);
log('2. senza Quest 34: guilt', r.afterEnhanceUserMedal.guiltFactor);

// 3. Quest 34 superata: la copia sblocca la guilt nell'intervallo del tier; Burst +1
p.lastClearStageId = stage.find((s) => s.id === 34).stageId;
assert.equal(t.isGuiltUnlocked(), 1);
const lv0 = t.userPointData('2026-10-12 00:00:00').guiltBurstLv;
// tiro fisso: un primo tiro gia' al massimo dava Burst +6 e niente passo 6 (test intermittente, 19-10)
const rndStep3 = Math.random;
Math.random = () => 0.3;
r = enhance(b, give(base.medalId));
Math.random = rndStep3;
const gf = r.afterEnhanceUserMedal.guiltFactor;
assert.ok(gf < range.max, `tiro fisso sotto il massimo (${gf})`);
assert.ok(gf >= range.min && gf <= range.max, `guilt ${gf} fuori da ${range.min}-${range.max}`);
assert.equal(state(b).guiltFactor, gf, 'guilt salvata in medalState');
const lv1 = r.userData.userPoint.guiltBurstLv;
assert.equal(lv1, lv0 + 1, 'prima guilt: Burst +1');
// popup del Nova (acceso per default): il client mostra «LV <suo livello> » LV <campo>», quindi il campo e' il
// livello d'arrivo, non l'aumento (banco 17-10: «LV 6 » LV 1» con l'aumento)
assert.equal(r.guiltBurstFirstLv, lv1, 'guiltBurstFirstLv = livello dopo la prima guilt');
assert.equal(r.guiltBurstMaxLv, 0, 'guiltBurstMaxLv 0 senza guilt massima');
log('3. Quest 34: guilt', gf, 'Burst', lv0, '->', lv1);

// 4. Magic Mirror x2 (pila: una cella, numbers [2]): +1% ciascuno, fino al massimo
const mirrors = give(90156, 2);
r = enhance(b, [mirrors[0]], [2]);
const rMirror = r; // se gli specchi arrivano gia' al massimo, la prima guilt massima e' qui (test intermittente, 19-10)
assert.equal(r.afterEnhanceUserMedal.guiltFactor, Math.min(range.max, gf + 200));
assert.equal(t.userMedalList().filter((m) => m.medalId === 90156).length, 0, 'specchi consumati');
log('4. Mirror x2: guilt', r.afterEnhanceUserMedal.guiltFactor);

// 5. Chip 6★ x10, Dale 6★, Cid 10 x3: STR/DEF e costo con i limiti della base
const chips = give(90056, 10), dale = give(90066), cids = give(90078, 3);
r = enhance(b, [chips[0], dale[0], cids[0]], [10, 1, 3]);
const a = r.afterEnhanceUserMedal;
assert.equal(a.attackUpperNumber, Math.min(base.addMaxAttack, 1500));
assert.equal(a.defenseUpperNumber, Math.min(base.addMaxDefense, 150));
assert.equal(a.upperCost, -20, 'upperCost al client: negativo');
assert.equal(state(b).upperCost, 20, 'medalState: riduzione positiva');
assert.equal(a.burstUpperNumber, 5, 'pallini conservati');
log('5. Chip x10, Dale, Cid 10 x3: STR +', a.attackUpperNumber, 'DEF +', a.defenseUpperNumber, 'upperCost', a.upperCost);

// 6. guilt al massimo (rilanci + specchi): Burst +5 (prima guilt massima)
let rMax = state(b).guiltFactor >= range.max ? rMirror : null;
for (let i = 0; i < 200 && state(b).guiltFactor < range.max; i++) rMax = enhance(b, [give(90156)[0]]);
assert.equal(state(b).guiltFactor, range.max);
assert.equal(rMax.guiltBurstMaxLv, lv1 + 5, 'guiltBurstMaxLv = livello dopo la guilt massima');
assert.equal(rMax.guiltBurstFirstLv, 0, 'guiltBurstFirstLv 0 senza prima guilt nuova');
r = enhance(b, give(90056));   // una fusione qualsiasi per rileggere il Burst
assert.equal(r.userData.userPoint.guiltBurstLv, lv1 + 5, 'guilt massima: Burst +5');
assert.equal(r.guiltBurstFirstLv + r.guiltBurstMaxLv, 0, 'nessun popup senza livelli nuovi');
log('6. guilt massima', state(b).guiltFactor, 'Burst', r.userData.userPoint.guiltBurstLv);

// 7. Fantasia Mickey B (type 8) su un'altra 6★ con 2 pallini: +1
if (byId.has(g.MICKEY_B_ID)) {
  const other = medal.find((x) => x.type === 1 && x.rare === 6 && x.validBurst && x.medalId !== base.medalId && x.medalId < 300000
    && bById.get(x.burstId)?.maxEnhanceCount === 5);
  const o = give(other.medalId)[0];
  enhance(o, give(other.medalId, 2));
  assert.equal(state(o).burstUpperNumber, 2);
  r = enhance(o, give(g.MICKEY_B_ID));
  assert.equal(r.afterEnhanceUserMedal.burstUpperNumber, 3);
  log('7. Mickey & Brooms:', other.name, 'pallini 2 -> 3');
  // Fantasia Mickey A evolvibile con 5 Magic Broom
  const ma = byId.get(90085);
  assert.deepEqual([ma.validEvolve, ma.evolveId, ma.validEvolveNeed, ma.evolveNeedId[0]], [1, g.MICKEY_B_ID, 5, g.BROOM_ID]);
} else log('7. saltato: master senza 300913 (KHUX_MEDALS_ALL=1)');

// 8. medaglia senza attacco speciale (Dewey) + copia: niente pallini, EXP normale
const dewey = give(90041)[0];
r = enhance(dewey, give(90041));
assert.equal(r.afterEnhanceUserMedal.burstUpperNumber, 0);
assert.equal(r.afterEnhanceUserMedal.guiltFactor, 0);
log('8. Dewey: pallini 0, LV', r.afterEnhanceUserMedal.level);

// 9. Overwrite Skill (I-088, server/medal-skill.js)
const sk = require('./medal-skill');
const skills = JSON.parse(fs.readFileSync(path.join(MASTER, 'skill.json'), 'utf8'));
const skById = new Map(skills.map((s) => [s.skillId, s]));
const misc = JSON.parse(fs.readFileSync(path.join(MASTER, 'medalMisc.json'), 'utf8'));
const mv = (id) => misc.find((r) => r.medalMiscId === id).value[0];
assert.deepEqual([mv(121), mv(122)], [2000, 10000], 'medalMisc 121/122: 20% - 100%');
const ab1 = skById.get(1100);   // Attack Boost I, maxLv 10
assert.equal(sk.skillChance(ab1, 1, 2000, 10000), 0.2);
assert.equal(sk.skillChance(ab1, 10, 2000, 10000), 1);
assert.equal(sk.skillChance(ab1, 5, 2000, 10000), Math.trunc(2000 + Math.trunc(8000 * 4 / 9)) / 10000);
const scroogeRow = medal.find((r) => sk.isSkillMedal(r));
assert.ok(scroogeRow, 'Scrooge (type 2, «grants a skill») nel master');
Object.assign(p, { medalSkills: {}, nextUserSkillId: 0 });
const atk = medal.find((r) => r.type === 1 && r.rare >= 3 && r.medalId < 300000 && r.medalId !== base.medalId);

// 9a. la Scrooge ha la sua skill al livello massimo, nella lista userSkills e nell'elemento
const sc1 = give(scroogeRow.medalId)[0];
const scSkill = t.userSkillsData().find((s) => s.userMedalId === sc1);
assert.ok(scSkill && scSkill.userSkillId === sk.SCROOGE_SKILL_BASE + sc1, 'skill della Scrooge');
assert.equal(scSkill.level, skById.get(scSkill.skillId).maxLv);
assert.deepEqual(t.userMedalElement(state(sc1), 'x').userSkills, [scSkill.userSkillId]);
log('9a. Scrooge', scroogeRow.rare + '★:', skById.get(scSkill.skillId).name, 'LV', scSkill.level);

// 9b. Overwrite acceso, Scrooge a sinistra: 100%, la base prende skill e livello
const x = give(atk.medalId)[0];
assert.deepEqual(t.userMedalElement(state(x), 'x').userSkills, [], 'medaglia d\'attacco senza skill');
r = enhance(x, [sc1, give(90041)[0]], [], 1);
assert.equal(r.successOverwrite, 1);
assert.equal(r.overwriteSkills.length, 1);
const ow = r.overwriteSkills[0];
assert.deepEqual([ow.skillId, ow.level, ow.userMedalId], [scSkill.skillId, scSkill.level, x]);
assert.deepEqual(r.afterEnhanceUserMedal.userSkills, [ow.userSkillId]);
assert.deepEqual(r.beforeEnhanceUserMedal.userSkills, []);
// azione 55: userSkills = skill da cancellare nel client: solo quella della Scrooge
// consumata, mai la lista intera (svuotava la tabella: crash dell'ordinamento «Skill», banco 18-10)
assert.deepEqual(r.userSkills.map((s) => s.userSkillId), [scSkill.userSkillId], 'userSkills = solo la skill consumata');
log('9b. Overwrite su', atk.name, ':', skById.get(ow.skillId).name, 'LV', ow.level, 'id', ow.userSkillId);

// 9c. Overwrite spento: la base tiene la sua skill, quella della Scrooge si perde
const sc2 = give(scroogeRow.medalId)[0];
r = enhance(x, [sc2], [], 0);
assert.equal(r.successOverwrite, 0);
assert.deepEqual(r.overwriteSkills, []);
assert.deepEqual(r.afterEnhanceUserMedal.userSkills, [ow.userSkillId]);
assert.deepEqual(r.userSkills.map((s) => s.userMedalId), [sc2], 'Overwrite spento: si cancella la skill della Scrooge');
log('9c. Overwrite spento: skill della base invariata');

// 9d. skill al livello 1 a sinistra: 20% (fallisce con 0,5, riesce con 0,1); stessa categoria
// sommata (due Attack Boost I LV1 = 40%), primo materiale senza skill = niente tentativo
const rnd = Math.random;
const withSkill = (skillId, level) => {
  const id = give(atk.medalId)[0];
  p.medalSkills[id] = { userSkillId: 900 + id, skillId, level, exp: 0 };
  return id;
};
try {
  const y = give(atk.medalId)[0];
  Math.random = () => 0.5;
  r = enhance(y, [withSkill(1100, 1)], [], 1);
  assert.equal(r.successOverwrite, 0, '20%: fallisce con 0,5');
  assert.deepEqual(r.afterEnhanceUserMedal.userSkills, []);
  Math.random = () => 0.35;
  r = enhance(y, [withSkill(1100, 1), withSkill(1100, 1)], [], 1);
  assert.equal(r.successOverwrite, 1, 'due Attack Boost I LV1 = 40%');
  assert.equal(r.overwriteSkills[0].skillId, 1100);
  Math.random = () => 0.1;
  const oldId = p.medalSkills[y].userSkillId;
  r = enhance(y, [withSkill(1112, 3)], [], 1);
  assert.equal(r.successOverwrite, 1, 'Defense Boost I LV3 sostituisce Attack Boost I');
  assert.deepEqual([r.overwriteSkills[0].skillId, r.overwriteSkills[0].level], [1112, 3]);
  // la base tiene il suo userSkillId (banco 18-10: con un id nuovo il client crasha al tocco sul
  // risultato, la medaglia «prima» cita l'id vecchio): prima, dopo e overwriteSkills sullo stesso id
  assert.equal(r.overwriteSkills[0].userSkillId, oldId, 'Overwrite: stesso userSkillId della base');
  assert.deepEqual(r.beforeEnhanceUserMedal.userSkills, [oldId]);
  assert.deepEqual(r.afterEnhanceUserMedal.userSkills, [oldId]);
  assert.ok(!r.userSkills.some((s) => s.userSkillId === oldId), 'la skill della base non si cancella');
  assert.equal(t.userSkillsData().filter((s) => s.userMedalId === y).length, 1, 'una skill sola per medaglia');
  Math.random = () => 0;
  r = enhance(y, [give(90041)[0], withSkill(1100, 10)], [], 1);
  assert.equal(r.successOverwrite, 0, 'skill non nel primo materiale: nessun tentativo');
  assert.equal(r.afterEnhanceUserMedal.userSkills.length, 1);
} finally { Math.random = rnd; }
log('9d. probabilita\' 20%/40%/sostituzione/primo slot: ok');

// 10. Evolve di una medaglia con guilt (final review 2b, I1): la guilt resta, l'evoluta e' un medalId nuovo
// e alza il Nova in silenzio (userPoint); niente copie in attesa per il popup «NOVA LEVEL UP!» di una
// risposta successiva (stage clear, draw, Moogle Shop) ne' sommate al popup di un Level Up dopo
const gpAll = t.masterRows('guiltProb');
const evoRow = medal.find((r) => r.validEvolve && !r.groupId && r.guiltValue > 0 && byId.get(r.evolveId)?.guiltValue > 0
  && g.guiltRange(gpAll, byId.get(r.evolveId).guiltValue).max > 0);
assert.ok(evoRow, 'una medaglia evolvibile con tier nel master');
const ev = give(evoRow.medalId)[0];
p.medalState[ev] = { ...(p.medalState[ev] || {}), guiltFactor: g.guiltRange(gpAll, byId.get(evoRow.evolveId).guiltValue).max };
t.guiltBurst().lists();   // la prima guilt della medaglia prima dell'Evolve: scartata qui
const lvEv0 = t.userPointData('2026-10-12 00:00:00').guiltBurstLv;
function evolve(baseId, cells) {
  let out;
  const res = { writeHead: () => {}, end: (b2) => { out = JSON.parse(b2.toString('utf8')); } };
  console.log = () => {};
  try { t.respondMedalEvolve(res, { baseUserMedalId: baseId, attachmentMedalIds: cells }); }
  finally { console.log = log; }
  return out;
}
r = evolve(ev, []);
assert.equal(state(ev).medalId, evoRow.evolveId, 'evoluta');
assert.ok(state(ev).guiltFactor > 0, 'guilt conservata dall\'Evolve');
assert.ok(r.userData.userPoint.guiltBurstLv > lvEv0, 'il Nova sale in silenzio con l\'evoluta');
assert.deepEqual(t.guiltBurst().lists(), { guiltBurstFirstUserMedalIds: [], guiltBurstMaxUserMedalIds: [] },
  'nessun popup del Nova fuori contesto dopo l\'Evolve');
r = enhance(b, give(90056));
assert.equal(r.guiltBurstFirstLv + r.guiltBurstMaxLv, 0, 'il Level Up dopo non somma le copie dell\'Evolve');
log('10. Evolve', evoRow.name, '->', byId.get(evoRow.evolveId).name, ': Nova', lvEv0, '->',
  t.userPointData('2026-10-12 00:00:00').guiltBurstLv, 'senza popup');

// 11. Trait dalla fusione (I-084 parte A): una copia della stessa medaglia = un trait fra gli 11 della ruota, in fondo;
// piu' copie = un trait solo; slot pieni = trait in sospeso (medalResumption status 1); niente trait con una medaglia
// diversa, con una base senza slot o con Mickey & Brooms; i trait del materiale consumato spariscono
const { FUSION_TRAIT_IDS } = require('./make-trait-groups');
const traitsOf = (id) => t.userMedalList().find((m) => m.userMedalId === id) && (p.medalTraits?.[id] || []);
const base11 = medal.find((r2) => r2.type === 1 && r2.shuffleskillSlot >= 3 && !r2.groupId && r2.shuffleSkillGroupId);
assert.ok((p.traitPending || []).some((x) => x.userMedalId === b), 'la base delle sezioni 1-10 (1 slot) ha un trait in sospeso');
p.traitPending = [];
const slots = base11.shuffleskillSlot;
const tb = give(base11.medalId)[0];
r = enhance(tb, give(base11.medalId));
assert.equal(r.afterEnhanceUserMedal.userShuffleSkills.length, 1, 'una copia: un trait');
assert.ok(FUSION_TRAIT_IDS.includes(r.afterEnhanceUserMedal.userShuffleSkills[0].shuffleSkillId), 'trait della ruota');
assert.deepEqual(r.medalResumption, { userShuffleSkills: [], resumptionStatus: 0 });
const firstTrait = r.afterEnhanceUserMedal.userShuffleSkills[0].userShuffleSkillId;
r = enhance(tb, give(base11.medalId, 3));
assert.equal(r.afterEnhanceUserMedal.userShuffleSkills.length, 2, 'tre copie: un trait solo');
assert.equal(r.afterEnhanceUserMedal.userShuffleSkills[0].userShuffleSkillId, firstTrait, 'il nuovo va in fondo');
for (let k = 2; k < slots; k++) enhance(tb, give(base11.medalId));
assert.equal(traitsOf(tb).length, slots, 'slot pieni');
const before11 = JSON.stringify(traitsOf(tb));
r = enhance(tb, give(base11.medalId));
assert.equal(JSON.stringify(traitsOf(tb)), before11, 'slot pieni: lista invariata');
assert.equal(r.medalResumption.resumptionStatus, 1, 'slot pieni: status 1');
assert.equal(r.medalResumption.userShuffleSkills.length, 1, 'slot pieni: un trait in sospeso');
assert.equal(r.medalResumption.userShuffleSkills[0].userMedalId, tb, 'il trait in sospeso e\' della base');
assert.equal(p.traitPending.length, 1, 'coda dei trait in sospeso');
const other11 = medal.find((r2) => r2.type === 1 && r2.shuffleskillSlot > 0 && r2.name !== base11.name && r2.medalId < 300000);
const nb = give(base11.medalId)[0];
r = enhance(nb, give(other11.medalId));
assert.equal(r.afterEnhanceUserMedal.userShuffleSkills.length, 0, 'medaglia diversa: nessun trait');
const noSlot = medal.find((r2) => r2.type === 4 && !r2.shuffleskillSlot && r2.medalId > 1);
const ns = give(noSlot.medalId)[0];
r = enhance(ns, give(noSlot.medalId));
assert.equal((r.afterEnhanceUserMedal.userShuffleSkills || []).length, 0, 'base senza slot: nessun trait');
assert.ok(p.traitPending.length === 1, 'resta il trait in sospeso di tb');
r = enhance(nb, give(base11.medalId));
assert.deepEqual(r.medalResumption, { userShuffleSkills: [], resumptionStatus: 0 },
  'fusione su una medaglia con slot liberi: nella risposta niente trait in sospeso di altre medaglie');
const mickey = medal.find((r2) => r2.type === 8);
const nbTraits = traitsOf(nb).length;
r = enhance(nb, give(mickey.medalId));
assert.equal(r.afterEnhanceUserMedal.userShuffleSkills.length, nbTraits, 'Mickey & Brooms: nessun trait');
const withTrait = give(base11.medalId)[0];
(p.medalTraits ||= {})[withTrait] = [{ userShuffleSkillId: 99001, shuffleSkillId: 10, type: 0, getDatetime: 0 }];
enhance(nb, [withTrait]);
assert.ok(!p.medalTraits[withTrait], 'trait del materiale consumato tolti');
log('11. trait: una copia +1, tre copie +1, slot pieni ->', JSON.stringify(r.medalResumption), '; slot della base', slots);

// 12. Trait Medal (I-084 parte B): sulla sua medaglia (anche 7★ e boosted) trait + pallino; tre impilate: un trait,
// tre pallini; su un'altra medaglia niente trait ne' pallino (resta l'EXP)
p.traitPending = [];
const TM1 = 9000001;
assert.equal(byId.get(TM1)?.type, 9, 'riga della Trait Medal #1');
for (const id of [301426, 301427, 2301426]) {
  const tmb = give(id)[0];
  r = enhance(tmb, give(TM1));
  assert.equal(r.afterEnhanceUserMedal.userShuffleSkills.length, 1, `Trait Medal #1 su ${id}: un trait`);
  assert.equal(r.afterEnhanceUserMedal.burstUpperNumber, 1, `Trait Medal #1 su ${id}: un pallino`);
}
const tm3 = give(301426)[0];
const pile = give(TM1, 3);
r = enhance(tm3, [pile[0]], [3]);
assert.equal(r.afterEnhanceUserMedal.userShuffleSkills.length, 1, 'tre Trait Medal: un trait');
assert.equal(r.afterEnhanceUserMedal.burstUpperNumber, 3, 'tre Trait Medal: tre pallini');
const tmOther = give(other11.medalId)[0];
const exp0 = state(tmOther).exp || 0;
r = enhance(tmOther, give(TM1));
assert.equal(r.afterEnhanceUserMedal.userShuffleSkills.length, 0, 'Trait Medal su un\'altra medaglia: nessun trait');
assert.equal(r.afterEnhanceUserMedal.burstUpperNumber || 0, 0, 'Trait Medal su un\'altra medaglia: nessun pallino');
assert.ok((state(tmOther).exp || 0) > exp0 || state(tmOther).level > 1, 'Trait Medal su un\'altra medaglia: EXP');
log('12. Trait Medal: trait + pallino sulla sua medaglia (6★, 7★, boosted), 3 impilate = 1 trait e 3 pallini, altrove solo EXP');

// medaglia 1 (Stock Medal) intatta
assert.equal(byId.get(1).imageId, 90000);
try { fs.unlinkSync(SAVE); } catch {}
log('OK');
