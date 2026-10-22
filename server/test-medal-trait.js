// Prova del modulo dei trait dalla fusione (I-084 parte A, server/medal-trait.js):  node server/test-medal-trait.js
'use strict';
const mt = require('./medal-trait');
const { FUSION_TRAIT_IDS } = require('./make-trait-groups');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// gainsTrait: base con slot e materiale dello stesso gruppo (anche rarita' diversa: stesso gruppo per nome)
const base = { medalId: 300100, shuffleskillSlot: 3, shuffleSkillGroupId: 300100 };
const copy7 = { medalId: 300101, shuffleskillSlot: 5, shuffleSkillGroupId: 300100 };
const other = { medalId: 300200, shuffleskillSlot: 3, shuffleSkillGroupId: 300200 };
check(mt.gainsTrait(base, [base]), 'copia identica');
check(mt.gainsTrait(base, [other, copy7]), 'rarita\' diversa della stessa medaglia');
check(!mt.gainsTrait({ ...base, shuffleskillSlot: 0 }, [base]), 'base senza slot');
check(!mt.gainsTrait({ ...base, shuffleSkillGroupId: 0 }, [{ ...base, shuffleSkillGroupId: 0 }]), 'gruppo 0');
check(!mt.gainsTrait(base, [other]), 'medaglia diversa');
check(!mt.gainsTrait(base, []), 'nessun materiale');

// rollTrait uniforme sugli 11
let seed = 12345;
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const counts = new Map();
for (let i = 0; i < 11000; i++) { const id = mt.rollTrait(rng); counts.set(id, (counts.get(id) || 0) + 1); }
check([...counts.keys()].every((id) => FUSION_TRAIT_IDS.includes(id)), `id fuori lista: ${[...counts.keys()]}`);
check(FUSION_TRAIT_IDS.every((id) => (counts.get(id) || 0) >= 800 && (counts.get(id) || 0) <= 1200), `distribuzione ${JSON.stringify([...counts])}`);

// addTrait: in fondo con slot liberi, pending con slot pieni; lo Special Trait (type 2) non occupa slot
const T = (u, s, type = 0) => ({ userShuffleSkillId: u, shuffleSkillId: s, type, getDatetime: 1 });
const isSpecial = (id) => id >= 1001;
const two = [T(1, 10), T(2, 13)];
const nw = T(9, 8, 1);
let r = mt.addTrait(two, 3, isSpecial, nw);
check(same(r.list, [...two, nw]) && r.pending === null, `2/3 slot: ${JSON.stringify(r)}`);
const three = [T(1, 10), T(2, 13), T(3, 11)];
r = mt.addTrait(three, 3, isSpecial, nw);
check(same(r.list, three) && same(r.pending, nw), `3/3 slot: ${JSON.stringify(r)}`);
const withSpecial = [T(1, 10), T(5, 1006, 2), T(2, 13)];
r = mt.addTrait(withSpecial, 3, isSpecial, nw);
check(same(r.list, [...withSpecial, nw]) && r.pending === null, `Special Trait fuori dal conto: ${JSON.stringify(r)}`);
r = mt.addTrait([], 0, isSpecial, nw);
check(r.list.length === 0 && same(r.pending, nw), 'slot 0: pending');

// resolvePending: Replace prende la posizione, Skip lascia invariato
check(same(mt.resolvePending(three, nw, 2), [T(1, 10), nw, T(3, 11)]), 'Replace sulla seconda riga');
check(same(mt.resolvePending(three, nw, nw.userShuffleSkillId), three), 'Skip');
check(same(mt.resolvePending(three, nw, 77), three), 'id sconosciuto: invariata');

// resumption
check(same(mt.resumption([]), { userShuffleSkills: [], resumptionStatus: 0 }), 'coda vuota');
const p = { ...nw, userMedalId: 500 }, q = { ...T(10, 9, 1), userMedalId: 501 };
check(same(mt.resumption([p, q]), { userShuffleSkills: [p, q], resumptionStatus: 1 }), 'coda con due pending: tutta, il primo in testa');
check(same(mt.resumption(undefined), { userShuffleSkills: [], resumptionStatus: 0 }), 'coda assente');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: medal-trait');
