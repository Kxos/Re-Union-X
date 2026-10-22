// Blue Fairy [SA Bonus LV 1-8] ed Evolve 6★ -> 7★ (khuxwiki «Blue Fairy», segnalazione dell'utente
// 15-10): «Five of the same Blue Fairy Medals are needed to evolve a Medal from 6★ to 7★», dello
// stesso tier (SA Bonus LV) della medaglia; Set 26 EN (maggio 2018), dalle draw dei ticket PvP.
// Roboloid 1495-1502 (album 1447-1454): «A Medal necessary to evolve a 6★ Medal with a special
// attack bonus LV of n.». Medaglie di supporto come Magic Broom e Dual Meow Wow (supernova.js); il
// client legge validEvolveNeed (quante) ed evolveNeedId[5] (quali). Grafica gia' nel pacchetto
// delle medaglie (fetch_medal_images.py --all: Medal_L/S_301495-301502).
const BLUE_FAIRY = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, 301495 + i]));
const BLUE_FAIRY_ALBUM = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, 1447 + i]));

// righe delle otto Blue Fairy, copiate dalla riga di Magic Broom (supporto, impilabile)
function blueFairyRows(medalRows, broomId) {
  const broom = medalRows.find((r) => r.medalId === broomId);
  if (!broom) return [];
  const have = new Set(medalRows.map((r) => r.medalId));
  return Object.entries(BLUE_FAIRY).filter(([, id]) => !have.has(id)).map(([lv, id]) => ({
    ...broom, medalId: id, imageId: id, thumbId: id, cutinId: id, artId: id, displayId: id,
    sortId: BLUE_FAIRY_ALBUM[lv], listSortId: BLUE_FAIRY_ALBUM[lv],
    name: `Blue Fairy [SA Bonus LV ${lv}]`,
    flavor: "The fairy who brings Pinocchio to life\nand makes Jiminy Cricket his conscience.",
    advantage: `A Medal necessary to evolve a 6★ Medal\nwith a special attack bonus LV of ${lv}.`,
    rare: 6, darklight: 1,
  }));
}

// Evolve 6★ -> 7★ senza medaglie richieste (solo munny): 5 Blue Fairy del tier della medaglia
// (guiltValue 1-8). Le regole gia' con medaglie richieste (Cid, Supernova) restano. Sul posto;
// torna quante righe cambiano.
function applyBlueFairyEvolve(medalRows) {
  const byId = new Map(medalRows.map((r) => [r.medalId, r]));
  let applied = 0;
  for (const r of medalRows) {
    const to = r.validEvolve && byId.get(r.evolveId);
    const fairy = BLUE_FAIRY[r.guiltValue];
    if (r.rare !== 6 || !to || to.rare !== 7 || r.validEvolveNeed || !fairy || !byId.has(fairy)) continue;
    Object.assign(r, { validEvolveNeed: 5, evolveNeedId: [fairy, fairy, fairy, fairy, fairy] });
    applied++;
  }
  return applied;
}

module.exports = { BLUE_FAIRY, blueFairyRows, applyBlueFairyEvolve };
