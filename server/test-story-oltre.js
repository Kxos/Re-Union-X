// Prova delle righe master delle missioni di storia 526-979 (make-story-oltre.js, I-009):
//   node server/test-story-oltre.js
// Fonti finte minime costruite qui (nessun dato vero): 1.1.3 per 526-555, wiki e oltre525.json per le altre.
'use strict';
const fs = require('fs'), path = require('path');
const { buildRows, patch, wikiLv, ROOM_WORLD, defaultSources, thumbForRoom, readThumbs, buildWorldRows, countStopgaps,
  Q555_VARIANTS, readHeaders } = require('./make-story-oltre');
// cartelle temporanee sul disco D (regola del progetto), tolte alla fine
const TMP = process.env.KHUX_TMP || 'D:\\Progetto_Restauro_KH_UX\\tmp';
fs.mkdirSync(TMP, { recursive: true });
const tmpDirs = [];
const mkTmp = () => { const d = fs.mkdtempSync(path.join(TMP, 'oltre-')); tmpDirs.push(d); return d; };
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// --- fonti finte ---------------------------------------------------------------------------------------------
const PREFIX = { 526: 'DW', 537: 'DB', 556: 'AG', 600: 'CD', 700: 'ED', 871: 'CS', 880: 'NL', 890: 'HD', 931: 'SR' };
const prefixOf = (n) => PREFIX[Object.keys(PREFIX).map(Number).filter((k) => k <= n).pop()];
const stageIdOf = (n) => (n === 555 ? 18302 : n === 978 ? 39158 : n === 979 ? 39159 : 18000 + (n - 525) * 10);
const wiki = {}, wikiRaw = {}, missions = [], stage113 = [];
// obiettivi «Defeat the X»: nome nel master (senza articolo), bersaglio dello stage, nome solo JP, nome sconosciuto
const SECOND = { 601: 'Defeat the Phantom Thing within 1 turn', 603: 'Defeat the Shadow within 2 turns',
  605: 'Defeat the Nessuno within 1 turn', 607: 'Defeat Solo JP x 3', 609: 'Complete within 45 seconds',
  // obiettivi dei tappabuchi di prima coi codici del client (ricerca in tmp\objectives, 21-10)
  611: 'Do a barrel roll', 613: 'Complete within 01\'20"00', 615: 'Complete within 2 battles', 619: 'Deal 50 or more hits',
  621: 'Complete without taking damage', 623: 'Take less than a total of 20000 damage', 625: 'Destroy all barrels',
  627: 'Open 3 treasure chests', 629: 'Collect 3 Keyblade materials', 631: 'Equip 4 or fewer Medals',
  633: 'Complete within 00\'30"50' };
// trofei (materiali 61/62/63) come premio del terzo obiettivo: naobjbonus3img della pagina wiki
const TROPHY = { 880: 'Trophy NI KHX', 890: 'Trophy CS KHX', 915: 'Trophy CK KHX' };
for (let n = 526; n <= 979; n++) {
  if (n === 978) continue;
  const title = `Quest ${n}: Finta ${n}`;
  const room = n === 600 ? 'The Chateau: Stairs' : `Stanza ${n}`;
  const objectives = [
    { text: 'Defeat all enemies within 1 turn', reward: 'Avatar Coin', qty: '6' },
    n === 600 ? { text: 'Defeat Phantom Thing x 2', reward: 'Title', qty: '1' }
      : SECOND[n] ? { text: SECOND[n], reward: 'Avatar Coin', qty: '4' }
        : { text: 'Defeat the target enemy within 2 turns', reward: 'Avatar Coin', qty: '4' },
    TROPHY[n] ? { text: 'Complete without having to continue', reward: 'Trophy', qty: '1' }
      : { text: 'Complete without having to continue', reward: 'Mythril Shard', qty: '1' },
  ];
  wiki[title] = { title, number: String(n), name: `Finta ${n}`, world: n === 650 ? 'Castle of Dreams' : 'X', rooms: [room], ap: n % 2 ? 'zero' : '25',
    lvl: String(100 + n), target: 'Shadow', objectives, jewel: n === 600 ? '250' : null,
    rewards: n === 600 ? { namunny: 20000, jpmunny: 20000 } : {}, treasures: [], enemies: [] };
  wikiRaw[title] = n === 600 ? '{{InfoQuestKHUX\n|naotitle=Presently\n|nakeyblade=Stroke of Midnight\n}}'
    : TROPHY[n] ? `{{InfoQuestKHUX\n|naobj3=Complete without having to continue\n|naobjbonus3=Trophy\n|naobjbonus3img=${TROPHY[n]}\n}}`
      : '{{InfoQuestKHUX\n}}';
  const sid = stageIdOf(n);
  missions.push({ q: n, title, rooms: [room], stage: { stageId: sid, rooms: [n === 650 ? 'DG_0200_27_00' : `${prefixOf(n)}_0001_00_00`],
    target_id: n === 700 ? 77777 : 10001 } });
}
wikiRaw['Quest 978: What Comes After'] = '{{InfoQuestKHUX/Cutscene\n|number=978\n|nadesc=What Comes After\n|world=Daybreak Town\n'
  + '|najewel=1000\n|naqtitle=Fates Entwined\n|namedal=Chip 6★\n|namedalq=5\n|proudap=zero\n}}';
for (let n = 526; n <= 555; n++) {
  const sid = n === 555 ? 18300 : stageIdOf(n);
  stage113.push({ stageId: sid, id: n, name: `Finta ${n}`, mapName: `Mappa 1.1.3 ${n}`, useAp: 99, chapterId: 0, worldId: 9,
    thumbId: 5000 + n, stageKind: 1, showIcon: 0, validBeforeDrama: 2, beforeDramaId: [1180101, 2999950, 980710245, 1, 2],
    beforeDramaType: [0, 0, 980710245, 1, 2], validAfterDrama: 0, afterDramaId: [0, 0, 980710245, 1, 2],
    afterDramaType: [0, 0, 980710245, 1, 2], validClearGetTitle: 0, clearGetTitle: 0, validClearGetSphere: 0,
    clearGetSphere: 0, resetClearGet: 0, validClearGetItem: 1, clearGetItemType: [2, 2037214581, 0],
    clearGetItemId: [0, 2037214581, 0], clearGetAssignSkillType: [1, 2037214581, 0], clearGetAssignSkillId: [0, 1, 0],
    clearGetAssignSkillLv: [1, 1, 0], clearGetItemNum: [150, 7, 0], resetSubMission: 0, validSubmission: 3,
    submissionRequire: [28, 12, 4], submissionName: ['Defeat all enemies within 1 turn', 'Defeat the target enemy within\n1 turn',
      'Defeat %s x %d'], submissionDataType: [1, 4, 4], submissionIdType: [0, 1, 1], submissionId: [0, 10001, 99],
    submissionNum: [0, 1, 2], submissionRewardType: [14, 14, 5], submissionItemId: [0, 0, 1], submissionSkillType: [0, 0, 0],
    submissionSkillId: [0, 0, 0], submissionSkillLv: [0, 0, 0], submissionItemNum: [6, 4, 1], raidBoss: 5015,
    bgmField: 501000110, bgmBattle: 501000120, bgmBoss: 501000130 });
}
// master 1-525: due righe di storia (mondi 1 e 4) + la 1050 (non di storia) come riferimento
const base525 = { stageId: 17250, stageBinId: 0, id: 525, name: 'A Frosty Monstrosity', mapName: 'Frozen Forest', useAp: 25,
  chapterId: 17, worldId: 4, thumbId: 120200, onlyDrama: 0, stageKind: 1, raidBoss: 50000000, bgmField: 501000610,
  bgmBattle: 501000620, bgmBoss: 501000630 };
const stageRows = [{ ...base525, stageId: 17240, id: 524, worldId: 1, thumbId: 1001600, bgmField: 501005001 }, base525,
  { ...base525, stageId: 991001, id: 9101, name: 'Tour Daybreak Town', worldId: 1 }];
const enemies = [{ enemyId: 1, name: 'Shadow' }, { enemyId: 10001, name: 'Shadow' }, { enemyId: 99, name: 'Phantom Thing' }];
const titles = [{ titleId: 13067, title: 'Presently' }, { titleId: 13120, title: 'Fates Entwined' }];
const medals = [{ medalId: 90056, name: 'Chip', rare: 6 }, { medalId: 90026, name: 'Huey', rare: 6 }];
const keyblades = [{ keybladeId: 10000, name: 'Stroke of Midnight', lv: 0 }, { keybladeId: 2000, name: 'Treasure Trove', lv: 0 }];
const theater = [
  { stageId: 18060, validTheater: 1, dramaId: [2300101], dramaType: [0] },
  { stageId: 39158, validTheater: 1, dramaId: [2560701, 2560801, 2560901, 2561001], dramaType: [0, 0, 0, 0] },
  { stageId: 39158, validTheater: 1, dramaId: [2561101], dramaType: [0] },
  { stageId: 39158, validTheater: 1, dramaId: [2561201], dramaType: [0] },
  { stageId: 39159, validTheater: 1, dramaId: [140350, 2561301], dramaType: [10, 0] },
];
const dramas = new Set([1180101, 2300101, 2560701, 2560801, 2560901, 2561001, 2561101, 2561201, 2561301]);
const oltre = { missions, learned_enemy_names: { 1637: 'Solo JP' } };
const sources = { stage113, wiki, wikiRaw, oltre, theater, dramas, enemies, titles, medals, keyblades, skills: [] };

// --- righe ---------------------------------------------------------------------------------------------------
const rows = buildRows(stageRows, sources);
const byId = new Map(rows.map((r) => [r.id, r]));
check(rows.length === 454 && [...Array(454).keys()].every((i) => byId.has(526 + i)), `righe 526..979: ${rows.length}`);
check(rows.every((r) => r.stageKind === 1 && r.stageBinId === 0), 'stageKind 1 e stageBinId 0 come le 1-525');
check(rows.every((r) => r.branchType === (r.id === 555 ? 1 : 0)), 'branchType 0 salvo la 555');
const q555 = byId.get(555);
check(q555 && q555.stageId === 18300 && q555.branchType === 1, `555: stageId 18300 branchType 1 (${q555 && q555.stageId})`);
check(byId.get(600).stageId === 18750 && byId.get(979).stageId === 39159, 'stageId da oltre525.json');
// useAp dalla wiki, "zero" -> 0 (anche 526-555, non dal 1.1.3)
check(byId.get(527).useAp === 0 && byId.get(526).useAp === 25 && byId.get(601).useAp === 0 && byId.get(600).useAp === 25,
  'useAp dalla wiki');
// mapName: 1.1.3 per 526-555, rooms[0] della wiki dopo
check(byId.get(530).mapName === 'Mappa 1.1.3 530' && byId.get(600).mapName === 'The Chateau: Stairs', 'mapName');
// worldId dal prefisso della stanza (mondi di Ralph 11-14, D-C), chapterId = stageId div 1000
check(byId.get(526).worldId === 2 && byId.get(540).worldId === 1 && byId.get(560).worldId === 4 && byId.get(600).worldId === 7
  && byId.get(700).worldId === 8 && byId.get(872).worldId === 13 && byId.get(880).worldId === 11
  && byId.get(890).worldId === 12 && byId.get(931).worldId === 14, 'worldId dal prefisso');
check(ROOM_WORLD.NL === 11 && ROOM_WORLD.HD === 12 && ROOM_WORLD.CS === 13 && ROOM_WORLD.SR === 14, 'mondi di Ralph 11-14');
check(rows.every((r) => r.chapterId === Math.floor(r.stageId / 1000)), 'chapterId = stageId div 1000');
// Lv della scheda (STG [11], Task 3) dalla wiki
check(wikiLv(wiki['Quest 600: Finta 600']) === 700 && wikiLv({ lvl: null }) === 0, 'Lv dalla wiki');
// array tagliati alle lunghezze valide; drammi solo se presenti nelle risorse
const r530 = byId.get(530);
check(r530.clearGetItemType.length === 1 && r530.clearGetItemNum[0] === 150, 'clearGet tagliato a validClearGetItem');
check(r530.validBeforeDrama === 1 && JSON.stringify(r530.beforeDramaId) === '[1180101]', `drammi 1.1.3 filtrati: ${r530.beforeDramaId}`);
check(r530.validAfterDrama === 0 && r530.afterDramaId.length === 0, 'drammi dopo tagliati');
// drammi delle 556+: dal theater (stessa stageId), non della riga di riferimento
check(byId.get(600).validBeforeDrama === 0 && byId.get(600).beforeDramaId.length === 0, 'nessun dramma senza theater');
const r979 = byId.get(979);
check(r979.validBeforeDrama === 1 && r979.beforeDramaId[0] === 2561301, 'theater: id assenti dalle risorse tolti');
// campi senza fonte dall'ultima riga 1-525 dello stesso worldId (non dai tour)
check(byId.get(560).bgmField === 501000610 && byId.get(560).thumbId === 120200, 'bgm/thumb dalla 525 (mondo 4)');
check(byId.get(560).raidBoss === 50000000, 'raidBoss dalla riga di riferimento');
check(byId.get(540).thumbId === 5000 + 540, 'thumb della 1.1.3 per 526-555');
// obiettivi dalla wiki
const r600 = byId.get(600);
check(r600.validSubmission === 3 && r600.submissionRequire[0] === 28 && r600.submissionRewardType[0] === 14
  && r600.submissionItemNum[0] === 6, 'obiettivo 1 «Defeat all enemies within 1 turn» -> 28, 6 Avatar Coin');
check(r600.submissionRequire[1] === 4 && r600.submissionId[1] === 99 && r600.submissionNum[1] === 2
  && r600.submissionName[1] === 'Defeat %s x %d', 'obiettivo «Defeat X x N» -> 4/4/1 nemico per nome');
check(r600.submissionRewardType[1] === 7 && r600.submissionItemId[1] === 13067, 'premio Title -> 7 + titleId (naotitle)');
check(r600.submissionRequire[2] === 10 && r600.submissionRewardType[2] === 5 && r600.submissionItemId[2] === 1,
  'Complete without having to continue -> 10, Mythril Shard -> 5:1');
const r602 = byId.get(602);
check(r602.submissionRequire[1] === 12 && r602.submissionId[1] === 10001 && r602.submissionNum[1] === 2,
  'Defeat the target enemy within 2 turns -> 12/4/1 bersaglio dello stage');
check(byId.get(601).submissionRequire[1] === 12 && byId.get(601).submissionId[1] === 99, '«Defeat the X»: nome senza articolo');
check(byId.get(603).submissionId[1] === 10001, '«Defeat the <bersaglio>»: id pieno del bersaglio dello stage');
check(byId.get(605).submissionId[1] === 1, 'nome sconosciuto: mai id 0, Shadow');
check(byId.get(607).submissionRequire[1] === 4 && byId.get(607).submissionId[1] === 1, 'nome solo JP (1637, assente dal master) -> 1');
check(byId.get(611).submissionRequire[1] === 10 && byId.get(611).submissionName[1] === 'Do a barrel roll'
  && JSON.stringify(rows.report.stopgapObjectives) === '[[611,2,"Do a barrel roll"]]', 'obiettivo senza codice: tappabuchi segnalato');
// codici delle condizioni; testo della wiki tale e quale come submissionName
const sub2 = (n) => { const r = byId.get(n); return [r.submissionRequire[1], r.submissionDataType[1], r.submissionIdType[1],
  r.submissionId[1], r.submissionNum[1], r.submissionName[1]]; };
const sameSub = (n, want) => JSON.stringify(sub2(n)) === JSON.stringify(want);
check(sameSub(609, [37, 2, 0, 0, 45, 'Complete within 45 seconds']), `37 tempo <= N secondi: ${sub2(609)}`);
check(sameSub(613, [37, 2, 0, 0, 80, 'Complete within 01\'20"00']), `37 mm'ss"cc -> mm*60+ss: ${sub2(613)}`);
check(sameSub(633, [37, 2, 0, 0, 31, 'Complete within 00\'30"50']), `37 mm'ss"cc con centesimi -> secondo dopo: ${sub2(633)}`);
check(sameSub(615, [8, 2, 0, 0, 2, 'Complete within 2 battles']), `8 battaglie <= N: ${sub2(615)}`);
check(sameSub(619, [33, 2, 0, 0, 50, 'Deal 50 or more hits']), `33 colpi >= N: ${sub2(619)}`);
check(sameSub(621, [9, 1, 0, 0, 0, 'Complete without taking damage']), `9 colpi subiti <= 0: ${sub2(621)}`);
check(sameSub(623, [36, 2, 0, 0, 19999, 'Take less than a total of 20000 damage']), `36 «less than» N -> N-1: ${sub2(623)}`);
check(sameSub(625, [17, 1, 0, 0, 0, 'Destroy all barrels']), `17 barili = tutti i forzieri: ${sub2(625)}`);
check(sameSub(627, [17, 1, 0, 0, 0, 'Open 3 treasure chests']), `17 N forzieri (senza intestazioni): ${sub2(627)}`);
check(sameSub(629, [18, 1, 0, 0, 0, 'Collect 3 Keyblade materials']), `18 N materiali (senza intestazioni): ${sub2(629)}`);
check(sameSub(631, [24, 2, 0, 0, 4, 'Equip 4 or fewer Medals']), `24 medaglie <= N: ${sub2(631)}`);
// con le intestazioni degli stage (mappoi forzieri materiali): N diverso dal totale -> tappabuchi
{
  const sidOf = (n) => missions.find((m) => m.q === n).stage.stageId;
  const headers = { [sidOf(625)]: { treasures: 4, materials: 0 }, [sidOf(627)]: { treasures: 3, materials: 0 },
    [sidOf(629)]: { treasures: 0, materials: 2 } };
  const rh = buildRows(stageRows, { ...sources, headers });
  const bh = new Map(rh.map((r) => [r.id, r]));
  check(bh.get(625).submissionRequire[1] === 17 && bh.get(627).submissionRequire[1] === 17, 'forzieri: N = totale dello stage -> 17');
  check(bh.get(629).submissionRequire[1] === 10 && rh.report.stopgapObjectives.some(([n]) => n === 629),
    'materiali: N != totale dello stage -> tappabuchi');
}
// readHeaders: totali dell'intestazione mappoi (forzieri, materiali) per stageId
{
  const d = mkTmp();
  const buf = Buffer.alloc(0x40);
  buf.writeInt32LE(3, 0x38); buf.writeInt32LE(2, 0x3c);
  fs.writeFileSync(path.join(d, 'mappoi_stg38020.bin'), buf);
  fs.writeFileSync(path.join(d, 'mappoi_stg1.bin'), Buffer.alloc(8));
  const h = readHeaders(d);
  check(JSON.stringify(h) === '{"38020":{"treasures":3,"materials":2}}', `readHeaders: ${JSON.stringify(h)}`);
  check(readHeaders(path.join(d, 'manca')) === null, 'readHeaders senza cartella -> null');
}
// premio Trophy: materiale 61 NI / 62 CS / 63 CK x1 (tipo 5), dall'immagine naobjbonus3img
const trophy = (n) => { const r = byId.get(n); return [r.submissionRewardType[2], r.submissionItemId[2], r.submissionItemNum[2]].join(); };
check(trophy(880) === '5,61,1' && trophy(890) === '5,62,1' && trophy(915) === '5,63,1', `premi Trophy: ${trophy(880)} ${trophy(890)} ${trophy(915)}`);
check(rows.report.missingRewards.length === 0, `premi non ricavati: ${JSON.stringify(rows.report.missingRewards)}`);
check(byId.get(650).worldId === 7, 'stanza DG: mondo della wiki');
// premi di fine missione: jewel, munny, keyblade
check(JSON.stringify(r600.clearGetItemType) === '[2,4,13]' && JSON.stringify(r600.clearGetItemNum) === '[250,20000,1]'
  && r600.clearGetItemId[2] === 10000 && r600.validClearGetItem === 3, `clearGet 600: ${r600.clearGetItemType}`);
// «Defeat X» su nemici assenti dal master -> 1 (Shadow), come make-game-tables.js; 1.1.3 compresa
check(byId.get(700).submissionId[1] === 1, 'bersaglio 77777 assente dal master -> 1');
check(byId.get(530).submissionId[1] === 10001 && byId.get(530).submissionId[2] === 99, 'nemici presenti: invariati');
// Q978: solo filmato (D-B): onlyDrama 1 -> StageSkipActionMap, nessuna mappa
const r978 = byId.get(978);
check(r978 && r978.onlyDrama === 1 && r978.stageId === 39158 && r978.worldId === 1 && r978.useAp === 0
  && r978.validSubmission === 0 && r978.mapName === '' && r978.name === 'What Comes After', '978 riga di solo filmato');
check(r978.validBeforeDrama === 5 && r978.beforeDramaId[0] === 2560701 && r978.beforeDramaId[4] === 2561101
  && r978.validAfterDrama === 1 && r978.afterDramaId[0] === 2561201, `978 filmati: ${r978.beforeDramaId} / ${r978.afterDramaId}`);
check(r978.validClearGetTitle === 1 && r978.clearGetTitle === 13120, '978 titolo Fates Entwined');
check(JSON.stringify(r978.clearGetItemType) === '[2,3]' && r978.clearGetItemId[1] === 90056 && r978.clearGetItemNum[1] === 5,
  `978 premi: ${r978.clearGetItemType}`);
check(rows.filter((r) => r.onlyDrama).length === 1, 'solo la 978 senza mappa');
// Task 6 (ruling del controller): righe 1.1.3 con «Defeat X» (submissionIdType 1) su un nemico assente dallo stage JP
// (POI di stage_poi_oltre.json; la 555 con le 5 varianti 18300-18304) -> obiettivi della wiki, che coincidono con lo
// stage JP (= stage del 2016). Fake: 544 (18190) senza il 99, 555 senza il 10001 in nessuna variante.
{
  const stagePoi = {};
  for (const r of stage113) stagePoi[r.stageId] = { chests: [], enemies: [{ uid: 1, enemyId: 10001 }, { uid: 2, enemyId: 99 }] };
  stagePoi[18190].enemies = [{ uid: 1, enemyId: 10001 }];
  stagePoi[18300].enemies = [{ uid: 1, enemyId: 99 }];
  for (const v of [18301, 18302, 18303, 18304]) stagePoi[v] = { chests: [], enemies: [{ uid: 1, enemyId: 77 }] };
  const rw = buildRows(stageRows, { ...sources, stagePoi });
  const by = new Map(rw.map((r) => [r.id, r]));
  const r544 = by.get(544), r555 = by.get(555), r530w = by.get(530);
  check(JSON.stringify(r544.submissionRequire) === '[28,12,10]' && r544.submissionId[1] === 10001
    && JSON.stringify(r544.submissionRewardType) === '[14,14,5]' && r544.submissionName[2] === 'Complete without having to continue',
    `544: obiettivi della wiki (${r544.submissionRequire})`);
  // fix round 1: il client valuta il 12 per id (con submissionId nello slot conta solo
  // quell'id): un id solo non va per 5 varianti -> 7 «Complete within N turns», stesso N e stesso premio
  check(JSON.stringify(r555.submissionRequire) === '[28,7,10]' && JSON.stringify(r555.submissionNum) === '[0,2,0]'
    && r555.submissionName[1] === 'Complete within ${1:%d :#turn:#turns}' && r555.submissionIdType[1] === 0
    && r555.submissionId[1] === 0 && r555.submissionDataType[1] === 2 && r555.submissionRewardType[1] === 14
    && r555.stageId === 18300 && r555.branchType === 1, `555: obiettivi della wiki, 12 -> 7 (${r555.submissionRequire})`);
  // ogni variante 18300-18304 puo' compiere tutti e 3 gli obiettivi: nessun id che una variante non ha
  const doable = (row, sid) => [0, 1, 2].slice(0, row.validSubmission).every((i) => row.submissionIdType[i] !== 1
    || ((stagePoi[sid] || {}).enemies || []).some((e) => e.enemyId === row.submissionId[i]));
  check(Q555_VARIANTS.length === 5 && Q555_VARIANTS.every((v) => doable(r555, v)), '555: obiettivi compibili in ogni variante');
  check(JSON.stringify(rw.report.branchObjectives) === '[[555,2]]', `report.branchObjectives: ${JSON.stringify(rw.report.branchObjectives)}`);
  check(countStopgaps(rw) === rw.report.stopgapObjectives.length && countStopgaps(rows) === 1, `countStopgaps: ${countStopgaps(rows)}`);
  check(JSON.stringify(r530w.submissionRequire) === '[28,12,4]' && r530w.submissionId[2] === 99, '530: nemici nello stage, obiettivi 1.1.3');
  check(r544.clearGetItemNum[0] === 150 && r544.mapName === 'Mappa 1.1.3 544', '544: il resto della riga resta 1.1.3');
  check(JSON.stringify(rw.report.wikiObjectives) === '[544,555]', `report.wikiObjectives: ${rw.report.wikiObjectives}`);
  // senza POI (fonti vecchie) nessuna sostituzione
  check(JSON.stringify(byId.get(544).submissionRequire) === '[28,12,4]' && rows.report.wikiObjectives.length === 0,
    'senza stagePoi: obiettivi 1.1.3');
}

// stessa forma delle righe 1-525 (stesse chiavi, stesso ordine)
const KEYS = Object.keys(rows[0]).join();
check(rows.every((r) => Object.keys(r).join() === KEYS), 'tutte le righe con le stesse chiavi');
check(['stageBinId', 'onlyDrama', 'hideIcon', 'noPartner', 'validStopStage', 'branchType', 'hardmodeName',
  'combinedSubmissionFlag'].every((k) => k in rows[0]), 'campi della 5.0.1 presenti');

// --- Task 5: musiche e miniature dei mondi nuovi, righe world 11-14 ---------------------------------------------
// musica dei mondi senza righe 1-525 dai nomi JP text/audio (non piu' la missione precedente)
const bgmOf = (n) => [byId.get(n).bgmField, byId.get(n).bgmBattle, byId.get(n).bgmBoss].join();
check(bgmOf(600) === '501006005,501006006,501000130', `CD: bbs_cd_F/B (${bgmOf(600)})`);
check(bgmOf(700) === '501000710,501000720,501000130', `ED: ed_bgm_000001/2 (${bgmOf(700)})`);
check(bgmOf(880) === '501006048,501006049,501000130', `NL: nl_bgm (${bgmOf(880)})`);
check(bgmOf(890) === '501006052,501006053,501000130', `HD: hd_bgm (${bgmOf(890)})`);
check(bgmOf(872) === '501006047,501006047,501000130', `CS: central_station (${bgmOf(872)})`);
check(bgmOf(931) === '501006061,501006062,501000130', `SR: sr_bgm (${bgmOf(931)})`);
check(bgmOf(560) === '501000610,501000620,501000630', 'mondi con righe 1-525: musica della riga di riferimento');
// musica per missione (I-198, reference\world_schema\oltre525gm_per_quest.json, khwiki Notes 29): vale sulla regola del mondo
{
  const bgm = { 979: { bgmField: 501006057, bgmBattle: 501006057, bgmBoss: 501006057 },
    977: { bgmField: 501000810, bgmBattle: 501000820, bgmBoss: 501001010 },
    671: { bgmField: 501000510, bgmBattle: 501000520, bgmBoss: 501000130 },
    825: { bgmField: 501000410, bgmBattle: 501000420, bgmBoss: 501000130 } };
  const rb = buildRows(stageRows, { ...sources, bgm });
  const bo = (n) => { const r = rb.find((x) => x.id === n); return [r.bgmField, r.bgmBattle, r.bgmBoss].join(); };
  check(bo(979) === '501006057,501006057,501006057', `979 BBS_73_TheKey nelle tre colonne (${bo(979)})`);
  check(bo(977) === '501000810,501000820,501001010', `977 capo bgm_raid_0001, campo/battaglia db (${bo(977)})`);
  check(bo(671) === '501000510,501000520,501000130', `671 Underworld oc_bgm_001001/2 (${bo(671)})`);
  check(bo(825) === '501000410,501000420,501000130', `825 Coliseum oc_bgm_000001/2 (${bo(825)})`);
  check(bo(560) === bgmOf(560) && bo(880) === bgmOf(880) && bo(600) === bgmOf(600), 'missione assente dal file: regola del mondo');
  check(JSON.stringify(rb.filter((r) => ![979, 977, 671, 825].includes(r.id))) === JSON.stringify(rows.filter((r) => ![979, 977, 671, 825].includes(r.id))),
    'solo le 4 righe del file cambiano');
  check(bo(540) === bgmOf(540) && rb.find((x) => x.id === 978).bgmField === byId.get(978).bgmField, '526-555 e 978 mai toccate dal file');
}
// miniature: stage_select_ico_<worldId>_<area*10000 + zona*100 + variante> della prima stanza, se servita
const rowsT = buildRows(stageRows, { ...sources, thumbs: new Set(['11_10000', '4_10000', '1_10000']) });
const byT = new Map(rowsT.map((r) => [r.id, r]));
check(byT.get(880).thumbId === 10000 && byT.get(560).thumbId === 10000, `miniatura dalla stanza (${byT.get(880).thumbId}, ${byT.get(560).thumbId})`);
check(byT.get(890).thumbId === 20000 && byT.get(872).thumbId === 100, 'icona assente: prima icona JP del mondo');
check(byT.get(600).thumbId === 10000 && byT.get(560 + 1).thumbId === 10000, 'CD senza icona servita -> WORLD_THUMB');
check(byT.get(540).thumbId === 5000 + 540 && byT.get(978).thumbId === byId.get(978).thumbId, '526-555 e 978 invariate');
check(thumbForRoom('NL_0001_03_00') === 10300 && thumbForRoom('HD_0012_01_02') === 120102 && thumbForRoom('x') === null,
  'regola stanza -> thumbId');
{
  const d = mkTmp();
  const names = path.join(d, 'names.tsv');
  fs.writeFileSync(names, 'revision\t1\nimg/adventure/stage/stage_select_ico_1_40100.png\t5\naudio/1.akb\t2\n');
  fs.mkdirSync(path.join(d, 'img', 'adventure', 'stage'), { recursive: true });
  for (const f of ['stage_select_ico_12_20100.00360971.png', 'stage_select_ico_13_100.png', 'altro.png']) {
    fs.writeFileSync(path.join(d, 'img', 'adventure', 'stage', f), '');
  }
  const t = readThumbs(names, d);
  check(t && [...t].sort().join() === '12_20100,13_100,1_40100', `readThumbs: ${t && [...t]}`);
  check(readThumbs(path.join(d, 'manca.tsv'), path.join(d, 'manca')) === null, 'readThumbs senza fonti -> null');
}
// righe world 11-14 (D-C): worldName = prefisso delle stanze (-> wipe_<worldId>), sfondo servito
const worldRows = [
  { worldId: 1, worldName: 'DB', raidBackground: 'bg_DB1', instanceLwf: 'sDummy', instance: 'sDummy', xPos: 0, yPos: 0, rate: 10000,
    validParts: 2, partsId: ['RB_0003_00_00_eff_back', 'RB_0003_00_00_eff_front'], xPostion: [0, 0], yPostion: [0, 0] },
  { worldId: 8, worldName: 'ED', raidBackground: 'bg_ED1' }, { worldId: 10001, worldName: 'DB', raidBackground: 'bg_DB1' }];
{
  const w = buildWorldRows(worldRows);
  const by = new Map(w.map((r) => [r.worldId, r]));
  check(w.length === 7 && [11, 12, 13, 14].map((i) => by.get(i) && by.get(i).worldName).join() === 'NL,HD,CS,SR',
    `world 11-14 NL/HD/CS/SR (${w.map((r) => r.worldId)})`);
  check([11, 12, 13, 14].every((i) => Object.keys(by.get(i)).join() === Object.keys(worldRows[0]).join()
    && by.get(i).raidBackground === 'bg_DB1' && by.get(i).partsId.join() === worldRows[0].partsId.join()), 'righe come la 1, sfondo servito');
  check(JSON.stringify(w.filter((r) => r.worldId < 11 || r.worldId > 14)) === JSON.stringify(worldRows), 'righe world esistenti invariate');
  check(w.findIndex((r) => r.worldId === 11) === 2 && w[w.length - 1].worldId === 10001, 'dopo la 8, prima delle 10000+');
  check(JSON.stringify(buildWorldRows(w)) === JSON.stringify(w), 'buildWorldRows idempotente');
}
// tendine originali dei mondi nuovi servite (import_originals.py)
const tsv = fs.readFileSync(path.join(__dirname, '..', 'recon', 'tools', 'originals.tsv'), 'utf8');
check(/^img\/wipe\/wipe_1\[1-4\]\.png\tjp/m.test(tsv), 'originals.tsv: wipe_11..14 dal JP');
// notizia «Story Quests 526-979» (IMPORTANT) fra le notizie del server
{
  const { NOTICES } = require('./routes-info-album');
  const nt = NOTICES.find((x) => x.title === 'Story Quests 526-979');
  const t = nt ? nt.body.join(' ') : '';
  check(nt && nt.tag === 'IMPORTANT' && NOTICES.indexOf(nt) === 0, 'notizia IMPORTANT in cima');
  // obiettivi coi codici originali e trofei 61-63 (21-10): il paragrafo dei tappabuchi solo se il master servito ne ha
  // ancora, niente paragrafo dei Trophy
  let master = [];
  try { master = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'stage.json'), 'utf8')); } catch { /* assente */ }
  const nStop = countStopgaps(master);
  check(nStop ? t.includes(`${nStop} mission objectives`) : !/mission objectives/.test(t), `notizia: ${nStop} tappabuchi (dal master)`);
  check(!/Trophy/.test(t), 'notizia: niente paragrafo dei Trophy');
  check(/Quest 555/.test(t) && /Complete within 2 turns/.test(t), 'notizia: obiettivi della 555');
  for (const re of [/617/, /661/, /250/, /62/, /Stroke of Midnight/, /Fairy Stars/, /Bad Guy Breaker/, /595/, /683/, /880/,
    /978/, /What Comes After/, /reconstructed/, /Quests 876-979/, /level of the quest/]) check(re.test(t), `notizia: ${re}`);
}

// --- patch: idempotente, dopo la 525, KHUX_STORY_OLTRE=0 lo spegne -------------------------------------------
const dir = mkTmp();
fs.writeFileSync(path.join(dir, 'stage.json'), JSON.stringify(stageRows));
fs.writeFileSync(path.join(dir, 'world.json'), JSON.stringify(worldRows));
for (const [f, v] of [['enemy', enemies], ['title', titles], ['medal', medals], ['keyblade', keyblades], ['theater', theater],
  ['skill', []]]) fs.writeFileSync(path.join(dir, f + '.json'), JSON.stringify(v));
const src = { stage113, wiki, wikiRaw, oltre, dramas, bgm: { 979: { bgmField: 501006057, bgmBattle: 501006057, bgmBoss: 501006057 } } };
patch(dir, src);
const once = fs.readFileSync(path.join(dir, 'stage.json'), 'utf8');
patch(dir, src);
const twice = fs.readFileSync(path.join(dir, 'stage.json'), 'utf8');
check(once === twice, 'patch due volte = stesso file');
check(JSON.parse(twice).find((r) => r.id === 979).bgmBoss === 501006057, 'patch: musica per missione scritta nel master');
const worldOut = JSON.parse(fs.readFileSync(path.join(dir, 'world.json'), 'utf8'));
check(worldOut.map((r) => r.worldId).join() === '1,8,11,12,13,14,10001', `patch: world.json ${worldOut.map((r) => r.worldId)}`);
const out = JSON.parse(twice);
check(out.length === stageRows.length + 454, `patch: ${out.length} righe`);
check(out[1].id === 525 && out[2].id === 526 && out[455].id === 979 && out[456].stageId === 991001,
  'righe nuove subito dopo la 525, prima dei tour');
check(JSON.stringify(out.filter((r) => !(r.id >= 526 && r.id <= 979))) === JSON.stringify(stageRows), 'righe esistenti invariate');
process.env.KHUX_STORY_OLTRE = '0';
const dir2 = mkTmp();
fs.writeFileSync(path.join(dir2, 'stage.json'), JSON.stringify(stageRows));
fs.writeFileSync(path.join(dir2, 'world.json'), JSON.stringify(worldRows));
patch(dir2, src);
check(fs.readFileSync(path.join(dir2, 'stage.json'), 'utf8') === JSON.stringify(stageRows)
  && fs.readFileSync(path.join(dir2, 'world.json'), 'utf8') === JSON.stringify(worldRows), 'KHUX_STORY_OLTRE=0: nessuna modifica');
delete process.env.KHUX_STORY_OLTRE;

// fonti obbligatorie: senza le 30 righe 1.1.3 (526-555) errore, mai righe generate al posto degli originali
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
check(throws(() => buildRows(stageRows, { ...sources, stage113: stage113.slice(1) }), /29 righe 18010-18300 su 30/),
  'buildRows: 1.1.3 incompleta -> errore');
check(throws(() => buildRows(stageRows, { ...sources, stage113: [] }), /0 righe/), 'buildRows: 1.1.3 assente -> errore');
const dir3 = mkTmp();
fs.writeFileSync(path.join(dir3, 'stage.json'), JSON.stringify(stageRows));
check(throws(() => patch(dir3, { ...src, stage113: [] }), /1\.1\.3/)
  && fs.readFileSync(path.join(dir3, 'stage.json'), 'utf8') === JSON.stringify(stageRows), 'patch: 1.1.3 assente -> errore, file intatto');
for (const k of ['KHUX_BGM_OLTRE', 'KHUX_STAGE_113', 'KHUX_WIKI_QUESTS', 'KHUX_OLTRE525', 'KHUX_WIKI_ALL', 'KHUX_STAGE_POI_OLTRE']) {
  const old = process.env[k];
  process.env[k] = path.join(dir3, 'manca.json');
  check(throws(() => defaultSources(), /fonte obbligatoria .*manca\.json/), `${k} assente -> errore col percorso`);
  if (old === undefined) delete process.env[k]; else process.env[k] = old;
}

// --- Task 6: server.js con le righe 526-979 (master finto = `out` del patch sopra, salvataggio finto) --------------
{
  const mdir = mkTmp(), sdir = mkTmp();
  fs.writeFileSync(path.join(mdir, 'stage.json'), JSON.stringify(out));
  const SAVE = path.join(sdir, 'player.json');
  // salvataggio vecchio: creato ma senza Unione (unionId 0) -> la 555 caricherebbe mappoi_stg18299 (Review Focus 2)
  fs.writeFileSync(SAVE, JSON.stringify({ name: 'Prova', created: true, unionId: 0, tutorialPhase: 995, clockVersion: 2,
    clearMissions: {}, stageScores: {}, lux: 0, freeStone: 0 }));
  Object.assign(process.env, { KHUX_SAVE: SAVE, KHUX_MASTER_DIR: mdir });
  for (const k of ['KHUX_REAL_NOW', 'KHUX_SERVER_TIME', 'KHUX_NEWCOMER', 'KHUX_START_STAGE']) delete process.env[k];
  const log = console.log, warn = console.warn;
  const quiet = (fn) => { console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = log; console.warn = warn; } };
  const { _test: t } = quiet(() => require('./server'));
  const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
  const p = t.player;
  const sidOf = (n) => out.find((r) => r.id === n && r.stageKind === 1).stageId;
  const clearUpTo = (n) => { p.stageScores = {}; for (const r of out) if (r.stageKind === 1 && r.id <= n) p.stageScores[r.stageId] = 1; };
  // Review Focus 2: unionId 1-5 garantito prima di servire la 555 (al caricamento e in userDetail)
  check(p.unionId >= 1 && p.unionId <= 5, `unionId del salvataggio vecchio portato a 1-5: ${p.unionId}`);
  check(JSON.parse(fs.readFileSync(SAVE, 'utf8')).unionId === p.unionId, 'unionId corretto salvato');
  p.unionId = 0;
  const ud = quiet(() => t.userDetailData());
  check(ud.unionId >= 1 && ud.unionId <= 5 && p.unionId === ud.unionId, `userDetail: unionId ${ud.unionId}`);
  p.unionId = 3;
  check(quiet(() => t.userDetailData()).unionId === 3, 'unionId valido invariato');
  // Review Focus 1: 525 finite -> newStageId 526 (non il tour); 979 finite -> il tour dopo
  clearUpTo(525);
  let r = call(t.respondStageList);
  check(r.newStageId === sidOf(526), `525 finite -> newStageId ${r.newStageId} (526 = ${sidOf(526)})`);
  check(r.stories.length === 3 && r.stories[2].stageId === sidOf(526) && r.stories[2].playStatus === 0, 'elenco: 524, 525, 526 nuova');
  clearUpTo(977);
  check(call(t.respondStageList).newStageId === 39158, '977 finite -> la 978 (solo filmato)');
  clearUpTo(979);
  r = call(t.respondStageList);
  check(r.newStageId === 991001, `979 finite -> il tour 991001 dopo la storia (${r.newStageId})`);
  // I-201: completata = playStatus 2 anche senza obiettivi; tutto completato (anche i tour) -> newStageId 0
  check(r.stories.filter((x) => x.stageId !== 991001).every((x) => x.playStatus === 2), 'storia superata: playStatus 2');
  p.clearMissions[sidOf(979)] = [2, 3];
  r = call(t.respondStageList);
  const e979 = r.stories.find((x) => x.stageId === sidOf(979));
  check(e979.playStatus === 2 && JSON.stringify(e979.clearMissionIds) === '[2,3]', `979 con 2 obiettivi: ${JSON.stringify(e979)}`);
  for (const x of out) if (x.stageKind === 1) p.stageScores[x.stageId] = 1;
  r = call(t.respondStageList);
  check(r.newStageId === 0 && r.stories.every((x) => x.playStatus === 2), `tutto superato: newStageId ${r.newStageId}`);
  delete p.clearMissions[sidOf(979)];
  // storia superata fino alla 979 (lastStoryStageId, Beginner 30, shop): non piu' ferma alla 525
  clearUpTo(600);
  check(quiet(() => t.stageNumber(t.lastStoryStageId())) === 600, `storia fino alla 600: ${quiet(() => t.stageNumber(t.lastStoryStageId()))}`);
  check(t.MISSION_DERIVED[30]({ targetId: [600] }) === 1 && t.MISSION_DERIVED[30]({ targetId: [601] }) === 0, 'Beginner 30 oltre la 525');
  clearUpTo(979);
  check(quiet(() => t.stageNumber(t.lastStoryStageId())) === 979, 'storia fino alla 979 (non i tour)');
  // Q978 (onlyDrama, nessun POI): /stage/start e /stage/clear senza mappa, poi la 979
  clearUpTo(977);
  delete t.STAGE_POI[39158];
  p.ap = 50; p.apTime = Date.now();
  const st = call(t.respondStageStart, { stageId: 39158, supportUserId: 0, userKeybladeId: 1 });
  check(st && st.startStageData.stageId === 39158 && st.userEnemyDropItems.length === 0 && st.userTreasures.length === 0,
    '978: /stage/start senza POI');
  const stone = p.freeStone || 0;
  const cl = call(t.respondStageClear, { clearMissionIds: [], getPoint: { lux: 0, money: 0, exp: 0 }, getEnemyDropItems: [] });
  check(cl && cl.firstClearFlag === 1 && 39158 in p.stageScores, '978: /stage/clear registra la missione');
  check((p.freeStone || 0) - stone === 1000, `978: 1000 jewel del primo completamento (${(p.freeStone || 0) - stone})`);
  check(call(t.respondStageList).newStageId === sidOf(979), '978 finita -> 979');
  // fix round 1: /stage/clear senza /stage/start (se il client salta lo start della 978): currentStageId e' la 977
  // gia' finita, nessuno stage in corso e la prossima missione e' onlyDrama -> si registra la 978
  clearUpTo(977);
  call(t.respondStageStart, { stageId: sidOf(977) });
  call(t.respondStageClear, { clearMissionIds: [], getPoint: { lux: 0 } });
  check(!(39158 in p.stageScores), 'clear dopo lo start della 977: la 977, non la 978');
  const fb = call(t.respondStageClear, { clearMissionIds: [], getPoint: { lux: 0 } });
  check(fb && fb.firstClearFlag === 1 && 39158 in p.stageScores, '978: clear senza start -> registrata la 978');
  clearUpTo(976);
  p.currentStageId = sidOf(976);
  call(t.respondStageClear, { clearMissionIds: [], getPoint: { lux: 0 } });
  check(!(39158 in p.stageScores) && !(sidOf(977) in p.stageScores), 'clear senza start, prossima non onlyDrama: nessun credito in piu\'');
  // Q555 (branchType 1): il client gioca 18300 + unionId - 1; la variante vale la riga 18300 (stage finito, premi,
  // obiettivi), drop dal POI della variante ricevuta (Task 3: unione delle uid sotto ognuna delle 18300-18304)
  clearUpTo(554);
  p.lastClearStageId = sidOf(554); // avanza solo: la 978 giocata sopra la terrebbe
  t.STAGE_POI[18302] = { chests: [{ uid: 9, reward: 1 }], enemies: [{ uid: 1, enemyId: 10228, reward: 1 }, { uid: 3, enemyId: 10228, reward: 1 }] };
  const s5 = call(t.respondStageStart, { stageId: 18302, supportUserId: 0, userKeybladeId: 1 });
  check(s5 && s5.startStageData.stageId === 18302 && s5.userEnemyDropItems.map((d) => d.uniqueEnemyId).join() === '1,2,3',
    `555 variante 18302: drop dal suo POI (${s5 && s5.userEnemyDropItems.map((d) => d.uniqueEnemyId)})`);
  const stone5 = p.freeStone || 0;
  const c5 = call(t.respondStageClear, { clearMissionIds: [3], getPoint: { lux: 0 }, getEnemyDropItems: [] });
  check(c5 && c5.firstClearFlag === 1 && 18300 in p.stageScores && !(18302 in p.stageScores), '555 variante: stage 18300 finito');
  check((p.freeStone || 0) - stone5 === 150 && JSON.stringify(p.clearMissions[18300]) === '[3]', '555 variante: premi e obiettivi della riga 18300');
  check(call(t.respondStageList).newStageId === sidOf(556), '555 (variante) finita -> 556');
  check(p.lastClearStageId === 18300, `lastClearStageId della riga: ${p.lastClearStageId}`);
  check(call(t.respondStageStart, { stageId: 18304 }).startStageData.clearMissionIds.join() === '3', '555 variante: obiettivi gia\' fatti');
}

// --- dati veri: riga 555 del master servito contro i nemici delle 5 varianti (stage_poi_oltre.json del Task 3) -------
{
  let m = null, poi = null;
  try {
    m = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'stage.json'), 'utf8')).find((r) => r.id === 555 && r.stageKind === 1);
    poi = JSON.parse(fs.readFileSync(process.env.KHUX_STAGE_POI_OLTRE
      || 'D:\\Progetto_Restauro_KH_UX\\stage_gen\\orig_stages_oltre\\stage_poi_oltre.json', 'utf8'));
  } catch { /* assenti */ }
  if (!m || !poi) console.log('SKIP dati veri 555: master o stage_poi_oltre.json assenti');
  else {
    for (const v of Q555_VARIANTS) {
      const ids = new Set(((poi[v] || {}).enemies || []).map((e) => e.enemyId));
      const bad = [0, 1, 2].slice(0, m.validSubmission).filter((i) => m.submissionIdType[i] === 1 && !ids.has(m.submissionId[i]));
      check(ids.size > 0 && bad.length === 0, `master 555, variante ${v}: obiettivi ${bad.map((i) => i + 1)} su nemici assenti`);
    }
  }
}

for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
check(tmpDirs.every((d) => !fs.existsSync(d)), 'cartelle temporanee tolte');

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('test-story-oltre: ok');
