#!/usr/bin/env node
// evCampaign rows of the raid «AP 0» campaign (docs/notes/raid.md, «AP 0 campaign»). Original rule (official notices 2019-2020):
// raid event quests cost 0 AP in the daily bonus hours. The client shows the cost of a quest as master useAp changed by the
// active campaigns of type 7 (power 0 -> AP 0), and it reads «active» from the ids the server lists (`campaigns` of GET
// /campaign and of the start routes), not from the times or weekdays of the row. routes-raid.js campaignIds() lists these
// ids while every listed raid quest costs 0 in Bonus Time: with the served rule (raid_config.json costRule weekdayWeekend, I-228)
// all day on Saturday and Sunday (Pacific), for every raid stage, kept and Japan-only ones included.
// Rows: type 7, power 0, stageType 2 (explicit stage ids, at most 5 per row), one row per 5 raid quest stages (stage table,
// 980000-989999, written by make-raid.js), ids RAID_AP0_BASE + n. The 2016 master (thethiny) has a «0 AP» row of stageType 4
// (every event stage, campaign 2661): not used, because it would also take the Special tab's quests. Value formats mirror
// the 2016 rows: times «YYYY-MM-DD hh:mm:ss», week flags 1 (as 2661), groupPattern 0, validMinute 0, unused stageId slots 0
// (the 2016 rows carry garbage there).
// Own rows (RAID_AP0_BASE..RAID_AP0_MAX) are dropped first; any other row is kept. Wired at the end of make-game-tables.js
// after make-raid. On its own (then raise the master revision):
//   node server/make-ev-campaign.js [master folder]
'use strict';
const fs = require('fs');
const path = require('path');

const RAID_AP0_BASE = 98000, RAID_AP0_MAX = 98999;
const RAID_QUEST_FIRST = 980000, RAID_QUEST_LAST = 989999;
const PER_ROW = 5;
const DISPLAY_TEXT = 'Bonus Time: Raids cost 0 AP!';
const START = '2015-01-01 00:00:00', END = '2030-12-31 23:59:59';
const AP_CAMPAIGN = 7, STAGE_LIST = 2;

const isOwn = (r) => r.campaignId >= RAID_AP0_BASE && r.campaignId <= RAID_AP0_MAX;

// Field order of the client's evCampaign (18 fields).
function row(campaignId, stageIds) {
  return {
    campaignId, type: AP_CAMPAIGN, power: 0, displayText: DISPLAY_TEXT, stageType: STAGE_LIST, validStageId: stageIds.length,
    stageId: [...stageIds, 0, 0, 0, 0, 0].slice(0, PER_ROW), startTime: START, endTime: END,
    weekMonday: 1, weekTuesday: 1, weekWednesday: 1, weekThursday: 1, weekFriday: 1, weekSaturday: 1, weekSunday: 1,
    groupPattern: 0, validMinute: 0,
  };
}

// stage rows -> evCampaign rows covering every raid quest stage
function raidAp0Rows(stages) {
  const ids = [...new Set((stages || []).map((s) => s.stageId).filter((id) => id >= RAID_QUEST_FIRST && id <= RAID_QUEST_LAST))].sort((a, b) => a - b);
  const rows = [];
  for (let i = 0; i < ids.length; i += PER_ROW) rows.push(row(RAID_AP0_BASE + rows.length, ids.slice(i, i + PER_ROW)));
  if (rows.length && rows[rows.length - 1].campaignId > RAID_AP0_MAX) throw new Error(`make-ev-campaign: ${rows.length} rows overflow ${RAID_AP0_BASE}-${RAID_AP0_MAX}`);
  return rows;
}

// Ids of the AP 0 campaign in a served evCampaign table (what routes-raid.js lists in the bonus hours)
const raidAp0Ids = (evCampaign) => (evCampaign || []).filter((r) => isOwn(r) && r.type === AP_CAMPAIGN && r.power === 0).map((r) => r.campaignId);

function patch(masterDir) {
  const read = (n, d) => { try { return JSON.parse(fs.readFileSync(path.join(masterDir, n + '.json'), 'utf8')); } catch { return d; } };
  const stages = read('stage', []);
  const kept = read('evCampaign', []).filter((r) => !isOwn(r));
  const rows = raidAp0Rows(stages);
  fs.writeFileSync(path.join(masterDir, 'evCampaign.json'), JSON.stringify([...kept, ...rows]));
  console.log(`evCampaign: ${rows.length} raid AP 0 rows (${RAID_AP0_BASE}+, ${rows.reduce((n, r) => n + r.validStageId, 0)} raid quest stages), ${kept.length} other rows kept`);
  return rows.length;
}

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));

module.exports = { raidAp0Rows, raidAp0Ids, patch, RAID_AP0_BASE, RAID_AP0_MAX, DISPLAY_TEXT };
