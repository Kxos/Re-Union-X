// Spirit Blind Box (pet draws, /gacha/petdraw): which deals the Shop lists and which part a draw gives (03-11, user: restore
// all Spirit parts). Data: server/pet_draws.json (the original deals, pools from their notices). Pure functions; the routes
// are in server.js (respondGachaList / respondPetDraw), the Shop rules (story window, Keep) in gacha.js.
// - a deal is listed when its dates overlap the Shop week of the Story (like the medal banners) or when it is the kept one
//   (Banner Catalog «Keep in the Shop», past deals only, player.gacha.pinnedPet);
// - every draw gives a part of the pool the player does not own (all notices); none left = the deal is sold out;
// - extend «unobtainable» (B0810, not original): once its pool is owned, every part with no other source here.
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'pet_draws.json');
// Starter series 001 (pink Kitstar), always owned (pet.js STARTER_PARTS)
const STARTER = [303001, 304001, 306001, 308001, 309001];

// pet_draws.json + master petParts rows -> deals with poolIds (master ids, notice order); names without a row are listed
// in `missing` (reconstructed parts awaiting approval)
function loadDraws(petRows, data = JSON.parse(fs.readFileSync(FILE, 'utf8'))) {
  const byName = new Map(petRows.map((r) => [r.name, r.petPartsId]));
  const seen = new Set();
  return (data.banners || []).map((b) => {
    if (seen.has(b.drawPetTypeId)) throw new Error(`pet_draws.json: drawPetTypeId ${b.drawPetTypeId} twice`);
    seen.add(b.drawPetTypeId);
    if (!(b.price > 0) || !b.start || !b.end || b.end < b.start) throw new Error(`pet_draws.json: ${b.rowId}: price / dates`);
    const poolIds = [], missing = [];
    for (const n of b.pool || []) { const id = byName.get(n); if (id) poolIds.push(id); else missing.push(n); }
    return { ...b, poolIds, missing };
  });
}

// first Story quest of the tranche whose period contains the deal's start (catalog.story rows [qFrom, qTo, day])
function unlockQuest(story, start) {
  const days = [...new Set((story || []).map((r) => r[2]))].sort();
  const day = days.filter((d) => d <= start).pop() || days[0];
  const row = (story || []).find((r) => r[2] === day);
  return row ? row[0] : 1;
}

// past deal of the Story that can be kept in the Shop: ended before the Shop period started and unlocked
const keepable = (b, { periodStart, storyQuest }) => !!periodStart && b.end < periodStart && (b.unlockQuest || 1) <= storyQuest;

// deals of the Shop week: dates overlapping [shopFrom, shopTo] (story unlocked), then the kept one (if still keepable)
function listed(banners, { shopFrom, shopTo, storyQuest, periodStart, keptRowId }) {
  const out = banners.filter((b) => (b.unlockQuest || 1) <= storyQuest && b.start <= shopTo && b.end >= shopFrom);
  const kept = keptRowId && banners.find((b) => b.rowId === keptRowId);
  if (kept && keepable(kept, { periodStart, storyQuest }) && !out.includes(kept)) out.unshift(kept);
  return out;
}

// part ids with another source in the master: missions (rewardType 33), boards (sphereMasu rewardSelect 33), quest
// objectives and clear rewards (stage), drop tables (reward), raid rewards, login bonus, starter, and every Blind Box pool
function elsewhereIds(rows, banners = []) {
  const out = new Set(STARTER);
  const pairs = [['mission', 'rewardType', 'itemId'], ['sphereMasu', 'rewardSelect', 'rewardId'], ['stage', 'submissionRewardType', 'submissionItemId'],
    ['stage', 'clearGetItemType', 'clearGetItemId'], ['reward', 'type', 'id'], ['raidReward', 'type', 'id'], ['loginBonus', 'rewardType', 'rewardId']];
  for (const [t, tk, ik] of pairs) {
    for (const r of rows(t) || []) {
      const types = [].concat(r[tk]), ids = [].concat(r[ik]);
      types.forEach((ty, i) => { if (ty === 33 && ids[i]) out.add(ids[i]); });
    }
  }
  for (const b of banners) for (const id of b.poolIds) out.add(id);
  return out;
}

// parts a draw can give now: the pool minus owned; with extend «unobtainable» and the pool owned, the parts without
// another source (elsewhere) not owned, in id order
function candidates(b, owned, petRows, elsewhere) {
  const left = b.poolIds.filter((id) => !owned.has(id));
  if (left.length || b.extend !== 'unobtainable') return { ids: left, extended: false };
  return { ids: petRows.map((r) => r.petPartsId).filter((id) => !elsewhere.has(id) && !owned.has(id)), extended: true };
}

// one part (uniform over the candidates) or null when the deal is sold out
function drawPart(b, owned, petRows, elsewhere, rng = Math.random) {
  const { ids, extended } = candidates(b, owned, petRows, elsewhere);
  if (!ids.length) return null;
  return { petPartsId: ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))], extended, left: ids.length - 1 };
}

// master drawPetType row (client 4.3.1, parser FUN_00f15760: every field mandatory, integers >= 0; the Shop plate reads
// it without a check, so every listed deal needs one). drawType 11 = the pet draw marker; payType 1 = Jewels (free+paid)
const DRAW_TYPE_PET = 11;
const PET_SORT_FIRST = 2; // after the Banner Catalog plate (sortId 1), before the medal banners (10, 20, ...)
const imgUrl = (id) => `/web/gacha/petimg/${id}.png`;
const detailUrl = (id) => `/web/gacha/petdetail/${id}`;
function drawPetTypeRow(b, sortId = PET_SORT_FIRST) {
  return {
    drawPetTypeId: b.drawPetTypeId, drawType: DRAW_TYPE_PET, sortId, payType: 1, price: b.price, lotName: '', lotCount: 1,
    tableId: 0, vipcoinNumber: 0, limitedvipcoinNumber: 0, lastoneValidAdd: 0, lastoneAddType: 0, lastoneAddId: 0,
    lastoneAddSkillType: 0, lastoneAddSkillId: 0, lastoneAddSkillLv: 0, lastoneAddNum: 0, bannerUrl: imgUrl(b.drawPetTypeId),
    mypageBanner: 0, detailUrl: detailUrl(b.drawPetTypeId), displayTimeLeft: 0, startDate: `${b.start} 00:00:00`,
    endDate: `${b.end} 23:59:59`, isDeleted: 0,
  };
}

// petGachaList element (parser FUN_007959a8: every key mandatory): totalCount / restCount = the «N/M left» counter
// (restCount 0 greys the button and the client sends nothing)
function plate(b, webBase, sortId, owned, petRows, elsewhere) {
  const ext = b.extend === 'unobtainable' ? petRows.map((r) => r.petPartsId).filter((id) => !elsewhere.has(id) && !b.poolIds.includes(id)) : [];
  const all = [...b.poolIds, ...ext];
  return { drawPetTypeId: b.drawPetTypeId, drawType: DRAW_TYPE_PET, sortId, payType: 1, price: b.price, lotName: '', lotCount: 1,
    bannerUrl: `${webBase}${imgUrl(b.drawPetTypeId)}`, mypageBanner: 0, totalCount: all.length, restCount: all.filter((id) => !owned.has(id)).length };
}

// POST /gacha/petdraw response (apply at 0x7c8854): pet.userPetParts (drawn parts), effectNumbers (>= one per part; [0]
// picks the animation: 1 rare, other non-zero normal, 0 = crash), petGachaBonus (all keys mandatory; addType 1 = no bonus
// popup), userData.userPoint / userDetail (full objects, from server.js)
function drawResponse(part, partsType, getDatetime, userData) {
  return {
    pet: { userPetParts: [{ petPartsId: part, partsType, getDatetime }] },
    effectNumbers: [2],
    petGachaBonus: { addType: 1, number: 0, userMedals: [], userSkills: [], userMaterials: [], userTitles: [], userKeyblades: [],
      userAvatarParts: [], userDecks: [], userKeybladeSubslots: [], pet: { userPetParts: [] } },
    userData,
  };
}

// writes server/tables/drawPetType.json (copied into the master by make-game-tables.js): node server/pet-draw.js
if (require.main === module) {
  const { petPartsRows } = require('./make-pet-parts');
  const rows = loadDraws(petPartsRows()).map((b, i) => drawPetTypeRow(b, PET_SORT_FIRST + i));
  fs.writeFileSync(path.join(__dirname, 'tables', 'drawPetType.json'), JSON.stringify(rows, null, 1));
  console.log(`drawPetType: ${rows.length} rows (raise the master revision)`);
}

module.exports = { FILE, STARTER, DRAW_TYPE_PET, imgUrlOf: imgUrl, PET_SORT_FIRST, loadDraws, unlockQuest, keepable, listed, elsewhereIds, candidates, drawPart,
  drawPetTypeRow, plate, drawResponse };
