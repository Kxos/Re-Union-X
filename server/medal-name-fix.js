// Nomi delle 6★ originali di thethiny che nel 4.3.1 hanno il suffisso «A» (decisione utente 20-10, come le «X A»
// dell'Organizzazione XIII, rev 128): 41036 «Illustrated Sora» e 42036 «Illustrated Riku» sono «Illustrated Sora A» e
// «Illustrated Riku A» come le loro 7★ (300572, 300576) e come la khuxwiki (sortId 448/449). I banner B0362/B0363
// (catalogo: «illustrated sora a»/«illustrated riku a») le trovano cosi' per nome. Valgono anche per le righe
// boosted (2041036... = stesso groupId). make-game-tables.js la applica prima delle boosted; da sola, idempotente,
// corregge server/master_data sul posto (non rigenera nulla):
//   node server/medal-name-fix.js [cartella master]
'use strict';
const fs = require('fs');
const path = require('path');

const NAME_FIX = { 41036: 'Illustrated Sora A', 42036: 'Illustrated Riku A' };

// -> numero di righe rinominate (la normale e le sue boosted, groupId = id)
function applyNameFix(medals) {
  let n = 0;
  for (const m of medals) {
    const name = NAME_FIX[m.medalId] || NAME_FIX[m.groupId];
    if (name && m.name !== name) { m.name = name; n++; }
  }
  return n;
}

if (require.main === module) {
  const file = path.join(process.argv[2] || process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data'), 'medal.json');
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = applyNameFix(medals);
  if (n) fs.writeFileSync(file, JSON.stringify(medals));
  console.log(`medal-name-fix: ${n} righe rinominate`);
}

module.exports = { NAME_FIX, applyNameFix };
