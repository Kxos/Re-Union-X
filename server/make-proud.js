#!/usr/bin/env node
// Righe master `stage` della Proud Mode (I-200, docs/notes/mappe_storia.md#proud-mode, decisioni dell'utente del 22-10).
// Forma originale (unica riga intera rimasta: 1001010 «Prologue» del master 5.0.1, stage_base.json; 50 righe 1-50 nel
// master di thethiny, schema vecchio): stageKind 4, stageId = 1 000 000 + stageId della storia, id = 1 000 000 + numero,
// stageBinId = stageId della storia (il client carica la stessa mappa mappoi_stg<stageBinId>: stessi nemici e forzieri),
// addLevel = livello Proud - livello della storia (Q1: 210 - 1 = 209), holdKeyblade = keybladeId della serie (riga lv 0:
// 4000 Three Wishes), hardmodeRequire/Name/Comparison/Num = condizione sugli attacchi speciali, disableContinue 1,
// validStopStage 0, obiettivi propri; dalla 801 combinedSubmissionFlag 1 («Must clear all together»).
// Fonti: khuxwiki (wiki_all.json, campi proud* delle 979 pagine «Quest N: ...», 978 compresa: solo filmato con premi
// propri), riga 1001010 del 5.0.1 tenuta cosi' com'e' (originale). Le pagine «/Archive» si saltano.
// - AP: 0 su tutte (valore finale online: riga 1001010 del 5.0.1 useAp 0, screenshot 2019-07 Q300, 2019-09 Q321 e
//   2021-05 Q977 con AP 0; il 10 del master di thethiny (2017) e il default del template wiki sono il valore del lancio).
// - Jewel del primo completamento: proudnajewel della pagina (150 ogni 5 fino alla 800, 300 805-880, 600 885-979; la
//   guida dell'utente, scritta prima delle 800+, dice 150 e coincide fino alla 800).
// - Keyblade Proud (Sleeping Lion Q3, Counterpoint Q103, Fenrir Q203, Darkgnaw Q328, Missing Ache Q378, Diamond Dust
//   Q428): proudnakeyblade -> clearGetItem tipo 13 (come la 1001016 di thethiny: 13/8000).
// - Condizioni: CONDITION_FORMS (frasi della wiki) -> CODES (codici delle condizioni, ricerca del 22-10, vedi la nota).
//
//   node server/make-proud.js [cartella master]
// Idempotente; in fondo a make-game-tables.js (dopo make-story-oltre.js). KHUX_PROUD=0 lo spegne.
'use strict';

const fs = require('fs');
const path = require('path');
const { objectiveCodes } = require('./make-story-oltre');

const OFFSET = 1000000;
const FIRST = 1, LAST = 979;
const ORIGINAL_ROW = 1001010; // riga vera del 5.0.1 (Q1): resta com'e'
const COMBINED_FROM = 801; // prima pagina con proudall=* (la pagina «Proud Mode» dice «From Quest 800»: Q800 non ha il flag)
const FIELDS = ['stageId', 'stageBinId', 'id', 'name', 'mapName', 'useAp', 'chapterId', 'worldId', 'thumbId', 'onlyDrama',
  'stageKind', 'showIcon', 'hideIcon', 'noPartner', 'validStopStage', 'validBeforeDrama', 'beforeDramaId', 'beforeDramaType',
  'validAfterDrama', 'afterDramaId', 'afterDramaType', 'branchType', 'disableContinue', 'addLevel', 'holdKeyblade',
  'hardmodeRequire', 'hardmodeName', 'hardmodeComparison', 'hardmodeNum', 'validClearGetTitle', 'clearGetTitle',
  'validClearGetSphere', 'clearGetSphere', 'resetClearGet', 'validClearGetItem', 'clearGetItemType', 'clearGetItemId',
  'clearGetAssignSkillType', 'clearGetAssignSkillId', 'clearGetAssignSkillLv', 'clearGetItemNum', 'resetSubMission',
  'validSubmission', 'submissionRequire', 'submissionName', 'submissionDataType', 'submissionIdType', 'submissionId',
  'submissionNum', 'submissionRewardType', 'submissionItemId', 'submissionSkillType', 'submissionSkillId',
  'submissionSkillLv', 'submissionItemNum', 'combinedSubmissionFlag', 'raidBoss', 'bgmField', 'bgmBattle', 'bgmBoss'];
// campi copiati dalla riga di storia (1001010 e 1001016 di thethiny: stessi nomi, mappa, filmati, mondo, musica)
const FROM_STORY = ['name', 'mapName', 'chapterId', 'worldId', 'thumbId', 'onlyDrama', 'showIcon', 'hideIcon',
  'validBeforeDrama', 'beforeDramaId', 'beforeDramaType', 'validAfterDrama', 'afterDramaId', 'afterDramaType', 'branchType',
  'raidBoss', 'bgmField', 'bgmBattle', 'bgmBoss'];
// materiali dei premi (tabella material): Electrum Ore 55 (1001010: 5/55), Dark Matter 58, gemme 48-52, Mythril Shard 1
const MATERIALS = { 'Electrum Ore': 55, 'Dark Matter': 58, 'Power Gem': 48, 'Speed Gem': 49, 'Speedc Gem': 49,
  'Magic Gem': 50, 'Sun Gem': 51, 'Moon Gem': 52, 'Mythril Shard': 1 };

const num = (s) => parseInt(String(s || '').replace(/,/g, ''), 10) || 0;
const clean = (s) => String(s || '').replace(/<!--.*?-->/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
const field = (raw, k) => { const m = new RegExp(`\\|${k}=([^\\n|]*)`).exec(raw || ''); return m ? clean(m[1]) : null; };

// campi proud* di ogni pagina «Quest N: ...» (non /Archive) -> Map(numero -> dati)
function parseWiki(wikiAll) {
  const out = new Map();
  for (const [title, raw] of Object.entries(wikiAll)) {
    const m = /^Quest (\d+): (.+)$/.exec(title);
    if (!m || /\/Archive$/.test(title) || typeof raw !== 'string') continue;
    const n = Number(m[1]);
    if (n < FIRST || n > LAST || !/\|proud/.test(raw)) continue;
    const objectives = [];
    for (let k = 1; k <= 3; k++) {
      const text = field(raw, `proudnaobj${k}`);
      if (!text) continue;
      objectives.push({ text, reward: field(raw, `proudnaobjbonus${k}`), qty: field(raw, `proudnaobjbonus${k}qty`) || '1' });
    }
    out.set(n, { quest: n, title, lvl: num(field(raw, 'lvl')), proudlvl: num(field(raw, 'proudlvl')),
      ap: field(raw, 'proudap'), condition: field(raw, 'proudcon'), keyblade: field(raw, 'proudkey'),
      rewardKeyblade: field(raw, 'proudnakeyblade'), jewel: num(field(raw, 'proudnajewel')),
      title_: field(raw, 'proudnaqtitle'), powerGem: num(field(raw, 'proudnapowergem')), speedGem: num(field(raw, 'proudnaspeedgem')),
      allTogether: /\|proudall=\s*\*/.test(raw), objectives });
  }
  return out;
}

// ---- condizioni sugli attacchi speciali -> hardmodeRequire/Comparison/Num/Name ----------------------------------
// kind = forma della frase della wiki; i codici sono in CODES (ricerca del 22-10)
const CONDITION_FORMS = [
  [/^Special attacks (?:allowed only|only allowed) for (Power|Speed|Magic) Medals\.?$/i, (m) => ({ kind: m[1].toLowerCase() })],
  [/^Special attacks (?:allowed only|only allowed) for (Upright|Reversed) Medals\.?$/i, (m) => ({ kind: m[1].toLowerCase() })],
  [/^Special attacks allowed only for (\d+)★(?: or higher Medals)?\.?$/i, (m) => ({ kind: 'rarity_ge', n: num(m[1]) })],
  [/^Special attacks allowed only for level (\d+) or higher Medals\.?$/i, (m) => ({ kind: 'level_ge', n: num(m[1]) })],
  [/^Special attacks allowed only for Medals with ([\d,]+) or higher (STR|DEF)\.?$/i, (m) => ({ kind: `${m[2].toLowerCase()}_ge`, n: num(m[1]) })],
  [/^Only single-target special attacks allowed\.?$/i, () => ({ kind: 'single' })],
  [/^Only (?:multiple|mutliple|mulitple)-target special attacks allowed\.?$/i, () => ({ kind: 'multiple' })],
  [/^Only random-target special attacks allowed\.?$/i, () => ({ kind: 'random' })],
  [/^Only special attacks requiring (\d+) gauges? allowed\.?$/i, (m) => ({ kind: 'gauge_eq', n: num(m[1]) })],
  [/^Only special attacks requiring (\d+) or more gauges? allowed\.?$/i, (m) => ({ kind: 'gauge_ge', n: num(m[1]) })],
  [/^Only special attacks requiring (\d+) or fewer gauges? allowed\.?$/i, (m) => ({ kind: 'gauge_le', n: num(m[1]) })],
  // «requiring N or fewer hits» (1 pagina) = refuso per «dealing»
  [/^Only special attacks (?:dealing|requiring) (\d+) or fewer hits allowed\.?$/i, (m) => ({ kind: 'hits_le', n: num(m[1]) })],
  [/^Only special attacks dealing (\d+) or more hits allowed\.?$/i, (m) => ({ kind: 'hits_ge', n: num(m[1]) })],
  [/^Only special attacks dealing (\d+) hits allowed\.?$/i, (m) => ({ kind: 'hits_eq', n: num(m[1]) })],
  [/^Special attacks allowed only for Medals with a (?:special attacks?|SP attack) bonus value of (\d+) or more\.?$/i, (m) => ({ kind: 'spbonus_ge', n: num(m[1]) })],
  [/^Special attacks allowed only for Medals with a (?:special attacks?|SP attack) bonus value of (\d+) or less\.?$/i, (m) => ({ kind: 'spbonus_le', n: num(m[1]) })],
  [/^Special attacks allowed only for Medals with a (?:special attacks?|SP attack) bonus value of (\d+)\.?$/i, (m) => ({ kind: 'spbonus_eq', n: num(m[1]) })],
  [/^Only (\d+)-tier or more boosting special attacks allowed\.?$/i, (m) => ({ kind: 'tier_ge', n: num(m[1]) })],
  [/^Only special attacks with a (?:bonus|bonue) value of (\d+)% or higher allowed\.?$/i, (m) => ({ kind: 'bonuspct_ge', n: num(m[1]) })],
];

// Codici delle condizioni per forma (ricerca del 22-10, note private): per ogni medaglia della missione
// hardmodeRequire 0/1 = nessun limite, >= 15 = sempre falso; hardmodeComparison
// 1 valore == Num, 2 valore <= Num, 3 valore >= Num. Una medaglia che non passa non puo' usare lo speciale.
// Il popup formatta hardmodeName con Num (Num/100 per il 13): un solo %d, %% per il simbolo.
// req = hardmodeRequire, cmp = hardmodeComparison, num = Num fisso, scale = Num / N della frase.
//  2 attributo (1 Power, 2 Speed, 3 Magic)   3 darklight (1 Upright, 2 Reversed)   5 rarita'   6 tier della guilt
//  7 livello   8 STR (con la fusione, senza keyblade)   9 DEF   10 gauge dello speciale   11 colpi dello speciale
//  12 «+N» del bonus dello speciale (fusione)   13 bonus % x100   14 bersaglio (1 singolo, 2 tutti, 3 casuale)
const CODES = {
  power: { req: 2, cmp: 1, num: 1 }, speed: { req: 2, cmp: 1, num: 2 }, magic: { req: 2, cmp: 1, num: 3 },
  upright: { req: 3, cmp: 1, num: 1 }, reversed: { req: 3, cmp: 1, num: 2 },
  rarity_ge: { req: 5, cmp: 3 }, tier_ge: { req: 6, cmp: 3 }, level_ge: { req: 7, cmp: 3 },
  str_ge: { req: 8, cmp: 3 }, def_ge: { req: 9, cmp: 3 },
  gauge_eq: { req: 10, cmp: 1 }, gauge_le: { req: 10, cmp: 2 }, gauge_ge: { req: 10, cmp: 3 },
  hits_eq: { req: 11, cmp: 1 }, hits_le: { req: 11, cmp: 2 }, hits_ge: { req: 11, cmp: 3 },
  spbonus_eq: { req: 12, cmp: 1 }, spbonus_le: { req: 12, cmp: 2 }, spbonus_ge: { req: 12, cmp: 3 },
  // testo della 1001010 (5.0.1) tale e quale
  bonuspct_ge: { req: 13, cmp: 3, scale: 100, name: 'Only special attacks with a\nbonus value of %d%% or\nhigher allowed.' },
  single: { req: 14, cmp: 1, num: 1 }, multiple: { req: 14, cmp: 1, num: 2 }, random: { req: 14, cmp: 1, num: 3 },
};

// testo della condizione: refusi della wiki corretti, punto finale (la 1001010 e lo screenshot rd_x94ey7mwud141 lo hanno)
const FIX_TEXT = [[/mutliple|mulitple/g, 'multiple'], [/bonue/g, 'bonus'], [/special attacks bonus/g, 'special attack bonus'],
  [/^Special attacks only allowed for/, 'Special attacks allowed only for'], [/^Only Special/, 'Only special'],
  [/requiring (\d+) or fewer hits/, 'dealing $1 or fewer hits']];
function conditionText(text) {
  let t = clean(text);
  for (const [re, to] of FIX_TEXT) t = t.replace(re, to);
  if (/★$/.test(t)) t += ' or higher Medals';
  return /[.!]$/.test(t) ? t : t + '.';
}

function conditionForm(text) {
  const t = clean(text);
  for (const [re, f] of CONDITION_FORMS) { const m = re.exec(t); if (m) return f(m); }
  return null;
}

// testo della condizione nel formato del master (righe di <= 28 caratteri come «Only special attacks dealing\n...»)
function wrapName(s, width = 28) {
  const lines = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if (cur && (cur + ' ' + w).length > width) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

function conditionCodes(text, codes = CODES) {
  const f = conditionForm(text);
  if (!f) return null;
  const c = codes[f.kind];
  if (!c) return { form: f, codes: null };
  const n = c.num !== undefined ? c.num : (f.n || 0) * (c.scale || 1);
  // il numero della frase -> %d (il client lo rimette da hardmodeNum); senza numero il testo resta com'e'
  const name = c.name || wrapName(conditionText(text).replace(/%/g, '%%').replace(/\d[\d,]*/, f.n === undefined ? (x) => x : '%d'));
  return { form: f, codes: { hardmodeRequire: c.req, hardmodeComparison: c.cmp, hardmodeNum: n, hardmodeName: name } };
}

// ---- obiettivi ------------------------------------------------------------------------------------------------
// forme della wiki Proud che make-story-oltre.js non conosce, ricondotte alle sue (stessi codici)
// e codici nuovi (EXTRA_OBJECTIVES, ricerca del 22-10)
// 34/35: medaglie proprie equipaggiate Upright/Reversed >= num (le prestate non contano mai: la
// «(No borrowed Medals)» della 935 e' la stessa 35); dataType 2 col %d
const EXTRA_OBJECTIVES = [
  [/^Equip (\d+) or more (Upright|Reversed) Medals$/i, (m) => ({ name: `Equip %d or more ${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} Medals`,
    req: /^u/i.test(m[2]) ? 34 : 35, dt: 2, it: 0, id: 0, n: num(m[1]) })],
  [/^Use (\d+) or more Reversed Medals \(No borrowed Medals\)$/i, (m) => ({ name: 'Use %d or more Reversed Medals\n(No borrowed Medals)', req: 35, dt: 2, it: 0, id: 0, n: num(m[1]) })],
];
function proudObjective(text, ctx) {
  let t = clean(text).replace(/^Complete in /i, 'Complete within ').replace(/''/g, '"');
  let m;
  if ((m = /^Deal (\d[\d,]*) or (?:less|fewer) hits$/i.exec(t))) return { name: t, req: 32, dt: 2, it: 0, id: 0, n: num(m[1]) };
  for (const [re, f] of EXTRA_OBJECTIVES) if ((m = re.exec(t))) return f(m, t);
  return objectiveCodes(t, ctx);
}

function objectiveReward(o, ctx) {
  const q = num(o.qty) || 1;
  if (o.reward === 'Avatar Coin') return [14, 0, q];
  if (o.reward === 'Jewel') return [2, 0, q];
  if (o.reward in MATERIALS) return [5, MATERIALS[o.reward], q];
  const id = ctx.medalId(o.reward);
  return id ? [3, id, q] : null;
}

function setClear(row, items) {
  Object.assign(row, { validClearGetItem: items.length, clearGetItemType: items.map((x) => x[0]),
    clearGetItemId: items.map((x) => x[1]), clearGetAssignSkillType: items.map(() => 1), clearGetAssignSkillId: items.map(() => 0),
    clearGetAssignSkillLv: items.map(() => 1), clearGetItemNum: items.map((x) => x[2]) });
}

// obiettivi come la 1001010: medaglia con submissionSkillType 1 / SkillLv 1, il resto 0
function setSubs(row, subs) {
  const pad = (f) => [0, 1, 2].map((i) => (i < subs.length ? f(subs[i]) : 0));
  Object.assign(row, { validSubmission: subs.length,
    submissionRequire: pad(([c]) => c.req), submissionName: [0, 1, 2].map((i) => (i < subs.length ? subs[i][0].name : '')),
    submissionDataType: pad(([c]) => c.dt), submissionIdType: pad(([c]) => c.it), submissionId: pad(([c]) => c.id),
    submissionNum: pad(([c]) => c.n), submissionRewardType: pad(([, r]) => r[0]), submissionItemId: pad(([, r]) => r[1]),
    submissionSkillType: pad(([, r]) => (r[0] === 3 ? 1 : 0)), submissionSkillId: [0, 0, 0],
    submissionSkillLv: pad(([, r]) => (r[0] === 3 ? 1 : 0)), submissionItemNum: pad(([, r]) => r[2]) });
}

// stageRows: tabella stage (storia kind 1 con id 1-979); proud: parseWiki(); sources: medal, keyblade, title, enemy,
// stagePoi (nemici della mappa: «Defeat the X» col nemico che c'e' davvero), original (riga 1001010)
function buildRows(stageRows, proud, sources = {}) {
  const { medals = [], keyblades = [], titles = [], enemies = [], skills = [], stagePoi = {}, original = null, codes = CODES } = sources;
  const report = { stopgapObjectives: [], missingRewards: [], unmappedConditions: [], uncodedConditions: [], missingStory: [],
    missingKeyblade: [], noCondition: [] };
  const story = new Map(stageRows.filter((r) => r.stageKind === 1 && r.stageId < 100000 && r.id >= FIRST && r.id <= LAST).map((r) => [r.id, r]));
  const baseKb = new Map(keyblades.filter((k) => !k.lv).map((k) => [k.name, k.keybladeId]));
  const medalId = (label) => {
    const m = /^(.+?)\s*(\d*)★$/.exec(String(label || '').trim());
    if (!m) return 0;
    const rare = num(m[2]) || 1;
    return (medals.filter((x) => x.name === m[1] && x.rare === rare).sort((a, b) => a.medalId - b.medalId)[0] || {}).medalId || 0;
  };
  const rows = [];
  for (let n = FIRST; n <= LAST; n++) {
    const q = proud.get(n);
    const st = story.get(n);
    if (!q) continue;
    if (!st) { report.missingStory.push(n); continue; }
    const stageId = OFFSET + st.stageId;
    if (stageId === ORIGINAL_ROW && original) { rows.push(JSON.parse(JSON.stringify(original))); continue; }
    const row = { stageId, stageBinId: st.stageId, id: OFFSET + n, useAp: 0, stageKind: 4, noPartner: 0, validStopStage: 0,
      disableContinue: 1, addLevel: q.proudlvl && q.lvl ? q.proudlvl - q.lvl : 0, holdKeyblade: 0, hardmodeRequire: 0,
      hardmodeName: 'strDummy', hardmodeComparison: 1, hardmodeNum: 0, validClearGetTitle: 0, clearGetTitle: 0,
      validClearGetSphere: 0, clearGetSphere: 0, resetClearGet: 0, resetSubMission: 0,
      combinedSubmissionFlag: q.allTogether ? 1 : 0 };
    for (const k of FROM_STORY) row[k] = JSON.parse(JSON.stringify(st[k]));
    if (q.keyblade) {
      row.holdKeyblade = baseKb.get(q.keyblade) || 0;
      if (!row.holdKeyblade) report.missingKeyblade.push([n, q.keyblade]);
    }
    // 891, 892, 913: nessuna condizione nella pagina e «—» nella tabella della pagina «Proud Mode» -> hardmodeRequire 0
    // (nessun limite per il client)
    if (!q.condition && n !== 978) report.noCondition.push(n);
    if (q.condition) {
      const c = conditionCodes(q.condition, codes);
      if (!c) report.unmappedConditions.push([n, q.condition]);
      else if (!c.codes) report.uncodedConditions.push([n, c.form.kind, q.condition]);
      else Object.assign(row, c.codes);
    }
    // nemici della mappa per «Defeat the X»: l'id che lo stage ha davvero, poi il piu' piccolo col nome
    const inMap = new Set(((stagePoi[st.stageId] || {}).enemies || []).map((e) => e.enemyId));
    const target = st.submissionRequire && st.submissionRequire.indexOf(12) >= 0 ? st.submissionId[st.submissionRequire.indexOf(12)] : 0;
    const ctx = { target, targetName: '', keybladeId: (name) => baseKb.get(name) || 0, skillId: (name) => (skills.find((x) => x.name === name) || {}).skillId || 0, header: null,
      enemyId: (name) => {
        const x = name.trim().toLowerCase();
        const ids = enemies.filter((e) => String(e.name).toLowerCase() === x).map((e) => e.enemyId).sort((a, b) => a - b);
        return ids.find((id) => inMap.has(id)) || ids[0] || 0;
      } };
    const subs = [];
    for (const [i, o] of q.objectives.slice(0, 3).entries()) {
      let c = proudObjective(o.text, ctx);
      if (!c) { report.stopgapObjectives.push([n, i + 1, o.text]); c = { name: clean(o.text), req: 10, dt: 1, it: 0, id: 0, n: 0 }; }
      let rw = objectiveReward(o, { medalId });
      if (!rw) { report.missingRewards.push([n, i + 1, o.reward]); rw = [0, 0, 0]; }
      subs.push([c, rw]);
    }
    setSubs(row, subs);
    const clear = [];
    if (q.jewel) clear.push([2, 0, q.jewel]);
    if (q.rewardKeyblade) {
      const kb = baseKb.get(q.rewardKeyblade);
      if (kb) clear.push([13, kb, 1]); else report.missingRewards.push([n, 'clear', q.rewardKeyblade]);
    }
    if (q.powerGem) clear.push([5, MATERIALS['Power Gem'], q.powerGem]);
    if (q.speedGem) clear.push([5, MATERIALS['Speed Gem'], q.speedGem]);
    setClear(row, clear.slice(0, 3));
    if (q.title_) {
      const t = titles.find((x) => x.title === q.title_);
      if (t) Object.assign(row, { validClearGetTitle: 1, clearGetTitle: t.titleId }); else report.missingRewards.push([n, 'title', q.title_]);
    }
    rows.push(Object.fromEntries(FIELDS.map((k) => [k, row[k]])));
  }
  Object.defineProperty(rows, 'report', { value: report });
  return rows;
}

const isProud = (r) => r.stageKind === 4 && r.stageId > OFFSET && r.stageId < OFFSET + 100000;
const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } };
function readRequired(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { throw new Error(`proud: fonte obbligatoria ${p}: ${e.message}`); }
}

function defaultSources() {
  return {
    wikiAll: readRequired(process.env.KHUX_WIKI_ALL || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json'),
    stagePoi: readJson(path.join(__dirname, 'game_data', 'stage_poi.json'), {}),
  };
}

// righe Proud in fondo alla tabella stage, al posto di quelle di un giro precedente (la 1001010 del 5.0.1 resta)
function patch(masterDir, src) {
  if (process.env.KHUX_PROUD === '0') { console.log('proud: spento (KHUX_PROUD=0)'); return 0; }
  const file = path.join(masterDir, 'stage.json');
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t = (name) => readJson(path.join(masterDir, name + '.json'), []);
  // la riga vera della Q1: da stage_base.json (import-master.js, 5.0.1), poi quella gia' in stage.json
  const isOrig = (r) => r.stageId === ORIGINAL_ROW && r.stageKind === 4;
  const original = t('stage_base').find(isOrig) || all.find(isOrig) || null;
  const stages = all.filter((r) => !isProud(r));
  const s = src || defaultSources();
  const rows = buildRows(stages, parseWiki(s.wikiAll), { medals: t('medal'), keyblades: t('keyblade'), titles: t('title'),
    enemies: t('enemy'), skills: t('skill'), stagePoi: s.stagePoi, original });
  fs.writeFileSync(file, JSON.stringify([...stages, ...rows]));
  const rep = rows.report;
  console.log(`proud: ${rows.length} missioni Proud (${original ? '1001010 originale' : '1001010 generata'}); `
    + `${rep.stopgapObjectives.length} obiettivi tappabuchi, ${rep.missingRewards.length} premi non ricavati, `
    + `${rep.unmappedConditions.length} condizioni non riconosciute, ${rep.uncodedConditions.length} senza codice, `
    + `${rep.missingKeyblade.length} keyblade non trovati, senza condizione: ${rep.noCondition.join(', ') || 'nessuna'}, ${rep.missingStory.length} senza riga di storia`);
  return rows.length;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { OFFSET, ORIGINAL_ROW, COMBINED_FROM, CODES, conditionText, CONDITION_FORMS, MATERIALS, parseWiki, conditionForm, conditionCodes,
  wrapName, proudObjective, buildRows, patch, isProud, defaultSources };
