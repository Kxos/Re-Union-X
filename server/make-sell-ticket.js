#!/usr/bin/env node
// Draw Points from selling Medals (user decision 03-11: Draw Points restored). Original rule (notices 62950, 72831, 73873):
// «You will be able to convert any Attack Medals tier 2 and above for Draw Points! Tier 2 => 2 points, Tier 10 => 10
// points». The 4.3.1 client reads medal.sellTicket (Sell Medals: Txt_A_Ticket_Label = sum of sellTicket x copies of the
// selection, title text 106240301) and the server credits the same number (server.js respondMedalSell, player.drawPoints,
// userPoint.limitedDrawTicket3). Here: sellTicket = guiltValue (Tier) on the Attack Medals (type 1) of Tier >= 2, 0 on
// every other row (support, Trait, Tier 0-1). A boosted copy without its own Tier takes the Tier of its normal Medal (groupId),
// as the gacha does (medal-boost.js).
// Idempotent; at the end of make-game-tables.js. Afterwards: raise the master revision.
//
//   node server/make-sell-ticket.js [master folder]
'use strict';

const fs = require('fs');
const path = require('path');

const ATTACK = 1; // medal.type of the Attack Medals
const MIN_TIER = 2;
// tierOf(row) -> Tier; by default the row's own guiltValue
const sellTicketOf = (r, tierOf = (x) => x.guiltValue || 0) => {
  const tier = tierOf(r);
  return r.type === ATTACK && tier >= MIN_TIER ? tier : 0;
};

function patch(masterDir) {
  const file = path.join(masterDir, 'medal.json');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byId = new Map(rows.map((r) => [r.medalId, r]));
  const tierOf = (r) => r.guiltValue || (r.groupId && r.groupId !== r.medalId ? byId.get(r.groupId)?.guiltValue || 0 : 0);
  let changed = 0, earning = 0;
  for (const r of rows) {
    const v = sellTicketOf(r, tierOf);
    if (v) earning++;
    if ((r.sellTicket || 0) !== v) { r.sellTicket = v; changed++; }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(rows));
  console.log(`sell-ticket: ${earning} Attack Medals of Tier >= ${MIN_TIER} give Draw Points when sold${changed ? ` (${changed} rows changed)` : ' (unchanged)'}`);
  return { changed, earning };
}

module.exports = { ATTACK, MIN_TIER, sellTicketOf, patch };

if (require.main === module) patch(process.argv[2] || path.join(__dirname, 'master_data'));
