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

  // a game without the resources while the data is gone (Re-Union X gave it to the game, then the game lost it): the
  // server answers resourcesize and then exits with code 3, so Re-Union X's :server process ends and the game, bound
  // to it, goes back to Re-Union X (GameLink). Phone test 12-11: mode 0 -> crash at home; staying up -> error 52 loop.
  const exitCode = (rev, env) => {
    const child = 'console.log=()=>{};const t=require(' + JSON.stringify(path.join(__dirname, 'server')) + ')._test;' +
      'let sent=false;t.respondResourceSize({writeHead(){},end(){sent=true;}},{resourceRevision:' + rev + ',masterRevision:0});' +
      'setTimeout(()=>process.exit(sent?0:9),1500)';
    try { execFileSync(process.execPath, ['-e', child], { env, stdio: 'ignore' }); return 0; } catch (e) { return e.status; }
  };
  const withState = { ...base, KHUX_RESOURCE_STATE: stateFile };
  fs.rmSync(path.join(res, '112', 'data'), { recursive: true });
  if (exitCode(0, withState) !== 3) errors.push('no data, old revision: server did not exit with 3');
  if (exitCode(112, withState) !== 0) errors.push('no data, game up to date: server exited');
  if (exitCode(0, base) !== 0) errors.push('no data, no KHUX_RESOURCE_STATE (PC): server exited');
  fs.mkdirSync(path.join(res, '112', 'data'));
  fs.writeFileSync(path.join(res, '112', 'data', 'd0000'), 'data');
  if (exitCode(0, withState) !== 0) errors.push('data present, old revision (first download): server exited');

  // An up-to-date game does not send resourcesize at all (phone 12-11: straight from /tutorial/status to the home), so
  // reaching the home (GET /user/start) is the signal that the game has the latest resources, unless in this session it
  // declared an old revision and the last data piece has not been served whole yet.
  const home = (script) => {
    const child = 'console.log=()=>{};const fs=require("fs");const {PassThrough}=require("stream");' +
      'const t=require(' + JSON.stringify(path.join(__dirname, 'server')) + ')._test;' +
      'const have=()=>JSON.parse(fs.readFileSync(' + JSON.stringify(stateFile) + ',"utf8")).have;const out=[];' + script;
    return execFileSync(process.execPath, ['-e', child], { env: withState }).toString().trim();
  };
  fs.writeFileSync(path.join(res, '112', 'data', 'd0001'), 'last');
  if (home('t.noteGameAtHome();process.stdout.write(String(have()))') !== '112') errors.push('up-to-date game at home: state not 112');
  const seq = home(
    't.respondResourceSize({writeHead(){},end(){}},{resourceRevision:0,masterRevision:0});' +
    't.noteGameAtHome();out.push(have());' +
    'const serve=(n,next)=>{const r=new PassThrough();r.writeHead=()=>{};r.resume();r.on("finish",()=>setTimeout(next,30));' +
    't.respondResourceFile({url:"/resource/112/data/"+n},r);};' +
    'serve("d0000",()=>{t.noteGameAtHome();out.push(have());serve("d0001",()=>{t.noteGameAtHome();out.push(have());' +
    'process.stdout.write(out.join(","));process.exit(0);});});');
  if (seq !== '0,0,112') errors.push('download in progress counted as done: ' + seq);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
if (errors.length) { console.error('FAIL\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('test-resource-state: ok');
