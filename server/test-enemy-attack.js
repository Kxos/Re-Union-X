// Attacchi originali dei nemici (enemy-attack-fix.js): node server/test-enemy-attack.js
'use strict';
const fs = require('fs'); const path = require('path');
const fix = require('./enemy-attack-fix');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const atts = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'enemyAttack.json'), 'utf8'));
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
