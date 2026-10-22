// Correzioni del master verso le regole originali (banco 19-10, salvataggio di prova):
//
// 1. Tier (guiltValue) a 0 sulle 1-5★ che si evolvono in una rarita' maggiore. Lo «Special Attack Bonus» e' un tratto delle 6★
//    (khuxwiki, reference\guilt\khuxwiki_raw.md: «a trait found on 6★ Medals»); Roboloid da' il Tier
// della famiglia anche alle 1-5★. Il client accende Evolve, se la medaglia ha un tier
// e l'evoluta ha rarita' maggiore, solo con la guilt al massimo del tier: con il
//    tier sulle 1-5★ nessuna 1-5★ si poteva evolvere (guilt impossibile sotto le 6★, 5 pallini).
// 2. Potenza degli speciali delle medaglie di Roboloid (burst 3000000 + id): il campo Multi e' il
//    valore a pallini pieni (6★ Lexaeus A: 3.24 = khuxwiki a 5 pallini), mentre la riga lo usava come
//    base e teneva il displayPower del modello (Wakka 7★): Lexaeus A 7★ mostrava x1.95 invece di x11.10.
//    Ora displayPower = basePower = Multi - passi dei pallini (+300, +900, ... come tierPower).
// 3. Passi per pallino: dove la riga burst di thethiny (originale) ha la stessa base, i suoi
//    basePowerPerEnforce/displayPowerPerEnforce (es. 10566: +800 a pallino, x3.24 a 5 pallini).
//
// 4. Il Multi singolo di Roboloid e' il LowMulti quando la medaglia ha Low/High (danno variabile, I-189): prima HighMulti,
//    104 righe facevano il danno del massimo anche senza la condizione.
//
// make-game-tables.js le applica prima di scrivere; da sola corregge server/master_data sul posto (con variable-power.js):
//   node server/medal-power-fix.js [cartella master]
'use strict';
const fs = require('fs');
const path = require('path');

const ROBO_BURST = 3000000;
const step = (i) => 300 * ((i + 1) * (i + 2) / 2);   // potenza in piu' al pallino i+1 (tierPower)

// Solo le righe sotto le 6★ che si evolvono in una rarita' maggiore (quelle che il client bloccherebbe): il
// badge mostra comunque il Tier della forma evoluta; le 5★ senza Evolve (Halloween C) tengono il loro.
function tierFix(medals) {
  const byId = new Map(medals.map((m) => [m.medalId, m]));
  let n = 0;
  for (const m of medals) {
    const evo = m.validEvolve ? byId.get(m.evolveId) : null;
    if ((m.rare || 0) < 6 && m.guiltValue && evo && (evo.rare || 0) > (m.rare || 0)) { m.guiltValue = 0; n++; }
  }
  return n;
}

// Potenza di ogni burst, in ordine di fonte: 1) riga originale di thethiny (stesso burstId); 2) khuxwiki
// della medaglia che la usa (dmgN = senza pallini, dmgNm = pallini pieni; 7★ con la sola dmg7 = pieni) con
// passi uguali come negli originali (es. 10085: +400, 10566: +800); 3) Multi di Roboloid a pallini pieni (LowMulti per
// gli speciali a danno variabile: il massimo HighMulti lo mette variable-power.js in displayMaxPower).
// opts: {origBursts: Map, wikiInfo: Map nome -> campi InfoMedal, multiOf(roboId), medals}
function burstPowerFix(bursts, opts) {
  const { origBursts = new Map(), wikiInfo = new Map(), multiOf = () => undefined, medals = [] } = opts;
  const owner = new Map();
  for (const m of medals) if (m.validBurst && m.burstId && m.type !== 9 && !owner.has(m.burstId)) owner.set(m.burstId, m);
  const num = (v) => { const x = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : null; };
  const linear = (base, top, want) => [0, 1, 2, 3, 4].map((i) => (i < want ? Math.round(base + (top - base) * (i + 1) / want) : 1));
  const set = (b, base, per, display = base, dper = per) =>
    Object.assign(b, { basePower: base, displayPower: display, basePowerPerEnforce: per, displayPowerPerEnforce: [...dper] });
  const stats = { orig: 0, wiki: 0, robo: 0, none: 0 };
  for (const b of bursts) {
    // danno fisso (damageType 2, fixed-damage.js): basePower 0 e danno per colpo in sp1, non un moltiplicatore;
    // letto come tale superava int32 e il server scartava l'intera tabella (banco 20-10)
    if (b.damageType === 2) { stats.fixed = (stats.fixed || 0) + 1; continue; }
    const want = b.maxEnhanceCount || 0;
    const o = origBursts.get(b.burstId);
    if (o && o.basePower > 1) {
      const ext = (arr, p0) => {   // passi originali, estesi con l'ultimo passo se la riga ne ha meno
        const v = (arr || []).filter((x) => x > 1).slice(0, want);
        const stepv = v.length ? (v[v.length - 1] - p0) / v.length : 0;
        while (v.length < want) v.push(Math.round(p0 + stepv * (v.length + 1)));
        return [0, 1, 2, 3, 4].map((i) => (i < want ? v[i] : 1));
      };
      set(b, o.basePower, ext(o.basePowerPerEnforce, o.basePower), o.displayPower, ext(o.displayPowerPerEnforce, o.displayPower));
      stats.orig++;
      continue;
    }
    const m = owner.get(b.burstId);
    const w = m && wikiFor(wikiInfo, m);
    if (w) {
      const n = m.rare;
      let base = num(w['dmg' + n]), top = num(w['dmg' + n + 'm']);
      if (top == null && n >= 7 && base != null) {   // la 7★: solo il valore a pallini pieni
        top = base;
        const b6 = num(w.dmg6), t6 = num(w.dmg6m);
        base = b6 != null && t6 != null ? top - (t6 - b6) : null;
      }
      if (base == null && top != null && want) {   // base ignota: passi di tierPower sotto il valore pieno
        const t = Math.round(top * 10000), p0 = t - step(want - 1);
        set(b, p0, [0, 1, 2, 3, 4].map((i) => (i < want ? p0 + step(i) : 1)));
        stats.wiki++;
        continue;
      }
      if (base != null && (top != null || !want)) {
        const p0 = Math.round(base * 10000);
        set(b, p0, want ? linear(p0, Math.round(top * 10000), want) : [1, 1, 1, 1, 1]);
        stats.wiki++;
        continue;
      }
    }
    if (b.burstId > ROBO_BURST && b.burstId < ROBO_BURST + 1000000) {
      const multi = multiOf(b.burstId - ROBO_BURST);
      if (multi) {
        const top = Math.round(multi * 10000);
        const base = want ? top - step(want - 1) : top;
        set(b, base, [0, 1, 2, 3, 4].map((i) => (i < want ? base + step(i) : 1)));
        stats.robo++;
        continue;
      }
    }
    stats.none++;
  }
  return stats;
}

// InfoMedal della khuxwiki: nome (e titolo della pagina) -> elenco delle schede; una pagina puo' averne
// piu' d'una (Judy Hopps: due 7★ con danni diversi), si sceglie con il numero dell'Album (nanoN)
function readWikiInfo(file) {
  const out = new Map();
  const add = (k, f) => { if (!out.has(k)) out.set(k, []); if (!out.get(k).includes(f)) out.get(k).push(f); };
  for (const [title, text] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) {
    for (const m of String(text).matchAll(/\{\{InfoMedal([\s\S]*?)\n?\}\}/g)) {
      const f = Object.fromEntries([...m[1].matchAll(/\|(\w+)=([^|]*)/g)].map((x) => [x[1], x[2].trim()]));
      if (f.name) add(f.name, f);
      add(title, f);
    }
  }
  return out;
}

function wikiFor(wikiInfo, m) {
  const list = wikiInfo.get(m.name);
  if (!list || !list.length) return null;
  return list.find((f) => Number(f['nano' + m.rare]) === m.sortId) || list[0];
}

module.exports = { tierFix, burstPowerFix, readWikiInfo, wikiFor };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
  const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
  const ROBO_DB = process.env.KHUX_ROBOLOID_DB || 'D:\\Progetto_Restauro_KH_UX\\external\\roboloid\\medal_db.json';
  const ORIG = process.env.KHUX_ORIG_BURST || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny_2026-10-13\\KHUx-Server\\data\\burst.json';
  const robo = new Map(JSON.parse(fs.readFileSync(ROBO_DB, 'utf8')).map((d) => [d.ID, d]));
  const origBursts = new Map(JSON.parse(fs.readFileSync(ORIG, 'utf8')).map((b) => [b.burstId, b]));
  const medals = read('medal'), bursts = read('burst');
  const tiers = tierFix(medals);
  const wikiInfo = readWikiInfo(process.env.KHUX_WIKI_ALL || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json');
  const p = burstPowerFix(bursts, { origBursts, wikiInfo, medals, multiOf: (id) => robo.get(id)?.Multi || robo.get(id)?.LowMulti });
  // speciali a danno variabile subito dopo, come in make-game-tables.js (variable-power.js, I-189): burstPowerFix rimette
  // basePower = displayPower, che per i tipi 3/4 e' il divario tra massimo e minimo
  const vp = require('./variable-power');
  const vst = vp.variablePower(bursts, { origBursts, robo, medals });
  fs.writeFileSync(path.join(dir, 'medal.json'), JSON.stringify(medals));
  fs.writeFileSync(path.join(dir, 'burst.json'), JSON.stringify(bursts));
  console.log(`${dir}: tier tolto a ${tiers} medaglie sotto le 6★; potenza delle burst: ${p.orig} da thethiny, ${p.wiki} dalla khuxwiki, ${p.robo} da Roboloid, ${p.none} invariate; speciali variabili: ${vp.summary(vst)}`);
}
