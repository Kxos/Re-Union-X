// Migrazione del salvataggio ai nuovi id dell'Organizzazione XIII (medalMapVersion 1-2): i doppioni 6★ «X A»
// 3004xx spariti dal master diventano l'id SE, le Tier 8 potenziate spariscono nella 6★ [+] potenziata;
// userMedalId, livello, skill, blocchi, deck e guilt restano. Salvataggio finto (KHUX_SAVE), un processo
// figlio per login (server.js legge il salvataggio al caricamento):
//   node server/test-orgxiii-migration.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const SAVE = path.join(os.tmpdir(), `khux-test-orgxiii-mig-${process.pid}.json`);
const T = 1700000000000;
const skill = { userSkillId: 5001, skillId: 1100, level: 3, exp: 40, getDatetime: T };
function save(extra) {
  return { created: true, name: 'Vecchio', clockVersion: 2, skillVersion: 1, nextUserSkillId: 6000, medalState: {},
    medals: [
      { userMedalId: 201, medalId: 300443, level: 7, exp: 90, getDatetime: T },
      { userMedalId: 202, medalId: 300644, level: 1, exp: 0, getDatetime: T + 1 },
      { userMedalId: 203, medalId: 300444, level: 1, exp: 0, getDatetime: T + 2 }, // 7★: resta
      { userMedalId: 204, medalId: 2031176, level: 1, exp: 0, getDatetime: T + 3 },
      { userMedalId: 205, medalId: 2131176, level: 1, exp: 0, getDatetime: T + 4 },
      { userMedalId: 206, medalId: 2133236, level: 1, exp: 0, getDatetime: T + 5 },
      { userMedalId: 207, medalId: 1, level: 1, exp: 0, getDatetime: T + 6 }],
    medalLocks: { 201: 1 }, deck: [201, 202, 203], medalSkills: { 201: skill }, medalTraits: { 201: [{ userShuffleSkillId: 1, shuffleSkillId: 9, type: 1, getDatetime: T }] },
    supportUserMedalId: 201,
    // una medaglia evoluta dal Level Up/Evolve tiene il medalId nello stato
    medalState: { 202: { medalId: 300638, level: 4 } },
    presents: [{ userPresentId: 1, resourceType: 3, resourceId: 300495, number: 1, limitDatetime: T * 2, comment: 'x', created: T },
      { userPresentId: 2, resourceType: 3, resourceId: 300496, number: 1, limitDatetime: T * 2, comment: 'x', created: T }, // 7★ A
      { userPresentId: 3, resourceType: 5, resourceId: 300443, number: 1, limitDatetime: T * 2, comment: 'x', created: T }], // materiale: no
    presentLastId: 3,
    // record Nova: 300446 (Marluxia) solo col vecchio id -> 32186; 300443 accanto a 31176 resta (il livello non scende)
    guiltBurst: { first: [300443, 31176, 300446, 1], max: [300443] }, ...extra };
}
// 2133236 non esiste tra le potenziate Tier 8 della lista (Roxas ha solo 2033236): resta com'e'
function login(file) {
  const env = { ...process.env, KHUX_SAVE: SAVE, KHUX_REVISION: '127' };
  delete env.KHUX_REAL_NOW; delete env.KHUX_SERVER_TIME;
  const code = `const log = console.log; console.log = () => {}; require(${JSON.stringify(path.join(__dirname, 'server'))}); log('done');`;
  execFileSync(process.execPath, ['-e', code], { env, encoding: 'utf8' });
  return JSON.parse(fs.readFileSync(SAVE, 'utf8'));
}
try {
  fs.writeFileSync(SAVE, JSON.stringify(save()));
  const p = login();
  const by = (id) => p.medals.find((m) => m.userMedalId === id);
  assert.strictEqual(p.medalMapVersion, 2, 'medalMapVersion 2');
  assert.deepStrictEqual(p.guiltBurst.first, [300443, 31176, 32186, 1], 'record Nova first');
  assert.deepStrictEqual(p.guiltBurst.max, [31176], 'record Nova max: 300443 -> 31176, nessun +5 in piu');
  assert.strictEqual(by(201).medalId, 31176, '300443 -> 31176');
  assert.strictEqual(by(202).medalId, 33236, '300644 -> 33236');
  assert.strictEqual(by(203).medalId, 300444, '7★ invariata');
  assert.strictEqual(by(204).medalId, 2301491, '2031176 -> 2301491');
  assert.strictEqual(by(205).medalId, 2301491, '2131176 -> 2301491');
  assert.strictEqual(by(206).medalId, 2133236, 'id non in tabella: invariato');
  assert.strictEqual(by(207).medalId, 1);
  assert.deepStrictEqual([by(201).level, by(201).exp, by(201).getDatetime], [7, 90, T], 'livello e data invariati');
  assert.deepStrictEqual(p.medalLocks, { 201: 1 }); assert.deepStrictEqual(p.deck, [201, 202, 203]);
  assert.deepStrictEqual(p.medalSkills['201'], skill, 'skill invariata');
  assert.strictEqual(p.medalTraits['201'].length, 1);
  assert.strictEqual(p.supportUserMedalId, 201);
  assert.strictEqual(p.medalState['202'].medalId, 31226, 'medalId nello stato (Evolve): 300638 -> 31226');
  assert.strictEqual(p.medalState['202'].level, 4);
  assert.strictEqual(p.presents[0].resourceId, 33216, 'premio in sospeso 300495 -> 33216');
  assert.strictEqual(p.presents[1].resourceId, 300496, 'premio 7★ invariato');
  assert.strictEqual(p.presents[2].resourceId, 300443, 'materiale (tipo 5) invariato');
  // secondo login: niente cambia
  const before = fs.readFileSync(SAVE, 'utf8');
  const p2 = login();
  assert.deepStrictEqual(p2.medals, p.medals); assert.strictEqual(p2.medalMapVersion, 2);
  assert.strictEqual(fs.readFileSync(SAVE, 'utf8'), before, 'secondo login: salvataggio identico');
  // nuovo giocatore: versione 1 senza migrazione
  fs.writeFileSync(SAVE, JSON.stringify({ created: false }));
  const code = `const log = console.log; console.log = () => {}; const { _test: t } = require(${JSON.stringify(path.join(__dirname, 'server'))}); log(t.player.medalMapVersion);`;
  const env = { ...process.env, KHUX_SAVE: SAVE, KHUX_REVISION: '127' };
  const n = { medalMapVersion: Number(execFileSync(process.execPath, ['-e', code], { env, encoding: 'utf8' }).trim().split('\n').pop()) };
  assert.strictEqual(n.medalMapVersion, 2, 'nuovo giocatore: medalMapVersion 2');
  // salvataggio gia' a versione 1 (banco 18-10): solo il record Nova
  fs.writeFileSync(SAVE, JSON.stringify(save({ medalMapVersion: 1, guiltBurst: { first: [300443, 31176], max: [300443] } })));
  const p3 = login();
  assert.strictEqual(p3.medals.find((m) => m.userMedalId === 201).medalId, 300443, 'versione 1: medaglie non ritoccate');
  assert.deepStrictEqual(p3.guiltBurst.max, [31176], 'versione 1: record Nova max migrato');
  assert.strictEqual(p3.medalMapVersion, 2);
  console.log('ok: migrazione Organizzazione XIII');
} finally { try { fs.unlinkSync(SAVE); } catch { /* assente */ } }
