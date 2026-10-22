// Skill delle medaglie (abilita' passive, tabella skill) e Overwrite Skill del Level Up (I-088).
// Usato da server.js (userMedals/userSkills, POST /user/medal/enhance): docs/notes/medaglie.md#skill.
//
// Regole (khuxwiki «Medal» sezione Skills e «Scrooge», kingdomhearts.fandom «Medals», testi del
// client 101300020-032, medalMisc 121/122) e comportamento del client 4.3.1:
// - una medaglia ha al massimo una skill (il client ne accetta 2: userMedal.userSkills = id).
//   L'oggetto della skill {userSkillId, skillId, level, exp, userMedalId, getDatetime}
// arriva nella lista userSkills della risposta e il client lo cerca
// per userSkillId (tabella della sessione): un id senza oggetto = riga
//   skill 0 = crash, quindi la lista va mandata intera.
// - richiesta: isOverwriteSkill 0/1, nessuna skill scelta: vale la skill del
//   materiale piu' a sinistra (componentUserMedalIds[0]).
// - probabilita' («Success Rate %d%%»): per ogni skill dei materiali con la stessa
//   categoryEvolve della skill del primo materiale si somma
//   min + (max - min) * (lv - 1) / (maxLv - 1)   (medalMisc 121 = 2000, 122 = 10000)
// per il moltiplicatore della campagna (scena 10000 senza campagne) / 10000; limite 100%.
//   Skill al livello 1 = 20%, al massimo = 100% (Scrooge, sempre al massimo: 100%).
// - riuscita: la base prende la skill del primo materiale con livello ed EXP (la sostituisce se ne
//   aveva una); fallita o Overwrite spento: la base tiene la sua, le skill dei materiali si perdono
//   (101300031/032). Risposta: overwriteSkills = [skill nuova della base], successOverwrite 1.
'use strict';

// Le Scrooge (type 2, «grants a skill») hanno una skill al livello massimo. Quale skill avesse ogni
// Scrooge non dipendeva dalla medaglia (la riga e' la stessa: 90123/90125/90126) ma dal premio: wiki
// «6★ Scrooge (Board)» «Scrooge 5★ (Paralysis)», «Shop/2017» «Scrooge Medal with the [[Attack Boost III]]
// Skill», «Moogle Shop» «Scrooge 6★ ... ATK B XIV Max & Sleep». Nessun abbinamento per nome possibile:
// ipotesi deterministica per rarita' (3★ rango 1, 5★ rango 2, 6★ rango 3; nei premi del wiki 3★ = stati e
// Boost I, 5★ = Boost II, 6★ = Max e combinazioni) scelta con userMedalId sulla tabella completa.
// userSkillId calcolato, non salvato (docs/notes/medaglie.md#skill).
const SCROOGE_SKILL_BASE = 1000000000;
const SCROOGE_RANK = { 3: 1, 5: 2, 6: 3 };
// le 12 skill del master prima della tabella completa (I-146, 18-10): le Scrooge possedute allora tengono
// la skill calcolata su queste (scroogeSkillV1, salvata una volta da migrateSkills in server.js)
const SKILL_IDS_V1 = new Set([1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1109, 1110, 1112, 1113]);

function isSkillMedal(row) {
  return !!row && row.type === 2 && /grants a skill/i.test(row.advantage || '');
}

function scroogeSkillV1(row, userMedalId, skills, expRows) {
  return scroogeSkill(row, userMedalId, skills.filter((s) => SKILL_IDS_V1.has(s.skillId)), expRows);
}

// expRows (Map expId -> riga skillExp): l'EXP parte dalla soglia del livello massimo, come le skill migrate
// (senza expRows resta 0)
function scroogeSkill(row, userMedalId, skills, expRows) {
  if (!isSkillMedal(row) || !skills.length) return null;
  const rank = SCROOGE_RANK[row.rare] || 1;
  let pool = skills.filter((s) => s.rank === rank);
  if (!pool.length) pool = skills;
  pool = [...pool].sort((a, b) => a.skillId - b.skillId);
  const s = pool[userMedalId % pool.length];
  return { userSkillId: SCROOGE_SKILL_BASE + userMedalId, skillId: s.skillId, level: s.maxLv,
    exp: expRows?.get(s.expType) ? expToReach(expRows.get(s.expType), s.maxLv || 1) : 0 };
}

// probabilita' (0..1) di una skill, come la calcola il client
function skillChance(skillRow, level, min, max, campaign = 10000) {
  if (!skillRow) return 0;
  const den = (skillRow.maxLv || 1) - 1;
  const t = den > 0 ? (Math.min(level, skillRow.maxLv) - 1) / den : 1;
  const rate = Math.trunc(min + Math.trunc((max - min) * t));
  return Math.trunc(rate * campaign / 10000) / 10000;
}

// comps: [{skill}] nell'ordine delle celle (skill = oggetto o null). Restituisce la skill del
// primo materiale e la probabilita' totale, oppure null se il primo materiale non ne ha.
function overwriteChance(comps, skillRows, min, max) {
  const first = comps[0]?.skill;
  const firstRow = first && skillRows.get(first.skillId);
  if (!firstRow) return null;
  let p = 0;
  for (const c of comps) {
    const r = c.skill && skillRows.get(c.skill.skillId);
    if (r && r.categoryEvolve === firstRow.categoryEvolve) p += skillChance(r, c.skill.level, min, max);
  }
  return { skill: first, chance: Math.min(1, p) };
}

// Curva skillExp (I-146), come il client 4.3.1 (oggetto della skill nella sessione):
// riga skillExp value = [a, b, c] (expType della skill), EXP TOTALE per il livello L
// trunc(b * powf((L - 1) / (a - 1), c / 10000)) (in float)
// cioe' 0 al LV 1 e b al LV a (es. [30,12132,13500]: 12132 al LV 30, esponente 1.35). Il client la usa per
// la soglia del livello attuale e del successivo (con L al posto di L - 1); il livello e'
// limitato a maxLv. Aritmetica in float32 come il client (Math.fround).
function expToReach(expRow, level) {
  const f = Math.fround;
  const [a, b, c] = expRow;
  if (level <= 1) return 0;
  const x = f(f(level - 1) / f(a - 1));
  const p = f(Math.pow(x, f(f(c) / f(10000))));
  return Math.trunc(f(f(b) * p));
}

// livello (1..maxLv) per un'EXP totale
function levelForExp(expRow, maxLv, exp) {
  let lv = 1;
  while (lv < maxLv && expToReach(expRow, lv + 1) <= exp) lv++;
  return lv;
}

// aggiunge EXP a una skill {skillId, level, exp}: EXP limitata alla soglia di maxLv, livello mai piu' basso
function addSkillExp(skill, skillRow, expRow, gained) {
  const maxLv = skillRow.maxLv || 1;
  const cap = expToReach(expRow, maxLv);
  const add = Number.isFinite(gained) && gained > 0 ? Math.trunc(gained) : 0;
  const exp = Math.min(cap, Math.max(0, skill.exp || 0) + add);
  const level = Math.min(maxLv, Math.max(skill.level || 1, levelForExp(expRow, maxLv, exp)));
  return { level, exp };
}

module.exports = {
  SCROOGE_SKILL_BASE, isSkillMedal, scroogeSkill, scroogeSkillV1, skillChance, overwriteChance,
  expToReach, levelForExp, addSkillExp,
};
