// Resource pieces from a GitHub release (optional, KHUX_RESOURCE_REMOTE). The local data folder may hold no resource
// data, only resources/<N>/data.txt («format 1», then «<name> <bytes> <md5> <asset>» per piece).
// The server lists the pieces from it and streams each one from the release to the game while it arrives, without
// keeping it; when GitHub drops in the middle it asks again with Range from the byte it reached and goes on with the
// same answer to the game (the game checks the MD5).
//   KHUX_RESOURCE_REMOTE=<owner>/<repo>@<tag>   KHUX_GITHUB_TOKEN=<read-only token>   KHUX_GITHUB_API (tests)
// Asset API with the token -> redirect followed WITHOUT the token. The token is never
// logged.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const TRIES = 5;

function config() {
  const r = process.env.KHUX_RESOURCE_REMOTE;
  if (!r) return null;
  const at = r.indexOf('@');
  return {
    repo: at < 0 ? r : r.slice(0, at),
    tag: at < 0 ? 'pkg' : r.slice(at + 1),
    token: process.env.KHUX_GITHUB_TOKEN || '',
    api: (process.env.KHUX_GITHUB_API || 'https://api.github.com').replace(/\/$/, ''),
  };
}

/** pieces of resources/<version>/data.txt: [{name, size, md5, asset}], [] if missing or broken */
function remoteEntries(resourceDir, version) {
  let text;
  try { text = fs.readFileSync(path.join(resourceDir, String(version), 'data.txt'), 'utf8'); } catch { return []; }
  const lines = text.split('\n');
  if (lines[0].trim() !== 'format 1') return [];
  const out = [];
  for (const l of lines.slice(1)) {
    const w = l.trim().split(' ');
    if (w.length !== 4 || !/^\d+$/.test(w[1]) || !/^[0-9a-f]{32}$/.test(w[2])) continue;
    out.push({ name: w[0], size: Number(w[1]), md5: w[2], asset: w[3] });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function get(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'ReUnionX-server', ...headers } }, resolve);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function apiHeaders(cfg, accept) {
  return { Authorization: 'Bearer ' + cfg.token, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
}

async function json(cfg, p) {
  const res = await get(cfg.api + p, apiHeaders(cfg, 'application/vnd.github+json'), 15000);
  const parts = [];
  for await (const c of res) parts.push(c);
  if (res.statusCode !== 200) {
    const e = new Error('GitHub ' + res.statusCode + ' for ' + p.split('?')[0]);
    e.status = res.statusCode;
    throw e;
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

let ids = null;          // asset name -> id, once per server process (read again if an asset is not in it)
let reading = null;      // the list being read: requests at the same time wait for the same one
function assetIds(cfg, fresh) {
  if (ids && !fresh) return Promise.resolve(ids);
  if (!reading) {
    reading = (async () => {
      const rel = await json(cfg, `/repos/${cfg.repo}/releases/tags/${encodeURIComponent(cfg.tag)}`);
      const m = new Map();
      for (let page = 1; ; page++) {
        const list = await json(cfg, `/repos/${cfg.repo}/releases/${rel.id}/assets?per_page=100&page=${page}`);
        for (const a of list) m.set(a.name, a.id);
        if (list.length < 100) break;
      }
      ids = m;
      return ids;
    })().finally(() => { reading = null; });
  }
  return reading;
}

/**
 * Can the pieces come from GitHub now? A real request every time, never the cache. 'ok'; 'denied' when GitHub answers
 * but refuses (token revoked or expired, release gone: 401/403/404); 'offline' when it does not answer in timeoutMs.
 */
async function reachable(cfg, timeoutMs = 8000) {
  try {
    const p = json(cfg, `/repos/${cfg.repo}/releases/tags/${encodeURIComponent(cfg.tag)}`);
    await Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), timeoutMs))]);
    return 'ok';
  } catch (e) {
    console.log('[risorse] GitHub: ' + e.message);
    return [401, 403, 404].includes(e.status) ? 'denied' : 'offline';
  }
}

class NoAsset extends Error {}

/** the asset from byte `from`: a readable response with exactly the bytes from there (skips them if Range is ignored) */
async function open(cfg, asset, from) {
  let id = (await assetIds(cfg)).get(asset);
  if (id == null) id = (await assetIds(cfg, true)).get(asset);
  if (id == null) throw new NoAsset('the release has no ' + asset);
  const a = await get(`${cfg.api}/repos/${cfg.repo}/releases/assets/${id}`, apiHeaders(cfg, 'application/octet-stream'), 20000);
  let res = a;
  if ([301, 302, 303, 307, 308].includes(a.statusCode)) {
    a.resume();
    const range = from > 0 ? { Range: 'bytes=' + from + '-' } : {};
    res = await get(a.headers.location, { Accept: 'application/octet-stream', ...range }, 30000);   // no token here
  } else if (from > 0) {
    a.destroy();
    throw new Error('no redirect for a resumed piece');
  }
  if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); throw new Error('GitHub ' + res.statusCode + ' for ' + asset); }
  return { stream: res, skip: res.statusCode === 200 ? from : 0 };
}

/**
 * Streams the piece to the game's response; done(ok) once at the end. The Content-Length is the piece's size, the
 * bytes go out in order; a drop from GitHub is resumed (up to TRIES) from the byte reached.
 */
function serveRemote(cfg, entry, res, done) {
  // the 200 goes out only once GitHub has answered: an asset missing from the release is a 404 at once, a GitHub that
  // never answers a 502, instead of a 200 that breaks later
  let sent = 0, tries = 0, lastSent = 0, finished = false, current = null, headers = false;
  const finish = (ok, why, code) => {
    if (finished) return;
    finished = true;
    if (current) current.destroy();
    if (ok) res.end();
    else {
      console.log(`[risorse] ${entry.name} da GitHub: ${why}`);
      if (!headers && code) { res.writeHead(code); res.end(); } else res.destroy();
    }
    done(ok);
  };
  res.on('close', () => { if (!res.writableFinished) finish(false, 'the game closed the connection'); });
  const attempt = async () => {
    let s;
    try { s = await open(cfg, entry.asset, sent); } catch (e) {
      if (e instanceof NoAsset) return finish(false, e.message, 404);
      return retry(e.message);
    }
    if (finished) return s.stream.destroy();
    if (!headers) {
      headers = true;
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': entry.size });
    }
    current = s.stream;
    let skip = s.skip;
    s.stream.on('data', (chunk) => {
      if (skip > 0) { const k = Math.min(skip, chunk.length); skip -= k; chunk = chunk.subarray(k); }
      if (!chunk.length || finished) return;
      if (sent + chunk.length > entry.size) chunk = chunk.subarray(0, entry.size - sent);
      sent += chunk.length;
      if (!res.write(chunk)) { s.stream.pause(); res.once('drain', () => s.stream.resume()); }
    });
    s.stream.on('end', () => (sent >= entry.size ? finish(true) : retry('ended at ' + sent)));
    s.stream.on('error', (e) => retry(e.message));
    s.stream.on('aborted', () => retry('aborted at ' + sent));
  };
  const retry = (why) => {
    if (finished) return;
    if (current) { current.removeAllListeners(); current.on("error", () => {}); current.destroy(); current = null; }
    if (sent >= entry.size) return finish(true);           // dropped after the last byte: the piece is whole
    if (sent > lastSent) { tries = 0; lastSent = sent; }   // the attempt got somewhere: TRIES counts drops in a row
    if (++tries > TRIES) return finish(false, why, 502);
    console.log(`[risorse] ${entry.name} da GitHub: ${why}, riprendo da ${sent} (${tries}/${TRIES})`);
    setTimeout(attempt, 1000 * tries);
  };
  attempt();
}

module.exports = { config, remoteEntries, reachable, serveRemote };
