// Migrazione dei salvataggi all'orologio finto: node server/test-clock-migration.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-clockmig-${process.pid}.json`);
const OLD = '2021-05-14 09:30:00';
fs.writeFileSync(SAVE, JSON.stringify({
  keyblades: [{ userKeybladeId: 7, keybladeId: 0, getDatetime: OLD, burst: 0 }],
  sphere: { 1: { id: 1, unlock: [], getDatetime: OLD } },
  medalSkills: { 101: { userSkillId: 1, skillId: 1, level: 1, exp: 0, getDatetime: OLD } },
  medalTraits: { 101: [{ userShuffleSkillId: 1001, shuffleSkillId: 1, type: 0, getDatetime: OLD }] },
  party: { name: 'P', message: '', playStyle: 0, agreeType: 0, createDate: OLD },
  created: true, name: 'Vecchio', medals: [
    { userMedalId: 101, medalId: 1, level: 1, getDatetime: '2021-05-15 12:00:00' },
    { userMedalId: 102, medalId: 1, level: 1, getDatetime: '2021-05-16 12:00:00' }],
  presents: [{ userPresentId: 1, resourceType: 2, resourceId: 0, number: 10, limitDatetime: '2021-06-10 00:00:00', comment: 'x', created: '2021-05-15 12:00:00' }],
  beginnerSince: '2021-05-15 12:00:00', missions: { 2001: { period: 5, count: 1, received: false } },
  pet: { parts: { 3001001: OLD }, training: { total: 3, monthly: 2, month: '2021-05', readyAt: Date.parse('2021-05-16T08:00:00Z'), medals: [] } },
}));
process.env.KHUX_SAVE = SAVE; process.env.KHUX_PET = '1';
delete process.env.KHUX_SERVER_TIME;
const realNowFn = Date.now; const now = Date.parse('2026-10-16T15:00:00Z'); Date.now = () => now;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const p = t.player;
const fmt = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/;
check(p.clockVersion === 2, 'migrazione non fatta');
check(p.medals[1].getDatetime === now && p.medals[0].getDatetime === now - 86400000, `getDatetime ${p.medals.map((m) => m.getDatetime)}`);
check(p.presents[0].limitDatetime === now + 29 * 86400000, 'regalo: +29 giorni');
check(p.beginnerSince === now, 'beginnerSince');
check(Object.keys(p.missions || {}).length === 0, 'contatori dei periodi non azzerati');
check(p.pet.training.readyAt === 0 && p.pet.training.month === t.clockMonthIndex(now), 'training');
check(t.outTime(p.medals[1].getDatetime) === t.serverTime(), 'uscita in ora finta');
// ogni elemento che torna al client porta una stringa «AAAA-MM-GG hh:mm:ss», mai il numero salvato
check(['keyblades', 'sphere', 'medalSkills'].every((k) => Object.values(p[k] instanceof Array ? p[k] : p[k]).every((o) => typeof o.getDatetime === 'number')), 'holder non convertiti');
check(typeof p.medalTraits[101][0].getDatetime === 'number' && typeof p.pet.parts[3001001] === 'number', 'trait/parti non convertiti');
check(typeof p.party.createDate === 'number', 'party.createDate non convertito');
const sid = Object.keys(p.sphere)[0];
check(fmt.test(t.userSphereData(sid).getDatetime), 'sfera: uscita non in stringa');
check(fmt.test(t.userKeybladeData(p.keyblades[0]).getDatetime), 'keyblade: uscita non in stringa');
check(fmt.test(t.userSkillElement(p.medals[0], p.medalSkills[101], t.serverTime()).getDatetime), 'skill: uscita non in stringa');
const el = t.userMedalElement(p.medals[0], t.serverTime());
check(el.userShuffleSkills.length === 1 && fmt.test(el.userShuffleSkills[0].getDatetime), `trait: uscita ${JSON.stringify(el.userShuffleSkills)}`);
let sent = null;
const pdeps = { send: (r, c, b) => { sent = b; }, ret: () => ({}), serverTime: t.serverTime, realNow: t.realNow, outTime: t.outTime, player: p, savePlayer() {}, addPresent() {},
  userObject: () => ({}), userDetailData: () => ({}), userAvatarData: () => ({}), selfElement: () => ({}), keyblade: () => ({}), lastStoryQuest: () => 0, weeklyLux: () => 0 };
quiet(() => require('./routes-party-ranking').respondPartyRanking(pdeps, {}, 'party', '/party', {}));
check(sent && sent.party && fmt.test(sent.party.leaderAppointDate) && fmt.test(sent.userParty.joinDate), `party: uscita ${JSON.stringify(sent && sent.party)}`);
// seconda volta: nessun cambiamento
const before = JSON.stringify(p); quiet(() => t.migrateClock());
check(JSON.stringify(p) === before, 'migrazione ripetuta');

// clockVersion 2: numeri in ms dell'ora finta vecchia (maggio 2021) spostati in blocco, numeri reali intatti
const REAL = Date.parse('2026-10-10T10:00:00Z');
Object.assign(p, {
  clockVersion: 1,
  medals: [
    { userMedalId: 201, medalId: 1, level: 1, getDatetime: Date.parse('2021-05-16T06:00:00Z') },
    { userMedalId: 202, medalId: 1, level: 1, getDatetime: Date.parse('2021-05-15T06:00:00Z') },
    { userMedalId: 203, medalId: 1, level: 1, getDatetime: REAL }],
  keyblades: [{ userKeybladeId: 7, keybladeId: 0, getDatetime: Date.parse('2021-05-14T06:00:00Z'), burst: 0 }],
  presents: [{ userPresentId: 2, resourceType: 2, resourceId: 0, number: 10, limitDatetime: Date.parse('2021-06-10T00:00:00Z'), comment: 'y', created: Date.parse('2021-05-15T00:00:00Z') },
    { userPresentId: 3, resourceType: 2, resourceId: 0, number: 10, limitDatetime: REAL + 86400000, comment: 'z', created: REAL }],
  beginnerSince: Date.parse('2021-05-15T00:00:00Z'),
});
p.pet.parts = { 3001001: Date.parse('2021-05-16T06:00:00Z') };
quiet(() => t.migrateClock());
check(p.clockVersion === 2, 'v2: clockVersion');
check(p.medals[0].getDatetime === now && p.medals[1].getDatetime === now - 86400000, `v2: medaglie ${p.medals.map((m) => m.getDatetime)}`);
check(p.medals[2].getDatetime === REAL, 'v2: orario reale cambiato');
check(p.keyblades[0].getDatetime === now - 2 * 86400000, 'v2: keyblade');
check(p.pet.parts[3001001] === now, 'v2: parti');
check(p.presents[0].limitDatetime === now + 29 * 86400000 && p.presents[0].created === now, 'v2: regalo vecchio');
check(p.presents[1].limitDatetime === REAL + 86400000 && p.presents[1].created === REAL, 'v2: regalo reale cambiato');
check(p.beginnerSince === now, 'v2: beginnerSince');
const before2 = JSON.stringify(p); quiet(() => t.migrateClock());
check(JSON.stringify(p) === before2, 'v2 ripetuta');
Date.now = realNowFn;
try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: migrazione');
