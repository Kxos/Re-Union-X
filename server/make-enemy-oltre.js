#!/usr/bin/env node
// Righe enemy dei nemici che gli stage JP 4.3.1 delle missioni 526-979 usano e il nostro master non ha (I-009, Task 2).
// Elenco: reference\world_schema\oltre525\enemies_oltre525.json (enemies_oltre525.py: 454 id usati, 312 mancanti,
// `missing{"<id>": {missions[], base, base_name}}`). Regole dell'utente (D-A e decisione del 21-10):
// - id di 9-10 cifre (AAMM + cifra + famiglia, es. 1510110017) con la base nel master -> clone esatto della base col
//   nuovo enemyId (nome, HP, abilita', grafica): base = ultime 5 cifre (cifra del livello + famiglia, 10017) se la riga
//   c'e', altrimenti ultime 4 (160921501: 21501 assente -> 1501). Ricerca successiva: 13 dei 62 cloni cambiano HP
//   rispetto alle sole 4 cifre (190110117: 117 hp [2700,4700,...], 10117 [5200,9000,...]).
// - gli altri 250 (id solo JP, id lunghi senza base): nessuna statistica esiste (wiki: la pagina «Enemies» da' solo nome,
//   descrizione, attributo, tipo; ricerca in rete 0/250) -> clone del nemico ORIGINALE piu' simile, dichiarato nelle
//   Notices (Task 5). Proposta (ricerca in rete del 21-10: 0/250 fonti con statistiche; base scelta per famiglia di
//   nome, ruolo mob/elite/boss e attributo): reference\world_schema\oltre525\enemy_clone_proposal.json ({"<id>": {base,
//   reason, confidence, name, attribute, max_quest_lvl}}, obbligatoria: assente -> errore), rigenerata da
//   `python -I enemy_clone_proposal.py` nella stessa cartella (ingressi in enemy_clone_inputs\: uncovered_info.json e
//   wiki_enemies.json dalla tabella «Enemies» di khuxwiki; legge anche oltre525.json e server/master_data/enemy.json).
//   Della base si copiano curve
//   (validGrowth, baseLv, hp, attack, defense, exp, money, raidPoint, lux, score) e campi di battaglia (abilita', taglia,
//   velocita', comparsa); nome e attributo della proposta se noti; grafica della famiglia dell'id (id % 10000 delle
//   ultime 5 cifre) se servita, altrimenti l'aspetto Dark Road della stessa specie (DR_LOOK, I-194) se c'e', altrimenti
//   quella della base. Gli id lunghi di queste famiglie riusano il clone della
//   loro base a 5 (o 4) cifre. Ogni riga ha la sua fonte in enemy_oltre_sources.json (per la Notice).
// - le statistiche da una fonte vera (D:\Progetto_Restauro_KH_UX\wiki\enemy_stats_oltre.json, {"<id>": {name, hp[5],
//   attack[5], displayId?, source}}, oggi assente) vincono sulla proposta.
// Nel master l'id e' un int a 32 bit (enemyId nelle righe stage): oltre 2^31-1 errore.
// make-game-tables.js toglie le righe di un giro precedente subito dopo la tabella enemy (strip) e chiama addRows() dopo
// la scelta della grafica (le basi hanno gia' il displayId servito) e prima di abilita' (enemy-attack-fix.js), effetto di
// comparsa e make-story-oltre.js (obiettivi «Defeat X»). Rigenerate a ogni giro: idempotente.
//
//   node server/make-enemy-oltre.js [cartella master] [file delle fonti]
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_ID = 2 ** 31 - 1;
const OLTRE_DIR = 'D:\\Progetto_Restauro_KH_UX\\reference\\world_schema\\oltre525';
const MISSING_PATH = process.env.KHUX_ENEMIES_OLTRE525 || path.join(OLTRE_DIR, 'enemies_oltre525.json');
const PROPOSAL_PATH = process.env.KHUX_ENEMY_CLONE_PROPOSAL || path.join(OLTRE_DIR, 'enemy_clone_proposal.json');
const STATS_PATH = process.env.KHUX_ENEMY_STATS_OLTRE || 'D:\\Progetto_Restauro_KH_UX\\wiki\\enemy_stats_oltre.json';
const SOURCES_PATH = process.env.KHUX_ENEMY_OLTRE_SOURCES || path.join(OLTRE_DIR, 'enemy_oltre_sources.json');
const NAMES_PATH = process.env.KHUX_RESOURCE_NAMES || 'D:\\Progetto_Restauro_KH_UX\\resource_data\\names_v4.tsv';
const ENEMY_GEN = process.env.KHUX_NO_ENEMY_GEN ? null
  : path.join(process.env.KHUX_ENEMY_GEN || 'D:\\Progetto_Restauro_KH_UX\\enemy_gen\\files', 'lwf', 'character', 'enemy');
const SHADOW = 80001;
// dati di comparsa JP 4.3.1 per displayId (json/enemy/detail<d>.json: 91 file, displayId 1-141 e 1001-1006)
const JP_DETAIL_DIR = process.env.KHUX_JP_ENEMY_DETAIL
  || require('./local-paths').localPath('jp_data', 'json', 'enemy');
// campo JP -> campo della riga enemy (hit_effect sta in enemyAttack, non qui)
const DETAIL_SIZE = { speed: 'moveSpeed', hit_radius: 'hitRadius', width: 'width', height: 'height' };
const DETAIL_SHOW = { show: 'show', show_swf: 'showSwf', show_frame: 'showFrame', hide_frame: 'hideFrame' };

// Aspetto Dark Road della STESSA specie per le famiglie senza grafica originale completa (I-194, passo approvato
// dall'utente il 21-10: sostituto, non originale; dichiarato nella Notice «Story Quests 526-979»). Usato solo se la
// famiglia non e' servita (enemy_gen incompleto) e la grafica DR lo e' (names_v4.tsv: wait, atk1_o, dead,
// knockback; `move` la fa make_enemy_moves.py da wait per ogni displayId >= 5000 del master, al build successivo).
// Riconoscimento a vista: fogli D:\Progetto_Restauro_KH_UX\tmp\dr_map\sheets\cmp_*.png (texture wait DR accanto a
// khwiki <Nome>_KHUX.png), proposta tmp\dr_map\dr_proposal.json. Le LWF DR non hanno nomi (bitmap «ビットマップ N»):
// la specie viene dalle parti. high = stessa creatura o stessa specie con altri colori; medium = specie vicina dello
// stesso modello. Boss unici e personaggi (Jafar, Dragon Maleficent, Ralph...) mai su creature diverse: assenti.
// Nota: 5043 (in enemy_display_map.json «Storming Sheep») e' lo Sleep Archer, 5075 (mappe_storia «Yellow Opera»)
// l'Apricot Opera (corpo a trivella scuro e oro, fulmini).
// 22-10 (user, sheets D:\Progetto_Restauro_KH_UX	mp\dr6\sheets): 5040 is a mummy bomb, not the Shadow Witch -> 2506 and
// 2510 back to their base 11 Wizard; 1552 back to base 9 Bandit; 1537 and 1629 use the closest UX look (displayId < 5000).
const DR_LOOK = {
  1502: { displayId: 5003, confidence: 'high', note: 'Green Requiem: Opera, specie di Yellow Opera (5003), solo il colore cambia (alternativa 5039 verde con ali)' },
  1503: { displayId: 5039, confidence: 'high', note: 'Emerald Sonata: stessa creatura (corpo verde, cappello d\'oro a spirale, ali d\'oro)' },
  1562: { displayId: 5075, confidence: 'high', note: 'Apricot Opera: stessa creatura (trivella scura a righe d\'oro, fulmini)' },
  1563: { displayId: 5039, confidence: 'high', note: 'Amber Opera: modello di Emerald Sonata, corpo giallo invece che verde' },
  1508: { displayId: 5041, confidence: 'high', note: 'Poison Archer: stessa creatura (occhi a X, arco-tentacolo viola)' },
  1509: { displayId: 5042, confidence: 'high', note: 'Paralysis Archer: stessa creatura (corona, arco a fulmine d\'oro)' },
  1510: { displayId: 5043, confidence: 'high', note: 'Sleep Archer: stessa creatura (testa di lana, arco a ricciolo viola)' },
  1521: { displayId: 5057, confidence: 'high', note: 'Fluttering: stessa creatura (ali viola e rosa, corpo a uovo)' },
  1523: { displayId: 5044, confidence: 'high', note: 'Blitz Spear: stessa creatura (verde, lance a fulmine)' },
  1524: { displayId: 5045, confidence: 'high', note: 'Chill Ripper: stessa creatura (blu, lame di ghiaccio)' },
  1525: { displayId: 5046, confidence: 'high', note: 'Heat Saber: stessa creatura (rosso, lame di fuoco)' },
  1534: { displayId: 5047, confidence: 'high', note: 'Barrier Master: stessa creatura (cilindro viola, libro col cuore, mani verdi)' },
  1539: { displayId: 5055, confidence: 'high', note: 'Ferry Reaper: stessa creatura (falce, teschio, lanterne rosse, stendardo)' },
  1540: { displayId: 5083, confidence: 'high', note: 'Volcanic Lord: stessa creatura (gonna di fiamme, corona d\'oro, scettro)' },
  1542: { displayId: 5078, confidence: 'high', note: 'Golden Hook Bat: Hook Bat (5078) blu invece che d\'oro' },
  1543: { displayId: 5048, confidence: 'high', note: 'Pot Spider: stessa creatura (vaso rosso, zampe gialle)' },
  1544: { displayId: 5050, confidence: 'high', note: 'Pot Scorpion: stessa creatura (vaso rosso, corazza blu, coda)' },
  1602: { displayId: 5066, confidence: 'high', note: 'Margoyle: stessa creatura (palla chiodata, collare d\'oro, ali, teschio cornuto)' },
  2505: { displayId: 5058, confidence: 'high', note: 'Wight Knight: stessa creatura (mummia, artigli)' },
  2509: { displayId: 8015, confidence: 'high', note: 'Gargoyle Wizard: stessa creatura in colori scuri (piedistallo con globo, bastone, ali)' },
  240: { displayId: 5074, confidence: 'high', note: 'Trickmaster: stessa creatura (corpo a scacchi arancio, bacchetta)' },
  249: { displayId: 5065, confidence: 'high', note: 'Eliminator: stessa creatura (Defender rosso con muso di lupo)' },
  1527: { displayId: 5057, confidence: 'medium', note: 'Flutterings (sciame): grafica del singolo Fluttering, come Possessors' },
  1537: { displayId: 197, confidence: 'medium', note: 'Martial Monkey: Cheery Ape (UX), large upright ape, closest served shape (22-10, user; atkSp falls back to wait)' },
  1629: { displayId: 147, confidence: 'high', note: 'Cherry Kaboom: Minute Bomb (UX), same round bomb with curled fuse, other colour (22-10, user)' },
  // 2508 Warlock Step -> 5061 (Tornado Step DR) tolto il 22-10: crash all'avvio della battaglia in 703/704 (684 con
  // 5040 ok; causa non trovata); resta la base 14 Tornado Step UX
};

// Alleati ospiti (I-199, docs/notes/battaglia.md#alleati-20xx): famiglie 2001-2024 che gli stage JP usano SOLO come
// unico membro di una squadra col flag 0x20; il client le tiene nella lista degli alleati (4.3.1):
// combattono accanto al giocatore, mai toccabili ne' attaccate. Restano righe enemy (meccanismo originale) ma non
// sono cloni di nemici: nome del personaggio, curve e mosse della riga originale `template` (2001-2003, WW 5.0.1 =
// thethiny: 210x283, battlePattern 3), grafica della famiglia se servita (regola degli alleati di make_jp_enemies.py:
// wait + atk1_o), se no il sosia `look` (2001 Ercole, 2002/2003 portatori di Keyblade; Notice «Story Quests 526-979»).
// Vale anche per le righe del master (2001, 2002, 2003, 12001, 22001): nome e grafica.
const ALLY_PATH = process.env.KHUX_ALLY_FAMILIES || path.join(__dirname, '..', 'recon', 'tools', 'ally_families.json');
function readAllies(p = ALLY_PATH) {
  const fams = readJson(p, {}).families || {};
  return Object.fromEntries(Object.entries(fams).map(([k, v]) => [Number(k), v]));
}
// grafica di un alleato: la famiglia (servita, < 5000), se no il sosia servito, se no null (resta quella che ha)
function allyDisplay(fam, a, drawn) {
  if (fam < 5000 && drawn.has(fam)) return { displayId: fam, graphic: 'family' };
  if (a.look && drawn.has(a.look)) return { displayId: a.look, graphic: 'look-alike' };
  return null;
}

// D-A: solo gli id di 9-10 cifre sono varianti di un nemico base
const isClone = (id) => id >= 1e8 && id < 1e10;
// base di un id lungo: ultime 5 cifre se la riga c'e', altrimenti ultime 4 (regola del controller, 21-10)
const baseOf = (id, has) => (has(id % 100000) ? id % 100000 : has(id % 10000) ? id % 10000 : null);
// famiglia grafica: ultime 4 cifre (delle ultime 5 per gli id da 8 cifre in su), come prop.py split()
const familyOf = (id) => (id >= 1e7 ? id % 100000 : id) % 10000;
const copy = (r) => JSON.parse(JSON.stringify(r));

// grafiche servite di un nemico, come make-game-tables.js: lwf/character/enemy/<d>/wait/ nei nomi delle risorse
// (names_v4.tsv) piu' le cartelle di enemy_gen con wait/wait.lwf (drawnJp). Solo d < 5000 conta come grafica KHUX
function drawnDisplays(namesFile = NAMES_PATH, drawnJp = null) {
  const drawn = new Set();
  if (namesFile && fs.existsSync(namesFile)) {
    for (const line of fs.readFileSync(namesFile, 'utf8').split('\n')) {
      const m = /^lwf\/character\/enemy\/(\d+)\/wait\//.exec(line);
      if (m) drawn.add(Number(m[1]));
    }
  }
  const jp = drawnJp || (ENEMY_GEN && fs.existsSync(ENEMY_GEN) ? fs.readdirSync(ENEMY_GEN)
    .filter((n) => /^\d+$/.test(n) && fs.existsSync(path.join(ENEMY_GEN, n, 'wait', 'wait.lwf'))).map(Number) : []);
  for (const d of jp) drawn.add(d);
  return drawn;
}

// dettagli JP: {"<displayId>": {show, show_swf, show_frame, hide_frame, speed, hit_radius, width, height, hit_effect}}
function readDetails(dir = JP_DETAIL_DIR) {
  const out = {};
  if (!dir || !fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const m = /^detail(\d+)\.json$/.exec(f);
    if (m) { try { out[m[1]] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { /* file rotto: ignorato */ } }
  }
  return out;
}

// missing: {"<id>": {missions[]}}; enemyRows: tabella enemy (basi col displayId gia' servito);
// src: {stats, proposal, drawn:Set, details, shows:Set}. -> { rows, sources{"<id>": {kind, base, ...}}, uncovered[], cloned,
// fromStats, family }. shows = showSwf serviti (assente: quelli delle righe originali, che make-game-tables.js ha gia'
// ridotto ai serviti)
function enemyRowsFor(missing, enemyRows, src = {}) {
  const { stats = {}, proposal = {}, drawn = new Set(), details = {} } = src;
  const shows = src.shows || new Set(enemyRows.map((r) => r.showSwf));
  const byId = new Map(enemyRows.map((r) => [r.enemyId, r]));
  const has = (id) => byId.has(id);
  const byName = new Map();
  for (const r of [...enemyRows].sort((a, b) => a.enemyId - b.enemyId)) {
    const n = String(r.name || '').toLowerCase();
    if (!byName.has(n)) byName.set(n, r);
  }
  const out = { rows: [], sources: {}, uncovered: [], cloned: 0, fromStats: 0, family: 0, allies: 0 };
  // byId cresce con le righe aggiunte: le basi delle proposte restano gli originali (out.sources li esclude)
  const add = (row, source) => { out.rows.push(row); out.sources[row.enemyId] = source; byId.set(row.enemyId, row); };
  const ids = Object.keys(missing).map((k) => {
    const id = Number(k);
    if (!Number.isInteger(id) || id <= 0 || id > MAX_ID) throw new Error(`enemy-oltre: enemyId ${k} fuori dall'int a 32 bit`);
    return id;
  }).filter((id) => !byId.has(id));
  // alleati ospiti prima di tutto: mai cloni esatti ne' proposte (I-199)
  const allies = src.allies || readAllies();
  const tplOf = (a) => (a && a.template ? byId.get(a.template) : null);
  for (const id of ids.filter((x) => tplOf(allies[familyOf(x)]))) {
    const fam = familyOf(id), a = allies[fam], t = tplOf(a);
    const row = Object.assign(copy(t), { enemyId: id, name: a.name });
    const g = allyDisplay(fam, a, drawn);
    if (g) row.displayId = g.displayId;
    add(row, { kind: 'ally', name: a.name, template: a.template, displayId: row.displayId,
      graphic: g ? g.graphic : 'template', familyDisplay: fam, confidence: a.confidence });
    out.allies++;
  }
  ids.splice(0, ids.length, ...ids.filter((id) => !out.sources[id]));
  // prima le righe originali come base, poi le corte nuove, poi gli id lunghi (che possono riusare le corte nuove)
  const long = ids.filter(isClone).sort((a, b) => a - b), short = ids.filter((id) => !isClone(id)).sort((a, b) => a - b);
  const pending = [];
  for (const id of long) {
    const b = baseOf(id, has);
    if (b === null) { pending.push(id); continue; }
    add(Object.assign(copy(byId.get(b)), { enemyId: id }), { kind: 'exact-clone', base: b });
    out.cloned++;
  }
  const family = (id) => {
    const key = String(id), s = stats[key], p = proposal[key];
    if (s && s.name && Array.isArray(s.hp) && Array.isArray(s.attack)) {
      const tpl = byName.get(s.name.toLowerCase()) || byId.get(SHADOW) || enemyRows[0];
      const row = Object.assign(copy(tpl), { enemyId: id, name: s.name, hp: [...s.hp], attack: [...s.attack] });
      if (s.displayId) row.displayId = s.displayId;
      out.fromStats++;
      return add(row, { kind: 'stats', base: tpl.enemyId, source: s.source || null });
    }
    // id lungo di una famiglia gia' clonata: riusa il clone della base a 5 (o 4) cifre
    const via = isClone(id) ? baseOf(id, (x) => out.sources[x] && out.sources[x].kind !== 'exact-clone') : null;
    if (via !== null) {
      const v = out.sources[via];
      out.family++;
      return add(Object.assign(copy(byId.get(via)), { enemyId: id }),
        { kind: 'family-clone', confidence: v.confidence, base: v.base, via });
    }
    // la base della proposta e' un nemico originale (mai una riga aggiunta qui)
    const b = p && !out.sources[p.base] ? byId.get(p.base) : null;
    if (!b) {
      return out.uncovered.push({ enemyId: id, name: (p && p.name) || missing[key].name || null, missions: missing[key].missions || [],
        base: p ? p.base : null });
    }
    const row = copy(b);
    row.enemyId = id;
    if (p.name) row.name = p.name;
    if (p.attribute) row.attribute = p.attribute;
    // grafica (decisione dell'utente del 21-10, Task 7: «se la grafica originale c'e', si usa»): displayId originale =
    // famiglia dell'id (nel master ogni riga di storia da 1000 in su ha displayId = famiglia: 1001-1006, 1020-1023,
    // 1501, 2001-2003...; JP 4.3.1 ha lwf/character/enemy/<famiglia>/ per tutte le 139 famiglie nuove) se servita, cioe'
    // completa in enemy_gen (make_jp_enemies.py: mai una texture o un'animazione obbligatoria assente, il client va in
    // crash); se no quella della base. Con la famiglia anche taglia, velocita' e comparsa del dettaglio JP se c'e'
    // (la comparsa solo con l'effetto servito); con la base i suoi campi, che vanno col suo modello
    // Senza la grafica della famiglia: aspetto Dark Road della stessa specie (DR_LOOK) se servito, con taglia e comparsa
    // del dettaglio JP della famiglia (misure della creatura vera)
    const fam = familyOf(id);
    const own = fam < 5000 && drawn.has(fam);
    const look = src.drLook || DR_LOOK;
    const dr = !own && look[fam] && drawn.has(look[fam].displayId) ? look[fam] : null;
    const det = own || dr ? details[String(fam)] : null;
    if (own) row.displayId = fam;
    else if (dr) row.displayId = dr.displayId;
    if (det) {
      for (const [k, f] of Object.entries(DETAIL_SIZE)) if (Number.isFinite(det[k])) row[f] = det[k];
      if (shows.has(det.show_swf)) for (const [k, f] of Object.entries(DETAIL_SHOW)) if (Number.isFinite(det[k])) row[f] = det[k];
    }
    out.family++;
    return add(row, { kind: 'family-clone', confidence: p.confidence, base: p.base, name: row.name, displayId: row.displayId,
      graphic: own ? 'family' : dr ? 'dark-road' : 'base', ...(own ? {} : { familyDisplay: fam }),
      ...(dr ? { drConfidence: dr.confidence } : {}), detail: !!det, reason: p.reason });
  };
  for (const id of short) family(id);
  for (const id of pending) family(id);
  return out;
}

const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } };
function readRequired(p, what) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { throw new Error(`enemy-oltre: fonte obbligatoria ${what} ${p}: ${e.message}`); }
}

// fonti: elenco dei mancanti e proposta di clone obbligatori (errore col percorso); statistiche vere facoltative.
// I nomi degli id solo JP (oltre525.json learned_enemy_names) servono solo all'elenco degli scoperti
function defaultSources() {
  const missing = readRequired(MISSING_PATH, 'elenco').missing;
  if (!missing) throw new Error(`enemy-oltre: ${MISSING_PATH} senza «missing»`);
  const names = readJson(path.join(path.dirname(MISSING_PATH), 'oltre525.json'), {}).learned_enemy_names || {};
  for (const [k, v] of Object.entries(missing)) if (!v.name && names[k]) v.name = names[k];
  return { missing, proposal: readRequired(PROPOSAL_PATH, 'proposta di clone'), stats: readJson(STATS_PATH, {}) };
}

// righe di un giro precedente (gli id dell'elenco non sono mai nel master originale): via, si rigenerano
function strip(enemies, missing) {
  const ids = new Set(Object.keys(missing).map(Number));
  const kept = enemies.filter((e) => !ids.has(e.enemyId));
  const n = enemies.length - kept.length;
  enemies.splice(0, enemies.length, ...kept);
  return n;
}

// in memoria (make-game-tables.js): src = {missing, proposal, stats, drawn, sourcesOut?} oppure dalle fonti
function addRows(enemies, src) {
  const s = src || { ...defaultSources(), drawn: drawnDisplays(), sourcesOut: SOURCES_PATH };
  if (!s.details) s.details = readDetails();
  strip(enemies, s.missing);
  const res = enemyRowsFor(s.missing, enemies, s);
  enemies.push(...res.rows);
  // righe alleate del master (2001, 2002, 2003, 12001, 22001): nome del personaggio e grafica (I-199)
  const allies = s.allies || readAllies();
  let alliesBase = 0;
  for (const e of enemies) {
    const a = allies[familyOf(e.enemyId)];
    if (!a || res.sources[e.enemyId]) continue;
    e.name = a.name;
    const g = allyDisplay(familyOf(e.enemyId), a, s.drawn || new Set());
    if (g) e.displayId = g.displayId;
    alliesBase++;
  }
  if (s.sourcesOut) {
    fs.writeFileSync(s.sourcesOut, JSON.stringify({ _doc: 'fonte di ogni riga enemy delle missioni 526-979 (make-enemy-oltre.js): '
      + 'exact-clone = base a 5/4 cifre; family-clone(confidence) = nemico originale piu\' simile (Notices); uncovered = fuori',
    sources: res.sources, uncovered: res.uncovered }, null, 1));
    const g = Object.values(res.sources).filter((v) => v.kind === 'family-clone' && !v.via);
    console.log(`enemy-oltre: grafica della famiglia ${g.filter((v) => v.graphic === 'family').length}, Dark Road `
      + `${g.filter((v) => v.graphic === 'dark-road').length}, della base ${g.filter((v) => v.graphic === 'base').length} `
      + '(cloni di famiglia diretti; i lunghi «via» copiano la loro corta)');
  }
  console.log(`enemy-oltre: +${res.rows.length} righe (${res.cloned} cloni esatti, ${res.family} cloni di famiglia, `
    + `${res.allies} alleati, ${res.fromStats} da fonte); ${res.uncovered.length} senza base, fuori; alleati del master ${alliesBase}`);
  return { added: res.rows.length, cloned: res.cloned, family: res.family, allies: res.allies, alliesBase,
    fromStats: res.fromStats, sources: res.sources, uncovered: res.uncovered };
}

// master gia' costruito: le basi hanno gia' il displayId servito; idempotente
function patch(masterDir, src) {
  const file = path.join(masterDir, 'enemy.json');
  const enemies = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rep = addRows(enemies, src);
  fs.writeFileSync(file, JSON.stringify(enemies));
  return rep;
}

if (require.main === module) {
  const d = defaultSources();
  patch(process.argv[2] || path.join(__dirname, 'master_data'), { ...d, drawn: drawnDisplays(), sourcesOut: process.argv[3] || SOURCES_PATH });
}

module.exports = { MAX_ID, SOURCES_PATH, DR_LOOK, ALLY_PATH, readAllies, isClone, baseOf, familyOf, drawnDisplays, readDetails, enemyRowsFor, defaultSources, strip, addRows,
  patch };
