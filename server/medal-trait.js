// Trait dalla fusione (I-084 parte A, docs/superpowers/specs/2026-10-19-trait-design.md): regole pure, senza
// stato del giocatore (le usa server.js nella fusione, azione 55, e nella scelta, azione 57).
// - Ogni fusione con almeno una copia della stessa medaglia (stesso shuffleSkillGroupId, make-trait-groups.js) da'
//   UN trait, se la base ha slot (notice 27491, JP 37748); piu' copie insieme danno comunque un trait solo.
// - Il trait si estrae con la stessa probabilita' fra gli 11 originali (decisione dell'utente 19-10; le
//   percentuali originali non sono mai state pubblicate). Doppioni ammessi, come nell'originale.
// - Slot pieni: il trait resta in sospeso finche' il giocatore sceglie quale sostituire (prende la sua posizione)
//   o lo scarta (Skip). Lo Special Trait del pet (shuffleskill type 2) ha uno slot a parte.
// - medalResumption: con trait in sospeso {[tutta la coda], 1}, altrimenti {[], 0}; con status 1 la
//   lista non deve mai essere vuota (il client legge [0] senza controllo). Tutta la coda: lo Spirit Training cerca il
// pending di ogni medaglia allenata per userMedalId, e la risposta della scelta (azione 57) riscrive
//   la sessione prima della medaglia successiva.
'use strict';

const { FUSION_TRAIT_IDS } = require('./make-trait-groups');

function gainsTrait(baseRow, compRows) {
  const g = baseRow?.shuffleSkillGroupId || 0;
  return (baseRow?.shuffleskillSlot || 0) > 0 && g !== 0 && (compRows || []).some((r) => r && r.shuffleSkillGroupId === g);
}

const rollTrait = (rng = Math.random) => FUSION_TRAIT_IDS[Math.min(FUSION_TRAIT_IDS.length - 1, Math.floor(rng() * FUSION_TRAIT_IDS.length))];

function addTrait(list, slots, isSpecial, trait) {
  const cur = list || [];
  const normal = cur.filter((t) => !isSpecial(t.shuffleSkillId)).length;
  return normal < (slots || 0) ? { list: [...cur, trait], pending: null } : { list: cur, pending: trait };
}

function resolvePending(list, pending, removeId) {
  const cur = list || [];
  if (!pending || removeId === pending.userShuffleSkillId) return cur;
  const at = cur.findIndex((t) => t.userShuffleSkillId === removeId);
  if (at < 0) return cur;
  return cur.map((t, i) => (i === at ? pending : t));
}

const resumption = (queue) => ((queue || []).length
  ? { userShuffleSkills: [...queue], resumptionStatus: 1 }
  : { userShuffleSkills: [], resumptionStatus: 0 });

module.exports = { gainsTrait, rollTrait, addTrait, resolvePending, resumption, FUSION_TRAIT_IDS };
