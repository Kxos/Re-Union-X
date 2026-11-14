// Status ailment table (badstatus-fix.js, I-273): node server/test-badstatus-fix.js
'use strict';
const fs = require('fs'); const path = require('path');
const fix = require('./badstatus-fix');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

// unit: empty table gets every row, sorted; idempotent; a changed row is replaced; master-only rows stay
const orig = [{ badstatusId: 121, name: 'Paralysis', effect: 3, target: 0 }, { badstatusId: 101, name: 'Poison', effect: 1, target: 0 }];
const rows = [];
const s1 = fix.applyBadstatus(rows, orig);
check(s1.added === 2 && rows.map((r) => r.badstatusId).join() === '101,121', `empty table: ${JSON.stringify(s1)} ${JSON.stringify(rows)}`);
const s2 = fix.applyBadstatus(rows, orig);
check(s2.added === 0 && s2.replaced === 0 && s2.same === 2, `not idempotent: ${JSON.stringify(s2)}`);
const mixed = [{ badstatusId: 121, name: 'Wrong', effect: 0, target: 0 }, { badstatusId: 999, name: 'Ours' }];
const s3 = fix.applyBadstatus(mixed, orig);
check(s3.replaced === 1 && s3.added === 1 && mixed.length === 3 && mixed.find((r) => r.badstatusId === 121).name === 'Paralysis'
  && mixed.some((r) => r.badstatusId === 999), `replace/keep: ${JSON.stringify(s3)} ${JSON.stringify(mixed)}`);
check(orig[0].name === 'Paralysis' && rows[1] !== orig[1], 'source rows must be copied, not shared');

// served master: the paralysis rows the client reads when the player's turn starts paralyzed (Quest 344 crash)
const served = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'badstatus.json'), 'utf8'));
for (const id of [101, 102, 111, 112, 121, 122]) check(served.some((r) => r.badstatusId === id), `master_data/badstatus.json lacks row ${id}`);
const src = fix.readOrig();
if (src) check(src.every((o) => JSON.stringify(served.find((r) => r.badstatusId === o.badstatusId)) === JSON.stringify(o)),
  'master_data/badstatus.json differs from the original rows');

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('test-badstatus-fix: ok');
