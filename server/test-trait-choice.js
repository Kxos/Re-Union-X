// Prova della scelta del trait da sostituire (I-084 parte A, POST /user/medal/shuffleskill azione 57), della ripresa
// al login (userData.medalResumption) e del training del pet (244) con trait in sospeso, senza client:
//   node server/test-trait-choice.js [cartella master]   (default server/master_data)
// Non tocca server/save: KHUX_SAVE punta a un file temporaneo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const SAVE = path.join(os.tmpdir(), `khux-test-trait-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_MASTER_DIR = MASTER;
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_PET = '1';
const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));

const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function call(fn, ...args) {
  let body = null;
  const res = { writeHead() {}, end(b) { body = JSON.parse(b.toString('utf8')); } };
  quiet(() => fn(res, ...args));
  return body;
}

const medal = JSON.parse(fs.readFileSync(path.join(MASTER, 'medal.json'), 'utf8'));
const row = medal.find((r) => r.type === 1 && r.shuffleskillSlot === 3 && !r.groupId && r.shuffleSkillGroupId);
const p = t.player;
Object.assign(p, { created: true, money: 1e7, medals: [{ userMedalId: 101, medalId: row.medalId, level: 1 }, { userMedalId: 102, medalId: row.medalId, level: 1 }],
  medalState: {}, medalTraits: {}, traitPending: [] });
const T = (u, s, type = 0) => ({ userShuffleSkillId: u, shuffleSkillId: s, type, getDatetime: 0 });
const reset = () => {
  p.medalTraits[101] = [T(1, 10), T(2, 13), T(3, 11)];
  p.traitPending = [{ ...T(9, 8, 1), userMedalId: 101 }];
};
const ids = () => (p.medalTraits[101] || []).map((x) => x.userShuffleSkillId);

// Replace: il trait in sospeso prende la posizione di quello tolto
reset();
let r = call(t.respondMedalShuffleSkill, { userMedalId: 101, userShuffleSkillId: 2, enableUserShuffleSkillId: 9 });
check(same(ids(), [1, 9, 3]), `Replace: ${ids()}`);
check(p.medalTraits[101][1].type === 0, 'il trait attivato torna type 0 (come quelli in lista)');
check(same(r.medalResumption, { userShuffleSkills: [], resumptionStatus: 0 }), `Replace: resumption ${JSON.stringify(r.medalResumption)}`);
check(r.userMedal && r.userMedal.userMedalId === 101 && r.userMedal.userShuffleSkills.map((x) => x.userShuffleSkillId).join() === '1,9,3', 'Replace: userMedal aggiornata');
check(p.traitPending.length === 0, 'Replace: coda vuota');

// Skip: lista invariata, coda vuota
reset();
r = call(t.respondMedalShuffleSkill, { userMedalId: 101, userShuffleSkillId: 9, enableUserShuffleSkillId: 0 });
check(same(ids(), [1, 2, 3]), `Skip: ${ids()}`);
check(p.traitPending.length === 0 && r.medalResumption.resumptionStatus === 0, 'Skip: coda vuota');

// id sconosciuti: niente cambia, risposta valida con la coda attuale
reset();
r = call(t.respondMedalShuffleSkill, { userMedalId: 101, userShuffleSkillId: 77, enableUserShuffleSkillId: 88 });
check(same(ids(), [1, 2, 3]) && p.traitPending.length === 1, 'id sconosciuti: nessuna modifica');
check(r.medalResumption.resumptionStatus === 1 && r.medalResumption.userShuffleSkills.length === 1 && r.userMedal, 'id sconosciuti: risposta valida');

// due trait in sospeso: dopo la prima scelta status 1 col secondo
reset();
p.traitPending.push({ ...T(10, 12, 1), userMedalId: 102 });
r = call(t.respondMedalShuffleSkill, { userMedalId: 101, userShuffleSkillId: 9, enableUserShuffleSkillId: 0 });
check(r.medalResumption.resumptionStatus === 1 && r.medalResumption.userShuffleSkills[0].userShuffleSkillId === 10, 'secondo pending proposto dopo il primo');

// login: userData.medalResumption con la coda
r = call(t.respondUser);
check(r.userData.medalResumption.resumptionStatus === 1 && r.userData.medalResumption.userShuffleSkills[0].userMedalId === 102, `login: ${JSON.stringify(r.userData.medalResumption)}`);
p.traitPending = [];
r = call(t.respondUser);
check(same(r.userData.medalResumption, { userShuffleSkills: [], resumptionStatus: 0 }), 'login senza pending');

// trait in sospeso di una medaglia che non c'e' piu' (venduta o fusa): fuori dalla risposta e dalla coda
reset();
p.traitPending.unshift({ ...T(11, 12, 1), userMedalId: 999 });
r = call(t.respondUser);
check(r.userData.medalResumption.userShuffleSkills[0].userMedalId === 101, `login: niente medaglie sparite (${JSON.stringify(r.userData.medalResumption)})`);
check(!p.traitPending.some((x) => x.userMedalId === 999), 'coda ripulita dalle medaglie sparite');
r = call(t.respondMedalShuffleSkill, { userMedalId: 999, userShuffleSkillId: 11, enableUserShuffleSkillId: 0 });
check(r.userMedal === undefined || r.userMedal !== null, 'la 57 non manda userMedal null');

// training del pet (244) con un pending della fusione: la risposta lo rimanda, non lo azzera
reset();
r = call((res) => t.pet().respondExpedition(res, 'POST', { userMedalIds: [102] }, '/pet/expedition'));
check(r.medalResumption && r.medalResumption.resumptionStatus === 1 && r.medalResumption.userShuffleSkills[0].userShuffleSkillId === 9, `training: ${JSON.stringify(r.medalResumption)}`);
check(p.traitPending.length === 1, 'training: coda intatta');

// Special Trait del training (originale: notice NA 52202 v3.2.0, scelta fra tenere e sostituire)
const special = JSON.parse(fs.readFileSync(path.join(MASTER, 'shuffleskill.json'), 'utf8')).filter((x) => x.type === 2).map((x) => x.shuffleSkillId);
if (special.length) {
  // slot libero: entra subito, niente pending
  p.medalTraits = { 101: [T(1, 10)], 102: [] }; p.traitPending = [];
  r = call((res) => t.pet().respondExpedition(res, 'POST', { userMedalIds: [102] }, '/pet/expedition'));
  check(p.medalTraits[102].length === 1 && special.includes(p.medalTraits[102][0].shuffleSkillId) && p.traitPending.length === 0
    && r.medalResumption.resumptionStatus === 0, `training, slot libero: ${JSON.stringify(p.medalTraits[102])}`);
  // slot occupato su due medaglie: il vecchio resta, due pending nella risposta (uno per medaglia)
  const old102 = p.medalTraits[102][0];
  p.medalTraits[101] = [T(1, 10), T(5, special[0])];
  r = call((res) => t.pet().respondExpedition(res, 'POST', { userMedalIds: [101, 102] }, '/pet/expedition'));
  check(same(p.medalTraits[102], [old102]) && p.medalTraits[101].map((x) => x.userShuffleSkillId).join() === '1,5', 'training, slot occupato: trait vecchi intatti');
  const pend = r.medalResumption.userShuffleSkills;
  check(r.medalResumption.resumptionStatus === 1 && pend.length === 2 && pend.map((x) => x.userMedalId).sort().join() === '101,102'
    && pend.every((x) => special.includes(x.shuffleSkillId)), `training, slot occupato: pending ${JSON.stringify(r.medalResumption)}`);
  // Replace sulla 101: il nuovo prende il posto del vecchio Special Trait; la risposta propone ancora quello della 102
  const p101 = pend.find((x) => x.userMedalId === 101), p102 = pend.find((x) => x.userMedalId === 102);
  r = call(t.respondMedalShuffleSkill, { userMedalId: 101, userShuffleSkillId: 5, enableUserShuffleSkillId: p101.userShuffleSkillId });
  check(p.medalTraits[101].map((x) => x.userShuffleSkillId).join() === `1,${p101.userShuffleSkillId}`, `Replace dello Special Trait: ${JSON.stringify(p.medalTraits[101])}`);
  check(r.medalResumption.resumptionStatus === 1 && r.medalResumption.userShuffleSkills[0].userMedalId === 102, 'dopo la 101 resta il pending della 102');
  // Skip sulla 102: si tiene il vecchio
  r = call(t.respondMedalShuffleSkill, { userMedalId: 102, userShuffleSkillId: p102.userShuffleSkillId, enableUserShuffleSkillId: 0 });
  check(same(p.medalTraits[102], [old102]) && p.traitPending.length === 0 && r.medalResumption.resumptionStatus === 0, 'Skip dello Special Trait: vecchio tenuto');
} else errors.push('nessuno Special Trait (type 2) in shuffleskill');

try { fs.unlinkSync(SAVE); } catch { /* gia' tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: trait-choice');
