#!/usr/bin/env node
// Genera in server/master_data/ le tabelle `medal` e `player`, che la 5.0.1 offline
// non ha piu' (vedi HANDOFF, «La prima battaglia»).
//
// medal: una riga per medaglia del file dei valori (es. D:\Progetto_Restauro_KH_UX\
//   wiki\medals.json, fuori dal repository: sono dati di gioco presi da khuxwiki).
//   Dal file vengono nome, attributo, verso, STR/DEF minimi e massimi del rango 1★,
//   attacco speciale (burstId della tabella burst). Gli altri campi dello schema
//   (recon/out/master_types_ww431.json) hanno valori nostri, scelti per il rango 1★:
//   costo 1, livello massimo 10 (khuxwiki, «Stats»), immagini = medalId
//   (img/medal/Medal_L_%d.png). Il significato di type, growthType ed expType non e'
//   ricavato: valgono 1.
// player: livelli 1..99 con HP, AP e costo segnaposto (KHUX_PLAYER_HP, default 3000):
//   la tabella vera non e' stata trovata.
//
//   node server/make-game-tables.js <valori medaglie.json>

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'recon', 'out', 'master_types_ww431.json'), 'utf8'));
const src = process.argv[2];
if (!src) {
  console.error('uso: node server/make-game-tables.js <valori medaglie.json>');
  process.exit(1);
}
const values = JSON.parse(fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, ''));

function blank(table) {
  const row = {};
  for (const [f, t] of schema[table]) {
    const arr = /\[(\d+)\]$/.exec(t);
    row[f] = arr ? [] : t.startsWith('string') ? '' : 0;
  }
  return row;
}

// Tabelle vere di una versione precedente, se disponibili: righe binarie di
// thethiny/KHUx-Server (data/<tabella>_raw.json), decodificate con
// recon/tools/raw_master.py (player, reward) o raw_master_old.py (stage, enemy, medal) in
// <tabella>_dec.json. Fuori dal repository.
const REAL_DIR = process.env.KHUX_REAL_MASTER_DIR || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny';
const realTable = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(REAL_DIR, name + '_dec.json'), 'utf8')); } catch { return null; }
};
// solo i campi dello schema 4.3.1 (le righe decodificate hanno anche unk_<offset>)
const fromReal = (table, r) => {
  const row = blank(table);
  for (const k of Object.keys(row)) if (r[k] !== undefined) row[k] = r[k];
  return row;
};

const medals = values.medals.map((m, i) => Object.assign(blank('medal'), {
  medalId: m.medalId,
  // imageId nel file dei valori: grafica sostitutiva per le medaglie senza immagine nelle
  // risorse (img/medal/Medal_L_<id>.png c'e' solo per 22 medaglie)
  imageId: m.imageId || m.medalId, thumbId: m.imageId || m.medalId, cutinId: m.imageId || m.medalId,
  artId: m.imageId || m.medalId, displayId: m.imageId || m.medalId,
  sortId: m.no, listSortId: m.no,
  name: m.name, flavor: m.flavor || '', advantage: m.advantage || '',
  type: 1,
  attribute: m.attribute,
  darklight: m.upright ? 1 : 2,
  rare: 1, skillSlot: 1,
  maxLv: 10, expType: 1, growthType: 1,
  cost: 1, minCost: 1,
  attack: m.attack, maxAttack: m.maxAttack,
  defense: m.defense, maxDefense: m.maxDefense,
  // medaglie EXP ed evoluzione (es. Dewey ★): nessun attacco speciale
  validBurst: m.burstId ? 1 : 0, burstId: m.burstId || 0,
  burstEnhanceCategory: [0, 0],
  groupId: 0, // nessun gruppo (con medalId: riga cercata e assente)
  sell: 10, materialExp: 10,
}));

// Medaglie vere (522, compresa la 1), al posto dei valori della wiki; le medaglie del file
// dei valori che mancano restano. Solo 21 medaglie hanno grafica nelle risorse servite
// (img/medal/Medal_L_<id>.png, indice delle risorse versione 4): le altre prendono quella
// di una medaglia dello stesso attributo (1 Power, 2 Speed, 3 Magic), o di Dewey ★.
const MEDAL_IMAGES = new Set([11012, 11021, 11031, 11041, 11052, 12011, 12022, 12031, 12041, 12051,
  13011, 13021, 13031, 13032, 13041, 13051, 33023, 33043, 90011, 90031, 90041]);
const IMAGE_BY_ATTRIBUTE = { 1: 11021, 2: 12011, 3: 13021 };
// grafica vera da Roboloid/khux (recon/tools/fetch_medal_images.py, pacchetto medal_gen):
// medalId -> id Roboloid; queste medaglie usano la propria immagine
const MEDAL_MAP_PATH = process.env.KHUX_MEDAL_MAP || 'D:\\Progetto_Restauro_KH_UX\\medal_gen\\medal_map.json';
if (fs.existsSync(MEDAL_MAP_PATH)) {
  for (const id of Object.keys(JSON.parse(fs.readFileSync(MEDAL_MAP_PATH, 'utf8')))) MEDAL_IMAGES.add(Number(id));
}
// Tier (SP Attack Bonus, «SAB Tier» della khuxwiki) = guiltValue: il dettaglio carica
// img/ui/guilt/MedalInfo_Guilt<guiltValue>.png (0 = icona nascosta),
// le icone delle schermate keyblade Guilt<n>_On/_Off/_Err, il filtro
// Filter_Guilt1..10. Fonte: campo Guilt di Roboloid (1-10, uguale alla khuxwiki: SN++ - MoM
// Kairi = 10); le medaglie di supporto non ne hanno (0). Le righe di thethiny (formato vecchio)
// hanno guiltValue 0: si prende quello della medaglia di Roboloid associata (medal_map.json).
const ROBO_DB = process.env.KHUX_ROBOLOID_DB || 'D:\\Progetto_Restauro_KH_UX\\external\\roboloid\\medal_db.json';
const ROBO = fs.existsSync(ROBO_DB) ? JSON.parse(fs.readFileSync(ROBO_DB, 'utf8')) : [];
const ROBO_BY_ID = new Map(ROBO.map((d) => [d.ID, d]));
const MEDAL_MAP = fs.existsSync(MEDAL_MAP_PATH) ? JSON.parse(fs.readFileSync(MEDAL_MAP_PATH, 'utf8')) : {};
// Organizzazione XIII: medal_map.json associa le 6★ SE (e le copie 1xxxxx) alle «X [+]» di Roboloid
// (Tier 8, deal di aprile 2018 - marzo 2019), ma le righe SE sono le «X A» 6★ (Tier 3, banner
// 2016-2017): verifica in D:\Progetto_Restauro_KH_UX\tmp\sp2b\g4\medal_mapping_audit.md. Con l'id
// giusto Tier, buff e set «mapped» (sotto) cambiano: sparisce il doppione 6★ «X A» 3004xx e nasce la
// 6★ [+] propria (301xxx, Tier 8, Evolve verso la 7★ [+])
const MEDAL_MAP_FIX = {
  31176: 443, 131176: 443, 31196: 483, 131196: 483, 31206: 486, 131206: 486, 31226: 638, // Lexaeus, Xaldin, Saïx, Xemnas
  32186: 446, 132186: 446, 32196: 449, 132196: 449, 32216: 489, 132216: 489, 32236: 641, // Marluxia, Larxene, Xigbar, Axel
  33176: 452, 133176: 452, 33186: 455, 133186: 455, 33206: 492, 133206: 492, // Vexen, Zexion, Demyx
  33216: 495, 133216: 495, 33236: 644, // Luxord, Roxas
};
Object.assign(MEDAL_MAP, MEDAL_MAP_FIX);
// Evolve delle 6★ SE verso la 7★ «X A» (300000 + id Roboloid della 7★): le righe di thethiny non
// l'hanno; si applica dopo le righe di Roboloid, prima di blue-fairy.js (5 Blue Fairy LV 3)
const EVOLVE_FIX = {
  31176: 300444, 131176: 300444, 31196: 300484, 131196: 300484, 31206: 300487, 131206: 300487, 31226: 300639,
  32186: 300447, 132186: 300447, 32196: 300450, 132196: 300450, 32216: 300490, 132216: 300490, 32236: 300642,
  33176: 300453, 133176: 300453, 33186: 300456, 133186: 300456, 33206: 300493, 133206: 300493,
  33216: 300496, 133216: 300496, 33236: 300645,
};
// slot dei trait (khuxwiki, «Special Attack Bonus», Trait Slots): tier 1-3 -> 1, 4-5 -> 2,
// 6-8 -> 3 (9-10 non elencati: 3); Supernova (SN, SN+, SN++, Supernova, Supernova+) e Prime 7★
// -> 5, Prime 6★ -> 3; supporto (EXP, evoluzione) -> 0. Non le «7★» di Roboloid senza prefisso
// (561, es. Wakka: rarita' non affidabile). La tabella delle eccezioni della wiki (alcune 6★)
// non e' applicata.
const traitSlots = (tier, rare, name, support) => {
  if (support) return 0;
  if (/^(SN\+*|Supernova\+*) - /.test(name || '')) return 5;
  if (/^Prime - /.test(name || '')) return rare >= 7 ? 5 : 3;
  return tier >= 6 ? 3 : tier >= 4 ? 2 : 1;
};
let tiersFromRobo = 0;
const realMedals = realTable('medal');
if (realMedals) {
  const byId = new Map(medals.map((m) => [m.medalId, m]));
  for (const r of realMedals) {
    const img = MEDAL_IMAGES.has(r.imageId) ? r.imageId : IMAGE_BY_ATTRIBUTE[r.attribute] || 90041;
    const rd = ROBO_BY_ID.get(MEDAL_MAP[r.medalId]);
    const tier = rd ? rd.Guilt || 0 : r.guiltValue || 0;
    if (rd && tier !== (r.guiltValue || 0)) tiersFromRobo++;
    byId.set(r.medalId, Object.assign(fromReal('medal', r), {
      guiltValue: tier,
      imageId: img, thumbId: img, cutinId: img, artId: img, displayId: img,
      listSortId: r.sortId, burstEnhanceCategory: [0, 0], groupId: 0,
      // unk_1116 (tra advantage e type nel formato vecchio) vale 1 esattamente sulle medaglie
      // di supporto (EXP, evoluzione): e' validPack, le medaglie che si impilano in una cella
      // con il numero di copie (badge rosso Minfo_Eco_Panel negli screenshot originali)
      validPack: r.unk_1116 ? 1 : 0,
      // slot dei trait (Moogle Shop, fusione): il formato vecchio non li ha; dal tier (sopra)
      shuffleskillSlot: traitSlots(tier, r.rare, r.name, r.unk_1116),
      // slot del trait speciale (khwiki: «Each Medal also has one Special Trait Slot»). La
      // griglia del popup «Select Medal» vela e disattiva
      // le medaglie con spShuffleskillSlot 0 e quelle di supporto (tipo 9/10)
      spShuffleskillSlot: r.unk_1116 ? 0 : 1,
    }));
  }
  medals.splice(0, medals.length, ...byId.values());
}

// Medaglie di Roboloid/khux (src/search.js, 2.100 righe con evoluzioni) che il master non ha:
// medalId = 300000 + id Roboloid. Ogni riga copia una medaglia vera con le stesse stelle e
// lo stesso attributo e ne cambia nome, verso, STR/DEF (valori al livello massimo:
// attack/maxAttack uguali), evoluzione (catena Reference) e attacco speciale (riga burst
// nuova: nome, gauge, bersaglio, potenza = moltiplicatore x 10000). Immagini:
// fetch_medal_images.py con --all. Si attivano con KHUX_MEDALS_ALL=1.
const newBursts = [];
let roboAdded = 0;
if (process.env.KHUX_MEDALS_ALL === '1' && ROBO.length) {
  const robo = ROBO;
  // id Roboloid gia' associati a una medaglia del master (le chiavi 300000+ sono le aggiunte)
  // (MEDAL_MAP, con le correzioni di MEDAL_MAP_FIX)
  const mapped = new Set(Object.entries(MEDAL_MAP).filter(([k]) => Number(k) < 300000).map(([, v]) => v));
  const ATTR = { Power: 1, Speed: 2, Magic: 3 };
  const tpl = (rare, attr) => medals.find((m) => m.rare === rare && m.attribute === attr && m.validBurst)
    || medals.find((m) => m.rare === Math.min(rare, 6) && m.validBurst) || medals.find((m) => m.validBurst);
  const robo2id = (rid) => 300000 + rid;
  for (const d of robo) {
    if (mapped.has(d.ID) || !ATTR[d.Attribute]) continue;
    const base = tpl(d.Rarity, ATTR[d.Attribute]);
    if (!base) continue;
    const id = robo2id(d.ID);
    const chain = d.Reference || [];
    const next = chain[chain.indexOf(d.ID) + 1];
    const burstId = 3000000 + d.ID;
    const ab = d.Ability || {};
    newBursts.push(Object.assign({ _tpl: base.burstId }, {
      burstId, name: ab.Name || 'Special Attack', description: ab.Text || '',
      gauge: d.Gauge || 1, target: /single/i.test(d.Target || '') ? 1 : 2,
      // speciali a danno variabile: il valore singolo e' il minimo LowMulti (il massimo lo mette variable-power.js)
      basePower: Math.round((d.Multi || d.LowMulti || 1) * 10000), maxEnhanceCount: 0,
    }));
    medals.push(Object.assign({}, base, {
      medalId: id, imageId: id, thumbId: id, cutinId: id, artId: id, displayId: id,
      sortId: d.AlbumNum, listSortId: d.AlbumNum, name: d.Name, flavor: ab.Text || '',
      attribute: ATTR[d.Attribute], darklight: d.Direction === 'Reversed' ? 2 : 1, rare: d.Rarity,
      // STR/DEF assenti su Roboloid per alcune medaglie (supporto): quelli del modello
      attack: d.STR ?? base.attack, maxAttack: d.STR ?? base.maxAttack, defense: d.DEF ?? base.defense,
      maxDefense: d.DEF ?? base.maxDefense,
      guiltValue: d.Guilt || 0, validBurst: 1, burstId,
      validEvolve: next ? 1 : 0, evolveId: next ? robo2id(next) : 0,
      validPack: 0, shuffleskillSlot: traitSlots(d.Guilt || 0, d.Rarity, d.Name, false), spShuffleskillSlot: 1,
    }));
    roboAdded++;
  }
}
// Evolve 6★ SE -> 7★ «X A» dell'Organizzazione XIII (EVOLVE_FIX, sopra), solo se la 7★ c'e'
let orgEvolve = 0;
for (const m of medals) {
  const to = EVOLVE_FIX[m.medalId];
  if (!to || !medals.some((x) => x.medalId === to)) continue;
  Object.assign(m, { validEvolve: 1, evolveId: to });
  orgEvolve++;
}
// nome «X A» sulle 5★ e 6★ SE: il master di thethiny (2017) le chiama solo «Lexaeus», nel 4.3.1 sono
// «Lexaeus A» dall'uscita delle «B»; il nome si prende dalla 7★ «X A» di arrivo dell'Evolve
const orgName = new Map(Object.entries(EVOLVE_FIX).map(([id, to]) => [Number(id) % 100000, medals.find((x) => x.medalId === to)?.name]));
for (const m of medals) {
  const name = m.medalId < 200000 && (orgName.get(m.medalId % 100000) || orgName.get(m.medalId % 100000 + 1));
  if (name && name.replace(/ A$/, '') === m.name) m.name = name;
}
// «Illustrated Sora A»/«Riku A» 6★ (41036, 42036): stesso suffisso delle 7★ (medal-name-fix.js)
const nameFixed = require('./medal-name-fix').applyNameFix(medals);

// Level Up con medaglie speciali (I-079/I-080, server/medal-guilt.js, docs/notes/guilt.md): le due
// medaglie di Roboloid senza attributo che il ciclo sopra scarta, Magic Broom (300948, materiale
// di Evolve) e Fantasia Mickey B (300913, type 8 = Mickey & Brooms, +1 pallino); Fantasia Mickey A
// (90085) diventa evolvibile con 5 Magic Broom. Solo con KHUX_MEDALS_ALL=1 (immagini --all).
const guilt = require('./medal-guilt');
let guiltExtra = 0;
if (process.env.KHUX_MEDALS_ALL === '1' && medals.some((m) => m.medalId === 90085) && medals.some((m) => m.medalId === 90156)) {
  const extra = guilt.extraMedalRows(medals);
  medals.push(...extra.rows);
  Object.assign(medals.find((m) => m.medalId === 90085), extra.mickeyAPatch);
  guiltExtra = extra.rows.length;
}
// Supernova (supernova.js): Dual Meow Wow [SAB LV 7/8/9] e Evolve verso SN/SN+/SN++ con le medaglie
// richieste della khuxwiki (5 copie della stessa 7★, o 5 Dual Meow Wow)
const supernova = require('./supernova');
let snEvolve = { applied: 0, missing: 0 };
let meowAdded = 0;
if (process.env.KHUX_MEDALS_ALL === '1') {
  const meow = supernova.meowRows(medals, guilt.BROOM_ID);
  medals.push(...meow);
  meowAdded = meow.length;
  try {
    const wiki = JSON.parse(fs.readFileSync(process.env.KHUX_WIKI_ALL || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json', 'utf8'));
    snEvolve = supernova.applyEvolveRules(medals, supernova.evolveRules(wiki), ROBO);
  } catch { console.warn('wiki_all.json assente: Evolve delle Supernova senza medaglie richieste'); }
}
// Evolve 6★ -> 7★ con 5 Blue Fairy dello stesso tier (blue-fairy.js)
const blueFairy = require('./blue-fairy');
let fairyAdded = 0, fairyEvolve = 0;
if (process.env.KHUX_MEDALS_ALL === '1') {
  const fairies = blueFairy.blueFairyRows(medals, guilt.BROOM_ID);
  medals.push(...fairies);
  fairyAdded = fairies.length;
  fairyEvolve = blueFairy.applyBlueFairyEvolve(medals);
}
// Evolve with the required medals of the khuxwiki (I-205, evolve-wiki.js): Fantasia Mickey B upgrades (SN++),
// {{Evo}} combinations and copies, only on rows that already evolve; original SE materials stay
let wikiEvolve = { changes: [], report: [] };
if (process.env.KHUX_MEDALS_ALL === '1') {
  try {
    const wiki = JSON.parse(fs.readFileSync(process.env.KHUX_WIKI_ALL || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json', 'utf8'));
    wikiEvolve = require('./evolve-wiki').applyWikiEvolve(medals, wiki);
  } catch { console.warn('wiki_all.json missing: Evolve without the khuxwiki required medals (I-205)'); }
}
// BGM Medals (medal_bgm.json): bgm = id del suono audio/<id>.akb, suonato nel dettaglio
// della medaglia; stesso nome = righe 6★ e 7★. Nomi della wiki «(EX)» = «[EX]» del master.
const MEDAL_BGM = JSON.parse(fs.readFileSync(path.join(__dirname, 'medal_bgm.json'), 'utf8')).medals;
const bgmKey = (s) => String(s).toLowerCase().replace(/\(ex(\+?)\)/, '[ex$1]').replace(/[^a-z0-9[\]+&]/g, '');
const bgmByName = new Map(Object.entries(MEDAL_BGM).map(([n, id]) => [bgmKey(n), id]));
// Supernova (SN/SN+/SN++ - X, Supernova - X): il brano della medaglia base X (decisione dell'utente 16-10; nell'originale
// e' documentata solo Supernova - Sephiroth)
let bgmRows = 0;
for (const m of medals) {
  const base = String(m.name).replace(/^(SN\+{0,2}|Supernova) - /, '');
  const id = bgmByName.get(bgmKey(m.name)) || bgmByName.get(bgmKey(base)) || bgmByName.get(bgmKey(base.replace(/ A$/, '')));
  if (id) { m.bgm = id; bgmRows++; }
}
// Cid: khuxwiki «max 20 riduzioni dalla 2.0.0»: le 6★/7★ d'attacco con cost - minCost = 10
// scendono di 20 (Cid 10 x2); upperCost di userMedal arriva fino a cost - minCost
for (const m of medals) if (m.type === 1 && m.rare >= 6 && m.cost - m.minCost === 10) m.minCost = m.cost - 20;
// Optimize del Level Up (I-090): il client sceglie i materiali solo tra le medaglie con
// autoEnhance != 0 e type 2/4/5 (maschera 0x34), poi le filtra per
// i parametri spuntati (materialExp, enhanceAttack/Defense/Cost/Guilt). Il formato vecchio non ha
// autoEnhance (tutte 0 = «No Medals» ovunque): vale 1 sulle medaglie di supporto impilabili
// (unk_1116 -> validPack) di quei tipi, cioe' Huey/Dewey/Louie e HDL (2), Chip/Dale/Magic Mirror
// (4), Cid/Cid 5/Cid 10 (5); restano fuori le Scrooge (type 2, unk_1116 0), come nell'originale
// (Reddit: Optimize non usa le Scrooge). Valori originali non disponibili: regola ricostruita.
for (const m of medals) m.autoEnhance = m.validPack && [2, 4, 5].includes(m.type) ? 1 : 0;

// Medaglia 1: il client, se non trova una medaglia, ripiega sulla medaglia 1;
// senza riga va in crash (es. «Begin» su una missione). Segnaposto:
// copia della prima medaglia del file dei valori, con medalId 1.
if (medals.length && !medals.some((m) => m.medalId === 1)) {
  medals.push(Object.assign({}, medals[0], { medalId: 1 }));
}
// La medaglia 1 («空き») e' la Stock Medal dell'originale: occupa gli slot vuoti del deck e
// gioca il turno (reference\empty_slot). Il 5.0.1 le da' l'immagine 90041, che e' Qui: 90000 =
// medaglia grigia col cuore di recon/tools/make_stock_medal.py (I-075).
const STOCK_IMAGE = 90000;
for (const m of medals) {
  if (m.medalId !== 1) continue;
  for (const k of ['imageId', 'thumbId', 'cutinId', 'artId', 'displayId']) m[k] = STOCK_IMAGE;
}

// 3000: oltre, l'HUD allunga l'arco dell'HP e carica texture (Avatar_Circle_01/06,
// Avatar_Side_0N) che non sono in nessun pacchetto: crash.
const hp = Number(process.env.KHUX_PLAYER_HP || 3000);

// enemy: alle righe della 5.0.1 (import-master.js, 12 nemici) si aggiungono i nemici veri
// che mancano (665; cinque livelli invece di sei, come gran parte delle righe 5.0.1).
// Molti non hanno grafica nelle risorse (HANDOFF, «Mappe generate»): conta solo per le
// mappe che li usano.
let enemies = null;
const enemyOltre = require('./make-enemy-oltre');
const realEnemies = realTable('enemy');
if (realEnemies) {
  enemies = JSON.parse(fs.readFileSync(path.join(OUT, 'enemy.json'), 'utf8'));
  const have = new Set(enemies.map((e) => e.enemyId));
  for (const r of realEnemies) if (!have.has(r.enemyId)) enemies.push(fromReal('enemy', r));
  // nemici degli stage JP delle missioni 526-979 (make-enemy-oltre.js): le righe di un giro precedente via, si
  // rigenerano sotto, dopo la scelta della grafica delle basi
  enemyOltre.strip(enemies, enemyOltre.defaultSources().missing);
}

// Grafica dei nemici: lwf/character/enemy/<displayId>/wait/ esiste solo per 6 nemici KHUX
// (1 Shadow, 6 Soldier, 8 Nosy Mole, 17 Armored Knight, 37 Dire Plant, 1020 Mega-Shadow)
// e per le serie di Dark Road (5001-5086, 7001-7005, 8001-8022, nomi non noti). Un nemico
// senza grafica fa andare in crash l'avvio della missione (missione 8, Large Body): gli si
// da' la grafica di un sostituto. Nome, statistiche, abilita' restano i suoi. Prima la
// tabella esplicita (sostituti somiglianti, da completare identificando le serie di Dark
// Road), poi per taglia. Il displayId originale resta in enemy_display_orig.json, cosi' la
// sostituzione si ricalcola quando arrivano grafiche nuove.
const DISPLAY_SUBSTITUTE = {
  // Yellow Opera: la grafica di Dark Road 5075 («TopOperaY») non ha l'animazione move e il campo
  // va in crash (missioni zoo); il Soldier come nella missione 7
  3: 6,
  7: 17, // Large Body -> Armored Knight (grande, a terra)
};
let displaysSubstituted = 0, showsSubstituted = 0, attacksAdded = 0, displaysDarkRoad = 0;
let displaysJp = 0, showsRestored = 0;
// grafiche originali recuperate (make_jp_enemies.py -> pacchetto statico enemy_gen,
// docs/notes/battaglia.md#nemici-jp): le cartelle lwf/character/enemy/<displayId>/ e gli effetti
// show_effect<N> di enemy_gen\files contano come serviti. Il pacchetto deve stare nella versione
// installata (build-resources.ps1 senza -NoEnemies); senza: KHUX_NO_ENEMY_GEN=1
const ENEMY_GEN = process.env.KHUX_NO_ENEMY_GEN ? null
  : path.join(process.env.KHUX_ENEMY_GEN || 'D:\\Progetto_Restauro_KH_UX\\enemy_gen\\files', 'lwf', 'character', 'enemy');
const enemyGenDir = (sub) => (ENEMY_GEN && fs.existsSync(path.join(ENEMY_GEN, sub)) ? fs.readdirSync(path.join(ENEMY_GEN, sub)) : []);
const drawnJp = new Set(enemyGenDir('').filter((n) => /^\d+$/.test(n) && fs.existsSync(path.join(ENEMY_GEN, n, 'wait', 'wait.lwf'))).map(Number));
const showsJp = new Set(enemyGenDir('show_effect_fla').map((n) => /^show_effect(\d+)$/.exec(n))
  .filter((m) => m && fs.existsSync(path.join(ENEMY_GEN, 'show_effect_fla', m[0], m[0] + '.lwf'))).map((m) => Number(m[1])));
const DR_MAP_PATH = path.join(ROOT, 'recon', 'tools', 'enemy_display_map.json');
const DR_MAP = process.env.KHUX_NO_DARKROAD || !fs.existsSync(DR_MAP_PATH) ? {} : JSON.parse(fs.readFileSync(DR_MAP_PATH, 'utf8'));
const namesFile = process.env.KHUX_RESOURCE_NAMES || 'D:\\Progetto_Restauro_KH_UX\\resource_data\\names_v4.tsv';
if (enemies && fs.existsSync(namesFile)) {
  // grafiche servite: nomi delle risorse + enemy_gen (make-enemy-oltre.js drawnDisplays, la usa anche lui)
  const drawn = enemyOltre.drawnDisplays(namesFile, drawnJp);
  const origPath = path.join(OUT, 'enemy_display_orig.json');
  const orig = fs.existsSync(origPath) ? JSON.parse(fs.readFileSync(origPath, 'utf8')) : {};
  for (const e of enemies) {
    if (!(e.enemyId in orig)) orig[e.enemyId] = e.displayId;
    const d = orig[e.enemyId];
    // solo la grafica dei nemici KHUX: le serie di Dark Road (5001+) hanno altre animazioni
    if (drawn.has(d) && d < 5000) { e.displayId = d; if (drawnJp.has(d)) displaysJp++; continue; }
    // grafica equivalente di Dark Road riconosciuta per nome (recon/tools/enemy_display_map.json,
    // confronto visivo; confidenza alta o media). Dark Road non ha l'animazione move: la
    // ricostruisce make_enemy_moves.py (copia di wait) nel pacchetto generato
    const dr = DR_MAP[e.name];
    if (dr && dr.confidence !== 'bassa' && drawn.has(dr.displayId)) { e.displayId = dr.displayId; displaysDarkRoad++; continue; }
    const sub = DISPLAY_SUBSTITUTE[d];
    e.displayId = sub && drawn.has(sub) ? sub : (e.height >= 200 ? 17 : 1);
    displaysSubstituted++;
  }
  fs.writeFileSync(origPath, JSON.stringify(orig));
  // nemici delle missioni 526-979 (make-enemy-oltre.js): cloni delle basi, ora col displayId servito, o grafica della
  // famiglia se servita; prima di abilita', comparsa e make-story-oltre.js (obiettivi «Defeat X»)
  enemyOltre.addRows(enemies, { ...enemyOltre.defaultSources(), drawn, sourcesOut: enemyOltre.SOURCES_PATH });
  // abilita' dei nemici: enemyAttack della 5.0.1 ha 13 righe, i nemici veri ne citano
  // centinaia (skillId). Le mancanti si copiano dagli attacchi veri: prima abilita' =
  // «Attack» (1), seconda = «Moderate Attack» (101), le altre «Powerful Attack» (601). I nemici
  // con 3 abilita' andavano in crash all'avvio della missione (missioni zoo singole)
  const attPath = path.join(OUT, 'enemyAttack.json');
  const attBasePath = path.join(OUT, 'enemyAttack_base.json');
  if (fs.existsSync(attPath)) {
    if (!fs.existsSync(attBasePath)) fs.copyFileSync(attPath, attBasePath);
    const atts = JSON.parse(fs.readFileSync(attBasePath, 'utf8'));
    const have = new Set(atts.map((a) => a.enemyAttackId));
    const tplAtt = (i) => atts.find((a) => a.enemyAttackId === [1, 101, 601][Math.min(i, 2)]) || atts[0];
    for (const e of enemies) {
      (e.skillId || []).forEach((sid, i) => {
        if (!sid || have.has(sid)) return;
        atts.push(Object.assign(JSON.parse(JSON.stringify(tplAtt(i))), { enemyAttackId: sid }));
        have.add(sid);
        attacksAdded++;
      });
    }
    // righe originali (stati alterati, potenza, buff) dai dati di thethiny: enemy-attack-fix.js
    const atkFix = require('./enemy-attack-fix');
    atkFix.applyEnemyAttacks(atts, atkFix.readOrig());
    fs.writeFileSync(attPath, JSON.stringify(atts));
  }
  // effetto di comparsa: lwf/character/enemy/show_effect_fla/show_effect<showSwf>/ (nelle
  // risorse 1-4, 100, 501-506, 1000). Se manca (es. 5, 8, 15, 103) il campo va in crash
  // all'avvio della missione (missioni zoo): quello dello Shadow (show, showSwf, frame)
  const shows = new Set();
  for (const line of fs.readFileSync(namesFile, 'utf8').split('\n')) {
    const m = /^lwf\/character\/enemy\/show_effect_fla\/show_effect(\d+)\//.exec(line);
    if (m) shows.add(Number(m[1]));
  }
  for (const n of showsJp) shows.add(n);
  const shadow = enemies.find((e) => e.enemyId === 80001);
  // enemy.json e' anche l'ingresso: le righe vere sostituite in una corsa precedente hanno gia' i
  // valori dello Shadow. Se l'effetto originale (riga vera) ora c'e' (enemy_gen), torna quello
  const SHOW_KEYS = ['show', 'showSwf', 'showFrame', 'hideFrame'];
  const realById = new Map((realEnemies || []).map((r) => [r.enemyId, r]));
  for (const e of enemies) {
    const r = realById.get(e.enemyId);
    if (r && shadow && e !== shadow && r.showSwf !== e.showSwf && shows.has(r.showSwf) &&
        SHOW_KEYS.every((k) => e[k] === shadow[k])) {
      for (const k of SHOW_KEYS) e[k] = r[k];
      showsRestored++;
    }
    if (!shows.has(e.showSwf) && shadow) {
      Object.assign(e, { show: shadow.show, showSwf: shadow.showSwf, showFrame: shadow.showFrame, hideFrame: shadow.hideFrame });
      showsSubstituted++;
    }
  }
} else if (enemies) {
  // senza i nomi delle risorse niente scelta della grafica: i cloni tengono il displayId della base
  enemyOltre.addRows(enemies, { ...enemyOltre.defaultSources(), drawn: new Set(), sourcesOut: enemyOltre.SOURCES_PATH });
}

const players = [];
const realPlayers = realTable('player');
if (realPlayers) {
  // livelli veri (soglie di Lux cumulative, AP, costo del deck, Lux medal, HP 3000-3530: le texture dell'arco
  // dell'HP oltre 3000, Avatar_Circle_01/06 e Avatar_Side_01-04, sono nel pacchetto dal 19-10, I-032).
  // rewardId a 0: le righe di premio dei livelli non sono nella nostra tabella reward.
  for (const r of realPlayers) players.push(Object.assign(blank('player'), r, { rewardId: 0 }));
  // anche il livello 0 (vedi sotto)
  players.unshift(Object.assign(blank('player'), players[0], { lv: 0, needExp: 0 }));
} else {
  // anche il livello 0: la barra dell'EXP dopo /stage/clear legge le righe
  // lv e lv+1 della tabella e va in crash se una manca.
  for (let lv = 0; lv <= 99; lv++) {
    players.push(Object.assign(blank('player'), {
      lv, needExp: Math.max(lv - 1, 0) * 100, luxMedal: 0, ap: 10 + lv, cost: 5 + lv, hp: hp + Math.max(lv - 1, 0) * 20, rewardId: 0,
    }));
  }
}

// reward: premi dei forzieri e dei nemici. Una riga ha fino a 4 premi (type/id/num/
// odds); il client tiene quelli il cui tipo compare, nella stessa posizione, in
// dropItemTypeIds di /stage/start (server.js). Tipi: 4 monete,
// 8 CP (Attack Prize: barra degli speciali), 9 HP; 5 = materiale (id della tabella
// material: nel forziere non funziona, resta vuoto; dal nemico e' il sacchetto argento).
// Le righe usate vengono dalle mappe (server/game_data/stage_poi.json, generato da
// recon/tools/stage_poi.py): per i forzieri la terza colonna del record, per i nemici
// la settima (di solito 1; il primo nemico di ogni mappa ne ha una sua, es. 80002, e
// senza riga il client va in crash). Contenuti e quantita' sono nostri, per riga del forziere:
// CHEST_PRIZES (KHUX_CHEST_TYPE/KHUX_CHEST_CP cambiano il premio predefinito).
const rewardRow = (rewardId, prizes) => Object.assign(blank('reward'), {
  rewardId, validReward: 1,
  display: prizes.map(() => 1), type: prizes.map((p) => p.type), id: prizes.map((p) => p.id || 0),
  assignSkillType: prizes.map(() => 0), assignSkillId: prizes.map(() => 0), assignSkillLv: prizes.map(() => 0),
  num: prizes.map((p) => p.num), odds: prizes.map(() => 10000),
});
const CHEST_DEFAULT = { type: Number(process.env.KHUX_CHEST_TYPE || 8), num: Number(process.env.KHUX_CHEST_CP || 10000) };
// Righe dei forzieri riconosciute confrontando le mappe con i tesori di khuxwiki
// (InfoQuestKHUX, {{TC|codice}}) nelle missioni 1-6: 81 = Attack Prize medio (a2), 80 =
// Attack Prize piccolo (a1, o barile «ba»), 90 = barile con HP (bh), 1 = barile vuoto (b;
// la 1 e' anche la riga predefinita dei nemici). Le quantita' sono nostre.
const CHEST_PRIZES = {
  81: CHEST_DEFAULT,              // a2
  80: { type: 8, num: Math.round(CHEST_DEFAULT.num / 2) }, // a1
  90: { type: 9, num: 500 },      // bh
  1: null,                        // b: vuoto
};
const ENEMY_PRIZE = {
  type: Number(process.env.KHUX_ENEMY_DROP_TYPE || 5),
  id: Number(process.env.KHUX_ENEMY_DROP_ITEM || 13), num: Number(process.env.KHUX_ENEMY_DROP_NUM || 1),
};
// KHUX_STAGE_POI_EXTRA: altri file nello stesso formato (separati da ';'), es. il POI degli stage
// originali importati (D:\Progetto_Restauro_KH_UX\stage_gen\orig_stages\stage_poi_orig.json, da
// recon/tools/stage_poi.py --dir): per ogni stage sostituiscono stage_poi.json, cosi' le righe reward
// dei loro nemici e forzieri esistono prima ancora di unire quel file a server/game_data (senza riga
// il client va in crash dopo /stage/start). Le righe in piu' non danno fastidio agli altri stage.
let poi = {};
try {
  poi = JSON.parse(fs.readFileSync(path.join(__dirname, 'game_data', 'stage_poi.json'), 'utf8'));
} catch {
  console.warn('stage_poi.json assente: solo le righe del Prologue');
  poi = { 1010: { chests: [{ uid: 18, reward: 81 }], enemies: [{ reward: 80001 }] } };
}
for (const extra of (process.env.KHUX_STAGE_POI_EXTRA || '').split(';').filter(Boolean)) {
  Object.assign(poi, JSON.parse(fs.readFileSync(extra, 'utf8')));
}
const chestRewards = new Set(Object.values(poi).flatMap((s) => s.chests.map((c) => c.reward)));
const enemyRewards = new Set([1, ...Object.values(poi).flatMap((s) => s.enemies.map((e) => e.reward))]);
const realRewards = new Map((realTable('reward') || []).map((r) => [r.rewardId, r]));
const rewards = [];
for (const id of [...new Set([...chestRewards, ...enemyRewards])].sort((a, b) => a - b)) {
  // posizione 0 il premio del nemico, posizione 1 quello del forziere (se la riga e'
  // di entrambi, come la 1): server.js manda a ciascuno il tipo nella sua posizione
  const prizes = [];
  if (enemyRewards.has(id)) prizes.push(ENEMY_PRIZE);
  // forzieri: la riga vera se c'e' ed e' valida (es. 80 = CP 15.000, 81 = CP 30.000,
  // 90 = HP 1.400; la 1 non e' valida: barile vuoto), con premi di tipo 4/8/9 soltanto
  const real = realRewards.get(id);
  const realChest = real && real.validReward > 0 && !enemyRewards.has(id)
    ? real.type.slice(0, real.validReward).map((t, i) => ({ type: t, id: real.id[i], num: real.num[i] }))
      .filter((p) => [4, 8, 9].includes(p.type))
    : null;
  if (chestRewards.has(id) && realChest && realChest.length) prizes.push(...realChest);
  else if (chestRewards.has(id) && CHEST_PRIZES[id] !== null) prizes.push(CHEST_PRIZES[id] || CHEST_DEFAULT);
  rewards.push(rewardRow(id, prizes));
}

// mypageBackground: sfondo della schermata principale. Il client cerca
// la riga del backgroundId di /mypage, o 150911 di default, e senza riga va
// in crash. La tabella non c'e' nella 5.0.1: una riga per ogni sfondo che ha grafica
// nelle risorse. La grafica si disegna SOLO dalle parti (validParts = quante, poi
// partsId/dataType/xPostion/yPostion/zSort): dataType 1 = lwf/home/<id>/<id>.png,
// 2 = lwf/home/<id>/<id>.lwf, 3 = img/home/<id>/<id>.plist. Con validParts 0 la home
// resta nera. Qui due parti: l'immagine di fondo (png, sotto) e l'animazione lwf
// (sopra: per 150911 l'acqua della fontana). Posizioni nostre (KHUX_BG_X/Y).
const bgX = Number(process.env.KHUX_BG_X || 0);
const bgY = Number(process.env.KHUX_BG_Y || 0);
const backgrounds = [150911, 2, 3, 4, 5, 6, 99].map((id, i) => Object.assign(blank('mypageBackground'), {
  id, backgroundId: id, sortId: i + 1,
  startTime: '2015-01-01 00:00:00', endTime: '2099-12-31 23:59:59',
  validParts: 2, partsId: [id, id], dataType: [1, 2],
  xPostion: [bgX, bgX], yPostion: [bgY, bgY], zSort: [0, 1],
}));

// burst: attacchi speciali. La 5.0.1 (e thethiny) ne ha 11 righe, mentre le medaglie ne
// citano 480 in piu': senza riga il dettaglio di una medaglia va in crash (Donald 6★,
// burst 10146). Le righe importate restano la base (burst_base.json, copiata la prima
// volta); per ogni burstId mancante (famiglia = burstId / 10, livello = burstId % 10):
// - se la famiglia ha una riga, la si clona: nome «+k» (k = livello - 1) e +300 di potenza
//   per livello (come 10141 -> 10142); dal +2 maxEnhanceCount = livello - 2 e
//   basePowerPerEnforce come 10363/10364 (+300, +900, ...);
// - altrimenti modello per attributo della medaglia (animazione ed effetto di una riga
//   esistente: 1 Power 10091, 2 Speed 10363, 3 Magic 10141) con nome, gauge, bersaglio,
//   descrizione e moltiplicatore a 6★ (dmg6) dalla pagina khuxwiki della medaglia
//   (InfoMedal), se c'e'; altrimenti nome «Special Attack» e i valori del modello.
const burstBasePath = path.join(OUT, 'burst_base.json');
if (!fs.existsSync(burstBasePath)) fs.copyFileSync(path.join(OUT, 'burst.json'), burstBasePath);
const bursts = JSON.parse(fs.readFileSync(burstBasePath, 'utf8'));
const burstById = new Map(bursts.map((b) => [b.burstId, b]));
const wikiInfo = new Map();
try {
  const wiki = JSON.parse(fs.readFileSync(process.env.KHUX_WIKI_ALL || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json', 'utf8'));
  for (const [title, text] of Object.entries(wiki)) {
    for (const m of text.matchAll(/\{\{InfoMedal([\s\S]*?)\n?\}\}/g)) {
      const f = Object.fromEntries([...m[1].matchAll(/\|(\w+)=([^|]*)/g)].map((x) => [x[1], x[2].trim()]));
      wikiInfo.set(f.name || title, f);
    }
  }
} catch { console.warn('wiki_all.json assente: attacchi speciali senza nomi'); }
const BURST_TEMPLATE = { 1: 10091, 2: 10363, 3: 10141 };
const tierPower = (b, p) => {
  const enh = Math.max(0, (b % 10) - 2);
  const per = [0, 1, 2, 3, 4].map((i) => (i < enh ? p + 300 * ((i + 1) * (i + 2) / 2) : 1));
  return { maxEnhanceCount: enh, displayPower: p, basePower: p, displayPowerPerEnforce: per, basePowerPerEnforce: per };
};
let burstsAdded = 0;
for (const m of medals) {
  const id = m.burstId;
  if (!m.validBurst || !id || burstById.has(id)) continue;
  const tier = id % 10;
  const kin = bursts.filter((b) => Math.floor(b.burstId / 10) === Math.floor(id / 10))
    .sort((a, b) => Math.abs(a.burstId - id) - Math.abs(b.burstId - id))[0];
  let row;
  if (kin) {
    const base = kin.name.replace(/ \+\d+$/, '');
    row = Object.assign({}, kin, { burstId: id, name: tier > 1 ? `${base} +${tier - 1}` : base },
      tierPower(id, kin.basePower + 300 * (tier - (kin.burstId % 10))));
  } else {
    const w = medals.filter((x) => x.burstId && Math.floor(x.burstId / 10) === Math.floor(id / 10))
      .map((x) => wikiInfo.get(x.name)).find(Boolean);
    const tpl = burstById.get(BURST_TEMPLATE[m.attribute] || 10141);
    const dmg6 = w && parseFloat(w.dmg6);
    const name = (w && w.spatk) || 'Special Attack';
    row = Object.assign({}, tpl, {
      burstId: id, motionId: tpl.motionId, effectId: tpl.effectId,
      name: tier > 1 ? `${name} +${tier - 1}` : name,
      description: (w && (w.spdesc6 || w.spdesc)) || tpl.description,
      gauge: (w && Number(w.gauge)) || tpl.gauge,
      target: w && /single/i.test(w.tar || '') ? 1 : tpl.target,
    }, tierPower(id, dmg6 ? Math.round(dmg6 * 10000) - 300 * (6 - tier) : tpl.basePower + 300 * (tier - 1)));
  }
  bursts.push(row);
  burstById.set(id, row);
  burstsAdded++;
}

// attacchi speciali delle medaglie di Roboloid: copia della riga del modello (animazioni,
// effetti) con nome, gauge, bersaglio e potenza propri
for (const nb of newBursts) {
  const { _tpl, ...own } = nb;
  const row = Object.assign({}, burstById.get(_tpl) || bursts[0], own);
  const at = bursts.findIndex((b) => b.burstId === own.burstId);   // gia' generata sopra: si sostituisce
  if (at >= 0) bursts[at] = row; else bursts.push(row);
}

// pallini dell'attacco speciale (userMedal.burstUpperNumber): le burst di Roboloid hanno
// maxEnhanceCount 0 e le 6★ di thethiny 4; khuxwiki per rarita' (3★ 1, 4★ 2, 5★ 3, 6★/7★ 5).
// Le potenze per pallino (basePowerPerEnforce/displayPowerPerEnforce, valori assoluti) si
// ricalcolano dalla potenza della riga come tierPower (+300, +900, ...): quelle copiate dal
// modello sono di un'altra medaglia (Roboloid: 68300 di base, 15000 per pallino).
const dotFix = guilt.burstDotFixes(medals, bursts);
for (const b of bursts) {
  const want = dotFix[b.burstId];
  if (want === undefined) continue;
  const per = (p) => [0, 1, 2, 3, 4].map((i) => (i < want ? p + 300 * ((i + 1) * (i + 2) / 2) : 1));
  Object.assign(b, { maxEnhanceCount: want, basePowerPerEnforce: per(b.basePower), displayPowerPerEnforce: per(b.displayPower) });
}

// buff/debuff degli speciali da Roboloid (burst-buffs.js, I-124); valori originali dalle righe
// burst di thethiny (data/burst.json, gia' in chiaro) dove la descrizione coincide
const ORIG_BURST = process.env.KHUX_ORIG_BURST || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\burst.json';
const origBursts = fs.existsSync(ORIG_BURST) ? new Map(JSON.parse(fs.readFileSync(ORIG_BURST, 'utf8')).map((b) => [b.burstId, b])) : new Map();
const buffStats = require('./burst-buffs').applyBurstBuffs(medals, bursts,
  (m) => ROBO_BY_ID.get(m.medalId >= 300000 ? m.medalId - 300000 : MEDAL_MAP[m.medalId]), origBursts);
// danno fisso (fixed-damage.js): Beast, KH II Yuffie, ... damageType 2 come le righe di thethiny
const fixedStats = require('./fixed-damage').applyFixedDamage(medals, bursts,
  (m) => ROBO_BY_ID.get(m.medalId >= 300000 ? m.medalId - 300000 : MEDAL_MAP[m.medalId]), origBursts);
console.log(`danno fisso: ${fixedStats.orig} righe da thethiny, ${fixedStats.robo} da Roboloid`);
// attacchi Supernova (supernova.js): una riga burst per medaglia SN, superBurstId sulla medaglia
const snBursts = supernova.supernovaBursts(medals, bursts, ROBO, require('./burst-buffs').buffFields);
bursts.push(...snBursts);
for (const b of snBursts) burstById.set(b.burstId, b);

// burst 0: le medaglie senza attacco speciale (supporto: Dewey, Fata Smemorina, validBurst 0)
// hanno burstId 0, e Optimize (valore di ogni medaglia posseduta per gli slot del
// keyblade) cerca la riga burst del burstId senza guardare validBurst: riga nulla, crash
// (banco 11 ottobre, Optimize su Treasure Trove). Riga vuota, tutti i campi a 0.
if (!burstById.has(0)) {
  const zero = (v) => (Array.isArray(v) ? v.map(zero) : typeof v === 'string' ? '' : 0);
  const row = Object.fromEntries(Object.entries(bursts[0]).map(([k, v]) => [k, zero(v)]));
  bursts.push(row);
  burstById.set(0, row);
}

// stage: i filmati prima/dopo la missione (beforeDramaId/afterDramaId) sono script
// img/light/SEQ/<id>.l o animazioni lwf/drama/<id>/. Se mancano dalle risorse il client va
// in crash avviando la missione (missione 8, filmati
// 1010201/1010301): si disattivano. Base intatta in stage_base.json (copiata al primo giro).
const stagePath = path.join(OUT, 'stage.json');
const stageBasePath = path.join(OUT, 'stage_base.json');
let stagesOut = null, dramasOff = 0, dramasTheater = 0, storyAdded = 0, submissionsFixed = 0;
const namesPath = process.env.KHUX_RESOURCE_NAMES || 'D:\\Progetto_Restauro_KH_UX\\resource_data\\names_v4.tsv';
if (fs.existsSync(stagePath) && fs.existsSync(namesPath)) {
  if (!fs.existsSync(stageBasePath)) fs.copyFileSync(stagePath, stageBasePath);
  const dramas = new Set();
  for (const line of fs.readFileSync(namesPath, 'utf8').split('\n')) {
    const m = /^(?:img\/light\/SEQ\/(\d+)\.l|lwf\/drama\/(\d+)\/)/.exec(line);
    if (m) dramas.add(Number(m[1] || m[2]));
  }
  stagesOut = JSON.parse(fs.readFileSync(stageBasePath, 'utf8'));
  // Missioni di storia di thethiny (stageBinId 1..525 = numero della missione) che la
  // 5.0.1 non ha. Campi assenti dal formato vecchio: id = numero, stageKind 1, gli altri
  // come le righe vere (hardmodeName strDummy, hardmodeComparison 1). Gli array a lunghezza
  // valida come nelle righe 5.0.1; stageBinId 0 come quelle. Mappe: gen_story_maps.py.
  const realStages = realTable('stage') || [];
  const have = new Set(stagesOut.map((s) => s.stageId));
  const theater = fs.existsSync(path.join(OUT, 'theater.json'))
    ? JSON.parse(fs.readFileSync(path.join(OUT, 'theater.json'), 'utf8')) : [];
  const maxMission = Number(process.env.KHUX_STORY_MAX || 525);
  for (const r of realStages) {
    if (!(r.stageBinId >= 1 && r.stageBinId <= maxMission) || r.stageId >= 100000 || have.has(r.stageId)) continue;
    const row = Object.assign(fromReal('stage', r), {
      id: r.stageBinId, stageBinId: 0, stageKind: 1, onlyDrama: 0, showIcon: 0, hideIcon: 0, noPartner: 0,
      validStopStage: 0, branchType: 0, disableContinue: 0, addLevel: 0, holdKeyblade: 0, hardmodeRequire: 0,
      hardmodeName: 'strDummy', hardmodeComparison: 1, hardmodeNum: 0, combinedSubmissionFlag: 0,
    });
    for (const [n, arrs] of [['validBeforeDrama', ['beforeDramaId', 'beforeDramaType']],
      ['validAfterDrama', ['afterDramaId', 'afterDramaType']]]) {
      for (const a of arrs) row[a] = (r[a] || []).slice(0, r[n]);
    }
    for (const a of ['clearGetItemType', 'clearGetItemId', 'clearGetAssignSkillType', 'clearGetAssignSkillId',
      'clearGetAssignSkillLv', 'clearGetItemNum']) row[a] = (r[a] || []).slice(0, r.validClearGetItem);
    // obiettivi «Defeat <nemico>» (submissionIdType 1) su nemici assenti dalla tabella enemy
    // (es. 99 nella 2170, 138 nella 2090): il client cerca la riga e va in crash.
    // Si ripuntano sullo Shadow (id 1) finche' quei nemici non si ricostruiscono
    if (enemies) {
      const known = new Set(enemies.map((e) => e.enemyId));
      row.submissionId = row.submissionId.map((id, i) => {
        if (row.submissionIdType[i] === 1 && id && !known.has(id)) { submissionsFixed++; return 1; }
        return id;
      });
    }
    stagesOut.push(row);
    storyAdded++;
  }
  // missioni «zoo» per provare i nemici (gen_story_maps.py, zoo_enemies): copie della 1050
  if (process.env.KHUX_ZOO === '1') {
    const tpl = stagesOut.find((s) => s.stageId === 1050);
    for (let n = 1; n <= Number(process.env.KHUX_ZOO_COUNT || 4); n++) {
      stagesOut.push(Object.assign(JSON.parse(JSON.stringify(tpl)), {
        stageId: 990000 + n, id: 9000 + n, name: `Zoo ${n}`, mapName: 'Fountain Square', worldId: 1,
        validBeforeDrama: 0, beforeDramaId: [], beforeDramaType: [], validAfterDrama: 0, afterDramaId: [],
        afterDramaType: [],
      }));
    }
  }
  // missioni «giro del mondo» (gen_story_maps.py, worldtour + recon/tools/world_links.json): una per
  // mondo con tutte le stanze del mondo nelle risorse collegate come nel grafo, stage 991000 + worldId.
  // Copie della 1050 (come le zoo); mondo, miniatura e musica dalla prima missione di storia del
  // mondo, se c'e'. Si avviano con save/smoke.json {"stageId": 99100N} (docs/notes/mappe_storia.md).
  if (process.env.KHUX_WORLDTOUR === '1') {
    const tpl = stagesOut.find((s) => s.stageId === 1050);
    const tours = [[1, 'Daybreak Town', 'Fountain Square'], [2, 'Dwarf Woodlands', 'Flower Glade'],
      [3, 'Wonderland', 'Fork in the Road'], [4, 'Agrabah', 'Bazaar'], [5, 'Olympus Coliseum', 'Coliseum Entrance'],
      [6, "Beast's Castle", 'Library: 1st Floor'], [7, 'Castle of Dreams', 'Path to the Chateau'],
      [8, 'Enchanted Dominion', 'Forest Depths']];
    for (const [w, name, mapName] of tours) {
      const ref = stagesOut.filter((s) => s.stageKind === 1 && s.worldId === w && s.stageId < 100000)
        .sort((a, b) => a.id - b.id)[0];
      const row = Object.assign(JSON.parse(JSON.stringify(tpl)), {
        stageId: 991000 + w, id: 9100 + w, name: `Tour ${name}`, mapName, useAp: 0,
        validBeforeDrama: 0, beforeDramaId: [], beforeDramaType: [], validAfterDrama: 0, afterDramaId: [],
        afterDramaType: [],
      });
      if (ref) {
        for (const k of ['worldId', 'thumbId', 'bgmField', 'bgmBattle', 'bgmBoss']) if (k in ref) row[k] = ref[k];
      }
      stagesOut.push(row);
    }
  }
  // tour v2 (I-116, recon/tools/gen_tours_v2.py, docs/notes/mappe_storia.md#tour-v2): un giro per zona sulle
  // porte originali dello schema dei mondi v2, stage 992000 + indice del mondo * 100 + zona. Righe dall'indice
  // tours.json del generatore: KHUX_TOURS_V2=1 (D:\Progetto_Restauro_KH_UX\stage_gen\tours_v2\tours.json) o
  // KHUX_TOURS_V2=<percorso>. Copie della 1050 come i tour 99100N; worldId dal tour (mondi di Ralph -> 1, non
  // sono nella tabella world), musica dalla prima missione del mondo; miniatura della stanza di partenza solo se
  // una missione della master ha lo stesso thumbId (immagine presente), altrimenti quella della prima missione.
  if (process.env.KHUX_TOURS_V2) {
    const p = process.env.KHUX_TOURS_V2 === '1'
      ? 'D:\\Progetto_Restauro_KH_UX\\stage_gen\\tours_v2\\tours.json' : process.env.KHUX_TOURS_V2;
    const tpl = stagesOut.find((s) => s.stageId === 1050);
    const index = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const t of index.tours) {
      if (have.has(t.stageId) || stagesOut.some((s) => s.stageId === t.stageId)) continue;
      const story = stagesOut.filter((s) => s.stageKind === 1 && s.worldId === t.worldId && s.stageId < 100000)
        .sort((a, b) => a.id - b.id);
      const ref = story[0];
      const row = Object.assign(JSON.parse(JSON.stringify(tpl)), {
        stageId: t.stageId, id: t.id, name: t.name, mapName: t.mapName, worldId: t.worldId, useAp: 0,
        validBeforeDrama: 0, beforeDramaId: [], beforeDramaType: [], validAfterDrama: 0, afterDramaId: [],
        afterDramaType: [],
      });
      if (ref) {
        for (const k of ['thumbId', 'bgmField', 'bgmBattle', 'bgmBoss']) if (k in ref) row[k] = ref[k];
      }
      if (story.some((s) => s.thumbId === t.thumbId)) row.thumbId = t.thumbId;
      stagesOut.push(row);
    }
  }
  // filmati: quelli assenti dalle risorse si cercano nel theater della versione finale
  // (righe con lo stesso stageId: i filmati della storia rifatti come lwf/drama/<id>)
  const theaterBy = new Map();
  for (const t of theater) {
    if (!t.validTheater || !t.stageId) continue;
    if (!theaterBy.has(t.stageId)) theaterBy.set(t.stageId, []);
    theaterBy.get(t.stageId).push(t);
  }
  for (const s of stagesOut) {
    for (const [flag, ids] of [['validBeforeDrama', 'beforeDramaId'], ['validAfterDrama', 'afterDramaId']]) {
      if (s[flag] && (s[ids] || []).some((id) => id && !dramas.has(id))) {
        // si tolgono solo gli id assenti: di solito i dialoghi (script SEQ 1xxxxxx), mentre i
        // filmati veri (lwf/drama 2xxxxxx, le missioni con la pellicola) ci sono quasi tutti
        const types = ids.replace('Id', 'Type');
        const keep = s[ids].map((id, i) => [id, (s[types] || [])[i] || 0]).filter(([id]) => id && dramas.has(id));
        const rows = flag === 'validBeforeDrama' && !keep.length
          ? (theaterBy.get(s.stageId) || []).filter((t) => t.dramaId.every((d) => dramas.has(d))) : [];
        if (keep.length) {
          s[ids] = keep.map((k) => k[0]);
          s[types] = keep.map((k) => k[1]);
          s[flag] = keep.length;
          dramasOff++;
        } else if (rows.length) {
          s[ids] = rows.flatMap((t) => t.dramaId);
          s[types] = rows.flatMap((t) => t.dramaType);
          s[flag] = s[ids].length;
          dramasTheater++;
        } else {
          s[flag] = 0;
          dramasOff++;
        }
      }
    }
  }
}

// tier solo sulle 6★/7★ e potenza degli speciali di Roboloid a pallini pieni (medal-power-fix.js)
const powerFix = require('./medal-power-fix');
const tiersOff = powerFix.tierFix(medals);
const powerStats = powerFix.burstPowerFix(bursts, { origBursts, medals,
  wikiInfo: powerFix.readWikiInfo(process.env.KHUX_WIKI_ALL || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json'),
  multiOf: (id) => ROBO_BY_ID.get(id)?.Multi || ROBO_BY_ID.get(id)?.LowMulti });
console.log(`medal-power-fix: tier tolto a ${tiersOff} medaglie sotto le 6★; burst ${JSON.stringify(powerStats)}`);
// speciali a danno variabile «x a - b»: tipo, sp1/sp2 e displayMaxPower da thethiny o da Low/HighMulti (variable-power.js, I-189)
const varPower = require('./variable-power');
console.log('variable-power:', varPower.summary(varPower.variablePower(bursts, { origBursts, robo: ROBO_BY_ID, medals })));
// animazioni originali degli speciali, colpi = testo (burst-anim-fix.js)
const animFix = require('./burst-anim-fix');
console.log('burst-anim-fix:', JSON.stringify(animFix.applyBurstAnim(bursts, animFix.readMapping(), { origBursts, texts: true })));

fs.mkdirSync(OUT, { recursive: true });
if (stagesOut) fs.writeFileSync(stagePath, JSON.stringify(stagesOut));
fs.writeFileSync(path.join(OUT, 'burst.json'), JSON.stringify(bursts));
fs.writeFileSync(path.join(OUT, 'mypageBackground.json'), JSON.stringify(backgrounds));
fs.writeFileSync(path.join(OUT, 'reward.json'), JSON.stringify(rewards));
fs.writeFileSync(path.join(OUT, 'medal.json'), JSON.stringify(medals));
fs.writeFileSync(path.join(OUT, 'player.json'), JSON.stringify(players));
// guiltProb (guilt della copia, «Special Attack Bonus»): intervalli della khuxwiki per tier, un
// valore ogni 1%, peso uniforme (medal-guilt.js guiltProbRows; prima vuota)
const guiltProb = guilt.guiltProbRows();
fs.writeFileSync(path.join(OUT, 'guiltProb.json'), JSON.stringify(guiltProb));
if (enemies) fs.writeFileSync(path.join(OUT, 'enemy.json'), JSON.stringify(enemies));
// Burst: medal 2, burst 11, shuffleskill 901/902 (make-guilt-burst.js)
require('./make-guilt-burst').patch(OUT);
// Pet: petRank, petSkill, medal.addPetPt (make-pet-tables.js)
require('./make-pet-tables').patch(OUT);
// Skill: tabella skill (25 vere di thethiny + le altre del wiki) e skillExp vera (make-skill-table.js, I-146)
require('./make-skill-table').patch(OUT);
// Base buff: addBase* della tabella burst dalle descrizioni «Medal STR/DEF ±N» (make-base-buff.js, I-155)
require('./make-base-buff').patch(OUT);
// Boosted: righe a parte del master medal (groupId = normale) dalle voci enhance.boosted del catalogo
// dei banner (make-boosted-medals.js); dopo supernova, blue-fairy, guilt-burst e pet, che non le vedono
const gachaCatalog = path.join(__dirname, 'game_data', 'gacha_catalog.json');
if (fs.existsSync(gachaCatalog)) require('./make-boosted-medals').patch(OUT, gachaCatalog);
// Nova: addGuiltBurstLv/Max 1/5 sulle righe (e boosted) che un preset «guilt: max» puo' consegnare (I-149)
if (fs.existsSync(gachaCatalog)) require('./make-nova-rows').patch(OUT, gachaCatalog);
// Trait dalla fusione (I-084 A): shuffleSkillGroupId per nome (dopo le boosted) e ruota sugli 11 trait originali
// (dopo make-pet-tables, che ha i Special Trait da cui si copiano le righe 14-17)
require('./make-trait-groups').patch(OUT);
// Trait Medal (I-084 parte B): righe type 9 9.000.000+N e legame del pallino sulle linee (make-trait-medals.js)
require('./make-trait-medals').patch(OUT);
// Livelli Lux 302-999 ricostruiti e misc 100 = 999 (make-lux-levels.js, richiesta dell'utente 19-10)
require('./make-lux-levels').patch(OUT);
// Login bonus (I-176): Daily 100/100/200/200/300 e Total della 1.1.3 (make-login-bonus.js)
require('./make-login-bonus').patch(OUT);
// Cut-in dello speciale (I-187): righe alias id-1 per le medaglie che finiscono in 2/4 senza la riga 1★/3★ (make-cutin-alias.js)
require('./make-cutin-alias').patch(OUT);
// Trofei di Bad Guy Breaker (I-009): material 61-63 Trophy NI/CS/CK, premi delle 880-915 qui sotto (make-trophy-materials.js)
require('./make-trophy-materials').patch(OUT);
// Missioni di storia 526-979 (I-009): 1.1.3 per 526-555, wiki + stage JP per le altre, 978 solo filmato (onlyDrama);
// dopo la tabella enemy (obiettivi «Defeat X») e stage.json scritti sopra. KHUX_STORY_OLTRE=0 lo spegne (make-story-oltre.js)
require('./make-story-oltre').patch(OUT);
// Proud Mode (I-200): righe stageKind 4 1 000 000 + stageId della storia 1-979, dopo la storia completa (make-proud.js);
// la 1001010 del 5.0.1 resta. KHUX_PROUD=0 lo spegne
require('./make-proud').patch(OUT);
// tabelle ricostruite da noi (server/tables: mission = missioni giornaliere/settimanali dalla
// khuxwiki, vedi le note in testa a ciascun generatore): copiate cosi' come sono
const TABLES = path.join(__dirname, 'tables');
for (const f of fs.existsSync(TABLES) ? fs.readdirSync(TABLES) : []) {
  if (f.endsWith('.json')) fs.copyFileSync(path.join(TABLES, f), path.join(OUT, f));
}
console.log(`medal: ${medals.length} righe (+${roboAdded} da Roboloid, ${tiersFromRobo} tier da Roboloid); player: ${players.length} livelli (HP lv1 = ${hp})` +
  (enemies ? `; enemy: ${enemies.length} righe (${displaysJp} con grafica originale di enemy_gen, ${displaysDarkRoad} con grafica di Dark Road, ${displaysSubstituted} con grafica sostitutiva, ${showsRestored} con effetto di comparsa originale ripristinato, ${showsSubstituted} con effetto di comparsa sostitutivo; enemyAttack +${attacksAdded})` : '') + `; burst: ${bursts.length} righe (+${burstsAdded}, ${buffStats.rows} con buff/debuff, ${buffStats.fromOrig} da thethiny, ${buffStats.conflicts} conflitti)` +
  `; supernova: ${snBursts.length} attacchi, +${meowAdded} Dual Meow Wow, ${snEvolve.applied} Evolve con medaglie richieste (${snEvolve.missing} regole senza medaglie); +${fairyAdded} Blue Fairy, ${fairyEvolve} Evolve 6★->7★ con Blue Fairy (${orgEvolve} dell'Organizzazione XIII verso la 7★ «X A»); ${wikiEvolve.changes.length} Evolve with khuxwiki required medals (I-205); bgm: ${bgmRows} righe` +
  `; guilt: +${guiltExtra} medaglie speciali, ${Object.keys(dotFix).length} burst con pallini corretti, guiltProb ${guiltProb.length} righe` +
  `; stage: +${storyAdded} missioni di storia (${submissionsFixed} obiettivi su nemici assenti), filmati: ${dramasTheater} dal theater, ${dramasOff} disattivati`);
