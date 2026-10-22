// Prova delle missioni Limited a rotazione (make-limited-missions.js, server.js limitedActive), senza client:
//
//   node server/test-limited.js [cartella master]   (default server/master_data)
//
// Controlla che:
// - in ogni mese reale sia attiva esattamente una campagna mensile, e in ogni settimana una breve, a turno;
// - /user/mission/list mandi solo le righe Limited della rotazione attiva;
// - i Lux del mese facciano completare la prima missione mensile, la riscossione dia la parte dello Spirit
//   (rewardType 33) e la risposta la riporti in pet.userPetParts;
// - il mese dopo i contatori ripartano da zero;
// - nessuna riga abbia un premio senza tipo, se non quelle dichiarate ancora da mappare.
// Non tocca server/save: KHUX_SAVE punta a un file temporaneo nuovo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MASTER = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
const SAVE = path.join(os.tmpdir(), `khux-test-limited-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_MASTER_DIR = MASTER;
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_PET = '1';
process.env.KHUX_GACHA_SIZES = '1,2,3,4,5,6,7,8,9,10'; // come run-server.ps1: B0456 (Platinum) ha 5 medaglie
delete process.env.KHUX_PET_ALL_PARTS;
const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));

const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
function call(fn, ...args) {
  let body = null;
  const res = { writeHead() {}, end(b) { body = JSON.parse(b.toString('utf8')); } };
  quiet(() => fn(res, ...args));
  return body;
}
const realNow = Date.now;
const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };

call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
t.forceStoryQuest(840); // giocatore finto oltre la 840 senza giocarla: da 840 in su i biglietti Limited sono sbloccati (sp3 5)
t.player.medals = t.player.medals || [];
const rows = t.masterRows('mission').filter((r) => r.missionType === 4);
const byId = new Map(rows.map((r) => [r.id, r]));
const { monthly, weekly } = t.LIMITED_ROTATION;
check(monthly.length === 35, `campagne mensili ${monthly.length}, attese 35`);
check(weekly.length >= 4, `campagne brevi ${weekly.length}`);
check(rows.length === monthly.flat().length + weekly.flat().length, 'righe del master e rotazione diverse');

// una campagna mensile e una breve per volta, tutte a turno
const seenM = new Set(), seenW = new Set();
for (let m = 0; m < 35; m++) {
  at(new Date(Date.UTC(2026, m, 10, 12)).toISOString());
  const act = monthly.map((ids, i) => (ids.every((id) => t.limitedActive(id)) ? i : -1)).filter((i) => i >= 0);
  check(act.length === 1, `mese ${m}: ${act.length} campagne mensili attive`);
  act.forEach((i) => seenM.add(i));
}
// campagne che regalano una medaglia (weeklyMedalFrom): solo dalla tranche della storia con quella data (19-10)
const medalFrom = t.LIMITED_ROTATION.weeklyMedalFrom || [];
const locked = medalFrom.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
check(JSON.stringify(medalFrom) === JSON.stringify([null, null, null, '2020-04-10', null, null]), `weeklyMedalFrom ${JSON.stringify(medalFrom)}`);
for (let w = 0; w < weekly.length; w++) {
  at(new Date(Date.UTC(2026, 9, 12, 12) + w * 7 * 86400000).toISOString());
  const act = weekly.map((ids, i) => (ids.every((id) => t.limitedActive(id)) ? i : -1)).filter((i) => i >= 0);
  check(act.length <= 1, `settimana ${w}: ${act.length} campagne brevi attive`);
  act.forEach((i) => seenW.add(i));
}
check(seenM.size === 35, `mensili viste ${seenM.size}/35`);
check(seenW.size === weekly.length - locked.length && locked.every((i) => !seenW.has(i)), `brevi viste ${seenW.size}/${weekly.length} (la W04 di Aerith resta chiusa con la storia del 2016)`);
// con la data sbloccata la campagna torna nella rotazione
const saved = medalFrom.slice();
medalFrom.forEach((d, i) => { if (d) medalFrom[i] = '2016-01-01'; });
const seen2 = new Set();
for (let w = 0; w < weekly.length; w++) {
  at(new Date(Date.UTC(2026, 9, 12, 12) + w * 7 * 86400000).toISOString());
  weekly.forEach((ids, i) => { if (ids.every((id) => t.limitedActive(id))) seen2.add(i); });
}
check(seen2.size === weekly.length, `con la storia arrivata alla data: brevi viste ${seen2.size}/${weekly.length}`);
saved.forEach((d, i) => { medalFrom[i] = d; });

// biglietti Limited (sp3 5): rewardType 40 Platinum e 41 Draw Ticket solo dopo lo sblocco di un banner che li spende
const gachaMod = require('./gacha');
const cat = t.gachaCatalog().banners, sizes = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
check(gachaMod.ticketUnlockQuest(cat, 40, sizes) === 815, `ticketUnlockQuest 40 = ${gachaMod.ticketUnlockQuest(cat, 40, sizes)}, atteso 815`);
check(gachaMod.ticketUnlockQuest(cat, 41, sizes) === 840, `ticketUnlockQuest 41 = ${gachaMod.ticketUnlockQuest(cat, 41, sizes)}, atteso 840`);
check(gachaMod.ticketUnlockQuest(cat, 99, sizes) === Infinity, 'rewardType senza biglietto: Infinity');
const w01 = weekly.findIndex((ids) => ids.includes(4059)), w02 = weekly.findIndex((ids) => ids.includes(4091));
const clk = require('./clock');
const weekOf = (i) => { for (let k = 0; k < weekly.length; k++) { const ms = Date.UTC(2026, 9, 12, 12) + k * 7 * 86400000; if (clk.weekIndex(ms) % weekly.length === i) return new Date(ms).toISOString(); } return null; };
for (const [quest, want] of [[525, false], [814, false], [840, true]]) {
  t.forceStoryQuest(quest);
  for (const [wi, ids] of [[w01, [4059, 4060]], [w02, [4091]]]) {
    if (wi < 0) { check(false, 'W01/W02 non trovate'); continue; }
    at(weekOf(wi));
    const got = quiet(() => t.missionsData()).map((m) => m.id);
    if (quest === 814 && ids[0] === 4091) continue; // 815 sblocca solo i Platinum: i Draw Ticket servono 840
    check(ids.every((id) => got.includes(id) === want), `quest ${quest}, settimana ${wi}: righe ${ids} ${want ? 'attese' : 'assenti'} (${ids.map((id) => got.includes(id))})`);
  }
}
// storia vera fino alla 979 (piano 526-979): con le righe 840 del master superata, senza forzare, i Draw Ticket si sbloccano
{
  const s840 = t.masterRows('stage').find((r) => r.stageKind === 1 && r.id === 840);
  if (!s840) log('SKIP storia vera: master senza la missione 840 (righe 526-979 di make-story-oltre.js)');
  else {
    t.forceStoryQuest(null);
    const keep = t.player.stageScores;
    const wi = w02;
    for (const [n, want] of [[839, false], [840, true]]) {
      t.player.stageScores = Object.fromEntries(t.masterRows('stage').filter((r) => r.stageKind === 1 && r.id <= n).map((r) => [r.stageId, 1]));
      at(weekOf(wi));
      const got = quiet(() => t.missionsData()).map((m) => m.id);
      check(wi >= 0 && got.includes(4091) === want, `storia vera fino alla ${n}: W02 4091 ${want ? 'attesa' : 'assente'}`);
    }
    t.player.stageScores = keep;
  }
}
t.forceStoryQuest(840);

// elenco: solo le righe Limited attive
at('2026-10-16T12:00:00Z');
const list = quiet(() => t.missionsData());
const limitedIds = list.map((m) => m.id).filter((id) => byId.has(id));
const month = monthly.find((ids) => ids.every((id) => t.limitedActive(id)));
const week = weekly.find((ids) => ids.every((id) => t.limitedActive(id)));
check(limitedIds.length === month.length + week.length, `elenco: ${limitedIds.length} Limited, attese ${month.length + week.length}`);

// Lux del mese -> prima missione mensile completata -> parte dello Spirit
const first = byId.get(month[0]);
quiet(() => t.missionCount('lux', first.targetNum[0]));
const st = quiet(() => t.missionsData()).find((m) => m.id === first.id);
check(st && st.status === 1, `missione ${first.id} «${first.missionName}» non completabile (${JSON.stringify(st)})`);
const res = call(t.respondMissionReceive, { receiveMissionIds: [first.id] });
check(first.rewardType === 33, `premio della prima mensile di tipo ${first.rewardType}`);
check(res.pet.userPetParts.some((p) => p.petPartsId === first.itemId), `parte ${first.itemId} assente da pet.userPetParts`);
check(res.missions.find((m) => m.id === first.id)?.status === 2, 'missione non segnata come riscossa');
log(`riscossa «${first.missionName}»: parte ${first.itemId}, ${res.pet.userPetParts.length} parti possedute`);

// premi unici (I-168, decisione dell'utente 19-10): una volta sola. second = completata ma non riscossa (a fine mese
// va nei Presents), third = non completata in tempo (deve tornare)
const second = byId.get(month[1]), third = byId.get(month[2]);
quiet(() => t.missionCount('lux', second.targetNum[0] - first.targetNum[0]));
const st2 = quiet(() => t.missionsData());
check(st2.find((m) => m.id === second.id)?.status === 1 && st2.find((m) => m.id === third.id)?.status === 0, 'seconda completata, terza no');
check(st2.find((m) => m.id === first.id)?.status === 2, 'la riscossa resta visibile nel suo mese');
quiet(() => t.settleClock()); // la prima chiusura registra solo l'istante
const presentsBefore = (t.player.presents || []).length;
at(new Date(Date.UTC(2026, 10, 16, 12)).toISOString());
quiet(() => t.settleClock());
check((t.player.presents || []).slice(presentsBefore).some((p) => p.resourceType === 33 && p.resourceId === second.itemId), 'seconda (completata, non riscossa) nei Presents a fine mese');
// la stessa campagna fra 35 mesi
at(new Date(Date.UTC(2026, 9 + 35, 16, 12)).toISOString());
quiet(() => t.settleClock());
const back = quiet(() => t.missionsData());
check(!back.some((m) => m.id === first.id), 'premio unico riscosso: la missione non torna');
check(!back.some((m) => m.id === second.id), 'premio unico arrivato nei Presents: la missione non torna');
const again = back.find((m) => m.id === third.id);
check(again && again.status === 0 && again.numUpper === 0, `non completata in tempo: torna da zero (${JSON.stringify(again)})`);
// parte gia' posseduta per altra via: niente premio fantasma
const fourth = byId.get(month[3]);
if (fourth && fourth.rewardType === 33) {
  t.player.pet.parts[fourth.itemId] = Date.now();
  check(!quiet(() => t.missionsData()).some((m) => m.id === fourth.id), 'parte gia posseduta: missione nascosta');
}

const untyped = rows.filter((r) => !r.rewardType).map((r) => `${r.id} ${r.missionName}`);
log(`premi ancora senza tipo: ${untyped.length}${untyped.length ? ' (' + untyped.join('; ') + ')' : ''}`);

Date.now = realNow;
try { fs.unlinkSync(SAVE); } catch { /* gia' tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log(`OK: ${rows.length} righe Limited, ${monthly.length} mensili e ${weekly.length} brevi a rotazione`);
