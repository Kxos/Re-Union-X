// Prova dei keyblade (I-087) senza client: possesso di tutte le serie, «Strengthen» (POST
// /keyblade/enhance, azione 54) da +0 a +60 per ognuna (passi da 0.1 oltre +35, Bad Guy Breaker interi), con le evoluzioni di design, i
// materiali e i controlli sulle tabelle. Chiama le funzioni di server.js / keyblade-evo.js su un
// salvataggio temporaneo:
//
//   node server/test-keyblades.js [cartella master]   (default server/master_data)
//
// Non tocca server/save: KHUX_SAVE punta a un file temporaneo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const SAVE = path.join(os.tmpdir(), `khux-test-keyblades-${process.pid}.json`);
process.env.KHUX_MASTER_DIR = MASTER;
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_KB_FREE;
delete process.env.KHUX_KB_ALL;
delete process.env.KHUX_KB_UNOBTAINABLE;
delete process.env.KHUX_SUBSLOT_MAX;
const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));

const load = (f) => JSON.parse(fs.readFileSync(path.join(MASTER, f), 'utf8').replace(/^﻿/, ''));
const kb = load('keyblade.json');
const materials = new Map(load('material.json').map((m) => [m.materialId, m]));
const byId = new Map(kb.map((r) => [r.keybladeId, r]));
const series = [...new Set(kb.map((r) => r.category))].sort((a, b) => a - b);
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
// livello*10: lv10 oltre +35 (make-keyblade-levels.js), lv intero fino a +35
const L10 = (r) => r.lv10 ?? r.lv * 10;

// tabella khuxwiki ridotta (make-keyblade-levels.js): materiali per il livello dopo
// (generata in locale, non versionata: ensureTable la rifa' dal dump della wiki se manca)
// id dei materiali senza id nella khuxwiki (Trophy NI/CS/CK -> 61/62/63, make-trophy-materials.js)
const { materialIdOf, ensureTable } = require('./make-keyblade-levels');
const wiki = ensureTable();

// ---- 1. tabelle: catene +0..+60 per serie ---------------------------------------------------
const chains = new Map();
const freeSteps = [];
for (const c of series) {
  const rows = kb.filter((r) => r.category === c);
  const base = rows.find((r) => r.lv === 0);
  check(base, `serie ${c}: manca +0`);
  if (!base) continue;
  const chain = [base];
  const seen = new Set([base.keybladeId]);
  for (let r = base; r.evolveId;) {
    const n = byId.get(r.evolveId);
    if (!n) { errors.push(`${r.name}: evolveId ${r.evolveId} assente`); break; }
    if (seen.has(n.keybladeId)) { errors.push(`${r.name}: ciclo su ${n.keybladeId}`); break; }
    check(n.category === c, `${r.name} -> ${n.name}: serie diversa`);
    const step = L10(n) - L10(r);
    check(step === 10 || (L10(r) >= 350 && step === 1), `${r.name} -> ${n.name}: salto di livello (${step / 10})`);
    check((n.validConsist || 0) >= (r.validConsist || 0), `${n.name}: slot ${r.validConsist} -> ${n.validConsist}`);
    check((n.maxBurstGauge || 0) >= (r.maxBurstGauge || 0), `${n.name}: gauge ${r.maxBurstGauge} -> ${n.maxBurstGauge}`);
    check(n.validConsist >= 3 && n.validConsist <= 5, `${n.name}: validConsist ${n.validConsist}`);
    for (const k of ['attribute', 'darklight', 'accord']) check((n[k] || []).length >= n.validConsist, `${n.name}: ${k} corto (${(n[k] || []).length} < ${n.validConsist})`);
    seen.add(n.keybladeId);
    chain.push(n);
    r = n;
  }
  check(chain.length === rows.length, `${base.name}: ${rows.length} righe, catena di ${chain.length}`);
  const top = chain[chain.length - 1];
  check(L10(top) === 600 && top.evolveId === 0 && !top.validNeedMaterial, `${base.name}: massimo +${L10(top) / 10}, evolveId ${top.evolveId}`);
  // materiali di ogni livello (non del massimo)
  const w = wiki[base.name];
  check(w, `${base.name}: assente dalla tabella khuxwiki`);
  for (const r of chain.slice(0, -1)) {
    const n = r.validNeedMaterial || 0;
    const wl = w?.levels.find((l) => Math.round(l.lv * 10) === L10(r));
    // Bad Guy Breaker +4/+9/+14/+19/+24/+29/+30: Trophy NI/CS/CK (material 61-63 dal 21-10); un master senza quelle
    // righe (make-keyblade-levels.js le toglie) lascia il passo senza materiali
    const onlyTrophy = wl && wl.mat.length > 0 && wl.mat.every((x) => !materialIdOf(x) || !materials.has(materialIdOf(x)));
    if (onlyTrophy) freeSteps.push(r.name);
    check(n > 0 || onlyTrophy, `${r.name}: nessun materiale per il livello dopo`);
    check(n <= (r.needMaterialId || []).length && n <= (r.needMaterialNum || []).length, `${r.name}: validNeedMaterial ${n} oltre gli array`);
    for (let i = 0; i < n; i++) {
      check(materials.has(r.needMaterialId[i]), `${r.name}: materiale ${r.needMaterialId[i]} assente da material.json`);
      check(r.needMaterialNum[i] > 0, `${r.name}: quantita' ${r.needMaterialNum[i]}`);
    }
    if (wl) {
      const want = wl.mat.map((x) => [materialIdOf(x), x[1]]).filter(([id]) => id && materials.has(id)).map(([id, k]) => `${id}x${k}`).join(' ');
      const got = r.needMaterialId.slice(0, n).map((id, i) => `${id}x${r.needMaterialNum[i]}`).join(' ');
      check(want === got, `${r.name}: materiali ${got} / khuxwiki ${want}`);
    }
  }
  chains.set(c, chain);
}
log(`tabelle: ${series.length} serie, ${kb.length} righe; passi senza materiali (solo Trophy): ${freeSteps.join(', ') || 'nessuno'}`);

// ---- 2. possesso: salvataggio nuovo, Quest 34 superata, nessun keyblade ---------------------
const p = t.player;
const stage = load('stage.json');
const q34 = stage.find((s) => s.id === 34);
Object.assign(p, {
  created: true, money: 1234567, freeStone: 0, materials: {}, medals: [], medalState: {}, deck: [0, 0, 0],
  stageScores: { [q34.stageId]: 1 }, clearMissions: {}, keyblades: [], keybladeDecks: {}, starlightKeybladeId: undefined,
  keybladeBurst: 0, keybladeSubslots: {}, passiveSettingIds: [],
});
quiet(() => t.grantMissingKeyblades());
const ownedCats = () => t.ownedKeyblades().map((k) => byId.get(k.keybladeId).category);
const cats = ownedCats();
check(new Set(cats).size === cats.length, `serie doppie: ${cats}`);
check(cats.includes(byId.get(4000).category), 'Quest 34 superata senza Three Wishes');
check(!cats.includes(byId.get(6000).category), 'Divine Rose (Quest 433) data senza KHUX_KB_ALL');
log(`possesso, Quest 34 superata: ${cats.length} serie (${t.ownedKeyblades().map((k) => byId.get(k.keybladeId).name).join(', ')})`);
// rilancio: niente doppioni
quiet(() => t.grantMissingKeyblades());
check(ownedCats().length === cats.length, 'grantMissingKeyblades ha duplicato');
// KHUX_KB_ALL=1: tutte le 16
process.env.KHUX_KB_ALL = '1';
quiet(() => t.grantMissingKeyblades());
delete process.env.KHUX_KB_ALL;
check(ownedCats().length === series.length, `KHUX_KB_ALL: ${ownedCats().length} serie su ${series.length}`);
log(`KHUX_KB_ALL=1: ${ownedCats().length}/${series.length} serie`);
// il premio di Quest 14 dopo il possesso: nessun doppione
quiet(() => t.grantKeyblade(2000));
check(ownedCats().length === series.length, 'grantKeyblade 2000 ha duplicato Treasure Trove');

// ---- 3. Strengthen di ogni keyblade fino a +60 -----------------------------------------------
const evo = t.kbEvo();
function enhance(userKeybladeId) {
  let out;
  const res = { writeHead: () => {}, end: (b) => { out = JSON.parse(b.toString('utf8')); } };
  quiet(() => evo.respondEnhance(res, { userKeybladeId }));
  return out;
}
const userKb = (id) => t.ownedKeyblades().find((k) => k.userKeybladeId === id);
for (const k of t.ownedKeyblades()) {
  const chain = chains.get(byId.get(k.keybladeId).category);
  if (!chain) continue;
  const name = chain[0].name;
  // materiali esatti per tutta la catena
  const need = {};
  for (const r of chain.slice(0, -1)) {
    for (let i = 0; i < r.validNeedMaterial; i++) need[r.needMaterialId[i]] = (need[r.needMaterialId[i]] || 0) + r.needMaterialNum[i];
  }
  p.materials = {};
  // senza materiali: nessun passo
  let r = enhance(k.userKeybladeId);
  check(userKb(k.userKeybladeId).keybladeId === chain[0].keybladeId, `${name}: potenziato senza materiali`);
  check(r && Array.isArray(r.userKeyblades) && Array.isArray(r.userDecks) && Array.isArray(r.userMaterials), `${name}: risposta senza elenchi`);
  p.materials = { ...need };
  const money0 = p.money;
  let evolutions = 0;
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const mats = { ...p.materials };
    r = enhance(k.userKeybladeId);
    const now = userKb(k.userKeybladeId);
    if (now.keybladeId !== chain[i].keybladeId) { errors.push(`${name}: +${prev.lv} -> atteso ${chain[i].keybladeId}, ora ${now.keybladeId}`); break; }
    for (let j = 0; j < prev.validNeedMaterial; j++) {
      const id = prev.needMaterialId[j];
      check(p.materials[id] === mats[id] - prev.needMaterialNum[j], `${name} +${prev.lv}: materiale ${id} ${mats[id]} -> ${p.materials[id]}`);
    }
    const sent = r.userKeyblades.find((x) => x.userKeybladeId === k.userKeybladeId);
    check(sent && sent.keybladeId === chain[i].keybladeId && sent.category === chain[i].category, `${name} +${chain[i].lv}: userKeyblades non aggiornato`);
    check(sent && sent.deckMedals.length === Math.min(5, chain[i].validConsist), `${name} +${chain[i].lv}: deckMedals ${sent?.deckMedals.length} / slot ${chain[i].validConsist}`);
    const deck = r.userDecks.find((d) => d.userDeckId === k.userKeybladeId);
    check(deck && deck.deckMedals.length === sent.deckMedals.length, `${name} +${chain[i].lv}: userDecks diverso`);
    for (const m of r.userMaterials) check(m.number > 0, `${name}: userMaterials con ${m.materialId} x${m.number}`);
    if (chain[i].displayId !== prev.displayId) evolutions++;
  }
  const end = userKb(k.userKeybladeId);
  const top = chain[chain.length - 1];
  check(end.keybladeId === top.keybladeId, `${name}: finito a ${end.keybladeId}, massimo ${top.keybladeId}`);
  check(Object.values(p.materials).every((n) => n === 0), `${name}: materiali avanzati ${JSON.stringify(p.materials)}`);
  check(p.money === money0, `${name}: munny cambiati ${money0} -> ${p.money}`);
  check(evolutions === 3, `${name}: ${evolutions} evoluzioni di design (attese 3)`);
  // al massimo: nessun cambio, nessun materiale tolto
  p.materials = { 1: 99 };
  enhance(k.userKeybladeId);
  check(userKb(k.userKeybladeId).keybladeId === top.keybladeId && p.materials[1] === 99, `${name}: passo oltre +60`);
  // gauge oltre il massimo della riga: tagliata (solo per i keyblade di player.keyblades)
  const subs = evo.userKeybladeSubslotsData().find((s) => s.keybladeSubslotId === k.userKeybladeId);
  check(subs && subs.subslots.length === evo.subslotMaxNum(), `${name}: sub-slot ${subs?.subslots.length}/${evo.subslotMaxNum()}`);
  log(`${name.padEnd(18)} +0 -> +${L10(top) / 10} in ${chain.length - 1} passi, ${evolutions} evoluzioni, slot ${chain[0].validConsist}->${top.validConsist}, `
    + `gauge ${chain[0].maxBurstGauge}->${top.maxBurstGauge}, materiali ${Object.entries(need).map(([id, n]) => `${materials.get(Number(id))?.name || id} x${n}`).join(', ')}`);
}

// ---- 4. passive di +60 dopo il potenziamento ---------------------------------------------------
let passives;
quiet(() => evo.respondPassiveList({ writeHead: () => {}, end: () => {} }, { isList: 1 }));
passives = p.passiveSettingIds || [];
const kbPassives = t.masterRows('passiveSetting').filter((s) => s.passiveConditions === 2);
const reach = kbPassives.filter((s) => s.passiveValue2 <= 600);
check(reach.every((s) => passives.includes(s.passiveSettingId)), `passive di +60 mancanti: ${reach.filter((s) => !passives.includes(s.passiveSettingId)).map((s) => s.passiveSettingId)}`);
log(`passive dei keyblade a +60: ${reach.filter((s) => passives.includes(s.passiveSettingId)).length}/${reach.length}`);

// ---- 5. burst: gauge oltre il massimo tagliata al passo ----------------------------------------
{
  const extra = t.ownedKeyblades().find((k) => k.userKeybladeId !== 1);
  const kk = p.keyblades.find((x) => x.userKeybladeId === extra.userKeybladeId);
  const base = chains.get(byId.get(kk.keybladeId).category)[0];
  kk.keybladeId = base.keybladeId;
  kk.burst = 999999;
  process.env.KHUX_KB_FREE = '1';
  enhance(kk.userKeybladeId);
  delete process.env.KHUX_KB_FREE;
  const nx = byId.get(base.evolveId);
  check(kk.burst === nx.maxBurstGauge * 10000, `burst ${kk.burst} / massimo ${nx.maxBurstGauge * 10000}`);
  log(`burst tagliato a ${kk.burst} (${nx.maxBurstGauge} tacche) dopo il passo di ${base.name}`);
}

try { fs.unlinkSync(SAVE); } catch {}
if (errors.length) {
  log(`\n${errors.length} errori:`);
  for (const e of errors.slice(0, 80)) log('  - ' + e);
  process.exit(1);
}
log('OK');
