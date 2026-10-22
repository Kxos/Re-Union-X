#!/usr/bin/env node
// Passive (tabelle master passive e passiveSetting, vuote nella 5.0.1). I-065, note in
// docs/notes/server.md#passive.
//
// Nell'originale (dalla 3.4.0) le passive sono bonus permanenti per due traguardi
// (khuxwiki «Passives», D:\Progetto_Restauro_KH_UX\reference\passives\):
//   - livello Lux 350..999: HP, STR, DEF, SP ATK Gauge (+1 a 555/666/777);
//   - livello di ogni keyblade da +35 a +60 (passi da 0.5): STR delle medaglie di un tipo,
//     es. «Upright P Medal STR +50», e +100/+200 sui livelli tondi.
// Le passive dei keyblade vengono da reference\keyblades\keyblade_levels.json (campo passive),
// quelle Lux dal wikitext della pagina Passives; copia ridotta in server/tables/passives.json.
//
// Campi letti dal client 4.3.1:
// passive: passiveId, name (testo della riga in «Passive Effects», Txt_Passive_Label),
//     validPassive (quante voci di type/value), type[<=5], value[<=5], hp, abilitygauge, attack,
// defense, attribute (sommati nei totali). type 3 = filtro sulle medaglie,
// value = maschera: 1 Power, 2 Speed, 4 Magic, 8 Upright, 16 Reversed (il client la
//     trasforma nelle categorie 1..11 del riquadro Total: P/S/M, Upright P/S/M, Reversed P/S/M,
// U, R le applica alla medaglia per attributo e darklight).
//     Senza type (validPassive 0) la passiva vale per tutto: HP, SP ATK Gauge, STR, DEF.
// passiveSetting: passiveSettingId, sortId (ordine della lista),
//     passiveConditions, passiveValue1, passiveValue2, description (Txt_Rule_Label del popup
// PassiveResult), passiveId.
// Il client non valuta passiveConditions (nessun lettore trovato): chi ha quali passive lo
// decide il server (PUT /passive/list, server/keyblade-evo.js). Condizioni nostre:
//   1 = livello Lux >= passiveValue1; 2 = keyblade della serie passiveValue1 (category) a
//   livello*10 >= passiveValue2.
// Id: Lux 10000 + livello; keyblade 100000 + category*1000 + livello*10 (es. Starlight +35 =
// 101350, Bad Guy Breaker +60 = 2001600). Si generano anche le passive oltre +35: oggi
// irraggiungibili (la tabella keyblade chiude a +35), pronte se un giorno si va oltre.
//
//   node server\make-passives.js [keyblade_levels.json della ricerca] [Passives wikitext]
// Dopo import-master e make-keyblade-levels. Poi alzare KHUX_REVISION (revisione dei master).
'use strict';

const fs = require('fs');
const path = require('path');

const MASTER = path.join(__dirname, 'master_data');
const TABLE = path.join(__dirname, 'tables', 'passives.json');
const REF_KB = 'D:\\Progetto_Restauro_KH_UX\\reference\\keyblades\\keyblade_levels.json';
const REF_LUX = 'D:\\Progetto_Restauro_KH_UX\\reference\\passives\\Passives_khuxwiki.wikitext';

const MASK = { P: 1, S: 2, M: 4, U: 8, R: 16 };
const ATTR_WORD = { P: 'P', S: 'S', M: 'M' };

function load(f) { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); }
function save(f, data) { fs.writeFileSync(f, JSON.stringify(data, null, 1) + '\n', 'utf8'); }

// tabella ridotta: { lux: [[livello, testo]], keyblades: { nome: [[livello, testo]] } }
function extract(kbRef, luxText) {
  const keyblades = {};
  for (const [name, s] of Object.entries(kbRef)) {
    if (name.startsWith('_')) continue;
    keyblades[name] = s.levels.filter((l) => l.passive).map((l) => [l.lv, l.passive]);
  }
  const lux = [];
  for (const line of luxText.split(/\r?\n/)) {
    const m = /^\|(\d+)\|\|([^|]+?)\s*\|\|/.exec(line);
    if (m) lux.push([Number(m[1]), m[2].trim()]);
  }
  return { lux, keyblades };
}

// «Upright P Medal STR +50», «Reverse S Medal STR +50», «U Medal STR +200», «M Medal Str +200»,
// «STR +100», «HP +50», «DEF +10», «SP ATK Gauge +1» -> campi della riga passive
function parse(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  let m = /^(?:(Upright|Reversed?) )?([PSMUR]) Medal STR \+(\d+)$/i.exec(t);
  if (m) {
    let mask = MASK[m[2].toUpperCase()];
    if (m[1]) mask |= /^u/i.test(m[1]) ? MASK.U : MASK.R;
    const dl = m[1] ? (/^u/i.test(m[1]) ? 'Upright ' : 'Reversed ') : '';
    const what = ATTR_WORD[m[2].toUpperCase()] || m[2].toUpperCase();
    return { name: `${dl}${what} Medal STR +${m[3]}`, type: [3], value: [mask], attack: Number(m[3]) };
  }
  m = /^(HP|STR|DEF|SP ATK Gauge) \+(\d+)$/i.exec(t);
  if (m) {
    const field = { HP: 'hp', STR: 'attack', DEF: 'defense', 'SP ATK GAUGE': 'abilitygauge' }[m[1].toUpperCase()];
    return { name: `${m[1].toUpperCase() === 'SP ATK GAUGE' ? 'SP ATK Gauge' : m[1].toUpperCase()} +${m[2]}`, type: [], value: [], [field]: Number(m[2]) };
  }
  return null;
}

function fmtLv(lv) { return Number.isInteger(lv) ? String(lv) : lv.toFixed(1); }

function main() {
  const kbArg = process.argv[2];
  const luxArg = process.argv[3];
  let table;
  if (kbArg || !fs.existsSync(TABLE)) {
    table = extract(load(kbArg || REF_KB), fs.readFileSync(luxArg || REF_LUX, 'utf8'));
    fs.mkdirSync(path.dirname(TABLE), { recursive: true });
    save(TABLE, table);
    console.log(`tabella ridotta: ${TABLE}`);
  } else table = load(TABLE);

  // serie -> category dalla tabella keyblade (nome senza « +N»)
  const category = new Map();
  for (const r of load(path.join(MASTER, 'keyblade.json'))) {
    const n = String(r.name || '').replace(/ \+\d+(\.\d+)?$/, '');
    if (!category.has(n)) category.set(n, r.category);
  }

  const passives = new Map(); // nome -> riga passive
  function passiveId(text) {
    const p = parse(text);
    if (!p) throw new Error(`passiva non riconosciuta: ${text}`);
    if (!passives.has(p.name)) {
      passives.set(p.name, {
        passiveId: passives.size + 1, name: p.name, validPassive: p.type.length, type: p.type, value: p.value,
        hp: p.hp || 0, abilitygauge: p.abilitygauge || 0, attack: p.attack || 0, defense: p.defense || 0, attribute: 0,
      });
    }
    return passives.get(p.name).passiveId;
  }

  const settings = [];
  let sort = 0;
  for (const [lv, text] of table.lux) {
    settings.push({
      passiveSettingId: 10000 + lv, sortId: ++sort, passiveConditions: 1, passiveValue1: lv, passiveValue2: 0,
      description: `Reach LV ${lv}.`, passiveId: passiveId(text),
    });
  }
  for (const [name, list] of Object.entries(table.keyblades)) {
    const cat = category.get(name);
    if (!cat) { console.log(`  ${name}: serie assente dalla tabella keyblade, saltata`); continue; }
    for (const [lv, text] of list) {
      const lv10 = Math.round(lv * 10);
      settings.push({
        passiveSettingId: 100000 + cat * 1000 + lv10, sortId: ++sort, passiveConditions: 2, passiveValue1: cat,
        passiveValue2: lv10, description: `Upgrade ${name} to +${fmtLv(lv)}.`, passiveId: passiveId(text),
      });
    }
  }
  save(path.join(MASTER, 'passive.json'), [...passives.values()]);
  save(path.join(MASTER, 'passiveSetting.json'), settings);
  console.log(`passive: ${passives.size} righe, passiveSetting: ${settings.length} righe `
    + `(${table.lux.length} Lux, ${settings.length - table.lux.length} keyblade)`);
}

main();
