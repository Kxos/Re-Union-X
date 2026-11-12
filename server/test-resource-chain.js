// Incremental resource versions (mode 2, docs/notes/server.md#resource-mode2): a version folder with base.txt holds only
// the pieces appended after its base version and the full index. The server answers GET /system/resource with
//   - mode 2 from the game's revision when that revision is in the chain of the latest version (only the new pieces),
//   - mode 1 with the whole chain otherwise (base pieces + every appended pack, concatenated by the game),
// and PUT /system/resourcesize with the bytes of that download.
//   node server/test-resource-chain.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const { execFileSync } = require('child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-reschain-'));
const errors = [];
const check = (ok, what) => { if (!ok) errors.push(what); };
try {
  const save = path.join(dir, 'save.json');
  fs.copyFileSync(path.join(__dirname, 'save', 'maxpower.json'), save);
  const res = path.join(dir, 'res');
  const put = (rel, text) => { const f = path.join(res, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  put('112/data/d0000', 'aaaa'); put('112/data/d0001', 'bbbbbb'); put('112/index/misc.png', 'index112');
  put('113/base.txt', '112\n'); put('113/data/d0000', 'cc'); put('113/index/misc.png', 'index113!');
  put('114/base.txt', '113'); put('114/data/d0000', 'ddd'); put('114/index/misc.png', 'index-114!!');
  const env = { ...process.env, KHUX_SAVE: save, KHUX_LOG_DIR: path.join(dir, 'logs'), KHUX_RESOURCE_DIR: res };
  for (const k of ['KHUX_RESOURCE_STATE', 'KHUX_RESOURCE_SIZE', 'KHUX_RESOURCE_REMOTE']) delete env[k];
  // runs `script` with t = server._test; the script prints JSON
  const run = (script, extra) => {
    const child = 'console.log=()=>{};const t=require(' + JSON.stringify(path.join(__dirname, 'server')) + ')._test;' +
      'const body=(fn,...a)=>{let out;fn({writeHead(){},setHeader(){},end(b){out=b;}},...a);return JSON.parse(out);};' + script;
    return JSON.parse(execFileSync(process.execPath, ['-e', child], { env: { ...env, ...extra } }).toString());
  };
  const plan = (rev) => run('process.stdout.write(JSON.stringify(body(t.respondResource,{revision:' + rev + '}).resource))');
  const urls = (files) => files.map((f) => f.url.replace(/^.*\/resource\//, ''));

  check(JSON.stringify(run('process.stdout.write(JSON.stringify(t.resourceChain(114)))')) === '[112,113,114]', 'chain of 114');
  check(JSON.stringify(run('process.stdout.write(JSON.stringify(t.resourceChain(112)))')) === '[112]', 'chain of a full version');

  // the game at 112: only the pieces of 113 and 114, index of 114 for every version (the game keeps the last one)
  let p = plan(112);
  check(p.mode === 2 && p.minVersion === 113 && p.versions.length === 2, 'from 112: ' + JSON.stringify(p));
  check(JSON.stringify(p.versions.map((v) => urls(v.data))) === '[["113/data/d0000"],["114/data/d0000"]]', 'from 112, data: ' + JSON.stringify(p.versions));
  check(p.versions.every((v) => JSON.stringify(urls(v.index)) === '["114/index/misc.png"]'), 'from 112, index: ' + JSON.stringify(p.versions));
  p = plan(113);
  check(p.mode === 2 && p.minVersion === 114 && p.versions.length === 1 && urls(p.versions[0].data)[0] === '114/data/d0000', 'from 113: ' + JSON.stringify(p));
  // a new game, or one older than the base: the whole chain with mode 1
  for (const rev of [0, 50, 111]) {
    p = plan(rev);
    check(p.mode === 1 && p.minVersion === 112 && p.versions.length === 3, 'from ' + rev + ': ' + JSON.stringify(p));
    check(JSON.stringify(urls(p.versions[0].data)) === '["112/data/d0000","112/data/d0001"]', 'from ' + rev + ', base pieces');
  }
  p = plan(0);
  check(p.versions[2].data[0].size === 3 && p.versions[2].index[0].size === 11, 'sizes: ' + JSON.stringify(p.versions[2]));

  // bytes announced by resourcesize: the pieces of the download + the index
  const size = (rev, extra) => run('process.stdout.write(JSON.stringify(body(t.respondResourceSize,{resourceRevision:' + rev + ',masterRevision:0}).size))', extra);
  check(size(112) === 2 + 3 + 11, 'resourcesize from 112: ' + size(112));
  check(size(0) === 4 + 6 + 2 + 3 + 11, 'resourcesize from 0: ' + size(0));
  check(size(0, { KHUX_RESOURCE_SIZE: '77' }) === 77, 'KHUX_RESOURCE_SIZE still overrides (bench)');

  // a broken chain (base missing, base not older): nothing to serve rather than a stream that does not match the index
  put('115/base.txt', '110'); put('115/data/d0000', 'e'); put('115/index/misc.png', 'i');
  check(run('process.stdout.write(JSON.stringify(t.resourceChain(115)))') === null, 'chain with a missing base');
  p = plan(112);
  check(p.mode === 0 && p.versions.length === 0, 'broken chain served: ' + JSON.stringify(p));
  fs.writeFileSync(path.join(res, '115', 'base.txt'), '115');
  check(run('process.stdout.write(JSON.stringify(t.resourceChain(115)))') === null, 'chain with a base not older');
  fs.rmSync(path.join(res, '115'), { recursive: true });

  // state for Re-Union X: data missing when a version of the download has no pieces (here the base)
  const stateFile = path.join(dir, 'resource.state');
  const state = (have) => run('t.writeResourceState(' + have + ');process.stdout.write(require("fs").readFileSync(' +
    JSON.stringify(stateFile) + ',"utf8"))', { KHUX_RESOURCE_STATE: stateFile });
  check(state(0).dataMissing === false && state(0).latest === 114, 'state with the chain: ' + JSON.stringify(state(0)));
  fs.rmSync(path.join(res, '112', 'data'), { recursive: true });
  check(state(0).dataMissing === true, 'base pieces gone, new game: not reported');
  check(state(113).dataMissing === false, 'base pieces gone, game at 113 needs only 114: reported missing');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
if (errors.length) { console.error('FAIL\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('test-resource-chain: ok');
