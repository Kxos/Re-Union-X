#!/usr/bin/env node
// Weekly in due serie alternate (spec orologio finto 3.3): 3001-3010 settimane pari, 3011-3020
// dispari. Ognuna riceve nel master servito la scadenza della SUA prossima settimana, cosi' al cambio
// di settimana a gioco aperto le missioni nuove hanno gia' il conto alla rovescia giusto.
//   node server/make-weekly-series.js   (poi alzare KHUX_REVISION)
'use strict';
const fs = require('fs');
const path = require('path');
for (const file of [path.join(__dirname, 'tables', 'mission.json'), path.join(__dirname, 'master_data', 'mission.json')]) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => !(r.id >= 3011 && r.id <= 3020));
  const a = rows.filter((r) => r.id >= 3001 && r.id <= 3010);
  const b = a.map((r) => ({ ...r, id: r.id + 10 }));
  fs.writeFileSync(file, JSON.stringify([...rows, ...b].sort((x, y) => x.id - y.id), null, 1) + '\n');
  console.log(`${file}: ${a.length} Weekly A + ${b.length} B`);
}
