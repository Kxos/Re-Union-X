// KHUX_LOG_DIR: the request and DNS logs go to that folder (play package: the player's logs folder, not the package)
//   node server/test-log-dir.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-logdir-'));
const save = path.join(dir, 'save.json');
fs.copyFileSync(path.join(__dirname, 'save', 'maxpower.json'), save);
process.env.KHUX_SAVE = save;
process.env.KHUX_LOG_DIR = path.join(dir, 'logs');
const log = console.log; console.log = () => {};
try { require('./server'); } finally { console.log = log; }
const ok = fs.existsSync(path.join(dir, 'logs'));
fs.rmSync(dir, { recursive: true, force: true });
console.log(ok ? 'OK' : 'FAIL: KHUX_LOG_DIR not used');
process.exit(ok ? 0 : 1);
