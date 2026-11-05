// node test-medal-power-fix.js
// burstPowerFix non tocca le burst a danno fisso (damageType 2: basePower 0, danno per colpo in sp1); su
// 3001562/3001568/3001737/3001936 il valore fisso letto come moltiplicatore superava int32 e il server
// scartava l'intera tabella burst (banco 20-10, Lexaeus A 7★ ancora a x1.95)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { burstPowerFix } = require('./medal-power-fix');

const fixed = { burstId: 3001562, damageType: 2, maxEnhanceCount: 5, basePower: 0, displayPower: 1288290000,
  basePowerPerEnforce: [0, 0, 0, 0, 0], displayPowerPerEnforce: [1395640000, 1610360000, 1825070000, 2039790000, 2254500000], sp1: 1288290000 };
const mult = { burstId: 3000444, damageType: 1, maxEnhanceCount: 5, basePower: 15000, displayPower: 15000,
  basePowerPerEnforce: [1, 1, 1, 1, 1], displayPowerPerEnforce: [1, 1, 1, 1, 1] };
const before = JSON.stringify(fixed);
const stats = burstPowerFix([fixed, mult], { multiOf: (id) => ({ 1562: 200.45, 444: 11.1 })[id] });
assert.strictEqual(JSON.stringify(fixed), before, 'riga a danno fisso modificata');
assert.strictEqual(mult.displayPowerPerEnforce[4], 111000);
assert.strictEqual(mult.displayPower, 106000);   // ramo Roboloid: 111000 - 5 x 1000 (passi uguali, I-212)
assert.deepStrictEqual(mult.displayPowerPerEnforce, [107000, 108000, 109000, 110000, 111000]);
assert.strictEqual(stats.robo, 1);
console.log('ok', JSON.stringify(stats));

// I-212 (user decision 05-11): a khuxwiki 7★ with only the full-dot value takes equal steps per dot as the thethiny
// originals (+400 below x2.00 ... +1000 from x3.50); the full-dot value stays. An «adjusted» form (evolution into a Medal
// of the same name and rarity, SN++ of notice 69365) reads the card's dmgevo.
{
  const row = (burstId) => ({ burstId, damageType: 1, maxEnhanceCount: 5, basePower: 1, displayPower: 1,
    basePowerPerEnforce: [1, 1, 1, 1, 1], displayPowerPerEnforce: [1, 1, 1, 1, 1] });
  const fiend = row(3001932), xion = row(3001948), xionEvo = row(3002012), mid = row(3009001);
  const medals = [
    { medalId: 311933, name: 'SN++ - Fiend', rare: 7, sortId: 1800, validBurst: 1, burstId: 3001932, type: 1 },
    { medalId: 301948, name: 'SN++ - KH III Xion', rare: 7, sortId: 1816, validBurst: 1, burstId: 3001948, type: 1, validEvolve: 1, evolveId: 312013 },
    { medalId: 312013, name: 'SN++ - KH III Xion', rare: 7, sortId: 1816, validBurst: 1, burstId: 3002012, type: 1 },
    { medalId: 309001, name: 'Mid', rare: 7, sortId: 1, validBurst: 1, burstId: 3009001, type: 1 },
  ];
  const wikiInfo = new Map([
    ['SN++ - Fiend', [{ name: 'SN++ - Fiend', nano7: '1800', dmg7: '1.00', dmg7b: '16.00' }]],
    ['SN++ - KH III Xion', [{ name: 'SN++ - KH III Xion', nano7: '1816', dmg7: '15.64', dmg7b: '18.14', dmgevo: '18.64', dmgevob: '20.14' }]],
    ['Mid', [{ name: 'Mid', nano7: '1', dmg7: '2.50' }]],
  ]);
  const st = burstPowerFix([fiend, xion, xionEvo, mid], { medals, wikiInfo });
  assert.deepStrictEqual([fiend.displayPower, ...fiend.displayPowerPerEnforce], [8000, 8400, 8800, 9200, 9600, 10000], 'Fiend +400 a pallino');
  assert.strictEqual(fiend.basePower, 8000);
  assert.deepStrictEqual([xion.displayPower, ...xion.displayPowerPerEnforce], [151400, 152400, 153400, 154400, 155400, 156400], 'Xion +1000');
  assert.deepStrictEqual([xionEvo.displayPower, xionEvo.displayPowerPerEnforce[4]], [181400, 186400], 'Xion adjusted: dmgevo 18.64');
  assert.deepStrictEqual([mid.displayPower, mid.displayPowerPerEnforce[0]], [22000, 22600], 'x2.50: +600');
  assert.strictEqual(st.evo, 1);
}

// the served master (if built): 5 dots and the tier-10 maximum unchanged, equal steps below; the five adjusted SN++
if (fs.existsSync(path.join(__dirname, 'master_data', 'burst.json'))) {
  const served = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'burst.json'), 'utf8')).map((b) => [b.burstId, b]));
  const f = served.get(3001932);
  assert.deepStrictEqual([f.displayPower, ...f.displayPowerPerEnforce], [8000, 8400, 8800, 9200, 9600, 10000], 'Fiend x0.80 .. x1.00');
  assert.deepStrictEqual([f.displayMaxPower, f.displayMaxPowerPerEnforce[4]], [158000, 160000], 'Fiend max x16.00 at 5 dots');
  assert.strictEqual(Math.round(f.displayPowerPerEnforce[4] * 4.2), 42000, 'tier 10: x4.20');
  assert.strictEqual(Math.round(f.displayMaxPowerPerEnforce[4] * 4.2), 672000, 'tier 10: x67.20');
  for (const [id, lo, hi] of [[3002008, 186400, 201400], [3002009, 186400, 201400], [3002010, 186400, 201400], [3002011, 191400, 206400], [3002012, 186400, 201400]]) {
    const b = served.get(id);
    assert.deepStrictEqual([b.displayPowerPerEnforce[4], b.displayMaxPowerPerEnforce[4]], [lo, hi], `adjusted SN++ ${id}`);
  }
  console.log('ok served master');
}
