// Animazioni originali degli speciali (burst-anim-fix.js): node server/test-burst-anim.js
'use strict';
const fs = require('fs'); const path = require('path');
const fix = require('./burst-anim-fix');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const mapping = fix.readMapping();
const ORIG = process.env.KHUX_ORIG_BURST || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\burst.json';
const origBursts = new Map(JSON.parse(fs.readFileSync(ORIG, 'utf8')).map((b) => [b.burstId, b]));
const bursts = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'burst.json'), 'utf8'));
fix.applyBurstAnim(bursts, mapping, { origBursts, texts: true });
const again = fix.applyBurstAnim(bursts, mapping, { origBursts, texts: true });
check(again.patched === 0 && again.texts === 0, `seconda esecuzione: ${JSON.stringify(again)}`);
// colpi dell'animazione = «Deals N hits» del testo, su ogni speciale di medaglia
const used = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'medal.json'), 'utf8')).map((m) => m.burstId));
const textHits = (d) => { const h = /Deals (\d+)\b[^.]*?\bhits?\b/i.exec(d || ''); return h ? +h[1] : null; };
const bad = bursts.filter((b) => used.has(b.burstId) && textHits(b.description) != null && textHits(b.description) !== b.hitCount);
check(bad.length === 0, `colpi diversi dal testo: ${bad.slice(0, 5).map((b) => `${b.burstId} ${b.name} ${b.hitCount}`).join('; ')} (${bad.length})`);
const ars = bursts.find((b) => b.burstId === 3002013);
check(ars && ars.motionId === 10416 && ars.hitCount === 13, `Ars Solum EX: ${ars && [ars.motionId, ars.hitCount]}`);
// Supernova: colpi dell'animazione = hitCount (0 colpi = nessun danno, banco 20-10)
const sn = require('./supernova');
sn.assignSnMotions(bursts);
check(sn.assignSnMotions(bursts) === 0, 'Supernova: seconda assegnazione diversa');
const snBad = bursts.filter((b) => b.burstId >= 4000000 && b.burstId < 5000000 && sn.SN_KNOCKBACK[b.motionId] !== b.hitCount);
check(snBad.length === 0, `Supernova con colpi diversi: ${snBad.slice(0, 5).map((b) => `${b.burstId} m${b.motionId} h${b.hitCount}`).join('; ')} (${snBad.length})`);
// ogni cartella usata e' servita (WW) o importata (originals.tsv)
const tsv = fs.readFileSync(path.join(__dirname, '..', 'recon', 'tools', 'originals.tsv'), 'utf8').split(/\r?\n/).map((l) => l.split('\t')[0]);
const NAMES = process.env.KHUX_NAMES || 'D:\\Progetto_Restauro_KH_UX\\resource_data\\names_v4.tsv';
const served = new Set(fs.readFileSync(NAMES, 'utf8').split('\n').map((l) => (/^(lwf\/burst\/(motion|effect)\/[a-z]+_\d+\/)/.exec(l) || [])[1]).filter(Boolean));
const missing = [...fix.neededFolders(mapping)].filter((f) => !served.has(f) && !tsv.includes(f));
check(missing.length === 0, `cartelle non servite: ${missing.slice(0, 5).join(', ')} (${missing.length})`);
if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: burst anim');
