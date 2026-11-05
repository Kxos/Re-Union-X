// Startup MD5 cache on disk (LOG_DIR/resource-md5.json): a second server process must not re-read a pack whose
// size and date did not change, and must re-hash it when it changed.
//   node server/test-md5-cache.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const { execFileSync } = require('child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-md5-'));
const errors = [];
try {
  const save = path.join(dir, 'save.json');
  fs.copyFileSync(path.join(__dirname, 'save', 'maxpower.json'), save);
  const pack = path.join(dir, 'pack.bin');
  fs.writeFileSync(pack, 'abc');
  const env = { ...process.env, KHUX_SAVE: save, KHUX_LOG_DIR: path.join(dir, 'logs'), KHUX_RESOURCE_DIR: path.join(dir, 'res') };
  // child: prints the md5 the server gives for the pack
  const child = `const log=console.log;console.log=()=>{};const t=require(${JSON.stringify(path.join(__dirname, 'server'))})._test;` +
    `process.stdout.write(t.fileMd5(${JSON.stringify(pack)}));process.exit(0)`;
  const md5 = () => execFileSync(process.execPath, ['-e', child], { env }).toString();
  const real = (s) => crypto.createHash('md5').update(s).digest('hex');
  const first = md5();
  if (first !== real('abc')) errors.push(`first md5 ${first}`);
  const cacheFile = path.join(dir, 'logs', 'resource-md5.json');
  if (!fs.existsSync(cacheFile)) errors.push('cache file not written');
  // plant a fake value under the current key: a second process must use the cache (no re-read)
  const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const k = Object.keys(c).find((x) => x.startsWith(pack + '|'));
  if (!k) errors.push('pack key missing');
  else { c[k] = 'cached'; fs.writeFileSync(cacheFile, JSON.stringify(c)); }
  if (md5() !== 'cached') errors.push('second process re-read the pack instead of the disk cache');
  // a changed file (other size) is hashed again and the stale key is dropped
  fs.writeFileSync(pack, 'abcdef');
  if (md5() !== real('abcdef')) errors.push('changed pack not re-hashed');
  const keys = Object.keys(JSON.parse(fs.readFileSync(cacheFile, 'utf8')));
  if (keys.length !== 1) errors.push(`stale keys kept: ${keys.length}`);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(errors.length ? 'FAIL: ' + errors.join('; ') : 'OK');
process.exit(errors.length ? 1 : 0);
