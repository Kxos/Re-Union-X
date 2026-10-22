// node test-medal-guilt.js <repo>/server
const path = require('path');
const dir = process.argv[2];
const g = require(path.join(dir, 'medal-guilt.js'));
const medal = require(path.join(dir, 'master_data', 'medal.json'));
const burst = require(path.join(dir, 'master_data', 'burst.json'));
const assert = require('assert');
const byId = new Map(medal.map((r) => [r.medalId, r]));
const bById = new Map(burst.map((r) => [r.burstId, r]));
const gp = g.guiltProbRows();
console.log('guiltProb rows', gp.length, g.guiltRange(gp, 3));

// una 6★ originale con tier
const base = medal.find((r) => r.type === 1 && r.rare === 6 && r.guiltValue >= 3 && r.medalId < 300000 && r.validBurst);
const burstRow = { ...bById.get(base.burstId), maxEnhanceCount: 5 };
console.log('base', base.medalId, base.name, 'tier', base.guiltValue, 'addMax', base.addMaxAttack, 'cost', base.cost, base.minCost);
const copy = { row: base, burstUpperNumber: 0 };
let st = { burstUpperNumber: 0, guiltFactor: 0 };
let r = g.applyEnhance(base, st, [copy, copy, copy, copy, copy], { burstRow, guiltProb: gp, isGuilt: 1, rng: () => 0.5 });
assert.equal(r.state.burstUpperNumber, 5); assert.equal(r.state.guiltFactor, 0);
r = g.applyEnhance(base, r.state, [copy], { burstRow, guiltProb: gp, isGuilt: 1, rng: () => 0.5 });
assert.ok(r.events.guiltUnlocked); console.log('unlock', r.state.guiltFactor);
const mirror = { row: byId.get(90156) };
const r2 = g.applyEnhance(base, r.state, [mirror, mirror], { burstRow, guiltProb: gp, isGuilt: 1 });
assert.equal(r2.state.guiltFactor, r.state.guiltFactor + 200); console.log('mirror x2', r2.state.guiltFactor);
// reroll piu' basso non scende
const r3 = g.applyEnhance(base, r2.state, [copy], { burstRow, guiltProb: gp, isGuilt: 1, rng: () => 0 });
assert.equal(r3.state.guiltFactor, r2.state.guiltFactor);
// eccedenza (banco 18-10, anteprima del client): 2 pallini + due copie da 1 pallino = 2 + 2 + 2 > 5 ->
// pallini 5 e guilt sbloccata con un tiro; riempire esattamente (2 + 3 = 5) non la sblocca
const one = { row: base, burstUpperNumber: 1 };
const r7 = g.applyEnhance(base, { burstUpperNumber: 2 }, [one, one], { burstRow, guiltProb: gp, isGuilt: 1, rng: () => 0.5 });
assert.equal(r7.state.burstUpperNumber, 5); assert.ok(r7.events.guiltUnlocked, 'eccedenza: guilt sbloccata'); assert.equal(r7.events.rolls.length, 1);
const r8 = g.applyEnhance(base, { burstUpperNumber: 2 }, [one, copy], { burstRow, guiltProb: gp, isGuilt: 1, rng: () => 0.5 });
assert.equal(r8.state.burstUpperNumber, 5); assert.equal(r8.state.guiltFactor, 0, 'pieno esatto: niente guilt');
const r9 = g.applyEnhance(base, { burstUpperNumber: 2 }, [one, one], { burstRow, guiltProb: gp, isGuilt: 0 });
assert.equal(r9.state.guiltFactor, 0, 'isGuilt 0: eccedenza senza guilt');
// isGuilt 0: niente sblocco
const r4 = g.applyEnhance(base, { burstUpperNumber: 5 }, [copy], { burstRow, guiltProb: gp, isGuilt: 0 });
assert.equal(r4.state.guiltFactor, 0);
// Chip 6★ x10 -> cap addMaxAttack, Dale, Cid 10 x2 -> cap cost-minCost
const chip = { row: byId.get(90056) }, dale = { row: byId.get(90066) }, cid10 = { row: byId.get(90078) };
const r5 = g.applyEnhance(base, {}, Array(10).fill(chip).concat([dale, cid10, cid10]), { burstRow, guiltProb: gp, isGuilt: 1 });
console.log('chip/dale/cid', r5.state);
assert.equal(r5.state.attackUpperNumber, base.addMaxAttack);
assert.equal(r5.state.upperCost, base.cost - base.minCost);
// Mickey & Brooms
const ex = g.extraMedalRows(medal);
// master gia' rigenerato: la riga c'e' e extraMedalRows non la ricrea
const mb = ex.rows.find((x) => x.medalId === g.MICKEY_B_ID) || byId.get(g.MICKEY_B_ID);
const r6 = g.applyEnhance(base, { burstUpperNumber: 2 }, [{ row: mb }], { burstRow, guiltProb: gp, isGuilt: 1 });
assert.equal(r6.state.burstUpperNumber, 3);
console.log('extra rows', ex.rows.map((x) => `${x.medalId} ${x.name} type ${x.type} sell ${x.sell}`), ex.mickeyAPatch);
const fix = g.burstDotFixes(medal, burst);
const cnt = {}; for (const v of Object.values(fix)) cnt[v] = (cnt[v] || 0) + 1;
console.log('burst da correggere', Object.keys(fix).length, cnt);
console.log('OK');
