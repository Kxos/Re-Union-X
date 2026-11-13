// Original moves and special-attack safety net (enemy-motion-fix.js, I-261): node server/test-enemy-motion-fix.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const fix = require('./enemy-motion-fix');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

// applyOriginalMoves: only rows present in the master, only the move fields, deep copies
const enemies = [
  { enemyId: 2013, displayId: 2013, hp: [5], validSkill: 3, skillId: [200100, 200101, 200100, 0], urgencySkillId: [0, 0, 0] },
  { enemyId: 7, displayId: 7, hp: [9], validSkill: 1, skillId: [700, 0, 0, 0], urgencySkillId: [0, 0, 0] },
];
const src = { enemies: {
  2013: { validSkill: 1, skillId: [2013010, 0, 0, 0], validUrgency: 0, urgencySkillId: [0, 0, 0] },
  99: { validSkill: 1, skillId: [1, 0, 0, 0] },
}, attacks: { 2013010: { enemyAttackId: 2013010, attackMotion: 1 } } };
const done = fix.applyOriginalMoves(enemies, src);
check(JSON.stringify(done) === '[2013]', `restored ${done}`);
check(enemies[0].skillId[0] === 2013010 && enemies[0].validSkill === 1 && enemies[0].hp[0] === 5, 'moves not restored or hp touched');
src.enemies[2013].skillId[0] = 1;
check(enemies[0].skillId[0] === 2013010, 'shared array with the source');
check(enemies[1].skillId[0] === 700, 'row outside the file changed');
check(fix.applyOriginalMoves(enemies, null).length === 0, 'no file must change nothing');
check(fix.attackRows(src).length === 1 && fix.attackRows(null).length === 0, 'attackRows');

// applyMotionFix: plain copy only on models without atkSp; original attack untouched; idempotent
const atts = [{ enemyAttackId: 11201, attackMotion: 2, power: 18500 }, { enemyAttackId: 11200, attackMotion: 1, power: 11500 }];
const rows = [
  { enemyId: 10249, displayId: 249, skillId: [11200, 11201, 0, 0], urgencySkillId: [11201, 0, 0] },
  { enemyId: 112, displayId: 112, skillId: [11200, 11201, 0, 0], urgencySkillId: [0, 0, 0] },
];
const sp = new Set([112]);
check(JSON.stringify(fix.missingMotions(rows, atts, sp)) === '[10249]', 'missingMotions before');
const rep = fix.applyMotionFix(rows, atts, sp);
const p = fix.plainId(11201);
check(rep.plain.length === 1 && rep.added.length === 1 && rows[0].skillId[1] === p && rows[0].urgencySkillId[0] === p, `plain ${JSON.stringify(rep)}`);
check(rows[1].skillId[1] === 11201, 'model with atkSp changed');
const copy = atts.find((a) => a.enemyAttackId === p);
check(copy && copy.attackMotion === 1 && copy.power === 18500, 'plain copy wrong');
check(atts.find((a) => a.enemyAttackId === 11201).attackMotion === 2, 'original attack changed');
check(fix.applyMotionFix(rows, atts, sp).added.length === 0 && fix.missingMotions(rows, atts, sp).length === 0, 'not idempotent');
let threw = false; try { fix.plainId(1220016001); } catch (e) { threw = true; }
check(threw, 'plainId overflow not caught');

// atkSpModels: names index + enemy_gen atkSp.lwf
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'));
fs.writeFileSync(path.join(tmp, 'names.tsv'), 'lwf/character/enemy/17/atkSp/a.lwf\t1\nlwf/character/enemy/18/wait/w.lwf\t1\n');
fs.mkdirSync(path.join(tmp, 'gen', '1565', 'atkSp'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'gen', '1565', 'atkSp', 'atkSp.lwf'), '');
fs.mkdirSync(path.join(tmp, 'gen', '1566', 'wait'), { recursive: true });
const models = fix.atkSpModels(path.join(tmp, 'names.tsv'), path.join(tmp, 'gen'), null);
check(JSON.stringify([...models].sort((a, b) => a - b)) === '[17,1565]', `atkSpModels ${[...models]}`);
fs.rmSync(tmp, { recursive: true, force: true });

// master: the rows of the private file carry their original moves (only where the file exists)
const file = fix.readOriginalMoves();
if (file) {
  const master = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'enemy.json'), 'utf8')).map((e) => [e.enemyId, e]));
  const wrong = Object.entries(file.enemies).filter(([k, m]) => master.has(Number(k))
    && fix.MOVE_KEYS.some((f) => f in m && JSON.stringify(master.get(Number(k))[f]) !== JSON.stringify(m[f]))).map(([k]) => k);
  check(wrong.length === 0, `master rows without their original moves: ${wrong.join(', ')}`);
}

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: enemy motion fix');
