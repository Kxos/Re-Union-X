// «Gauge +N» degli speciali (burst.recovery, I-209): il client conta il gauge in decimillesimi (1 gauge = 10000,
// lo stesso del controllo del costo), mentre burst-buffs.js fino al 25-10 scriveva N in gauge interi: +5 diventava
// +0,0005 e il gauge non risaliva mai (banco 25-10, SN++ - Illus. KH III Xion). burst-buffs.js ora scrive N*10000;
// questa correzione porta un master gia' generato alla stessa unita' senza rigenerarlo. Idempotente: tocca solo i
// valori fra 1 e 9999 (nessuno speciale recupera meno di un gauge intero).
//   node server/gauge-recovery-fix.js [cartella master]   (poi revisione +1 e relogin.ps1)
'use strict';
const fs = require('fs');
const path = require('path');

function apply(masterDir) {
  const file = path.join(masterDir, 'burst.json');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = 0;
  for (const r of rows) {
    if (r.recovery > 0 && r.recovery < 10000) { r.recovery *= 10000; changed++; }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(rows));
  return changed;
}

if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, 'master_data');
  console.log(`burst.recovery in decimillesimi: ${apply(dir)} righe corrette in ${dir}`);
}

module.exports = { apply };
