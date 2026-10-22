// Opzione del banco KHUX_BENCH_ENEMY_ATK (nemici piu' forti): node server/test-bench-enemy.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const assert = require('assert');
const { execFileSync } = require('child_process');

// ogni caso in un processo suo: l'opzione si legge al caricamento di server.js
function run(atk, prob) {
  const SAVE = path.join(os.tmpdir(), `khux-test-bench-enemy-${process.pid}-${atk}.json`);
  const env = { ...process.env, KHUX_SAVE: SAVE, KHUX_REVISION: '124' };
  delete env.KHUX_REAL_NOW; delete env.KHUX_SERVER_TIME;
  if (atk) env.KHUX_BENCH_ENEMY_ATK = String(atk); else delete env.KHUX_BENCH_ENEMY_ATK;
  if (prob !== undefined) env.KHUX_BENCH_SKILL_PROB = String(prob); else delete env.KHUX_BENCH_SKILL_PROB;
  const code = `const log = console.log; console.log = () => {};
    const { _test: t } = require(${JSON.stringify(path.join(__dirname, 'server'))});
    console.log = log;
    const e = t.servedMasterRows('enemy', Date.now()).find((r) => r.enemyId === 80001);
    const sk = t.servedMasterRows('skill', Date.now()).find((r) => r.skillId === 1130);
    log(JSON.stringify({ rev: t.masterRevisionNow(), attack: e.attack, hp: e.hp, prob: [sk.invokeProb, sk.invokeProbPerLv],
      other: t.servedMasterRows('stage', Date.now()).length === t.masterRows('stage').length }));`;
  try { return JSON.parse(execFileSync(process.execPath, ['-e', code], { env, encoding: 'utf8' }).trim().split('\n').pop()); }
  finally { try { fs.unlinkSync(SAVE); } catch { /* assente */ } }
}

const off = run(0), on = run(10);
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'enemy.json'), 'utf8')).find((r) => r.enemyId === 80001);
assert.deepEqual(off.attack, raw.attack, 'spenta: attacco del master');
assert.deepEqual(on.attack, raw.attack.map((v) => v * 10), 'accesa: attacco x 10');
assert.deepEqual(on.hp, raw.hp, 'gli HP non cambiano');
assert.ok(on.other, 'le altre tabelle non cambiano');
assert.equal(on.rev, off.rev + 90010, 'revisione diversa: il client riscarica il master');
const p0 = run(0, 0), p100 = run(0, 100);
assert.deepEqual(p0.prob, [0, 0], 'SkillProb 0: mai');
assert.deepEqual(p100.prob, [10000, 0], 'SkillProb 100: sempre');
assert.deepEqual(off.prob, [4000, 75], 'spenta: probabilita del master (Attack Boost VII, 2be5bd0)');
assert.ok(p0.rev !== off.rev && p100.rev !== off.rev && p0.rev !== p100.rev, 'revisioni diverse');
console.log('ok: Shadow', off.attack[0], '->', on.attack[0], ', revisione', off.rev, '->', on.rev);
