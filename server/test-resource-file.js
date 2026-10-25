// GET /resource/<versione>/<data|index>/<nome> (respondResourceFile, I-136): un file che non si legge dopo i controlli
// non deve far cadere il server (errore asincrono dello stream). node server/test-resource-file.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const { PassThrough } = require('stream');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-test-res-'));
const SAVE = path.join(DIR, 'player.json');
fs.copyFileSync(path.join(__dirname, 'save', 'maxpower.json'), SAVE);
fs.mkdirSync(path.join(DIR, 'res', '9', 'data'), { recursive: true });
fs.writeFileSync(path.join(DIR, 'res', '9', 'data', 'ok.bin'), Buffer.from('abcdef'));
// una cartella col nome di un file: existsSync e statSync passano, la lettura fallisce dopo (EISDIR)
fs.mkdirSync(path.join(DIR, 'res', '9', 'data', 'broken.bin'));
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_RESOURCE_DIR = path.join(DIR, 'res');
const say = (s) => process.stdout.write(s + '\n'); // il server reindirizza console.log
const log = console.log; console.log = () => {};
let t; try { t = require('./server')._test; } finally { console.log = log; }
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
let crashed = null, step = 'avvio', finished = false;
process.on('uncaughtException', (e) => { crashed = e; });
// una risposta mai chiusa svuota il ciclo degli eventi e node uscirebbe con 0 senza dire niente
process.on('exit', () => { if (!finished) { say(`ERRORE: test interrotto (${step}): risposta mai chiusa`); process.exitCode = 1; } });

const fakeRes = () => {
  const r = new PassThrough(); const chunks = [];
  r.code = 0; r.writeHead = (c) => { r.code = c; r.headersSent = true; return r; };
  r.on('data', (c) => chunks.push(c));
  r.body = () => Buffer.concat(chunks).toString('utf8');
  return r;
};
const get = (url) => new Promise((done) => {
  step = url;
  const res = fakeRes();
  let over = false;
  const end = () => { if (!over) { over = true; setTimeout(() => done(res), 50); } };
  res.on('end', end); res.on('close', end); res.on('error', end);
  t.respondResourceFile({ url }, res);
});

(async () => {
  const ok = await get('/resource/9/data/ok.bin');
  check(ok.code === 200 && ok.body() === 'abcdef', `file letto: ${ok.code} «${ok.body()}»`);
  const miss = await get('/resource/9/data/missing.bin');
  check(miss.code === 404, `file assente: ${miss.code}`);
  const bad = await get('/resource/9/data/broken.bin');
  await new Promise((r) => setTimeout(r, 100));
  check(!crashed, `errore di lettura non gestito: ${crashed && crashed.message}`);
  check(bad.destroyed, 'risposta non chiusa dopo l\'errore di lettura');
  fs.rmSync(DIR, { recursive: true, force: true });
  finished = true;
  if (errors.length) { say(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
  say('OK: resource file');
  process.exit(0);
})();
