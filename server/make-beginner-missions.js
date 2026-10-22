// Missioni Beginner (missionType 1, I-118): le 34 della khuxwiki («Mission», com'era nel 2019),
// scheda valida 30 giorni dalla creazione dell'account (avviso ufficiale «Introducing Missions!»,
// 9-11-2017, id 34271; reference\missions\beginner_limited.md). I conditionId originali non sono
// noti: si usano id da 30 in su, che il client non tratta in modo speciale (nessun blocco su
// Challenge ne' formato del nome). Avanzamento in server.js (MISSION_DERIVED / MISSION_COUNTER).
// Riscrive le righe 1001-1034 in server/tables/mission.json e master_data/mission.json.
//   node server/make-beginner-missions.js
const fs = require('fs');
const path = require('path');

// [conditionId, testo, targetId, targetNum, page, rewardType, itemNum]
// conditionId: 30 storia superata fino alla quest targetId, 31 potenza dell'equipaggiamento (STR del keyblade
// preferito), 32 keyblade della serie targetId (category) a +N, 33 Lux totali, 34 medaglie con lo Special Attack
// Bonus al massimo, 35 Draw Medal (contatore 'draw': una per estrazione riuscita, non retroattivo), 39 Nova (livello
// del Guilt Burst, derivato), 40 rango dello Spirit (rango della Gear, derivato), 41 Proud superate fino alla 3 (derivato, I-200). Restano a 0 finche' non c'e' la
// funzione: 3 Raid Boss (contatore 'raid' mai chiamato, niente Raid), 36-38 quest speciali e Proud Quest (eventi),
// 42 eventi, 43 Colosseo, 44 Union Cross (nessuno stage/tabella/partita di quel tipo nel server).
// rewardType 2 Jewel; 26 Skip Ticket (setItemImageData della 1.0.1; per lo «Skip Ticket+» da verificare).
const J = 2, SKIP = 26;
const ROWS = [
  [30, 'Complete story quest 6', 6, 1, 10, J, 100],
  [30, 'Complete story quest 14', 14, 1, 10, J, 100],
  [30, 'Complete story quest 24', 24, 1, 10, J, 100],
  [30, 'Complete story quest 34', 34, 1, 10, J, 100],
  [30, 'Complete story quest 130', 130, 1, 10, J, 100],
  [31, "Raise your equipment's total power to 30000", 0, 30000, 10, J, 100],
  [31, "Raise your equipment's total power to 50000", 0, 50000, 10, J, 100],
  [31, "Raise your equipment's total power to 120000", 0, 120000, 10, J, 100],
  [35, 'Draw Medal x 3', 0, 3, 10, SKIP, 5],
  [35, 'Draw Medal x 7', 0, 7, 10, SKIP, 10],
  [36, 'Complete special quest for EXP Medals of all attributes x 5', 0, 5, 10, J, 50],
  [37, 'Complete special quest for materials for all Keyblades x 5', 0, 5, 10, J, 50],
  [38, 'Complete event "Proud Quest" of all attributes x 1', 0, 1, 10, J, 50],
  [38, 'Complete event "Proud Quest" of all attributes x 10', 0, 10, 10, J, 50],
  [32, 'Strengthen Starlight Keyblade to +4', 1, 4, 10, J, 50],
  [32, 'Strengthen Starlight Keyblade to +11', 1, 11, 10, J, 50],
  [32, 'Strengthen Starlight Keyblade to +21', 1, 21, 10, J, 50],
  [32, 'Strengthen Treasure Trove Keyblade to +5', 201, 5, 10, J, 50],
  [32, 'Strengthen Lady Luck Keyblade to +5', 301, 5, 10, J, 50],
  [32, 'Strengthen Three Wishes Keyblade to +5', 401, 5, 10, J, 50],
  [33, 'Obtain a total of 500000 Lux', 0, 500000, 10, J, 50],
  [33, 'Obtain a total of 2000000 Lux', 0, 2000000, 10, J, 50],
  [3, 'Defeat Raid Boss x 3', 0, 3, 10, J, 50],
  [3, 'Defeat Raid Boss x 10', 0, 10, 10, J, 50],
  [34, 'Max out the SP Attack Bonus of Medal x 1', 0, 1, 10, J, 50],
  [34, 'Max out the SP Attack Bonus of Medal x 2', 0, 2, 10, J, 50],
  [39, 'Raise Nova attack to LV 20', 0, 20, 10, J, 50],
  [39, 'Raise Nova attack to LV 50', 0, 50, 10, J, 50],
  [40, "Raise a Spirit's rank to 2", 0, 2, 10, J, 50],
  [40, "Raise a Spirit's rank to 3", 0, 3, 10, J, 50],
  [41, 'Complete up to story quest 3 in Proud Mode', 0, 1, 10, J, 50],
  [42, 'Complete event quest x 10', 0, 10, 10, J, 50],
  [43, 'Complete Coliseum round x 10', 0, 10, 24, J, 50],
  [44, 'Complete Union Cross quest x 10', 0, 10, 16, J, 50],
];

const rows = ROWS.map(([conditionId, missionName, targetId, targetNum, page, rewardType, itemNum], i) => ({
  id: 1001 + i, missionType: 1, sortId: i + 1, conditionId, page, missionName,
  validTarget: 1, targetType: [0], targetId: [targetId], targetNum: [targetNum],
  validStages: 0, targetStageType: [0, 0], targetStageStartId: [0, 0], targetStageEndId: [0, 0],
  rewardType, itemId: 0, skillType: 0, skillId: 0, skillLv: 0, burstUpperNumber: 0, itemNum,
  startDate: '2015-01-01 08:00:00', endDate: '2099-12-31 23:59:59', rewardEndTime: '2099-12-31 23:59:59',
}));

for (const file of [path.join(__dirname, 'tables', 'mission.json'), path.join(__dirname, 'master_data', 'mission.json')]) {
  const keep = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => r.missionType !== 1);
  const all = [...rows, ...keep].sort((a, b) => a.id - b.id);
  fs.writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
  console.log(`${file}: ${rows.length} Beginner + ${keep.length} altre`);
}
