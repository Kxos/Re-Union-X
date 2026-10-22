// Prova dello sblocco dei keyblade alla missione giusta (I-087), senza client:
//
//   node server/test-keyblade-unlock.js [cartella master]   (default server/master_data)
//
// Giocatore nuovo (POST /user/create), poi POST /stage/clear di ogni missione legata a un
// keyblade nell'originale (khuxwiki, guida dell'utente in reference\guida_basi). Controlla che:
// - prima del completamento il keyblade NON sia posseduto (grantMissingKeyblades non lo anticipa);
// - il primo completamento lo dia una volta sola (userKeyblades, userDecks, userKeybladeSubslots
//   della risposta), con firstClearFlag 1: il client costruisce il popup BattleResult_KB dalla
// propria tabella stage (clearGetItemType 13 della riga), non da un
//   campo della risposta;
// - rigiocare, compiere gli obiettivi o riavviare il server non lo duplichi;
// - le missioni Proud date in normale non diano niente; i 6 keyblade Proud sono il premio del primo completamento
//   della missione Proud (righe stageKind 4 di make-proud.js, I-200; senza quelle righe nel master li da'
//   grantMissingKeyblades all'avvio, come Moogle O' Glory).
// Non tocca server/save: KHUX_SAVE punta a un file temporaneo nuovo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const SAVE = path.join(os.tmpdir(), `khux-test-kbunlock-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_MASTER_DIR = MASTER;
process.env.KHUX_SAVE = SAVE;
for (const k of ['KHUX_KB_FREE', 'KHUX_KB_ALL', 'KHUX_KB_UNOBTAINABLE', 'KHUX_NEWCOMER']) delete process.env[k];
const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));

const load = (f) => JSON.parse(fs.readFileSync(path.join(MASTER, f), 'utf8').replace(/^\uFEFF/, ''));
const kb = load('keyblade.json');
const stages = load('stage.json');
const kbById = new Map(kb.map((r) => [r.keybladeId, r]));
const baseByName = new Map(kb.filter((r) => r.lv === 0).map((r) => [r.name, r]));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// Keyblade -> missione che lo sblocca nell'originale. Fonti: W = khuxwiki (pagina del keyblade
// «obtained by completing ...» e campo nakeyblade/proudnakeyblade della pagina della quest,
// D:\Progetto_Restauro_KH_UX\wiki\wiki_all.json), G = guida dell'utente (Guida alle basi KHUX.pdf,
// «Keyblade - Come ottenerli»; BGB non c'e', e' successivo).
const ORIGINAL = [
  { name: 'Starlight', how: 'iniziale', src: 'W G' },
  { name: 'Treasure Trove', quest: 14, mode: 'story', src: 'W G' },
  { name: 'Lady Luck', quest: 24, mode: 'story', src: 'W G' },
  { name: 'Three Wishes', quest: 34, mode: 'story', src: 'W G' },
  { name: 'Olympia', quest: 130, mode: 'story', src: 'W G' },
  { name: 'Divine Rose', quest: 433, mode: 'story', src: 'W G' },
  { name: "Moogle O' Glory", how: "Special Quest «A New Keyblade: Moogle O' Glory»", src: 'W G' },
  { name: 'Sleeping Lion', quest: 3, mode: 'proud', src: 'W G' },
  { name: 'Counterpoint', quest: 103, mode: 'proud', src: 'W G' },
  { name: 'Fenrir', quest: 203, mode: 'proud', src: 'W G' },
  { name: 'Darkgnaw', quest: 328, mode: 'proud', src: 'W G' },
  { name: 'Missing Ache', quest: 378, mode: 'proud', src: 'W G' },
  { name: 'Diamond Dust', quest: 428, mode: 'proud', src: 'W G' },
  { name: 'Stroke of Midnight', quest: 595, mode: 'story', src: 'W G' },
  { name: 'Fairy Stars', quest: 683, mode: 'story', src: 'W G' },
  { name: 'Bad Guy Breaker', quest: 880, mode: 'story', src: 'W' },
];

// risposta finta: send() fa writeHead + end(Buffer JSON)
function call(fn, ...args) {
  let body = null;
  const res = { writeHead() {}, end(b) { body = JSON.parse(b.toString('utf8')); } };
  quiet(() => fn(res, ...args));
  return body;
}
const cat = (id) => kbById.get(id)?.category;
const ownedCats = () => t.ownedKeyblades().map((k) => cat(k.keybladeId));

// ---- 1. tabella: ogni keyblade del master ha una fonte, e il premio del master coincide ------
const rows = [];
for (const o of ORIGINAL) {
  const base = baseByName.get(o.name);
  check(base, `${o.name}: assente dalla tabella keyblade`);
  if (!base) continue;
  const normal = o.quest ? stages.find((s) => s.id === o.quest && s.stageKind === 1) : null;
  // Proud: la riga stageKind 4 (id 1 000 000 + numero, make-proud.js) se il master ce l'ha
  const proud = o.mode === 'proud' ? stages.find((s) => s.stageKind === 4 && s.id === 1000000 + o.quest) : null;
  const st = o.mode === 'proud' ? proud || normal : normal;
  const kbReward = st ? (st.clearGetItemType || []).map((ty, i) => (ty === 13 ? st.clearGetItemId[i] : 0)).filter(Boolean) : [];
  const missionKb = st ? (st.submissionRewardType || []).filter((ty) => ty === 13).length : 0;
  const inMaster = !!(st && (o.mode === 'story' || proud));
  if (inMaster) {
    check(st.validClearGetItem > 0 && kbReward.length === 1 && cat(kbReward[0]) === base.category && kbById.get(kbReward[0]).lv === 0,
      `${o.name}: lo stage ${st.stageId} (Quest ${o.quest}) premia ${JSON.stringify(kbReward)}, atteso ${base.keybladeId}`);
  } else if (st) {
    check(kbReward.length === 0 && missionKb === 0, `${o.name}: lo stage ${st.stageId} (Quest ${o.quest} normale) premia un keyblade ${kbReward}`);
  }
  if (proud && normal) {
    const nk = (normal.clearGetItemType || []).includes(13) || (normal.submissionRewardType || []).includes(13);
    check(!nk, `${o.name}: la Quest ${o.quest} normale (stage ${normal.stageId}) premia un keyblade`);
  }
  rows.push({ ...o, base, st, inMaster, normal });
}
check(rows.length === baseByName.size, `${baseByName.size} serie nel master, ${rows.length} con fonte`);
// nessun altro stage premia un keyblade
const otherKb = stages.filter((s) => ((s.clearGetItemType || []).includes(13) || (s.submissionRewardType || []).includes(13))
  && !rows.some((r) => r.inMaster && r.st.stageId === s.stageId));
check(otherKb.length === 0, `altri stage con premio keyblade: ${otherKb.map((s) => s.stageId)}`);

// ---- 2. giocatore nuovo: niente keyblade della storia prima del completamento ---------------
const p = t.player;
check(!p.created && !(p.keyblades || []).length, 'il salvataggio temporaneo non e\' nuovo');
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const atCreate = ownedCats();
for (const r of rows) {
  const has = atCreate.includes(r.base.category);
  if (r.how === 'iniziale') check(has, `${r.name}: manca al nuovo giocatore`);
  else if (r.inMaster) check(!has, `${r.name}: dato prima di superare la Quest ${r.quest} (stage ${r.st.stageId})`);
  else check(has, `${r.name}: non ottenibile nel master e non dato all'avvio`);
}
check(new Set(atCreate).size === atCreate.length, `serie doppie alla creazione: ${atCreate}`);
log(`nuovo giocatore: ${atCreate.length} serie (${t.ownedKeyblades().map((k) => kbById.get(k.keybladeId).name).join(', ')})`);

// popup del client (stage normale): con firstClearFlag 1 una voce per ogni
// clearGetItemType 13 della riga di stage, e una per ogni obiettivo nuovo (clearMissionIds non
// gia' compiuti) con submissionRewardType 13
function clientPopups(st, resp, prevMissions) {
  const out = [];
  for (const n of resp.clearMissionIds || []) {
    if (!prevMissions.includes(n) && st.submissionRewardType?.[n - 1] === 13) out.push(st.submissionItemId[n - 1]);
  }
  if (resp.firstClearFlag) {
    for (let i = 0; i < (st.validClearGetItem || 0); i++) if (st.clearGetItemType[i] === 13) out.push(st.clearGetItemId[i]);
  }
  return out;
}

function clear(st, missions = []) {
  const prev = [...(p.clearMissions[st.stageId] || [])];
  p.currentStageId = st.stageId;
  p.currentUserKeybladeId = 1;
  const before = t.ownedKeyblades().map((k) => k.userKeybladeId);
  const resp = call(t.respondStageClear, { getPoint: { exp: 0, money: 0, lux: 10 }, clearMissionIds: missions, burst: 0 });
  const added = resp.userKeyblades.filter((k) => !before.includes(k.userKeybladeId));
  return { resp, added, popups: clientPopups(st, resp, prev) };
}

// ---- 3. primo completamento di ogni missione della storia -----------------------------------
const lines = [];
for (const r of rows.filter((x) => x.inMaster).sort((a, b) => a.quest - b.quest)) {
  const { resp, added, popups } = clear(r.st);
  const tag = `Quest ${r.quest} (stage ${r.st.stageId}) -> ${r.name}`;
  check(resp.firstClearFlag === 1, `${tag}: firstClearFlag ${resp.firstClearFlag}`);
  check(added.length === 1, `${tag}: ${added.length} keyblade nuovi nella risposta`);
  const k = added[0];
  if (k) {
    check(k.keybladeId === r.base.keybladeId && k.category === r.base.category, `${tag}: dato ${k.keybladeId} cat ${k.category}`);
    check(k.userDeckId === k.userKeybladeId && k.userKeybladeSubslotId === k.userKeybladeId, `${tag}: id del deck/subslot`);
    const deck = resp.userDecks.find((d) => d.userDeckId === k.userKeybladeId);
    check(deck && deck.deckMedals.length === r.base.validConsist && deck.deckMedals.every((m) => m === 0),
      `${tag}: deck ${JSON.stringify(deck?.deckMedals)} (attesi ${r.base.validConsist} slot vuoti)`);
    check(resp.userKeybladeSubslots.some((s) => s.keybladeSubslotId === k.userKeybladeId), `${tag}: manca in userKeybladeSubslots`);
    check(k.isFavorite === 0, `${tag}: il keyblade nuovo e' diventato preferito`);
  }
  check(popups.length === 1 && cat(popups[0]) === r.base.category, `${tag}: popup del client ${JSON.stringify(popups)}`);
  const cats = resp.userKeyblades.map((x) => x.category);
  check(new Set(cats).size === cats.length, `${tag}: serie doppie ${cats}`);
  check(resp.userDecks.length === resp.userKeyblades.length, `${tag}: ${resp.userDecks.length} deck, ${resp.userKeyblades.length} keyblade`);
  // rigiocata con tutti gli obiettivi: niente keyblade, niente popup
  const again = clear(r.st, [1, 2, 3]);
  check(again.resp.firstClearFlag === 0 && again.added.length === 0 && again.popups.length === 0,
    `${tag}: seconda volta firstClearFlag ${again.resp.firstClearFlag}, ${again.added.length} keyblade, popup ${again.popups}`);
  lines.push(`  ${tag}: userKeybladeId ${k?.userKeybladeId}, keybladeId ${k?.keybladeId}, slot ${r.base.validConsist}, popup BattleResult_KB x${popups.length}; seconda volta niente`);
}
log('primo completamento:');
lines.forEach((l) => log(l));

// ---- 4. missioni Proud giocate in normale: niente --------------------------------------------
for (const r of rows.filter((x) => x.mode === 'proud' && x.normal)) {
  const n = t.ownedKeyblades().length;
  const { added, popups } = clear(r.normal, [1, 2, 3]);
  check(added.length === 0 && popups.length === 0 && t.ownedKeyblades().length === n,
    `Quest ${r.quest} normale (stage ${r.normal.stageId}): ${added.length} keyblade, popup ${popups}`);
}
log(`Proud in normale (Quest ${rows.filter((x) => x.mode === 'proud').map((x) => x.quest).join('/')}): nessun keyblade`);

// ---- 5. riavvio del server (grantMissingKeyblades): niente doppioni --------------------------
const n5 = t.ownedKeyblades().length;
quiet(() => t.grantMissingKeyblades());
check(t.ownedKeyblades().length === n5, `riavvio: ${n5} -> ${t.ownedKeyblades().length}`);
check(n5 === baseByName.size, `alla fine ${n5} serie su ${baseByName.size}`);
log(`fine: ${n5}/${baseByName.size} serie, riavvio senza doppioni`);

// ---- 6. salvataggio con lo stage superato ma senza il keyblade: riparato all'avvio ----------
const q34 = rows.find((r) => r.quest === 34);
p.keyblades = p.keyblades.filter((k) => cat(k.keybladeId) !== q34.base.category);
quiet(() => t.grantMissingKeyblades());
check(ownedCats().includes(q34.base.category), 'riparazione: Three Wishes non ridato con lo stage 1310 superato');
log('riparazione: Three Wishes ridato con lo stage 1310 gia\' superato');

try { fs.unlinkSync(SAVE); } catch { /* gia' tolto */ }
log('');
log('keyblade  | missione originale | nel master | come lo da\' il server');
for (const r of rows) {
  const where = r.how || `${r.mode === 'proud' ? 'Proud ' : ''}Quest ${r.quest}`;
  const m = r.inMaster ? `stage ${r.st.stageId} (clearGetItem 13 = ${r.base.keybladeId})` : (r.st ? `stage ${r.st.stageId} solo normale` : '-');
  const how = r.how === 'iniziale' ? 'iniziale' : r.inMaster ? 'primo /stage/clear' : 'grantMissingKeyblades all\'avvio';
  log(`  ${r.name} | ${where} [${r.src}] | ${m} | ${how}`);
}
if (errors.length) {
  log(`\nERRORI (${errors.length}):`);
  errors.forEach((e) => log(`  - ${e}`));
  process.exit(1);
}
log('\nOK');
