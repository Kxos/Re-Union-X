// Prova del generatore dei campi addBase* della tabella burst (I-155, server/make-base-buff.js), senza client:
// frasi scritte qui (forma delle descrizioni) e, se c'e', il master vero (righe 3001925 e 4001925).
//
//   node server/test-base-buff.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { parseBaseBuff, patch } = require('./make-base-buff');

const f = (d) => {
  const r = parseBaseBuff(d);
  assert.ok(r && r.fields, `non interpretata: ${d} -> ${JSON.stringify(r)}`);
  return r.fields;
};

// 1. speciale con «1 turn: Medal STR +2000»: tipo 1 (turni), durata 1, tutte le medaglie (attributo 0)
assert.deepStrictEqual(f('1 turn: Medal STR +2000, self [↑ STR 15], targets [↓ DEF 15], SP ATK B +200%. Gauge +5.'), {
  addBaseCountType: 1, addBaseCountValue: 1, addBaseAtkSelf: 2000, addBaseDefSelf: 0,
  addBaseAtkOpponent: 0, addBaseDefOpponent: 0, addBaseAttribute: 0,
});
// 2. attributo, piu' turni, attacchi
assert.strictEqual(f('2 turns: P-Medal STR +1000.').addBaseAttribute, 1);
assert.strictEqual(f('2 turns: P-Medal STR +1000.').addBaseCountValue, 2);
assert.deepStrictEqual([f('3 attacks: M-Medal STR +2500. 1 turn: self [↑ STR 5].')].map((x) =>
  [x.addBaseCountType, x.addBaseCountValue, x.addBaseAtkSelf, x.addBaseAttribute]), [[2, 3, 2500, 4]]);
assert.strictEqual(f('1 turn: P- & S-Medal STR +7000, self [↑ STR 15].').addBaseAttribute, 3);
assert.strictEqual(f('1 turn: R-Medal STR +1500.').addBaseAttribute, 16);
assert.strictEqual(f('1 turn: Medal STR 12000, SP ATK B +320%.').addBaseAtkSelf, 12000);
// 3. DEF dopo la STR (stesso attributo)
const def = f('1 turn: U-Medal STR +500, DEF +500, ↑ STR 10, SP ATK B +200%.');
assert.deepStrictEqual([def.addBaseAtkSelf, def.addBaseDefSelf, def.addBaseAttribute], [500, 500, 8]);
// 4. avversario: «targets' X-Medal STR -N» e «targets [Medal STR -N]»
const opp = f('Deals 3 hits. 1 turn: ↑ STR 10, SP ATK B +200%, targets’ U-Medal STR -1000, ↓ targets’ DEF 10.');
assert.deepStrictEqual([opp.addBaseAtkSelf, opp.addBaseAtkOpponent, opp.addBaseAttribute], [0, -1000, 8]);
const both = f('1 turn: Medal STR +2500, self [↑ DEF 10], targets [Medal STR -3000], SP ATK B +200%.');
assert.deepStrictEqual([both.addBaseAtkSelf, both.addBaseAtkOpponent], [2500, -3000]);
// 5. niente frase -> null; frase senza durata o con durate diverse -> problema
assert.strictEqual(parseBaseBuff('1 turn: self [↑ STR, U- & PSM-STR 15].'), null);
assert.ok(parseBaseBuff('Medal STR +1000.').problem);
assert.ok(parseBaseBuff('1 turn: Medal STR +1000. 2 turns: targets [Medal STR -500].').problem);

// 6. patch su una copia: idempotente, righe senza frase intatte
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basebuff-'));
const zero = { addBaseCountType: 0, addBaseCountValue: 0, addBaseAtkSelf: 0, addBaseDefSelf: 0, addBaseAtkOpponent: 0,
  addBaseDefOpponent: 0, resetBase: 0, addBaseAttribute: 0 };
fs.writeFileSync(path.join(dir, 'burst.json'), JSON.stringify([
  { burstId: 1, description: '1 turn: Medal STR +2000.', ...zero },
  { burstId: 2, description: 'Deals 3 hits.', ...zero },
  { burstId: 3, description: 'Medal STR +5.', ...zero },
]));
const s1 = patch(dir);
assert.deepStrictEqual([s1.rows, s1.changed, s1.problems.length], [1, 1, 1]);
assert.deepStrictEqual([patch(dir).changed], [0]);
const rows = JSON.parse(fs.readFileSync(path.join(dir, 'burst.json'), 'utf8'));
assert.strictEqual(rows[0].addBaseAtkSelf, 2000);
assert.strictEqual(rows[1].addBaseAtkSelf, 0);
assert.strictEqual(rows[2].addBaseAtkSelf, 0);
fs.rmSync(dir, { recursive: true, force: true });

// 7. master vero (git-ignored), se c'e': SN+ - KH III Naminé 3001925 (+2000) e la sua Supernova 4001925 (+5000)
const master = path.join(__dirname, 'master_data', 'burst.json');
if (fs.existsSync(master)) {
  const bursts = JSON.parse(fs.readFileSync(master, 'utf8'));
  const row = (id) => bursts.find((b) => b.burstId === id);
  for (const [id, atk] of [[3001925, 2000], [4001925, 5000]]) {
    if (!row(id)) continue;
    const x = f(row(id).description);
    assert.deepStrictEqual([x.addBaseCountType, x.addBaseCountValue, x.addBaseAtkSelf, x.addBaseAttribute], [1, 1, atk, 0], `burst ${id}`);
  }
  const bad = bursts.map((b) => [b.burstId, parseBaseBuff(b.description)]).filter(([, r]) => r && r.problem);
  assert.deepStrictEqual(bad, [], 'righe del master non interpretate');
} else {
  console.log('master assente: salto le righe vere');
}
console.log('test-base-buff: OK');
