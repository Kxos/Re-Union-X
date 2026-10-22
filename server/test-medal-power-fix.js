// node test-medal-power-fix.js
// burstPowerFix non tocca le burst a danno fisso (damageType 2: basePower 0, danno per colpo in sp1); su
// 3001562/3001568/3001737/3001936 il valore fisso letto come moltiplicatore superava int32 e il server
// scartava l'intera tabella burst (banco 20-10, Lexaeus A 7★ ancora a x1.95)
'use strict';
const assert = require('assert');
const { burstPowerFix } = require('./medal-power-fix');

const fixed = { burstId: 3001562, damageType: 2, maxEnhanceCount: 5, basePower: 0, displayPower: 1288290000,
  basePowerPerEnforce: [0, 0, 0, 0, 0], displayPowerPerEnforce: [1395640000, 1610360000, 1825070000, 2039790000, 2254500000], sp1: 1288290000 };
const mult = { burstId: 3000444, damageType: 1, maxEnhanceCount: 5, basePower: 15000, displayPower: 15000,
  basePowerPerEnforce: [1, 1, 1, 1, 1], displayPowerPerEnforce: [1, 1, 1, 1, 1] };
const before = JSON.stringify(fixed);
const stats = burstPowerFix([fixed, mult], { multiOf: (id) => ({ 1562: 200.45, 444: 11.1 })[id] });
assert.strictEqual(JSON.stringify(fixed), before, 'riga a danno fisso modificata');
assert.strictEqual(mult.displayPowerPerEnforce[4], 111000);
assert.strictEqual(mult.displayPower, 106500);   // ramo Roboloid: 111000 - 4500 (passi di tierPower)
assert.strictEqual(stats.robo, 1);
console.log('ok', JSON.stringify(stats));
