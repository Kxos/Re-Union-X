// Adesivi della chat del party (tabella master stamp, I-210). Il master WW e' vuoto. Dal client (note private
// «i210_party_chat» §6): la lista mostra solo gli id di /user/chat stampIds con riga valida (validStamp), category 1/2
// = adesivo da talkstamp_<imageId>.png (3 = medaglia), ordinati per sortId, disegnati a imageWidth x imageHeight; il
// messaggio porta imageId e chi lo riceve cerca la riga stampId == imageId senza controllo (crash se manca), quindi
// stampId = imageId. Immagini: delle 40 JP (img/stamp, nessuna servita dal WW) solo queste 7 non hanno testo
// giapponese disegnato (Donald «OK», Xion «HELP!», Anti-Sora, Chip & Dale «Lucky!», Meow Wow, Goofy «?», Roxas);
// import_jp_coco.py le importa. category, sortId e misura (180, il segnaposto di Chat_Panel) sono ricostruiti.
//   node server/stamp-table.js [cartella master]   (scrive stamp.json; poi revisione +1)
'use strict';
const fs = require('fs');
const path = require('path');

const TALK_STAMPS = [4, 5, 8, 10, 12, 23, 27];

const stampRows = () => TALK_STAMPS.map((id) => ({
  stampId: id, category: 1, imageId: id, require: 0, sortId: id, imageWidth: 180, imageHeight: 180, validStamp: 1,
}));

module.exports = { stampRows, TALK_STAMPS };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
  fs.writeFileSync(path.join(dir, 'stamp.json'), JSON.stringify(stampRows()));
  console.log(`stamp: ${TALK_STAMPS.length} righe in ${dir}`);
}
