#!/usr/bin/env node
// Tabelle master `skill` e `skillExp` (I-146, docs/notes/medaglie.md#skill, spec
// docs/superpowers/specs/2026-10-18-skill-design.md §5.1-5.3).
//
// Sorgenti lette a build-time, MAI copiate nel repo (dati Square Enix e testi del wiki):
// - KHUX_THETHINY_DATA (default D:\Progetto_Restauro_KH_UX\external\thethiny_2026-10-13\KHUx-Server\data):
//   skill.json = 25 righe vere (1100-1126, layout vecchio senza value1, burstLock, pvpConditionTurn,
//   pvpConditionCount) e skillExp.json = le 4 curve vere (expId 1-4).
// - KHUX_WIKI (default D:\Progetto_Restauro_KH_UX\wiki\wiki_all.json): pagina «Medal», sezione
//   ===List of Skills=== (nome, nome JP, LV massimo, probabilita' massima, descrizione).
// - la skill.json gia' nel master (righe 1100-1113 dell'APK 5.0.1, import-master.js): solo i 4 campi che
//   thethiny non ha, per le righe con lo stesso skillId.
//
// Righe vere: i numeri di thethiny (master di feb.-mar. 2017) restano, tranne ERA_431 (stato della 4.3.1); i 4
// campi mancanti dalla riga 5.0.1 del master se c'e' (1100-1113), altrimenti dalla descrizione: value1 1000
// per gli stati (10000 per le altre), burstLock = gauge * 10000 per «uses only N special attack gauge(s)»,
// pvpConditionTurn = conditionTurn, pvpConditionCount = conditionCount. Unita' verificate nel client 4.3.1:
// docs/notes/medaglie.md, «Tabella skill».
// Righe ricostruite (le altre skill del wiki): copia della «sorella», la riga vera della stessa famiglia
// (vedi family(): Attack Boost, Attack Boost All, Defense Boost, Second Chance, stato alterato, «+», SP Attack
// Gauge, combo & Lux / & Prize, No Cost) piu' vicina per maxLv, «Max», stati e potenza; poi
// - name dal wiki, description = frasi intere del wiki che stanno in 71 byte (abbreviazioni in SHORTEN se la
//   prima non ci sta), maxLv dal wiki;
// - rank/expType della sorella se ha lo stesso maxLv, altrimenti della riga vera piu' comune con quel maxLv;
// - potenza dalla descrizione: «N times more damage» -> attackUp N*10000, «by a/b» -> damageCut
//   10000*(1-a/b), «by P%» -> (100-P)*100, Lux -> luxUp della riga vera («increases» = Lux Plus 15000,
//   «greatly» = combo vere 30000; «vastly» = 50000, stima),
//   attack prizes -> prizeBurstUp della riga vera (220000), Poison/Paralysis/Sleep -> add* 10000 e
//   conditionTurn 1 se «1 turn», value1 1000 (500 con «enemies up to LV 1999»), «no special attack gauges»
//   -> burstCancel 1 (come No Cost), «uses only N» -> burstLock N*10000; combo ATK & GA: invokeShowTiming 6;
// - invokeProbPerLv della sorella (delle «Max» senza sorella «Max»: quello della riga vera «Max», 10),
//   invokeProb dal trigger% TRONCATO del wiki (baseProb: quello della sorella o il multiplo di 100 che da'
//   quel trigger%);
// - skillId dal 1127 in ordine di wiki, sortId = skillId, categoryEvolve nuovo e unico dal 31.
// Le famiglie senza una riga vera (combo ATK & GA, ATK & stato, Triple Threat) prendono la riga vera con il
// tipo di attivazione piu' vicino e sono elencate nel report (D:\Progetto_Restauro_KH_UX\tmp\skill\report.md).
// Doppioni del wiki (stesso nome normalizzato): si tiene il primo.
//
// make-game-tables.js chiama patch(OUT) dopo make-pet-tables; da solo:
//   node server/make-skill-table.js [cartella master]
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.KHUX_THETHINY_DATA || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data';
const WIKI = process.env.KHUX_WIKI || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json';
const REPORT = process.env.KHUX_SKILL_REPORT || 'D:\\Progetto_Restauro_KH_UX\\tmp\\skill\\report.md';
const FIRST_NEW_ID = 1127;
const FIRST_NEW_CATEGORY = 31;
const MAX_BYTES = 71;
const LUX_VAST = 50000;   // «vastly increases Lux» (Lux++): nessuna riga vera, stima (le «greatly» hanno 30000)
// Righe vere riportate allo stato della 4.3.1 (primavera 2021; tmp\skill\suspicious_rows.md). thethiny e' il
// master di feb.-mar. 2017, la 5.0.1 offline (2021) e' la fonte piu' vicina: sulle 12 righe in comune cambiano
// solo Lux Plus luxUp (30000 -> 15000) e le icone. Le risorse WW della 4.3.1 hanno Skill_Icon1,2,4-9 senza la
// 3: 6 = attacco a tutti, 7 = prize, 8 = Lux, 9 = costo della gauge. Le righe senza riga 5.0.1 (combo Lux e
// prize, SP Attack Gauge) prendono l'icona del loro effetto (deduzione). Le ricostruite la ereditano dalla sorella.
const ERA_431 = {
  1102: { thumbId: 6 }, 1103: { thumbId: 6 }, 1107: { thumbId: 7 }, 1109: { thumbId: 8, luxUp: 15000 },
  1110: { thumbId: 9 }, 1114: { thumbId: 8 }, 1117: { thumbId: 7 }, 1123: { thumbId: 8 }, 1124: { thumbId: 9 },
  1126: { thumbId: 9 },
};

// ---------------------------------------------------------------------------------------------------------
// wiki

function readWikiMedalPage(file) {
  const all = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const page = all.Medal;
  if (typeof page !== 'string') throw new Error(`${file}: pagina «Medal» assente`);
  return page;
}

function cleanText(s) {
  return s.replace(/<!--[\s\S]*?-->/g, '').replace(/'''?/g, '').replace(/\s+/g, ' ').trim();
}

// -> [{name, nameJp, maxLv, triggerPct, description, fullDescription}]
function parseWikiSkills(wikiText) {
  const start = wikiText.indexOf('===List of Skills===');
  if (start < 0) throw new Error('sezione ===List of Skills=== assente');
  const rest = wikiText.slice(start);
  const end = rest.indexOf('\n|}');
  const out = [];
  for (const line of rest.slice(0, end < 0 ? undefined : end).split('\n')) {
    if (!/^\|\s*\[\[File:/.test(line)) continue;
    const cells = line.replace(/^\|/, '').split('||').map((c) => c.trim());
    if (cells.length < 4) throw new Error(`riga del wiki inattesa: ${line}`);
    const nm = /\{\{a\|([^}|]+)\}\}/.exec(cells[0]) || /'''([^']+)'''/.exec(cells[0]);
    const jp = /\}\}'''\|([^|]*)\|/.exec(cells[0]);
    const desc = cells.slice(3).join('||');
    const main = cleanText(desc.split(/<br\s*\/?>/i)[0]);
    out.push({
      name: cleanText(nm[1]),
      nameJp: jp ? jp[1].trim() : '',
      maxLv: parseInt(cells[1], 10),
      triggerPct: parseFloat(cells[2]),
      description: main,
      fullDescription: cleanText(desc.replace(/<br\s*\/?>/gi, ' ')),
    });
  }
  return out;
}

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15 };
// nome normalizzato: maiuscole, «Plus»/«+», «ATK»/«Attack», numeri romani, ordine delle parti «&»
function normName(name) {
  return name.toLowerCase().split('&').map((part) => part
    .replace(/\bplus\b/g, '+').replace(/\s*\+/g, '+')
    .replace(/\batk\b/g, 'attack')
    .split(/\s+/).filter(Boolean).map((w) => (ROMAN[w] ? String(ROMAN[w]) : w)).join(' '))
    .sort().join('&');
}

// testi <= 71 byte: frasi intere; se non basta, abbreviazioni in ordine
const SHORTEN = [
  [/Has a shorter duration than the original skill\./g, 'Shorter duration.'],
  [/ dropped by enemies/g, ''],
  [/ times more damage/g, 'x damage'],
  [/special attack gauges/g, 'SP gauges'],
  [/special attack gauge/g, 'SP gauge'],
  [/single, group, (?:or|and) special attacks/g, 'any attack'],
  [/Effective on enemies up to LV (\d+)/g, 'Up to enemy LV $1'],
  [/attacks? prizes/g, 'ATK prizes'],
];
const fits = (s) => Buffer.byteLength(s, 'utf8') <= MAX_BYTES;
function shortText(text) {
  if (fits(text)) return text;
  const sentences = (s) => s.split(/(?<=\.)\s+/).filter(Boolean);
  const wholeFit = (s) => {
    let acc = '';
    for (const x of sentences(s)) {
      const next = acc ? `${acc} ${x}` : x;
      if (!fits(next)) break;
      acc = next;
    }
    return acc;
  };
  // testo intero con le abbreviazioni progressive; se non ci sta mai, la versione che tiene piu' frasi
  // intere (a pari frasi, quella con meno abbreviazioni)
  let s = text;
  let best = wholeFit(s);
  for (const [re, to] of SHORTEN) {
    s = s.replace(re, to);
    if (fits(s)) return s;
    const w = wholeFit(s);
    if (w && (!best || sentences(w).length > sentences(best).length)) best = w;
  }
  if (best) return best;
  // ultima risorsa: taglio a fine parola
  let cut = '';
  for (const w of s.split(' ')) {
    const next = cut ? `${cut} ${w}` : w;
    if (!fits(next)) break;
    cut = next;
  }
  return cut;
}

// ---------------------------------------------------------------------------------------------------------
// famiglie

function features(name, desc) {
  const f = { status: new Set() };
  let m = /Deals ([\d.]+) times more damage/i.exec(desc);
  if (m) f.attackUp = Math.round(parseFloat(m[1]) * 10000);
  m = /(?:Cuts|Negates|reduces) enemy damage by (\d+)\/(\d+)/i.exec(desc);
  if (m) f.damageCut = Math.round(10000 * (1 - parseInt(m[1], 10) / parseInt(m[2], 10)));
  m = /(?:Cuts|Negates|reduces) (?:enemy )?damage by (\d+)%/i.exec(desc);
  if (m) f.damageCut = (100 - parseInt(m[1], 10)) * 100;
  f.all = /all enemies/i.test(desc);
  if (/poison/i.test(desc)) f.status.add('Poison');
  if (/paraly/i.test(desc)) f.status.add('Paralysis');
  if (/sleep/i.test(desc)) f.status.add('Sleep');
  f.oneTurn = /\b1 turn\b/i.test(desc);
  f.lux = /\bLux\b/.test(desc) ? (/vastly increases/i.test(desc) ? 3 : /greatly increases/i.test(desc) ? 2 : 1) : 0;
  f.prize = /attacks? prizes/i.test(desc);
  m = /uses (?:only )?(\d|no) special attack gauges?/i.exec(desc);
  f.gauge = m ? (m[1] === 'no' ? 0 : parseInt(m[1], 10)) : null;
  f.noCost = /for free/i.test(desc);
  f.chance = /fatal blow/i.test(desc);
  m = /enemies up to LV (\d+)/i.exec(desc);
  f.maxEnemyLv = m ? parseInt(m[1], 10) : null;
  f.max = /\bMax\b/.test(name);
  f.plus = /\+/.test(name);
  return f;
}

function family(name, desc) {
  const f = features(name, desc);
  const atk = f.attackUp !== undefined;
  if (f.chance) return 'Second Chance';
  if (f.noCost) return 'No Cost';
  if (f.damageCut !== undefined) return 'Defense Boost';
  if (f.all) return 'Attack Boost All';
  if (f.gauge !== null) return atk ? 'ATK & SP Gauge' : 'SP Attack Gauge';
  if (f.status.size && atk) return 'ATK & status';
  if (f.status.size > 1) return 'Triple Threat';
  if (f.status.size) return f.plus ? 'status+' : 'status';
  if (f.lux) return atk ? 'ATK & Lux' : 'Lux Plus';
  if (f.prize) return atk ? 'ATK & Prize' : 'Attack Prize Plus';
  if (atk) return 'Attack Boost';
  return 'altro';
}

// famiglie senza righe vere: famiglia da cui prendere la sorella (tipo di attivazione piu' vicino)
const FALLBACK = {
  'ATK & SP Gauge': 'Attack Boost',   // «Triggered when unleashing any attack», come Attack Boost Max
  'ATK & status': 'status+',          // stato di 1 turno con qualsiasi attacco, come Poison+/Paralysis+/Sleep+
  'Triple Threat': 'status+',
  altro: 'Attack Boost',
};

const EXTRA4 = ['value1', 'burstLock', 'pvpConditionTurn', 'pvpConditionCount'];
const LAST_501_ID = 1113;   // righe vere dell'APK 5.0.1 nel master (1100-1113); le altre del master sono generate

// value1 (client 4.3.1): riuscita di uno stato = rate del nemico * clamp(1 - X * value1 / 1e6, 0,
// 1), X = livello del nemico (deduzione: 5.0.1 Poison 1000 = fino al LV 999; il wiki «Effective on enemies up
// to LV 1999» = 500). Conta solo per le skill con stati: le altre tengono il neutro 10000 delle righe 5.0.1.
function value1For(f) {
  if (!f.status.size) return 10000;
  return f.maxEnemyLv ? Math.round(1e6 / (f.maxEnemyLv + 1)) : 1000;
}
// burstLock (client 4.3.1): costo fisso dello speciale quando la skill scatta, in gauge * 10000
// («uses only 1 special attack gauge» = 10000); 0 con burstCancel 0 = speciale gratis come No Cost.
const burstLockFor = (f) => (f.gauge ? f.gauge * 10000 : 0);

// righe vere di thethiny + i 4 campi del layout 4.3.1 (dalla riga 5.0.1 del master se c'e', altrimenti regola
// dalla descrizione)
function realSkillRows(thethinyRows, masterRows) {
  const master = new Map((masterRows || []).filter((r) => r.skillId <= LAST_501_ID).map((r) => [r.skillId, r]));
  return thethinyRows.map((t) => {
    const r = { ...t, ...ERA_431[t.skillId] };
    const m = master.get(t.skillId);
    const f = features(t.name, t.description);
    const rule = { value1: value1For(f), burstLock: burstLockFor(f), pvpConditionTurn: t.conditionTurn, pvpConditionCount: t.conditionCount };
    for (const k of EXTRA4) if (r[k] === undefined) r[k] = m && Number.isInteger(m[k]) ? m[k] : rule[k];
    return r;
  });
}

const topProb = (r) => r.invokeProb + r.invokeProbPerLv * (r.maxLv - 1);

// invokeProb (1/10000 al LV 1) dalla probabilita' massima del wiki, che e' TRONCATA all'intero (righe vere:
// 47.2% -> 47, 44.5% -> 44, 54.25% -> 54): il massimo vero sta in [pct*100, pct*100+99] (e <= 10000).
// Si sceglie il valore della sorella se ci sta, altrimenti l'unico multiplo di 100 nell'intervallo (tutte le
// 25 righe vere hanno invokeProb multiplo di 100 o il massimo esatto 10000, come le «Max» 9810).
function baseProb(triggerPct, perLv, maxLv, sisterProb) {
  const span = perLv * (maxLv - 1);
  const lo = Math.round(triggerPct * 100) - span;
  const hi = Math.min(lo + 99, 10000 - span);
  if (sisterProb !== undefined && sisterProb >= lo && sisterProb <= hi) return sisterProb;
  const round = Math.ceil(lo / 100) * 100;
  return round <= hi ? round : lo;
}

function skillRows(realRows, wikiSkills, schema) {
  const fields = schema.skill.map(([f]) => f);
  const order = (r) => Object.fromEntries(fields.map((f) => [f, r[f] === undefined ? 0 : r[f]]));
  const report = { rows: [], duplicates: [], noSister: [], shortened: [], families: {} };

  // doppioni del wiki
  const wiki = [];
  const seen = new Map();
  for (const w of wikiSkills) {
    const k = normName(w.name);
    if (seen.has(k)) { report.duplicates.push({ name: w.name, kept: seen.get(k).name }); continue; }
    seen.set(k, w);
    wiki.push(w);
  }

  // righe vere <-> wiki
  const real = realRows.map((r) => ({ ...r }));
  const realInfo = new Map();
  for (const r of real) {
    const w = seen.get(normName(r.name));
    if (!w) throw new Error(`riga vera ${r.skillId} «${r.name}» senza riga nel wiki`);
    const fam = family(r.name, r.description);
    realInfo.set(r.skillId, { wiki: w, family: fam, f: features(r.name, r.description) });
  }
  const realByWiki = new Map([...realInfo].map(([id, x]) => [x.wiki, id]));
  const realOf = (fam) => real.filter((r) => realInfo.get(r.skillId).family === fam);
  const maxRef = real.filter((r) => features(r.name, r.description).max)
    .sort((a, b) => a.skillId - b.skillId)[0];
  // luxUp per grado: «increases» = Lux Plus, «greatly» = combo vere, «vastly» = stima
  const luxOf = (lv) => Math.max(...real.filter((r) => features(r.name, r.description).lux === lv).map((r) => r.luxUp));
  const luxRef = { 1: luxOf(1), 2: luxOf(2), 3: LUX_VAST };
  const prizeRef = Math.max(...real.map((r) => r.prizeBurstUp).filter((v) => v > 10000));

  const out = [];
  for (const r of real) {
    const info = realInfo.get(r.skillId);
    const row = order(r);
    for (const k of ['name', 'description']) {
      const s = shortText(row[k]);
      if (s !== row[k]) report.shortened.push({ skillId: r.skillId, field: k, from: row[k], to: s });
      row[k] = s;
    }
    out.push(row);
    report.rows.push({ skillId: r.skillId, name: row.name, wikiName: info.wiki.name, triggerPct: info.wiki.triggerPct,
      real: true, family: info.family, sister: null });
  }

  let nextId = Math.max(FIRST_NEW_ID, ...real.map((r) => r.skillId + 1));
  let nextCat = Math.max(FIRST_NEW_CATEGORY, ...real.map((r) => r.categoryEvolve + 1));
  for (const w of wiki) {
    if (realByWiki.has(w)) continue;
    const fam = family(w.name, w.fullDescription);
    const f = features(w.name, w.fullDescription);
    let cands = realOf(fam);
    let note = '';
    if (!cands.length) {
      cands = realOf(FALLBACK[fam] || 'Attack Boost');
      note = `famiglia senza riga vera: sorella da «${FALLBACK[fam] || 'Attack Boost'}»`;
      if (!report.noSister.includes(fam)) report.noSister.push(fam);
    }
    if (fam === 'ATK & SP Gauge') cands = cands.filter((c) => features(c.name, c.description).max);
    const dist = (c) => {
      const cf = realInfo.get(c.skillId).f;
      let d = (c.maxLv === w.maxLv ? 0 : 1000) + (cf.max === f.max ? 0 : 500);
      if (f.status.size && ![...f.status].some((s) => cf.status.has(s))) d += 2000;
      d += Math.abs(topProb(c) / 100 - w.triggerPct);
      d += Math.abs((cf.attackUp || 10000) - (f.attackUp || 10000)) / 1000;
      return d;
    };
    const sister = cands.slice().sort((a, b) => dist(a) - dist(b) || a.skillId - b.skillId)[0];
    const row = { ...sister };
    row.skillId = nextId++;
    row.sortId = row.skillId;
    row.categoryEvolve = nextCat++;
    row.name = shortText(w.name);
    row.description = shortText(w.description);
    if (row.description !== w.description) report.shortened.push({ skillId: row.skillId, field: 'description', from: w.description, to: row.description });
    row.maxLv = w.maxLv;
    if (sister.maxLv !== w.maxLv) {
      // rank/expType: riga vera con lo stesso maxLv (prima della famiglia, poi la coppia piu' comune)
      const same = cands.filter((c) => c.maxLv === w.maxLv);
      const pool = same.length ? same : real.filter((c) => c.maxLv === w.maxLv);
      const count = new Map();
      for (const c of pool) { const k = `${c.rank}/${c.expType}`; count.set(k, (count.get(k) || 0) + 1); }
      const [rk, ex] = [...count].sort((a, b) => b[1] - a[1])[0][0].split('/').map(Number);
      row.rank = rk;
      row.expType = ex;
    }
    // probabilita'
    const sisterMax = realInfo.get(sister.skillId).f.max;
    row.invokeProbPerLv = f.max && !sisterMax ? maxRef.invokeProbPerLv : sister.invokeProbPerLv;
    row.invokeProb = baseProb(w.triggerPct, row.invokeProbPerLv, w.maxLv, sister.invokeProb);
    // potenza dalla descrizione
    row.attackUp = f.attackUp || 10000;
    row.damageCut = f.damageCut !== undefined ? f.damageCut : 10000;
    row.addPoison = f.status.has('Poison') ? 10000 : 0;
    row.addParalysis = f.status.has('Paralysis') ? 10000 : 0;
    row.addSleep = f.status.has('Sleep') ? 10000 : 0;
    row.addDeepPoison = 0;
    row.conditionTurn = f.status.size ? (f.oneTurn ? 1 : sister.conditionTurn || 1) : 0;
    row.conditionCount = f.status.size ? sister.conditionCount : 0;
    row.pvpConditionTurn = row.conditionTurn;
    row.pvpConditionCount = row.conditionCount;
    row.luxUp = f.lux ? luxRef[f.lux] : 10000;
    row.prizeBurstUp = f.prize ? prizeRef : 10000;
    row.burstCancel = f.noCost || f.gauge === 0 ? 1 : 0;
    row.burstLock = burstLockFor(f);
    row.value1 = value1For(f);
    row.dokonjo = f.chance ? 1 : 0;
    if (fam === 'ATK & SP Gauge') {
      // il costo dello speciale si legge al timing 5, il danno al timing 1:
      // invokeShowTiming 6 = timing 1 o 5 (un tiro per battaglia, poi sempre), invokeType 1 = nessun filtro.
      // Deduzione (nessuna riga vera con showTiming 6): da provare al banco.
      row.invokeType = 1;
      row.invokeShowTiming = 6;
      // icona: quella delle SP Attack Gauge (speciale), attivazione di Attack Boost Max
      const g = realOf('SP Attack Gauge')[0];
      if (g) row.thumbId = g.thumbId;
    }
    if (row.invokeProb < 0 || row.invokeProb > 10000) throw new Error(`${w.name}: invokeProb ${row.invokeProb}`);
    const done = order(row);
    out.push(done);
    report.rows.push({ skillId: done.skillId, name: done.name, wikiName: w.name, triggerPct: w.triggerPct,
      real: false, family: fam, sister: sister.skillId, sisterName: sister.name, note });
  }
  for (const x of report.rows) report.families[x.family] = (report.families[x.family] || 0) + 1;
  return { rows: out, report };
}

function skillExpRows(realExp) {
  return realExp.map((r) => ({ expId: r.expId, value: r.value.map((v) => Math.trunc(v)) }))
    .sort((a, b) => a.expId - b.expId);
}

function reportMarkdown(rows, report, exp) {
  const byId = new Map(rows.map((r) => [r.skillId, r]));
  const L = [];
  L.push('# Tabella skill (I-146) - report di generazione', '');
  L.push(`Generato da server/make-skill-table.js. Righe: ${rows.length} (${report.rows.filter((x) => x.real).length} vere + ` +
    `${report.rows.filter((x) => !x.real).length} ricostruite dal wiki); doppioni del wiki fusi: ${report.duplicates.length}; ` +
    `skillExp: ${exp.length} righe.`, '');
  L.push('## Famiglie', '');
  for (const [k, v] of Object.entries(report.families)) L.push(`- ${k}: ${v}`);
  L.push('', '## Famiglie senza sorella vera', '');
  if (!report.noSister.length) L.push('- nessuna');
  for (const fam of report.noSister) {
    const xs = report.rows.filter((x) => x.family === fam);
    L.push(`- ${fam} (${xs.length}): sorella ${[...new Set(xs.map((x) => `${x.sister} ${x.sisterName}`))].join(', ')}`);
  }
  if (report.duplicates.length) {
    L.push('', '## Doppioni del wiki', '');
    for (const d of report.duplicates) L.push(`- «${d.name}» fuso con «${d.kept}»`);
  }
  L.push('', '## Testi accorciati (<= 71 byte)', '');
  for (const s of report.shortened) L.push(`- ${s.skillId} ${s.field}: «${s.from}» -> «${s.to}»`);
  L.push('', '## Righe', '');
  L.push('| skillId | nome | vera | famiglia | sorella | maxLv | rank | expType | thumb | invokeType | showTiming | prob | perLv | trigger | attackUp | damageCut | stati | value1 | lux | prize | burstCancel | burstLock | note |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of report.rows) {
    const r = byId.get(x.skillId);
    const st = [r.addPoison && 'P', r.addParalysis && 'Pa', r.addSleep && 'S'].filter(Boolean).join('+') + (r.conditionTurn ? `/${r.conditionTurn}t` : '');
    L.push(`| ${r.skillId} | ${r.name} | ${x.real ? 'si' : ''} | ${x.family} | ${x.sister || ''} | ${r.maxLv} | ${r.rank} | ${r.expType} | ` +
      `${r.thumbId} | ${r.invokeType} | ${r.invokeShowTiming} | ${r.invokeProb} | ${r.invokeProbPerLv} | ${x.triggerPct}% | ${r.attackUp} | ${r.damageCut} | ${st} | ${r.value1} | ` +
      `${r.luxUp} | ${r.prizeBurstUp} | ${r.burstCancel} | ${r.burstLock} | ${x.note || ''} |`);
  }
  return L.join('\n') + '\n';
}

// scrive dir/skill.json, dir/skillExp.json e il report; sorgenti assenti: avviso, master invariato
function patch(dir) {
  const files = [path.join(DATA, 'skill.json'), path.join(DATA, 'skillExp.json'), WIKI];
  const missing = files.filter((f) => !fs.existsSync(f));
  if (missing.length) {
    console.warn(`make-skill-table: sorgenti assenti (${missing.join(', ')}), skill/skillExp del master invariati`);
    return null;
  }
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'recon', 'out', 'master_types_ww431.json'), 'utf8'));
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
  const masterFile = path.join(dir, 'skill.json');
  const master = fs.existsSync(masterFile) ? read(masterFile) : [];
  const real = realSkillRows(read(files[0]), master);
  const { rows, report } = skillRows(real, parseWikiSkills(readWikiMedalPage(WIKI)), schema);
  const exp = skillExpRows(read(files[1]));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(masterFile, JSON.stringify(rows));
  fs.writeFileSync(path.join(dir, 'skillExp.json'), JSON.stringify(exp));
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, reportMarkdown(rows, report, exp));
  console.log(`skill: ${rows.length} righe (${report.rows.filter((x) => x.real).length} vere), skillExp: ${exp.length}, ` +
    `senza sorella: ${report.noSister.join(', ') || 'nessuna'}; report ${REPORT}`);
  return { rows, report, exp };
}

module.exports = { ERA_431, readWikiMedalPage, parseWikiSkills, normName, shortText, features, family, baseProb, realSkillRows, skillRows, skillExpRows, patch };

if (require.main === module) patch(process.argv[2] || process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data'));
