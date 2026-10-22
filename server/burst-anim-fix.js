// Animazioni originali degli attacchi speciali (burst): motionId/effectId/hitCount/distance/effectDirectionFix.
//
// Il master WW 5.0.1 punta quasi tutti gli speciali a poche animazioni generiche (10095 da 2 colpi, 10365 da
// 1, ...): SN++ Illus. KH III Terra, «Ars Solum EX», mostrava 2 colpi invece di 13 (banco 20-10). Le
// animazioni originali (lwf/burst/motion/abl_N, effect/eff_N, SE audio/5030xxxxx) vengono dal bundle 2016 e
// dal JP 4.3.1 (recon/tools/originals.tsv sezione 36); la scelta per riga e' in
// reference\burst_anim\mapping_final.json (ricerca in reference\burst_anim\RESEARCH.md).
//
// hitCount va con la motion: il danno arriva solo dagli eventi «knockback_N» del LWF e ogni colpo vale
// attacco x potenza / hitCount, quindi hitCount = knockback della motion
// (750/750 righe originali). Cambiandoli insieme il danno totale resta quello di prima; per il danno
// fisso (damageType 2, sp1 = danno per colpo) sp1 si riscala sul numero di colpi nuovo.
//
// Righe (scelte dell'utente 20-10): originali dove ci sono (stesso burstId nei dati thethiny «orig-id»,
// stesso nome con la motion della famiglia dal numero di colpi giusto «name+*», nome simile della stessa
// famiglia «loose-name+*», es. «Ars Solum EX» -> Ars Solum); altrimenti ricostruzione con la motion
// originale di un'altra special con gli stessi colpi «rule-hits»/«hits-fix» o di supporto «rule-support»
// (spiegato nelle Notices). Il numero di colpi dell'animazione e' sempre quello del testo «Deals N hits»
// (reference\burst_anim\finalize.js). Le motion solo nel JP con texture mancanti non si usano: quelle righe
// restano generiche. Dove l'effetto originale non c'e' in nessuna fonte completa resta l'effetto di oggi.
//
// make-game-tables.js la applica prima di scrivere; da sola corregge server/master_data sul posto
// (idempotente; poi revisione +1 e relogin.ps1):
//   node server/burst-anim-fix.js [cartella master] [--texts]
// --texts: per le righe con lo stesso burstId nei dati thethiny riporta anche nome e descrizione originali.
'use strict';
const fs = require('fs');
const path = require('path');

const MAPPING = process.env.KHUX_BURST_ANIM || 'D:\\Progetto_Restauro_KH_UX\\reference\\burst_anim\\mapping_final.json';
const FIELDS = ['motionId', 'effectId', 'hitCount', 'distance', 'effectDirectionFix'];
const COMPLETE = new Set(['ww', 'b16', 'jp']);   // fonti con la cartella completa

// La riga della mappatura e' usabile? (non speciale e con la cartella della motion completa)
const usable = (e) => !!e && !e.keep && e.motionId !== undefined && COMPLETE.has(e.motionFrom);

// danno fisso (fixed-damage.js): sp1 = danno per colpo x10000, displayPower = sp1 x hitCount; si tiene il totale
function rescaleFixed(b, oldHits, newHits) {
  if (b.damageType !== 2 || !oldHits || oldHits === newHits) return;
  const r = (v) => (v > 1 ? Math.round((v * oldHits) / newHits / 10000) * 10000 : v);
  b.sp1 = r(b.sp1);
  b.sp1PerEnforce = (b.sp1PerEnforce || []).map(r);
}

function applyBurstAnim(bursts, mapping, { origBursts = null, texts = false } = {}) {
  const stats = { patched: 0, same: 0, generic: 0, texts: 0 };
  const byId = new Map(bursts.map((b) => [b.burstId, b]));
  for (const [id, e] of Object.entries(mapping)) {
    const b = byId.get(Number(id));
    if (!b) continue;
    if (usable(e)) {
      const want = Object.fromEntries(FIELDS.map((k) => [k, e[k]]));
      if (want.distance == null) want.distance = b.distance;
      if (!COMPLETE.has(e.effectFrom)) want.effectId = b.effectId;
      if (FIELDS.every((k) => b[k] === want[k])) stats.same++;
      else {
        rescaleFixed(b, b.hitCount, want.hitCount);
        Object.assign(b, want);
        stats.patched++;
      }
    } else stats.generic++;
    const o = texts && origBursts && origBursts.get(b.burstId);
    if (o && (b.name !== o.name || b.description !== o.description)) {
      Object.assign(b, { name: o.name, description: o.description });
      stats.texts++;
    }
  }
  return stats;
}

// Cartelle di risorse che le righe usabili richiedono (per test-burst-anim.js e originals.tsv)
function neededFolders(mapping) {
  const pad = (n) => String(n).padStart(5, '0');
  const out = new Set();
  for (const e of Object.values(mapping)) {
    if (!usable(e)) continue;
    out.add(`lwf/burst/motion/abl_${pad(e.motionId)}/`);
    if (COMPLETE.has(e.effectFrom) && e.effectId) out.add(`lwf/burst/effect/eff_${pad(e.effectId - 100000)}/`);
  }
  return out;
}

const readMapping = (file = MAPPING) => JSON.parse(fs.readFileSync(file, 'utf8'));

module.exports = { applyBurstAnim, neededFolders, readMapping, usable };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dir = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(__dirname, 'master_data'));
  const ORIG = process.env.KHUX_ORIG_BURST || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\burst.json';
  const origBursts = new Map(JSON.parse(fs.readFileSync(ORIG, 'utf8')).map((b) => [b.burstId, b]));
  const file = path.join(dir, 'burst.json');
  const bursts = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stats = applyBurstAnim(bursts, readMapping(), { origBursts, texts: argv.includes('--texts') });
  // Supernova: animazione con tanti colpi quanti hitCount (supernova.js, banco 20-10)
  stats.supernova = require('./supernova').assignSnMotions(bursts);
  console.log('burst-anim-fix:', JSON.stringify(stats));
  if (stats.patched || stats.texts || stats.supernova) fs.writeFileSync(file, JSON.stringify(bursts));
}
