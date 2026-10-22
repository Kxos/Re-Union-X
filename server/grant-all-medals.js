// Prova delle medaglie: mette nel salvataggio una copia di ogni medaglia del master
// (server/master_data/medal.json) che il giocatore non ha ancora, al livello 1.
//   node server/grant-all-medals.js            aggiunge (backup in server/save/player.before-all-medals.json)
//   node server/grant-all-medals.js --undo     ripristina il backup
// Il server legge il salvataggio solo all'avvio: poi tools\ldplayer\session\relogin.ps1.
const fs = require('fs');
const path = require('path');

const SAVE = path.join(__dirname, 'save', 'player.json');
const BACKUP = path.join(__dirname, 'save', 'player.before-all-medals.json');

if (process.argv.includes('--undo')) {
  if (!fs.existsSync(BACKUP)) throw new Error(`nessun backup in ${BACKUP}`);
  fs.copyFileSync(BACKUP, SAVE);
  console.log(`ripristinato ${SAVE} da ${BACKUP}`);
  process.exit(0);
}

const player = JSON.parse(fs.readFileSync(SAVE, 'utf8'));
const { isBoosted } = require('./medal-boost');
const medals = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'medal.json'), 'utf8'));
if (!fs.existsSync(BACKUP)) fs.copyFileSync(SAVE, BACKUP);

const owned = new Set(player.medals.map((m) => m.medalId));
// mai riusare un id (come la creazione delle medaglie in server.js: medalState resta per id)
let next = Math.max(100, ...player.medals.map((m) => m.userMedalId),
  ...Object.keys(player.medalState || {}).map(Number)) + 1;
const now = Date.now();
let added = 0;
for (const m of medals) {
  if (owned.has(m.medalId)) continue;
  // righe interne senza prezzo: 1 = «空き» (segnaposto, cella senza immagine nella vendita),
  // 2 = medaglia del Burst (make-guilt-burst.js)
  if (!m.sell) continue;
  // boosted (medal-boost.js): varianti delle normali, solo dalle estrazioni dei banner
  if (isBoosted(m)) continue;
  player.medals.push({ userMedalId: next++, medalId: m.medalId, level: 1, getDatetime: now });
  owned.add(m.medalId);
  added++;
}
fs.writeFileSync(SAVE, JSON.stringify(player, null, 2));
console.log(`aggiunte ${added} medaglie: ora ${player.medals.length} (master ${medals.length})`);
