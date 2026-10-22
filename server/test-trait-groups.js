// Prova dei gruppi dei trait e delle righe della ruota (I-084 parte A, make-trait-groups.js):
//   node server/test-trait-groups.js [cartella master]   (default server/master_data)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const read = (dir, n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));

const tg = require('./make-trait-groups');
check(JSON.stringify(tg.FUSION_TRAIT_IDS) === JSON.stringify([10, 8, 9, 11, 12, 13, 1, 14, 15, 16, 17]), 'FUSION_TRAIT_IDS');

// senza le righe alias del cut-in (make-cutin-alias.js, I-187): non sono medaglie
const { isCutinAlias } = require('./make-cutin-alias');
const medalAll = read(MASTER, 'medal');
const allById = new Map(medalAll.map((r) => [r.medalId, r]));
const medal = medalAll.filter((r) => !isCutinAlias(r, allById));
const shuffle = read(MASTER, 'shuffleskill');
const bad = medal.filter((r) => (r.shuffleskillSlot || 0) > 0 && !r.shuffleSkillGroupId);
check(!bad.length, `righe con slot e senza shuffleSkillGroupId: ${bad.length} (es. ${bad.slice(0, 3).map((r) => r.medalId)})`);
// stesso nome = stesso gruppo (tutte le rarita', boosted e varianti >= 1.000.000); stesso numero di Album (sortId)
// = stesso gruppo (evoluzioni rinominate, parte B); valore = medalId piu' basso della famiglia
const byName = new Map(), bySort = new Map();
for (const r of medal) if ((r.shuffleskillSlot || 0) > 0) {
  (byName.get(r.name) || byName.set(r.name, []).get(r.name)).push(r);
  if (r.sortId > 0) (bySort.get(r.sortId) || bySort.set(r.sortId, []).get(r.sortId)).push(r);
}
const split = [...byName, ...bySort].filter(([, rs]) => new Set(rs.map((r) => r.shuffleSkillGroupId)).size > 1);
check(!split.length, `nomi o album con piu' gruppi: ${split.slice(0, 3).map(([n]) => n)}`);
const fam = new Map();
for (const r of medal) if ((r.shuffleskillSlot || 0) > 0) fam.set(r.shuffleSkillGroupId, Math.min(fam.get(r.shuffleSkillGroupId) ?? Infinity, r.medalId));
const wrong = [...fam].filter(([g, low]) => g !== low);
check(!wrong.length, `gruppo diverso dal medalId piu' basso: ${wrong.slice(0, 3).map(([g]) => g)}`);
const seph = byName.get('Supernova - Sephiroth') || [];
check(seph.length >= 2, `Supernova - Sephiroth con varianti (${seph.length})`);
const gid = (n) => (byName.get(n) || [])[0]?.shuffleSkillGroupId;
check(gid('SN - KH III Xemnas') && gid('SN - KH III Xemnas') === gid('SN+ - KH III Xemnas'), 'SN e SN+ della stessa linea: stesso gruppo (#130)');
check(gid('Supernova - Sephiroth') === gid('Supernova+ - Sephiroth'), 'Supernova e Supernova+: stesso gruppo');
check(gid('Sora & Peter Pan') === gid('Supernova - Sora & Peter Pan'), 'evoluzione rinominata: stesso gruppo');
check(gid('SN - KH III Kairi A') !== gid('SN - KH III Kairi B'), 'linee diverse: gruppi diversi');
// righe della ruota
const row = (id) => shuffle.find((r) => r.shuffleSkillId === id);
for (const [id, name, cat] of [[14, 'Max HP +800', 20], [15, 'Poison Resist 20%%', 30], [16, 'Sleep Resist 20%%', 50],
  [17, 'Paralysis Resist 20%%', 40]]) {
  const r = row(id);
  check(r && r.type === 1 && r.name === name && r.category === cat, `riga ${id} ${name}`);
}
check(row(14)?.hp === 800 && row(15)?.poison === 20 && row(16)?.sleep === 20 && row(17)?.paralyze === 20, 'effetti delle righe 14-17');
// la roulette del client (anche quella del Moogle Shop) usa le righe type 1 con rate != 0: tutte le normali a 100,
// cosi' il trait comprato e' fra le facce (revisione finale 19-10); il server estrae solo fra gli 11
const unrated = shuffle.filter((r) => r.type === 1 && r.shuffleSkillId < 900 && !(r.rate > 0)).map((r) => r.shuffleSkillId);
check(!unrated.length, `trait normali con rate 0: ${unrated}`);

// idempotente: una seconda esecuzione su una copia non cambia i file
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-trait-'));
for (const n of ['medal', 'shuffleskill']) fs.copyFileSync(path.join(MASTER, n + '.json'), path.join(tmp, n + '.json'));
const log = console.log; console.log = () => {};
tg.patch(tmp);
console.log = log;
for (const n of ['medal', 'shuffleskill']) {
  check(fs.readFileSync(path.join(tmp, n + '.json'), 'utf8') === fs.readFileSync(path.join(MASTER, n + '.json'), 'utf8'), `${n} cambia alla seconda esecuzione`);
}
fs.rmSync(tmp, { recursive: true, force: true });

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: trait-groups');
