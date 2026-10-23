// Max-power bench save (make-maxpower-save.js) seen through the server's own code path:
//   node server/test-maxpower-save.js            -> builds it on a new player (temporary save) and checks it
//   node server/test-maxpower-save.js <save>     -> checks an existing save (a temporary copy), e.g. server/save/maxpower.json
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SRC = process.argv[2];
const SAVE = path.join(os.tmpdir(), `khux-test-maxpower-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
if (SRC) fs.copyFileSync(SRC, SAVE);
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_GUILT_BURST_LV;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const mp = require('./make-maxpower-save');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
const p = t.player;

if (!SRC) {
  call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
  // two more keyblades, one low (Three Wishes +15, the one in a deck that stopped make-test-save.js) with a deck
  p.keyblades = [{ userKeybladeId: 2, keybladeId: 2000, getDatetime: 0, burst: 0 }, { userKeybladeId: 5, keybladeId: 4150, getDatetime: 0, burst: 0 }];
  p.keybladeDecks = { 5: [1, 2, 0] };
  p.lux = 139527581; // Lux level 300: deck cost 440, as the story saves
  const out = quiet(() => mp.build(p, mp.loadTables(path.join(__dirname, 'master_data'))));
  check(out.picked.length > 300, `medals picked: ${out.picked.length}`);
  check(out.tierCount[10] > 0 && out.tierCount[9] > 0 && out.tierCount[8] > 0, `tiers: ${JSON.stringify(out.tierCount)}`);
}

const rows = new Map(t.masterRows('medal').map((r) => [r.medalId, r]));
const kbRows = new Map(t.masterRows('keyblade').map((r) => [r.keybladeId, r]));
const special = new Set(t.masterRows('shuffleskill').filter((r) => r.type === 2).map((r) => r.shuffleSkillId));
const now = t.serverTime();
const elements = new Map(quiet(() => t.userMedalList()).map((m) => [m.userMedalId, t.userMedalElement(m, now)]));
const skills = new Map(quiet(() => t.userSkillsData()).map((s) => [s.userSkillId, s]));
const maxed = [...elements.values()].filter((e) => p.medalTraits?.[e.userMedalId]?.some((x) => x.shuffleSkillId === mp.SPECIAL_TRAIT));
check(maxed.length > 300, `medals with the max set: ${maxed.length}`);
const tiers = {};
for (const e of maxed) {
  const row = rows.get(e.medalId);
  tiers[row.guiltValue] = (tiers[row.guiltValue] || 0) + 1;
  const tag = `${e.userMedalId} ${row.name}`;
  check([8, 9, 10].includes(row.guiltValue), `${tag}: tier ${row.guiltValue}`);
  check(e.level === row.maxLv, `${tag}: level ${e.level}`);
  check(e.burstUpperNumber > 0 && e.burstUpperNumber <= 5, `${tag}: dots ${e.burstUpperNumber}`);
  check(e.guiltFactor === { 8: 23000, 9: 28000, 10: 32000 }[row.guiltValue], `${tag}: guilt ${e.guiltFactor}`);
  check(e.attackUpperNumber === row.addMaxAttack && e.upperCost === -(row.cost - row.minCost), `${tag}: Chip/Cid`);
  check(e.userShuffleSkills.length <= 6 && e.userShuffleSkills.filter((x) => !special.has(x.shuffleSkillId)).length <= row.shuffleskillSlot,
    `${tag}: traits ${e.userShuffleSkills.length}/${row.shuffleskillSlot}`);
  check(e.userSkills.length === 1 && skills.get(e.userSkills[0])?.skillId === mp.SKILL_ID && skills.get(e.userSkills[0]).level === 20, `${tag}: skill`);
  check(e.lock === 1, `${tag}: lock`);
}
// no NOVA LEVEL UP popup for the pre-registered medals
const gb = t.guiltBurst();
const lists = quiet(() => gb.lists());
check(!lists.guiltBurstFirstUserMedalIds.length && !lists.guiltBurstMaxUserMedalIds.length, `guilt burst popups: ${lists.guiltBurstFirstUserMedalIds.length}/${lists.guiltBurstMaxUserMedalIds.length}`);
// keyblades at their last level, decks full, valid and within cost
const detail = quiet(() => t.userDetailData());
const owned = new Set(elements.keys());
const userKbs = quiet(() => t.userKeybladesData());
for (const k of userKbs) {
  const row = kbRows.get(k.keybladeId);
  check(row && !row.evolveId, `keyblade ${k.userKeybladeId}: ${row?.name} not at the maximum`);
  check(k.burst === row.maxBurstGauge * 10000, `keyblade ${k.userKeybladeId}: gauge ${k.burst}`);
  check(k.deckMedals.length === 5 && k.deckMedals.every((id) => owned.has(id) && rows.get(elements.get(id).medalId).type === 1)
    && new Set(k.deckMedals).size === 5, `deck ${k.userKeybladeId}: ${k.deckMedals}`);
  const cost = k.deckMedals.reduce((s, id) => s + rows.get(elements.get(id).medalId).cost + elements.get(id).upperCost, 0);
  check(cost <= detail.maxDeckCost, `deck ${k.userKeybladeId}: cost ${cost} > ${detail.maxDeckCost}`);
}
const subs = quiet(() => t.userKeybladesData()) && t.kbEvo().userKeybladeSubslotsData();
for (const s of subs) {
  const full = s.subslots.filter((x) => x.userMedalId).length;
  check(full === s.subslots.length && full > 0, `subslots ${s.keybladeSubslotId}: ${full}/${s.subslots.length}`);
  const deck = userKbs.find((k) => k.userKeybladeId === s.keybladeSubslotId).deckMedals;
  check(!s.subslots.some((x) => deck.includes(x.userMedalId)), `subslots ${s.keybladeSubslotId}: a deck medal`);
}
const fav = userKbs.find((k) => k.isFavorite);
check(fav && p.currentUserKeybladeId === fav.userKeybladeId, 'favorite = current keyblade');
const user = call(t.respondUser);
check(user.userData.userPoint.attack > 0, 'userPoint');

try { fs.unlinkSync(SAVE); } catch { /* removed */ }
if (errors.length) { console.log(`test-maxpower-save: ${errors.length} errors\n- ` + errors.slice(0, 30).join('\n- ')); process.exit(1); }
console.log(`test-maxpower-save: OK (${maxed.length} medals, tier ${JSON.stringify(tiers)}, ${userKbs.length} keyblades, favorite ${kbRows.get(fav.keybladeId).name} `
  + `STR ${fav.totalAttack}, NOVA level ${gb.level()}, max deck cost ${detail.maxDeckCost})`);
