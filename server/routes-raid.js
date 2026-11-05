// Raid routes: the rules of raid-fight.js and raid-rewards.js on the client's protocol (docs/notes/raid.md, «Routes»: every
// listed field is mandatory, or the client answers «200 ERROR»). The factory takes everything from server.js; state lives
// in player.raid only (raidState), so old saves load.
//   240 list, 122 start, 123 clear, 120 reward, 121 member, 241 notice; onStageClear (spawn), events (/stage/event
//   category 2), stageAp (/stage/start of a raid quest), boardIds (Raid Boards handed out, for /user/sphere of server.js).
// The raids listed are those of the player's Shop week (storyWeek, raid-calendar.js).
'use strict';
const fight = require('./raid-fight');
const rewards = require('./raid-rewards');
const calendar = require('./raid-calendar');
const { raidAp0Ids } = require('./make-ev-campaign');

const USER_ID = 1; // the only player: same id as userObject and supportUserId of server.js
const SPAWN_POINTS = 8600, SPAWN_POINTS_BONUS = 6000; // misc 110; bonus time: 2 eggs of 3000 (inferred, plan decision 3)
const BONUS_HOURS = new Set([2, 8, 14, 20]); // PT, one hour each, on the real clock (plan decision 4)
// Bonus-time level step (notices #44500 2018-09-17 .. #55884 2019-08-01: «The raid boss will gain an increased 2 levels upon
// successful defeat!» in Raid Boss Bonus Time, every day of the event; removed by #56463 of 2019-08-12): weeks starting in [FROM, TO)
const BONUS_LEVEL_FROM = '2018-09-17', BONUS_LEVEL_TO = '2019-08-12', BONUS_LEVEL_STEP = 2;
// Level step of the event raids whose notice states another rule (I-229), by census id: `always` every defeat, `bonus` only in
// Raid Boss Bonus Time (+1 otherwise). Stated: 23794 (2016-12-26 daily raid events: «instead of the raid boss increasing its
// level by one, it will increase by five levels»), 37768 (Mysterious Sir: «The Raid Boss's level will increase by 5 each time you
// defeat him!»; its Setzer levels 31, 71 and 96 are all 1 + 5n), 42613 and 43551 (Bonus Time: «Gain an increased 5 levels upon
// successful defeat of the boss!»). Inferred (`inferred`: the notice says only that bosses level faster in Bonus Time, «there
// is the chance that your Raid Boss could skip past level 90»): 38250, 38970, 40165 take the +5 of 42613, the same notice
// pattern; 44005 (2018-09-10, «Raid Bosses will gain more levels with each defeat!») the +2 of 44500, its next week.
const EVENT_LEVEL_STEPS = {
  'WW-E23794-1': { always: 5 }, 'WW-E37768-1': { always: 5 }, 'WW-E42613-1': { bonus: 5 }, 'WW-E43551-1': { bonus: 5 },
  'WW-E38250-1': { bonus: 5, inferred: true }, 'WW-E38970-1': { bonus: 5, inferred: true }, 'WW-E40165-1': { bonus: 5, inferred: true },
  'WW-W-2018-09-10': { bonus: 2, inferred: true },
};
// Daily raid events whose coins come every 5 levels (notices 29805, 31611, 33007: «Get Event Coins every 5 levels!», «Raid boss
// will not yield any Event Coins after level 55»; 33888, 35529: after level 50), by census id -> last level that pays (I-229).
// Read as: a defeat pays its coin tables only at a level that is a multiple of 5, up to that level; the amounts stay ours.
const EVENT_COIN_EVERY = 5;
const EVENT_COIN_LAST = { 'WW-E29805-1': 55, 'WW-E31611-1': 55, 'WW-E33007-1': 55, 'WW-E33888-1': 50, 'WW-E35529-1': 50 };
const AP_RULE_FROM = '2019-07-15', AP_RULE = { bonus: 0, weekend: 5, weekday: 90 };
const RAID_QUEST_FIRST = 980000, RAID_QUEST_LAST = 989999; // stage ids of the raid events (make-raid.js)
const FIRST_LEVEL = 1, MAX_LEVEL = 99; // +1 per defeat, LV 1 to 99 (spec); entry.level is the quest's level, not the boss's
const CATALOG_LEVEL_PREFIX = 'cat:'; // levels of the kept raids' bosses (Raid Catalog): a key space of their own in player.raid.levels
// Version segment of the raid event card URL (/web/raid/img/v<N>/<evStageId>.png): the client caches banner images by URL, so
// bump RAID_IMG_VERSION whenever recon/tools/make_raid_banners.py output changes (as SPECIAL_IMG_VERSION in special.js).
const RAID_IMG_VERSION = 4; // 4: square gold frame on the Raid Catalog banner (user 04-11); 3: the 62 older event raids get their original notice/wiki cards (user approved 04-11); 1: weekly event cards from the archived original banners (render8, 3 Nov); 2: the 5 weeks
// 2018-09-03..10-01 from the official notices (no more plain cards)
const NO_RAID = 5; // raidTimeStatus «No available Raid Boss»: a clear with no fight running (texts read, not run on the bench)

const PT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', weekday: 'short' });
const PT_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
// The occurrence a boss level belongs to: the entry's week; for a daily raid its Pacific day (notice 29805, 2017-07-03: «The raid
// boss's level will reset every day (PT)»)
const occOf = (entry, ms) => (entry.open === 'daily' ? `${entry.start}@${PT_DATE.format(new Date(ms))}` : entry.start);
function ptNow(ms) {
  const parts = Object.fromEntries(PT.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { hour: Number(parts.hour), weekend: parts.weekday === 'Sat' || parts.weekday === 'Sun' };
}
const isBonusTime = (ms) => BONUS_HOURS.has(ptNow(ms).hour);
// Lux of a raid fight in bonus time (original rule: «Lux received from raid bosses doubles!», notices 2016-2018; «0 AP
// cost and double the LUX», 2020). The server doubles what the client reports: no Lux campaign (evCampaign type 10) is
// served, so the client does not double it itself (docs/notes/raid.md «Lux»).
const BONUS_LUX = 2;
const luxFactorAt = (ms) => (isBonusTime(ms) ? BONUS_LUX : 1);

// AP of a raid quest at this moment. From 2019-07-15 the rule 0 / 5 / 90, except the weeks whose census «ap» is «0 / 5»
// (Radiant Reward Raid Events: «Outside of the above times, the raid quest will cost 5 AP», notices 56463, 58020, 70818)
// or «0» (June 2020, «Bonus time will go on 24 hours all day», notice 66114): those follow the census (I-236), like the
// master row's useAp (make-raid.js: the last census value), so the quest top and the charge agree. Earlier the week's own
// «ap»: 3 values bonus / weekend / weekday, «0 / 5» bonus / the rest, «5 / 90» weekend / weekday (no bonus value: those
// weeks read as weekday in bonus time).
const ownApWeek = (a) => (a.length === 2 && a[0] === 0) || (a.length === 1 && a[0] === 0);
function questApAt(entry, ms) {
  const { weekend } = ptNow(ms), bonus = isBonusTime(ms), a = entry.questAp || [];
  if (String(entry.start) >= AP_RULE_FROM && !ownApWeek(a)) return bonus ? AP_RULE.bonus : weekend ? AP_RULE.weekend : AP_RULE.weekday;
  if (a.length >= 3) return bonus ? a[0] : weekend ? a[1] : a[2];
  if (a.length === 2) {
    if (a[0] === 0) return bonus ? 0 : a[1];
    return weekend ? a[0] : a[1];
  }
  return a[0] || 0;
}

// Value of a growth array at a level, linear between the knots and flat outside (how the client reads baseLv).
function atLevel(row, field, lv) {
  const n = row.validGrowth, b = row.baseLv, a = row[field] || [];
  if (lv <= b[0]) return a[0] || 0;
  for (let i = 1; i < n; i++) if (lv <= b[i]) return Math.round(a[i - 1] + (a[i] - a[i - 1]) * (lv - b[i - 1]) / (b[i] - b[i - 1]));
  return a[n - 1] || 0;
}

// /raid/clear body: only parts with a usable HP go on, because clearFight reads a missing HP as 0, which means victory.
const usableCount = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) || (typeof v === 'string' && /^\d+$/.test(v));
const usableParts = (parts) => (Array.isArray(parts) ? parts.filter((p) => p && usableCount(p.hp)) : []);
const damageOf = (parts) => parts.reduce((sum, p) => sum + (usableCount(p.damage) ? Number(p.damage) : 0), 0);

function routesRaid({ player, savePlayer, masterRows, raidIndex, storyWeek, smokeKey = () => null, ap0Force = () => null, realNow, serverTime, serverTimeAt, userPointData, userDetailData, stageResumptionData, inventoryBlocks,
  inventorySnapshot, send, ret, clock, apNow, changeAp, raidUser, supportUsers, guiltLists, battlePoints, onDefeat = () => {}, beginBattle, grantItem, addPresent, medalCount, medalCap,
  stageState, webBase, rng = Math.random, log = console.log }) {
  // Boss levels reset to LV 1 at the start of every month (original rule, notice 17888), and a boss that comes back in a later week starts at LV 1 again (notice 74823): the real-clock month of the server
  // (clock.monthIndex, 1st 00:00 PST = 08:00 UTC, as Spirit Training). A boss alive keeps its level; levelsMonth is the month
  // the stored levels belong to.
  const monthOf = (ms) => clock.monthIndex(ms);
  const state = () => {
    const r = rewards.raidState(player), month = monthOf(realNow());
    if (r.levelsMonth !== month) { r.levels = {}; r.levelOcc = {}; r.levelsMonth = month; savePlayer(); }
    normalizeKept(r);
    return r;
  };
  // kept of older saves: {key, censusId} or an entry key -> the census id; unknown -> cleared (only with an index, so a missing
  // raids.json never loses it)
  function normalizeKept(r) {
    const k = r.kept, all = raidIndex().entries || [];
    if (k === null || k === undefined || !all.length || (typeof k === 'string' && all.some((e) => e.censusId === k))) return;
    const census = (id) => (id && all.some((e) => e.censusId === id) ? id : null);
    const byKey = (key) => (all.find((e) => e.key === key) || {}).censusId || null;
    const id = typeof k === 'string' ? byKey(k) : (k && typeof k === 'object' ? census(k.censusId) || byKey(k.key) : null);
    log(`[raid] Raid Catalog: kept ${JSON.stringify(k)} -> ${id}`);
    r.kept = id;
    savePlayer();
  }
  const entries = () => (raidIndex().entries || []).filter((e) => e.available);
  const entryOfStage = (stageId) => {
    const id = Number(stageId);
    return id >= RAID_QUEST_FIRST && id <= RAID_QUEST_LAST ? entries().find((e) => e.stageId === id) : undefined;
  };
  const enemyRow = (id) => masterRows('raidEnemy').find((r) => r.raidEnemyId === id);
  const rewardRow = (id) => masterRows('raidReward').find((r) => r.raidRewardId === id);
  const alive = (boss, nowMs) => !!boss && nowMs < boss.endsAt;

  // The client dereferences the stage and the boss rows unchecked: a boss whose rows are gone (older master) would crash it.
  function dropOrphan(r) {
    const boss = r.boss;
    if (!boss) return;
    if (masterRows('stage').some((s) => s.stageId === boss.stageId) && boss.parts.every((p) => enemyRow(p.raidEnemyId))) return;
    log(`[raid] boss ${boss.raidId} (${boss.key}) dropped: its stage or raidEnemy rows are not served`);
    r.boss = null;
    savePlayer();
  }

  // Bench smoke only (smokeKey: save/raid_smoke.json of server.js, absent in play): the named available entry's boss
  // appears at the next /user/notice or /raid/list, whatever the week, replacing a stored one of another key.
  let smokeMissing = null; // last unknown key logged, so a typo is logged once
  function forceSmoke(r, nowMs) {
    const key = smokeKey();
    if (!key || r.boss?.key === key || r.boss?.key === key.replace(/\+rare$/, '')) return;
    // a story boss key too, on its first fight stage: story/<boss> the boss itself, story/<boss>+rare its Ω (review I-1: the
    // story rare has no `every` of its own, the chance is per quest, so it is set here)
    const sk = /^(story\/.+?)(\+rare)?$/.exec(key);
    const sb = sk && ((raidIndex().story || {}).bosses || []).find((b) => b.key === sk[1] && b.available && (!sk[2] || b.rare));
    const entry = entries().find((e) => e.key === key) || (sb ? storyEntry(sb, sb.stageId, sk[2] ? 1 : null) : null);
    if (!entry) {
      if (smokeMissing !== key) log(`[raid] smoke: ${key} is not an available entry`);
      smokeMissing = key;
      return;
    }
    smokeMissing = null;
    if (spawn(r, entry, nowMs)) { r.points = 0; savePlayer(); log(`[raid] smoke: boss of ${key} forced`); }
  }

  function list(res) {
    const r = state(), nowMs = realNow();
    forceSmoke(r, nowMs);
    dropOrphan(r);
    const selfRaid = fight.listView(r.boss, nowMs, serverTimeAt);
    const raids = alive(r.boss, nowMs) ? [{ raid: selfRaid.raid, discoverer: raidUser(), isRelief: 0, isEntry: 0 }] : [];
    if (r.boss) { r.boss = fight.afterList(r.boss, nowMs); savePlayer(); }
    send(res, 200, { ret: ret(), selfRaid, raids });
  }

  function start(res, body) {
    const r = state(), nowMs = realNow(), now = serverTime(), boss = r.boss;
    dropOrphan(r);
    const same = !!r.boss && Number(body?.raidId) === boss.raidId;
    // The deck screen left open over the timer: refusing it is «200 ERROR :122», and OK resends it forever (bench 2-11).
    // The fight is played for free and ends as an escape at /raid/clear.
    const late = same && !alive(boss, nowMs);
    const open = same && !late;
    const ap = open ? fight.listView(boss, nowMs, serverTimeAt).raid.useAp : 0;
    if (!(open || late) || apNow() < ap) {
      // Missing fields on purpose: the client stops here with an error, so it cannot play a fight the server does not
      // count. Only a stale screen gets here: the client checks the AP of the list before asking.
      log(`[raid] start refused: raidId ${body?.raidId}, boss ${boss?.raidId}, AP ${apNow()} of ${ap}`);
      return send(res, 200, { ret: ret(), userData: { userPoint: userPointData(now) } });
    }
    if (ap) changeAp(-ap);
    if (late) log(`[raid] start after the timer (boss ${boss.raidId}): free fight, ends as an escape`);
    else fight.startFight(boss, nowMs);
    boss.fighting = late ? 'late' : true; // /raid/clear has no raidId: this is how it knows a fight is running
    beginBattle(body?.userKeybladeId);
    savePlayer();
    send(res, 200, {
      ret: ret(),
      userData: { userPoint: userPointData(now) },
      raid: { ...fight.listView(boss, nowMs, serverTimeAt).raid, useAp: ap },
      players: [],
      startRaidData: { raidId: boss.raidId, supportUserId: Number(body?.supportUserId) || 0, userKeybladeId: Number(body?.userKeybladeId) || 0 },
      vitalsLog: [],
      partsLog: [],
      discovererUserId: USER_ID,
      campaigns: campaignIds(nowMs),
      supportUsers: supportUsers(Number(body?.supportUserId) || 0, now),
    });
  }

  // Reward rows of a boss at its level: the raidEnemy row names them per knot.
  function rewardRowsOf(boss) {
    const body = enemyRow(boss.parts[0].raidEnemyId);
    if (!body) return null;
    let knot = 0;
    for (let i = 1; i < body.validGrowth; i++) if (boss.level >= body.baseLv[i]) knot = i;
    return { victory: rewardRow(body.rewardId?.[knot]), mvp: rewardRow(body.mvpRewardId?.[knot]), all: rewardRow(body.destroyAllRewardId?.[knot]) };
  }

  // level step of a win: +2 in bonus time for the weeks of BONUS_LEVEL_FROM..TO, else +1
  // a story boss has no week (occ null): always +1 (review M-5)
  // an event raid with its own notice rule (EVENT_LEVEL_STEPS, I-229) follows it, also as a kept raid of the Raid Catalog
  const levelStep = (boss, ms, entry) => {
    const ev = entry && EVENT_LEVEL_STEPS[entry.censusId];
    if (ev) return ev.always || (ev.bonus && isBonusTime(ms) ? ev.bonus : 1);
    return boss.occ && String(boss.occ) >= BONUS_LEVEL_FROM && String(boss.occ) < BONUS_LEVEL_TO && isBonusTime(ms) ? BONUS_LEVEL_STEP : 1;
  };
  function bossDefeated(r, boss, allPoints, nowMs = realNow()) {
    const lk = boss.levelKey || boss.key; // a kept raid's boss feeds its own counter (cat:<key>), never the live week's
    const entryOf = (raidIndex().entries || []).find((e) => e.key === boss.key);
    if (boss.month === undefined || boss.month === r.levelsMonth) { r.levels[lk] = Math.min(MAX_LEVEL, boss.level + levelStep(boss, nowMs, entryOf)); (r.levelOcc ||= {})[lk] = boss.occ; } // a boss of an older month does not feed the new one
    r.lastFight = { raidId: boss.raidId, damage: boss.damage || 0 };
    const parts = fight.listView(boss, boss.endsAt - 1, serverTimeAt).raid.parts; // read as alive: a win past the timer counts
    r.boss = null;
    onDefeat(boss); // Daily, Weekly and Beginner «Defeat Raid Boss» missions (server.js missionCount 'raid')
    // level drops of the event's notice (make-raid.js entry.levelDrops, review I-3): every slot of the drop row of this level, to the
    // Present Box (the RAID RESULTS popup shows only the three coin tables)
    for (const d of (entryOf && entryOf.levelDrops) || []) {
      if (d.level !== boss.level) continue;
      const row = rewardRow(d.rewardId);
      if (!row) { log(`[raid] level drop ${d.rewardId} of ${boss.key} not served`); continue; }
      for (let i = 0; i < row.validReward; i++) addPresent({ type: row.type[i], id: row.id[i], num: row.num[i], skillId: 0, skillLv: 1, from: 'levelDrop' });
      log(`[raid] ${boss.key}: level ${boss.level} drop ${row.raidRewardId} to the Present Box`);
    }
    // daily raid events: coins only every 5 levels, none past the notice's last level (EVENT_COIN_LAST, I-229)
    const coinLast = entryOf && EVENT_COIN_LAST[entryOf.censusId];
    if (coinLast && (boss.level % EVENT_COIN_EVERY !== 0 || boss.level > coinLast)) {
      return log(`[raid] ${boss.key}: LV ${boss.level} defeated, no coins (every ${EVENT_COIN_EVERY} levels up to LV ${coinLast})`);
    }
    const rows = rewardRowsOf(boss);
    if (!rows?.victory || !rows.mvp) return log(`[raid] boss ${boss.raidId} defeated, no reward: its raidReward rows are not served`);
    const entry = rewards.pendingEntry({ raid: boss, rows, victory: true, allPoints, rng });
    r.pending.push({ ...entry, parts });
    // A title must reach the popup of /raid/clear (spec, «Title popup»), the rest waits for /raid/reward.
    for (const it of rewards.entryItems(entry, rows)) if (it.type === 7) grantItem(it);
  }

  function clear(res, body) {
    const r = state(), nowMs = realNow(), now = serverTime(), boss = r.boss;
    const titlesBefore = new Set(player.titles || []);
    let raidTimeStatus = NO_RAID, getLux = 0;
    if (boss?.fighting === 'late') {
      boss.fighting = false;
      raidTimeStatus = fight.RAID_TIME_ESCAPED;
      getLux = battlePoints(body?.getPoint, body?.burst, luxFactorAt(nowMs));
      savePlayer();
    } else if (boss?.fighting) {
      boss.fighting = false;
      const parts = usableParts(body?.parts);
      boss.damage = (boss.damage || 0) + damageOf(parts);
      const out = fight.clearFight(boss, parts, nowMs);
      raidTimeStatus = out.raidTimeStatus;
      getLux = battlePoints(body?.getPoint, body?.burst, luxFactorAt(nowMs));
      if (out.victory) bossDefeated(r, boss, out.allPoints, nowMs);
      savePlayer();
    } else log(`[raid] clear with no fight running (boss ${boss?.raidId ?? 'none'}): nothing changes`);
    const inv = inventoryBlocks(now);
    send(res, 200, {
      ret: ret(),
      userData: { userPoint: userPointData(now), userDetail: userDetailData(), stageResumption: stageResumptionData() },
      raidTimeStatus,
      reliefFlag: 0,
      userSkills: inv.userSkills,
      // only the titles of this fight: the client opens one popup per entry (I-220)
      userTitles: inv.userTitles.filter((t) => !titlesBefore.has(t.titleId) && (player.titles || []).includes(t.titleId)),
      userKeyblades: inv.userKeyblades,
      getLux,
    });
  }

  // Runs at every opening of the quest screen: bad entries go first. The entries leave the save before delivery, so a
  // repeat call finds nothing, and an entry that throws is logged and lost rather than locking the player out of Quests
  // and paying its first items again at each opening. Titles were granted at /raid/clear: granting again opens no popup.
  function reward(res) {
    const r = state(), now = serverTime();
    const pending = rewards.sanitizePending(r.pending, rewardRow, log);
    const had = r.pending.length;
    r.pending = [];
    const raidRewards = [];
    for (const e of pending) {
      try {
        raidRewards.push(deliver(e, now));
      } catch (err) {
        log(`[raid] pending ${e.raidId} not delivered: ${err.message}`);
      }
    }
    if (had) savePlayer();
    send(res, 200, { ret: ret(), userData: { userPoint: userPointData(now) }, raidRewards, ...guiltLists() });
  }

  function deliver(e, now) {
    const snap = inventorySnapshot(now);
    const rows = { victory: rewardRow(e.rewardIds.victory), mvp: rewardRow(e.rewardIds.mvp), all: e.partAllId ? rewardRow(e.rewardIds.all) : undefined };
    rewards.deliverEntry(e, rows, { medalCount: medalCount(), cap: medalCap(), grant: grantItem, present: addPresent });
    const inv = inventoryBlocks(now, snap);
    const hasParts = rewards.entryItems(e, rows).some((it) => it.type === 20);
    return { raidId: e.raidId, level: e.level, subdueId: e.subdueId, mvpId: e.mvpId, partAllId: e.partAllId, parts: e.parts || [],
      userMedals: inv.userMedals, userSkills: inv.userSkills, userTitles: [], userMaterials: inv.userMaterials, userAvatarParts: hasParts ? inv.userAvatarParts : [] };
  }

  // The rewards popup calls this after the boss is gone: an empty list crashes, so the player is always there.
  function member(res, body) {
    const r = state(), id = Number(body?.raidId);
    const damage = r.boss && (!id || r.boss.raidId === id) ? r.boss.damage || 0 : r.lastFight && (!id || r.lastFight.raidId === id) ? r.lastFight.damage : 0;
    send(res, 200, { ret: ret(), cooperators: [{ user: raidUser(), damage }], discovererUserId: USER_ID, mvpUserId: USER_ID });
  }

  function notice(res) {
    const r = state(), nowMs = realNow();
    forceSmoke(r, nowMs);
    dropOrphan(r);
    send(res, 200, { ret: ret(), raidNotice: { isSelfRaid: alive(r.boss, nowMs) ? 1 : 0, isOthersRaid: 0 } });
  }

  // catalog: the boss of the kept raid (Raid Catalog), with its own level counter cat:<key> (user 02-11): it starts at LV 1 and
  // neither changes nor reads the level of the live week's boss, even for the very week once played live
  // entry.rare (make-raid.js, Task 10): the rare boss of the same quest replaces the boss with a chance of 1 in rare.every
  // (raidSetting rareUpType 3 / rareUpTypeArg, read as such: inferred); the client fights it through parts[0].rare 2
  function spawn(r, entry, nowMs, { catalog = false } = {}) {
    const rare = entry.rare && entry.rare.enemyId && enemyRow(entry.rare.enemyId) && rng() < 1 / Math.max(1, entry.rare.every || 1) ? entry.rare : null;
    const body = enemyRow(rare ? rare.enemyId : entry.enemyId);
    const partRows = body && [body, ...body.parts.slice(0, body.validParts).map(enemyRow)];
    if (!partRows || partRows.some((x) => !x)) { log(`[raid] ${entry.key}: raidEnemy rows missing, no spawn`); return false; }
    const lk = catalog ? `${CATALOG_LEVEL_PREFIX}${entry.key}` : entry.key;
    const occ = occOf(entry, nowMs);
    const level = (r.levelOcc || {})[lk] === occ ? r.levels[lk] || FIRST_LEVEL : FIRST_LEVEL; // a level belongs to one occurrence (week, or day of a daily raid) of the entry
    const fighter = rare || entry; // the rare boss: its own model, timer and AP
    const model = (raidIndex().models || {})[String(fighter.modelId).padStart(4, '0')] || {}; // keys are folder names, as in make-raid.js
    r.boss = fight.newBoss({ key: entry.key, tier: entry.tier, stageId: entry.stageId, enemy: body, level, upMinutes: fighter.upMinutes, useAp: fighter.useAp, nowMs,
      partRows: partRows.map((x) => ({ raidEnemyId: x.raidEnemyId, weakness: x.weakness, hp: atLevel(x, 'hp', level), attribute: x.attribute, rare: x.rare })),
      hasStartDemo: !!model.start, hasEscapeDemo: !!model.escape });
    r.boss.month = monthOf(nowMs); r.boss.occ = occ;
    if (rare) r.boss.rare = rare.boss;
    if (catalog) r.boss.levelKey = lk;
    log(`[raid] boss ${entry.boss || entry.key} appears, LV ${level}${catalog ? ' (Raid Catalog)' : ''}`);
    return true;
  }

  // Story raid bosses (Task 11): raids.json `story` of make-raid.js. A story quest is a stage row of stageKind 1 (the Q555
  // variants 18300 + union - 1 read as their row, as stageRowOf of server.js) listed in story.quests: quests 1-3 (tutorial),
  // past story.last (826 on, notice 49535) and any Proud (stageKind 4), Special or event quest are not, so they add nothing.
  const storyIndex = () => raidIndex().story || null;
  function storyQuestOf(stageId) {
    const s = storyIndex();
    if (!s || !s.quests) return null;
    const id = Number(stageId), rows = masterRows('stage');
    const row = rows.find((x) => x.stageId === id) || rows.find((x) => x.branchType === 1 && id > x.stageId && id < x.stageId + 5);
    if (!row || row.stageKind !== 1 || !(row.id >= 1 && row.id <= s.last)) return null;
    const q = s.quests[String(row.id)];
    return q ? { n: row.id, ...q } : null;
  }
  const storyBoss = (name) => ((storyIndex() || {}).bosses || []).find((b) => b.boss === name && b.available);
  // the boss entry on the fight stage of the quest's world, its Ω with a chance of 1 in `every` (null: none; 1 with force: the Ω itself)
  const storyEntry = (b, stageId, every) => ({ ...b, stageId, rare: b.rare && every ? { ...b.rare, every } : null });
  // A target raid quest (`fixed`) spawns its boss at the clear whatever the counter; otherwise the counter's rule. A boss alive
  // blocks both; a boss that is not served holds the counter (it spawns at the next quest whose boss is served).
  function storyClear(sq, points) {
    const r = state(), nowMs = realNow();
    if (Number.isFinite(points) && points > 0) r.points += points;
    if (r.boss) return;
    const f = sq.fixed, fb = f && f.stageId && storyBoss(f.boss);
    if (fb && (!f.rare || fb.rare)) {
      if (spawn(r, storyEntry(fb, f.stageId, f.rare ? 1 : null), nowMs)) { log(`[raid] story quest ${sq.n}: target raid ${f.name}`); return; }
    }
    if (r.points < (isBonusTime(nowMs) ? SPAWN_POINTS_BONUS : SPAWN_POINTS)) return;
    const b = sq.stageId && storyBoss(sq.boss);
    if (!b) { log(`[raid] story quest ${sq.n}: ${sq.boss} is not served, the counter (${r.points}) is held`); return; }
    if (spawn(r, storyEntry(b, sq.stageId, sq.every), nowMs)) r.points = 0;
  }

  // From respondStageClear: the raid events' quests and the story quests (storyClear) feed one counter; a stored boss blocks a
  // new one and the counter goes on; the caller saves.
  function onStageClear(stageId, getPoint) {
    const entry = entryOfStage(stageId);
    const points = Number(getPoint?.raidPoint);
    if (!entry) {
      const sq = storyQuestOf(stageId);
      if (sq) storyClear(sq, points);
      return;
    }
    if (!Number.isFinite(points) || points <= 0) return;
    const r = state(), nowMs = realNow();
    r.points += points;
    if (r.boss || r.points < (isBonusTime(nowMs) ? SPAWN_POINTS_BONUS : SPAWN_POINTS)) return;
    // a quest that is not a raid of the week (the kept raid, or one kept until a moment ago): the catalogue counter, so it never
    // reads or moves the level the live week of that entry left (review b597b99)
    // A raid of the week closed by the clock a moment ago (a weekend quest cleared after Sunday 23:59 PT, a showdown boss after
    // midnight) still counts as live (review M-2): `closed` of weekRaids, not only the open list
    const { shopFrom, shopTo } = storyWeek();
    const week = calendar.weekRaids(raidIndex(), { shopFrom, shopTo, nowMs });
    const live = [...week.entries, ...week.closed.filter((e) => e.available)].includes(entry);
    if (spawn(r, entry, nowMs, { catalog: !live })) r.points = 0;
  }

  // The raids of the player's Shop week (raid-calendar.js): storyWeek() is {shopFrom, shopTo} of storyCtx() in server.js, the
  // rotation of the Shop and Special tabs, so the raid follows the story and changes every real Monday inside a tranche.
  // A quest of another week still counts when played (entryOfStage): its screen may have stayed open across the Monday.
  const currentEntries = (realMs = realNow()) => {
    const { shopFrom, shopTo } = storyWeek();
    return calendar.raidsForWeek(raidIndex(), { shopFrom, shopTo, nowMs: realMs });
  };
  // Raid Catalog (Task 9). player.raid.kept = the census id of the kept raid (one at a time, as the Special pin); it is served
  // only while it is a past week of the Story (calendar.rowState 'kept'): its available tiers, beside the current ones.
  const catalogRow = (censusId) => calendar.catalogRows({ entries: (raidIndex().entries || []).filter((e) => e.censusId === censusId) })[0];
  function catalogCtx(realMs = realNow()) {
    const { shopFrom, shopTo } = storyWeek();
    return { shopFrom, shopTo, current: new Set(currentEntries(realMs).map((e) => e.censusId)), kept: state().kept || null };
  }
  function keptEntries(realMs = realNow()) {
    const c = catalogCtx(realMs), row = c.kept && catalogRow(c.kept);
    // a weekend or daily raid kept from the Catalog opens on its real days too (spec Answer 4)
    return row && calendar.rowState(row, c) === 'kept' ? row.entries.filter((e) => e.available && calendar.openNow(e, realMs)) : [];
  }
  // POST /web/raid/keep/<evStageId> and /web/raid/unkeep (catalogue buttons): {code, body {ok, why?}}. Only a past week with an
  // available tier can be kept (else why: now, later, removed); keeping one replaces the previous.
  function keep(evStageId) {
    const id = Number(evStageId), entry = (raidIndex().entries || []).find((e) => e.evStageId === id);
    if (!entry) return { code: 404, body: { ok: false, why: 'unknown raid' } };
    const st = calendar.rowState(catalogRow(entry.censusId), { ...catalogCtx(), kept: null });
    if (st !== 'can') return { code: 409, body: { ok: false, why: st } };
    state().kept = entry.censusId;
    savePlayer();
    log(`[raid] Raid Catalog: ${entry.censusId} kept`);
    return { code: 200, body: { ok: true } };
  }
  function unkeep() {
    state().kept = null;
    savePlayer();
    return { code: 200, body: { ok: true } };
  }
  // Raid Boards (sphere type 5) of the current raids and of the kept one (active), and of every raid of the index (all).
  // Boards belong to the census row: every tier carries the same sphereBoardIds (make-raid.js).
  function boardIds(realMs = realNow()) {
    const ids = (list) => list.flatMap((e) => e.sphereBoardIds || []);
    const active = [...new Set([...ids(currentEntries(realMs)), ...ids(keptEntries(realMs))])].sort((a, b) => a - b);
    return { active, all: [...new Set(ids(raidIndex().entries || []))] };
  }

  // /stage/event category 2, in the order of the Special tab: the Raid Catalog banner (index.catalog of make-raid.js: eventType 0,
  // Details -> /web/raid/catalog, a tap opens its Training Grounds quest), the kept raid (its card with the KEPT tab), then one
  // event per census row of the week with its available tiers (currentEntries).
  function events(realMs = realNow()) {
    const stageOf = (stageId, useAp) => {
      const st = stageState(stageId);
      return { stageId, useAp, score: st.score, playStatus: st.playStatus, clearMissionIds: st.clearMissionIds };
    };
    const event = (eventStageId, stages, { eventType = 2, kept = false } = {}) => ({
      stages,
      eventStageId,
      showIcon: 1,
      bannerUrl: `${webBase}/web/raid/img/v${RAID_IMG_VERSION}/${eventStageId}${kept ? '-kept' : ''}.png`,
      eventType,
      status: 1,
      endTime: serverTimeAt(clock.weekEnd(realMs)),
      newStageId: 0,
      isLock: 0,
      // crown to the right of the banner (user 03-11): every quest of the event with its 3 objectives done, as the Special tab
      complete: stages.length && stages.every((s) => [1, 2, 3].every((m) => (s.clearMissionIds || []).includes(m))) ? 1 : 0,
    });
    const raidEvents = (list, opts) => {
      const byEvent = new Map();
      for (const e of list) byEvent.set(e.evStageId, [...(byEvent.get(e.evStageId) || []), e]);
      return [...byEvent].map(([id, tiers]) => event(id, tiers.map((e) => stageOf(e.stageId, questApAt(e, realMs))), opts));
    };
    const cat = raidIndex().catalog;
    const banner = cat && cat.evStageId && (cat.stageIds || []).length
      ? [event(cat.evStageId, cat.stageIds.map((id, i) => stageOf(id, (cat.useAp || [])[i] || 0)), { eventType: 0 })] : [];
    return [...banner, ...raidEvents(keptEntries(realMs), { kept: true }), ...raidEvents(currentEntries(realMs))];
  }

  // Raid «AP 0» campaign (make-ev-campaign.js, docs/notes/raid.md «AP 0 campaign»): the ids of its evCampaign rows while a raid
  // quest of the week costs 0 AP (bonus hours, questApAt), else none. The client then shows those quests at 0 AP; the charge stays
  // questApAt's. ap0Force (bench file save/raid_ap0.json of server.js) lists them at any hour, the charge unchanged.
  // For `campaigns` of GET /campaign, /stage/start and /raid/start.
  function campaignIds(realMs = realNow()) {
    // review I-2: the campaign rows cover every raid stage, so it goes out only when every listed raid quest costs 0 now (an event
    // quest of 1 or 5 AP beside one of 0 would show 0 and be charged its AP)
    const listed = [...currentEntries(realMs), ...keptEntries(realMs)];
    const on = !!ap0Force() || (isBonusTime(realMs) && listed.length > 0 && listed.every((e) => questApAt(e, realMs) === 0));
    return on ? raidAp0Ids(masterRows('evCampaign')) : [];
  }

  // AP of a raid quest now, or null for any other stage (the master row applies)
  function stageAp(stageId, realMs = realNow()) {
    const entry = entryOfStage(stageId);
    return entry ? questApAt(entry, realMs) : null;
  }

  return { list, start, clear, reward, member, notice, onStageClear, events, stageAp, campaignIds, boardIds, monthOf, keep, unkeep, catalogCtx };
}

// Bench smoke file (save/raid_smoke.json {"key": ...}, written by tmp/raid_p2/smoke_raids.ps1 before every model): only a
// file younger than SMOKE_MAX_AGE_MS counts, so one left by a killed script cannot take over normal play. Read once per
// change of mtime; a stale file is logged once. Returns (wallMs = Date.now()) -> key or null. Wall clock on purpose: the
// file's mtime is real time, whatever the game clock says. `field` names the value read (the AP 0 bench switch,
// save/raid_ap0.json {"force": true}, reads "force").
const SMOKE_MAX_AGE_MS = 2 * 3600 * 1000;
function smokeReader(file, log = console.log, field = 'key') {
  const fs = require('fs');
  let seen = null, key = null, staleLogged = null;
  return (wallMs = Date.now()) => {
    let st;
    try { st = fs.statSync(file); } catch { seen = null; return null; }
    if (seen !== st.mtimeMs) {
      seen = st.mtimeMs;
      // written by Out-File: trim() also drops a leading BOM
      try { key = JSON.parse(fs.readFileSync(file, 'utf8').trim())[field] || null; } catch { key = null; }
    }
    if (!key) return null;
    if (wallMs - st.mtimeMs > SMOKE_MAX_AGE_MS) {
      if (staleLogged !== st.mtimeMs) log(`[raid] smoke: ${file} is older than ${SMOKE_MAX_AGE_MS / 3600000} h, ignored (a script left it behind?)`);
      staleLogged = st.mtimeMs;
      return null;
    }
    return key;
  };
}

module.exports = routesRaid;
module.exports.smokeReader = smokeReader;
module.exports.SMOKE_MAX_AGE_MS = SMOKE_MAX_AGE_MS;
module.exports.isBonusTime = isBonusTime;
module.exports.questApAt = questApAt;
module.exports.RAID_IMG_VERSION = RAID_IMG_VERSION;
module.exports.EVENT_LEVEL_STEPS = EVENT_LEVEL_STEPS;
module.exports.EVENT_COIN_LAST = EVENT_COIN_LAST;
