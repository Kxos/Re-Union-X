// Migrazione delle skill salvate alla tabella completa e alla curva vera (I-146, docs/notes/medaglie.md#skill):
//   node server/test-skill-migration.js
// Salvataggio temporaneo (KHUX_SAVE), master del banco (server/master_data); senza master stampa SKIP.
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const assert = require('assert');
const { expToReach, scroogeSkill, scroogeSkillV1, SCROOGE_SKILL_BASE } = require('./medal-skill');
const { spawnSync } = require('child_process');

const MASTER = path.join(__dirname, 'master_data');
if (!fs.existsSync(path.join(MASTER, 'skillExp.json'))) {
  console.log('SKIP: master senza skillExp');
  process.exit(0);
}
const skills = JSON.parse(fs.readFileSync(path.join(MASTER, 'skill.json'), 'utf8'));
const expRows = new Map(JSON.parse(fs.readFileSync(path.join(MASTER, 'skillExp.json'), 'utf8')).map((r) => [r.expId, r.value]));
const medals = new Map(JSON.parse(fs.readFileSync(path.join(MASTER, 'medal.json'), 'utf8')).map((r) => [r.medalId, r]));
const byId = new Map(skills.map((r) => [r.skillId, r]));
const curve = (skillId) => expRows.get(byId.get(skillId).expType);

// la regola di prima (12-10) sulle 12 skill di allora, scritta qui a parte: rango per rarita', pool per skillId
const OLD_IDS = [1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1109, 1110, 1112, 1113];
function oldRule(row, userMedalId) {
  const old = skills.filter((s) => OLD_IDS.includes(s.skillId));
  const rank = { 3: 1, 5: 2, 6: 3 }[row.rare] || 1;
  let pool = old.filter((s) => s.rank === rank);
  if (!pool.length) pool = old;
  pool = [...pool].sort((a, b) => a.skillId - b.skillId);
  const s = pool[userMedalId % pool.length];
  return { userSkillId: SCROOGE_SKILL_BASE + userMedalId, skillId: s.skillId, level: s.maxLv };
}

const S3 = 90123, S6 = 90126;
assert.strictEqual(medals.get(S3).rare, 3); assert.strictEqual(medals.get(S6).rare, 6);
// la 6★ (rango 3: 1 skill vecchia, 143 nuove) con un userMedalId per cui la regola sulla tabella completa da'
// un'altra skill: senza migrazione cambierebbe
const id3 = 201;
let id6 = 202;
while (scroogeSkill(medals.get(S6), id6, skills).skillId === oldRule(medals.get(S6), id6).skillId) id6++;

// 1. scroogeSkillV1 = la regola di prima, anche con la tabella completa
for (let id = 1; id < 60; id++) {
  for (const mid of [90123, 90125, 90126]) {
    const v1 = scroogeSkillV1(medals.get(mid), id, skills);
    const o = oldRule(medals.get(mid), id);
    assert.deepStrictEqual([v1.userSkillId, v1.skillId, v1.level], [o.userSkillId, o.skillId, o.level], `V1 ${mid} ${id}`);
  }
}
assert.strictEqual(scroogeSkillV1(medals.get(1), 1, skills), null, 'medaglia normale senza skill');

// 2. salvataggio vecchio (curva inventata): due Scrooge senza voce, una skill salvata LV 4 exp 3500, una al
//    massimo vecchio, medaglie senza skill
const T6 = 1700000000000;
const SAVE = path.join(os.tmpdir(), `khux-test-skillmig-${process.pid}.json`);
fs.writeFileSync(SAVE, JSON.stringify({
  created: true, name: 'Vecchio', clockVersion: 2, nextUserSkillId: 10, medalState: {},
  medals: [
    { userMedalId: id3, medalId: S3, level: 1, exp: 0, getDatetime: T6 },
    { userMedalId: id6, medalId: S6, level: 1, exp: 0, getDatetime: T6 + 1000 },
    { userMedalId: 203, medalId: 1, level: 1, exp: 0, getDatetime: T6 + 2000 },
    { userMedalId: 204, medalId: 1, level: 1, exp: 0, getDatetime: T6 + 3000 },
    { userMedalId: 205, medalId: 1, level: 1, exp: 0, getDatetime: T6 + 4000 },
    { userMedalId: 206, medalId: 1, level: 1, exp: 0, getDatetime: T6 + 5000 }],
  medalSkills: {
    203: { userSkillId: 7, skillId: 1101, level: 4, exp: 3500, getDatetime: T6 + 2500 },
    205: null,
    206: { userSkillId: 8, skillId: 1100, level: 10, exp: 1000, getDatetime: T6 + 5500 },
  },
}));
// 2b. guardia: con un master vecchio (skillExp inventata di 3 righe) la migrazione e' rimandata, salvataggio
//     intatto e skillVersion non impostata (processo a parte: server.js migra al caricamento)
{
  const OLDM = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-test-oldmaster-'));
  for (const f of fs.readdirSync(MASTER)) fs.copyFileSync(path.join(MASTER, f), path.join(OLDM, f));
  fs.writeFileSync(path.join(OLDM, 'skillExp.json'), JSON.stringify([{ expId: 1, value: [10, 1000, 15000] },
    { expId: 2, value: [15, 3000, 15000] }, { expId: 3, value: [20, 6000, 15000] }]));
  const SAVE2 = path.join(os.tmpdir(), `khux-test-skillmig-old-${process.pid}.json`);
  const saveText = fs.readFileSync(SAVE, 'utf8');
  fs.writeFileSync(SAVE2, saveText);
  try {
    const r = spawnSync(process.execPath, ['-e',
      "const t=require('./server')._test;console.error('RES '+JSON.stringify({v:t.player.skillVersion,s:Object.keys(t.player.medalSkills||{})}))"],
    { cwd: __dirname, env: { ...process.env, KHUX_SAVE: SAVE2, KHUX_MASTER_DIR: OLDM }, encoding: 'utf8' });
    const all = String(r.stdout) + String(r.stderr);
    assert.ok(all.includes('[skill] migrazione rimandata'), 'avviso mancante: ' + all.slice(0, 300));
    const res = JSON.parse(all.slice(all.indexOf('RES ') + 4).split(/\r?\n/)[0]);
    assert.strictEqual(res.v, undefined, 'skillVersion con master vecchio');
    assert.deepStrictEqual(res.s.sort(), ['203', '205', '206'], 'voci aggiunte con master vecchio');
    // il server riscrive il salvataggio con i suoi default: contano skillVersion e medalSkills su disco
    const disk = JSON.parse(fs.readFileSync(SAVE2, 'utf8'));
    assert.ok(!('skillVersion' in disk), 'skillVersion su disco');
    assert.deepStrictEqual(disk.medalSkills, JSON.parse(saveText).medalSkills, 'medalSkills cambiate con master vecchio');
  } finally {
    for (const f of [SAVE2, SAVE2 + '.tmp']) try { fs.unlinkSync(f); } catch {}
    fs.rmSync(OLDM, { recursive: true, force: true });
  }
}
process.env.KHUX_SAVE = SAVE; process.env.KHUX_MASTER_DIR = MASTER;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
try {
  const { _test: t } = quiet(() => require('./server'));
  const p = t.player;
  // la migrazione e' gia' avvenuta al caricamento (come migrateClock)
  assert.strictEqual(p.skillVersion, 1, 'skillVersion');
  for (const [uid, mid, at] of [[id3, S3, T6], [id6, S6, T6 + 1000]]) {
    const o = oldRule(medals.get(mid), uid);
    const s = p.medalSkills[uid];
    assert.ok(s, `Scrooge ${uid} senza voce`);
    assert.deepStrictEqual([s.userSkillId, s.skillId, s.level], [o.userSkillId, o.skillId, o.level], `Scrooge ${uid}`);
    assert.strictEqual(s.getDatetime, at, `Scrooge ${uid} getDatetime`);
    assert.strictEqual(s.exp, expToReach(curve(s.skillId), s.level), `Scrooge ${uid} exp al massimo`);
  }
  assert.notStrictEqual(p.medalSkills[id6].skillId, scroogeSkill(medals.get(S6), id6, skills).skillId, 'la vecchia resta');
  assert.deepStrictEqual(p.medalSkills[203],
    { userSkillId: 7, skillId: 1101, level: 4, exp: expToReach(curve(1101), 4), getDatetime: T6 + 2500 }, 'skill LV 4');
  assert.strictEqual(p.medalSkills[203].level, 4);
  assert.deepStrictEqual(p.medalSkills[206],
    { userSkillId: 8, skillId: 1100, level: 10, exp: expToReach(curve(1100), 10), getDatetime: T6 + 5500 }, 'skill al massimo');
  assert.ok(!(204 in p.medalSkills), 'medaglia senza skill: nessuna voce nuova');
  assert.strictEqual(p.medalSkills[205], null, 'senza skill resta senza');
  // il client vede la stessa skill di prima
  const el = t.userSkillsData(t.serverTime(), t.userMedalList()).find((e) => e.userMedalId === id6);
  assert.strictEqual(el.skillId, oldRule(medals.get(S6), id6).skillId, 'userSkills');
  // salvata su disco
  assert.strictEqual(JSON.parse(fs.readFileSync(SAVE, 'utf8')).skillVersion, 1, 'non salvata');

  // 3. seconda chiamata: nulla cambia
  const before = JSON.stringify(p);
  quiet(() => t.migrateSkills());
  assert.strictEqual(JSON.stringify(p), before, 'migrazione ripetuta');

  // 4. Scrooge nuova (dopo la migrazione): regola sulla tabella completa, nessuna voce salvata
  p.medals.push({ userMedalId: 300, medalId: S6, level: 1, exp: 0, getDatetime: T6 + 9000 });
  const n = t.userSkillsData(t.serverTime(), t.userMedalList()).find((e) => e.userMedalId === 300);
  assert.strictEqual(n.skillId, scroogeSkill(medals.get(S6), 300, skills).skillId, 'Scrooge nuova');
  assert.ok(!(300 in p.medalSkills));
  assert.strictEqual(n.exp, expToReach(curve(n.skillId), skills.find((r) => r.skillId === n.skillId).maxLv), 'Scrooge nuova: EXP al massimo');
} finally {
  for (const f of [SAVE, SAVE + '.tmp']) try { fs.unlinkSync(f); } catch {}
}
console.log('OK test-skill-migration');
