// Pure rules of a raid boss fight (docs/notes/raid.md, "How a raid runs"). No player or master access:
// `boss` is the object stored in player.raid.boss. Dates are strings "YYYY-MM-DD HH:MM:SS" made by `fmt`.
'use strict';
const RETURN_RATIO = 0.5; // a broken weak point comes back with this share of its max HP
const DOWN_MS = 180000; // ...after this long
const STATUS = { NONE: 0, GAVE_UP: 1, ESCAPE: 2, ACTIVE: 3, START: 4 };
const RAID_TIME_VICTORY = 3;
const RAID_TIME_GIVE_UP = 1; // bench 2-11: YOU LOSE with an empty text line (docs/notes/raid.md)
const RAID_TIME_ESCAPED = 2; // «The Raid Boss has escaped»: a fight lost past the timer

const defaultFmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

function newBoss({ key, tier, stageId, enemy, partRows, level, upMinutes, useAp, nowMs, hasStartDemo, hasEscapeDemo }) {
  void enemy; // the rows of the parts carry everything the fight needs
  const parts = [...partRows].sort((a, b) => a.weakness - b.weakness).map((r) => ({
    raidEnemyId: r.raidEnemyId, partsId: r.weakness, hp: r.hp, maxHp: r.hp, attribute: r.attribute, rare: r.rare, downAt: 0,
  }));
  return {
    raidId: nowMs, key, tier, stageId, level, endsAt: nowMs + upMinutes * 60000, fights: 0, useAp,
    status: hasStartDemo ? STATUS.START : STATUS.ACTIVE, hasEscapeDemo: !!hasEscapeDemo, parts,
  };
}

const infoParts = (boss) => boss.parts.map((p) => ({
  raidEnemyId: p.raidEnemyId, partsId: p.partsId, hp: p.hp, attribute: p.attribute, rare: p.rare,
}));

function emptyRaid(fmt, nowMs) {
  const now = fmt(nowMs);
  return { raidId: 0, level: 0, useAp: 0, timeLeft: now, feverFlag: 0, feverTime: now, stageId: 0, parts: [] };
}

// Nothing here depends on the current week: the stored boss is served until it dies or flees.
function listView(boss, nowMs, fmt = defaultFmt) {
  if (!boss) return { raidStatus: STATUS.NONE, raid: emptyRaid(fmt, nowMs) };
  if (nowMs >= boss.endsAt && !boss.hasEscapeDemo) return { raidStatus: STATUS.NONE, raid: emptyRaid(fmt, nowMs) };
  const raid = {
    raidId: boss.raidId, level: boss.level, useAp: boss.fights === 0 ? 0 : boss.useAp, timeLeft: fmt(boss.endsAt),
    feverFlag: 0, feverTime: fmt(boss.endsAt), stageId: boss.stageId, parts: infoParts(boss),
  };
  return { raidStatus: nowMs >= boss.endsAt ? STATUS.ESCAPE : boss.status, raid };
}

// Called after the list was sent: the start demo is shown once, an expired boss is gone.
function afterList(boss, nowMs) {
  if (!boss || nowMs >= boss.endsAt) return null;
  if (boss.status === STATUS.START) boss.status = STATUS.ACTIVE;
  return boss;
}

function startFight(boss, nowMs) {
  const ap = boss.fights === 0 ? 0 : boss.useAp;
  boss.fights += 1;
  boss.parts.forEach((p, i) => {
    if (i > 0 && p.hp === 0 && nowMs - p.downAt >= DOWN_MS) p.hp = Math.floor(p.maxHp * RETURN_RATIO);
  });
  return { ap, parts: infoParts(boss) };
}

// `parts` as sent by /raid/clear: [{raidEnemyId, partsId, hp, damage}]. The client does not cut a fight at the timer.
function clearFight(boss, parts, nowMs) {
  for (const sent of parts || []) {
    const p = boss.parts.find((x) => x.partsId === Number(sent.partsId)) ||
      boss.parts.find((x) => x.raidEnemyId === Number(sent.raidEnemyId));
    if (!p) continue;
    p.hp = Math.max(0, Math.min(p.hp, Number(sent.hp) || 0));
    if (p.hp === 0) p.downAt = nowMs;
  }
  const victory = boss.parts[0].hp === 0;
  const allPoints = victory && boss.parts.slice(1).every((p) => p.hp === 0);
  return { victory, allPoints, raidTimeStatus: victory ? RAID_TIME_VICTORY : nowMs >= boss.endsAt ? RAID_TIME_ESCAPED : RAID_TIME_GIVE_UP };
}

module.exports = { RETURN_RATIO, DOWN_MS, STATUS, RAID_TIME_ESCAPED, newBoss, listView, afterList, startFight, clearFight };
