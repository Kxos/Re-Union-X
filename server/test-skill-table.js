// Prova del generatore della tabella skill (I-146, server/make-skill-table.js): 25 righe vere di thethiny +
// le skill del wiki («Medal», ===List of Skills===) ricostruite dalla sorella vera, skillExp vera.
// Legge le sorgenti vere (dati Square Enix e testi del wiki, fuori dal repo):
//
//   node server/test-skill-table.js
//
// KHUX_THETHINY_DATA / KHUX_WIKI come in make-skill-table.js; senza i file stampa SKIP ed esce con 0.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA = process.env.KHUX_THETHINY_DATA || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data';
const WIKI = process.env.KHUX_WIKI || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json';
for (const f of [path.join(DATA, 'skill.json'), path.join(DATA, 'skillExp.json'), WIKI]) {
  if (!fs.existsSync(f)) {
    console.log(`SKIP: ${f} assente`);
    process.exit(0);
  }
}
const mk = require('./make-skill-table');
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'recon', 'out', 'master_types_ww431.json'), 'utf8'));
const fields = schema.skill.map(([f]) => f);
const thethiny = JSON.parse(fs.readFileSync(path.join(DATA, 'skill.json'), 'utf8'));
const realExp = JSON.parse(fs.readFileSync(path.join(DATA, 'skillExp.json'), 'utf8'));

// 1. wiki: 163 righe con nome, LV massimo, probabilita' e descrizione
const wikiSkills = mk.parseWikiSkills(mk.readWikiMedalPage(WIKI));
assert.ok(wikiSkills.length >= 160, `skill del wiki: ${wikiSkills.length}`);
const ab1w = wikiSkills.find((w) => w.name === 'Attack Boost I');
assert.deepStrictEqual([ab1w.maxLv, ab1w.triggerPct, ab1w.nameJp], [10, 47, 'アタックアップＳ']);
assert.strictEqual(ab1w.description, 'Deals 1.2 times more damage.');
const uniqueWiki = new Set(wikiSkills.map((w) => mk.normName(w.name))).size;

// 2. righe: tante quante i nomi unici del wiki, 25 vere con i numeri invariati (tranne ERA_431)
const real = mk.realSkillRows(thethiny, []);
const { rows, report } = mk.skillRows(real, wikiSkills, schema);
assert.strictEqual(rows.length, uniqueWiki, `righe ${rows.length}, nomi unici del wiki ${uniqueWiki}`);
const byId = new Map(rows.map((r) => [r.skillId, r]));
for (const t of thethiny) {
  const r = byId.get(t.skillId);
  assert.ok(r, `riga vera ${t.skillId} assente`);
  for (const k of Object.keys(t)) {
    if (k === 'name' || k === 'description') continue;
    if (mk.ERA_431[t.skillId] && k in mk.ERA_431[t.skillId]) continue;   // stato 4.3.1, controllato sotto
    assert.strictEqual(r[k], t[k], `${t.skillId}.${k}: ${r[k]} invece di ${t[k]}`);
  }
}
assert.strictEqual(thethiny.length, 25);
assert.deepStrictEqual([byId.get(1100).attackUp, byId.get(1100).invokeProb, byId.get(1100).invokeProbPerLv], [12000, 4000, 80]);
assert.strictEqual(byId.get(1118).invokeProb, 9810);
// i 4 campi della 4.3.1 che thethiny non ha (righe senza riga 5.0.1: regola dalla descrizione): stati value1
// 1000 come Poison 5.0.1 (10000 = solo nemici sotto il LV 100), SP Attack Gauge I/II burstLock 10000/20000
// (0 = speciale gratis come No Cost)
assert.deepStrictEqual([byId.get(1120).value1, byId.get(1120).burstLock, byId.get(1120).pvpConditionTurn,
  byId.get(1120).pvpConditionCount], [1000, 0, 1, 0]);
assert.deepStrictEqual([byId.get(1124).burstLock, byId.get(1124).burstCancel, byId.get(1124).value1], [10000, 0, 10000]);
assert.deepStrictEqual([byId.get(1126).burstLock, byId.get(1126).burstCancel], [20000, 0]);
assert.deepStrictEqual([byId.get(1110).burstLock, byId.get(1110).burstCancel], [0, 1]);
// le righe del master oltre la 1113 sono generate: i loro 4 campi non valgono come veri
const staleMaster = mk.realSkillRows(thethiny, [{ skillId: 1124, value1: 10000, burstLock: 0, pvpConditionTurn: 0, pvpConditionCount: 0 }]);
assert.strictEqual(staleMaster.find((r) => r.skillId === 1124).burstLock, 10000);
// con la riga del master 4.3.1/5.0.1 i 4 campi vengono da li'
const withMaster = mk.realSkillRows(thethiny, [{ skillId: 1104, value1: 1000, burstLock: 0, pvpConditionTurn: 0, pvpConditionCount: 3, thumbId: 9 }]);
const poison = withMaster.find((r) => r.skillId === 1104);
assert.deepStrictEqual([poison.value1, poison.pvpConditionCount, poison.thumbId], [1000, 3, 4]);

// 3. schema: esattamente i 35 campi nell'ordine, testi <= 71 byte senza markup
for (const r of rows) {
  assert.deepStrictEqual(Object.keys(r), fields, `campi di ${r.skillId}`);
  for (const k of ['name', 'description']) {
    assert.ok(r[k].length > 0, `${r.skillId}.${k} vuoto`);
    assert.ok(Buffer.byteLength(r[k], 'utf8') <= 71, `${r.skillId}.${k} troppo lungo: ${r[k]}`);
    assert.ok(!/<|\{\{|''|\[\[/.test(r[k]), `${r.skillId}.${k} con markup: ${r[k]}`);
  }
  for (const [f, t] of schema.skill) if (t === 'int') assert.ok(Number.isInteger(r[f]), `${r.skillId}.${f} non intero`);
}

// 4. id, icone, categoryEvolve
assert.strictEqual(new Set(rows.map((r) => r.skillId)).size, rows.length, 'skillId doppi');
const rebuilt = rows.filter((r) => !thethiny.some((t) => t.skillId === r.skillId));
assert.strictEqual(rebuilt.length, rows.length - 25);
for (const r of rebuilt) {
  assert.ok(r.skillId >= 1127, `id nuovo ${r.skillId} < 1127`);
  assert.strictEqual(r.sortId, r.skillId);
  assert.ok(r.categoryEvolve >= 31, `categoryEvolve ${r.categoryEvolve}`);
  assert.ok(r.invokeProb >= 0 && r.invokeProb <= 10000, `${r.name} invokeProb ${r.invokeProb}`);
  assert.ok([1, 2, 3, 4].includes(r.expType), `${r.name} expType ${r.expType}`);
}
assert.strictEqual(new Set(rebuilt.map((r) => r.categoryEvolve)).size, rebuilt.length, 'categoryEvolve ricostruite doppie');
// icone della 4.3.1: Skill_Icon1,2,4-9 (la 3 non c'e' piu')
for (const r of rows) assert.ok([1, 2, 4, 5, 6, 7, 8, 9].includes(r.thumbId), `${r.skillId} thumbId ${r.thumbId}`);

// 5. probabilita': il wiki TRONCA il massimo all'intero (47.2% -> 47): trunc(top / 100) = trigger% per tutte
// le righe, vere e ricostruite; baseProb ritrova l'invokeProb di tutte le 25 righe vere senza la sorella
for (const r of rows) {
  const info = report.rows.find((x) => x.skillId === r.skillId);
  assert.ok(info, `riga ${r.skillId} senza voce nel report`);
  const top = r.invokeProb + r.invokeProbPerLv * (r.maxLv - 1);
  assert.ok(top <= 10000, `${r.name}: massimo ${top} > 10000`);
  assert.strictEqual(Math.floor(top / 100), info.triggerPct, `${r.name}: ${top} contro ${info.triggerPct}%`);
  if (info.real) assert.strictEqual(mk.baseProb(info.triggerPct, r.invokeProbPerLv, r.maxLv), r.invokeProb, `baseProb ${r.name}`);
}
// ricostruite: multiplo di 100 come le vere (Attack Boost IV 4000 + 75 * 19 = 54.25%, non 3975), tranne i 100%
// esatti con passo che non lo permette (Max 9810, Defense Boost I Max 9860)
assert.strictEqual(byName0('Attack Boost IV').invokeProb, 4000);
assert.strictEqual(byName0('Defense Boost IV').invokeProb, 3000);
assert.strictEqual(byName0('Second Chance II').invokeProb, 6000);
assert.strictEqual(byName0('ATK B IX & AP+').invokeProb, 4000);
assert.strictEqual(byName0('Defense Boost I Max').invokeProb, 9860);
function byName0(n) { return rows.find((r) => r.name === n); }

// 6. potenza dalla descrizione
const byName = new Map(rows.map((r) => [r.name, r]));
const ab6 = byName.get('Attack Boost VI');
assert.deepStrictEqual([ab6.attackUp, ab6.maxLv, ab6.rank, ab6.expType, ab6.thumbId], [22000, 20, 3, 3, 1]);
assert.strictEqual(byName.get('Defense Boost IV').damageCut, 1250);
assert.strictEqual(byName.get('Defense Boost IV').invokeType, 2);
const sleepMax = byName.get('Sleep+ II Max');
assert.deepStrictEqual([sleepMax.addSleep, sleepMax.conditionTurn, sleepMax.thumbId], [10000, 1, 4]);
const tt = byName.get('Triple Threat');
assert.deepStrictEqual([tt.addPoison, tt.addParalysis, tt.addSleep], [10000, 10000, 10000]);
assert.ok(byName.get('ATK B V & Lux+').luxUp > 10000);
assert.ok(byName.get('ATK B IX & AP+').prizeBurstUp > 10000);
assert.strictEqual(byName.get('Second Chance II').dokonjo, 1);
// stati: value1 = limite di livello dei nemici (1e6 / value1): 1000 senza limite scritto, 500 = «up to LV 1999»
assert.strictEqual(byName.get('Sleep+ II Max').value1, 500);
assert.strictEqual(byName.get('Triple Threat').value1, 1000);
assert.strictEqual(byName.get('Triple Threat II').value1, 500);
assert.strictEqual(byName.get('Attack Boost VI').value1, 10000);
// SP gauge: costo fisso burstLock, GA 0 = burstCancel; le combo ATK & GA scattano al timing 1 e 5 (showTiming 6)
for (const [n, lock, cancel, timing] of [['SP Attack Gauge 0', 0, 1, 5], ['ATK B X Max & GA 2', 20000, 0, 6],
  ['ATK B X Max & GA 1', 10000, 0, 6], ['ATK B X Max & GA 0', 0, 1, 6], ['AB X Max & Lux++ & GA 1', 10000, 0, 6]]) {
  const r = byName.get(n);
  assert.ok(r, n);
  assert.deepStrictEqual([r.burstLock, r.burstCancel, r.invokeShowTiming, r.invokeType], [lock, cancel, timing, timing === 6 ? 1 : 4], n);
}
// combo «A & B»: ogni effetto col suo valore
const ab = byName.get('ATK B XI Max & Paralysis');
assert.deepStrictEqual([ab.attackUp, ab.addParalysis, ab.conditionTurn, ab.value1], [32000, 10000, 1, 500]);
const apl = byName.get('ATK B III & AP+ & Lux+');
assert.deepStrictEqual([apl.attackUp, apl.prizeBurstUp, apl.luxUp], [16000, 220000, 30000]);
assert.ok(report.noSister.length > 0, 'famiglie senza sorella nel report');
// stato della 4.3.1 (ERA_431): Lux Plus x1,5, «greatly» x3 (combo vere), «vastly» x5; icone 6-9
const lux = (id) => rows.find((r) => r.skillId === id);
assert.deepStrictEqual([lux(1109).luxUp, lux(1109).thumbId, lux(1114).luxUp, lux(1114).thumbId], [15000, 8, 30000, 8]);
assert.deepStrictEqual([1102, 1107, 1110, 1124, 1126].map((id) => lux(id).thumbId), [6, 7, 9, 9, 9]);
assert.strictEqual(byName.get('ATK B V & Lux+').luxUp, 30000);
assert.strictEqual(byName.get('AB X Max & Lux++ & GA 1').luxUp, 50000);

// 7. skillExp vera: 4 righe, expId 1-4, value int[3]
const exp = mk.skillExpRows(realExp);
assert.deepStrictEqual(exp.map((e) => e.expId), [1, 2, 3, 4]);
for (const e of exp) {
  assert.deepStrictEqual(Object.keys(e), ['expId', 'value']);
  assert.ok(e.value.length === 3 && e.value.every(Number.isInteger));
}
assert.deepStrictEqual(exp[0].value, [30, 12132, 13500]);

console.log(`OK: ${rows.length} skill (25 vere + ${rebuilt.length} dal wiki, ${wikiSkills.length - uniqueWiki} doppioni del wiki), ` +
  `${report.noSister.length} senza sorella, skillExp ${exp.length} righe`);
