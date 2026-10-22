#!/usr/bin/env node
// Controllo offline dei dati di ogni stage, senza giocarli: per ogni riga della
// tabella stage verifica quello che il client cerchera' in /stage/start e /stage/clear.
//  - mappa: forzieri e nemici in server/game_data/stage_poi.json (stage_poi.py);
//  - forzieri: riga di reward presente e almeno un premio che il server manda
//    (dropItemTypeIds, come chestDropTypes di server.js) di un tipo che nel forziere
//    funziona (4 munny, 8 CP, 9 HP); senza riga il client va in crash all'apertura;
// - nemici: la riga di reward del record della mappa (senza, crash
//    appena parte lo stage) e premio materiale esistente;
//  - premi di fine stage e degli obiettivi: tipo gestito da grantItem di server.js
//    (2 jewel, 4 munny, 5 materiale, 14 Avatar Coin) e materiale presente nella tabella material.
// Esce con codice 1 se trova errori (gli avvisi non contano).
//
//   node server/check-stage-data.js [--verbose]

const fs = require('fs');
const path = require('path');

const MASTER_DIR = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const verbose = process.argv.includes('--verbose');
const table = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(MASTER_DIR, name + '.json'), 'utf8')); } catch { return []; }
};
let poi = {};
try {
  poi = JSON.parse(fs.readFileSync(path.join(__dirname, 'game_data', 'stage_poi.json'), 'utf8'));
} catch {
  console.error('manca server/game_data/stage_poi.json (recon/tools/stage_poi.py)');
  process.exit(1);
}

const ENEMY_TYPE = 5;
const CHEST_OK = new Set([4, 8, 9]);
const GRANT_OK = new Set([2, 3, 4, 5, 13, 14]); // 13 keyblade (grantKeyblade)
const medals = new Set(table('medal').map((m) => m.medalId));
// premio di tipo 3 (medaglia): la riga deve esistere nella tabella medal
function checkMedal(s, where, t, id) {
  if (t === 3 && !medals.has(id)) err(s, `${where}: medaglia ${id} assente dalla tabella medal (wiki_all: nome dal confronto con la wiki)`);
}
const rewards = new Map(table('reward').map((r) => [r.rewardId, r]));
const materials = new Set(table('material').map((m) => m.materialId));
const stages = table('stage');

let errors = 0;
let warnings = 0;
const err = (s, msg) => { errors++; console.log(`  ERRORE  ${s}: ${msg}`); };
const warn = (s, msg) => { warnings++; console.log(`  avviso  ${s}: ${msg}`); };

function checkMaterial(where, id) {
  if (materials.size && !materials.has(id)) return `materiale ${id} assente dalla tabella material (${where})`;
  return null;
}

let withMap = 0;
for (const st of stages) {
  const s = `${st.stageId} ${st.name}`;
  // Proud (stageKind 4, I-200): la mappa della storia (stageBinId), come il client e server.js poiStageId
  const p = poi[st.stageKind === 4 && st.stageBinId ? st.stageBinId : st.stageId];
  if (!p) {
    if (!st.onlyDrama) warn(s, 'nessuna mappa (mappoi): niente forzieri ne\' drop');
  } else {
    withMap++;
    for (const c of p.chests) {
      const row = rewards.get(c.reward);
      if (!row) { err(s, `forziere ${c.uid}: riga reward ${c.reward} assente (crash all'apertura)`); continue; }
      const sent = row.type.map((t, i) => ({ t, i })).filter(({ t }) => t !== ENEMY_TYPE);
      // la riga 1 e' il barile vuoto (khuxwiki «b»): vuoto di proposito
      if (!sent.length && c.reward !== 1) err(s, `forziere ${c.uid}: la riga ${c.reward} ha solo materiali, il forziere resta vuoto`);
      for (const { t } of sent) if (!CHEST_OK.has(t)) warn(s, `forziere ${c.uid}: tipo ${t} non provato nel forziere`);
      if (verbose) console.log(`  ok      ${s}: forziere ${c.uid} -> reward ${c.reward} ${JSON.stringify(sent.map(({ t, i }) => [t, row.num[i]]))}`);
    }
    for (const e of p.enemies) {
      if (e.reward === undefined) { err(s, `nemico ${e.uid}: stage_poi.json senza reward, rigenerarlo`); continue; }
      const row = rewards.get(e.reward);
      if (!row) { err(s, `nemico ${e.uid} (${e.enemyId}): riga reward ${e.reward} assente (crash dopo /stage/start)`); continue; }
      row.type.forEach((t, i) => {
        if (t === ENEMY_TYPE) { const m = checkMaterial(`nemico ${e.uid}`, row.id[i]); if (m) err(s, m); }
      });
    }
  }
  if (st.validClearGetItem) {
    st.clearGetItemType.forEach((t, i) => {
      if (!GRANT_OK.has(t)) warn(s, `premio di fine stage di tipo ${t} non gestito dal server`);
      if (t === 5) { const m = checkMaterial('premio di fine stage', st.clearGetItemId[i]); if (m) err(s, m); }
      checkMedal(s, 'premio di fine stage', t, st.clearGetItemId[i]);
    });
  }
  (st.submissionRewardType || []).slice(0, st.validSubmission).forEach((t, i) => {
    if (!GRANT_OK.has(t)) warn(s, `obiettivo ${i + 1}: premio di tipo ${t} non gestito dal server`);
    if (t === 5) { const m = checkMaterial(`obiettivo ${i + 1}`, st.submissionItemId[i]); if (m) err(s, m); }
    checkMedal(s, `obiettivo ${i + 1}`, t, st.submissionItemId[i]);
  });
}
// Confronto con khuxwiki (recon/tools/wiki_quests.py; KHUX_WIKI_QUESTS o il percorso
// predefinito): stessa missione per numero (campo id della tabella stage). Jewel del primo
// completamento, quantita' degli Avatar Coin degli obiettivi, numero di tesori.
const WIKI = process.env.KHUX_WIKI_QUESTS || 'D:\\Progetto_Restauro_KH_UX\\wiki\\quests.json';
let wiki = null;
try { wiki = JSON.parse(fs.readFileSync(WIKI, 'utf8')); } catch { console.log(`(wiki non trovata in ${WIKI}: confronto saltato)`); }
if (wiki) {
  const byNumber = new Map(Object.values(wiki).filter((q) => q.title.startsWith('Quest ')).map((q) => [Number(q.number), q]));
  for (const st of stages) {
    const q = byNumber.get(st.id);
    const s = `${st.stageId} ${st.name}`;
    if (!q || st.stageId > 1000000) continue; // Proud (1001010...): obiettivi e premi propri
    if (q.name && q.name !== st.name) warn(s, `la wiki ha «${q.name}» come missione ${st.id}`);
    const jewel = st.validClearGetItem ? st.clearGetItemType.reduce((a, t, i) => a + (t === 2 ? st.clearGetItemNum[i] : 0), 0) : 0;
    const wikiJewel = parseInt(q.jewel || '0', 10) || 0;
    if (jewel !== wikiJewel) warn(s, `jewel del primo completamento ${jewel}, wiki ${wikiJewel}`);
    q.objectives.forEach((o, i) => {
      if (o.reward === 'Avatar Coin' && (st.submissionRewardType[i] !== 14 || st.submissionItemNum[i] !== Number(o.qty))) {
        warn(s, `obiettivo ${i + 1}: wiki ${o.qty} Avatar Coin, tabella tipo ${st.submissionRewardType[i]} x${st.submissionItemNum[i]}`);
      }
    });
    const chests = poi[st.stageId]?.chests.length;
    if (chests !== undefined && chests !== q.treasures.length) warn(s, `${chests} forzieri nella mappa, ${q.treasures.length} tesori nella wiki`);
    if (verbose) console.log(`  wiki    ${s}: missione ${q.number}, jewel ${wikiJewel}, tesori ${q.treasures.map((t) => t.code).join(' ')}`);
  }
}
console.log(`${stages.length} stage, ${withMap} con mappa; ${rewards.size} righe reward; ${errors} errori, ${warnings} avvisi`);
process.exit(errors ? 1 : 0);
