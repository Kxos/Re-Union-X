// Adesivi della chat (stamp-table.js, I-210): node server/test-stamp-table.js
'use strict';
const fs = require('fs'); const path = require('path');
const st = require('./stamp-table');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

const rows = st.stampRows();
// il client disegna ISTAMP:TALKS:<n> come talkstamp_<n>.png e cerca la riga stampId == n senza controllo: stampId = imageId
check(rows.length === 7 && rows.every((r) => r.stampId === r.imageId && r.validStamp === 1 && r.category === 1), `righe ${JSON.stringify(rows)}`);
check(JSON.stringify(rows.map((r) => r.stampId)) === '[4,5,8,10,12,23,27]', 'adesivi senza testo giapponese');
check(rows.every((r) => r.imageWidth === 180 && r.imageHeight === 180 && r.sortId === r.stampId), 'misure/ordine');
const master = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'stamp.json'), 'utf8'));
check(JSON.stringify(master) === JSON.stringify(rows), `master stamp.json: ${master.length} righe`);

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: stamp table');
