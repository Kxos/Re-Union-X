// Salvataggio di prova per le verifiche al banco di Level Up (2-5 materiali), Evolve e potenziamento/evoluzione
// dei keyblade: copia del salvataggio vero con keyblade abbassati e medaglie pronte. Non tocca il sorgente.
//
//   node server/make-test-save.js [sorgente] [destinazione]
//   (default server/save/player.json -> server/save/prove.json; poi relogin.ps1 -Save prove)
'use strict';
const fs = require('fs');
const path = require('path');
const g = require('./medal-guilt');

const MASTER = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const SRC = process.argv[2] || path.join(__dirname, 'save', 'player.json');
const DST = process.argv[3] || path.join(__dirname, 'save', 'prove.json');
const table = (n) => JSON.parse(fs.readFileSync(path.join(MASTER, n + '.json'), 'utf8'));

const medals = new Map(table('medal').map((r) => [r.medalId, r]));
const keyblades = new Map(table('keyblade').map((r) => [r.keybladeId, r]));
const misc = (id) => table('medalMisc').find((r) => r.medalMiscId === id)?.value || [0, 0, 0];
const guiltProb = table('guiltProb');

// EXP cumulativo per superare il livello lv (come medalExpToPass di server.js)
function expToPass(row, lv) {
  const [n, a, p] = misc(105 + (row.expType >= 1 && row.expType <= 6 ? row.expType : 1));
  const f = Math.fround;
  return Math.trunc(f(a * f(Math.pow(f(lv / f(n - 1)), f(p / 10000)))));
}

// Keyblade senza deck ne' subslot, portati un passo prima di un cambio di design (KeyBlade_Evolution) o a +0
// (KeyEvo_LevelUp). userKeybladeId -> keybladeId
const KEYBLADES = {
  4: 5020,   // Olympia +2 -> +3 cambia design
  5: 4140,   // Three Wishes +14 -> +15 cambia design
  6: 7000,   // Moogle O' Glory +0: livelli normali, a +3 cambia design
  8: 9190,   // Counterpoint +19 -> +20 cambia design
  9: 10000,  // Stroke of Midnight +0
};

// Evolve: [medalId base, livello massimo, extra di medalState]; i materiali richiesti (evolveNeedId) x2
const EVOLVE = [
  [11021, {}],                                                // Goofy Ver. A 1★ -> 2★ (1 Cheshire Cat)
  [13021, {}],                                                // Donald Ver. A 1★ -> 2★
  [11013, {}],                                                // Wakka 3★ -> 4★ (3 Fairy Godmother)
  [11015, {}],                                                // Wakka 5★ -> 6★ (5 medaglie di due tipi)
  [31176, { burstUpperNumber: 5, guilt: true }],              // Lexaeus A 6★ -> 7★ (5 Blue Fairy [3], guilt max)
];
// Level Up: basi al livello 1 e materiali (impilati dove validPack)
const LEVEL_BASES = [11015, 11015, 32186];                    // Wakka 5★ x2, Marluxia A 6★
const LEVEL_FODDER = [[90083, 15], [90041, 30], [90081, 20]]; // Fairy Godmother, Dewey, Cheshire Cat

const p = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const now = Math.max(...p.medals.map((m) => m.getDatetime || 0));
let nextId = Math.max(100, ...p.medals.map((m) => m.userMedalId), ...Object.keys(p.medalState || {}).map(Number)) + 1;
const give = (medalId, level = 1, state = null) => {
  if (!medals.has(medalId)) throw new Error(`medaglia ${medalId} assente dal master`);
  const id = nextId++;
  p.medals.push({ userMedalId: id, medalId, level, getDatetime: now });
  if (state) p.medalState[id] = state;
  return id;
};

p.money = Math.max(p.money || 0, 9999999);
for (const [uid, kbId] of Object.entries(KEYBLADES)) {
  const k = p.keyblades.find((x) => x.userKeybladeId === Number(uid));
  if (!k || !keyblades.has(kbId)) throw new Error(`keyblade ${uid}/${kbId}`);
  if (p.keybladeDecks?.[uid] || p.keybladeSubslots?.[uid]) throw new Error(`keyblade ${uid} con deck o subslot`);
  k.keybladeId = kbId;
}

const out = { evolve: [], level: [], fodder: [] };
for (const [medalId, extra] of EVOLVE) {
  const row = medals.get(medalId);
  const st = { level: row.maxLv, exp: expToPass(row, row.maxLv - 1) };
  if (extra.burstUpperNumber) st.burstUpperNumber = extra.burstUpperNumber;
  if (extra.guilt) st.guiltFactor = g.guiltRange(guiltProb, row.guiltValue).max;
  out.evolve.push(give(medalId, row.maxLv, st));
  for (const need of row.evolveNeedId.slice(0, row.validEvolveNeed)) for (let k = 0; k < 2; k++) give(need);
}
for (const m of LEVEL_BASES) out.level.push(give(m));
for (const [m, n] of LEVEL_FODDER) for (let k = 0; k < n; k++) out.fodder.push(give(m));

fs.writeFileSync(DST, JSON.stringify(p, null, 1));
console.log(`${DST}: keyblade ${Object.keys(KEYBLADES).join(',')} abbassati; Evolve ${out.evolve.join(',')}; `
  + `Level Up ${out.level.join(',')}; ${out.fodder.length} materiali; munny ${p.money}`);
