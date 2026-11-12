// Resource state for Re-Union X (KHUX_RESOURCE_STATE): at every PUT /system/resourcesize the server writes which
// resource revision the game declared, the latest version it serves and whether that version's data is on disk.
// Re-Union X deletes its copy of the data once the game has them (Re-Union-X-App,
// docs/superpowers/specs/2026-11-12-spazio-risorse-design.md). Without the variable nothing is written.
//   node server/test-resource-state.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const { execFileSync } = require('child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-resstate-'));
const errors = [];
try {
  const save = path.join(dir, 'save.json');
  fs.copyFileSync(path.join(__dirname, 'save', 'maxpower.json'), save);
  const res = path.join(dir, 'res');
  fs.mkdirSync(path.join(res, '112', 'index'), { recursive: true });
  fs.mkdirSync(path.join(res, '112', 'data'), { recursive: true });
  fs.writeFileSync(path.join(res, '112', 'index', 'i0'), 'idx');
  fs.writeFileSync(path.join(res, '112', 'data', 'd0000'), 'data');
  const stateFile = path.join(dir, 'resource.state');
  const base = { ...process.env, KHUX_SAVE: save, KHUX_LOG_DIR: path.join(dir, 'logs'), KHUX_RESOURCE_DIR: res };
  delete base.KHUX_RESOURCE_STATE;
  const write = (have, env) => {
    const child = 'console.log=()=>{};const t=require(' + JSON.stringify(path.join(__dirname, 'server')) + ')._test;' +
      't.writeResourceState(' + JSON.stringify(have) + ');process.exit(0)';
    execFileSync(process.execPath, ['-e', child], { env });
  };
  const read = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));

  write(0, { ...base, KHUX_RESOURCE_STATE: stateFile });
  let s = read();
  if (s.have !== 0 || s.latest !== 112 || s.dataMissing !== false) errors.push('with data: ' + JSON.stringify(s));
  if (typeof s.at !== 'number' || s.at <= 0) errors.push('at not a number: ' + s.at);
  if (fs.existsSync(stateFile + '.tmp')) errors.push('temporary file left behind');

  write(112, { ...base, KHUX_RESOURCE_STATE: stateFile });
  s = read();
  if (s.have !== 112 || s.dataMissing !== false) errors.push('have 112: ' + JSON.stringify(s));

  fs.rmSync(path.join(res, '112', 'data'), { recursive: true });
  write(0, { ...base, KHUX_RESOURCE_STATE: stateFile });
  s = read();
  if (s.dataMissing !== true || s.latest !== 112) errors.push('without data: ' + JSON.stringify(s));

  fs.mkdirSync(path.join(res, '112', 'data'));
  write(0, { ...base, KHUX_RESOURCE_STATE: stateFile });
  if (read().dataMissing !== true) errors.push('empty data folder not reported as missing');

  fs.rmSync(stateFile);
  write(5, base);
  if (fs.existsSync(stateFile)) errors.push('state written without KHUX_RESOURCE_STATE');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
if (errors.length) { console.error('FAIL\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('test-resource-state: ok');
