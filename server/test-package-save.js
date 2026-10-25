// Start save of the play package (make-package-save.js) seen through the server's own code path:
//   node server/test-package-save.js [maxpower.json] [proudall.json]
// The merged save must keep every medal of the max-power save and the whole Proud progress of the Proud save.
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVES = path.join(__dirname, 'save');
const MAX = process.argv[2] || path.join(SAVES, 'maxpower.json');
const PROUD = process.argv[3] || path.join(SAVES, 'proudall.json');
const OUT = path.join(os.tmpdir(), `khux-test-package-save-${process.pid}.json`);
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const bytes = (f) => fs.readFileSync(f);
const before = [bytes(MAX), bytes(PROUD)];

const { merge } = require('./make-package-save');
const max = JSON.parse(before[0]); const proud = JSON.parse(before[1]);
const p = merge(JSON.parse(before[0]), JSON.parse(before[1]));
fs.writeFileSync(OUT, JSON.stringify(p));

check(Object.keys(p.stageScores).length >= Object.keys(proud.stageScores).length, `stageScores ${Object.keys(p.stageScores).length}`);
check(p.lastClearStageId === 39159, `lastClearStageId ${p.lastClearStageId}`);
check('1039159' in p.stageScores, 'Proud 979 score missing');
const ids = (s) => new Set(s.medals.map((m) => m.medalId));
check(ids(p).size >= ids(max).size, `distinct medals ${ids(p).size} < ${ids(max).size}`);
check(p.medals.length === max.medals.length, 'medal list changed');
const kb = new Set(p.keyblades.map((k) => k.keybladeId));
for (const k of [...max.keyblades, ...proud.keyblades]) check(kb.has(k.keybladeId), `keyblade ${k.keybladeId} missing`);
const uk = p.keyblades.map((k) => k.userKeybladeId);
check(new Set(uk).size === uk.length, 'duplicate userKeybladeId');
check(bytes(MAX).equals(before[0]) && bytes(PROUD).equals(before[1]), 'a source save was modified');

// the server loads it, Proud Mode is open and finished up to 979
process.env.KHUX_SAVE = OUT;
const log = console.log; console.log = () => {};
let t; try { t = require('./server')._test; } finally { console.log = log; }
check(t.proudUnlocked(), 'Proud Mode closed');
check(t.lastProudNumber() === 979, `last Proud quest ${t.lastProudNumber()}`);
fs.rmSync(OUT, { force: true });
console.log(errors.length ? errors.map((e) => 'FAIL: ' + e).join('\n') : 'OK');
process.exit(errors.length ? 1 : 0);
