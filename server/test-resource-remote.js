// Resource pieces from GitHub (KHUX_RESOURCE_REMOTE): on the phone the pkg has no resource data, only
// resources/<N>/data.txt (name, bytes, md5, asset). The server lists the pieces from it and streams each one from the
// GitHub release to the game, resuming with Range when GitHub drops (Re-Union-X-App,
// docs/superpowers/specs/2026-11-12-risorse-da-github-design.md). A fake GitHub runs here.
//   node server/test-resource-remote.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-remote-'));
const errors = [];
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const pieces = { d0000: Buffer.alloc(300000, 7), d0001: crypto.randomBytes(500000) };
const assets = { 'd0000.aaaaaaaaaaaa': { id: 1, body: pieces.d0000 }, 'd0001.bbbbbbbbbbbb': { id: 2, body: pieces.d0001 } };
let dropNext = 0;            // asset id whose next blob answer stops halfway
let tokenLeak = false;
const ranges = [];

const gh = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/repos/K/D/releases/tags/pkg') {
    if (req.headers.authorization !== 'Bearer secret') { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: 7 }));
  }
  if (u.pathname === '/repos/K/D/releases/7/assets') {
    const list = u.searchParams.get('page') === '1' ? Object.entries(assets).map(([name, a]) => ({ name, id: a.id })) : [];
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(list));
  }
  const m = /^\/repos\/K\/D\/releases\/assets\/(\d+)$/.exec(u.pathname);
  if (m) {
    if (req.headers.authorization !== 'Bearer secret' || req.headers.accept !== 'application/octet-stream') { res.writeHead(403); return res.end(); }
    res.writeHead(302, { Location: 'http://127.0.0.1:' + gh.address().port + '/blob/' + m[1] }); return res.end();
  }
  const b = /^\/blob\/(\d+)$/.exec(u.pathname);
  if (b) {
    if (req.headers.authorization) tokenLeak = true;
    const a = Object.values(assets).find((x) => x.id === Number(b[1]));
    const r = /^bytes=(\d+)-$/.exec(req.headers.range || '');
    const from = r ? Number(r[1]) : 0;
    ranges.push(b[1] + ':' + from);
    const body = a.body.subarray(from);
    res.writeHead(r ? 206 : 200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
    if (dropNext === a.id) {
      dropNext = 0;
      res.write(body.subarray(0, 100000));
      return setTimeout(() => res.destroy(), 50);
    }
    return res.end(body);
  }
  res.writeHead(404); res.end();
});

// one child process (a fresh server module): runs `script`, prints JSON on stdout; exit code returned too
function child(script, env) {
  const code = 'console.log=()=>{};const t=require(' + JSON.stringify(path.join(__dirname, 'server')) + ')._test;' +
    'const {PassThrough}=require("stream");const out={};' +
    'const fetchPiece=(name)=>new Promise((ok)=>{const r=new PassThrough();const parts=[];let head=null;' +
    'r.writeHead=(c,h)=>{head={c,h}};r.on("data",(d)=>parts.push(d));r.on("finish",()=>ok({head,body:Buffer.concat(parts)}));' +
    'r.on("close",()=>ok({head,body:Buffer.concat(parts),closed:true}));t.respondResourceFile({url:"/resource/112/data/"+name},r);});' +
    '(async()=>{' + script + '})().then(()=>{process.stdout.write(JSON.stringify(out));process.exit(0)},(e)=>{process.stdout.write(JSON.stringify({err:String(e)}));process.exit(1)})';
  return new Promise((resolve) => execFile(process.execPath, ['-e', code], { env, maxBuffer: 1 << 24 },
    (err, stdout) => { let o = {}; try { o = JSON.parse(stdout); } catch { o = { raw: stdout }; } resolve({ code: err ? err.code : 0, out: o }); }));
}

(async () => {
  await new Promise((ok) => gh.listen(0, '127.0.0.1', ok));
  const save = path.join(dir, 'save.json');
  fs.copyFileSync(path.join(__dirname, 'save', 'maxpower.json'), save);
  const res = path.join(dir, 'res');
  fs.mkdirSync(path.join(res, '112', 'index'), { recursive: true });
  fs.writeFileSync(path.join(res, '112', 'index', 'misc.png'), 'idx');
  fs.writeFileSync(path.join(res, '112', 'data.txt'), 'format 1\n' + Object.entries(pieces).map(([n, b]) =>
    `${n} ${b.length} ${md5(b)} ${Object.keys(assets).find((k) => k.startsWith(n))}\n`).join(''));
  const stateFile = path.join(dir, 'resource.state');
  const base = { ...process.env, KHUX_SAVE: save, KHUX_LOG_DIR: path.join(dir, 'logs'), KHUX_RESOURCE_DIR: res };
  delete base.KHUX_RESOURCE_STATE; delete base.KHUX_RESOURCE_REMOTE;
  const env = { ...base, KHUX_RESOURCE_STATE: stateFile, KHUX_RESOURCE_REMOTE: 'K/D@pkg', KHUX_GITHUB_TOKEN: 'secret',
    KHUX_GITHUB_API: 'http://127.0.0.1:' + gh.address().port };

  // listing from data.txt
  let r = await child('const f=t.resourceFiles(112,"data");out.list=f.map(x=>[x.url.split("/").pop(),x.size,x.md5]);', env);
  const want = Object.entries(pieces).map(([n, b]) => [n, b.length, md5(b)]);
  if (JSON.stringify(r.out.list) !== JSON.stringify(want)) errors.push('listing: ' + JSON.stringify(r.out));

  // a piece streamed whole, token not forwarded to the blob host
  r = await child('const p=await fetchPiece("d0000");out.len=p.body.length;out.md5=require("crypto").createHash("md5").update(p.body).digest("hex");out.cl=p.head&&p.head.h["Content-Length"];', env);
  if (r.out.md5 !== md5(pieces.d0000) || Number(r.out.cl) !== pieces.d0000.length) errors.push('piece: ' + JSON.stringify(r.out));
  if (tokenLeak) errors.push('token sent to the redirect host');

  // resume: GitHub drops after 100000 bytes, the server asks again from there
  dropNext = 2; ranges.length = 0;
  r = await child('const p=await fetchPiece("d0001");out.md5=require("crypto").createHash("md5").update(p.body).digest("hex");out.len=p.body.length;', env);
  if (r.out.md5 !== md5(pieces.d0001)) errors.push('resume: wrong bytes ' + JSON.stringify(r.out));
  if (!ranges.includes('2:100000')) errors.push('resume: no Range from 100000: ' + ranges.join(','));

  // unknown piece -> 404
  r = await child('const p=await fetchPiece("d9999");out.code=p.head&&p.head.c;', env);
  if (r.out.code !== 404) errors.push('unknown piece: ' + JSON.stringify(r.out));

  // state: data available remotely is not "missing"
  r = await child('t.writeResourceState(0);out.s=JSON.parse(require("fs").readFileSync(' + JSON.stringify(stateFile) + ',"utf8"));', env);
  if (!r.out.s || r.out.s.dataMissing !== false) errors.push('state with remote data: ' + JSON.stringify(r.out));

  // last piece served whole -> download no longer pending -> home counts
  r = await child('t.respondResourceSize({writeHead(){},end(){}},{resourceRevision:0,masterRevision:0});t.noteGameAtHome();' +
    'const fsx=require("fs");out.a=JSON.parse(fsx.readFileSync(' + JSON.stringify(stateFile) + ',"utf8")).have;' +
    'await fetchPiece("d0000");await fetchPiece("d0001");await new Promise(o=>setTimeout(o,50));t.noteGameAtHome();' +
    'out.b=JSON.parse(fsx.readFileSync(' + JSON.stringify(stateFile) + ',"utf8")).have;', env);
  if (r.out.a !== 0 || r.out.b !== 112) errors.push('home after the remote download: ' + JSON.stringify(r.out));

  // offline: GitHub unreachable, the game is behind -> state offline, exit 3
  const off = { ...env, KHUX_GITHUB_API: 'http://127.0.0.1:1' };
  r = await child('t.respondResourceSize({writeHead(){},end(){}},{resourceRevision:0,masterRevision:0});await new Promise(o=>setTimeout(o,12000));', off);
  let s = {}; try { s = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* none */ }
  if (r.code !== 3) errors.push('offline: exit ' + r.code);
  if (s.offline !== true) errors.push('offline: state ' + JSON.stringify(s));
  // online and behind: no exit
  r = await child('t.respondResourceSize({writeHead(){},end(){}},{resourceRevision:0,masterRevision:0});await new Promise(o=>setTimeout(o,3000));', env);
  if (r.code !== 0) errors.push('online: exit ' + r.code);
  s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (s.offline) errors.push('online: state offline');

  // without KHUX_RESOURCE_REMOTE (PC): no listing from data.txt
  r = await child('out.n=t.resourceFiles(112,"data").length;', { ...base });
  if (r.out.n !== 0) errors.push('PC server listed remote pieces: ' + JSON.stringify(r.out));
})().catch((e) => errors.push(String(e && e.stack || e))).finally(() => {
  gh.close();
  fs.rmSync(dir, { recursive: true, force: true });
  if (errors.length) { console.error('FAIL\n  ' + errors.join('\n  ')); process.exit(1); }
  console.log('test-resource-remote: ok');
});
