// VIP benefit (I-134, vip-benefit.js): node server/test-vip-benefit.js
'use strict';
const vip = require('./vip-benefit');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

const ROWS = [{ id: 3001, targetNum: [10] }, { id: 3004, targetNum: [5000000] }];
const st = (m) => (r) => m[r.id];
check(!vip.weekEarned([], () => null), 'nessuna riga: non guadagnata');
check(!vip.weekEarned(ROWS, st({ 3001: { count: 10 } })), 'una riga senza stato: non guadagnata');
check(!vip.weekEarned(ROWS, st({ 3001: { count: 9 }, 3004: { count: 5000000 } })), 'una riga sotto il traguardo');
check(vip.weekEarned(ROWS, st({ 3001: { count: 10 }, 3004: { count: 0, received: true } })), 'completate o riscosse');

let v = vip.markEarned(undefined, 100);
check(v.earnedWeek === 100, 'prima settimana guadagnata');
check(vip.markEarned(v, 99).earnedWeek === 100, 'una settimana vecchia non torna indietro');
check(vip.markEarned(v, 101).earnedWeek === 101, 'settimana nuova');
check(!vip.isActive(undefined, 100) && !vip.isActive({}, 100), 'senza stato: non attivo');
check(vip.isActive(v, 100) && vip.isActive(v, 101) && !vip.isActive(v, 102) && !vip.isActive(v, 99), 'attivo nella settimana e nella successiva');
check(vip.activeUntilWeek(v) === 102, 'fine all\'inizio della settimana 102');
const ub = vip.userBenefits(v, 101, (w) => `w${w}`);
check(JSON.stringify(ub) === JSON.stringify([{ benefitId: vip.VIP_BENEFIT_ID, endDatetime: 'w102' }]), `userBenefits attivo: ${JSON.stringify(ub)}`);
check(vip.userBenefits(v, 102, String).length === 0, 'userBenefits scaduto: vuoto');

if (errors.length) { console.log(`FALLITO (${errors.length}):\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log('test-vip-benefit: OK');
