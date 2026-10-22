#!/usr/bin/env node
// Elenco delle Trait Medal (I-084 parte B): numero EN «Trait Medal #N» -> medaglia associata, dalla tabella della
// khuxwiki (reference\trait_medals\khuxwiki_Trait_Medal_raw.txt, 189 righe: #1-#188 e #274). La prima colonna e' il
// numero di Album EN della medaglia (= sortId del master, la Trait Medal condivide la cella: notice 38128).
// affected = riga type 1 (< 1.000.000, non boosted) con quel sortId e il nome dell'etichetta della wiki; se l'Album
// ha piu' nomi (evoluzioni SN -> SN+) e l'etichetta non corrisponde, la riga piu' bassa.
// #189-#313 (assenti dalla tabella): le pagine «Trait Medal N» della khuxwiki rimandano alla pagina della medaglia
// («Trait Medal #190 ... can be used to add or re-roll a trait on SN++ - KH III Roxas», ricerca del 19-10,
// reference\trait_medals\khuxwiki_trait_medal_189_313.json e _RESULT.md con le frasi): riga per nome, la rarita' piu'
// alta (album = il suo sortId). Scrive server/trait_medals.json (versionato: le sorgenti stanno fuori dal repo).
//
//   node server/make-trait-medal-list.js [wikitesto] [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', '..', '..', 'reference', 'trait_medals', 'khuxwiki_Trait_Medal_raw.txt');
const PAGES = path.join(__dirname, '..', '..', '..', 'reference', 'trait_medals', 'khuxwiki_trait_medal_189_313.json');
const OUT = path.join(__dirname, 'trait_medals.json');

// etichetta della wiki -> nome del master
function label(cell) {
  const s = cell.trim();
  let m;
  if ((m = s.match(/^\{\{EX\|([^}]+)\}\}$/))) return `${m[1]} [EX]`;
  if ((m = s.match(/^\{\{b\|([^|}]+)\|([^}]+)\}\}$/))) return `${m[1]} [${m[2]}]`;
  if ((m = s.match(/^\{\{KA\|(\d+)\}\}$/))) return `Key Art #${m[1]}`;
  if ((m = s.match(/^\{\{SG\|(\d+)\}\}$/))) return `Stained Glass #${m[1]}`;
  if ((m = s.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/))) return m[1].replace(/Key Art (\d+)/, 'Key Art #$1');
  return s;
}

// nome della pagina della khuxwiki -> nome del master («Key Art 23» -> «Key Art #23», «(EX)» -> «[EX]»)
const pageName = (s) => s.replace(/(Key Art|Stained Glass) (\d+)/, '$1 #$2').replace(/ \((EX\+?)\)$/, ' [$1]');

// {N: [pagina della medaglia, sezione]} -> voci per i numeri non ancora presenti
function fromPages(pages, medals, have) {
  const out = [];
  const rows = medals.filter((r) => r.type === 1 && r.medalId < 1e6 && !r.groupId);
  for (const [k, [page]] of Object.entries(pages)) {
    const n = Number(k);
    if (have.has(n)) continue;
    const name = pageName(page);
    let rs = rows.filter((r) => r.name === name);
    if (!rs.length) rs = rows.filter((r) => r.name.startsWith(name + ' [') || r.name.endsWith(' - ' + name));
    if (!rs.length) throw new Error(`Trait Medal #${n}: medaglia «${page}» assente dal master`);
    const hit = rs.sort((a, b) => b.rare - a.rare || a.medalId - b.medalId)[0];
    out.push({ n, album: hit.sortId, jp: 0, label: page, affected: hit.medalId, name: hit.name });
  }
  return out;
}

function build(raw, medals, pages = {}) {
  const out = [];
  for (const line of raw.split('\n')) {
    if (!/^\|\d+\|\|/.test(line)) continue;
    const c = line.split('||');
    const album = Number(c[0].slice(1));
    const n = Number((c[2].match(/\{\{n\|Trait Medal\|(\d+)\}\}/) || [])[1]);
    const jp = Number(c[1]);
    const name = label(c[4]);
    const rows = medals.filter((r) => r.sortId === album && r.type === 1 && r.medalId < 1e6 && !r.groupId)
      .sort((a, b) => a.medalId - b.medalId);
    if (!n || !rows.length) throw new Error(`riga senza numero o medaglia: ${line.slice(0, 80)}`);
    const hit = rows.find((r) => r.name === name) || rows.find((r) => r.name.startsWith(name)) || rows[0];
    out.push({ n, album, jp, label: name, affected: hit.medalId, name: hit.name });
  }
  out.push(...fromPages(pages, medals, new Set(out.map((e) => e.n))));
  return out.sort((a, b) => a.n - b.n);
}

module.exports = { label, pageName, build };

if (require.main === module) {
  const raw = fs.readFileSync(process.argv[2] || RAW, 'utf8');
  const medals = JSON.parse(fs.readFileSync(path.join(process.argv[3] || path.join(__dirname, 'master_data'), 'medal.json'), 'utf8'));
  const list = build(raw, medals, JSON.parse(fs.readFileSync(PAGES, 'utf8')));
  fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + '\n');
  console.log(`trait_medals.json: ${list.length} Trait Medal (#${list[0].n}-#${list[list.length - 1].n})`);
}
