// Prova dei livelli Lux 302-999 (make-lux-levels.js):  node server/test-lux-levels.js [cartella master]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const ll = require('./make-lux-levels');
const player = JSON.parse(fs.readFileSync(path.join(MASTER, 'player.json'), 'utf8'));
const misc = JSON.parse(fs.readFileSync(path.join(MASTER, 'misc.json'), 'utf8'));
const by = new Map(player.map((r) => [r.lv, r]));
const step = (lv) => by.get(lv).needExp - by.get(lv - 1).needExp;

check(player.length === 1001 && by.has(0) && by.has(1000) && !by.has(1001), `righe 0..1000 (${player.length})`);
check(misc.find((r) => r.miscId === 100)?.value === 999, 'misc 100 = 999');
check(by.get(301).needExp === 144826275, 'riga 301 originale');
check(step(302) === 521557110 && step(303) === 535117590 && step(304) === 549030555, 'Lux 302-304 dal wiki JP');
let mono = true, ints = true;
for (let lv = 2; lv <= 1000; lv++) {
  if (!(step(lv) > 0)) mono = false;
  if (!Number.isInteger(by.get(lv).needExp)) ints = false;
}
check(mono && ints, 'needExp intero e crescente');
check(!/e\+/.test(fs.readFileSync(path.join(MASTER, 'player.json'), 'utf8')), 'nessun esponente nel JSON');
const r = by.get(999);
check(r.ap === 160 && r.cost === 440 && r.hp === 3530 && r.luxMedal === 55, 'AP/costo/HP/luxMedal oltre 301');
// punti dei video (lv del video, Lux mancante, barra): la curva entro il 25%
for (const [lv, toNext, bar] of [[319, 95844885, 0.89], [341, 1422927877, 0.02], [481, 57665196028, 0.485], [558, 243494268646, 0.249],
  [587, 328589448447, 0.141], [735, 485100858402, 0.476], [794, 878672518054, 0.335], [808, 5027631011868, 0.702],
  [822, 13107438719036, 0.316], [850, 6900858003458, 0.706], [858, 36166566014388, 0.143], [875, 19104853079785, 0.766]]) {
  const est = toNext / (1 - bar), got = step(lv + 1);
  check(Math.abs(got / est - 1) < 0.25, `lv ${lv}: curva ${Math.round(got)} contro ${Math.round(est)} dal video`);
}
// idempotente
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-lux-'));
for (const n of ['player', 'misc']) fs.copyFileSync(path.join(MASTER, n + '.json'), path.join(tmp, n + '.json'));
const log = console.log; console.log = () => {};
ll.patch(tmp);
console.log = log;
for (const n of ['player', 'misc']) check(fs.readFileSync(path.join(tmp, n + '.json'), 'utf8') === fs.readFileSync(path.join(MASTER, n + '.json'), 'utf8'), `${n} cambia alla seconda esecuzione`);
fs.rmSync(tmp, { recursive: true, force: true });

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: lux-levels');
