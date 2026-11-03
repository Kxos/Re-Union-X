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
const AP_RULE_FROM = '2019-07-15', AP_RULE = { bonus: 0, weekend: 5, weekday: 90 };
const RAID_QUEST_FIRST = 980000, RAID_QUEST_LAST = 989999; // stage ids of the raid events (make-raid.js)
const FIRST_LEVEL = 1, MAX_LEVEL = 99; // +1 per defeat, LV 1 to 99 (spec); entry.level is the quest's level, not the boss's
// Version segment of the raid event card URL (/web/raid/img/v<N>/<evStageId>.png): the client caches banner images by URL, so
// bump RAID_IMG_VERSION whenever recon/tools/make_raid_banners.py output changes (as SPECIAL_IMG_VERSION in special.js).
const RAID_IMG_VERSION = 1; // 1: weekly event cards from the archived original banners (render8, 3 Nov)
const NO_RAID = 5; // raidTimeStatus «No available Raid Boss»: a clear with no fight running (texts read, not run on the bench)

const PT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', weekday: 'short' });
function ptNow(ms) {
  const parts = Object.fromEntries(PT.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { hour: Number(parts.hour), weekend: parts.weekday === 'Sat' || parts.weekday === 'Sun' };
}
const isBonusTime = (ms) => BONUS_HOURS.has(ptNow(ms).hour);

// AP of a raid quest at this moment. From 2019-07-15 the rule; earlier the week's own «ap»: 3 values bonus / weekend /
// weekday, «0 / 5» bonus / the rest, «5 / 90» weekend / weekday (no bonus value: those weeks read as weekday in bonus time).
function questApAt(entry, ms) {
  const { weekend } = ptNow(ms), bonus = isBonusTime(ms), a = entry.questAp || [];
  if (String(entry.start) >= AP_RULE_FROM) return bonus ? AP_RULE.bonus : weekend ? AP_RULE.weekend : AP_RULE.weekday;
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
  inventorySnapshot, send, ret, clock, apNow, changeAp, raidUser, supportUsers, guiltLists, battlePoints, beginBattle, grantItem, addPresent, medalCount, medalCap,
  stageState, webBase, rng = Math.random, log = console.log }) {
  // Boss levels reset to LV 1 at the start of every month (original rule, notice 17888), and a boss that comes back in a later week starts at LV 1 again (notice 74823): the real-clock month of the server
  // (clock.monthIndex, 1st 00:00 PST = 08:00 UTC, as Spirit Training). A boss alive keeps its level; levelsMonth is the month
  // the stored levels belong to.
  const monthOf = (ms) => clock.monthIndex(ms);
  const state = () => {
    const r = rewards.raidState(player), month = monthOf(realNow());
    if (r.levelsMonth !== month) { r.levels = {}; r.levelOcc = {}; r.levelsMonth = month; savePlayer(); }
    return r;
  };
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
    if (!key || r.boss?.key === key) return;
    const entry = entries().find((e) => e.key === key);
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

  function bossDefeated(r, boss, allPoints) {
    if (boss.month === undefined || boss.month === r.levelsMonth) { r.levels[boss.key] = Math.min(MAX_LEVEL, boss.level + 1); (r.levelOcc ||= {})[boss.key] = boss.occ; } // a boss of an older month does not feed the new one
    r.lastFight = { raidId: boss.raidId, damage: boss.damage || 0 };
    const parts = fight.listView(boss, boss.endsAt - 1, serverTimeAt).raid.parts; // read as alive: a win past the timer counts
    r.boss = null;
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
      getLux = battlePoints(body?.getPoint, body?.burst);
      savePlayer();
    } else if (boss?.fighting) {
      boss.fighting = false;
      const parts = usableParts(body?.parts);
      boss.damage = (boss.damage || 0) + damageOf(parts);
      const out = fight.clearFight(boss, parts, nowMs);
      raidTimeStatus = out.raidTimeStatus;
      getLux = battlePoints(body?.getPoint, body?.burst);
      if (out.victory) bossDefeated(r, boss, out.allPoints);
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

  function spawn(r, entry, nowMs) {
    const body = enemyRow(entry.enemyId);
    const partRows = body && [body, ...body.parts.slice(0, body.validParts).map(enemyRow)];
    if (!partRows || partRows.some((x) => !x)) { log(`[raid] ${entry.key}: raidEnemy rows missing, no spawn`); return false; }
    const level = (r.levelOcc || {})[entry.key] === entry.start ? r.levels[entry.key] || FIRST_LEVEL : FIRST_LEVEL; // a level belongs to one occurrence (week) of the entry
    const model = (raidIndex().models || {})[String(entry.modelId).padStart(4, '0')] || {}; // keys are folder names, as in make-raid.js
    r.boss = fight.newBoss({ key: entry.key, tier: entry.tier, stageId: entry.stageId, enemy: body, level, upMinutes: entry.upMinutes, useAp: entry.useAp, nowMs,
      partRows: partRows.map((x) => ({ raidEnemyId: x.raidEnemyId, weakness: x.weakness, hp: atLevel(x, 'hp', level), attribute: x.attribute, rare: x.rare })),
      hasStartDemo: !!model.start, hasEscapeDemo: !!model.escape });
    r.boss.month = monthOf(nowMs); r.boss.occ = entry.start;
    log(`[raid] boss ${entry.boss || entry.key} appears, LV ${level}`);
    return true;
  }

  // From respondStageClear. For now only the raid events' quests count (Task 11 adds the story); a stored boss blocks a
  // new one and the counter goes on; the caller saves.
  function onStageClear(stageId, getPoint) {
    const entry = entryOfStage(stageId);
    const points = Number(getPoint?.raidPoint);
    if (!entry || !Number.isFinite(points) || points <= 0) return;
    const r = state(), nowMs = realNow();
    r.points += points;
    if (r.boss || r.points < (isBonusTime(nowMs) ? SPAWN_POINTS_BONUS : SPAWN_POINTS)) return;
    if (spawn(r, entry, nowMs)) r.points = 0;
  }

  // The raids of the player's Shop week (raid-calendar.js): storyWeek() is {shopFrom, shopTo} of storyCtx() in server.js, the
  // rotation of the Shop and Special tabs, so the raid follows the story and changes every real Monday inside a tranche.
  // A quest of another week still counts when played (entryOfStage): its screen may have stayed open across the Monday.
  const currentEntries = (realMs = realNow()) => {
    const { shopFrom, shopTo } = storyWeek();
    return calendar.raidsForWeek(raidIndex(), { shopFrom, shopTo, nowMs: realMs });
  };
  // The kept raid of the Catalog (Task 9): player.raid.kept names an entry key or a census id; all its available tiers.
  function keptEntries() {
    const k = state().kept;
    const key = k && typeof k === 'object' ? k.key || k.censusId : k;
    return key ? entries().filter((e) => e.key === key || e.censusId === key) : [];
  }
  // Raid Boards (sphere type 5) of the current raids and of the kept one (active), and of every raid of the index (all).
  // Boards belong to the census row: every tier carries the same sphereBoardIds (make-raid.js).
  function boardIds(realMs = realNow()) {
    const ids = (list) => list.flatMap((e) => e.sphereBoardIds || []);
    const active = [...new Set([...ids(currentEntries(realMs)), ...ids(keptEntries())])].sort((a, b) => a - b);
    return { active, all: [...new Set(ids(raidIndex().entries || []))] };
  }

  // /stage/event category 2: one event per census row, with its available tiers (currentEntries).
  function events(realMs = realNow()) {
    const byEvent = new Map();
    for (const e of currentEntries(realMs)) byEvent.set(e.evStageId, [...(byEvent.get(e.evStageId) || []), e]);
    return [...byEvent].map(([eventStageId, list]) => {
      const stages = list.map((e) => {
        const st = stageState(e.stageId);
        return { stageId: e.stageId, useAp: questApAt(e, realMs), score: st.score, playStatus: st.playStatus, clearMissionIds: st.clearMissionIds };
      });
      return {
      stages,
      eventStageId,
      showIcon: 1,
      bannerUrl: `${webBase}/web/raid/img/v${RAID_IMG_VERSION}/${eventStageId}.png`,
      eventType: 2,
      status: 1,
      endTime: serverTimeAt(clock.weekEnd(realMs)),
      newStageId: 0,
      isLock: 0,
      // crown to the right of the banner (user 03-11): every quest of the event with its 3 objectives done, as the Special tab
      complete: stages.length && stages.every((s) => [1, 2, 3].every((m) => (s.clearMissionIds || []).includes(m))) ? 1 : 0,
      };
    });
  }

  // Raid «AP 0» campaign (make-ev-campaign.js, docs/notes/raid.md «AP 0 campaign»): the ids of its evCampaign rows while a raid
  // quest of the week costs 0 AP (bonus hours, questApAt), else none. The client then shows those quests at 0 AP; the charge stays
  // questApAt's. ap0Force (bench file save/raid_ap0.json of server.js) lists them at any hour, the charge unchanged.
  // For `campaigns` of GET /campaign, /stage/start and /raid/start.
  function campaignIds(realMs = realNow()) {
    const on = !!ap0Force() || (isBonusTime(realMs) && currentEntries(realMs).some((e) => questApAt(e, realMs) === 0));
    return on ? raidAp0Ids(masterRows('evCampaign')) : [];
  }

  // AP of a raid quest now, or null for any other stage (the master row applies)
  function stageAp(stageId, realMs = realNow()) {
    const entry = entryOfStage(stageId);
    return entry ? questApAt(entry, realMs) : null;
  }

  return { list, start, clear, reward, member, notice, onStageClear, events, stageAp, campaignIds, boardIds, monthOf };
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
