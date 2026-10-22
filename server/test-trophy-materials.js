// Prova dei trofei di Bad Guy Breaker (make-trophy-materials.js, I-009): righe material 61-63, icone originali JP in
// originals.tsv, materiali dei passi del keyblade (make-keyblade-levels.js) e righe del master servito se c'e'.
//   node server/test-trophy-materials.js
'use strict';
const fs = require('fs'), path = require('path');
const { TROPHIES, trophyRows, patch } = require('./make-trophy-materials');
const { materialIdOf, TROPHY_STEPS } = require('./make-keyblade-levels');
const TMP = process.env.KHUX_TMP || 'D:\\Progetto_Restauro_KH_UX\\tmp';
fs.mkdirSync(TMP, { recursive: true });
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// --- righe: come Dark Matter (categoria 1, non vendibile), ids 61 NI / 62 CS / 63 CK ---------------------------
const rows = trophyRows();
check(JSON.stringify(rows.map((r) => [r.materialId, r.name])) === '[[61,"Trophy NI"],[62,"Trophy CS"],[63,"Trophy CK"]]',
  `righe: ${JSON.stringify(rows.map((r) => [r.materialId, r.name]))}`);
const KEYS = 'materialId,category,sortId,name,description,sell';
check(rows.every((r) => Object.keys(r).join() === KEYS && r.category === 1 && r.sell === 0 && /Bad Guy Breaker/.test(r.description)),
  'chiavi e valori come Dark Matter (categoria 1, sell 0)');
check(/Niceland/.test(rows[0].description) && /Cy-Bug Sector/.test(rows[1].description) && /Candy Kingdom/.test(rows[2].description),
  'descrizioni col mondo');
check(Object.keys(TROPHIES).join() === '61,62,63', 'TROPHIES 61-63');

// --- patch: aggiunge in ordine di id, idempotente, non tocca le altre righe ------------------------------------
{
  const d = fs.mkdtempSync(path.join(TMP, 'trofei-'));
  try {
    const base = [{ materialId: 1, category: 3, sortId: 200, name: 'A', description: 'a', sell: 10 },
      { materialId: 58, category: 1, sortId: 92, name: 'Dark Matter', description: 'x', sell: 0 },
      { materialId: 60, category: 3, sortId: 237, name: 'Luminous Moss', description: 'y', sell: 10 },
      { materialId: 61, category: 9, sortId: 1, name: 'vecchia', description: '', sell: 5 }];
    fs.writeFileSync(path.join(d, 'material.json'), JSON.stringify(base));
    check(patch(d) === 3, 'patch: 3 righe');
    const once = fs.readFileSync(path.join(d, 'material.json'), 'utf8');
    patch(d);
    check(once === fs.readFileSync(path.join(d, 'material.json'), 'utf8'), 'patch idempotente');
    const out = JSON.parse(once);
    check(out.map((r) => r.materialId).join() === '1,58,60,61,62,63', `ordine: ${out.map((r) => r.materialId)}`);
    check(JSON.stringify(out.slice(0, 3)) === JSON.stringify(base.slice(0, 3)), 'altre righe invariate');
    check(out[3].name === 'Trophy NI' && out[3].sell === 0, 'riga 61 di un giro precedente sostituita');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
}

// --- passi di Bad Guy Breaker: Trophy NI/CS/CK (id null nella tabella khuxwiki) -> 61/62/63 -------------------
check(materialIdOf([null, 1, 'Trophy NI']) === 61 && materialIdOf([null, 1, 'Trophy CS']) === 62
  && materialIdOf([null, 1, 'Trophy CK']) === 63, 'materialIdOf: nomi dei trofei');
check(materialIdOf([48, 1, 'Power Gem']) === 48 && materialIdOf([null, 1, 'Ignoto']) === null, 'materialIdOf: id esplicito, ignoto null');
const table = require('./make-keyblade-levels').ensureTable();   // generata in locale, non versionata
const bgb = table['Bad Guy Breaker'].levels.filter((l) => l.mat.some(([, , n]) => /^Trophy/.test(n)))
  .map((l) => `${l.lv}:${l.mat.map(materialIdOf).join('+')}`);
check(bgb.join() === '4:61,9:61,14:62,19:62,24:62,29:62,30:63', `tabella: passi coi trofei ${bgb}`);
check(JSON.stringify(TROPHY_STEPS) === '{"16040":61,"16090":61,"16140":62,"16190":62,"16240":62,"16290":62,"16300":63}',
  `TROPHY_STEPS: ${JSON.stringify(TROPHY_STEPS)}`);

// --- icone originali JP in originals.tsv (sezione 41) e file presenti nel JP 4.3.1 -----------------------------
const tsv = fs.readFileSync(path.join(__dirname, '..', 'recon', 'tools', 'originals.tsv'), 'utf8');
const JP = process.env.KHUX_JP_ROOT || require('./local-paths').localPath('jp_data');
for (const id of [61, 62, 63]) {
  check(new RegExp(`^img/material/material_${id}\\.png\\tjp`, 'm').test(tsv), `originals.tsv: material_${id} dal JP`);
  if (fs.existsSync(JP)) check(fs.existsSync(path.join(JP, 'img', 'material', `material_${id}.png`)), `JP: material_${id}.png presente`);
}

// --- master servito (se c'e'): righe 61-63, passi del keyblade, premi delle missioni -------------------------
const M = path.join(__dirname, 'master_data');
if (fs.existsSync(path.join(M, 'material.json'))) {
  const load = (f) => JSON.parse(fs.readFileSync(path.join(M, f), 'utf8'));
  const mat = new Map(load('material.json').map((r) => [r.materialId, r]));
  check([61, 62, 63].every((id) => mat.get(id) && mat.get(id).sell === 0), 'master: material 61-63');
  const kb = new Map(load('keyblade.json').map((r) => [r.keybladeId, r]));
  for (const [id, mid] of Object.entries(TROPHY_STEPS)) {
    const r = kb.get(Number(id));
    check(r && r.validNeedMaterial === 1 && r.needMaterialId[0] === mid && r.needMaterialNum[0] === 1,
      `master: ${id} richiede ${mid} x1 (${r && JSON.stringify([r.validNeedMaterial, r.needMaterialId, r.needMaterialNum])})`);
  }
  const st = new Map(load('stage.json').filter((r) => r.stageKind === 1 && r.stageId < 100000).map((r) => [r.id, r]));
  const want = { 880: 61, 885: 61, 890: 62, 895: 62, 900: 62, 905: 62, 915: 63 };
  for (const [q, mid] of Object.entries(want)) {
    const r = st.get(Number(q));
    check(r && r.submissionRewardType[2] === 5 && r.submissionItemId[2] === mid && r.submissionItemNum[2] === 1,
      `master: quest ${q} terzo obiettivo -> 5:${mid} x1`);
  }
}

if (errors.length) { console.log('test-trophy-materials: FALLITO'); for (const e of errors) console.log(' - ' + e); process.exit(1); }
console.log('test-trophy-materials: ok');
