// Spirit Training (I-082): attesa non valida dopo un orologio tornato indietro, slot 2-4 dalla tabella
// TRAIN_SLOT_RULES (VIP, 5 Deal da 10, missioni mensili) e POST limitato agli slot aperti:
//   node server/test-pet-training.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

const SAVE = path.join(os.tmpdir(), `khux-test-training-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE; process.env.KHUX_PET = '1';
delete process.env.KHUX_VIP; delete process.env.KHUX_PET_TRAIN_SLOTS; delete process.env.KHUX_REAL_NOW;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const realDateNow = Date.now;
let NOW = realDateNow();
Date.now = () => NOW;
const { _test: t } = quiet(() => require('./server'));
const clock = require('./clock');
const { TRAIN_SLOT_RULES } = require('./pet');
const HOUR = 3600 * 1000;
const p = t.player;
p.created = true;

const call = (fn) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = x; } })); return JSON.parse(String(b)); };
const get = () => call((res) => t.pet().respondExpedition(res, 'GET', {}, '/pet/expedition'));
const post = (ids) => call((res) => t.pet().respondExpedition(res, 'POST', { userMedalIds: ids }, '/pet/expedition'));
const profile = () => call((res) => t.pet().respondProfile(res));
const slotsOf = (r) => r.openMedalSlotDatas.map((s) => `${s.openMedalSlotNumber}@${s.openMedalSlotLimitDatetime}`).join();

check(TRAIN_SLOT_RULES.map((r) => `${r.slot}:${r.unlock}`).join() === '2:vip,3:draws,4:monthly', 'tabella delle regole');

// 1. attesa: 906 ore avanti (banco con -RealNow) = non valida, pronta e salvata; 10 ore avanti resta
quiet(() => t.pet().respondProfile({ writeHead() {}, end() {} }));
p.pet.training.readyAt = NOW + 906 * HOUR;
let r = profile();
check(p.pet.training.readyAt === 0 && r.recoverDatetime === t.serverTime(), `readyAt 906 h: ${p.pet.training.readyAt}, ${r.recoverDatetime}`);
check(JSON.parse(fs.readFileSync(SAVE, 'utf8')).pet.training.readyAt === 0, 'readyAt azzerato anche nel salvataggio');
p.pet.training.readyAt = NOW + 10 * HOUR;
r = profile();
check(p.pet.training.readyAt === NOW + 10 * HOUR && r.recoverDatetime === t.outTime(NOW + 10 * HOUR), 'readyAt 10 h: resta');
p.pet.training.readyAt = 0;

// 2. nessuna regola soddisfatta: solo lo slot 1
r = get();
check(r.openMedalSlotDatas.length === 0 && r.remainingDrawCount === 5, `nessuno slot: ${slotsOf(r)} draw ${r.remainingDrawCount}`);
check(r.limitDateimeWeekEnd === t.outTime(clock.weekEnd(NOW) + 7 * 24 * HOUR) && r.limitDateimeMonthEnd === t.outTime(clock.monthEnd(NOW)), 'scadenze settimana/mese');

// 3. slot 2 = VIP: aperto fino alla fine del VIP (settimana guadagnata + la successiva)
const week = clock.weekIndex(NOW);
p.vip = { earnedWeek: week };
r = get();
check(slotsOf(r) === `2@${t.outTime(clock.weekStartOf(week + 2))}`, `VIP: ${slotsOf(r)}`);
p.vip = { earnedWeek: week - 2 };
check(get().openMedalSlotDatas.length === 0, 'VIP scaduto: slot 2 chiuso');
process.env.KHUX_VIP = '1';
check(slotsOf(get()) === `2@${t.outTime(clock.weekStartOf(week + 1))}`, 'KHUX_VIP=1: slot 2 fino a fine settimana');
delete process.env.KHUX_VIP;
p.vip = { earnedWeek: week };

// 4. POST: una medaglia per slot aperto (qui 1 + VIP = 2)
const medalRow = t.masterRows('medal').find((m) => m.type === 1 && !m.groupId && !m.validPack);
const ids = [0, 1, 2].map(() => { quiet(() => t.grantItem(3, medalRow.medalId, 1)); return p.medals[p.medals.length - 1].userMedalId; });
post(ids);
check(JSON.stringify(p.pet.training.medals) === JSON.stringify(ids.slice(0, 2)), `POST con 2 slot: ${JSON.stringify(p.pet.training.medals)}`);
check(p.pet.training.readyAt === NOW + 20 * HOUR, 'POST: attesa 20 ore');
p.vip = {};
post(ids);
check(p.pet.training.medals.length === 1, 'POST senza VIP: una medaglia');
p.pet.training.readyAt = 0;

// 5. slot 3 = 5 Deal da 10 in Jewel; Ticket, 1 medaglia e Free Deal non contano; 72 ore; a slot aperto non contano
const deal = { payType: 1, lotCount: 10, freeDaily: false };
check(!t.pet().noteDraw({ payType: 8, lotCount: 10 }) && !t.pet().noteDraw({ payType: 1, lotCount: 1 })
  && !t.pet().noteDraw({ ...deal, freeDaily: true }), 'Ticket / 1 medaglia / Free Deal: non contano');
for (let i = 0; i < 4; i++) t.pet().noteDraw(deal);
r = get();
check(r.openMedalSlotDatas.length === 0 && r.remainingDrawCount === 1, `4 estrazioni: ${slotsOf(r)} draw ${r.remainingDrawCount}`);
t.pet().noteDraw(deal);
r = get();
check(slotsOf(r) === `3@${t.outTime(NOW + 72 * HOUR)}` && r.remainingDrawCount === 5, `5 estrazioni: ${slotsOf(r)} draw ${r.remainingDrawCount}`);
check(!t.pet().noteDraw(deal) && p.pet.training.draws.count === 0, 'a slot aperto le estrazioni non contano');
NOW += 72 * HOUR + 1000;
r = get();
check(r.openMedalSlotDatas.length === 0 && r.remainingDrawCount === 5, 'dopo 72 ore: slot 3 chiuso');

// 6. slot 4 = Limited mensili tutte completate nel mese M: aperto per il resto di M e tutto M+1
t.forceStoryQuest(979);
const M = clock.monthIndex(NOW);
const lastDayOfM = clock.monthEndOf(M) - 2 * HOUR;
NOW = lastDayOfM;
const monthly = () => t.masterRows('mission').filter((x) => x.missionType === 4 && t.limitedActive(x.id, NOW)
  && t.LIMITED_ROTATION.monthly.some((g) => g.includes(x.id)));
const rowsM = monthly();
check(rowsM.length > 0, 'righe mensili attive nel mese M');
p.missions = {};
check(get().openMedalSlotDatas.length === 0, 'mensili non completate: slot 4 chiuso');
for (const x of rowsM.slice(0, -1)) p.missions[x.id] = { period: M, count: x.targetNum[0], received: false };
check(get().openMedalSlotDatas.length === 0, 'una mensile mancante: slot 4 chiuso');
const lastRow = rowsM[rowsM.length - 1];
p.missions[lastRow.id] = { period: M, count: 0, received: true };
r = get();
const end4 = t.outTime(clock.monthEndOf(M + 1));
check(slotsOf(r) === `4@${end4}` && p.monthlyEarned === M, `mensili complete l'ultimo giorno di M: ${slotsOf(r)}`);
NOW = clock.monthEndOf(M + 1) - HOUR; // ultimo giorno di M+1 (missioni del nuovo mese a zero)
check(slotsOf(get()) === `4@${end4}`, 'ultimo giorno di M+1: ancora aperto');
NOW = clock.monthEndOf(M + 1) + HOUR; // primo giorno di M+2
check(get().openMedalSlotDatas.length === 0, 'primo giorno di M+2: chiuso');

Date.now = realDateNow;
try { fs.unlinkSync(SAVE); } catch { /* gia' tolto */ }
if (errors.length) { log(`FALLITO (${errors.length}):\n- ${errors.join('\n- ')}`); process.exit(1); }
log('test-pet-training: OK');
