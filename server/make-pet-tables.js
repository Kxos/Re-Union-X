#!/usr/bin/env node
// SPDX-License-Identifier: CC-BY-SA-4.0
// The Special Trait list (names, unlock rates) and the Spirit Trick values below are derived from KH Wiki
// (khwiki.com, CC BY-SA 4.0) and KHUX Wiki (khuxwiki.com) pages; attribution: the KH Wiki and KHUX Wiki
// contributors. This file is therefore shared under CC BY-SA 4.0, not MIT (THIRD_PARTY_NOTICES.md).
// Tabelle master del pet («Spirit»), ricostruite: vedi server/pet.js e docs/notes/home_profilo.md#pet.
// Nessun dump delle tabelle originali (petRank e petSkill sono state tolte nella 5.0.1, le
// cartelle master_data_bak_r53 e apk501\extra_files le hanno vuote): valori NOSTRI, ricavati
// dagli screenshot e dalla khwiki (D:\Progetto_Restauro_KH_UX\reference\pet\NOTE.md).
//
// - petRank (rank, needPt, magnification, rankUpSkill, validOpenSkill, openSkillIds int[15]):
//   17 ranghi. needPt (punti cumulativi) e magnification dalla khuxwiki (Pet_System, «Slot Multiplier»):
//   magnification in decimillesimi come accord/partnerRate dei keyblade (10000 = x1.0): rango 1 x1.00, poi
//   22000 + 1000 x rango (Rank 5 = x2.700, Rank 16 = x3.800 come i dialog SPIRIT della build finale). Il client la legge dal
// petSubslot che manda il server e la somma al partnerRate del keyblade
// per la cella del 6° slot: l'unita' va confermata sul banco.
// - petSkill (skillId, thumbId, name, description, invokeDescription, invokeType, skillValue1-5):
//   i 22 «Tricks» della khuxwiki (Pet_System, sezione Tricks; wiki JP ペットシステム) con il rango che li apre,
//   name = nome EN, description = «Details», invokeDescription = «Conditions». Campi letti dal client 4.3.1 (ricerca
//   del 20-10, note private): invokeType = posto del pet in battaglia
//   (un solo trick per posto, vince il primo), skillValue1 = cariche per battaglia (<= 0 infinite). Posti: 1 Steal
//   (sv3 = moltiplicatore dei drop, lo applica il server, server.js), 3 Blast (sv2 = medaglia nascosta 3-7 il cui
//   attacco e' il colpo a danno fisso, sv3 = soglia di HP, sv4 = soglia in %), 5 Esuna (sv2 = maschera degli stati),
//   6 HP Recovery, 7/8/9 Poison/Sleep/Paralysis Boost (sv2 = valore), 10 Combo (sv2 = probabilita' /10000, sv3 = %
//   del danno /10000), invokeType 4 + sv3 1/2/3 = posti 11/12/13 P/S/M Attack Boost (sv2 = cariche per turno, sv4 =
//   livelli oltre il limite di ±20). openSkillIds di un rango = il livello piu' alto di
//   ogni linea, in ordine di apprendimento. RICOSTRUITI (Notices): soglia % del Blast, valori di Poison/Sleep Boost,
//   maschera di Esuna, cariche dei P/S/M Attack Boost, medaglie e burst del Blast.
// - medal.addPetPt (punti Spirit della medaglia, campo addPetPt della riga medal): dalla khuxwiki (vedi addPetPtFor).
//
// - shuffleskill type 2 = Special Trait («特別覚醒能力», trait dello Spirit Training, I-082): le 36
//   righe della tabella «Special Traits» della khwiki (pagina Medal, D:\Progetto_Restauro_KH_UX\
//   wiki\wiki_all.json; reference\pet\NOTE.md §10) con la «Unlock Rate» in centesimi di punto in
//   rate (somma 10000). Il client tiene come Special Trait della medaglia il primo trait
//   la cui riga ha type 2: e' il trait che mostrano il risultato del
//   training (Kakusei_Get1/2 e SpecialKakuseiSkill_Window) e la
//   finestra Special Trait del dettaglio fa la «roulette» di Kakusei_Get1 con le
//   righe dello stesso type e rate diverso da 0 (lista vuota = crash).
//   name e' un formato printf:
//   «%» raddoppiato. category = icona img/kakusei/Kakusei_Icon%04d.png e LWF
//   lwf/medal/Kakusei/Kakusei_Icon%04d (make_kakusei_lwf.py), come i trait del Moogle Shop.
//   Id 1001-1036 (1-13 Moogle Shop, 901/902 Burst). make-moogleshop.js riscrive shuffleskill.json:
//   rilanciare poi questo script (patch() le rimette, idempotente).
//
// Si applica da sola (idempotente) a server/master_data e scrive anche server/tables/petRank.json e
// petSkill.json (make-game-tables.js copia server/tables e chiama patch() in fondo, cosi' l'addPetPt
// sopravvive alla rigenerazione di medal.json). Dopo: alzare KHUX_REVISION.
//
//   node server/make-pet-tables.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

// [skillId, nome, Details, Conditions, rango, invokeType, [sv1..sv5]], in ordine di apprendimento.
// Testi scritti da noi (22-10): stessi effetti e valori della lista della community, parole nostre.
const STEAL_C = '50% chance to activate when an enemy drops an item. Usable once per battle.';
const BLAST_C = (n) => `Activates at the end of your turn against an enemy low on HP (tougher enemies: at ${n} HP or below). Usable once per battle.`;
const BOOST_C = (k) => `Activates when you use a special attack that boosts ${k}-STR. Usable once per turn.`;
const COMBO_C = (p) => `${p}% chance to activate on each player attack, whatever the Spirit slot. Usable 6 times per battle.`;
const COMBO_D = "Adds damage worth 40% of the player's attack.";
const BLAST_PCT = 25; // soglia «low HP» in % (ricostruita: l'originale non e' noto)
const SKILLS = [
  [1, 'Steal I', 'Item drops are doubled.', STEAL_C, 2, 1, [1, 0, 2]],
  [11, 'Blast I', 'Hits for 10,000 damage.', BLAST_C('10,000'), 3, 3, [1, 3, 10000, BLAST_PCT]],
  [21, 'Esuna I', 'Removes your status ailments.', 'Activates when a status ailment hits you. Usable once per battle.', 4, 5, [1, 7]],
  [31, 'HP Recovery I', 'Brings you back with 1 HP.', 'Activates when your HP drops to 0. Usable once per battle.', 5, 6, [1]],
  [2, 'Steal II', 'Item drops are tripled.', STEAL_C, 6, 1, [1, 0, 3]],
  [41, 'Poison Boost I', 'Enemies you poisoned take extra poison damage.', 'Activates when you poison an enemy.', 7, 7, [0, 2]],
  [42, 'Paralysis Boost I', 'Enemies you paralyzed cannot move.', 'Activates when you paralyze an enemy. Usable once per battle.', 7, 9, [1]],
  [43, 'Sleep Boost I', 'Enemies you put to sleep stay asleep for 3 hits.', 'Activates when you put an enemy to sleep. Usable twice per battle.', 7, 8, [2, 4]],
  [12, 'Blast II', 'Hits for 30,000 damage.', BLAST_C('30,000'), 8, 3, [1, 4, 30000, BLAST_PCT]],
  [51, 'P Attack Boost I', 'Your P-STR goes up 1 tier for 1 turn, past the usual cap.', BOOST_C('P'), 9, 4, [0, 1, 1, 1]],
  [52, 'S Attack Boost I', 'Your S-STR goes up 1 tier for 1 turn, past the usual cap.', BOOST_C('S'), 9, 4, [0, 1, 2, 1]],
  [53, 'M Attack Boost I', 'Your M-STR goes up 1 tier for 1 turn, past the usual cap.', BOOST_C('M'), 9, 4, [0, 1, 3, 1]],
  [3, 'Steal III', 'Item drops are quadrupled.', STEAL_C, 10, 1, [1, 0, 4]],
  [61, 'Combo I', COMBO_D, COMBO_C(25), 11, 10, [6, 2500, 4000]],
  [13, 'Blast III', 'Hits for 100,000 damage.', BLAST_C('100,000'), 12, 3, [1, 5, 100000, BLAST_PCT]],
  [54, 'P Attack Boost II', 'Your P-STR goes up 2 tiers for 1 turn, past the usual cap.', BOOST_C('P'), 13, 4, [0, 1, 1, 2]],
  [55, 'S Attack Boost II', 'Your S-STR goes up 2 tiers for 1 turn, past the usual cap.', BOOST_C('S'), 13, 4, [0, 1, 2, 2]],
  [56, 'M Attack Boost II', 'Your M-STR goes up 2 tiers for 1 turn, past the usual cap.', BOOST_C('M'), 13, 4, [0, 1, 3, 2]],
  [14, 'Blast IV', 'Hits for 500,000 damage.', BLAST_C('500,000'), 14, 3, [1, 6, 500000, BLAST_PCT]],
  [62, 'Combo II', COMBO_D, COMBO_C(33), 15, 10, [6, 3300, 4000]],
  [15, 'Blast V', 'Hits for 750,000 damage.', BLAST_C('750,000'), 16, 3, [1, 7, 750000, BLAST_PCT]],
  [63, 'Combo III', COMBO_D, COMBO_C(50), 17, 10, [6, 5000, 4000]],
];
// Blast: medaglie nascoste 3-7 (copie della medal 2, da cui il client costruisce l'attacco del Burst) con burst 12-16 a
// danno fisso esatto (damageType 2 / specialPowerType 2, sp1 = danno x 10000 su un colpo, come i danni fissi originali
// di server/fixed-damage.js). Nessuna riga originale sopravvissuta: id e aspetto nostri.
const BLAST = SKILLS.filter((s) => s[5] === 3).map(([, name, , , , , v]) => ({ name, medalId: v[1], burstId: v[1] + 9, damage: v[2] }));
// linea del trick = nome senza il numero romano (il livello piu' alto aperto sostituisce gli altri)
const lineOf = (name) => name.replace(/ [IV]+$/, '');

// punti cumulativi e moltiplicatore dello slot per rango: khuxwiki Pet_System «Slot Multiplier» (x1.00 al rango 1, poi
// x2.40 ... x3.90; il rango 17 = 6 medaglie da 432 punti)
const NEED_PT = [0, 108, 144, 162, 216, 288, 360, 468, 576, 720, 864, 1080, 1296, 1620, 1944, 2160, 2592];
const MAX_RANK = NEED_PT.length; // 17
const magnification = (rank) => (rank <= 1 ? 10000 : 22000 + 1000 * rank);

// livello piu' alto di ogni linea aperta, linee nell'ordine di apprendimento (Map: ordine del primo inserimento)
function openSkillsAt(rank) {
  const best = new Map();
  for (const [id, name, , , r] of SKILLS) {
    if (r > rank) continue;
    const line = lineOf(name);
    const cur = best.get(line);
    if (!cur || cur[1] < r) best.set(line, [id, r]);
  }
  return [...best.values()].map(([id]) => id).slice(0, 15);
}

function petRankRows() {
  return NEED_PT.map((needPt, i) => {
    const rank = i + 1;
    const opened = SKILLS.filter((s) => s[4] === rank).map((s) => s[0]);
    const open = openSkillsAt(rank);
    return { rank, needPt, magnification: magnification(rank), rankUpSkill: opened[0] || 0,
      validOpenSkill: open.length, openSkillIds: open }; // validOpenSkill = numero di id della lista
  });
}

function petSkillRows() {
  return SKILLS.map(([skillId, name, description, invokeDescription, , invokeType, v]) => ({
    skillId, thumbId: 1, name, description, invokeDescription, invokeType,
    skillValue1: v[0] || 0, skillValue2: v[1] || 0, skillValue3: v[2] || 0, skillValue4: v[3] || 0, skillValue5: v[4] || 0,
  }));
}

// Special Traits (khwiki, pagina Medal, «Special Traits»): [nome, icona, campi del valore, % «Unlock Rate»]
const SPECIAL_TRAITS = [
  ['Extra Attack: 120% Power', 80, { addDamage: 120 }, 0.2],
  ['Damage in Raids +100%', 70, { raidKindRate: 100 }, 0.8],
  ['Damage in Raids +30%', 70, { raidKindRate: 30 }, 2.4],
  ['Damage in Raids +20%', 70, { raidKindRate: 20 }, 3.5],
  ['Damage in Raids +10%', 70, { raidKindRate: 10 }, 3.5],
  ['STR +2000', 90, { attack: 2000 }, 1.4],
  ['STR +500', 90, { attack: 500 }, 2.0],
  ['STR +400', 90, { attack: 400 }, 3.5],
  ['STR +200', 90, { attack: 200 }, 3.5],
  ['STR +100', 90, { attack: 100 }, 3.5],
  ['STR +50', 90, { attack: 50 }, 3.5],
  ['DEF +1000', 100, { defense: 1000 }, 2.0],
  ['DEF +800', 100, { defense: 800 }, 3.5],
  ['DEF +600', 100, { defense: 600 }, 3.5],
  ['DEF +400', 100, { defense: 400 }, 3.5],
  ['DEF +200', 100, { defense: 200 }, 3.5],
  ['Ground Enemy DEF -20%', 60, { enemyKind: 1, enemyKindRate: 20 }, 1.4],
  ['Aerial Enemy DEF -20%', 61, { enemyKind: 2, enemyKindRate: 20 }, 1.4],
  ['Max Gauges +3', 10, { ability: 3 }, 3.5],
  ['Max Gauges +2', 10, { ability: 2 }, 3.5],
  ['Max Gauges +1', 10, { ability: 1 }, 3.5],
  ['Max HP +1000', 20, { hp: 1000 }, 3.5],
  ['Max HP +900', 20, { hp: 900 }, 3.5],
  ['Max HP +800', 20, { hp: 800 }, 3.5],
  ['Max HP +700', 20, { hp: 700 }, 3.5],
  ['Max HP +600', 20, { hp: 600 }, 3.5],
  ['Max HP +500', 20, { hp: 500 }, 3.5],
  ['Poison Resist 100%', 30, { poison: 100 }, 1.0],
  ['Poison Resist 20%', 30, { poison: 20 }, 2.8],
  ['Poison Resist 10%', 30, { poison: 10 }, 3.5],
  ['Sleep Resist 100%', 50, { sleep: 100 }, 1.0],
  ['Sleep Resist 20%', 50, { sleep: 20 }, 2.8],
  ['Sleep Resist 10%', 50, { sleep: 10 }, 3.5],
  ['Paralysis Resist 100%', 40, { paralyze: 100 }, 1.0],
  ['Paralysis Resist 20%', 40, { paralyze: 20 }, 2.8],
  ['Paralysis Resist 10%', 40, { paralyze: 10 }, 3.5],
];
const SPECIAL_TYPE = 2;
const SPECIAL_FIRST_ID = 1001;
const SHUFFLE_FIELDS = ['shuffleSkillId', 'category', 'type', 'name', 'sortId', 'duplicate', 'ability', 'hp',
  'poison', 'paralyze', 'sleep', 'enemyKind', 'enemyKindRate', 'raidKindRate', 'addDamage', 'attack', 'defense',
  'rate', 'campaignRate'];

function specialTraitRows() {
  return SPECIAL_TRAITS.map(([name, category, fields, pct], i) => {
    const row = {};
    for (const f of SHUFFLE_FIELDS) row[f] = 0;
    return Object.assign(row, {
      shuffleSkillId: SPECIAL_FIRST_ID + i, category, type: SPECIAL_TYPE, name: name.replace(/%/g, '%%'),
      sortId: SPECIAL_FIRST_ID + i, rate: Math.round(pct * 100),
    }, fields);
  });
}

// punti pet per rarita' (1-7 stelle) piu' 25 per livello di tier
// punti Spirit per tier del Special Attack Bonus (guiltValue): khuxwiki Pet_System «Spirit Points», 1-3 = 15, 4-6 = 20,
// 7 = 30, 8 = 80, 9 = 180, 10 = 270; senza tier (sotto le 6★) 15 come le medaglie evento [ricostruito]
const TIER_PT = [15, 15, 15, 15, 20, 20, 20, 30, 80, 180, 270];
// valori fissi per nome (server/pet_points.json, 406 nomi): `|pet=` delle pagine della khuxwiki (categorie Event/VIP 15,
// Prime 80, eccezioni 25-360) e la regola delle SN/SN+ (120; 80 al tier 7) degli avvisi 2019; ricerca 20-10 in
// reference\pet\medal_points_wiki.json. Il +20% con almeno un trait lo applicano client e server (pet.js pointsOf).
const PET_POINTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'pet_points.json'), 'utf8'));
function addPetPtFor(m) {
  if (Object.prototype.hasOwnProperty.call(PET_POINTS, m.name)) return PET_POINTS[m.name];
  return TIER_PT[Math.min(10, Math.max(0, m.guiltValue || 0))];
}

function patch(dir) {
  const out = [];
  const write = (n, rows) => fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(rows));
  write('petRank', petRankRows());
  write('petSkill', petSkillRows());
  out.push(`petRank ${MAX_RANK}`, `petSkill ${SKILLS.length}`);
  // misc 137 = rango massimo del pet: il dialog SPIRIT ricalcola il rango dai punti delle medaglie
  // fermandosi li'. Nel master 5.0.1 vale 15: con 17 ranghi
  // il client mostrava Rank 15 x3.700 mentre il server (e la cella del 6° slot) usava 17 x3.9
  const miscFile = path.join(dir, 'misc.json');
  if (fs.existsSync(miscFile)) {
    const misc = JSON.parse(fs.readFileSync(miscFile, 'utf8'));
    const row = misc.find((r) => r.miscId === 137);
    if (row && row.value !== MAX_RANK) { row.value = MAX_RANK; write('misc', misc); out.push(`misc 137 = ${MAX_RANK}`); }
    else if (!row) { misc.push({ miscId: 137, value: MAX_RANK }); write('misc', misc); out.push(`misc 137 = ${MAX_RANK}`); }
  }
  // Special Trait (type 2): sostituisce le righe 1001-1036 con quelle di SPECIAL_TRAITS
  const shuffleFile = path.join(dir, 'shuffleskill.json');
  if (fs.existsSync(shuffleFile)) {
    const rows = JSON.parse(fs.readFileSync(shuffleFile, 'utf8'));
    const special = specialTraitRows();
    const ids = new Set(special.map((r) => r.shuffleSkillId));
    const kept = rows.filter((r) => !ids.has(r.shuffleSkillId));
    // anche l'acquisto di un trait nel Moogle Shop gioca Kakusei_Get1 con la roulette sulle righe
    // type 1: con rate 0 ovunque la lista e' vuota e il primo «dispString» del nostro LWF
    // (make_kakusei_lwf.py) manderebbe il client in crash. rate 100 ai trait normali (non ai Burst
    // 901/902), usato solo come «candidato della roulette».
    let rated = 0;
    for (const r of kept) if (r.type === 1 && r.shuffleSkillId < 900 && !r.rate) { r.rate = 100; rated++; }
    if (rated) out.push(`shuffleskill type 1 rate ${rated}`);
    const before = JSON.stringify(rows.filter((r) => ids.has(r.shuffleSkillId)));
    if (rated || before !== JSON.stringify(special)) {
      write('shuffleskill', [...kept, ...special].sort((a, b) => a.shuffleSkillId - b.shuffleSkillId));
      out.push(`shuffleskill type 2 ${special.length}`);
    }
  }
  const medalFile = path.join(dir, 'medal.json');
  if (fs.existsSync(medalFile)) {
    const medals = JSON.parse(fs.readFileSync(medalFile, 'utf8'));
    let n = 0;
    const hidden = new Set([1, 2, ...BLAST.map((b) => b.medalId)]);
    for (const m of medals) {
      // 1 = slot vuoto, 2 = Burst (make-guilt-burst.js), 3-7 Blast; Trait Medal (type 9): 15 punti, make-trait-medals.js
      if (hidden.has(m.medalId) || m.type === 9) continue;
      const pt = addPetPtFor(m);
      if (m.addPetPt !== pt) { m.addPetPt = pt; n++; }
    }
    if (n) { write('medal', medals); out.push(`medal.addPetPt ${n}`); }
  }
  out.push(...patchBlast(dir));
  return out;
}

// Medaglie 3-7 e burst 12-16 del Blast (vedi BLAST): dopo make-guilt-burst.js, di cui copiano medal 2 e burst 11
// target 2: i bersagli del Blast sono i nemici marcati dalla condizione; con target 1 il
// client prende il nemico scelto dal giocatore, nullo per il pet: crash alla sconfitta
// (banco 20-10, quest 524)
function patchBlast(dir) {
  const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
  const write = (n, rows) => fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(rows));
  if (!fs.existsSync(path.join(dir, 'medal.json')) || !fs.existsSync(path.join(dir, 'burst.json'))) return [];
  const medals = read('medal'), bursts = read('burst');
  const m2 = medals.find((m) => m.medalId === 2), b11 = bursts.find((b) => b.burstId === 11);
  if (!m2 || !b11) return ['Blast: manca medal 2 o burst 11 (make-guilt-burst.js)'];
  const zeroBuffs = Object.fromEntries(Object.keys(b11).filter((k) => /^(de)?buf|^resetBuf|^resetDebuf|^cure|^heal|^recovery/.test(k)).map((k) => [k, 0]));
  const medalRows = BLAST.map((b) => ({ ...m2, medalId: b.medalId, name: b.name, flavor: b.name, advantage: b.name,
    attack: 1, maxAttack: 1, defense: 1, maxDefense: 1, addPetPt: 0, burstId: b.burstId, shuffleSkillGroupId: b.medalId }));
  const burstRows = BLAST.map((b) => ({ ...b11, ...zeroBuffs, burstId: b.burstId, name: b.name,
    description: `Deals ${b.damage.toLocaleString('en-US')} damage.`, maxEnhanceCount: 0, attribute: 0, target: 2, hitCount: 1,
    gauge: 0, critical: 0, criticalPower: 10000, damageType: 2, specialPowerType: 2, basePower: 0,
    basePowerPerEnforce: [1, 1, 1, 1, 1], sp1: b.damage * 10000, sp2: 0, sp1PerEnforce: [0, 0, 0, 0, 0],
    sp2PerEnforce: [0, 0, 0, 0, 0], displayPower: b.damage * 10000, displayPowerPerEnforce: [1, 1, 1, 1, 1] }));
  const out = [];
  // righe gia' presenti aggiornate al loro posto, le mancanti in fondo (altri generatori spostano le loro in fondo)
  const merge = (rows, add, key) => {
    const byKey = new Map(add.map((r) => [r[key], r]));
    const outRows = rows.map((r) => byKey.get(r[key]) || r);
    const have = new Set(rows.map((r) => r[key]));
    return [...outRows, ...add.filter((r) => !have.has(r[key]))];
  };
  const nm = merge(medals, medalRows, 'medalId');
  const nb = merge(bursts, burstRows, 'burstId');
  if (JSON.stringify(nm) !== JSON.stringify(medals)) { write('medal', nm); out.push(`medal Blast ${medalRows.length}`); }
  if (JSON.stringify(nb) !== JSON.stringify(bursts)) { write('burst', nb); out.push(`burst Blast ${burstRows.length}`); }
  return out;
}

if (require.main === module) {
  const tables = path.join(__dirname, 'tables');
  fs.mkdirSync(tables, { recursive: true });
  fs.writeFileSync(path.join(tables, 'petRank.json'), JSON.stringify(petRankRows(), null, 1));
  fs.writeFileSync(path.join(tables, 'petSkill.json'), JSON.stringify(petSkillRows(), null, 1));
  const dir = process.argv[2] || process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
  const done = patch(dir);
  console.log(`pet: ${done.join(', ')} (alzare KHUX_REVISION)`);
}

module.exports = { patch, petRankRows, petSkillRows, addPetPtFor, MAX_RANK, specialTraitRows, SPECIAL_TYPE, SKILLS, BLAST };
