// Raid opening hours and the all-day Bonus Time (I-228, user decision 06-11 «mixed»; docs/notes/raid.md «Raid hours»). Pure, rules
// in raid_config.json (raidWindows, bonusAllDay), read here and by make-raid.js (labels, master stage useAp):
// - a raid with opening hours (raidWindows.rules: the WW Daily Raid Events of 2017-2018, the JP monthly 30-minute raids, the WW
//   weekday weekly raids of 2018-09-10 .. 2019-07-14) follows its original rules inside its hours (its own quest AP, the Lux and
//   level rules of the time) and stays open outside them (ours, not original) at raidWindows.outsideAp per quest, with no Bonus Time
//   and a boss level of its own (routes-raid.js);
// - bonusAllDay: the raids whose week lies in a period with Bonus Time 24 hours a day (June 2020, notices 66106 / 66114 / 66617 /
//   66626) are in Bonus Time at any hour (Lux x2, the AP 0 campaign).
// Hours are read on the real clock in the rule's time zone (PT or JST), like the Bonus Time hours.
'use strict';

const DEFAULT = (() => {
  try { const c = require('./raid_config.json'); return { raidWindows: c.raidWindows || null, bonusAllDay: c.bonusAllDay || null }; } catch { return {}; }
})();
const TZ = { PT: 'America/Los_Angeles', JST: 'Asia/Tokyo' };
const fmts = new Map();
// {date: YYYY-MM-DD, minute: minute of the day, weekend} on the real clock of the zone
function local(ms, tz) {
  const zone = TZ[tz];
  if (!zone) throw new Error(`raid windows: unknown time zone ${tz}`);
  if (!fmts.has(zone)) fmts.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }));
  const p = Object.fromEntries(fmts.get(zone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute), weekend: p.weekday === 'Sat' || p.weekday === 'Sun' };
}
// «HH:MM-HH:MM», both minutes inside (12:00-12:59 is one hour)
function slot(s) {
  const m = /^(\d\d):(\d\d)-(\d\d):(\d\d)$/.exec(String(s));
  if (!m) throw new Error(`raid windows: bad slot ${s}`);
  const a = Number(m[1]) * 60 + Number(m[2]), b = Number(m[3]) * 60 + Number(m[4]);
  if (!(a <= b && b < 1440)) throw new Error(`raid windows: bad slot ${s}`);
  return [a, b];
}

// The window rule of a raids.json entry (the first rule that matches), or null: censusIds, else family / familyPrefix with jp and
// the entry's start inside [from, to]
function ruleOf(entry, cfg = DEFAULT) {
  const rules = (cfg && cfg.raidWindows && cfg.raidWindows.rules) || [];
  if (!entry || !entry.censusId) return null;
  return rules.find((r) => {
    if (r.censusIds) return r.censusIds.includes(entry.censusId);
    const fam = String(entry.family || '');
    if (r.family !== undefined && fam !== r.family) return false;
    if (r.familyPrefix !== undefined && !fam.startsWith(r.familyPrefix)) return false;
    if (r.jp !== undefined && !!entry.jp !== r.jp) return false;
    const s = String(entry.start || '');
    return (!r.from || s >= r.from) && (!r.to || s <= r.to);
  }) || null;
}

// The entry's window state at real time ms: null (no opening hours: the raid's usual rules) or {rule, inside, slot (the window's
// key, YYYY-MM-DD#n in the rule's zone, or YYYY-MM-DD for a weekend open all day; null outside), outsideAp, label}
function stateAt(entry, ms, cfg = DEFAULT) {
  const rule = ruleOf(entry, cfg);
  if (!rule) return null;
  const at = local(ms, rule.tz || 'PT');
  const base = { rule, label: rule.label, outsideAp: Number(cfg.raidWindows.outsideAp) };
  if (at.weekend && rule.weekendAllDay) return { ...base, inside: true, slot: at.date };
  const slots = ((at.weekend && rule.weekendSlots) || rule.slots || []).map(slot);
  const i = slots.findIndex(([a, b]) => at.minute >= a && at.minute <= b);
  return { ...base, inside: i >= 0, slot: i >= 0 ? `${at.date}#${i}` : null };
}

// AP written in the master stage row (the quest top shows it, not the useAp of /stage/event: I-236): the outside price for a raid
// with opening hours (the higher one, as the 0 / 5 / 90 weeks show 90), else the last census value
function stageUseAp(entry, cfg = DEFAULT) {
  const a = (entry && entry.questAp) || [];
  return ruleOf(entry, cfg) ? Number(cfg.raidWindows.outsideAp) : a[a.length - 1];
}

// The all-day Bonus Time period of the entry's week, or null (bonusAllDay: [{from, to}], the census start inside; Japan-only raids
// never: the period is a worldwide notice's)
function allDayBonus(entry, cfg = DEFAULT) {
  if (!entry || entry.jp || !entry.start) return null;
  const s = String(entry.start);
  return ((cfg && cfg.bonusAllDay && cfg.bonusAllDay.periods) || []).find((p) => s >= p.from && s <= p.to) || null;
}

module.exports = { ruleOf, stateAt, stageUseAp, allDayBonus, local, DEFAULT };
