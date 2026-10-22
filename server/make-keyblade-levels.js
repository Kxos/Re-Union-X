#!/usr/bin/env node
// Livelli intermedi dei keyblade e sub-slot (tabelle master keyblade e keybladeSubslot).
//
// La tabella keyblade della 5.0.1 ha solo i livelli in cui cambia il design (64 righe, 4 per
// serie: es. Treasure Trove +0/+5/+17/+35): «Strengthen» (POST /keyblade/enhance) va al
// keybladeId di evolveId, quindi senza le righe in mezzo si saltava da +0 a +5. Qui si
// ricostruiscono tutti i livelli interi +0..+35 dalle tabelle della khuxwiki (ricerca in
// D:\Progetto_Restauro_KH_UX\reference\keyblades\keyblade_levels.json, copia ridotta in
// server/tables/keyblade_levels.json, generata qui e MAI versionata: dati della wiki, .gitignore):
//   - keybladeId: serie*1000 + livello*10 fino a +20, poi serie*1000 + 200 + (livello-20)
//     (Bad Guy Breaker: livello*10 sempre), come le righe della 5.0.1;
//   - design (displayId), passiva, rotazione/scala: quelli della riga 5.0.1 precedente;
//   - slot (validConsist, drawCount), attribute/darklight, accord/dlaccord, maxBurstGauge,
//     partnerRate, materiali per il livello dopo: dalla khuxwiki (post 2.6.0);
//   - le 64 righe della 5.0.1 restano come sono (si cambia solo evolveId); lo script stampa
//     dove la khuxwiki non torna con loro.
// Le righe aggiunte hanno "generated": true (chiave in piu', ignorata dal client): rilanciando
// lo script si rifanno da capo.
// Oltre +35 (15-10, analisi del client 4.3.1 in docs/notes/home_profilo.md#keyblade-oltre-35): passi da 0.1 fino
// a +60 (Bad Guy Breaker interi +36..+60). Il client non formatta il livello: il titolo e' il campo name
// («Starlight +52.2»), il massimo e' solo evolveId 0 («Keyblade level max.»). Righe:
//   - keybladeId: serie*1000 + 215 + passi da 0.1 (216..465), Bad Guy Breaker serie*1000 + lv*10;
//   - lv intero (floor: il client lo usa solo per «Unlock +%d» e un controllo a 30), lv10 = livello*10
//     per il server (passive di keyblade-evo.js; chiave in piu', ignorata dal client);
//   - design, passiva, rotazione/scala della riga +35; slot, moltiplicatori, gauge e materiali dalla khuxwiki;
//   - l'ultima (+60) con evolveId 0 e nessun materiale.
// keybladeSubslot (vuota nella 5.0.1): 120 sub-slot per serie {subslotId = category*1000 + n,
// category, slotNumber, attribute 1/2/3, darklight 1 Upright / 2 Reversed / 3 nessuno}.
//
//   node server\make-keyblade-levels.js [keyblade_levels.json della ricerca]
//   node server\make-keyblade-levels.js --table-only [keyblade_levels.json della ricerca]
//     (solo la tabella ridotta, senza toccare server/master_data: la usano anche i test)
// Sorgente predefinita: KHUX_KEYBLADE_REF oppure REF qui sotto.
// Poi alzare KHUX_REVISION (revisione dei master).
'use strict';

const fs = require('fs');
const path = require('path');

const MASTER = path.join(__dirname, 'master_data');
const TABLE = path.join(__dirname, 'tables', 'keyblade_levels.json');
const REF = process.env.KHUX_KEYBLADE_REF || 'D:\\Progetto_Restauro_KH_UX\\reference\\keyblades\\keyblade_levels.json';
const ATTR = { Power: 1, Speed: 2, Magic: 3 };
const DL = { Upright: 1, Reversed: 2 };
const MAX_LV = 35;
// Materiali senza id nella khuxwiki: i trofei di Bad Guy Breaker (righe material 61-63 di make-trophy-materials.js,
// icone originali JP material_61/62/63). Passi: +4/+9 Trophy NI, +14/+19/+24/+29 Trophy CS, +30 Trophy CK, x1.
const MATERIAL_BY_NAME = { 'Trophy NI': 61, 'Trophy CS': 62, 'Trophy CK': 63 };
const TROPHY_STEPS = { 16040: 61, 16090: 61, 16140: 62, 16190: 62, 16240: 62, 16290: 62, 16300: 63 };
// [id, num, nome] della tabella ridotta -> materialId (id esplicito, poi per nome), null se ignoto
const materialIdOf = ([id, , name]) => id ?? MATERIAL_BY_NAME[name] ?? null;

function load(f) { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); }
function save(f, data) { fs.writeFileSync(f, JSON.stringify(data, null, 1) + '\n', 'utf8'); }

// tabella ridotta: per serie tutti i livelli (0..35 interi, poi fino a 60) e i 120 sub-slot
function extract(ref) {
  const out = {};
  for (const [name, s] of Object.entries(ref)) {
    if (name.startsWith('_')) continue;
    out[name] = {
      source: s.source,
      designLevels: s.designLevels,
      subslots: (s.subslotTree || []).map((t) => [t.n, ATTR[t.attribute] || 0, DL[t.urType] || 3]),
      levels: s.levels.map((l) => ({
        lv: l.lv, slots: l.slots, sa: l.saGauges, friend: l.friendMultiplier,
        m: l.multipliers.map((x) => [ATTR[x.attribute] || 4, x.value, x.matchValue, DL[x.urType] || 3]),
        mat: (l.materialsToNext || []).map((x) => [x.id, x.num, x.name]),
      })),
    };
    // refusi della khuxwiki oltre +35 (Darkgnaw: 50.6..50.9 scritti «50.1», friend sempre +0.0024): un livello non
    // maggiore del precedente diventa precedente + 0.1
    const lv = out[name].levels;
    for (let i = 1; i < lv.length; i++) {
      if (lv[i].lv > MAX_LV && lv[i].lv <= lv[i - 1].lv) {
        const fixed = Math.round(lv[i - 1].lv * 10 + 1) / 10;
        console.log(`! ${name}: livello ${lv[i].lv} dopo ${lv[i - 1].lv} nella khuxwiki, letto come ${fixed}`);
        lv[i].lv = fixed;
      }
    }
  }
  return out;
}

// tabella ridotta: da refPath se dato, altrimenti quella gia' generata, altrimenti da REF
function ensureTable(refPath) {
  if (!refPath && fs.existsSync(TABLE)) return load(TABLE);
  const src = refPath || REF;
  if (!fs.existsSync(src)) {
    throw new Error(`${TABLE} manca e non c'e' la sorgente ${src}: impostare KHUX_KEYBLADE_REF (dump locale della wiki)`);
  }
  const table = extract(load(src));
  fs.mkdirSync(path.dirname(TABLE), { recursive: true });
  save(TABLE, table);
  console.log(`tabella ridotta: ${TABLE}`);
  return table;
}

function main() {
  const args = process.argv.slice(2);
  const tableOnly = args.includes('--table-only');
  const refPath = args.find((a) => !a.startsWith('--'));
  const table = ensureTable(refPath);
  if (tableOnly) return;

  const kbFile = path.join(MASTER, 'keyblade.json');
  const anchors = load(kbFile).filter((r) => !r.generated);
  const materials = new Set(load(path.join(MASTER, 'material.json')).map((r) => r.materialId));
  const rows = [];
  const subslots = [];
  let warn = 0;
  const bySeries = new Map();
  for (const r of anchors) {
    if (!bySeries.has(r.category)) bySeries.set(r.category, []);
    bySeries.get(r.category).push(r);
  }
  for (const [category, list] of bySeries) {
    list.sort((a, b) => a.lv - b.lv);
    const base = list[0];
    const data = table[base.name];
    if (!data) { console.log(`! ${base.name}: nessun dato, righe 5.0.1 invariate`); rows.push(...list); continue; }
    const tens = list.some((r) => r.lv > 20 && r.keybladeId === base.keybladeId + r.lv * 10);
    const idOf = (lv) => base.keybladeId + (lv <= 20 || tens ? lv * 10 : 200 + lv - 20);
    const levels = new Map(data.levels.map((l) => [l.lv, l]));
    const top = Math.min(MAX_LV, list[list.length - 1].lv);
    // partnerRate: formula della khuxwiki, tranne dove non torna con la 5.0.1 (Bad Guy Breaker):
    // li' interpolazione lineare fra le righe 5.0.1
    // livelli oltre +35 (dopo l'ultima riga intera)
    const ext = top === MAX_LV ? data.levels.filter((l) => l.lv > MAX_LV).sort((a, b) => a.lv - b.lv) : [];
    const extId = (lv) => base.keybladeId + (tens ? Math.round(lv * 10) : 215 + Math.round((lv - MAX_LV) * 10));
    const friendOk = list.every((r) => !levels.get(r.lv) || Math.abs(Math.round(levels.get(r.lv).friend * 10000) - r.partnerRate) <= 1);
    for (let lv = 0; lv <= top; lv++) {
      const anchor = list.find((r) => r.lv === lv);
      const prev = [...list].reverse().find((r) => r.lv <= lv);
      const next = list.find((r) => r.lv > lv);
      const l = levels.get(lv);
      const id = anchor ? anchor.keybladeId : idOf(lv);
      if (!anchor && list.some((r) => r.keybladeId === id)) throw new Error(`id ${id} gia' usato (${base.name} +${lv})`);
      const nextId = lv < top ? (list.find((r) => r.lv === lv + 1)?.keybladeId ?? idOf(lv + 1)) : (ext.length ? extId(ext[0].lv) : 0);
      if (!l) { // senza dati: copia della riga precedente
        rows.push(anchor ? { ...anchor, evolveId: nextId } : { ...prev, keybladeId: id, name: `${base.name} +${lv}`, lv, evolveId: nextId, generated: true });
        if (!anchor) { warn++; console.log(`! ${base.name} +${lv}: nessun dato, copia di +${prev.lv}`); }
        continue;
      }
      const slots = l.slots;
      const m = l.m.slice(0, slots);
      const lmat = l.mat.map((x) => [materialIdOf(x), x[1], x[2]]);
      const mats = lmat.filter(([mid]) => mid && materials.has(mid));
      for (const [mid, , nm] of lmat) if (!mid || !materials.has(mid)) { warn++; console.log(`! ${base.name} +${lv}: materiale ${nm} (${mid}) assente da material.json, tolto`); }
      let partnerRate = Math.round(l.friend * 10000);
      if (!friendOk && prev && next) partnerRate = Math.round(prev.partnerRate + (next.partnerRate - prev.partnerRate) * (lv - prev.lv) / (next.lv - prev.lv));
      const gen = {
        ...prev,
        keybladeId: id, name: lv ? `${base.name} +${lv}` : base.name, lv,
        drawCount: slots, maxBurstGauge: l.sa, validConsist: slots,
        // attributo 4 = qualsiasi (moltiplicatore 1.00 senza Upright/Reversed), come la 5.0.1
        attribute: m.map(([a, v, mv]) => (v === 1 && mv == null ? 4 : a)),
        darklight: m.map(([, , mv, d]) => (mv == null ? 3 : d)),
        accord: m.map(([, v]) => Math.round(v * 10000)),
        dlaccord: [0, 1, 2, 3, 4].map((i) => (m[i] && m[i][2] != null ? Math.round(m[i][2] * 10000) : (i === 0 ? 0 : 10000))),
        partnerRate, evolveId: nextId,
        validNeedMaterial: mats.length, needMaterialId: mats.map(([mid]) => mid), needMaterialNum: mats.map(([, n]) => n),
        generated: true,
      };
      if (anchor) {
        // riga 5.0.1: si tiene com'e', si confrontano i campi
        for (const k of ['validConsist', 'maxBurstGauge', 'attribute', 'darklight', 'accord', 'dlaccord', 'partnerRate', 'needMaterialId', 'needMaterialNum']) {
          if (lv === top && k.startsWith('need')) continue;
          if (JSON.stringify(gen[k]) !== JSON.stringify(anchor[k])) { warn++; console.log(`~ ${anchor.name} ${k}: 5.0.1 ${JSON.stringify(anchor[k])} / wiki ${JSON.stringify(gen[k])}`); }
        }
        rows.push({ ...anchor, evolveId: nextId });
      } else {
        // design della riga 5.0.1 precedente; slot gia' aperti mai tolti
        rows.push(gen);
      }
    }
    const lv35 = rows[rows.length - 1];
    ext.forEach((l, i) => {
      const id = extId(l.lv);
      if (list.some((r) => r.keybladeId === id) || rows.some((r) => r.keybladeId === id)) throw new Error(`id ${id} gia' usato (${base.name} +${l.lv})`);
      const last = i === ext.length - 1;
      const slots = l.slots;
      const m = l.m.slice(0, slots);
      const lmat = l.mat.map((x) => [materialIdOf(x), x[1], x[2]]);
      const mats = last ? [] : lmat.filter(([mid]) => mid && materials.has(mid));
      if (!last) for (const [mid, , nm] of lmat) if (!mid || !materials.has(mid)) { warn++; console.log(`! ${base.name} +${l.lv}: materiale ${nm} (${mid}) assente da material.json, tolto`); }
      const label = Number.isInteger(l.lv) ? String(l.lv) : l.lv.toFixed(1);
      rows.push({
        ...lv35,
        keybladeId: id, name: `${base.name} +${label}`, lv: Math.floor(l.lv), lv10: Math.round(l.lv * 10),
        drawCount: slots, maxBurstGauge: l.sa, validConsist: slots,
        attribute: m.map(([a, v, mv]) => (v === 1 && mv == null ? 4 : a)),
        darklight: m.map(([, , mv, d]) => (mv == null ? 3 : d)),
        accord: m.map(([, v]) => Math.round(v * 10000)),
        dlaccord: [0, 1, 2, 3, 4].map((j) => (m[j] && m[j][2] != null ? Math.round(m[j][2] * 10000) : (j === 0 ? 0 : 10000))),
        partnerRate: l.friend ? Math.round(l.friend * 10000) : lv35.partnerRate,
        evolveId: last ? 0 : extId(ext[i + 1].lv),
        validNeedMaterial: mats.length, needMaterialId: mats.map(([mid]) => mid), needMaterialNum: mats.map(([, n]) => n),
        generated: true,
      });
    });
    // sub-slot della serie
    for (const [n, a, d] of data.subslots) subslots.push({ subslotId: category * 1000 + n, category, slotNumber: n, attribute: a, darklight: d });
    console.log(`${base.name}: +0..+${ext.length ? ext[ext.length - 1].lv : top}, ${data.subslots.length} sub-slot`);
  }
  rows.sort((a, b) => a.category - b.category || (a.lv10 ?? a.lv * 10) - (b.lv10 ?? b.lv * 10));
  save(kbFile, rows);
  save(path.join(MASTER, 'keybladeSubslot.json'), subslots);
  console.log(`keyblade: ${rows.length} righe (${rows.filter((r) => r.generated).length} generate), keybladeSubslot: ${subslots.length}, avvisi ${warn}`);
}

if (require.main === module) main();

module.exports = { MATERIAL_BY_NAME, TROPHY_STEPS, materialIdOf, ensureTable };
