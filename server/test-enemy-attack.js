// Attacchi originali dei nemici (enemy-attack-fix.js): node server/test-enemy-attack.js
'use strict';
const fs = require('fs'); const path = require('path');
const fix = require('./enemy-attack-fix');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const atts = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'enemyAttack.json'), 'utf8'));
// ogni attacco citato dai nemici esiste, anche i contrattacchi (urgencySkillId: 1501001 del Gold Tricholoma, I-207)
const enemies = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'enemy.json'), 'utf8'));
const haveAtt = new Set(atts.map((a) => a.enemyAttackId));
const dangling = [...new Set(enemies.flatMap((e) => [...(e.skillId || []), ...(e.urgencySkillId || [])]).filter((s) => s && !haveAtt.has(s)))];
check(dangling.length === 0, `attacchi citati ma assenti: ${dangling.slice(0, 5)} (${dangling.length})`);
// unita': addMissing copia il modello per posizione (1, 101, 601) e i contrattacchi da 601; idempotente
const tpl = [1, 101, 601].map((id) => ({ enemyAttackId: id, name: `t${id}`, power: id }));
const mini = JSON.parse(JSON.stringify(tpl));
const added = fix.addMissing(mini, [{ skillId: [1, 7, 8, 9], urgencySkillId: [5] }]);
check(added === 4 && mini.find((a) => a.enemyAttackId === 7)?.power === 101 && mini.find((a) => a.enemyAttackId === 5)?.power === 601,
  `addMissing: ${added} ${JSON.stringify(mini.slice(3))}`);
check(fix.addMissing(mini, [{ skillId: [1, 7, 8, 9], urgencySkillId: [5] }]) === 0, 'addMissing non idempotente');
const served = fix.servedHitEffects();
const again = fix.applyEnemyAttacks(atts, fix.readOrig(), served);
check(again.patched === 0, `master non corretto o non idempotente: ${JSON.stringify(again)}`);
// stati alterati come l'originale (Poison Apple «High Chance of Poison»)
const byId = new Map(atts.map((a) => [a.enemyAttackId, a]));
check(byId.get(9301)?.poison === 10000, `9301 poison ${byId.get(9301)?.poison}`);
check(atts.filter((a) => a.poison || a.deepPoison || a.sleep || a.paralysis).length === 39, 'attacchi con stato != 39');
// solo risorse servite: effetto di colpo servito, animazione atk1_o o atkSp
const badHit = atts.filter((a) => !served.has(a.hitEffect)).map((a) => `${a.enemyAttackId}:${a.hitEffect}`);
check(badHit.length === 0, `hitEffect non serviti: ${badHit.slice(0, 5).join(', ')} (${badHit.length})`);
check(atts.every((a) => [1, 2].includes(a.attackMotion)), 'attackMotion oltre 2');
if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: enemy attack');
