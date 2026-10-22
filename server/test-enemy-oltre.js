// Prova delle righe enemy delle missioni 526-979 (make-enemy-oltre.js, I-009, decisione D-A dell'utente 21-10):
//   node server/test-enemy-oltre.js
// Prima parte con dati finti; poi (se ci sono) su una COPIA del master in D:\Progetto_Restauro_KH_UX\tmp con
// enemies_oltre525.json vero, e gli obiettivi «Defeat X» di make-story-oltre.js sulla copia (Review Focus 4).
'use strict';
const fs = require('fs'), path = require('path');
const { enemyRowsFor, addRows, patch, isClone, baseOf, familyOf, drawnDisplays, defaultSources, MAX_ID, DR_LOOK } = require('./make-enemy-oltre');
const TMP = process.env.KHUX_TMP || 'D:\\Progetto_Restauro_KH_UX\\tmp';
fs.mkdirSync(TMP, { recursive: true });
const tmpDirs = [];
const mkTmp = () => { const d = fs.mkdtempSync(path.join(TMP, 'enemy-oltre-')); tmpDirs.push(d); return d; };
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// --- dati finti ----------------------------------------------------------------------------------------------
const row = (id, name, extra = {}) => ({ enemyId: id, name, flavor: `f${id}`, displayId: 17, show: 2, showSwf: 2, attribute: 1,
  validGrowth: 5, baseLv: [1, 35, 100, 300, 999], hp: [100, 200, 300, 400, 500], attack: [1, 2, 3, 4, 5], defense: [9, 9, 9, 9, 9],
  skillId: [100, 101], moveSpeed: 2, width: 52, height: 98, ...extra });
const shadow = row(80001, 'Shadow', { displayId: 1 });
const base = row(1501, 'Soldier Base', { displayId: 1 });
const base5 = row(10117, 'Blue Saucer T1', { displayId: 117, hp: [5200, 9000, 1, 1, 1] }); // tier 1 + famiglia 117
const base4 = row(117, 'Blue Saucer', { displayId: 117, hp: [2700, 4700, 1, 1, 1] });
const tpl = row(24, 'Armored Archer', { displayId: 24, attribute: 2, skillId: [7, 8], width: 70 });
const named = row(1516, 'Diver', { displayId: 1 });
const enemies = [shadow, base, base5, base4, tpl, named, row(1, 'Shadow', { displayId: 1 })];
const missing = {
  160911501: { missions: [600], base: 1501 },  // 9 cifre: 11501 assente -> base a 4 cifre 1501
  1602111501: { missions: [601], base: 1501 }, // 10 cifre: 11501 assente -> 1501
  190110117: { missions: [606], base: 117 },   // 9 cifre: 10117 c'e' -> base a 5 cifre (non 117)
  160910999: { missions: [602], base: 999 },   // base assente, senza proposta -> fuori
  11516: { missions: [603] },                  // solo JP con fonte (stats) -> riga
  1500: { missions: [604] },                   // solo JP: proposta, famiglia 1500 con grafica servita
  255: { missions: [607] },                    // solo JP: proposta, famiglia 255 senza grafica -> grafica della base
  1905001500: { missions: [608] },             // lungo della famiglia 1500: riusa il clone della corta 1500
  17111501: { missions: [605] },               // 8 cifre: non e' un clone esatto (D-A: 9-10 cifre), senza proposta -> fuori
};
const stats = { 11516: { name: 'Diver', hp: [11, 22, 33, 44, 55], attack: [6, 7, 8, 9, 10], source: 'https://www.khuxwiki.com/wiki/X' } };
const proposal = {
  1500: { base: 24, confidence: 'low', name: "Bunch O' Balloons", attribute: null, reason: 'r1' },
  255: { base: 24, confidence: 'medium', name: null, attribute: 3, reason: 'r2' },
  1905001500: { base: 17, confidence: 'low', name: 'x', attribute: 1, reason: 'non usata: riusa la corta' },
};
const drawn = new Set([1, 17, 24, 117, 1500, 5075]);

check(isClone(160911501) && isClone(1602111501) && !isClone(17111501) && !isClone(1501), 'isClone: solo id di 9-10 cifre');
check(baseOf(190110117, (x) => [10117, 117].includes(x)) === 10117 && baseOf(160921501, (x) => x === 1501) === 1501
  && baseOf(160921501, () => false) === null, 'baseOf: 5 cifre se la riga esiste, se no 4');
check(familyOf(11516) === 1516 && familyOf(255) === 255 && familyOf(1905001500) === 1500 && familyOf(17112004) === 2004, 'familyOf');
// dati di comparsa JP (json/enemy/detail<displayId>.json, 21-10 Task 7): solo per la grafica della famiglia;
// show/showSwf solo se l'effetto e' servito (shows), se no restano quelli della base
const details = { 1500: { show: 2, show_swf: 12, show_frame: 19, hide_frame: 1, speed: 4, hit_radius: 33, width: 111, height: 222 },
  24: { width: 999 } };
const shows = new Set([1, 2]);
const res = enemyRowsFor(missing, enemies, { stats, proposal, drawn, details, shows });
const byId = new Map(res.rows.map((r) => [r.enemyId, r]));
const c = byId.get(160911501);
check(c && c.name === base.name && JSON.stringify(c.hp) === JSON.stringify(base.hp) && c.flavor === base.flavor
  && c.displayId === base.displayId && JSON.stringify(c.skillId) === JSON.stringify(base.skillId), 'clone esatto della base a 4 cifre');
check(c && c !== base && c.hp !== base.hp, 'clone: copia profonda, la base non cambia');
check(byId.has(1602111501), 'clone anche per 10 cifre');
const c5 = byId.get(190110117);
check(c5 && c5.hp[0] === 5200 && c5.name === base5.name, `base a 5 cifre preferita: hp ${c5 && c5.hp[0]}`);
check(res.sources[190110117].kind === 'exact-clone' && res.sources[190110117].base === 10117, 'fonte: exact-clone 10117');
const j = byId.get(11516);
check(j && j.name === 'Diver' && j.hp.join() === '11,22,33,44,55' && j.attack.join() === '6,7,8,9,10',
  'solo JP con fonte: nome, HP e attacco della fonte');
const f = byId.get(1500);
check(f && f.name === "Bunch O' Balloons" && f.attribute === 2 && f.displayId === 1500 && JSON.stringify(f.hp) === JSON.stringify(tpl.hp) && JSON.stringify(f.baseLv) === JSON.stringify(tpl.baseLv)
  && JSON.stringify(f.defense) === JSON.stringify(tpl.defense) && JSON.stringify(f.skillId) === '[7,8]' && f.tapRadius === tpl.tapRadius,
  'clone di famiglia: curve e battaglia della base, nome della proposta, attributo della base se ignoto, grafica della famiglia');
check(f && f.width === 111 && f.height === 222 && f.hitRadius === 33 && f.moveSpeed === 4,
  `dettaglio JP della famiglia: ${f && [f.width, f.height, f.hitRadius, f.moveSpeed]}`);
check(f && f.show === tpl.show && f.showSwf === tpl.showSwf, 'show_swf 12 non servito: comparsa della base');
check(res.sources[1500].graphic === 'family' && res.sources[1500].detail === true, `fonte grafica 1500: ${JSON.stringify(res.sources[1500])}`);
const res2 = enemyRowsFor({ 1500: { missions: [1] } }, enemies, { proposal, drawn, details, shows: new Set([12]) });
check(res2.rows[0].showSwf === 12 && res2.rows[0].show === 2 && res2.rows[0].showFrame === 19, 'show_swf servito: comparsa JP');
const g = byId.get(255);
check(g && g.name === tpl.name && g.attribute === 3 && g.displayId === 24, 'famiglia senza grafica -> grafica della base; nome della base se ignoto');
check(g && g.width === tpl.width && res.sources[255].graphic === 'base' && !res.sources[255].detail,
  'grafica della base: niente dettaglio JP (nemmeno quello del displayId della base)');
check(res.sources[1500].kind === 'family-clone' && res.sources[1500].confidence === 'low' && res.sources[255].confidence === 'medium',
  'fonte: family-clone con la confidenza');
const l = byId.get(1905001500);
check(l && l.name === f.name && l.displayId === 1500 && res.sources[1905001500].via === 1500, 'id lungo riusa il clone della corta');
check(!byId.has(160910999) && !byId.has(17111501), 'senza base o proposta: nessuna riga inventata');
const unc = res.uncovered.map((u) => u.enemyId).sort((a, b) => a - b);
check(JSON.stringify(unc) === JSON.stringify([17111501, 160910999]), `scoperti elencati: ${unc}`);
check(res.cloned === 3 && res.fromStats === 1 && res.family === 3, `conteggi ${res.cloned}/${res.fromStats}/${res.family}`);
check(res.rows.every((r) => drawn.has(r.displayId)), 'ogni riga con una grafica servita');
// aspetto Dark Road della stessa specie (DR_LOOK, I-194): solo senza la grafica della famiglia e con la DR servita;
// taglia dal dettaglio JP della famiglia
const drLook = { 255: { displayId: 5075, confidence: 'high' }, 1500: { displayId: 5075, confidence: 'high' } };
const rd = enemyRowsFor({ 255: { missions: [1] }, 1500: { missions: [2] }, 1905001500: { missions: [3] } }, enemies,
  { proposal, drawn, details: { 255: { width: 77, show_swf: 1, show: 1, show_frame: 3, hide_frame: 4 } }, shows, drLook });
const rdBy = new Map(rd.rows.map((r) => [r.enemyId, r]));
check(rdBy.get(255).displayId === 5075 && rd.sources[255].graphic === 'dark-road' && rd.sources[255].drConfidence === 'high'
  && rdBy.get(255).width === 77 && rdBy.get(255).showFrame === 3, `DR: 255 -> 5075 col dettaglio JP: ${JSON.stringify(rd.sources[255])}`);
check(rdBy.get(1500).displayId === 1500 && rd.sources[1500].graphic === 'family', 'DR: la grafica originale della famiglia vince');
const rd2 = enemyRowsFor({ 255: { missions: [1] } }, enemies, { proposal, drawn: new Set([24]), drLook });
check(rd2.rows[0].displayId === 24 && rd2.sources[255].graphic === 'base', 'DR non servita: grafica della base');
check(Object.entries(DR_LOOK).every(([f, v]) => Number(f) < 5000 && v.displayId > 0 && ['high', 'medium'].includes(v.confidence) && v.note),
  'DR_LOOK: famiglia KHUX -> displayId Dark Road (or a UX look since 22-10), confidenza high/medium, nota');
// gia' presenti: niente doppioni
const again = enemyRowsFor(missing, enemies.concat(res.rows), { stats, proposal, drawn });
check(again.rows.length === 0, `seconda corsa: +${again.rows.length}`);
// id oltre 2^31-1: il client li legge come int a 32 bit
let threw = false;
try { enemyRowsFor({ 2147483648: { missions: [1] } }, enemies, {}); } catch { threw = true; }
check(threw && MAX_ID === 2 ** 31 - 1, 'id >= 2^31 rifiutato');

// addRows: in memoria, rigenera (strip) le righe di un giro precedente
const mem = enemies.map((r) => ({ ...r })).concat([{ ...row(1500, 'vecchia') }]);
const outDir = mkTmp();
const rep = addRows(mem, { missing, stats, proposal, drawn, sourcesOut: path.join(outDir, 'src.json') });
check(rep.added === 7 && mem.length === enemies.length + 7 && mem.find((r) => r.enemyId === 1500).name !== 'vecchia', `addRows: +${rep.added}`);
const saved = JSON.parse(fs.readFileSync(path.join(outDir, 'src.json'), 'utf8'));
check(saved.sources['1500'].kind === 'family-clone' && saved.uncovered.length === 2, 'fonti scritte su file');

// alleati ospiti (I-199): righe dalla riga originale `template`, nome del personaggio, mai cloni ne' proposte; grafica
// della famiglia se servita, se no il sosia; anche le righe alleate del master (nome e grafica)
const herc = row(2001, 'sEnm_2001', { displayId: 17, width: 210, height: 283, skillId: [200100, 200101, 200100, 0] });
const allyTab = { 2001: { name: 'Hercules', template: 2001, look: 2001, confidence: 'high' },
  2004: { name: 'Aladdin', template: 2001, look: 2001, confidence: 'high' },
  2024: { name: 'Lauriam', template: 2001, look: 2003, confidence: 'medium' } };
const allyMissing = { 17112004: { missions: [760] }, 2103002024: { missions: [977] }, 18072001: { missions: [825] } };
const allyProp = { 17112004: { base: 24, confidence: 'low', name: null, reason: 'Cerberus' }, 2103002024: { base: 24, reason: 'Wyvern' } };
const al = enemyRowsFor(allyMissing, enemies.concat([herc]), { proposal: allyProp, drawn: new Set([2001, 2003, 24]), allies: allyTab });
const alBy = new Map(al.rows.map((r) => [r.enemyId, r]));
check(al.allies === 3 && alBy.get(17112004).name === 'Aladdin' && alBy.get(17112004).displayId === 2001
  && al.sources[17112004].kind === 'ally' && al.sources[17112004].graphic === 'look-alike', `alleato 17112004: ${JSON.stringify(al.sources[17112004])}`);
check(JSON.stringify(alBy.get(17112004).skillId) === JSON.stringify(herc.skillId) && alBy.get(17112004).width === 210
  && JSON.stringify(alBy.get(17112004).hp) === JSON.stringify(herc.hp), 'alleato: curve, mosse e taglia della riga originale');
check(alBy.get(2103002024).name === 'Lauriam' && alBy.get(2103002024).displayId === 2003, 'alleato lungo: sosia 2003');
check(alBy.get(18072001).name === 'Hercules' && alBy.get(18072001).displayId === 2001 && al.sources[18072001].graphic === 'family',
  'alleato della famiglia servita: grafica propria');
const al2 = enemyRowsFor(allyMissing, enemies.concat([herc]), { proposal: allyProp, drawn: new Set([24]), allies: allyTab });
check(al2.rows.every((r) => r.displayId === 17) && al2.sources[17112004].graphic === 'template', 'alleato senza grafica servita: resta quella della riga originale');
const memA = enemies.map((r) => ({ ...r })).concat([{ ...herc }, { ...herc, enemyId: 12001 }]);
const repA = addRows(memA, { missing: allyMissing, proposal: allyProp, drawn: new Set([2001, 2003]), allies: allyTab });
check(repA.allies === 3 && repA.alliesBase === 2 && memA.filter((r) => [2001, 12001].includes(r.enemyId))
  .every((r) => r.name === 'Hercules' && r.displayId === 2001), 'righe alleate del master: nome e grafica');

// --- dati veri su una copia del master ---------------------------------------------------------------------
const MASTER = path.join(__dirname, 'master_data');
const MISSING = process.env.KHUX_ENEMIES_OLTRE525 || 'D:\\Progetto_Restauro_KH_UX\\reference\\world_schema\\oltre525\\enemies_oltre525.json';
if (fs.existsSync(path.join(MASTER, 'enemy.json')) && fs.existsSync(MISSING)) {
  const dir = mkTmp();
  for (const f of ['enemy', 'enemy_display_orig', 'stage', 'theater', 'title', 'medal', 'keyblade', 'skill']) {
    const p = path.join(MASTER, f + '.json');
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dir, f + '.json'));
  }
  const all = JSON.parse(fs.readFileSync(MISSING, 'utf8')).missing;
  // master gia' rifatto con questo patch (Task 6, 21-10): le sue righe via, come strip(), cosi' «prima» = master senza
  const before = JSON.parse(fs.readFileSync(path.join(dir, 'enemy.json'), 'utf8')).filter((r) => !(String(r.enemyId) in all));
  fs.writeFileSync(path.join(dir, 'enemy.json'), JSON.stringify(before));
  const beforeIds = new Set(before.map((r) => r.enemyId));
  const drawn = drawnDisplays();
  const srcOut = path.join(dir, 'enemy_oltre_sources.json');
  const r1 = patch(dir, { ...defaultSources(), drawn, sourcesOut: srcOut });
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'enemy.json'), 'utf8'));
  const afterIds = new Set(after.map((r) => r.enemyId));
  const ids = Object.keys(all).map(Number);
  const uncIds = new Set(r1.uncovered.map((u) => u.enemyId));
  check(ids.every((id) => afterIds.has(id) || uncIds.has(id)), 'ogni id dei 312 nel master o fra gli scoperti');
  check(r1.uncovered.length === 0, `scoperti con la proposta: ${r1.uncovered.map((u) => u.enemyId).join(' ')}`);
  check(r1.added + r1.uncovered.length === ids.filter((id) => !beforeIds.has(id)).length,
    `aggiunti ${r1.added} + scoperti ${r1.uncovered.length} = mancanti`);
  check(after.every((r) => r.enemyId > 0 && r.enemyId <= MAX_ID), 'nessun id oltre 2^31-1');
  const byIdA = new Map(after.map((r) => [r.enemyId, r]));
  const clones = ids.filter((id) => isClone(id) && baseOf(id, (x) => beforeIds.has(x)) !== null);
  check(clones.length > 0 && clones.every((id) => {
    const x = byIdA.get(id), b = byIdA.get(baseOf(id, (y) => beforeIds.has(y)));
    return x && x.name === b.name && JSON.stringify(x.hp) === JSON.stringify(b.hp) && x.displayId === b.displayId;
  }), `${clones.length} cloni = base a 5/4 cifre (nome, HP, displayId)`);
  const five = clones.filter((id) => beforeIds.has(id % 100000) && beforeIds.has(id % 10000)
    && JSON.stringify(byIdA.get(id % 100000).hp) !== JSON.stringify(byIdA.get(id % 10000).hp));
  if (drawn.size) {
    const added = after.filter((r) => !beforeIds.has(r.enemyId));
    const bad = added.filter((r) => !drawn.has(r.displayId));
    check(bad.length === 0, `righe nuove senza grafica servita: ${bad.slice(0, 5).map((r) => r.enemyId + '/' + r.displayId)}`);
  }
  // DR_LOOK sui dati veri: ogni grafica scelta servita con wait, atk1_o, dead, knockback (move da wait al build,
  // make_enemy_moves.py); righe dark-road col displayId della tabella
  const NAMES = process.env.KHUX_RESOURCE_NAMES || 'D:\\Progetto_Restauro_KH_UX\\resource_data\\names_v4.tsv';
  if (fs.existsSync(NAMES)) {
    const anims = {};
    for (const line of fs.readFileSync(NAMES, 'utf8').split('\n')) {
      const m = /^lwf\/character\/enemy\/(\d+)\/(\w+)\//.exec(line);
      if (m) (anims[m[1]] = anims[m[1]] || new Set()).add(m[2]);
    }
    // UX looks (displayId < 5000, 22-10) are served from enemy_gen (make_jp_enemies.py), not from the index
    const GEN = 'D:/Progetto_Restauro_KH_UX/enemy_gen/files/lwf/character/enemy';
    for (const v of Object.values(DR_LOOK)) {
      const dir = path.join(GEN, String(v.displayId));
      if (v.displayId < 5000 && fs.existsSync(dir)) anims[v.displayId] = new Set(fs.readdirSync(dir));
    }
    const badDr = Object.values(DR_LOOK).filter((v) => !['wait', 'atk1_o', 'dead', 'knockback'].every((a) => anims[v.displayId] && anims[v.displayId].has(a)));
    check(badDr.length === 0, `DR_LOOK senza le 4 animazioni servite: ${badDr.map((v) => v.displayId)}`);
  }
  const drRows = after.filter((r) => !beforeIds.has(r.enemyId) && DR_LOOK[familyOf(r.enemyId)] && r.displayId === DR_LOOK[familyOf(r.enemyId)].displayId);
  check(drRows.every((r) => !drawn.has(familyOf(r.enemyId)) || familyOf(r.enemyId) >= 5000), 'DR solo per famiglie senza grafica servita');
  console.log(`Dark Road della stessa specie: ${drRows.length} righe, displayId ${[...new Set(drRows.map((r) => r.displayId))].sort().join(' ')}`);
  const saved = JSON.parse(fs.readFileSync(srcOut, 'utf8'));
  check(Object.keys(saved.sources).length === r1.added, 'una fonte per riga');
  const kinds = {};
  for (const v of Object.values(saved.sources)) { const k = v.kind + (v.confidence ? `(${v.confidence})` : ''); kinds[k] = (kinds[k] || 0) + 1; }
  console.log(`fonti: ${JSON.stringify(kinds)}; cloni con HP diversi fra base a 5 e a 4 cifre: ${five.length}`);
  const r2 = patch(dir, { ...defaultSources(), drawn, sourcesOut: srcOut });
  check(r2.added === r1.added && JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'enemy.json'), 'utf8'))) === JSON.stringify(after),
    'patch idempotente (righe rigenerate uguali)');

  // Review Focus 4: obiettivi «Defeat X» delle righe del Task 1 sulla copia, prima e dopo
  let story = null;
  try { story = require('./make-story-oltre'); story.defaultSources(); } catch (e) { console.log('SKIP Defeat X:', e.message); story = null; }
  if (story && fs.existsSync(path.join(dir, 'stage.json'))) {
    const src = story.defaultSources();
    const t = (n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
    const tt = (n) => (fs.existsSync(path.join(dir, n + '.json')) ? t(n) : []);
    const isOltre = (r) => r.stageKind === 1 && r.stageId < 100000 && r.id >= 526 && r.id <= 979;
    const stages = t('stage').filter((r) => !isOltre(r));
    const run = (en) => story.buildRows(stages, { ...src, theater: tt('theater'), enemies: en, titles: tt('title'),
      medals: tt('medal'), keyblades: tt('keyblade'), skills: tt('skill') });
    const rb = run(before), ra = run(after);
    const known = new Set(after.map((r) => r.enemyId));
    const bad = [];
    for (const r of ra) {
      for (let i = 0; i < r.validSubmission; i++) if (r.submissionIdType[i] === 1 && !known.has(r.submissionId[i])) bad.push([r.id, r.submissionId[i]]);
    }
    check(bad.length === 0, `obiettivi Defeat X su nemici assenti: ${JSON.stringify(bad.slice(0, 5))}`);
    check(ra.report.enemiesToShadow <= rb.report.enemiesToShadow, 'Defeat X: mai piu\' obiettivi sullo Shadow di prima');
    // un id aggiunto da questo patch non deve finire sullo Shadow: ogni nome che lo indica lo trova
    const added = new Set(after.filter((r) => !beforeIds.has(r.enemyId)).map((r) => r.enemyId));
    const pointing = ra.flatMap((r) => r.submissionId.filter((id, i) => r.submissionIdType[i] === 1 && added.has(id)));
    console.log(`Defeat X: sullo Shadow ${rb.report.enemiesToShadow} prima, ${ra.report.enemiesToShadow} dopo; `
      + `${pointing.length} obiettivi su righe nuove`);
  }
  console.log(`dati veri: +${r1.added} (${r1.cloned} cloni esatti, ${r1.family} di famiglia, ${r1.fromStats} da fonte), ${r1.uncovered.length} scoperti`);
} else console.log('SKIP dati veri: master o enemies_oltre525.json assenti');

for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
if (errors.length) { console.log('FAIL\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('OK test-enemy-oltre');
