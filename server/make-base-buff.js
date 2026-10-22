#!/usr/bin/env node
// «Medal STR/DEF ±N» degli speciali e delle Supernova: campi addBase* della tabella burst (I-155,
// docs/notes/battaglia.md#basebuff). Nessuna fonte originale li ha (thethiny: tutti 0, 5.0.1 senza
// tabella burst completa, JP 4.3.1 senza master): si ricostruiscono dalla descrizione della riga.
//
// Semantica dal client 4.3.1 (se' stesso / ogni bersaglio: una voce nella lista STR e una
// nella lista DEF):
// - addBaseCountType: 1 = turni (scala a fine turno con i buff a turni),
// 2 = attacchi (scala dopo ogni attacco); addBaseCountValue = durata.
//   La voce entra solo con tipo != 0, durata >= 1 e valore != 0.
// - addBaseAtkSelf/DefSelf/AtkOpponent/DefOpponent: valore assoluto sommato alla STR/DEF della medaglia
// (STR riga + somma, minimo 0, poi moltiplicatori); voci uguali si sommano (2000+2000).
// - addBaseAttribute: maschera delle medaglie a cui vale: bit 0/1/2 = Power/Speed/Magic, bit 3/4 = Upright/Reversed; 0 = tutte le medaglie.
// - resetBase (non usato qui): bit 0/1 azzera STR/DEF propri, bit 2/3 dei bersagli.
//
// Descrizioni lette: «N turn(s): [P-|S-|M-|U-|R-|P- & S-]Medal STR ±N[, DEF ±N]», «N attack(s): ...»,
// sull'avversario «targets' X-Medal STR -N» o «targets [Medal STR -N]». La durata e' l'ultima
// «N turn(s):»/«N attack(s):» prima della frase. Righe con piu' durate o attributi diversi: non toccate
// (rapporto). Idempotente; chiamato da make-game-tables.js dopo le skill. Dopo: alzare la revisione.
//
//   node server/make-base-buff.js [cartella master] [--report file.md]
'use strict';

const fs = require('fs');
const path = require('path');

const ATTR_BITS = { P: 1, S: 2, M: 4, U: 8, R: 16 };
const FIELDS = ['addBaseCountType', 'addBaseCountValue', 'addBaseAtkSelf', 'addBaseDefSelf',
  'addBaseAtkOpponent', 'addBaseDefOpponent', 'addBaseAttribute'];
const MENTION = /Medal (STR|DEF)/g;
const CLAUSE = /((?:[PSMUR]- & )*[PSMUR]-)?Medal (STR|DEF) ([+-]?\d+)(?:,? (?:& )?(DEF|STR) ([+-]?\d+))?/g;
const DURATION = /(\d+) (turn|attack)s?:/g;

function attrMask(prefix) {
  let m = 0;
  for (const c of (prefix || '').match(/[PSMUR](?=-)/g) || []) m |= ATTR_BITS[c];
  return m;
}

// avversario: «targets' X-Medal», «target's», oppure dentro «targets [ ... ]» / «target [ ... ]»
function isOpponent(text, at) {
  const before = text.slice(0, at);
  if (/targets?(?:[’']s?)? $/.test(before)) return true;
  const open = before.lastIndexOf('[');
  if (open < 0 || before.lastIndexOf(']') > open) return false;
  return /targets? $/.test(before.slice(0, open));
}

// descrizione -> { fields } | { problem } | null (nessuna frase «Medal STR/DEF»)
function parseBaseBuff(description) {
  const text = String(description || '');
  const mentions = (text.match(MENTION) || []).length;
  if (!mentions) return null;
  const durations = [...text.matchAll(DURATION)].map((m) => ({ at: m.index, type: m[2] === 'turn' ? 1 : 2, value: +m[1] }));
  const out = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  let used = 0, dur = null, attr = null;
  for (const m of text.matchAll(CLAUSE)) {
    const d = durations.filter((x) => x.at < m.index).pop();
    if (!d) return { problem: 'durata assente prima di «' + m[0] + '»' };
    if (dur && (dur.type !== d.type || dur.value !== d.value)) return { problem: 'durate diverse nella stessa riga' };
    dur = d;
    const a = attrMask(m[1]);
    if (attr !== null && attr !== a) return { problem: 'attributi diversi nella stessa riga' };
    attr = a;
    const opp = isOpponent(text, m.index);
    const pairs = [[m[2], m[3]]];
    if (m[4]) pairs.push([m[4], m[5]]);
    for (const [stat, v] of pairs) {
      const f = 'addBase' + (stat === 'STR' ? 'Atk' : 'Def') + (opp ? 'Opponent' : 'Self');
      if (out[f]) return { problem: 'campo ' + f + ' ripetuto' };
      out[f] = parseInt(v, 10);
      if (!out[f]) return { problem: 'valore 0 in «' + m[0] + '»' };
    }
    used += pairs.length;
  }
  // ogni «Medal STR/DEF» deve essere stato letto (la «DEF» dopo la virgola non e' una menzione)
  const read = [...text.matchAll(CLAUSE)].length;
  if (read < mentions) return { problem: `${mentions - read} frasi «Medal STR/DEF» non lette` };
  if (!used) return { problem: 'nessun valore' };
  out.addBaseCountType = dur.type;
  out.addBaseCountValue = dur.value;
  out.addBaseAttribute = attr;
  return { fields: out };
}

function patch(dir, opts = {}) {
  const file = path.join(dir, 'burst.json');
  const bursts = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stats = { rows: 0, changed: 0, problems: [], byType: { 1: 0, 2: 0 }, opponent: 0, def: 0, attr: 0 };
  for (const b of bursts) {
    const r = parseBaseBuff(b.description);
    if (!r) continue;
    if (r.problem) {
      stats.problems.push({ burstId: b.burstId, problem: r.problem, description: b.description });
      continue;
    }
    stats.rows++;
    stats.byType[r.fields.addBaseCountType]++;
    if (r.fields.addBaseAtkOpponent || r.fields.addBaseDefOpponent) stats.opponent++;
    if (r.fields.addBaseDefSelf || r.fields.addBaseDefOpponent) stats.def++;
    if (r.fields.addBaseAttribute) stats.attr++;
    if (FIELDS.some((f) => b[f] !== r.fields[f])) {
      Object.assign(b, r.fields);
      stats.changed++;
    }
  }
  if (stats.changed) fs.writeFileSync(file, JSON.stringify(bursts));
  console.log(`base buff: ${stats.rows} righe burst con addBase* dalla descrizione (cambiate ${stats.changed}; ` +
    `${stats.byType[1]} a turni, ${stats.byType[2]} ad attacchi, ${stats.attr} con attributo, ${stats.def} con DEF, ` +
    `${stats.opponent} sull'avversario), ${stats.problems.length} non interpretate`);
  if (opts.report) writeReport(opts.report, stats);
  return stats;
}

function writeReport(file, stats) {
  const lines = ['# Base buff (I-155): righe burst non interpretate', '',
    `Generato da server/make-base-buff.js il ${new Date().toISOString().slice(0, 10)}: ${stats.rows} righe riempite, ` +
    `${stats.problems.length} non interpretate (addBase* lasciati come sono).`, ''];
  if (stats.problems.length) {
    lines.push('| burstId | problema | descrizione |', '|---|---|---|');
    for (const p of stats.problems) lines.push(`| ${p.burstId} | ${p.problem} | ${p.description.replace(/\|/g, '\\|')} |`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

module.exports = { parseBaseBuff, patch, FIELDS, ATTR_BITS };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const ri = argv.indexOf('--report');
  const report = ri >= 0 ? argv.splice(ri, 2)[1] : null;
  patch(argv[0] || path.join(__dirname, 'master_data'), { report });
}
