#!/usr/bin/env node
// Righe master `stage` delle missioni di storia 526-979 (I-009, piano docs/superpowers/plans/2026-10-21-missioni-526-979.md,
// spec docs/notes/mappe_storia.md#oltre525). Oggi il master ne ha 1-525 (stage_dec di thethiny, make-game-tables.js);
// stage_dec non ha righe oltre la 525. Fonti:
// - 526-555: righe vere del master 1.1.3 (thethiny_2026-10-13 KHUx-Server/data/stage.json, stageId 18010-18300, id =
//   numero); gli array oltre le lunghezze valide (validBeforeDrama, validAfterDrama, validClearGetItem) sono spazzatura
//   e si tagliano come make-game-tables.js. Q555 = una riga 18300 con branchType 1: il client carica
//   mappoi_stg(18300 + unionId - 1), il maestro della propria Unione (decisione dell'utente 20-10);
// - 556-979: khuxwiki (wiki\quests.json + testo della pagina in wiki_all.json) per nome, AP ("zero" = 0), mapName
//   (room1), obiettivi e premi; stageId e stanze da reference\world_schema\oltre525\oltre525.json (stage JP 4.3.1).
// - Q978 «What Comes After» (D-B, 21-10): missione di solo filmato come nell'originale (wiki InfoQuestKHUX/Cutscene, nessuno
//   stage 39158 nei dati JP). Il client 4.3.1 la regge col campo onlyDrama della riga stage:
//   finiti i filmati legge onlyDrama della missione corrente (riga stage per stageId) e, se != 0,
//   non apre la mappa, salta i nemici e manda subito /stage/clear. Filmati dal theater (stageId 39158: 2560701-2561201), premi dalla pagina wiki.
// worldId dal prefisso della stanza; mondi di Ralph coi worldId originali (D-C): world_select_ico_11 «Niceland»,
// _12 «Cy-Bug Sector», _14 «Candy Kingdom» (JP 4.3.1 img/adventure) e theater (NL 11, HD 12, SR 14); CS = 13 per
// esclusione (stage_select_ico_13_100 = stanza CS_0000_01_00 con la regola delle miniature qui sotto, wipe_13, sfondo
// raid bg_CS1 nel JP; il theater raggruppa i filmati delle 871-886 nel mondo 9 «?», che non e' una riga world).
// Righe world 11-14 (Task 5, buildWorldRows): worldName = prefisso delle stanze NL/HD/CS/SR, perche' il client cerca la
// riga world dal prefisso della stanza per la tendina img/wipe/wipe_<worldId>.png (originali JP 11-14 in
// recon/tools/originals.tsv, sezione 40); resto come la riga 1 (DB): gli sfondi raid bg_NL1/HD1/CS1/SR1 del JP sono LWF
// senza texture e non sono serviti (come bg_CD1/ED1 delle righe 7-8 WW), quindi bg_DB1 servito.
// Miniature delle 556-979: stage_select_ico_<worldId>_<thumbId> con thumbId = area*10000 + zona*100 + variante della
// prima stanza (XX_AAAA_BB_CC; regola verificata su 26 delle 30 righe 1.1.3 526-555 e su tutte le 11 icone JP di
// Niceland), se l'icona e' servita (names_v4.tsv o img/adventure/stage del JP 4.3.1, importate tutte da originals.tsv
// sezione 1). Altrimenti, come le altre colonne senza fonte (bgm, raidBoss), dall'ultima riga 1-525 dello stesso
// worldId (o della 1.1.3); per i mondi che nelle 1-525 non ci sono (CD, ED, Ralph): prima icona JP del mondo
// (WORLD_THUMB), musica dei nomi JP text/audio del mondo (WORLD_BGM), raidBoss della missione precedente.
// Filmati: solo id presenti nelle risorse (names_v4.tsv, regola di
// make-game-tables.js); per 556-979 dal theater (stessa stageId: 5 prima, il resto dopo, il client ne legge al massimo 5
// per lato). Obiettivi «Defeat X» su nemici assenti dalla tabella enemy -> 1 (Shadow) come le 1-525.
// Obiettivi delle 526-555 (ruling del controller, Task 6, 21-10): le righe 1.1.3 vengono da una versione successiva allo
// stage: 10 di loro (542-544, 546, 548-552, 555) hanno un «Defeat X» (submissionIdType 1, anche nel 28 «all enemies»)
// su un enemyId che non e' nello stage JP 4.3.1 (= stage del 2016; stage_poi_oltre.json del Task 3, la 555 con le 5
// varianti 18300-18304), es. 544 -> 10092 Candy Apple / 93 Poison Apple, 555 -> 10211 Darklings: per quelle righe gli
// obiettivi (e i loro premi) sono quelli della wiki, che coincidono con lo stage; il resto della riga resta 1.1.3.
// Musica per missione 556-979 (I-198, 21-10): bgmField/bgmBattle/bgmBoss da reference\world_schema\oltre525\bgm_per_quest.json
// (fonte obbligatoria, KHUX_BGM_OLTRE; 423 missioni, tutte meno la 978), ricavata da khwiki «Forum:Notes 29 (Project Music:
// Where songs play) - KeybladeSpyMaster» (tabelle dei capi di Union X per missione) incrociata coi master 1-555 (tema
// dell'area della prima stanza); ogni riga porta l'evidenza e la confidenza. Vale sulla regola del mondo (WORLD_BGM / riga
// di riferimento), che resta solo per le missioni assenti dal file. Es. 979 «The Key» -> BBS_73_TheKey 501006057 nelle tre
// colonne, 977 capo bgm_raid_0001 501001010, 671-674 Underworld oc_bgm_001001/2, 825 Coliseum oc_bgm_000001/2.
// Idempotente; in fondo a make-game-tables.js. KHUX_STORY_OLTRE=0 lo spegne. Dopo: alzare la revisione del master.
//
//   node server/make-story-oltre.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

const FIRST = 526, LAST = 979, CUTSCENE = 978, CUTSCENE_STAGE = 39158, Q555_STAGE = 18300;
// varianti della Q555 (branchType 1): il client carica 18300 + unionId - 1
const Q555_VARIANTS = [0, 1, 2, 3, 4].map((k) => Q555_STAGE + k);
const STOPGAP_KEEP = 'Complete without having to continue';
const ROOM_WORLD = { DB: 1, DW: 2, WL: 3, AG: 4, OC: 5, BC: 6, CD: 7, ED: 8, NL: 11, HD: 12, CS: 13, SR: 14 };
const WIKI_WORLD = { 'Daybreak Town': 1, 'Dwarf Woodlands': 2, Wonderland: 3, Agrabah: 4, 'Olympus Coliseum': 5,
  "Beast's Castle": 6, 'Castle of Dreams': 7, 'Enchanted Dominion': 8, Niceland: 11, 'Cy-Bug Sector': 12,
  'Game Central Station': 13, 'Candy Kingdom': 14 };
// prima icona stage_select_ico_<worldId>_<thumbId> del mondo nei dati JP 4.3.1 (img/adventure/stage)
const WORLD_THUMB = { 7: 10000, 8: 0, 11: 0, 12: 20000, 13: 100, 14: 0 };
// musica dei mondi senza righe 1-525 [campo, battaglia, capo]: id dei testi JP 4.3.1 text/audio/<nome>,
// AKB serviti (names_v4.tsv). Campo/battaglia = tracce _000001/_000002 del mondo come nelle 1-525 (dw 110/120, ...);
// capo = dw_bgm_000003 (501000130) come tutti i mondi salvo BC (ed_bgm_000003 501000730 non c'e' in nessuna risorsa).
// CD: bbs_cd_F/bbs_cd_B (Castle of Dreams di BBS, nessun cd_bgm); CS: central_station, unica traccia del mondo, anche
// in battaglia (ricostruzione).
const WORLD_BGM = { 7: [501006005, 501006006, 501000130], 8: [501000710, 501000720, 501000130],
  11: [501006048, 501006049, 501000130], 12: [501006052, 501006053, 501000130], 13: [501006047, 501006047, 501000130],
  14: [501006061, 501006062, 501000130] };
// righe world nuove (D-C): worldId -> worldName (prefisso delle stanze)
const NEW_WORLDS = { 11: 'NL', 12: 'HD', 13: 'CS', 14: 'SR' };
// chiavi e ordine delle righe 1-525 (make-game-tables.js, formato 5.0.1)
const FIELDS = ['stageId', 'stageBinId', 'id', 'name', 'mapName', 'useAp', 'chapterId', 'worldId', 'thumbId', 'onlyDrama',
  'stageKind', 'showIcon', 'hideIcon', 'noPartner', 'validStopStage', 'validBeforeDrama', 'beforeDramaId', 'beforeDramaType',
  'validAfterDrama', 'afterDramaId', 'afterDramaType', 'branchType', 'disableContinue', 'addLevel', 'holdKeyblade',
  'hardmodeRequire', 'hardmodeName', 'hardmodeComparison', 'hardmodeNum', 'validClearGetTitle', 'clearGetTitle',
  'validClearGetSphere', 'clearGetSphere', 'resetClearGet', 'validClearGetItem', 'clearGetItemType', 'clearGetItemId',
  'clearGetAssignSkillType', 'clearGetAssignSkillId', 'clearGetAssignSkillLv', 'clearGetItemNum', 'resetSubMission',
  'validSubmission', 'submissionRequire', 'submissionName', 'submissionDataType', 'submissionIdType', 'submissionId',
  'submissionNum', 'submissionRewardType', 'submissionItemId', 'submissionSkillType', 'submissionSkillId',
  'submissionSkillLv', 'submissionItemNum', 'combinedSubmissionFlag', 'raidBoss', 'bgmField', 'bgmBattle', 'bgmBoss'];
const DEFAULTS = { stageBinId: 0, onlyDrama: 0, stageKind: 1, showIcon: 0, hideIcon: 0, noPartner: 0, validStopStage: 0,
  branchType: 0, disableContinue: 0, addLevel: 0, holdKeyblade: 0, hardmodeRequire: 0, hardmodeName: 'strDummy',
  hardmodeComparison: 1, hardmodeNum: 0, validClearGetTitle: 0, clearGetTitle: 0, validClearGetSphere: 0, clearGetSphere: 0,
  resetClearGet: 0, resetSubMission: 0, combinedSubmissionFlag: 0 };
const SUB_FIELDS = ['submissionRequire', 'submissionName', 'submissionDataType', 'submissionIdType', 'submissionId',
  'submissionNum', 'submissionRewardType', 'submissionItemId', 'submissionSkillType', 'submissionSkillId',
  'submissionSkillLv', 'submissionItemNum'];
const CLEAR_FIELDS = ['clearGetItemType', 'clearGetItemId', 'clearGetAssignSkillType', 'clearGetAssignSkillId',
  'clearGetAssignSkillLv', 'clearGetItemNum'];

const num = (s) => parseInt(String(s || '').replace(/,/g, ''), 10) || 0;
const wikiLv = (q) => num(q && q.lvl);
const rawField = (raw, k) => { const m = new RegExp(`\\|${k}=([^\\n|]*)`).exec(raw || ''); return m ? m[1].replace(/<!--.*?-->/g, '').trim() : null; };
const roomWorld = (code) => ROOM_WORLD[String(code || '').slice(0, 2)] || 0;
// miniatura della stanza: XX_AAAA_BB_CC -> AAAA*10000 + BB*100 + CC (stage_select_ico_<worldId>_<thumbId>)
function thumbForRoom(code) {
  const m = /^[A-Z]{2}_(\d{4})_(\d{2})_(\d{2})/.exec(String(code || ''));
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : null;
}

// Obiettivo dalla wiki -> campi del master (submissionRequire/DataType/IdType/Id/Num + nome). Codici e nomi delle righe
// originali 1-555 (5.0.1, 1.1.3, stage_dec): DataType 1 testo, 2 %d = num, 3 %s = nome di id (IdType 5 keyblade, 6 skill),
// 4 nemico (IdType 1). Senza codice noto -> null (tappabuchi).
// Codici che nessuna riga originale 1-555 usa, ricavati dal comportamento del client (ricerca del 21-10,
// note private): nome = testo della wiki tale e quale (nessun %).
// - 37 tempo: tempo trascorso (in secondi, tetto 3600) <= num. «within N seconds» -> N; «mm'ss"cc» (visualizzazione in centesimi dello stesso
//   contatore) -> mm*60+ss, un secondo in piu' se cc > 0 (num e' in secondi interi; tutti i testi wiki hanno cc 00);
// - 8 battaglie: battaglie iniziate <= num;
// - 33 colpi: colpi di ogni attacco/speciale >= num; 32 e' la variante <=;
// - 9 colpi subiti: attacchi nemici a segno <= num: «without taking damage» = 0;
// - 36 danni subiti: danno totale subito <= num: «less than N» stretto -> N-1;
// - 17 tutti i forzieri: forzieri aperti == totale dell'intestazione mappoi «Destroy all barrels»
//   (731/732: ogni forziere dello stage e' un barile, POI di tipo 19) e «Open N treasure chests» con N = quel totale;
// - 18 tutti i materiali: materiali distinti raccolti == totale mappoi (862: 3);
// - 24 medaglie equipaggiate: slot del deck con medalId != 1 (vuoto) <= num.
// «N forzieri/materiali» sono «tutti» solo se N e' il totale dello stage: con ctx.header (intestazione mappoi) un N
// diverso resta tappabuchi; senza intestazioni si accetta (le 10 righe vere sono state verificate una per una).
function objectiveCodes(text, ctx) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  let m;
  // «Defeat the X ...»: X senza articolo; il bersaglio dello stage (STG [6]) col suo id pieno, come le righe originali
  const enemy = (name) => {
    const x = name.replace(/^the /i, '').trim();
    return ctx.targetName && x.toLowerCase() === ctx.targetName.toLowerCase() && ctx.target ? ctx.target : ctx.enemyId(x);
  };
  const turns = (n) => (n === 1 ? 'turn' : 'turns');
  // 28 = «in 1 turno» (num 0 nelle righe originali): con piu' turni nessun esempio originale
  if ((m = /^Defeat all enemies (?:within|in) (\d+) turns?$/i.exec(t))) {
    return num(m[1]) === 1 ? { name: 'Defeat all enemies within 1 turn', req: 28, dt: 1, it: 0, id: 0, n: 0 } : null;
  }
  if ((m = /^Defeat the target(?: enemy)? (?:within|without) (\d+) turns?$/i.exec(t))) {
    const n = num(m[1]);
    return { name: `Defeat the target enemy within\n${n} ${turns(n)}`, req: 12, dt: 4, it: 1, id: ctx.target, n };
  }
  if ((m = /^Defeat (.+?) (?:within|without) (\d+) turns?(?: for [\d,]+ Jewels)?$/i.exec(t))) {
    return { name: 'Defeat the ${1:%s} within ${2:%d :#turn:#turns}', req: 12, dt: 4, it: 1, id: enemy(m[1]), n: num(m[2]) };
  }
  if ((m = /^Defeat (\d[\d,]*) or more enemies$/i.exec(t))) return { name: 'Defeat %d or more enemies', req: 3, dt: 2, it: 0, id: 0, n: num(m[1]) };
  if ((m = /^Defeat (.+?) ?x ?(\d+)$/i.exec(t))) return { name: 'Defeat %s x %d', req: 4, dt: 4, it: 1, id: enemy(m[1]), n: num(m[2]) };
  if ((m = /^Collect (\d[\d,]*) or more Lux$/i.exec(t))) return { name: 'Collect %d or more Lux', req: 29, dt: 2, it: 0, id: 0, n: num(m[1]) };
  if ((m = /^Use (\d+) or more special attacks$/i.exec(t))) return { name: 'Use %d or more special attacks', req: 5, dt: 2, it: 0, id: 0, n: num(m[1]) };
  // «Open N or fewer special attacks» (1 pagina) = refuso della wiki per «Use»
  if ((m = /^(?:Use|Open) (\d+) or (?:fewer|less) special attacks$/i.exec(t))) return { name: 'Use %d or less special attacks', req: 6, dt: 2, it: 0, id: 0, n: num(m[1]) };
  if ((m = /^Complete within (\d+) turns?(?: for [\d,]+ Jewels)?$/i.exec(t))) return { name: 'Complete within ${1:%d :#turn:#turns}', req: 7, dt: 2, it: 0, id: 0, n: num(m[1]) };
  if ((m = /^Inflict (\d[\d,]*) or more damage with 1 (?:hit|attack)( \(excl\. nova\))?$/i.exec(t))) {
    return { name: `Inflict %d or more damage with 1 hit${m[2] ? ' (excl. Nova)' : ''}`, req: 13, dt: 2, it: 0, id: 0, n: num(m[1]) };
  }
  if ((m = /^Equip (?:the )?(.+) Keyblade$/i.exec(t))) {
    const id = ctx.keybladeId(m[1]);
    return id ? { name: 'Equip the %s Keyblade', req: 25, dt: 3, it: 5, id, n: 0 } : null;
  }
  if ((m = /^Trigger the skill (.+)$/i.exec(t))) {
    const id = ctx.skillId(m[1]);
    return id ? { name: 'Trigger the skill %s', req: 14, dt: 3, it: 6, id, n: 0 } : null;
  }
  if ((m = /^Complete within (\d+) seconds?$/i.exec(t))) return { name: t, req: 37, dt: 2, it: 0, id: 0, n: num(m[1]) };
  if ((m = /^Complete within (\d+)'(\d+)"(\d+)$/.exec(t))) {
    return { name: t, req: 37, dt: 2, it: 0, id: 0, n: num(m[1]) * 60 + num(m[2]) + (num(m[3]) > 0 ? 1 : 0) };
  }
  if ((m = /^Complete within (\d+) battles?$/i.exec(t))) return { name: t, req: 8, dt: 2, it: 0, id: 0, n: num(m[1]) };
  if ((m = /^Deal (\d[\d,]*) or more hits$/i.exec(t))) return { name: t, req: 33, dt: 2, it: 0, id: 0, n: num(m[1]) };
  if (/^Complete without taking damage$/i.test(t)) return { name: t, req: 9, dt: 1, it: 0, id: 0, n: 0 };
  if ((m = /^Take less than a total of (\d[\d,]*) damage$/i.exec(t))) return { name: t, req: 36, dt: 2, it: 0, id: 0, n: num(m[1]) - 1 };
  if ((m = /^Equip (\d+) or fewer Medals$/i.exec(t))) return { name: t, req: 24, dt: 2, it: 0, id: 0, n: num(m[1]) };
  const hdr = ctx.header || null;
  if (/^Destroy all barrels$/i.test(t)) return { name: t, req: 17, dt: 1, it: 0, id: 0, n: 0 };
  if ((m = /^Open (\d+) treasure chests?$/i.exec(t))) {
    return !hdr || hdr.treasures === num(m[1]) ? { name: t, req: 17, dt: 1, it: 0, id: 0, n: 0 } : null;
  }
  if ((m = /^Collect (\d+) Keyblade materials?$/i.exec(t))) {
    return !hdr || hdr.materials === num(m[1]) ? { name: t, req: 18, dt: 1, it: 0, id: 0, n: 0 } : null;
  }
  const plain = { 'Complete without having to continue': 10, 'Complete without being afflicted with a status ailment': 11,
    'Open all treasure chests': 17, 'Collect all materials': 18, 'Complete without opening treasure chests': 20,
    'Equip only Power Medals': 21, 'Equip only Speed Medals': 22, 'Equip only Magic Medals': 23 };
  const key = Object.keys(plain).find((k) => k.toLowerCase() === t.toLowerCase());
  if (key) return { name: key, req: plain[key], dt: 1, it: 0, id: 0, n: 0 };
  return null;
}

// Trofei (materiali di Bad Guy Breaker, make-trophy-materials.js): l'icona della pagina wiki (naobjbonusNimg) dice quale
const TROPHY_BY_IMG = { 'Trophy NI KHX': 61, 'Trophy CS KHX': 62, 'Trophy CK KHX': 63 };

// premio dell'obiettivo: tipo/id/numero come le righe 1-555 (14 Avatar Coin, 5:1 Mythril Shard, 7 titolo, 2 jewel, 3 medaglia,
// 5:61-63 Trophy)
function objectiveReward(o, ctx, titleIdx, slot) {
  const q = num(o.qty);
  switch (o.reward) {
    case 'Trophy': { const id = TROPHY_BY_IMG[ctx.raw.img[slot]]; return id ? [5, id, q || 1] : null; }
    case 'Avatar Coin': return [14, 0, q];
    case 'Mythril Shard': return [5, 1, q];
    case 'Jewel': return [2, 0, q];
    case 'Title': { const id = ctx.titleId(ctx.raw.titles[titleIdx]); return id ? [7, id, 1] : null; }
    default: { const id = ctx.medalId(o.reward); return id ? [3, id, q || 1] : null; }
  }
}

function buildRows(stageRows, sources) {
  const { stage113 = [], wiki = {}, wikiRaw = {}, oltre = { missions: [] }, theater = [], dramas = null,
    enemies = null, titles = [], medals = [], keyblades = [], skills = [], thumbs = null, stagePoi = null, headers = null, bgm = {} } = sources;
  const report = { stopgapObjectives: [], missingRewards: [], enemiesToShadow: 0, droppedDramas: [], overflow: [], wikiObjectives: [],
    branchObjectives: [] };
  const knownEnemies = enemies ? new Set(enemies.map((e) => e.enemyId)) : null;
  const byName = (rows, key, name) => rows.filter((r) => r[key] === name);
  const ctxBase = {
    titleId: (name) => (byName(titles, 'title', name)[0] || {}).titleId || 0,
    keybladeId: (name) => (keyblades.find((k) => k.name === name && !k.lv) || {}).keybladeId || 0,
    skillId: (name) => (byName(skills, 'name', name)[0] || {}).skillId || 0,
    medalId: (label) => {
      const m = /^(.+?)\s*(\d*)★$/.exec(String(label || '').trim());
      if (!m) return 0;
      const rare = num(m[2]) || 1;
      return (medals.filter((x) => x.name === m[1] && x.rare === rare).sort((a, b) => a.medalId - b.medalId)[0] || {}).medalId || 0;
    },
    // nemico per nome: id base (il piu' piccolo) come le righe originali («Defeat %s x %d» id 93, 109)
    // poi i nomi imparati dagli stage JP (oltre525.json learned_enemy_names: id solo JP, righe enemy del Task 2)
    enemyId: (name) => {
      const n = name.trim().toLowerCase();
      const ids = (enemies || []).filter((e) => String(e.name).toLowerCase() === n).map((e) => e.enemyId);
      const jp = Object.entries(oltre.learned_enemy_names || {}).filter(([, v]) => String(v).toLowerCase() === n).map(([k]) => Number(k));
      return (ids.length ? ids : jp).sort((a, b) => a - b)[0] || 0;
    },
  };
  const wikiByNum = new Map(Object.values(wiki).filter((q) => /^Quest \d+:/.test(q.title || '')).map((q) => [num(q.number), q]));
  const missionByNum = new Map((oltre.missions || []).map((m) => [m.q, m]));
  const s113 = new Map(stage113.filter((r) => r.stageId >= 18010 && r.stageId <= Q555_STAGE).map((r) => [r.id, r]));
  // dove ci sono gli originali valgono gli originali: senza le 30 righe 1.1.3 (526-555) le si genererebbe dalla wiki
  if (s113.size < 30) throw new Error(`story-oltre: fonte 1.1.3 con ${s113.size} righe 18010-18300 su 30 (KHUX_STAGE_113)`);
  // riferimenti per i campi senza fonte: ultima riga di storia 1-525 dello stesso mondo, poi le 1.1.3
  const story = stageRows.filter((r) => r.stageKind === 1 && r.stageId < 100000 && r.id <= 525).sort((a, b) => a.id - b.id);
  const refByWorld = new Map();
  for (const r of story) refByWorld.set(r.worldId, r);
  const theaterBy = new Map();
  for (const t of theater) {
    if (!t.validTheater || !t.stageId) continue;
    if (!theaterBy.has(t.stageId)) theaterBy.set(t.stageId, []);
    theaterBy.get(t.stageId).push(t);
  }
  const present = (id) => id && (!dramas || dramas.has(id));
  const setDramas = (row, before, after) => {
    const b = before.filter(([id]) => present(id)), a = after.filter(([id]) => present(id));
    const dropped = [...before, ...after].filter(([id]) => !present(id)).map(([id]) => id);
    if (dropped.length) report.droppedDramas.push([row.id, dropped]);
    const all = [...b, ...a];
    // il client legge al massimo 5 filmati per lato
    const pre = b.length ? b.slice(0, 5) : [], post = (b.length ? b.slice(5).concat(a) : a).slice(0, 5);
    if (all.length > pre.length + post.length) report.overflow.push([row.id, all.slice(pre.length + post.length).map((d) => d[0])]);
    Object.assign(row, { validBeforeDrama: pre.length, beforeDramaId: pre.map((d) => d[0]), beforeDramaType: pre.map((d) => d[1]),
      validAfterDrama: post.length, afterDramaId: post.map((d) => d[0]), afterDramaType: post.map((d) => d[1]) });
  };
  const theaterDramas = (stageId) => (theaterBy.get(stageId) || []).flatMap((t) => t.dramaId.map((id, i) => [id, (t.dramaType || [])[i] || 0]));
  const finish = (r) => Object.fromEntries(FIELDS.map((k) => [k, k in r ? r[k] : DEFAULTS[k]]));
  const remapEnemies = (row) => {
    if (!knownEnemies) return;
    row.submissionId = row.submissionId.map((id, i) => {
      // id 0 (nome non trovato) farebbe cercare la riga 0: anche quello sullo Shadow
      if (row.submissionIdType[i] === 1 && i < row.validSubmission && !knownEnemies.has(id)) { report.enemiesToShadow++; return 1; }
      return id;
    });
  };

  // obiettivi della wiki (al massimo 3) -> [[codici, premio]]; ctx col bersaglio dello stage JP (oltre525.json)
  const wikiSubs = (n, q, mis, raw) => {
    const ctx = { ...ctxBase, target: mis.stage.target_id || 0, targetName: mis.target || q.target || '',
      raw: { titles: [...raw.matchAll(/\|naotitle\d?=([^\n|]*)/g)].map((m) => m[1].trim()),
        img: [1, 2, 3].map((k) => rawField(raw, `naobjbonus${k}img`)) },
      header: headers ? headers[mis.stage.stageId] || null : null };
    const subs = [];
    let titleIdx = 0;
    for (const [i, o] of (q.objectives || []).slice(0, 3).entries()) {
      let c = objectiveCodes(o.text, ctx);
      if (!c) {
        // TAPPABUCHI: codice del client non ricavato; testo della wiki, valutato come «senza continue» (10)
        report.stopgapObjectives.push([n, i + 1, o.text]);
        c = { name: o.text, req: 10, dt: 1, it: 0, id: 0, n: 0 };
      }
      let rw = objectiveReward(o, ctx, o.reward === 'Title' ? titleIdx++ : 0, i);
      if (!rw) { report.missingRewards.push([n, i + 1, o.reward]); rw = [0, 0, 0]; }
      subs.push([c, rw]);
    }
    return subs;
  };
  // nemici dello stage JP (POI); la 555 con le 5 varianti dell'Unione
  const stageEnemyIds = (stageId) => new Set((stageId === Q555_STAGE ? [0, 1, 2, 3, 4] : [0]).flatMap((k) =>
    ((stagePoi[stageId + k] || {}).enemies || []).map((e) => e.enemyId)));

  const rows = [];
  let prev = story[story.length - 1] || {};
  for (let n = FIRST; n <= LAST; n++) {
    const q = wikiByNum.get(n);
    const mis = missionByNum.get(n);
    let row;
    if (n === CUTSCENE) {
      // missione di solo filmato (D-B): nessuna mappa, nessun obiettivo, premi della pagina wiki
      const title = Object.keys(wikiRaw).find((k) => /^Quest 978: /.test(k)) || 'Quest 978: What Comes After';
      const raw = wikiRaw[title] || '';
      const worldId = WIKI_WORLD[rawField(raw, 'world')] || 1;
      const ref = refByWorld.get(worldId) || prev;
      row = { stageId: CUTSCENE_STAGE, id: n, name: rawField(raw, 'nadesc') || title.replace(/^Quest \d+: /, ''), mapName: '',
        useAp: 0, chapterId: Math.floor(CUTSCENE_STAGE / 1000), worldId, thumbId: ref.thumbId || 0, onlyDrama: 1,
        validSubmission: 0, raidBoss: ref.raidBoss || 0, bgmField: ref.bgmField || 0, bgmBattle: ref.bgmBattle || 0, bgmBoss: ref.bgmBoss || 0 };
      const clear = [];
      if (num(rawField(raw, 'najewel'))) clear.push([2, 0, num(rawField(raw, 'najewel'))]);
      const med = ctxBase.medalId(rawField(raw, 'namedal'));
      if (med) clear.push([3, med, num(rawField(raw, 'namedalq')) || 1]);
      const tid = ctxBase.titleId(rawField(raw, 'naqtitle'));
      if (tid) Object.assign(row, { validClearGetTitle: 1, clearGetTitle: tid });
      setClear(row, clear);
      setSubs(row, []);
      setDramas(row, theaterDramas(CUTSCENE_STAGE), []);
    } else if (s113.has(n)) {
      // 526-555: riga vera 1.1.3, array tagliati alle lunghezze valide
      const r = s113.get(n);
      row = JSON.parse(JSON.stringify(r));
      for (const a of CLEAR_FIELDS) row[a] = (r[a] || []).slice(0, r.validClearGetItem);
      for (const a of SUB_FIELDS) row[a] = (r[a] || []).slice(0, 3);
      const before = (r.beforeDramaId || []).slice(0, r.validBeforeDrama).map((id, i) => [id, (r.beforeDramaType || [])[i] || 0]);
      const after = (r.afterDramaId || []).slice(0, r.validAfterDrama).map((id, i) => [id, (r.afterDramaType || [])[i] || 0]);
      // come make-game-tables.js: senza filmati prima rimasti nelle risorse, quelli del theater della stessa stageId
      const keep = before.filter(([id]) => present(id));
      setDramas(row, keep.length ? before : theaterDramas(r.stageId).concat(before), after);
      if (n === 555) Object.assign(row, { stageId: Q555_STAGE, branchType: 1 });
      if (q) row.useAp = q.ap === 'zero' ? 0 : num(q.ap);
      row.worldId = roomWorld(mis && mis.stage.rooms[0]) || r.worldId;
      row.chapterId = Math.floor(row.stageId / 1000);
      // «Defeat X» su un nemico assente dallo stage JP -> obiettivi della wiki (ruling, intestazione)
      if (stagePoi) {
        const inStage = stageEnemyIds(r.stageId);
        const bad = [...Array(Math.min(3, r.validSubmission || 0)).keys()]
          .some((i) => row.submissionIdType[i] === 1 && !inStage.has(row.submissionId[i]));
        if (bad) {
          if (!q || !mis) throw new Error(`missione ${n}: obiettivi 1.1.3 fuori dallo stage e nessuna pagina wiki/oltre525.json`);
          setSubs(row, wikiSubs(n, q, mis, wikiRaw[q.title] || ''));
          report.wikiObjectives.push(n);
        }
      }
      // Q555 (fix round 1 del Task 6, 21-10): il client valuta gli obiettivi 12 per id: conta
      // solo i nemici con submissionId e compie l'obiettivo se il
      // conto e' fra 1 e submissionNum (poi lo manda in clearMissionIds di /stage/clear).
      // Nessuna forma «bersaglio dello stage» senza id. Le 5 varianti hanno bersagli diversi (10230
      // Aced, 10231 Invi, 10228 Ira x2, 10232 Gula): un obiettivo per id che una variante non ha diventa 7 «Complete
      // within N turns» (7: turni <= N), stesso N e stesso premio; dichiarato nelle Notices.
      if (stagePoi && row.branchType === 1) {
        const sets = Q555_VARIANTS.map((v) => new Set(((stagePoi[v] || {}).enemies || []).map((e) => e.enemyId)));
        for (let i = 0; i < Math.min(3, row.validSubmission || 0); i++) {
          if (row.submissionIdType[i] !== 1 || sets.every((x) => x.has(row.submissionId[i]))) continue;
          if (row.submissionRequire[i] !== 12) throw new Error(`missione ${n}: obiettivo ${i + 1} (${row.submissionRequire[i]}) per id fuori da una variante`);
          Object.assign(row, { submissionRequire: Object.assign([...row.submissionRequire], { [i]: 7 }),
            submissionName: Object.assign([...row.submissionName], { [i]: 'Complete within ${1:%d :#turn:#turns}' }),
            submissionDataType: Object.assign([...row.submissionDataType], { [i]: 2 }),
            submissionIdType: Object.assign([...row.submissionIdType], { [i]: 0 }),
            submissionId: Object.assign([...row.submissionId], { [i]: 0 }) });
          report.branchObjectives.push([n, i + 1]);
        }
      }
    } else {
      if (!q || !mis) throw new Error(`missione ${n}: assente dalla wiki o da oltre525.json`);
      const raw = wikiRaw[q.title] || '';
      const stageId = mis.stage.stageId;
      // stanze DG (Corridor of Darkness) non sono un mondo: quello della wiki (le 492-500 originali hanno worldId 1)
      const worldId = roomWorld(mis.stage.rooms[0]) || WIKI_WORLD[q.world] || 1;
      const ref = refByWorld.get(worldId) || [...rows].reverse().find((r) => r.worldId === worldId && r.id <= 555);
      const roomThumb = thumbForRoom(mis.stage.rooms[0]);
      const wb = ref ? [ref.bgmField, ref.bgmBattle, ref.bgmBoss] : WORLD_BGM[worldId] || [prev.bgmField, prev.bgmBattle, prev.bgmBoss];
      // musica per missione dal file (I-198) sulla regola del mondo
      const pq = bgm[n];
      const music = pq ? [pq.bgmField, pq.bgmBattle, pq.bgmBoss] : wb;
      row = { stageId, id: n, name: q.name, mapName: (q.rooms || [])[0] || '', useAp: q.ap === 'zero' ? 0 : num(q.ap),
        chapterId: Math.floor(stageId / 1000), worldId,
        thumbId: thumbs && roomThumb !== null && thumbs.has(`${worldId}_${roomThumb}`) ? roomThumb
          : ref ? ref.thumbId : (worldId in WORLD_THUMB ? WORLD_THUMB[worldId] : prev.thumbId || 0),
        raidBoss: (ref || prev).raidBoss || 0, bgmField: music[0] || 0, bgmBattle: music[1] || 0, bgmBoss: music[2] || 0 };
      setSubs(row, wikiSubs(n, q, mis, raw));
      const clear = [];
      if (num(q.jewel)) clear.push([2, 0, num(q.jewel)]);
      if ((q.rewards || {}).namunny) clear.push([4, 0, num(q.rewards.namunny)]);
      if ((q.rewards || {}).naorichalcum) clear.push([5, 6, 1]);
      else {
        const med = ctxBase.medalId(rawField(raw, 'namedal'));
        if (med) clear.push([3, med, num(rawField(raw, 'namedalq')) || 1]);
      }
      const kb = ctxBase.keybladeId(rawField(raw, 'nakeyblade'));
      if (kb) clear.push([13, kb, 1]);
      const tid = ctxBase.titleId(rawField(raw, 'naqtitle'));
      if (tid) Object.assign(row, { validClearGetTitle: 1, clearGetTitle: tid });
      if (clear.length > 3) report.overflow.push([n, 'clearGet', clear.slice(3)]);
      setClear(row, clear.slice(0, 3));
      setDramas(row, theaterDramas(stageId), []);
    }
    remapEnemies(row);
    row = finish(row);
    rows.push(row);
    prev = row;
  }
  Object.defineProperty(rows, 'report', { value: report });
  return rows;
}

// obiettivi tappabuchi delle 526-979 in una tabella stage (codice del client non ricavato: valutati come 10 col testo
// della wiki), per la notizia «Story Quests 526-979»: 0 dal 21-10 (codici originali sopra); la notizia ne parla solo se > 0
function countStopgaps(stageRows) {
  let n = 0;
  for (const r of stageRows || []) {
    if (r.stageKind !== 1 || r.id < FIRST || r.id > LAST || r.stageId >= 100000) continue;
    for (let i = 0; i < Math.min(3, r.validSubmission || 0); i++) if (r.submissionRequire[i] === 10 && r.submissionName[i] !== STOPGAP_KEEP) n++;
  }
  return n;
}

function setClear(row, items) {
  Object.assign(row, { validClearGetItem: items.length, clearGetItemType: items.map((x) => x[0]),
    clearGetItemId: items.map((x) => x[1]), clearGetAssignSkillType: items.map(() => 1), clearGetAssignSkillId: items.map(() => 0),
    clearGetAssignSkillLv: items.map(() => 1), clearGetItemNum: items.map((x) => x[2]) });
}

function setSubs(row, subs) {
  const pad = (f) => [0, 1, 2].map((i) => (i < subs.length ? f(subs[i]) : 0));
  Object.assign(row, { validSubmission: subs.length,
    submissionRequire: pad(([c]) => c.req), submissionName: [0, 1, 2].map((i) => (i < subs.length ? subs[i][0].name : '')),
    submissionDataType: pad(([c]) => c.dt), submissionIdType: pad(([c]) => c.it), submissionId: pad(([c]) => c.id),
    submissionNum: pad(([c]) => c.n), submissionRewardType: pad(([, r]) => r[0]), submissionItemId: pad(([, r]) => r[1]),
    submissionSkillType: [0, 0, 0], submissionSkillId: [0, 0, 0], submissionSkillLv: [0, 0, 0],
    submissionItemNum: pad(([, r]) => r[2]) });
}

const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } };
// fonte obbligatoria: assente o illeggibile -> errore col percorso (mai righe generate al posto degli originali)
function readRequired(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { throw new Error(`story-oltre: fonte obbligatoria ${p}: ${e.message}`); }
}

function readDramas(namesPath) {
  if (!fs.existsSync(namesPath)) return null;
  const set = new Set();
  for (const line of fs.readFileSync(namesPath, 'utf8').split('\n')) {
    const m = /^(?:img\/light\/SEQ\/(\d+)\.l|lwf\/drama\/(\d+)\/)/.exec(line);
    if (m) set.add(Number(m[1] || m[2]));
  }
  return set;
}

// icone stage_select_ico servite: indice delle risorse (names_v4.tsv) + JP 4.3.1 img/adventure/stage (originals.tsv
// sezione 1, tutte; nomi con revisione «.NNNNNNNN» compresi). Set di «<worldId>_<thumbId>»; nessuna fonte -> null.
function readThumbs(namesPath, jpRoot) {
  const set = new Set();
  let found = false;
  const add = (s) => { const m = /stage_select_ico_(\d+)_(\d+)(?:\.\d{8})?\.png$/.exec(s); if (m) set.add(`${m[1]}_${m[2]}`); };
  if (namesPath && fs.existsSync(namesPath)) {
    found = true;
    for (const line of fs.readFileSync(namesPath, 'utf8').split('\n')) {
      if (line.startsWith('img/adventure/stage/')) add(line.split('\t')[0]);
    }
  }
  const dir = jpRoot && path.join(jpRoot, 'img', 'adventure', 'stage');
  if (dir && fs.existsSync(dir)) { found = true; for (const f of fs.readdirSync(dir)) add(f); }
  return found ? set : null;
}

// a local reference data folder, not provided by this project (server/local-paths.js)
const JP_ROOT = require('./local-paths').localPath('jp_data');

// fonti esterne (dati Square Enix e wiki: fuori dal repo)
function defaultSources() {
  const wikiAll = readRequired(process.env.KHUX_WIKI_ALL || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json');
  const names = process.env.KHUX_RESOURCE_NAMES || 'D:\\Progetto_Restauro_KH_UX\\resource_data\\names_v4.tsv';
  const dramas = readDramas(names);
  if (!dramas) console.log(`story-oltre: ${names} assente, nessun filmato (un id assente manda in crash il client)`);
  const thumbs = readThumbs(names, process.env.KHUX_JP_ROOT || JP_ROOT);
  if (!thumbs) console.log('story-oltre: nessun elenco di icone, miniature dalle righe di riferimento');
  return {
    stage113: readRequired(process.env.KHUX_STAGE_113 || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\stage.json'),
    wiki: readRequired(process.env.KHUX_WIKI_QUESTS || 'D:\\Progetto_Restauro_KH_UX\\wiki\\quests.json'),
    wikiRaw: Object.fromEntries(Object.entries(wikiAll).filter(([k]) => /^Quest \d+: /.test(k))),
    oltre: readRequired(process.env.KHUX_OLTRE525 || 'D:\\Progetto_Restauro_KH_UX\\reference\\world_schema\\oltre525\\oltre525.json'),
    // nemici degli stage JP (Task 3): obiettivi 1.1.3 su nemici fuori dallo stage -> quelli della wiki
    stagePoi: readRequired(process.env.KHUX_STAGE_POI_OLTRE || 'D:\\Progetto_Restauro_KH_UX\\stage_gen\\orig_stages_oltre\\stage_poi_oltre.json'),
    bgm: readRequired(process.env.KHUX_BGM_OLTRE || 'D:\\Progetto_Restauro_KH_UX\\reference\\world_schema\\oltre525\\bgm_per_quest.json'),
    dramas: dramas || new Set(),
    thumbs,
    headers: readHeaders(process.env.KHUX_STAGE_DIR_OLTRE || 'D:\\Progetto_Restauro_KH_UX\\stage_gen\\orig_stages_oltre\\stage'),
  };
}

// totali dell'intestazione degli stage JP (mappoi_stg<id>.bin: forzieri materiali; letti dal client per
// gli obiettivi 17/18) per stageId; cartella assente -> null (obiettivi «N forzieri/materiali» accettati senza verifica)
function readHeaders(dir) {
  if (!fs.existsSync(dir)) return null;
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    const m = /^mappoi_stg(\d+)\.bin$/.exec(f);
    if (!m) continue;
    const d = fs.readFileSync(path.join(dir, f));
    if (d.length >= 0x40) out[m[1]] = { treasures: d.readInt32LE(0x38), materials: d.readInt32LE(0x3c) };
  }
  return out;
}

// righe world 11-14 (D-C) come la riga 1 (DB) col worldName del prefisso; sostituisce quelle di un giro precedente,
// subito dopo l'ultima riga < 10000 (le 10000+ sono varianti di DB)
function buildWorldRows(worldRows) {
  const keep = worldRows.filter((r) => !(r.worldId in NEW_WORLDS));
  const tpl = keep.find((r) => r.worldId === 1);
  if (!tpl) throw new Error('story-oltre: tabella world senza la riga 1 (modello delle righe 11-14)');
  const add = Object.entries(NEW_WORLDS).map(([id, name]) => ({ ...JSON.parse(JSON.stringify(tpl)), worldId: Number(id), worldName: name }));
  let at = -1;
  keep.forEach((r, i) => { if (r.worldId < 10000) at = i; });
  return [...keep.slice(0, at + 1), ...add, ...keep.slice(at + 1)];
}

// righe 526-979 dopo l'ultima missione di storia 1-525 (prima di tour e zoo); sostituisce quelle di un giro precedente
function patch(masterDir, src) {
  if (process.env.KHUX_STORY_OLTRE === '0') { console.log('story-oltre: spento (KHUX_STORY_OLTRE=0)'); return 0; }
  const file = path.join(masterDir, 'stage.json');
  const isOltre = (r) => r.stageKind === 1 && r.stageId < 100000 && r.id >= FIRST && r.id <= LAST;
  const stages = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => !isOltre(r));
  const t = (name) => readJson(path.join(masterDir, name + '.json'), []);
  const s = src || defaultSources();
  const rows = buildRows(stages, { ...s, theater: t('theater'), enemies: fs.existsSync(path.join(masterDir, 'enemy.json')) ? t('enemy') : null,
    titles: t('title'), medals: t('medal'), keyblades: t('keyblade'), skills: t('skill') });
  let at = -1;
  stages.forEach((r, i) => { if (r.stageKind === 1 && r.stageId < 100000 && r.id <= 525) at = i; });
  const out = [...stages.slice(0, at + 1), ...rows, ...stages.slice(at + 1)];
  // righe world calcolate prima di scrivere: un errore non lascia stage.json e world.json disallineati
  const worldFile = path.join(masterDir, 'world.json');
  const world = fs.existsSync(worldFile) ? buildWorldRows(JSON.parse(fs.readFileSync(worldFile, 'utf8'))) : null;
  fs.writeFileSync(file, JSON.stringify(out));
  if (world) fs.writeFileSync(worldFile, JSON.stringify(world));
  else console.log(`story-oltre: ${worldFile} assente, righe world 11-14 non aggiunte`);
  const rep = rows.report;
  console.log(`story-oltre: +${rows.length} missioni 526-979 (978 solo filmato); ${rep.enemiesToShadow} obiettivi su nemici assenti -> 1; `
    + `${rep.stopgapObjectives.length} obiettivi tappabuchi, ${rep.missingRewards.length} premi non ricavati, `
    + `${rep.droppedDramas.length} missioni con filmati assenti tolti, ${rep.overflow.length} oltre i limiti; `
    + `obiettivi della wiki al posto dei 1.1.3 (nemico fuori dallo stage): ${rep.wikiObjectives.join(', ') || 'nessuno'}; `
    + `per id fuori da una variante -> 7: ${rep.branchObjectives.map(([q, i]) => `${q}/${i}`).join(', ') || 'nessuno'}`);
  return rows.length;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { ROOM_WORLD, WIKI_WORLD, WORLD_THUMB, WORLD_BGM, NEW_WORLDS, thumbForRoom, readThumbs, buildWorldRows, buildRows, objectiveCodes, wikiLv, readDramas, defaultSources, patch,
  countStopgaps, Q555_VARIANTS, TROPHY_BY_IMG, readHeaders };
