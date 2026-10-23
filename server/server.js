'use strict';
/**
 * Server privato KHUX - fase B.
 *
 * Obiettivo di questa fase: rispondere al bootstrap e all'handshake di sessione,
 * e soprattutto REGISTRARE TUTTO. Non conosciamo la superficie REST del gioco: gli
 * endpoint principali non sono enumerabili dalle stringhe del binario. Il client,
 * quando parla con noi, ce la racconta da solo.
 *
 * Contratto ricavato dal binario (vedi PHASE-A.md):
 *   bootstrap -> { maintenance, url, nativeToken }
 *   sessione  -> { nativeSessionId, sharedSecurityKey }
 *   header successivi: X-HTTP-USER-TOKEN: <token>
 *
 * Avvio:  node server/server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const codec = require('./khux-codec');
const { startDns } = require('./dns');
const { makeMulti, routeMulti } = require('./multi');
const { makeKeybladeEvo, routeKeybladeEvo } = require('./keyblade-evo');
const { makeGuiltBurst } = require('./guilt-burst');
const medalGuilt = require('./medal-guilt');
const medalTrait = require('./medal-trait');
const loginBonus = require('./login-bonus');
const infoAlbum = require('./routes-info-album');
const legalPages = require('./legal-pages');
const { routePartyRanking, respondPartyRanking } = require('./routes-party-ranking');
const medalSkill = require('./medal-skill');
const gachaData = require('./gacha-data');
const gacha = require('./gacha');
const gachaSeasons = require('./gacha-seasons');
const medalBoost = require('./medal-boost');
// Pet / 6° slot (server/pet.js): KHUX_PET=1, default spento
const { routePet, makePet, petBaseSlotMedal, setPetBaseSlotMedal, ENABLED: PET_ENABLED } = require('./pet');

// ---------------------------------------------------------------------------
// Configurazione
// ---------------------------------------------------------------------------
const HTTP_PORT = Number(process.env.KHUX_HTTP_PORT || 80);
const HTTPS_PORT = Number(process.env.KHUX_HTTPS_PORT || 443);
const CERT_DIR = path.join(__dirname, 'certs');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'requests.ndjson');
const DNS_LOG_FILE = path.join(LOG_DIR, 'dns.ndjson');

// DNS: l'IP verso cui dirottare e i domini da dirottare.
const DNS_ENABLED = process.env.KHUX_DNS !== '0';
const DNS_PORT = Number(process.env.KHUX_DNS_PORT || 53);
const DNS_UPSTREAM = process.env.KHUX_DNS_UPSTREAM || '1.1.1.1';
const HIJACK = (process.env.KHUX_HIJACK || 'sqex-bridge.jp,kingdomhearts.com,square-enix.com')
  .split(',').map((s) => s.trim()).filter(Boolean);

// La url che consegniamo al client nel bootstrap: deve essere raggiungibile DAL
// TELEFONO, quindi l'IP della macchina sulla rete locale, non localhost.
const PUBLIC_URL = process.env.KHUX_PUBLIC_URL || 'https://127.0.0.1';

// Dove mandare la richiesta di sessione. Per nome, non per IP: l'host di
// bootstrap risolve gia' su di noi ed e' coperto dal certificato.
const SESSION_BASE = process.env.KHUX_SESSION_BASE || 'https://api-s.sp.kingdomhearts.com';
// Indirizzo http dello stesso host (pagine WebView e immagini dello Shop): https: la WebView rifiuta il certificato
const WEB_BASE = SESSION_BASE.replace(/^https:/, 'http:');

// Stato di sessione. La sharedSecurityKey la scegliamo noi: e' il punto in cui
// prendiamo il controllo dell'intero canale cifrato.
const SESSION = {
  nativeSessionId: crypto.randomUUID(),
  sharedSecurityKey: codec.newSecurityKey(),
  nativeToken: crypto.randomBytes(24).toString('hex'),
};

fs.mkdirSync(LOG_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
let seq = 0;

function logRequest(entry) {
  entry.seq = ++seq;
  entry.ts = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

  const mark = entry.handled ? '\x1b[32m[ok]\x1b[0m' : '\x1b[33m[?]\x1b[0m ';
  console.log(`${mark} #${entry.seq} ${entry.method} ${entry.url}`);
  for (const [k, v] of Object.entries(entry.headers)) {
    if (/token|auth|session|key|user-agent|content-type/i.test(k)) {
      console.log(`      ${k}: ${v}`);
    }
  }
  if (entry.bodyJson) {
    console.log('      body(json):', JSON.stringify(entry.bodyJson).slice(0, 400));
  } else if (entry.bodyDecoded) {
    console.log(`      body(decifrato, iv=${entry.ivStrategy}):`,
      JSON.stringify(entry.bodyDecoded).slice(0, 400));
  } else if (entry.bodyText) {
    console.log('      body(testo):', entry.bodyText.slice(0, 300));
  } else if (entry.bodyBase64) {
    console.log(`      body(opaco, ${entry.bodyBytes} byte):`, entry.bodyBase64.slice(0, 120));
  }
}

// ---------------------------------------------------------------------------
// Parsing del corpo: proviamo in ordine JSON, payload cifrato, testo, opaco
// ---------------------------------------------------------------------------
function parseBody(buf, headers) {
  const out = { bodyBytes: buf.length };
  if (!buf.length) return out;

  let data = buf;
  if (/gzip/i.test(headers['content-encoding'] || '')) {
    try { data = zlib.gunzipSync(buf); } catch { /* lo teniamo grezzo */ }
  }
  data = codec.maybeGunzip(data);

  if (codec.looksLikeJson(data)) {
    out.bodyJson = JSON.parse(data.toString('utf8'));
    return out;
  }

  const asText = data.toString('utf8');
  // Dopo la sessione il client manda form urlencoded con un solo campo:
  // v=<base64 di AES-256-CBC(JSON), IV a zero>.
  const form = /^v=/.test(asText) ? new URLSearchParams(asText).get('v') : null;
  const dec = codec.decode((form || asText).trim(), SESSION.sharedSecurityKey);
  if (dec.ok) {
    out.bodyDecoded = dec.json;
    out.ivStrategy = dec.strategy;
    return out;
  }
  out.decodeAttempts = dec.attempts;

  if (/^[\x20-\x7e\s]*$/.test(asText) && asText.trim()) {
    out.bodyText = asText;
  } else {
    out.bodyBase64 = data.toString('base64');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rotte note
// ---------------------------------------------------------------------------
function route(url) {
  const p = url.split('?')[0].toLowerCase();
  if (p === '/web/passive') return 'passivepage';
  if (p === '/gacha/list') return 'gachalist';
  if (p === '/gacha/draw') return 'gachadraw';
  if (p.startsWith('/web/gacha/')) return 'gachaweb'; // catalogo, dettagli, odds, immagini dei banner
  if (p.includes('system/status')) return 'status';
  if (p.includes('system/login')) return 'login';
  if (p.includes('system/coppa')) return 'coppa';
  if (p.includes('system/resourcesize')) return 'resourcesize';
  if (p.includes('system/resourceev')) return 'resourceev';
  if (p.includes('system/resource')) return 'resource';
  if (p.startsWith('/resource/')) return 'resourcefile';
  if (p.includes('tutorial/status')) return 'tutorialstatus';
  if (p.includes('khux/login')) return 'khuxlogin';
  if (p === '/login/bonus') return 'loginbonus';
  if (p === '/user/create') return 'usercreate';
  if (p === '/user/keyblade') return 'userkeyblade';
  if (p.startsWith('/user/keyblade/update')) return 'keybladeupdate';
  if (p === '/user/deck') return 'userdeck';
  if (p === '/keyblade/subslot') return 'kbsubslot';
  if (routeKeybladeEvo(p)) return routeKeybladeEvo(p);
  if (routePet(p)) return routePet(p);
  if (p === '/user/medal') return 'usermedal';
  if (p === '/user/skill') return 'userskill';
  if (p === '/user/detail') return 'userdetail';
  if (p === '/user/medal/sell') return 'medalsell';
  if (p === '/user/medal/lock') return 'medallock';
  if (p === '/user/medal/enhance') return 'medalenhance';
  if (p === '/user/medal/shuffleskill') return 'medalshuffle';
  if (p === '/user/medal/evolve') return 'medalevolve';
  if (p === '/user/medal/remove') return 'medalremove';
  if (p === '/user/material/sell') return 'materialsell';
  if (p === '/moogleshop/buy') return 'moogleshopbuy';
  if (p === '/shop/medal/max') return 'medalmax';
  if (p === '/union/change') return 'unionchange';
  if (p === '/moogleshop/list') return 'moogleshoplist';
  if (/^\/stage\/\d+$/.test(p)) return 'stagelist';
  if (p === '/stage/hard') return 'stagehard'; // Proud Mode (I-200)
  if (p === '/stage/achievements') return 'stageachievements'; // categorie di Quests (I-037)
  if (p === '/stage/start') return 'stagestart';
  if (p === '/stage/continue' || p === '/stage/retire') return 'stagecontinue';
  if (p === '/stage/clear') return 'stageclear';
  if (p === '/shop/ap/recover') return 'aprecover';
  if (p === '/stage/event') return 'stageevent';
  if (p === '/stage/pickup') return 'stagepickup';
  if (p === '/user/notice') return 'usernotice';
  if (p === '/colosseum') return 'colosseum';
  if (p === '/user/point' || p === '/user/sphere/reset') return 'userpoint';
  if (p === '/user/stone') return 'userstone';
  if (p === '/user/present') return 'userpresent';
  if (p === '/user/present/receive') return 'presentreceive';
  if (p === '/user/material') return 'usermaterial';
  if (p === '/campaign') return 'campaign';
  if (p === '/ranking/reward/check') return 'rankingrewardcheck';
  if (routePartyRanking(p)) return routePartyRanking(p);
  // Coliseum PvP (azioni 194-205): respondPvp
  // /pvp/keyblade resta alla risposta generica (com'era prima del 14-10): con la risposta completa di pvp
  // (userDecks) ogni battaglia andava in crash creando l'HUD, con solo ret «200 ERROR :196»
  if (p !== '/pvp/keyblade' && (p === '/pvp' || p.startsWith('/pvp/') || p.startsWith('/ranking/pvp'))) return 'pvp'; // anche pvpparade
  if (p.startsWith('/multi/')) return routeMulti(p); // Union Cross: server/multi.js
  if (p.startsWith('/raid/list')) return 'raidlist';
  if (p.startsWith('/raid/reward')) return 'raidreward';
  if (p === '/user/support' || p === '/user/support/update') return 'usersupport';
  if (p === '/stage/support/list') return 'supportlist';
  if (p === '/user/avatar' || p === '/user/avatar/all' || p === '/user/avatar/parts') return 'useravatar';
  if (p === '/user') return 'user';
  if (p === '/user/profile') return 'userprofile';
  if (p === '/mypage') return 'mypage';
  if (p === '/user/birthday') return 'userbirthday';
  if (p === '/user/title') return 'usertitle';
  if (p === '/user/mission/list') return 'missionlist';
  if (p === '/user/mission') return 'usermission';
  if (p === '/web/beginner') return 'beginnerpage';
  if (p === '/system/information/list') return 'infolist';
  if (p.startsWith('/system/information/list/')) return 'infopopup';
  if (p === '/web/notices') return 'noticespage';
  if (p === '/web/notices/shown') return 'noticesshown';
  if (p === '/web/agreement') return 'agreementpage';
  if (p === '/web/license') return 'licensepage';
  if (p.startsWith('/user/album/') && !p.startsWith('/user/album/challenge')) return 'album';
  if (p === '/user/sphere') return 'spherelist';
  if (p === '/user/sphere/update') return 'sphereupdate';
  if (p.startsWith('/user/sphere/check')) return 'spherecheck';
  if (p === '/user/mission/receive') return 'missionreceive';
  if (p === '/user/update') return 'userupdate';
  if (p === '/user/playstyle/update' || p === '/user/title/update') return 'userdetailupdate';
  if (p.includes('system/master')) return 'master';
  if (p.startsWith('/master/')) return 'masterfile';
  if (p.includes('session')) return 'session';
  if (p.includes('login/token')) return 'bootstrap';
  if (p.includes('bootstrap') || p.includes('startup') || p.includes('init')) return 'bootstrap';
  return null;
}

function respondStatus(res) {
  // PUT /system/status, richiesta 251 (0xfb). Il client controlla:
  //  - maintenance deve mancare (o essere null), altrimenti ramo manutenzione;
  //  - appStatus.{mode,current,server} devono essere stringhe, altrimenti errore;
  //  - server vuoto = resta sul dominio predefinito e passa al bootstrap. Pieno,
  //    e' un URL cifrato (chiave da systemStatusUpdateResult+current+mode) che
  //    sostituisce il dominio: non ci serve.
  send(res, 200, {
    appStatus: { mode: '', current: '', server: '' },
  });
}

// Ora del server (docs/superpowers/specs/2026-10-16-orologio-finto-design.md): data reale nel suo
// mese gemello (clock.js), con lo scostamento fissato a /khux/login (player.clockOffset) perche' il
// client fa scorrere da solo l'ora ricevuta al login. KHUX_SERVER_TIME (prove): data finta fissa
// all'avvio del server, come prima.
const clock = require('./clock');
const STARTED_AT = Date.now();
const REVISION = Number(process.env.KHUX_REVISION || 0); // BASE della revisione del master
// KHUX_BENCH_ENEMY_ATK=N (solo banco, run-server.ps1 -EnemyAtk N): attacco dei nemici della tabella
// enemy x N nel master servito, per provare skill come Second Chance (serve finire a terra). Il client
// prende le statistiche dei nemici dal master, non dalle risposte di battaglia. La revisione servita
// sale di 90000 + N: il client riscarica il master a ogni revisione diversa, anche piu' bassa
// (docs/notes/server.md), quindi spenta l'opzione torna da solo al master normale.
const BENCH_ENEMY_ATK = Math.max(1, Math.trunc(Number(process.env.KHUX_BENCH_ENEMY_ATK) || 1));
// KHUX_BENCH_SKILL_PROB=P (solo banco, run-server.ps1 -SkillProb P, 0-100): probabilita' di attivazione di
// tutte le skill delle medaglie fissata a P% nel master servito (invokeProb P*100, invokeProbPerLv 0), per
// misurare l'effetto (Attack Boost: stesso colpo con 0 e 100). Revisione servita +80000 + P + 1.
const BENCH_SKILL_PROB = /^\d+$/.test(process.env.KHUX_BENCH_SKILL_PROB || '') ? Math.min(100, Number(process.env.KHUX_BENCH_SKILL_PROB)) : null;
// KHUX_REAL_NOW (prove al banco): l'ora reale parte da quell'istante all'avvio del server
// (una data che non si legge ferma subito l'avvio: meglio che un orologio NaN a banco acceso)
if (process.env.KHUX_REAL_NOW && !Number.isFinite(Date.parse(process.env.KHUX_REAL_NOW))) {
  throw new Error(`KHUX_REAL_NOW non valido: «${process.env.KHUX_REAL_NOW}» (serve una data ISO, es. 2026-10-19T07:55:00Z)`);
}
const REAL_SHIFT = process.env.KHUX_REAL_NOW ? Date.parse(process.env.KHUX_REAL_NOW) - STARTED_AT : 0;
const realNow = () => Date.now() + REAL_SHIFT;
function clockOffset() {
  if (process.env.KHUX_SERVER_TIME) return Date.parse(process.env.KHUX_SERVER_TIME) - STARTED_AT;
  return Number.isFinite(player.clockOffset) ? player.clockOffset : clock.twinOffset(realNow());
}
function serverTime() {
  return serverTimeAt(realNow());
}
// L'ora del server corrispondente a un istante reale (ms), nel formato che il client si aspetta.
function serverTimeAt(realMs) {
  return clock.fakeString(realMs, clockOffset());
}
// istante reale salvato (numero) -> data finta; stringhe dei salvataggi vecchi lasciate com'erano
const outTime = (v, fallback) => (typeof v === 'number' ? serverTimeAt(v) : v || fallback);

/**
 * L'involucro "ret" di ogni risposta di gioco. Il client
 * valida i campi in quest'ordine, e al primo tipo sbagliato tratta la risposta
 * come errore: i booleani devono essere booleani, i numeri interi.
 */
function ret() {
  return {
    isMaintenance: false,
    isPhotonMaintenance: false,
    isKhuxMaintenance: false,
    isDarkMaintenance: false,
    sessionTO: false,
    isNewDayPeriod: 0,
    isRetry: false,
    versionApp: '4.3.1',
    // Revisioni di risorse e dati master dichiarate dal server. Il client le
    // confronta con le sue (0 su un'installazione vergine) per decidere cosa
    // scaricare: con tutto a 0 crede di essere aggiornato.
    // Per le risorse: l'ultima versione presente in resource_data (0 se nessuna).
    // Dopo un'installazione riuscita il client dichiara quella revisione; se il
    // server ne dichiarasse un'altra, riproporrebbe il download a ogni avvio.
    versionRes: latestResourceVersion(),
    versionResLow: latestResourceVersion(),
    // master: la revisione della sessione (fissata a /system/login), non quella del momento: se una
    // scadenza passa a gioco aperto il client, vista una versionDat diversa, torna al titolo con
    // «Game data has been updated» (banco 16-10, docs/notes/server.md#orologio)
    versionDat: sessionRevision(),
    commonVersionDat: sessionRevision(),
    darkVersionRes: REVISION,
    darkVersionDat: sessionRevision(),
    functionFlags: 0,
    serverTime: serverTime(),
    // "error" (con "viewUrl") e "isCommunicationMaintenance" sono facoltativi
  };
}

// Le stringhe della risposta a /system/login, nell'ordine in cui il client le legge:
// link a pagine web (supporto, termini, store, social...). Il
// client le pretende tutte, come stringhe; vuote bastano per proseguire.
const LOGIN_LINKS = [
  'support', 'register', 'update', 'help', 'staff', 'agreement', 'license',
  'shikin', 'tokutei', 'store', 'odds', 'petOdds', 'appUpdate', 'officialSite',
  'officialTwitter', 'movie', 'beginnersGuide', 'passiveSettingList', 'darkHelp',
  'darkOdds', 'officialTwitterCustom',
];

// "data" della risposta di login: almeno 4 stringhe
// Base64 che il client si aspetta di 8, 32, 32 e 32
// byte. Hanno l'aria di un seme e di tre chiavi da 256 bit. Il QUARTO e' la chiave
// dei record md5/size degli indici delle risorse scaricate: deve essere quella con cui
// l'indice e' stato cifrato in fase di build, quindi e' derivata allo stesso modo
// (o data in esadecimale con KHUX_RESOURCE_KEY). Gli altri tre, casuali ma
// stabili per tutta la vita del server: a cosa servano non e' ancora chiaro.
const RESOURCE_KEY = process.env.KHUX_RESOURCE_KEY
  ? Buffer.from(process.env.KHUX_RESOURCE_KEY, 'hex')
  : crypto.createHash('sha256').update('khux-resource-index').digest();
const LOGIN_DATA = [8, 32, 32].map((n) => crypto.randomBytes(n).toString('base64'))
  .concat(RESOURCE_KEY.toString('base64'));

function respondLogin(res) {
  // POST /system/login, azione 251: corpo cifrato {length, digest, ruv,
  // deviceType, systemVersion, appVersion}. length e digest descrivono
  // libcocos2dcpp.so: il server originale ci controllava l'integrita' del client.
  // La risposta deve contenere systemLogin e data; poi i link (LINK_FIELDS).
  startSession(); // revisione del master fissa fino al prossimo login
  if (player.created) savePlayer();
  const body = {
    ret: ret(),
    // Un nuovo giocatore NON scarica le risorse all'avvio: fa il
    // tutorial con la grafica gia' installata (APK + OBB). KHUX_NEWCOMER=0
    // presenta un giocatore esistente, l'unico che arriva all'azione 28.
    systemLogin: { newcomerKhux: isNewcomer(), newcomerDark: isNewcomer() },
    data: LOGIN_DATA,
  };
  for (const k of LOGIN_LINKS) body[k] = '';
  body.passiveSettingList = `${SESSION_BASE.replace(/^https:/, 'http:')}/web/passive`; // «Passive Effects» (I-065): in https la WebView rifiuta il certificato
  // «Beginner's Guide» della home: il client apre una WebView (titolo testo 106210101)
  // sull'URL beginnersGuide; vuoto = finestra vuota. Pagina nostra, /web/beginner
  body.beginnersGuide = `${SESSION_BASE.replace(/^https:/, 'http:')}/web/beginner`;
  // Legal Information: User Agreement e License, WebView (server/legal-pages.js)
  body.agreement = `${SESSION_BASE.replace(/^https:/, 'http:')}/web/agreement`;
  body.license = `${SESSION_BASE.replace(/^https:/, 'http:')}/web/license`;
  // Draw Odds dello Shop (pulsante su ogni piastra, link odds): il client
  // accoda il drawMedalTypeId della piastra all'url (banco 16-10: GET /web/gacha/odds9001), da qui la «/»
  body.odds = `${WEB_BASE}/web/gacha/odds/`;
  send(res, 200, body);
}

function respondCoppa(res) {
  // GET /system/coppa, azione 26: un oggetto "misc" di
  // interi senza segno, con chiavi numeriche. Il significato dei codici non e'
  // ancora noto; 0 basta perche' il client li accetti.
  const misc = {};
  for (const k of ['116', '804', '900', '901', '902', '903', '904', '905', '906', '907']) {
    misc[k] = 0;
  }
  // misc 116 non puo' essere 0: se coincide con il valore iniziale del client (0), chi rientra
  // va in crash alla fine di ogni aggiornamento dei master (osservato al banco). Con un valore
  // diverso il client prosegue verso la home.
  misc['116'] = Number(process.env.KHUX_COPPA_116 || 1);
  send(res, 200, { ret: ret(), misc });
}

function respondResourceSize(res, req) {
  // PUT /system/resourcesize/<data>, azione 242. Corpo: {resoMode,
  // masterRevision, resourceRevision, commonMasterRevision, evResourceIds}.
  // Il client legge solo "size", intero senza segno: i byte
  // da scaricare prima di giocare.
  // Con 0 il client salta il download e, senza dati master, va in crash dopo il
  // filmato introduttivo. KHUX_RESOURCE_SIZE serve a provocare il download per
  // scoprirne il protocollo.
  // Se il client dichiara master e risorse gia' aggiornati la dimensione e' 0. (Il «0
  // manda in crash» del 7 ottobre riguardava un client senza master, revisione 0.)
  // Il crash dopo un aggiornamento dei master per chi rientra NON dipende da
  // qui: vedi HANDOFF, «Il crash dopo l'aggiornamento dei master».
  const upToDate = Number(req?.masterRevision) >= sessionRevision()
    && Number(req?.resourceRevision) >= latestResourceVersion();
  send(res, 200, { ret: ret(), size: upToDate ? 0 : Number(process.env.KHUX_RESOURCE_SIZE || 0) });
}

// ---------------------------------------------------------------------------
// Dati master
//
// GET /system/master/<data> (azione 27) restituisce per ogni
// tabella {revision, url, key, md5}. Il client scarica url e lo decodifica come
// ogni risposta "application/encoded-json" o "application/octet-stream":
// URL-unescape -> base64 -> AES-256-CBC con key (i 32
// byte della stringa), IV a zero, PKCS#7 -> JSON. md5: ipotesi, MD5 esadecimale
// del corpo scaricato (come per gli altri download).
//
// Le tabelle sono i file <nome>.json di MASTER_DIR (non versionata: sono dati
// di Square Enix o ne derivano). Nessun file, nessuna tabella.
// ---------------------------------------------------------------------------
const MASTER_DIR = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');

function masterKey(name) {
  // 32 caratteri stabili tra i riavvii: il client li usa come chiave AES-256.
  return crypto.createHash('sha256').update('khux-master:' + name).digest('hex').slice(0, 32);
}

// Stagioni attive (gacha-seasons): il client riscarica drawMedalType solo se la revisione cambia, quindi l'insieme delle
// stagioni attive entra nella revisione (1000 * somma di indice+1 nella tabella, al massimo 36000: sotto lo scalino di BASE)
const seasonTerm = (realMs) => 1000 * gachaSeasons.activeSeasons(realMs)
  .reduce((n, a) => n + gachaSeasons.SEASONS.findIndex((x) => x.key === a.key) + 1, 0);

// revisione del master calcolata (spec 3.3): BASE = KHUX_REVISION, piu' le scadenze passate
const masterRevisionNow = () => clock.masterRevision(REVISION, realNow()) + storyTranche() + seasonTerm(realNow()) + (BENCH_ENEMY_ATK > 1 ? 90000 + BENCH_ENEMY_ATK : 0)
  + (BENCH_SKILL_PROB !== null ? 80000 + BENCH_SKILL_PROB + 1 : 0);
// Revisione della sessione: fissata all'inizio di ogni login (POST /system/login, la prima risposta
// con ret() della sequenza) e usata da ret(), /system/resourcesize e dal master servito per tutta la
// sessione. Il master cambia cosi' solo al login successivo, e il contenuto servito (scadenze dei
// gruppi) e' quello dell'istante della revisione, anche se il download scavalca una scadenza.
// Senza login (salvataggi vecchi, test): la revisione del momento.
function startSession() {
  player.sessionRevision = masterRevisionNow();
  player.sessionRealMs = realNow();
}
const sessionFixed = () => Number.isFinite(player.sessionRevision) && Number.isFinite(player.sessionRealMs);
const sessionRevision = () => (sessionFixed() ? player.sessionRevision : masterRevisionNow());
const sessionRealMs = () => (sessionFixed() ? player.sessionRealMs : realNow());

// Weekly A/B (make-weekly-series.js): 3001-3010 settimane pari (serie 0), 3011-3020 dispari (serie 1),
// sull'ora reale. Unica regola, usata dal master servito e da missionActive.
const weeklySeriesOf = (row) => (row.id >= 3011 ? 1 : 0);
const weeklyActive = (row, realMs) => clock.weekIndex(realMs) % 2 === weeklySeriesOf(row);

// Settimana reale in cui ogni banner dello Shop esce con la rotazione (stessa scelta di /gacha/list alla data realMs)
function shopLeave(realMs) {
  const g = player.gacha || {};
  const storyQuest = stageNumber(lastStoryStageId()), week = clock.weekIndex(realMs);
  const w = gachaData.shopWindow(gachaCatalog(), storyQuest, week, g.rot);
  return gacha.shopLeaveWeeks(gachaCatalog(), { storyQuest, week,
    rot: g.rot, sizes: GACHA_SIZES, show: GACHA_SHOW, ...seasonCtx(realMs), seasonalAt: (ms) => seasonCtx(ms).seasonal, pinned: pinnedNow(storyQuest, w) });
}
// Tranche della storia del giocatore (indice della data in catalog.story): entra nella revisione del master, cosi'
// il client riscarica drawMedalType (conti alla rovescia dello Shop) al login dopo un cambio di tranche
function storyTranche() {
  const cat = gachaCatalog(), day = gachaData.storyDay(cat, stageNumber(lastStoryStageId()));
  return Math.max(0, [...new Set((cat.story || []).map((r) => r[2]))].sort().indexOf(day));
}

// righe servite: per «mission» le scadenze delle Weekly A/B e dei gruppi Limited (prossima
// occorrenza), in ora finta con lo scostamento del mese della revisione
function servedMasterRows(name, realMs) {
  const rows = masterRows(name);
  if (name === 'skill' && BENCH_SKILL_PROB !== null) {
    return rows.map((r) => ({ ...r, invokeProb: BENCH_SKILL_PROB * 100, invokeProbPerLv: 0 }));
  }
  if (name === 'enemy' && BENCH_ENEMY_ATK > 1) {
    return rows.map((r) => ({ ...r, attack: (r.attack || []).map((v) => v * BENCH_ENEMY_ATK) }));
  }
  // drawMedalType: bannerUrl/detailUrl sono percorsi (server/make-banners.js); l'indirizzo http si
  // aggiunge qui (max 128 byte, strncpy del client)
  // displayTimeLeft/endDate: conto alla rovescia fino al lunedi' in cui la rotazione toglie il banner dallo Shop
  // (gacha.shopLeaveWeeks), in ora finta come le missioni; gli altri banner restano senza (displayTimeLeft 0)
  if (name === 'drawMedalType') {
    const leave = shopLeave(realMs), off = clock.twinOffset(realMs), ends = seasonCtx(realMs).seasonEnds;
    return rows.map((r) => ({ ...r, bannerUrl: String(r.bannerUrl || '').startsWith('/') ? WEB_BASE + r.bannerUrl : r.bannerUrl,
      detailUrl: String(r.detailUrl || '').startsWith('/') ? WEB_BASE + r.detailUrl : r.detailUrl,
      ...(ends.has(r.drawMedalTypeId) ? { displayTimeLeft: 1, endDate: clock.fakeString(ends.get(r.drawMedalTypeId), off) }
        : leave.has(r.drawMedalTypeId) ? { displayTimeLeft: 1, endDate: clock.fakeString(clock.weekStartOf(leave.get(r.drawMedalTypeId)), off) } : {}) }));
  }
  if (name !== 'mission') return rows;
  const off = clock.twinOffset(realMs);
  const w = clock.weekIndex(realMs), mi = clock.monthIndex(realMs);
  const nextWeek = (i, n) => { let k = w; while (k % n !== i) k++; return clock.weekStartOf(k + 1); };
  const nextMonth = (i, n) => { let k = mi; while (k % n !== i) k++; return clock.monthEndOf(k); };
  return rows.map((r) => {
    let endMs = null;
    if (r.missionType === 3) endMs = nextWeek(weeklySeriesOf(r), 2);
    const g = LIMITED_GROUP.get(r.id);
    if (r.missionType === 4 && g) {
      endMs = g.kind === 'monthly' ? nextMonth(g.index, LIMITED_ROTATION.monthly.length) : nextWeek(g.index, LIMITED_ROTATION.weekly.length);
    }
    if (endMs === null) return r;
    // rewardEndTime: per le missioni COMPLETE non riscosse il client conta fino a questo campo, non a
    // endDate (banco 16-10: «28920 days left», il 2099 del master). Il premio non riscosso va nei
    // Presents alla scadenza (settleClock), quindi la riscossione finisce con la missione.
    const end = clock.fakeString(endMs, off);
    return { ...r, endDate: end, rewardEndTime: end };
  });
}

const masterBodyCache = new Map(); // nome -> {key, body, md5}
function masterBody(name) {
  const file = path.join(MASTER_DIR, name + '.json');
  if (!/^[A-Za-z0-9]+$/.test(name) || !fs.existsSync(file)) return null;
  const st = fs.statSync(file);
  const key = `${sessionRevision()}:${st.mtimeMs}:${st.size}`;
  const hit = masterBodyCache.get(name);
  if (hit && hit.key === key) return hit.body;
  const json = Buffer.from(JSON.stringify(servedMasterRows(name, sessionRealMs())), 'utf8');
  const c = crypto.createCipheriv('aes-256-cbc', Buffer.from(masterKey(name), 'utf8'), Buffer.alloc(16));
  const body = Buffer.from(Buffer.concat([c.update(json), c.final()]).toString('base64'), 'utf8');
  masterBodyCache.set(name, { key, body, md5: crypto.createHash('md5').update(body).digest('hex') });
  return body;
}

// Lo schema (recon/out/master_types_ww431.json, ricavato dai lettori di riga)
// dice tipo e limiti di ogni campo. Il client vuole un ARRAY di righe; in ogni
// riga TUTTI i campi, del tipo esatto: un campo assente o sbagliato fa fallire
// la riga, e con lei l'intera tabella (errore 3). Le chiavi in piu' sono ignorate.
const MASTER_SCHEMA_FILE = path.join(__dirname, '..', 'recon', 'out', 'master_types_ww431.json');
const MASTER_SCHEMA = fs.existsSync(MASTER_SCHEMA_FILE)
  ? JSON.parse(fs.readFileSync(MASTER_SCHEMA_FILE, 'utf8')) : {};
// Per le prove sul banco: servire anche le tabelle che lo schema rifiuta.
const MASTER_SERVE_INVALID = process.env.KHUX_MASTER_SERVE_INVALID === '1';

function checkMasterValue(v, type) {
  // type: int | int64 | string(N) | string | <elemento>[N]
  const arr = /^(.*)\[(\d+)\]$/.exec(type);
  if (arr) {
    if (!Array.isArray(v)) return 'non e\' un array';
    if (v.length > Number(arr[2])) return `piu' di ${arr[2]} elementi`;
    for (const e of v) {
      const err = checkMasterValue(e, arr[1]);
      if (err) return 'elemento: ' + err;
    }
    return null;
  }
  if (type === 'int') {
    return Number.isInteger(v) && v >= -2147483648 && v <= 2147483647 ? null : 'non e\' un int32';
  }
  if (type === 'int64') return Number.isInteger(v) ? null : 'non e\' un intero';
  // string(N): il client copia con strncpy, quindi oltre N byte tronca senza errore
  if (/^string(?:\(\d+\))?$/.test(type)) return typeof v === 'string' ? null : 'non e\' una stringa';
  return `tipo sconosciuto ${type}`;
}

function checkMasterTable(name, rows) {
  const schema = MASTER_SCHEMA[name];
  if (!schema) return [`tabella sconosciuta: ${name}`];
  if (!Array.isArray(rows)) return ['la radice deve essere un array di righe'];
  const errors = [];
  rows.forEach((row, i) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`riga ${i}: non e' un oggetto`);
      return;
    }
    for (const [field, type] of schema) {
      if (!(field in row)) errors.push(`riga ${i}: manca ${field}`);
      else {
        const err = checkMasterValue(row[field], type);
        if (err) errors.push(`riga ${i}: ${field} ${err} (${type})`);
      }
    }
  });
  return errors;
}

const masterValidCache = new Map(); // nome -> {mtimeMs, size, ok}
function masterTables() {
  if (!fs.existsSync(MASTER_DIR)) return [];
  const names = fs.readdirSync(MASTER_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  return names.filter((name) => {
    const file = path.join(MASTER_DIR, name + '.json');
    const st = fs.statSync(file);
    const hit = masterValidCache.get(name);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.ok;
    let errors;
    try {
      errors = checkMasterTable(name, JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (e) {
      errors = ['JSON non valido: ' + e.message];
    }
    if (errors.length) {
      console.warn(`[master] ${name}: ${errors.length} errori, es. ${errors.slice(0, 3).join('; ')}`
        + (MASTER_SERVE_INVALID ? ' — la servo lo stesso' : ' — non la servo'));
    }
    const ok = errors.length === 0 || MASTER_SERVE_INVALID;
    masterValidCache.set(name, { mtimeMs: st.mtimeMs, size: st.size, ok });
    return ok;
  });
}

function respondMaster(res) {
  const body = { ret: ret() };
  const tables = masterTables();
  const rev = sessionRevision();
  body.master = { revision: rev, commonRevision: rev, count: tables.length };
  // Revisione per tabella: il client riscarica comunque TUTTE le tabelle quando cambia quella
  // globale (prova del 16-10: 106 su 106 con la sola mission a 116 e le altre a 115)
  for (const name of tables) {
    masterBody(name);
    body[name] = {
      revision: rev,
      url: `${SESSION_BASE}/master/${name}`,
      key: masterKey(name),
      md5: masterBodyCache.get(name).md5,
    };
  }
  send(res, 200, body);
}

function respondMasterFile(req, res) {
  const name = req.url.split('?')[0].split('/').pop();
  const body = masterBody(name);
  if (!body) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Risorse
//
// GET /system/resource (azione 28, corpo della richiesta
// {revision, resoMode}; risposta):
//   { resource: { mode, minVersion, versions: [ {data: [file], index: [file]} ] } }
// mode 0 = niente da scaricare, 1 o 2 = scarica. La versione i-esima vale
// minVersion + i. file = {url, md5, size}: stringhe non vuote e size > 0.
//
// Il client accetta un file scaricato solo se il
// corpo e' lungo `size`, il suo MD5 esadecimale e' `md5` e il Content-Type
// contiene "application/octet-stream". Lo salva nella cartella scrivibile con un
// nome derivato dall'url; la cache rifa' lo stesso controllo.
//
// Il client chiede l'azione 28 solo se le revisioni delle risorse differiscono,
// il giocatore NON e' nuovo e il tutorial risulta finito (stato del tutorial,
// campo isFinished).
//
// I pacchetti sono i file di RESOURCE_DIR/<versione>/{data,index}/ (cartella non
// versionata: conterra' risorse di Square Enix).
// ---------------------------------------------------------------------------
const RESOURCE_DIR = process.env.KHUX_RESOURCE_DIR || path.join(__dirname, 'resource_data');

// I pacchetti possono pesare gigabyte (gli OBB): l'MD5 si calcola una volta, a
// blocchi, e si tiene in cache finche' dimensione e data del file non cambiano.
const md5Cache = new Map();

function fileMd5(file) {
  const st = fs.statSync(file);
  const k = `${file}|${st.size}|${st.mtimeMs}`;
  if (!md5Cache.has(k)) {
    const h = crypto.createHash('md5');
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(16 * 1024 * 1024);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
    fs.closeSync(fd);
    md5Cache.set(k, h.digest('hex'));
  }
  return md5Cache.get(k);
}

function resourceFiles(version, kind) {
  const dir = path.join(RESOURCE_DIR, String(version), kind);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().map((name) => {
    const file = path.join(dir, name);
    return {
      url: `${SESSION_BASE}/resource/${version}/${kind}/${encodeURIComponent(name)}`,
      md5: fileMd5(file),
      size: fs.statSync(file).size,
    };
  }).filter((f) => f.size > 0);
}

function resourceVersions() {
  return fs.existsSync(RESOURCE_DIR)
    ? fs.readdirSync(RESOURCE_DIR).filter((v) => /^\d+$/.test(v)).map(Number).sort((a, b) => a - b)
    : [];
}

function latestResourceVersion() {
  const v = resourceVersions();
  return v.length ? v[v.length - 1] : 0;
}

function respondResource(res) {
  const versions = resourceVersions();
  const body = { ret: ret() };
  if (versions.length === 0) {
    body.resource = { mode: 0, minVersion: 0, versions: [] };
  } else {
    // Solo l'ultima versione: ognuna delle nostre e' un pacchetto completo (la 4 = la 3
    // + le mappe generate). Con mode 1 il client scarica i data di TUTTE le versioni
    // elencate e li concatena: con 3 e 4 insieme misc.mp4 veniva di 4,6 GB, la
    // dimensione non tornava con l'indice e compariva «Save error».
    const last = versions[versions.length - 1];
    body.resource = {
      mode: 1, minVersion: last,
      versions: [{ data: resourceFiles(last, 'data'), index: resourceFiles(last, 'index') }],
    };
  }
  send(res, 200, body);
}

function respondResourceEv(res) {
  // GET /system/resourceEv (azione 29): array "resourceEv" di
  // {resourceId (uint), versions}. Nessuna risorsa evento.
  send(res, 200, { ret: ret(), resourceEv: [] });
}

function respondResourceFile(req, res) {
  const parts = req.url.split('?')[0].split('/').slice(2).map(decodeURIComponent);
  const [version, kind, name] = parts;
  if (parts.length !== 3 || !/^\d+$/.test(version) || !['data', 'index'].includes(kind)
      || name.includes('/') || name.includes('\\') || name.startsWith('.')) {
    res.writeHead(404);
    return res.end();
  }
  const file = path.join(RESOURCE_DIR, version, kind, name);
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(file).size });
  fs.createReadStream(file).pipe(res);
}

// Tutorial finito dalla fase 995 (dopo il Prologue). Con isFinished 0 il client resta
// nella guida per principianti e il menu a tendina accetta solo i passi guidati (MENU si
// apre, le voci non rispondono). isFinished 1 fa creare alla home il pet e gli NPC
// (lwf/pet/motion/*, lwf/character/npc/<id>/wait): assenti dalle risorse, li fornisce
// come LWF vuoti il pacchetto generato (risorse versione 9).
const TUTORIAL_LAST_PHASE = Number(process.env.KHUX_TUTORIAL_LAST_PHASE || 995);
// popupFlag: un bit per finestra di spiegazione gia' vista (PUT manda il bit della
// finestra appena chiusa, es. 2^28, 2^34, 2^35). A tutorial finito tutte risultano viste
// (2^53 - 1, il massimo esatto in JSON): altrimenti a ogni rientro il client le mostra
// tutte in fila, compresa quella di Dark Road, che va in crash
// (popup del party di Dark Road). KHUX_POPUP_FLAG la cambia.
const POPUP_ALL_SEEN = Number(process.env.KHUX_POPUP_FLAG || Number.MAX_SAFE_INTEGER);

function respondTutorialStatus(res, req) {
  // GET/PUT /tutorial/status (azioni 69/70), campi alla radice:
  // phase (uint), popupFlag (uint64), isFinished (uint), acquireTutorialJewel
  // (bool). isFinished decide, con newcomer, se scaricare le risorse all'avvio.
  // PUT porta la fase raggiunta (50 prima del Prologue, 995 dopo): si salva e GET la
  // restituisce, cosi' chi rientra riprende da li'.
  if (Number.isInteger(req?.phase) && req.phase !== player.tutorialPhase) {
    player.tutorialPhase = req.phase;
    savePlayer();
  }
  if (Number.isInteger(req?.popupFlag) && req.popupFlag > 0) {
    player.popupFlag = Number(BigInt(player.popupFlag || 0) | BigInt(req.popupFlag));
    savePlayer();
  }
  const finished = process.env.KHUX_TUTORIAL_FINISHED === '1' || player.tutorialPhase >= TUTORIAL_LAST_PHASE;
  send(res, 200, {
    ret: ret(),
    phase: player.tutorialPhase,
    popupFlag: finished ? POPUP_ALL_SEEN : player.popupFlag || 0,
    isFinished: finished ? 1 : 0,
    acquireTutorialJewel: false,
  });
}

function respondKhuxLogin(res) {
  // POST /khux/login (azione 252), solo per un giocatore esistente: dopo
  // /system/coppa. Risposta: gameLogin.acquirableLoginBonus (bool).
  // nuovo login: il client riprende l'ora da qui, il gemello del mese corrente vale fino al prossimo
  player.clockOffset = clock.twinOffset(realNow());
  savePlayer();
  send(res, 200, { ret: ret(), gameLogin: { acquirableLoginBonus: loginBonusAcquirable() } });
}

// Login bonus (I-176, login-bonus.js): true se il giorno (cambio alle 08:00 UTC, come le missioni) non e' ancora stato
// riscosso; allora il client chiama POST /login/bonus e apre la scena del login bonus. Solo a tutorial finito:
// i layout del login bonus arrivano con le risorse, che un giocatore nuovo scarica dopo il tutorial (un layout mancante
// = crash in GUIReader). KHUX_LOGIN_BONUS=0 lo spegne.
const LOGIN_BONUS_ON = process.env.KHUX_LOGIN_BONUS !== '0';
function loginBonusAcquirable() {
  if (!LOGIN_BONUS_ON || !(player.tutorialPhase >= TUTORIAL_LAST_PHASE) || !masterRows('loginBonus').length) return false;
  return loginBonus.acquirable(player.loginBonus, clock.dayIndex(realNow()));
}

function respondLoginBonus(res) {
  // POST /login/bonus (azione 65, corpo isTrackingEnabled/advertisingId ignorato). Risposta:
  // loginBonus {continue {loginBonusId, dayCount}, total {loginBonusId, dayCount}, specials [id]}, tutti obbligatori.
  // I premi vanno nei Presents (la risposta non porta inventario).
  const { state, rewards, response } = loginBonus.claim(player.loginBonus, clock.dayIndex(realNow()), masterRows('loginBonus'));
  player.loginBonus = state;
  for (const r of rewards) addPresent(r.type, r.id, r.num, r.comment);
  if (rewards.length) console.log(`[login bonus] giorno ${state.total}: ${rewards.map((r) => `${r.type}/${r.id} x${r.num}`).join(', ')} nei Presents`);
  savePlayer();
  send(res, 200, { ret: ret(), loginBonus: response });
}

// ---------------------------------------------------------------------------
// Risposte generate dagli schemi (recon/out/api_responses_ww431.json): per le
// rotte che non gestiamo a mano, la risposta minima che il parser accetta. Ogni
// campo dello schema e' obbligatorio; gli array restano vuoti.
// ---------------------------------------------------------------------------
const API_SCHEMA_FILE = path.join(__dirname, '..', 'recon', 'out', 'api_responses_ww431.json');
// Gli schemi candidati di a private analysis tool (batch_schema) valgono solo dove manca una voce
// verificata.
const API_SCHEMA_AUTO_FILE = path.join(__dirname, '..', 'recon', 'out', 'api_responses_auto_ww431.json');
const API_SCHEMA = Object.assign(
  fs.existsSync(API_SCHEMA_AUTO_FILE) ? JSON.parse(fs.readFileSync(API_SCHEMA_AUTO_FILE, 'utf8')) : {},
  fs.existsSync(API_SCHEMA_FILE) ? JSON.parse(fs.readFileSync(API_SCHEMA_FILE, 'utf8')) : {});

function defaultFor(type) {
  switch (type) {
    case 'object': return {};
    case 'array': return [];
    case 'string': return '';
    case 'datetime': return serverTime();
    case 'bool': return false;
    default: return 0; // int, uint, int64, uint64
  }
}

function schemaResponse(apiPath) {
  const entry = API_SCHEMA[apiPath];
  if (!entry || !entry.fields) return null;
  const body = { ret: ret() };
  // i genitori prima dei figli: l'ordine alfabetico dei percorsi lo garantisce
  for (const p of Object.keys(entry.fields).sort()) {
    if (p.includes('[]')) continue;
    const keys = p.split('.');
    let o = body;
    for (const k of keys.slice(0, -1)) o = (o[k] ??= {});
    if (!(keys[keys.length - 1] in o)) {
      o[keys[keys.length - 1]] = entry.values && p in entry.values ? entry.values[p] : defaultFor(entry.fields[p]);
    }
  }
  return body;
}

// GET /user (azione 1). Campi obbligatori: userData.user, userData.userPoint,
// userData.userDetail, userData.stageResumption, userData.medalResumption e
// userPopUp.isPopBenefitStone.
// Tipi da uno strumento di analisi privato (response_schema). I valori sono nostri segnaposto: un
// giocatore di livello 1, senza progressi.
const PLAYER_NAME = process.env.KHUX_PLAYER_NAME || 'Player';

// Il giocatore creato con POST /user/create. Si salva su disco (KHUX_SAVE, di default
// server/save/player.json, fuori dal repository) a ogni modifica e si ricarica
// all'avvio: chi ha gia' fatto il tutorial, rientrando, va dritto alla home con i suoi
// dati. Un solo giocatore per server; per ricominciare da capo si cancella il file.
const SAVE_FILE = process.env.KHUX_SAVE || path.join(__dirname, 'save', 'player.json');
const player = {
  name: PLAYER_NAME, gender: 0, unionId: 0, birthday: null, avatar: null, clearMissions: {}, lux: 0,
  created: false, // true dopo POST /user/create: non e' piu' un nuovo giocatore
  tutorialPhase: 0, // ultima fase di PUT /tutorial/status (50 prima del Prologue, 995 dopo)
};
try {
  Object.assign(player, JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')));
  console.log(`[save] giocatore caricato da ${SAVE_FILE}: ${player.name}, fase ${player.tutorialPhase}, ${player.lux} Lux`);
} catch {
  console.log(`[save] nessun salvataggio in ${SAVE_FILE}: nuovo giocatore`);
}
// Salvataggi di prima degli Avatar Coin: si accreditano una volta quelli degli obiettivi
// gia' compiuti
if (player.created && player.spherePoint === undefined) {
  player.spherePoint = 0;
  for (const [sid, done] of Object.entries(player.clearMissions || {})) {
    const st = masterRows('stage').find((r) => r.stageId === Number(sid));
    for (const n of done) if (st?.submissionRewardType?.[n - 1] === 14) player.spherePoint += st.submissionItemNum[n - 1];
  }
  console.log(`[save] Avatar Coin degli obiettivi gia' compiuti: ${player.spherePoint}`);
}

// Migrazione all'orologio finto (spec 3.7): orari salvati in ms reali. Le stringhe finte vecchie
// (ora che ripartiva dal 15/5/2021) non hanno un istante reale: getDatetime spostati in blocco con la
// piu' recente = adesso (l'ordine resta), regali +29 giorni, Beginner da adesso, training pronto,
// contatori dei periodi azzerati (cambiano scala).
function migrateClock() {
  if (!player.clockVersion) migrateClockV1();
  if (player.clockVersion === 1) migrateClockV2();
}
function migrateClockV1() {
  const now = realNow();
  const holders = [
    ...(player.medals || []), ...(player.keyblades || []), ...Object.values(player.sphere || {}),
    ...Object.values(player.medalSkills || {}), ...Object.values(player.medalTraits || {}).flat(),
  ].filter((o) => o && typeof o.getDatetime === 'string');
  const ms = (s) => Date.parse(s.replace(' ', 'T') + 'Z');
  const max = Math.max(0, ...holders.map((o) => ms(o.getDatetime)).filter(Number.isFinite));
  for (const o of holders) { const v = ms(o.getDatetime); o.getDatetime = Number.isFinite(v) ? now - (max - v) : now; }
  if (player.pet?.parts) for (const k of Object.keys(player.pet.parts)) player.pet.parts[k] = now;
  for (const p of player.presents || []) { p.limitDatetime = now + 29 * 86400000; p.created = now; }
  if (player.beginnerSince) player.beginnerSince = now;
  if (player.party && typeof player.party.createDate === 'string') player.party.createDate = now;
  player.missions = {};
  delete player.weeklyLux;
  delete player.clockSettled;
  if (player.pet?.training) { player.pet.training.readyAt = 0; player.pet.training.month = clock.monthIndex(now); }
  player.clockVersion = 1;
  savePlayer();
}
// clockVersion 2: alcuni orari erano gia' numeri prima della v1, ma in ms dell'ORA FINTA vecchia
// (maggio 2021, es. 1621144800000): la v1 (solo stringhe) li ha lasciati e risultavano del 2016.
// Ogni numero prima del 2022 e' ora finta vecchia: spostati in blocco come la v1 (il piu' recente =
// adesso, l'ordine resta), regali +29 giorni, Beginner da adesso. I numeri gia' reali non cambiano.
const OLD_FAKE_BEFORE = Date.UTC(2022, 0, 1);
function migrateClockV2() {
  const now = realNow();
  const old = (v) => typeof v === 'number' && v < OLD_FAKE_BEFORE;
  // [oggetto, campo] con un istante salvato
  const slots = [
    ...(player.medals || []), ...(player.keyblades || []), ...Object.values(player.sphere || {}),
    ...Object.values(player.medalSkills || {}), ...Object.values(player.medalTraits || {}).flat(),
  ].filter((o) => o && old(o.getDatetime)).map((o) => [o, 'getDatetime']);
  if (player.pet?.parts) for (const k of Object.keys(player.pet.parts)) if (old(player.pet.parts[k])) slots.push([player.pet.parts, k]);
  if (player.party && old(player.party.createDate)) slots.push([player.party, 'createDate']);
  const max = Math.max(0, ...slots.map(([o, k]) => o[k]));
  for (const [o, k] of slots) o[k] = now - (max - o[k]);
  for (const p of player.presents || []) {
    if (old(p.limitDatetime)) p.limitDatetime = now + 29 * 86400000;
    if (old(p.created)) p.created = now;
  }
  if (old(player.beginnerSince)) player.beginnerSince = now;
  player.clockVersion = 2;
  savePlayer();
}
if (player.created) migrateClock(); else player.clockVersion = 2; // nuovo giocatore: gia' in ms reali

// Unione valida (1-5) per chi ha gia' creato il giocatore (Review Focus 2 del piano 526-979, 21-10): la Q555 «Master
// of the Union» ha branchType 1 e il client vi carica mappoi_stg(18300 + unionId - 1) (Ursus 1 ... Leopardus 5); un
// salvataggio vecchio o un /user/create senza il campo ha unionId 0/assente e il client cercherebbe la 18299, che non
// esiste. Si corregge al caricamento (prima di qualunque /user: il client legge userDetail.unionId al login), alla
// creazione e a ogni userDetail. DEFAULT_UNION = 1 (Ursus): nessuna scelta da ricordare, la si cambia dal Profilo (/union).
const DEFAULT_UNION = 1;
function ensureUnion() {
  const id = Number(player.unionId);
  if (!player.created || (id >= 1 && id <= 5)) return player.unionId;
  console.log(`[save] unionId ${player.unionId} non valido: Unione ${DEFAULT_UNION} (la Q555 carica 18300 + unionId - 1)`);
  player.unionId = DEFAULT_UNION;
  savePlayer();
  return player.unionId;
}
ensureUnion();

function savePlayer() {
  fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true });
  fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(player, null, 1));
  fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE);
}

// L'avatar del giocatore (updateAvatarData di /user/create): userAvatar (elementi di
// userAvatars) ed elementi di userAvatarParts. Al rientro la home costruisce l'avatar
// da qui: senza, crash.
const AVATAR_COORDINATE = 1;

function userAvatarData() {
  const a = player.avatar || {};
  return {
    myCoordinateNo: AVATAR_COORDINATE, gender: a.gender ?? player.gender,
    hairPartsId: a.hairPartsId || 0, hairColorPartsId: a.hairColorPartsId || 0,
    facePartsId: a.facePartsId || 0, bodyPartsId: a.bodyPartsId || 0, skinPartsId: a.skinPartsId || 0,
    accessoriesPartsIds: a.accessoriesPartsIds || [],
  };
}

// Parti possedute: quelle indossate (tipo dalla tabella avatarParts).
function userAvatarPartsData() {
  const a = userAvatarData();
  // indossate e guadagnate (premi degli Avatar Boards, player.avatarParts)
  const ids = [a.hairPartsId, a.hairColorPartsId, a.facePartsId, a.bodyPartsId, a.skinPartsId, ...a.accessoriesPartsIds,
    ...(player.avatarParts || [])].filter(Boolean);
  const rows = masterRows('avatarParts');
  return [...new Set(ids)].map((id, i) => ({
    userAvatarPartsId: i + 1, // uint64
    partsType: rows.find((r) => r.avatarPartsId === id)?.partsType ?? 0,
    avatarPartsId: id,
    getDatetime: serverTime(),
  }));
}

// Nuovo giocatore (tutorial dall'inizio) finche' non ha fatto /user/create.
// KHUX_NEWCOMER=0/1 lo forza, per le prove.
function isNewcomer() {
  if (process.env.KHUX_NEWCOMER === '0') return false;
  if (process.env.KHUX_NEWCOMER === '1') return true;
  return !player.created;
}

// Missioni dello stage completate finora (id 1-3, al massimo 3).
function stageClearMissions(stageId) {
  return player.clearMissions[stageId] || [];
}

function respondUserCreate(res, req) {
  // POST /user/create (azione 253), alla fine del tutorial iniziale (nome, data di
  // nascita, editor avatar, scelta della Union). Corpo: birthday, name, unionId,
  // updateAvatarData {gender, hairPartsId, hairColorPartsId, facePartsId,
  // bodyPartsId, skinPartsId, accessoriesPartsIds}. Risposta: systemLogin.newcomerKhux
  // (bool, il flag «nuovo giocatore») e gameLogin.acquirableLoginBonus (bool): entrambi
  // obbligatori.
  if (req) {
    player.name = req.name ?? player.name;
    player.unionId = Number(req.unionId ?? player.unionId) || 0;
    player.birthday = req.birthday ?? player.birthday;
    player.avatar = req.updateAvatarData ?? player.avatar;
    player.gender = player.avatar?.gender ?? player.gender;
  }
  player.created = true;
  ensureUnion(); // unionId assente o fuori 1-5 -> 1 (Q555)
  // primo ingresso: lo scostamento dell'ora finta si fissa qui come a /khux/login
  player.clockOffset = clock.twinOffset(realNow());
  grantMissingKeyblades(); // I-087: keyblade senza premio nel master
  savePlayer();
  send(res, 200, {
    ret: ret(),
    systemLogin: { newcomerKhux: false, newcomerDark: false },
    gameLogin: { acquirableLoginBonus: false },
  });
}

function deckStats() {
  const medals = masterRows('medal');
  let attack = 0;
  let defense = 0;
  const byId = new Map(userMedalList().map((m) => [m.userMedalId, m]));
  for (const id of deckMedalIds()) {
    const m = byId.get(id);
    const row = m && medals.find((r) => r.medalId === m.medalId);
    if (row) { attack += row.attack; defense += row.defense; }
  }
  return { attack, defense };
}

// Forzieri degli stage. Il client, aprendo un forziere,
// cerca in userTreasures l'elemento con lo stesso uniqueTreasureId e
// legge la riga di `reward` indicata dalla mappa (stage/mappoi_stg<id>_NN.bin
// dell'addnl); dei suoi premi tiene quelli il cui tipo compare, nella stessa
// posizione, in dropItemTypeIds. Tipi: 4 monete, 8 CP (Attack Prize,
// barra degli speciali), 9 HP. Prologue (1010): forziere arancione id 18, reward 81
// (record 948,1778,81,14,18 della sezione dei forzieri di mappoi_stg01010_01.bin:
// x, y, reward, tipo, id).
// Forzieri e nemici di ogni stage: server/game_data/stage_poi.json, generato dalle
// mappe con recon/tools/stage_poi.py (non versionato: dati di gioco). Le righe di
// reward le scrive make-game-tables.js: posizione 0 il premio del nemico (tipo 5),
// posizione 1 quello del forziere quando la riga serve a entrambi (es. la 1).
const ENEMY_DROP_TYPE = Number(process.env.KHUX_ENEMY_DROP_TYPE || 5);
let STAGE_POI = {};
try {
  STAGE_POI = JSON.parse(fs.readFileSync(path.join(__dirname, 'game_data', 'stage_poi.json'), 'utf8'));
} catch {
  console.warn('[poi] server/game_data/stage_poi.json assente: forzieri e drop solo nel Prologue');
  STAGE_POI = { 1010: { chests: [{ uid: 18, reward: 81 }], enemies: [{ uid: 17 }] } };
}

function rewardRowById(rewardId) {
  return masterRows('reward').find((r) => r.rewardId === rewardId);
}

// dropItemTypeIds di un forziere: per ogni premio della riga il suo tipo, 0 dove il
// premio e' del nemico (materiale: nel forziere resta vuoto)
function chestDropTypes(rewardId) {
  const row = rewardRowById(rewardId);
  if (!row) return [];
  return row.type.slice(0, 4).map((t) => (t === ENEMY_DROP_TYPE ? 0 : t));
}

// Mappa (POI) dello stage giocato: una riga Proud (stageKind 4, I-200) usa quella della storia (stageBinId, come il
// client che carica mappoi_stg<stageBinId>); le varianti della Q555 Proud (1018300 + unionId - 1) -> 18300 + unionId - 1
function poiStageId(stageId) {
  const id = Number(stageId);
  const row = stageRowOf(id);
  return row && row.stageKind === PROUD_KIND && row.stageBinId ? row.stageBinId + (id - row.stageId) : id;
}
const poiOf = (stageId) => STAGE_POI[poiStageId(stageId)];

function stageTreasures(stageId) {
  return (poiOf(stageId)?.chests || [])
    .map((c) => ({ uniqueTreasureId: c.uid, dropItemTypeIds: chestDropTypes(c.reward) }))
    .filter((t) => t.dropItemTypeIds.some(Boolean));
}

// Drop dei nemici: userEnemyDropItems[] (uniqueEnemyId, dropItemTypeIds
// int[] <= 4, stealType), come per i forzieri. uniqueEnemyId = ultimo numero del
// record del nemico nella mappa (x, y, enemyId, 1, 1, 1, 1, id). Il contenuto e' la
// riga di reward del nemico (make-game-tables.js). Sul banco: con tipo 5 (materiale) il
// nemico lascia un sacchetto argento, contato dall'HUD in alto; in CONGRATULATIONS i
// sacchetti si aprono e rivelano l'oggetto. Non tutti gli uid dei nemici compaiono
// come record nella mappa (es. 1 nel Prologue): si mandano tutti quelli da 1 al
// massimo, tolti i forzieri (stesso spazio di id).
function stageEnemyDrops(stageId) {
  const poi = poiOf(stageId);
  if (!poi) return [];
  const chests = new Set(poi.chests.map((c) => c.uid));
  const max = Math.max(0, ...poi.enemies.map((e) => e.uid));
  const ids = [];
  for (let id = 1; id <= max; id++) if (!chests.has(id)) ids.push(id);
  return ids.map((id) => ({ uniqueEnemyId: id, dropItemTypeIds: [ENEMY_DROP_TYPE], stealType: 0 }));
}

// Trick Steal del pet (I-137): il client manda isSteal a /stage/start se un trick aperto ha invokeType 1;
// il server sceglie il drop rubato (stealType != 0: banner e recovery_skill alla morte del nemico)
// e a /stage/clear ne da' la quantita' x skillValue3, la stessa che il client mostra nei risultati (max
// sv3 dei trick con invokeType 1). Lista della community: 50% di attivazione quando un nemico lascia un drop, una volta per battaglia: un tiro
// del 50% per nemico con drop, in ordine di uid, il primo che riesce.
const STEAL_CHANCE = 0.5;
function stealMultiplier() {
  if (!PET_ENABLED) return 0;
  const open = new Set(pet().petSubslotData().openSkillIds);
  return Math.max(0, ...masterRows('petSkill').filter((r) => open.has(r.skillId) && r.invokeType === 1).map((r) => r.skillValue3 || 0));
}
function applySteal(stageId, drops, rng = Math.random, mult = stealMultiplier()) {
  player.steal = null;
  if (mult < 2) return drops;
  const rows = new Map((poiOf(stageId)?.enemies || []).map((e) => [e.uid, e.reward]));
  // solo i nemici con un record nella mappa: gli altri uid (mandati per sicurezza, es. 1) non compaiono mai (banco 20-10)
  const withDrop = drops.filter((d) => rows.has(d.uniqueEnemyId) && rewardRowById(rows.get(d.uniqueEnemyId))?.type.includes(ENEMY_DROP_TYPE));
  // solo banco: KHUX_BENCH_STEAL_UID forza il nemico rubato (prova del crash di I-137)
  const forced = Number(process.env.KHUX_BENCH_STEAL_UID || 0);
  const hit = forced ? withDrop.find((d) => d.uniqueEnemyId === forced) : withDrop.find(() => rng() < STEAL_CHANCE);
  if (!hit) return drops;
  player.steal = { stageId, uid: hit.uniqueEnemyId, mult };
  console.log(`[pet] Steal: drop del nemico ${hit.uniqueEnemyId} x${mult}`);
  return drops.map((d) => (d === hit ? { ...d, stealType: 1 } : d));
}

// userData.userPoint, in GET /user e in POST /stage/start.
// Il livello del giocatore e' il rango Lux: la barra dei risultati
// usa userDetail.luxRank come livello e userPoint.lux come valore,
// contro le soglie cumulative needExp della tabella player (righe lv e lv+1). Con
// luxRank 0 la soglia del livello 1 e' 0: «LEVEL UP!» e barra piena a ogni stage.
function sphereBonus() {
  return player.sphereBonus || { hp: 0, ap: 0, cost: 0 };
}

function luxRankFor(lux) {
  // fino al livello massimo (misc 100): la tabella ha una riga in piu' (make-lux-levels.js)
  const max = miscValue(100, 999);
  const rows = masterRows('player').filter((r) => r.lv >= 1 && r.lv <= max && r.needExp <= lux);
  return Math.max(1, ...rows.map((r) => r.lv));
}

// AP. Il client (AP mostrato e secondi al pieno) ricalcola
// da solo la ricarica: se ap < maxAp e lastApDatetime e' passato, AP = ap + (secondi
// trascorsi) / (misc 101 x 60), fino a maxAp; con ap >= maxAp mostra ap e non ricarica
// (l'AP oltre il massimo viene dal level up o dal recupero con jewel). Il server tiene
// ap e l'istante reale da cui conta la ricarica (player.ap, player.apTime) e fa lo
// stesso conto. maxAp = colonna ap della tabella player al rango Lux (16 al livello 1,
// 160 dal 200) + i nodi AP degli Avatar Boards.
function miscValue(id, def) {
  return masterRows('misc').find((r) => r.miscId === id)?.value ?? def;
}

function apRecoverMs() {
  return (miscValue(101, 3) || 3) * 60 * 1000; // misc 101 = 3: 1 AP ogni 3 minuti
}

// HP del giocatore: colonna hp della tabella player al rango Lux + i nodi HP degli Avatar Boards
const playerHp = () => levelHp(luxRankFor(player.lux)) + sphereBonus().hp;

function maxAp() {
  return (masterRows('player').find((r) => r.lv === luxRankFor(player.lux))?.ap ?? 16) + sphereBonus().ap;
}

// AP attuale e istante (ms reali) da cui conta il prossimo punto
function apState(nowMs = realNow()) {
  const max = maxAp();
  if (typeof player.ap !== 'number') return { ap: max, time: nowMs };
  let ap = player.ap, time = Number(player.apTime) || nowMs;
  if (ap < max && time <= nowMs) {
    const n = Math.floor((nowMs - time) / apRecoverMs());
    if (ap + n >= max) { ap = max; time = nowMs; } else { ap += n; time += n * apRecoverMs(); }
  } else if (ap >= max) time = nowMs;
  return { ap, time };
}

// Cambia l'AP di delta (negativo = spesa). Se prima era pieno la ricarica parte da
// adesso, altrimenti conserva il punto parziale gia' maturato.
function changeAp(delta, nowMs = realNow()) {
  const st = apState(nowMs);
  player.ap = Math.max(0, st.ap + delta);
  player.apTime = st.ap >= maxAp() ? nowMs : st.time;
  return player.ap;
}

// Posti medaglia (userDetail.maxMedal). Base: KHUX_MAX_MEDAL o 300 (segnaposto), sempre sopra le
// medaglie possedute; player.medalMaxExtra = posti comprati con Increase Storage (I-100).
const MEDAL_MAX_LIMIT = 3000;        // «(Max: 3000 slots)» del popup
const MEDAL_MAX_STEP = 5, MEDAL_MAX_COST = 100;   // «Spend 100 Jewels ... by 5 slots?»
function maxMedal() {
  const base = Math.max(Number(process.env.KHUX_MAX_MEDAL || 300), (player.medals || []).length + 50);
  return Math.min(MEDAL_MAX_LIMIT, base + (player.medalMaxExtra || 0));
}

// POST /shop/medal/max (azione 71, Shop > Increase Storage), corpo {count} = scatti del cursore
// del popup PopupNormal_MedalPossessed1. Risposta: solo userData.userDetail
// (obbligatorio: senza, «200 ERROR :71»); i jewel il client li rilegge con
// GET /user/stone. Ogni scatto: +5 posti, -100 jewel.
function respondMedalMax(res, body) {
  const now = serverTime();
  const room = Math.floor((MEDAL_MAX_LIMIT - maxMedal()) / MEDAL_MAX_STEP);
  const n = Math.min(Math.max(1, Number(body?.count) || 1), room);
  const cost = n * MEDAL_MAX_COST;
  if (n > 0 && (player.freeStone || 0) >= cost) {
    player.freeStone -= cost;
    player.medalMaxExtra = (player.medalMaxExtra || 0) + n * MEDAL_MAX_STEP;
    savePlayer();
    console.log(`  [increase storage] +${n * MEDAL_MAX_STEP} posti (${maxMedal()}), -${cost} jewel`);
  } else console.log(`  [increase storage] rifiutato: count ${body?.count}, jewel ${player.freeStone || 0}, posti ${maxMedal()}`);
  send(res, 200, { ret: ret(), userData: { userPoint: userPointData(now), userDetail: userDetailData() } });
}

// Shop > Draw (docs/notes/shop.md; spec 2026-10-16-shop-banner-design.md 9). Catalogo dei banner
// originali scritto da recon/tools/make_banner_catalog.py (server/game_data/gacha_catalog.json); senza
// catalogo la lista ha solo la piastra Banner Catalog. KHUX_GACHA_SHOW: rowId separati da virgola
// mostrati nella lista anche se bloccati o fuori periodo (prove al banco). KHUX_GACHA_SIZES: numeri di
// medaglie con l'animazione del risultato nelle risorse (lwf/raisedraw/demo/raidgacha_result_display_NN,
// recon/tools/import_jp_raisedraw.py).
const GACHA_FILE = process.env.KHUX_GACHA_BANNERS || path.join(__dirname, 'game_data', 'gacha_catalog.json');
const GACHA_IMG = process.env.KHUX_GACHA_IMG || path.join(__dirname, 'game_data', 'gacha_img');
// Immagini con il bollino «KEPT IN SHOP» del banner fissato (bannerUrl .../<id>-kept<stile>.png, stile = gacha.KEPT_STYLE): generate una volta da
// recon/tools/kept_banner_badge.py (Pillow) e tenute accanto alle altre immagini generate, fuori dal repo
const GACHA_IMG_KEPT = process.env.KHUX_GACHA_IMG_KEPT || path.join(__dirname, 'game_data', 'gacha_img_kept');
// Icone originali delle valute del Catalog (recon/tools/shop_icons.py): solo le chiavi della lista, mai un percorso libero
const SHOP_ICONS = process.env.KHUX_SHOP_ICONS || path.join(__dirname, 'game_data', 'shop_icons');
const KEPT_BADGE_PY = path.join(__dirname, '..', 'recon', 'tools', 'kept_banner_badge.py');
const keptFailed = new Set();
// File del banner con il bollino (generato se manca o se l'originale e' piu' recente); se non riesce, quello normale
function keptImageFile(id) {
  const src = path.join(GACHA_IMG, `${id}.png`), dst = path.join(GACHA_IMG_KEPT, `${id}-kept${gacha.KEPT_STYLE}.png`);
  if (!fs.existsSync(src)) return src;
  try {
    if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) return dst;
    if (keptFailed.has(id)) return src;
    fs.mkdirSync(GACHA_IMG_KEPT, { recursive: true });
    const tmp = `${dst}.${process.pid}.tmp`;
    require('child_process').execFileSync(process.env.KHUX_PYTHON || 'python', ['-I', KEPT_BADGE_PY, src, tmp], { timeout: 20000, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    fs.renameSync(tmp, dst);
    return dst;
  } catch (e) {
    keptFailed.add(id);
    try { fs.rmSync(`${dst}.${process.pid}.tmp`, { force: true }); } catch { /* niente da togliere */ }
    const nl = String.fromCharCode(10), err = String(e.stderr || '').trim().split(nl).pop() || e.message.split(nl)[0]; // ultima riga di Python (es. ModuleNotFoundError: PIL)
    console.log(`  [gacha] immagine -kept ${id}: ${err}; servo quella normale`);
    return src;
  }
}
const GACHA_SHOW = new Set((process.env.KHUX_GACHA_SHOW || '').split(',').map((s) => s.trim()).filter(Boolean));
const GACHA_SIZES = new Set((process.env.KHUX_GACHA_SIZES || '1,3,10').split(',').map(Number));
const GACHA_WIDEST_DAY = '2021-06-29'; // ultimo giorno del gioco: il pool piu' largo di un banner permanente
let gachaCatalogMemo = null;
let gachaSearchMemo = null; // indice dei nomi per la ricerca del Catalog: { day, entries: [{ banner, names }] }
const gachaPoolCache = new Map(); // `${drawMedalTypeId}@${asOf}` -> expandPool
// Un banner estraibile (non catalogOnly, non evolve) con uno slot senza medaglie alla sua stella o sotto
// anche alla data piu' larga (rollDraw lancerebbe) passa a catalogOnly 'NO_MEDALS': fuori dalla lista e
// non estraibile, ma resta nel catalogo WebView con il suo stato (oggi B0370 e B0418 «Blue Fairy Deal»:
// le Blue Fairy arriveranno col PvP). Le medaglie impilabili non entrano nei pool (validPack, Task 3),
// tranne i banner evolve: l'estrazione restituisce l'id della cella (respondGachaDraw).
function sanitizeBanners(catalog) {
  const banners = catalog.banners.map((b) => {
    if (b.catalogOnly || b.pool?.mode === 'evolve') return b;
    let pool = {};
    try { pool = gachaData.expandPool(b, catalog, gachaData.asOf(b, GACHA_WIDEST_DAY)).pool; } catch (e) {
      console.log(`  [gacha] ${b.rowId} ${b.name}: ricetta del pool guasta (${e.message})`); // scartato qui sotto
    }
    const has = (r) => (pool[r] || pool[String(r)] || []).length > 0;
    const bad = gachaData.slotRarities(b).find((rare) => ![1, 2, 3, 4, 5, 6, 7].filter((r) => r <= rare).some(has));
    if (bad === undefined) return b;
    console.log(`  [gacha] ${b.rowId} ${b.name}: banner tolto dallo Shop, nessuna medaglia a ${bad}★ o sotto`);
    return { ...b, catalogOnly: 'NO_MEDALS' };
  });
  return { ...catalog, banners };
}
const gachaCatalog = () => (gachaCatalogMemo ??= sanitizeBanners(gachaData.loadCatalog(GACHA_FILE)));
// righe boosted del master medal (medal-boost.boostedIndex: 'normale:str:def' -> medalId), per enhance.boosted
let gachaBoostMemo = null;
const gachaBoostedIndex = () => (gachaBoostMemo ??= medalBoost.boostedIndex(masterRows('medal')));
function reloadGachaBanners() { gachaCatalogMemo = null; gachaBoostMemo = null; gachaPoolCache.clear(); gachaSearchMemo = null; }

// Punto della storia del giocatore: ultima quest superata (1-979, STORY_LAST) e data della sua tranche.
// storyDay = primo giorno della settimana dello Shop (rotazione I-165): data dei pool dei PERMANENT e della regola
// 13-bis; shopFrom/shopTo = la settimana mostrata. player.gacha.rot ricorda in che settimana reale si e' entrati nella
// tranche della storia, cosi' la rotazione parte dalla sua prima settimana.
// Le stagioni dello Shop si decidono all'ora reale del login (sessionRealMs, come il conto alla rovescia del master servito):
// una stagione compare al primo login dentro la finestra e sparisce al primo login dopo la fine.
// Stagionali attive alla data reale (spec Shop sp3 4.2): banner dell'edizione piu' recente sbloccata di ogni stagione,
// nell'ordine della tabella, e la fine della finestra (ms) di ciascuno per il conto alla rovescia. Senza effetti collaterali.
function seasonCtx(realMs) {
  const storyQuest = stageNumber(lastStoryStageId());
  const seasons = gachaSeasons.seasonBanners(gachaCatalog().banners, realMs, (b) => b.unlockQuest <= storyQuest && gacha.drawable(b, GACHA_SIZES));
  const seasonEnds = new Map();
  for (const s of seasons) for (const b of s.banners) if (!seasonEnds.has(b.drawMedalTypeId)) seasonEnds.set(b.drawMedalTypeId, s.end);
  return { seasonal: seasons.flatMap((s) => s.banners), seasonEnds };
}
// Banner fissato del giocatore (spec Shop sp3 6.2) se e' ancora fissabile; w = finestra dello Shop (w.day = inizio del periodo)
const pinnedNow = (storyQuest, w) => gacha.pinnedBanner(gachaCatalog().banners, player, { storyQuest, sizes: GACHA_SIZES, show: GACHA_SHOW, periodStart: w.day });
function storyCtx() {
  const storyQuest = stageNumber(lastStoryStageId());
  const week = clock.weekIndex(realNow());
  const g = (player.gacha ||= {});
  const w = gachaData.shopWindow(gachaCatalog(), storyQuest, week, g.rot);
  if (!g.rot || g.rot.day !== w.day) { g.rot = { day: w.day, week }; savePlayer(); }
  const pinned = pinnedNow(storyQuest, w);
  return { storyQuest, storyDay: w.from, shopFrom: w.from, shopTo: w.to, shopWeek: w, ...seasonCtx(sessionRealMs()), pinned,
    periodStart: w.day, pinnedRowId: pinned?.rowId, pinnedName: pinned?.name };
}
// Pool del banner alla data di riferimento (i PERMANENT seguono la storia); undefined per i banner
// senza composizione (INCOMPLETE): detailPage li mostra senza probabilita'.
function expandFor(b, ctx = storyCtx()) {
  if (b.catalogOnly === 'INCOMPLETE' || !(b.rarityMix || []).length) return undefined;
  const asOf = gachaData.asOf(b, ctx.storyDay), key = `${b.drawMedalTypeId}@${asOf}`;
  if (!gachaPoolCache.has(key)) gachaPoolCache.set(key, gachaData.expandPool(b, gachaCatalog(), asOf));
  return gachaPoolCache.get(key);
}
// Indice dei nomi per la ricerca per medaglia del Catalog (sp3 7.1): per ogni banner i nomi delle medaglie del pool espanso
// alla data della storia piu' quelli scritti nel catalogo (vetrina, lista, riserve, pity). Si calcola una volta per storyDay
// (cambia quando la tranche o la settimana dello Shop cambia) e resta in memoria; expandFor che lancia: niente pool, restano
// i nomi delle garanzie.
function gachaSearchEntries(ctx) {
  if (gachaSearchMemo?.day === ctx.storyDay) return gachaSearchMemo.entries;
  const medalNames = new Map(masterRows('medal').map((m) => [m.medalId, m.name]));
  const entries = gachaCatalog().banners.map((banner) => {
    const g = banner.guarantee || {};
    const names = new Set([...(banner.pool?.featured || []), ...(g.list || []), ...(g.pityNames || []), ...(g.slots || []).flatMap((s) => s.names || [])]);
    let ex;
    try { ex = expandFor(banner, ctx); } catch (e) { console.log(`  [gacha] ${banner.rowId} ${banner.name}: pool non espandibile per la ricerca (${e.message})`); }
    const ids = [...Object.values(ex?.pool || {}).flat(), ...(ex?.weighted || []).map(([id]) => id)];
    for (const id of ids) { const n = medalNames.get(id); if (n) names.add(n); }
    return { banner, names: [...names] };
  });
  gachaSearchMemo = { day: ctx.storyDay, entries };
  return entries;
}
// Banner della lista attuale (stessa scelta di /gacha/list)
const gachaShopList = (ctx = storyCtx()) => gacha.shopBanners(gachaCatalog().banners, { ...ctx, sizes: GACHA_SIZES, show: GACHA_SHOW });

// Piastre con la striscia della garanzia (gacha.warrantFields): il pool alla data del giocatore da' i bersagli della pity.
// drawMedalTypeId dell'ultima /gacha/list inviata (in memoria, per processo): e' cio' che il client ha a schermo
let gachaLastListed = new Set();
const gachaListWarned = new Set(); // banner il cui pool non si espande per /gacha/list (log una volta)
function respondGachaList(res) {
  const migrate = !player.drawTickets, listed = player.gacha?.listedCurrency, ctx = storyCtx();
  // expandFor che lancia: niente pool, warrantMedalIds dal catalogo (gacha.warrantFields), una riga di log per banner
  const exFor = (b) => {
    try { return expandFor(b, ctx); } catch (e) {
      if (!gachaListWarned.has(b.drawMedalTypeId)) {
        gachaListWarned.add(b.drawMedalTypeId);
        console.log(`  [gacha] ${b.rowId} ${b.name}: pool per la striscia della pity non espandibile (${e.message})`);
      }
      return undefined;
    }
  };
  // validComment della riga drawMedalType servita (gacha.guardWarrant: con 0 warrantMedalIds non e' mai vuota)
  const comments = new Map(masterRows('drawMedalType').map((r) => [r.drawMedalTypeId, r.validComment]));
  const medalRows = masterRows('medal');
  const safeMedalId = medalRows.find((r) => r.type === 1 && !r.groupId)?.medalId;
  // I-153: nomi della tabella medal servita (un id per nome nella striscia, lunghezza oltre il limite del client)
  const nameOf = new Map(medalRows.map((r) => [r.medalId, r.name]));
  const data = gacha.gachaListData(gachaCatalog().banners, player, { realMs: realNow(), webBase: WEB_BASE, sizes: GACHA_SIZES, show: GACHA_SHOW,
    ...ctx, exFor, catalog: gachaCatalog(), validCommentOf: (b) => comments.get(b.drawMedalTypeId), safeMedalId, nameOf });
  if (migrate || player.gacha.listedCurrency !== listed) savePlayer();
  gachaLastListed = new Set(data.gachaList.map((x) => x.drawMedalTypeId));
  send(res, 200, { ret: ret(), ...data });
}

// POST /gacha/draw (azione 76): risposta con userData.userPoint, userMedals, userSkills,
// userMaterials, gachaBonus, firstGetUserMedalIds, userMedalIds, effectNumbers (tutti
// obbligatori) e guiltBurstFirst/MaxUserMedalIds. Un rifiuto
// risponde solo {ret}: «200 ERROR :76» e il client torna allo Shop. Si estrae solo dai
// banner della lista attuale, dell'ultima /gacha/list inviata o di KHUX_GACHA_SHOW: una richiesta forgiata non arriva ai
// banner fuori periodo. L'ultima lista conta perche' il client non ricarica /gacha/list quando il Catalog si chiude: pin,
// unpin o cambio di settimana a Shop aperto lasciano a schermo piastre che la lista attuale non ha piu'.
// Potenziamenti del catalogo v3 (sotto-progetto 2b, rollDraw extras): boosted = la riga boosted del master al
// posto della normale (cella propria, validPack 0); preset = pallini (fino a maxEnhanceCount della burst, gia'
// corretto da burstDotFixes in make-game-tables) e guilt al massimo del Tier (guilt 'max': pallini sempre pieni,
// ricerca §3); maxSkill = una delle abilita' presenti in skill.json (a caso), al livello massimo; pityGift = la
// medaglia di supporto nel Present Box quando scatta la pity. Nova: guiltBurstFirst/MaxUserMedalIds (popup acceso,
// KHUX_GUILT_BURST_POPUP=0 lo spegne, guilt-burst.js).
function respondGachaDraw(res, body) {
  player.medals = player.medals || []; // salvataggio nuovo: l'elenco nasce alla prima medaglia
  const now = serverTime(), realMs = realNow(), ctx = storyCtx();
  const banner = gachaData.bannerById(gachaCatalog().banners, body?.drawMedalTypeId);
  const freeSlots = maxMedal() - stackedMedalList().length;
  let why = gacha.checkDraw(banner, player, body, { ...ctx, realMs, freeSlots, sizes: GACHA_SIZES, show: GACHA_SHOW });
  if (!why && !GACHA_SHOW.has(banner.rowId) && !gachaShopList(ctx).includes(banner) && !gachaLastListed.has(banner.drawMedalTypeId)) why = `${banner.rowId} non e' nella lista dello Shop`;
  if (why) {
    console.log(`  [gacha] estrazione rifiutata: ${why} (corpo ${JSON.stringify(body)})`);
    return send(res, 200, { ret: ret() });
  }
  const snap = inventorySnapshot(now);
  const owned = new Set(userMedalList().map((m) => m.medalId)); // quello che vede il client
  let draw;
  const boosted = gachaBoostedIndex();
  const boostedOf = (id, str, def) => boosted.get(`${id}:${str}:${def}`);
  try { draw = gachaData.rollDraw(banner, expandFor(banner, ctx), Math.random, gacha.drawState(player, banner), { boostedOf }); } catch (e) {
    console.log(`  [gacha] estrazione impossibile, niente addebitato: ${e.message}`);
    return send(res, 200, { ret: ret() });
  }
  // consegna e addebito insieme: un errore a meta' riporta il giocatore com'era (copia JSON, la stessa
  // forma del salvataggio), cosi' non resta addebitato con meta' delle medaglie; l'addebito va per ultimo
  const undo = JSON.stringify(player);
  const userMedalIds = [], first = [];
  let price;
  try {
    const medalRows = new Map(masterRows('medal').map((m) => [m.medalId, m]));
    const packed = new Set([...medalRows.values()].filter((m) => m.validPack).map((m) => m.medalId));
    const skills = skillRowsById();
    const skillByName = new Map([...skills.values()].map((r) => [medalBoost.norm(r.name), r]));
    let bursts = null; // masterRows('burst') solo se serve (7 MB)
    const drawAt = gachaData.asOf(banner, ctx.storyDay); // data dell'estrazione per la regola 13-bis
    draw.medalIds.forEach((medalId, i) => {
      grantItem(3, medalId, 1);
      const newId = player.medals[player.medals.length - 1].userMedalId;
      // il client cerca ogni id in userMedals: per le impilabili la cella ha l'id della prima copia
      const cell = packed.has(medalId) ? stackedMedalList().find((c) => c.copies.includes(newId)) : null;
      const id = cell ? cell.userMedalId : newId;
      userMedalIds.push(id);
      if (!owned.has(medalId)) { first.push(id); owned.add(medalId); }
      // abilita' estratte (SKILL_TABLES): stesso formato dell'Overwrite, livello 1
      const sk = gachaData.rollSkill(banner.skill, i, skills, Math.random);
      if (sk && !packed.has(medalId)) {
        player.nextUserSkillId = (player.nextUserSkillId || 0) + 1;
        (player.medalSkills ||= {})[newId] = { userSkillId: player.nextUserSkillId, skillId: sk, level: 1, exp: 0, getDatetime: realNow() };
      }
      const x = draw.extras?.[i], row = medalRows.get(medalId);
      // Tier della riga; una boosted senza Tier prende quello della normale (groupId)
      const tier = row ? row.guiltValue || medalRows.get(row.groupId)?.guiltValue || 0 : 0;
      // decisione 13-bis, regola originale (gacha-data.MAX_GUILT_FROM: notice 48236, Tier 9 dal 2019-01-01; notice
      // 56838, Tier 10 dal 2019-09-01): una 7★ di quel Tier estratta da un banner con data (asOf, la stessa delle
      // medaglie del pool) da quel giorno, boosted comprese, arriva con pallini e guilt al massimo. Prima, e per le
      // altre, solo col preset.
      const rule = !!row && gachaData.maxGuiltRule(row.rare, tier, drawAt);
      if ((x?.preset || rule) && row && !packed.has(medalId)) {
        bursts ??= new Map(masterRows('burst').map((b) => [b.burstId, b]));
        const maxDots = row.validBurst ? bursts.get(row.burstId)?.maxEnhanceCount || 0 : 0;
        // preset e regola insieme: il massimo dei due
        const max = rule || x?.preset?.guilt === 'max';
        const dots = max || x?.preset?.dots === 'max' ? maxDots : Math.max(0, Math.min(Number(x?.preset?.dots) || 0, maxDots));
        const guilt = max ? medalGuilt.guiltRange(masterRows('guiltProb'), tier).max : 0;
        setMedalState(newId, { burstUpperNumber: dots, ...(guilt ? { guiltFactor: guilt } : {}) });
      }
      // maxSkill: una delle abilita' presenti in skill.json (a caso), al livello massimo; nessuna presente: niente
      const skillExpRows = medalSkillTables().expRows;
      const have = (x?.skills || []).map((n) => skillByName.get(medalBoost.norm(n))).filter(Boolean);
      if (have.length && !packed.has(medalId)) {
        const s = have[Math.min(have.length - 1, Math.floor(Math.random() * have.length))];
        player.nextUserSkillId = (player.nextUserSkillId || 0) + 1;
        (player.medalSkills ||= {})[newId] = { userSkillId: player.nextUserSkillId, skillId: s.skillId, level: s.maxLv || 1,
          exp: skillExpRows.get(s.expType) ? medalSkill.expToReach(skillExpRows.get(s.expType), s.maxLv || 1) : 0, getDatetime: realNow() };
      }
    });
    // pity con regalo (medaglia di supporto, catalogo v3 guarantee.pityGift): nel Present Box, nessuno slot sostituito
    const gift = banner.guarantee?.pityGift;
    if (draw.pityFired && Array.isArray(gift)) addPresent(gift[0], gift[1], gift[2] || 1, 'Guaranteed bonus: ' + banner.name);
    // oggetti in omaggio dell'estrazione (Magic Mirror, gemme...): nel Present Box (spec 9.2)
    for (const [type, itemId, n, skillId] of banner.bonus || []) {
      const sk = skillId && skillRowsById().get(skillId)?.name;
      addPresent(type, itemId, n, 'Bonus: ' + banner.name + (sk ? ` (${sk})` : ''), skillId);
    }
    missionCount('draw', 1); // Beginner «Draw Medal»: una per richiesta riuscita, non per medaglia
    price = gacha.payDraw(banner, player, realMs, draw.featured);
  } catch (e) {
    for (const k of Object.keys(player)) delete player[k];
    Object.assign(player, JSON.parse(undo));
    console.log(`  [gacha] ${banner.rowId}: consegna fallita, niente addebitato ne' consegnato: ${e.message}`);
    return send(res, 200, { ret: ret() });
  }
  savePlayer();
  const boostedLog = (draw.extras || []).filter((x) => x.boostedFrom).length;
  console.log(`  [gacha] ${banner.rowId} ${banner.name}: -${price} ${gacha.walletName(banner)}, medaglie ${draw.medalIds.join(',')}`
    + `${boostedLog ? `, boosted ${boostedLog}` : ''}${draw.pityFired ? ', pity' : ''}`);
  // userPointData (livello del Nova: refresh mette in attesa le copie appena arrivate) prima di inventoryBlocks,
  // che porta guiltBurstFirst/MaxUserMedalIds (guiltBurst().lists())
  send(res, 200, { ret: ret(), userData: { userPoint: userPointData(now) }, ...inventoryBlocks(now, snap), ...gacha.drawResultFields(userMedalIds, first) });
}

// Pagine WebView dello Shop (Details della piastra Catalog e di ogni banner, Draw Odds) e immagini
// 640x140 dei banner (bannerUrl, scaricate dal client via http). Nomi delle medaglie dal master
// (gli id evolve, es. 301495, non sono in catalog.medals); skill solo se presenti in skill.json.
function respondGachaWeb(res, url) {
  const p = url.split('?')[0];
  const html = (s, code = 200) => { const b = Buffer.from(s, 'utf8'); res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': b.length }); res.end(b); };
  const img = /^\/web\/gacha\/img\/(\d+)(?:-kept(\d+))?\.png$/i.exec(p);
  if (img) {
    if (img[2] && Number(img[2]) !== gacha.KEPT_STYLE) return html('not found', 404); // stile vecchio o sconosciuto
    const file = img[2] ? keptImageFile(Number(img[1])) : path.join(GACHA_IMG, `${Number(img[1])}.png`);
    if (!fs.existsSync(file)) return html('not found', 404);
    const b = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': b.length });
    return res.end(b);
  }
  const icon = /^\/web\/gacha\/icon\/([a-z]+)\.png$/.exec(p);
  if (icon) {
    const file = gacha.PAY_ICON_KEYS.includes(icon[1]) && path.join(SHOP_ICONS, `${icon[1]}.png`);
    if (!file || !fs.existsSync(file)) return html('not found', 404);
    const b = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': b.length, 'Cache-Control': 'public, max-age=3600' });
    return res.end(b);
  }
  // /web/gacha/search?q=<testo>: ids dei banner del Catalog con una medaglia che contiene il testo (vuoto = tutti)
  if (/^\/web\/gacha\/search$/i.test(p)) {
    const q = new URLSearchParams(url.split('?')[1] || '').get('q') || '';
    const b = Buffer.from(JSON.stringify({ ids: [...gacha.medalSearch(gachaSearchEntries(storyCtx()), q)] }), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': b.length });
    return res.end(b);
  }
  const banners = gachaCatalog().banners, story = storyCtx(), shop = gachaShopList(story);
  const ctx = { ...story, sizes: GACHA_SIZES, show: GACHA_SHOW, shown: new Set(shop.map((b) => b.drawMedalTypeId)) };
  if (/^\/web\/gacha\/catalog$/i.test(p)) return html(gacha.catalogPage(banners, ctx));
  const medalNames = new Map(masterRows('medal').map((m) => [m.medalId, m.name]));
  // /web/gacha/odds/<drawMedalTypeId> (id accodato dal client): le probabilita' di quel banner;
  // senza id o con la piastra Catalog (9001) quelle dei banner della lista
  const odds = /^\/web\/gacha\/odds\/?(\d*)$/i.exec(p);
  if (odds) {
    const one = gachaData.bannerById(banners, odds[1]);
    const list = one ? [one] : shop;
    return html(gacha.oddsPage(list.map((banner) => ({ banner, ex: expandFor(banner, story), medalNames }))));
  }
  const det = /^\/web\/gacha\/detail\/(\d+)$/i.exec(p);
  const banner = det && gachaData.bannerById(banners, det[1]);
  if (!banner) return html('<!doctype html><meta charset="utf-8"><body style="background:#043654;color:#fff;font:18px sans-serif">Banner not found.</body>', 404);
  const skillNames = new Set(masterRows('skill').map((r) => r.name));
  const medalAttr = new Map(masterRows('medal').map((m) => [m.medalId, m.attribute]));
  return html(gacha.detailPage(banner, expandFor(banner, story), medalNames, { ...ctx, skillNames, medalAttr, fromCatalog: /[?&]from=catalog\b/.test(url) }));
}

// POST /web/gacha/pin/<drawMedalTypeId> e /web/gacha/unpin (spec Shop sp3 6.3), dai pulsanti dei Details dal Catalog.
// Fissa solo i banner fissabili (gacha.pinnable); risposta JSON {ok, why?}.
function respondGachaPost(res, url) {
  const p = url.split('?')[0];
  const json = (code, o) => { const b = Buffer.from(JSON.stringify(o), 'utf8'); res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': b.length }); res.end(b); };
  if (/^\/web\/gacha\/unpin$/i.test(p)) {
    if (player.gacha) delete player.gacha.pinned;
    savePlayer();
    return json(200, { ok: true });
  }
  const m = /^\/web\/gacha\/pin\/(\d+)$/i.exec(p);
  if (!m) return json(404, { ok: false, why: 'unknown route' });
  const banner = gachaData.bannerById(gachaCatalog().banners, m[1]);
  if (!banner) return json(404, { ok: false, why: 'unknown banner' });
  const story = storyCtx();
  if (!gacha.pinnable(banner, { storyQuest: story.storyQuest, sizes: GACHA_SIZES, show: GACHA_SHOW, periodStart: story.periodStart })) {
    return json(409, { ok: false, why: 'this banner cannot be kept in the Shop' });
  }
  (player.gacha ||= {}).pinned = banner.rowId;
  savePlayer();
  return json(200, { ok: true });
}

// POST /union/change (azione 74, Other > Transfer Unions > OK > scelta della Union > OK), corpo
// {unionId} 1-5. Stessa risposta della 71: solo userData.userDetail, i jewel il client li
// rilegge. «It will cost 100 Jewels»; i lux settimanali/mensili non li teniamo (niente da azzerare).
const UNION_CHANGE_COST = 100;
function respondUnionChange(res, body) {
  const now = serverTime();
  const id = Number(body?.unionId);
  if (id >= 1 && id <= 5 && id !== player.unionId && (player.freeStone || 0) >= UNION_CHANGE_COST) {
    console.log(`  [union] ${player.unionId} -> ${id}, -${UNION_CHANGE_COST} jewel`);
    player.unionId = id;
    player.freeStone -= UNION_CHANGE_COST;
    savePlayer();
  } else console.log(`  [union] rifiutato: unionId ${body?.unionId}, attuale ${player.unionId}, jewel ${player.freeStone || 0}`);
  send(res, 200, { ret: ret(), userData: { userPoint: userPointData(now), userDetail: userDetailData() } });
}

// Elemento giocatore (supportUsers di /stage/support/list, partyLeader e partyUserList del
// party): il giocatore stesso con una medaglia (userMedal, userSkills[], userAvatar).
// La medaglia condivisa (Share, player.supportUserMedalId) come userMedal; se manca, la prima dell'elenco
function sharedMedalData(now) {
  const list = userMedalsData(now);
  return list.find((u) => u.userMedalId === player.supportUserMedalId) || list[0];
}

function selfPlayerElement(now, medal, partyId = 0) {
  return {
    supportUserId: 1, level: luxRankFor(player.lux), unionId: player.unionId, userName: player.name,
    ...playerTitleIds(), addKizunaPoint: 0,
    keybladeId: favoriteKeyblade().keybladeId, partyId, isParty: partyId ? 1 : 0, isGuilt: 0, isLinkThumbnail: 0,
    userMedal: medal, userSkills: userSkillsData(now).filter((s) => s.userMedalId === medal.userMedalId),
    userAvatar: userAvatarData(),
    lastActionDatetime: now, earnLuxRank: 0,
  };
}

function userPointData(now) {
  const ap = apState();
  return {
    money: player.money || 0, // munny
    lux: player.lux, totalLux: player.lux, // lux e totalLux: uint64
    spherePoint: player.spherePoint || 0, // Avatar Coin
    kizunaPoint: 0, raidPoint: 0,
    // In battaglia il client mostra maxHp e colora l'HP in rapporto a hp/baseHp
    // (provato con 111/222/333): per un giocatore integro coincidono, dalla riga della tabella
    // player al rango Lux (3000 al livello 1, 3530 dal 200; I-032: prima sempre il livello 1).
    // attack/defense: somma di STR e DEF (livello 1) delle medaglie del deck. A 0 il
    // giocatore non ha difesa: nel Prologue moriva in un turno, e nel tutorial non si
    // poteva morire.
    ...deckStats(),
    // + i bonus dei nodi degli Avatar Boards (player.sphereBonus)
    baseHp: playerHp(), hp: playerHp(), ap: ap.ap,
    maxHp: playerHp(), maxAp: maxAp(),
    lastApDatetime: serverTimeAt(ap.time), // da qui il client conta la ricarica
    stageSpherePoint: 0, raidSpherePoint: 0, colosseumSpherePoint: 0,
    // da qui in poi uint
    specialPoint: 0, stageSkipTicket: player.stageSkipTicket || 0, superSkipTicket: player.superSkipTicket || 0, vipPoint: 0,
    // livello del Burst (pulsante rosso in battaglia, una volta per missione; il client non
    // lo crea a 0): +1 alla prima guilt di ogni medaglia, +5 alla prima guilt massima
    guiltBurstLv: guiltBurst().level(), multiPoint: 0, missionPoint: 0, limitedVipPoint: 0,
    drawTicket1: 0, drawTicket2: 0, drawTicket3: 0,
    // biglietti dei banner a tempo (Shop, payType 7/8/9 -> limitedDrawTicket1-3); payType 8:
    // la valuta stagionale elencata nello Shop (player.drawTickets, server/gacha.js ticketsOf; spec 9.7).
    // premi 40 Platinum Ticket e 41 Draw Ticket (anche Holiday Draw Ticket, Moogle Point, Spooky
    // Cookie: stessa valuta rinominata dall'evento); reference/missions/limited_rewards_map.md
    limitedDrawTicket1: player.limitedDrawTicket1 || 0, limitedDrawTicket2: gacha.ticketsOf(player)[player.gacha?.listedCurrency || 'draw'] || 0, limitedDrawTicket3: 0,
  };
}

// Skip del popup di avvio (I-203, docs/notes/mappe_storia.md#proud-start-popup-check): stageSkip 1 = Skip Ticket
// (pulsante «Skip», solo con i 3 obiettivi gia' compiuti: lo controlla il client), 2 = Skip Ticket+ («Force Skip»,
// anche con obiettivi mancanti). Il client salta la battaglia e manda subito /stage/clear con i premi calcolati da
// lui (score 0, nessun obiettivo nuovo); qui si scala solo il biglietto. AP spesi come per una partita normale.
const SKIP_TICKETS = { 1: 'stageSkipTicket', 2: 'superSkipTicket' };
function spendSkipTicket(stageSkip) {
  const kind = Number(stageSkip) || 0;
  if (!kind) return;
  const field = SKIP_TICKETS[kind];
  if (!field) { console.log(`[skip] stage ${player.currentStageId}: stageSkip ${kind} sconosciuto, nessun biglietto scalato`); return; }
  const have = player[field] || 0;
  if (have <= 0) { console.log(`[skip] stage ${player.currentStageId}: ${field} a 0, skip senza biglietto`); return; }
  player[field] = have - 1;
  console.log(`[skip] stage ${player.currentStageId}: ${field} ${have} -> ${player[field]}`);
}

function respondStageStart(res, req) {
  // POST /stage/start (azione 113). Corpo: stageId, supportUserId, userKeybladeId
  // (+ stageSkip, eventId, isSteal). Risposta, tutto obbligatorio: userData.userPoint,
  // userRandomEnemies[], userEnemyDropItems[], userTreasures[], startStageData, campaigns[],
  // luxMagnifications e supportUsers. Elementi: nemico (uniqueEnemyId, dropItemTypeIds
  // int[] <= 4, stealType), tesoro, startStageData (stageId, supportUserId uint64,
  // userKeybladeId uint64, clearMissionIds int[] <= 3, stageSkip, eventId,
  // highScore uint64).
  const now = serverTime();
  // /stage/clear non riporta lo stage: vale quello avviato qui
  // (la variante della Q555 cosi' com'e': i suoi drop; riga e punteggio dalla 18300, stageRowOf)
  player.currentStageId = Number(req?.stageId ?? START_STAGE_ID);
  player.stageInProgress = true; // /stage/clear lo spegne (ripiego della Q978 in respondStageClear)
  player.currentUserKeybladeId = Number(req?.userKeybladeId) || USER_KEYBLADE_ID; // gauge: setKeybladeBurst
  // costo in AP: campo useAp della tabella stage (Quest 130 = 10). Il client controlla
  // prima l'AP (popup PopupNormal_AP_Recovery se non basta); /stage/retire non rimborsa
  // Q978 (onlyDrama, solo filmato): useAp 0, nessun POI -> nessun drop ne' forziere; il client salta la mappa
  // (StageSkipActionMap) e manda subito /stage/clear (task-1-report D-B)
  const useAp = Number(stageRowOf(player.currentStageId)?.useAp) || 0;
  if (useAp) {
    const before = apState().ap;
    if (before < useAp) console.log(`[ap] stage ${player.currentStageId}: costo ${useAp} AP, disponibili ${before}`);
    console.log(`[ap] stage ${player.currentStageId}: -${useAp} AP -> ${changeAp(-useAp)}/${maxAp()}`);
  }
  spendSkipTicket(req?.stageSkip);
  player.currentStageSkip = Number(req?.stageSkip) || 0; // /stage/clear: uno skip non tocca il Lux Record
  savePlayer();
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(now) },
    startStageData: {
      stageId: req?.stageId ?? START_STAGE_ID,
      supportUserId: req?.supportUserId ?? 0,
      userKeybladeId: req?.userKeybladeId ?? USER_KEYBLADE_ID,
      clearMissionIds: stageClearMissions(storyKeyOf(req?.stageId ?? START_STAGE_ID)),
      stageSkip: req?.stageSkip ?? 0,
      eventId: req?.eventId ?? 0,
      highScore: 0,
    },
    userRandomEnemies: [],
    userEnemyDropItems: req?.isSteal ? applySteal(req?.stageId ?? START_STAGE_ID, stageEnemyDrops(req?.stageId ?? START_STAGE_ID))
      : (player.steal = null, stageEnemyDrops(req?.stageId ?? START_STAGE_ID)),
    userTreasures: stageTreasures(req?.stageId ?? START_STAGE_ID),
    campaigns: [],
    luxMagnifications: { campaign: 0, party: 0 },
    // l'amico scelto (supportUserId 1 = il giocatore stesso, /stage/support/list) con la medaglia condivisa:
    // con la lista vuota il client non ha la medaglia dell'amico da mettere nel deck della battaglia
    supportUsers: req?.supportUserId ? [selfPlayerElement(now, sharedMedalData(now))] : [],
    // deck senza gli slot vuoti per la battaglia (vedi sentKeybladeDeck); da verificare che il
    // client li rilegga dalla risposta 113 (I-075)
    userDecks: userDecksData(true),
  });
}

// Messaggio del Profilo di chi non ne ha scritto uno (ISSUES I-071). Il fumetto bianco
// sopra l'avatar della home e' MyPage_MpBaloon.json (nodi «avatarFukidashi_%d»): ogni tanto
// (circa 10% delle azioni casuali dell'avatar) il client vi scrive
// Txt_Comment_Label con userData.user.comment (fino a 256
// byte), senza controllare che sia vuoto: con comment "" il fumetto compare vuoto. Negli
// originali li' c'era il messaggio del Profilo (reference\profile: «For hearth and
// home!»; reference\home: «R.I.P. $5 VIP deal..»). Il campo Message accetta 20 caratteri;
// il testo d'esempio del layout originale e' «はじめまして！初心者なのでお手柔らかに！».
const DEFAULT_COMMENT = process.env.KHUX_DEFAULT_COMMENT ?? 'Nice to meet you!';

// userData.user: GET /user, /user/profile, POST /user/update
function userObject(now) {
  return {
    userId: 1, // uint64
    nativeUserId: 1, // uint64
    platformId: 0,
    userName: player.name, // max 32 byte
    gender: player.gender,
    // max 256 byte: messaggio del Profilo e fumetto della home; vuoto = DEFAULT_COMMENT
    comment: player.comment || DEFAULT_COMMENT,
    deviceType: 2,
    continueLoginCount: 1,
    isFleeze: 0,
    fleezedDatetime: now,
    isAdult: 1,
    nativeTagName: '', // max 14 byte; letto solo da GET /user (modo 1)
  };
}

function respondUser(res) {
  const now = serverTime();
  const userData = {
    user: userObject(now),
    userPoint: userPointData(now),
    userDetail: userDetailData(),
    stageResumption: stageResumptionData(),
    // trait in sospeso della fusione (I-084 A): con status 1 il client apre «There are traits that have not been set.»
    medalResumption: medalResumptionData(),
  };
  send(res, 200, { ret: ret(), userData, userPopUp: { isPopBenefitStone: 0 } });
}

// GET /mypage (azione 59), tutto
// obbligatorio e in quest'ordine: adminMypageTexts[] (type int, priority int,
// text stringa), openBanners[] (type, id, limitDate), userPresentCount int,
// isChangeCoordinate int, rankingRewards (7 int), backgroundId uint (riga di
// mypageBackground, senza riga crash; 150911 = sfondo predefinito),
// isNewAlbumChallenge uint, isMissionReward bool. Prima la dava lo schema generico
// (schemaResponse): stessi campi e valori, ora con una rotta propria.
// adminMypageTexts sono i testi dell'amministrazione: forse la striscia scorrevole sotto la
// barra in alto (negli originali «Tap the face icon to customize your avatar. Tap the
// screen to view party members' progress.», testo che non sta in text/ui), ma chi li legge
// non e' ancora trovato, ne' il significato di type/priority: solo con KHUX_MYPAGE_TICKER=1.
const MYPAGE_TICKER = "Tap the face icon to customize your avatar. Tap the screen to view party members' progress.";
function respondMyPage(res) {
  const body = schemaResponse('/mypage') || { ret: ret() };
  Object.assign(body, {
    adminMypageTexts: process.env.KHUX_MYPAGE_TICKER === '1'
      ? [{ type: Number(process.env.KHUX_MYPAGE_TICKER_TYPE || 1), priority: 1, text: MYPAGE_TICKER }] : [],
    openBanners: [],
    userPresentCount: livePresents().length, // badge «!» del pulsante Presents
    isChangeCoordinate: 0,
    backgroundId: body.backgroundId || 150911,
    isNewAlbumChallenge: 0,
    isMissionReward: false,
  });
  send(res, 200, body);
}

// GET /user/profile (azione 5, apertura del Profilo; corpo userId e
// platformType). Tutto obbligatorio: userData.user/userDetail/
// userPoint (come GET /user) e
// userData.lastActionDatetime; userMedals, userSkills,
// userAvatar; userKeyblade (oggetto), userRecord
// (55 contatori uint64), userRanking, party,
// linkPlatformId, isLinkThumbnail, userColosseumRanking, petBaseSlotMedal,
// userPvpRanking, followerNum, isFollow. Solo il profilo del giocatore.
const USER_RECORD_KEYS = ['login', 'continueLogin', 'getMoney', 'getSpherePoint', 'useMoney', 'sellMedal',
  'sellMedalCount', 'sellMaterial', 'sellMaterialCount', 'getKizunaPoint', 'useKizunaPoint', 'zukanMedal',
  'yamiSpeedZukan', 'yamiPowerZukan', 'yamiMagicZukan', 'hikariSpeedZukan', 'hikariPowerZukan',
  'hikariMagicZukan', 'getMedal', 'medalEnhanceSuccess', 'medalEnhanceBigSuccess', 'medalEnhanceGreatSuccess',
  'medalEvolveSuccess', 'keybladeEnhance', 'useMaterial', 'kizunaDraw', 'raiseDraw', 'getStar1Medal',
  'getStar2Medal', 'getStar3Medal', 'getStar4Medal', 'getStar5Medal', 'getStar6Medal', 'getStar7Medal',
  'stageClear', 'challengeClear', 'dropEnemy', 'dropMimic', 'dropRareEnemy', 'bossBattleJoinMe',
  'bossBattleJoinOther', 'dropBoss', 'getLux', 'getLuxMax', 'dropParts', 'maxDamageOneTurn', 'openTreasure',
  'getMaterial', 'openAllSphere', 'openGrid', 'unionPersonalRankingHighest', 'unionPartyRankingHighest',
  'totalPersonalRankingHighest', 'colosseumRankingHighest', 'pvpRankingRankHighest', 'pvpRankingClassHighest'];

// POST /user/update (azione 38, Name/Message del Profilo): {name, comment}; il
// client rilegge userData.user
function respondUserUpdate(res, body) {
  if (typeof body?.name === 'string' && body.name) player.name = body.name;
  if (typeof body?.comment === 'string') player.comment = body.comment;
  savePlayer();
  send(res, 200, { ret: ret(), userData: { user: userObject(serverTime()) } });
}

// POST /user/playstyle/update (azione 40) e /user/title/update (azione 41): il client rilegge
// userData.userDetail. I campi del corpo che userDetail conosce si salvano
// nel giocatore (playTimezones, playFrequently, titleLeftId/RightId/PlateId).
const USER_DETAIL_EDITABLE = ['playTimezones', 'playFrequently', 'titleLeftId', 'titleRightId', 'titlePlateId'];
function respondUserDetailUpdate(res, apiPath, body) {
  for (const k of USER_DETAIL_EDITABLE) if (body && k in body) player[k] = body[k];
  console.log(`[profilo] ${apiPath}: ${JSON.stringify(body)}`);
  savePlayer();
  send(res, 200, { ret: ret(), userData: { userDetail: userDetailData() } });
}

function respondUserProfile(res) {
  const now = serverTime();
  const userRecord = Object.fromEntries(USER_RECORD_KEYS.map((k) => [k, 0]));
  userRecord.login = 1;
  userRecord.getLux = player.lux || 0;
  send(res, 200, {
    ret: ret(),
    userData: {
      user: userObject(now),
      userPoint: userPointData(now),
      userDetail: userDetailData(),
      lastActionDatetime: now,
    },
    userMedals: userMedalsData(now),
    userSkills: userSkillsData(now),
    userAvatar: userAvatarData(),
    userKeyblade: userKeybladeData(favoriteKeyblade()), // il preferito
    userRecord,
    userRanking: { lux: 0, rank: 0 },
    party: {
      partyId: 0, unionId: player.unionId || 0, rank: 0, name: '', playStyle: 0, agreeType: 0, message: '',
      memberCount: 0, leaderUserId: 0, adminUserIds: [], leaderAppointDate: now, newcomerDate: now, chatId: 0,
      chatEndpointUrl: '',
    },
    linkPlatformId: '',
    isLinkThumbnail: 0,
    userColosseumRanking: {
      colosseumStageId: 0, colosseumStatus: 0, rank: 0,
      userColosseum: { userRank: 0, userStageCount: 0, userStageTotalCount: 0 },
    },
    // 6° slot del keyblade preferito (server/pet.js; 0 con KHUX_PET spento)
    petBaseSlotMedal: petBaseSlotMedal(player, deckIdOf(favoriteKeybladeId(), activeDeck(favoriteKeybladeId())),
      new Set(userMedalList().map((m) => m.userMedalId))),
    userPvpRanking: { rank: 0, class: 0, point: 0 },
    followerNum: 0,
    isFollow: 0,
  });
}

// Inventario del giocatore per tipo di oggetto, come lo usano le tabelle master
// (clearGetItemType, submissionRewardType, reward.type): 2 jewel (userStone.freeStone),
// 4 munny (userPoint.money), 5 materiale (userMaterials, id della tabella material),
// 14 Avatar Coin (userPoint.spherePoint: gli Avatar Boards sono le «sphere» del client,
// /user/sphere/buy sblocca i nodi, masu; CONGRATULATIONS: «Avatar Coin x6»),
// 3 medaglia (id della tabella medal: es. 90041 = Dewey ★ in The Dark Forest Pt. 2,
// riconosciuta confrontando la tabella stage con khuxwiki; una userMedal per copia).
// Gli altri tipi non sono ancora ricavati: si annotano nel log.
function grantItem(type, id, num) {
  num = Number(num) || 0;
  if (!type || !num) return;
  if (type === 3 && id) {
    player.medals = player.medals || [];
    for (let k = 0; k < num; k++) {
      // mai riusare un id (vendite e Level Up tolgono medaglie; medalState resta per id)
      const used = [100, ...player.medals.map((m) => m.userMedalId), ...Object.keys(player.medalState || {}).map(Number)];
      const userMedalId = Math.max(...used) + 1;
      player.medals.push({ userMedalId, medalId: id, level: 1, getDatetime: realNow() });
    }
    if (!masterRows('medal').some((m) => m.medalId === id)) console.log(`  [inventario] medaglia ${id} assente dalla tabella medal`);
  } else if (type === 2) player.freeStone = (player.freeStone || 0) + num;
  else if (type === 4) player.money = (player.money || 0) + num;
  else if (type === 14) player.spherePoint = (player.spherePoint || 0) + num;
  else if (type === 26) player.stageSkipTicket = (player.stageSkipTicket || 0) + num; // Skip Ticket (testo 102600058)
  else if (type === 28) player.superSkipTicket = (player.superSkipTicket || 0) + num; // Skip Ticket+ (102600065, «Force Skip»)
  // 11 Lux (testo 100200001)
  else if (type === 11) player.lux = (player.lux || 0) + num;
  else if (type === 5 && id) {
    player.materials = player.materials || {};
    player.materials[id] = (player.materials[id] || 0) + num;
  } else if (type === 13 && id) grantKeyblade(id); // keyblade (tabella keyblade)
  // 40 Platinum Ticket, 41 Draw Ticket (tipi 37-42: Bronze, Silver, Gold,
  // Platinum, Draw, Premium Ticket); si spendono nei banner dello Shop (rotte /gacha/*)
  else if (type === 40) player.limitedDrawTicket1 = (player.limitedDrawTicket1 || 0) + num;
  // 41: Draw Ticket (le valute stagionali arrivano con le loro Limited, sotto-progetto 3)
  else if (type === 41) gacha.ticketsOf(player).draw += num;
  // 7 titolo (userTitles), 20 parte dell'avatar (accessorio, userAvatarParts)
  else if (type === 7 && id) { player.titles = [...new Set([...(player.titles || []), id])]; }
  else if (type === 20 && id) { player.avatarParts = [...new Set([...(player.avatarParts || []), id])]; }
  // 33 parte dello Spirit (itemId = petPartsId; immagine img/petParts/pi%d)
  else if (type === 33 && id) { if (!PET_ENABLED || !pet().grantPart(id)) console.log(`  [inventario] parte dello Spirit ${id} gia' posseduta o assente`); }
  else console.log(`  [inventario] tipo ${type} (id ${id}, x${num}) non gestito`);
}

// userMaterials[]: userMaterialId uint64, materialId, number
function userMaterialsData() {
  return Object.entries(player.materials || {}).filter(([, n]) => n > 0)
    .map(([id, n]) => ({ userMaterialId: Number(id), materialId: Number(id), number: n }));
}

// Missione di storia (id 1-STORY_LAST = 979, piano 526-979 del 21-10; prima 525) piu' avanzata gia' superata. Il suo
// numero (stageNumber) va in lastStageId dei membri del party: la bolla della home in Quest Progress mostra il valore com'e' («Quest 5020» con lo stageId,
// «Quest 0» con 0; banco 16-10).
const STORY_LAST = 979;
function lastStoryStageId() {
  const done = new Set(Object.keys(player.stageScores || {}).map(Number));
  let best = null;
  for (const r of masterRows('stage')) {
    if (done.has(r.stageId) && r.id >= 1 && r.id <= STORY_LAST && (!best || r.id > best.id)) best = r;
  }
  return best ? best.stageId : 0;
}

function stageNumber(stageId) {
  if (!stageId) return 0;
  return stageRowOf(stageId)?.id ?? 0;
}

// Riga master dello stage che il client gioca. La Q555 (riga 18300, branchType 1, make-story-oltre.js) il client la
// carica come 18300 + unionId - 1 (5 varianti 18300-18304, una per Unione: Task 3 ne ha messo le uid sotto ognuna):
// se /stage/start riporta la variante, valgono la riga 18300 (AP, premi, obiettivi) e il suo stageId per
// stageScores/clearMissions, cosi' l'elenco passa alla 556. Forzieri e drop (STAGE_POI) restano dell'id ricevuto.
const BRANCH_VARIANTS = 5;
function stageRowOf(stageId) {
  const id = Number(stageId);
  const rows = masterRows('stage');
  return rows.find((r) => r.stageId === id)
    || rows.find((r) => r.branchType === 1 && id > r.stageId && id < r.stageId + BRANCH_VARIANTS);
}
const storyKeyOf = (stageId) => stageRowOf(stageId)?.stageId ?? Number(stageId);

// Titolo del giocatore (tabella title: due parole + targa, il cui label sceglie
// img/userTitle/title_%04d). Con 0 il Profilo va in crash. Di default i
// titoli di categoria 1 («Default Title»): «Budding Newbie» sulla targa di Budding.
function playerTitleIds() {
  return { titleLeftId: player.titleLeftId || 1001, titleRightId: player.titleRightId || 1002,
    titlePlateId: player.titlePlateId || 1001 };
}

// userData.userDetail, in GET /user e POST /stage/clear.
function userDetailData() {
  return {
    level: luxRankFor(player.lux), exp: 0, luxRank: luxRankFor(player.lux), luxGetRatio: 0,
    // maxDeckCost: con 0 «Begin» apre il popup di costo superato (PopupNormal_Cost_Over,
    // assente dalle risorse): crash. Dal campo cost della tabella player.
    ...playerTitleIds(),
    maxDeckCost: (masterRows('player').find((r) => r.lv === luxRankFor(player.lux))?.cost ?? 10) + sphereBonus().cost,
    playTimezones: player.playTimezones || [], // int[], al massimo 6 (Play Style del Profilo)
    playFrequently: player.playFrequently || 0,
    partyId: 0, // uint64
    // maxMedal: medaglie possedibili. Con 0 (e 3 medaglie) «Begin» apre il popup di
    // limite superato (PopupNormal_MedalOver.json, assente dalle risorse): crash.
    // 300 e' un segnaposto, il valore iniziale vero non e' noto; sempre sopra le medaglie
    // possedute (prova con tutte le medaglie: server/grant-all-medals.js)
    unionId: ensureUnion(),
    maxMedal: maxMedal(), mvpCount: 0,
    equipCoordinateNo: player.avatar ? AVATAR_COORDINATE : 0, // coordinato indossato (userAvatars)
    // numero della missione (campo id della tabella stage: Prologue = 1), non lo stageId
    // (1010): la schermata Quests lo confronta con misc 106 (130) per
    // sbloccare il quarto pulsante, e da sbloccato cerca un testo che non c'e' (crash).
    lastClearStageId: stageNumber(player.lastClearStageId),
    // isGuilt: con 0 niente pulsante del Burst, ne'
    // sblocco/rilancio della guilt e Magic Mirror nel Level Up: Power Bangle,
    // Quest 34 (isGuiltUnlocked). Il pulsante resta nascosto finche' guiltBurstLv e' 0.
    // isPet: 1 = pet sbloccato (6° slot, catena /pet/profile all'avvio): server/pet.js
    isGuilt: isGuiltUnlocked(), isPet: PET_ENABLED ? 1 : 0, pvpClass: 0, pvpMvpCount: 0, // uint
  };
}

// userData.stageResumption: 0 = niente da riprendere.
function stageResumptionData() {
  return { resumptionStatus: 0, stageId: 0, raidId: 0, colosseumStageId: 0 };
}

// prezzo del Continue in jewel: misc 113 (100), letto dal popup PopupNormal_Continue
const CONTINUE_STONE = 100;

function respondStageContinue(res, path, body) {
  // POST /stage/continue (azione 115, dopo il KO) e /stage/retire (114): il client
  // rilegge userKeyblades; retire anche userData.stageResumption.
  // Il Continue costa CONTINUE_STONE jewel (provato l'11 ottobre: prima restavano invariati);
  // il client li rilegge con GET /user/stone subito dopo.
  if (String(path).toLowerCase() === '/stage/continue') {
    player.freeStone = Math.max(0, (player.freeStone || 0) - CONTINUE_STONE);
    savePlayer();
  }
  if (String(path).toLowerCase() === '/stage/retire') { player.stageInProgress = false; savePlayer(); }
  // Give Up: «the special attack gauge will reset», il corpo porta {burst: 0}
  if (String(path).toLowerCase() === '/stage/retire' && typeof body?.burst === 'number') {
    setKeybladeBurst(body.burst);
    console.log(`[gauge] /stage/retire burst = ${body.burst}: salvata nel keyblade`);
    savePlayer();
  }
  send(res, 200, { ret: ret(), userKeyblades: userKeybladesData(), userData: { stageResumption: stageResumptionData() } });
}

// POST /shop/ap/recover (azione 72, corpo vuoto): recupero
// dell'AP con jewel dal popup PopupNormal_AP_Recovery (il testo
// mostra il prezzo: misc 112 = 100). Il client rilegge userData.userPoint
// e userKeyblades; i jewel li rilegge con GET /user/stone. Si aggiunge un
// pieno (maxAp) all'AP attuale, come il level up.
function respondApRecover(res) {
  const cost = miscValue(112, 100);
  if ((player.freeStone || 0) >= cost) {
    player.freeStone -= cost;
    const st = apState();
    player.ap = st.ap + maxAp();
    player.apTime = realNow();
    // «Fills special attack gauges of all Keyblades.» (testo del popup; dopo: «AP and special
    // attack gauges are fully restored!»): gauge di ogni keyblade al massimo della sua riga
    for (const k of ownedKeyblades()) {
      const full = (masterRows('keyblade').find((r) => r.keybladeId === k.keybladeId)?.maxBurstGauge || 0) * 10000;
      if (k.userKeybladeId === USER_KEYBLADE_ID) player.keybladeBurst = full;
      else {
        const kk = player.keyblades.find((x) => x.userKeybladeId === k.userKeybladeId);
        if (kk) kk.burst = full;
      }
    }
    console.log(`[ap] recupero: -${cost} jewel, AP ${st.ap} -> ${player.ap}/${maxAp()}, gauge dei keyblade al massimo`);
    savePlayer();
  } else console.log(`[ap] recupero: jewel insufficienti (${player.freeStone || 0} < ${cost})`);
  send(res, 200, { ret: ret(), userData: { userPoint: userPointData(serverTime()) }, userKeyblades: userKeybladesData() });
}

// EXP di skill dopo la missione (I-146): `gained` = getPoint.exp del client, uguale per ogni medaglia dei 5
// slot del deck del keyblade della missione (non il pet, non il supporto). Solo le skill salvate in
// player.medalSkills: le calcolate (Scrooge) sono gia' al massimo. Ritorna gli userSkillId saliti di livello.
function grantDeckSkillExp(gained) {
  const ups = [];
  if (!Number.isFinite(gained) || gained <= 0) return ups;
  const rows = skillRowsById();
  const expRows = new Map(masterRows('skillExp').map((r) => [r.expId, r.value]));
  for (const id of keybladeDeckIds(player.currentUserKeybladeId || USER_KEYBLADE_ID).slice(0, 5)) {
    const s = player.medalSkills?.[id];
    const row = s && rows.get(s.skillId);
    const expRow = row && expRows.get(row.expType);
    if (!expRow) continue;
    const r = medalSkill.addSkillExp(s, row, expRow, gained);
    if (r.level > s.level) ups.push(s.userSkillId);
    s.level = r.level;
    s.exp = r.exp;
  }
  return ups;
}

function respondStageClear(res, req) {
  // POST /stage/clear (azione 116). Risposta: userData.userPoint,
  // userData.userDetail, il risultato (stageRewardUserMedalIds[]
  // {rewardkind, userMedalId uint64, display}, poi per uno stage normale
  // highScoreReward[] (clearTimeMissionIds[] / pvpPointReward[] in altri modi),
  // firstClearFlag, stageOpenNum, clearMissionIds[], userPvpRanking {rank, class,
  // point}, status, userMaterials[], getLux uint64),
  // userData.stageResumption e guiltBurstFirstUserMedalIds[],
  // guiltBurstMaxUserMedalIds[].
  const now = serverTime();
  // il corpo non porta stageId (solo l'esito): lo stage e' quello di /stage/start
  // playedId = l'id giocato (POI, Steal); stageId = quello della riga master (la 18300 per le varianti della Q555)
  let playedId = Number(req?.stageId ?? player.currentStageId ?? START_STAGE_ID);
  // Ripiego per la Q978 (onlyDrama, fix round 1 del Task 6): se il client ne mandasse /stage/clear senza /stage/start
  // (salto della missione, non provato al banco), currentStageId sarebbe ancora la missione prima, gia'
  // finita. Nessuno stage in corso + currentStageId gia' finito + prossima missione di storia onlyDrama -> quella.
  const pending = player.stageInProgress;
  player.stageInProgress = false;
  if (req?.stageId === undefined && !pending && playedId in (player.stageScores || {})) {
    // la 978 Proud (1039158, onlyDrama) segue la Proud 977 allo stesso modo
    const next = stageRowOf(playedId)?.stageKind === PROUD_KIND ? nextProudRow() : nextStoryRow();
    if (next?.onlyDrama) {
      console.log(`[stage] /stage/clear senza /stage/start: ${next.stageId} (missione ${next.id}, solo filmato) al posto di ${playedId}`);
      playedId = next.stageId;
      player.currentStageId = playedId;
    }
  }
  const stage = stageRowOf(playedId);
  const stageId = stage ? stage.stageId : playedId;
  player.stageScores = player.stageScores || {};
  const first = !(stageId in player.stageScores); // mai completato prima
  // l'ultimo stage completato avanza solo (rigiocare il Prologue non lo riporta indietro)
  // (non le Proud: id 1 000 000 + numero, la schermata Quests confronta lastClearStageId con misc 106)
  if (stage?.stageKind !== PROUD_KIND && stageNumber(stageId) >= stageNumber(player.lastClearStageId)) player.lastClearStageId = stageId;
  // munny e materiali raccolti (sacchetti dei nemici, forzieri) come li riporta il client
  player.money = (player.money || 0) + (Number(req?.getPoint?.money) || 0);
  // gauge degli attacchi speciali: resta salvata nel keyblade (userKeyblades[].burst), non
  // riparte da 0 a ogni missione. Campo `burst` del corpo (banco: "burst":24000; prima si
  // prendeva il primo campo con burst nel nome, guiltBurstMaximumDamage = 0, e la gauge si azzerava)
  if (typeof req?.burst === 'number') {
    setKeybladeBurst(req.burst);
    console.log(`[gauge] /stage/clear burst = ${req.burst}: salvata nel keyblade`);
  }
  for (const m of req?.getMaterials || []) grantItem(5, m.materialId, m.number);
  // sacchetti dei nemici: il client riporta solo gli uid (getEnemyDropItems), il
  // contenuto e' la riga di reward del nemico nella mappa (1 se l'uid non ha record),
  // come in CONGRATULATIONS (es. Spring Water x12 in Combat 102)
  const enemyRows = new Map((poiOf(playedId)?.enemies || []).map((e) => [e.uid, e.reward]));
  const steal = player.steal?.stageId === playedId ? player.steal : null;
  for (const uid of req?.getEnemyDropItems || []) {
    const row = rewardRowById(enemyRows.get(uid) ?? 1);
    const k = steal && steal.uid === uid ? steal.mult : 1; // drop rubato dal pet (Steal): x skillValue3
    row?.type.forEach((t, i) => { if (t === ENEMY_DROP_TYPE) grantItem(t, row.id[i], row.num[i] * k); });
  }
  player.steal = null;
  // premio del primo completamento («Quest Complete!»: es. Combat 101, 300 jewel)
  if (first && stage?.validClearGetItem) {
    stage.clearGetItemType.forEach((t, i) => grantItem(t, stage.clearGetItemId[i], stage.clearGetItemNum[i]));
  }
  // clearMissionIds: le missioni compiute in questa partita, come le riporta il corpo
  // della richiesta; il client le spunta nella schermata RESULTS. Vuoto = nessuna spunta.
  // Le missioni sui Lux (submissionRequire 29, «Collect %d or more Lux») il client non
  // le riporta: le valuta il server sui Lux della partita (getPoint.lux), che
  // restituisce in getLux (la barra Lux di RESULTS).
  const lux = Number(req?.getPoint?.lux) || 0;
  const rankBefore = luxRankFor(player.lux);
  const apBefore = apState().ap; // con la soglia del livello di prima
  player.lux += lux; // userPoint.lux/totalLux e luxRank nella risposta: dopo lo stage
  // level up: si aggiunge un pieno di AP (il nuovo maxAp) a quello che c'era, anche
  // oltre il massimo (il client lo ammette: non ricarica sopra maxAp)
  if (luxRankFor(player.lux) > rankBefore) {
    player.ap = apBefore + maxAp();
    player.apTime = realNow();
    console.log(`[ap] level up ${rankBefore} -> ${luxRankFor(player.lux)}: AP ${apBefore} -> ${player.ap}/${maxAp()}`);
  }
  missionCount('quest', 1);
  missionCount('lux', lux);
  missionCount('enemy', Number(req?.enemyDeadNumber) || 0); // Limited «Defeat 100 enemies»
  weeklyLux(lux);
  const cleared = Array.isArray(req?.clearMissionIds) ? [...req.clearMissionIds] : [];
  (stage?.submissionRequire || []).forEach((kind, i) => {
    if (kind === 29 && lux >= (stage.submissionNum?.[i] ?? Infinity) && !cleared.includes(i + 1)) cleared.push(i + 1);
  });
  cleared.sort((a, b) => a - b).splice(3);
  // «Must clear all together» (combinedSubmissionFlag 1, Proud 801+, I-200): il client riporta ogni obiettivo da solo
  // (/stage/clear non usa il flag, ricerca del 22-10): valgono solo se nella stessa partita ci sono tutti
  const all = Array.from({ length: Math.min(3, stage?.validSubmission || 0) }, (_, i) => i + 1);
  if (stage?.combinedSubmissionFlag && all.length && !all.every((n) => cleared.includes(n))) {
    if (cleared.length) console.log(`[stage] ${stageId}: obiettivi ${cleared} senza gli altri (tutti insieme): non contano`);
    cleared.length = 0;
  }
  // premio di ogni obiettivo compiuto per la prima volta («Objective Complete!»)
  const before = stageClearMissions(stageId);
  for (const n of cleared.filter((n) => !before.includes(n))) {
    grantItem(stage?.submissionRewardType?.[n - 1], stage?.submissionItemId?.[n - 1], stage?.submissionItemNum?.[n - 1]);
  }
  player.clearMissions[stageId] = [...new Set([...before, ...cleared])].sort((a, b) => a - b).slice(0, 3);
  // stage completato, con il record di Lux (Lux Record nell'elenco delle missioni); uno skip (Skip Ticket o
  // Skip Ticket+, I-203) segna la missione come superata ma non alza il record (decisione dell'utente, 23-10)
  const skipped = !!player.currentStageSkip;
  player.currentStageSkip = 0;
  player.stageScores[stageId] = skipped ? (player.stageScores[stageId] || 0) : Math.max(player.stageScores[stageId] || 0, lux);
  // EXP di skill del combattimento (getPoint.exp) a ogni medaglia del deck con una skill salvata
  const skillUps = grantDeckSkillExp(Number(req?.getPoint?.exp));
  if (skillUps.length) console.log(`[skill] salite di livello: userSkillId ${skillUps.join(', ')}`);
  savePlayer();
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(now), userDetail: userDetailData(), stageResumption: stageResumptionData() },
    stageRewardUserMedalIds: [],
    highScoreReward: [], clearTimeMissionIds: [], pvpPointReward: [],
    firstClearFlag: first ? 1 : 0,
    stageOpenNum: 1,
    clearMissionIds: cleared,
    userPvpRanking: { rank: 0, class: 0, point: 0 },
    status: 0,
    userMaterials: userMaterialsData(),
    getLux: lux, // uint64
    // stage normale: anche pet.userPetParts[] ed
    // (emblemIds[]), entrambi obbligatori (senza: «200 ERROR :116»)
    pet: { userPetParts: PET_ENABLED ? pet().ownedParts() : [] },
    emblemIds: [],
    // poi, tutti obbligatori e in quest'ordine, l'inventario aggiornato:
    // userMaterials, userMedals, userSkills, userTitles, userKeyblades,
    // userDecks, userAvatarParts, subslot, infine getLux
    userMedals: userMedalsData(now),
    userSkills: userSkillsData(now),
    userTitles: [],
    userKeyblades: userKeybladesData(),
    userDecks: userDecksData(),
    userAvatarParts: [],
    subslotMaxNum: kbEvo().subslotMaxNum(),
    userKeybladeSubslots: userKeybladeSubslotsData(),
    ...guiltBurst().lists(), // guiltBurstFirst/MaxUserMedalIds
  });
}

// ---------------------------------------------------------------------------
// Inventario iniziale e storia: il minimo per la prima battaglia del tutorial.
// Gli id rimandano alle tabelle master della 5.0.1 offline (keyblade 1000 =
// Starlight, stage 1010 = Prologue). La tabella medal non c'e': deck senza medaglie.
// ---------------------------------------------------------------------------
const START_STAGE_ID = Number(process.env.KHUX_START_STAGE || 1010);
const USER_KEYBLADE_ID = 1;
const USER_DECK_ID = 1;
const USER_KEYBLADE_SUBSLOT_ID = 1;

// Righe di un master in cache, rilette solo se il file cambia (mtime/dimensione). Prima ogni
// chiamata rileggeva e decodificava il file: medal.json (migliaia di righe) veniva riletto
// decine di volte per una sola vendita di medaglie. Si restituisce una copia dell'array
// (un sort/push del chiamante non tocca la cache); le righe sono condivise: solo lettura.
const masterCache = new Map();
function masterRows(name) {
  const file = path.join(MASTER_DIR, name + '.json');
  try {
    const st = fs.statSync(file);
    const c = masterCache.get(name);
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.rows.slice();
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    masterCache.set(name, { mtimeMs: st.mtimeMs, size: st.size, rows });
    return rows.slice();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Avatar Boards (le «sphere» del client; master sphere/sphereArray/sphereMasu in server/tables,
// protocollo in stage_gen/boards/SERVER.md). player.sphere[sphereBoardId] = {id, unlock[],
// getDatetime}: le bacheche si aprono col livello (openParam <= rango Lux); unlock = numeri
// dei nodi 1..23 (indice negli array di sphereMasu, valore della cella in spCol0..4).
// ---------------------------------------------------------------------------
function sphereNodes(board) {
  const arr = masterRows('sphereArray').find((r) => r.arryId === board.arryId);
  const nodes = new Set();
  for (const k of ['spCol0', 'spCol1', 'spCol2', 'spCol3', 'spCol4']) {
    for (const v of arr?.[k] || []) if (v >= 1 && v <= 23) nodes.add(v);
  }
  return [...nodes].sort((a, b) => a - b);
}

function sphereBoards() {
  player.sphere = player.sphere || {};
  const level = luxRankFor(player.lux);
  for (const b of masterRows('sphere')) {
    if (b.price || b.openParam > level || player.sphere[b.sphereBoardId]) continue;
    const id = Math.max(0, ...Object.values(player.sphere).map((s) => s.id)) + 1;
    player.sphere[b.sphereBoardId] = { id, unlock: [], getDatetime: realNow() };
  }
  return player.sphere;
}

function userSphereData(sphereBoardId) {
  const s = sphereBoards()[sphereBoardId];
  const board = masterRows('sphere').find((r) => r.sphereBoardId === Number(sphereBoardId));
  const done = board && sphereNodes(board).every((n) => s.unlock.includes(n));
  return { userSphereBoardId: s.id, sphereBoardId: Number(sphereBoardId), isBuy: 1, status: done ? 3 : 1,
    unlockMasuIds: s.unlock.slice(0, 23), getDatetime: outTime(s.getDatetime, serverTime()) };
}

function userSphereAll() {
  return { userSphereDatas: Object.keys(sphereBoards()).map(userSphereData), notChargedSphereBoardIds: [] };
}

// POST /user/sphere/check (azioni 60/61): ogni voce di userSphereDatas e' per il client una
// bacheca appena sbloccata, da cui la home, i
// risultati e l'elenco delle bacheche aprono il popup BattleResult_LB_ver120,
// una volta per voce. Si mandano solo le bacheche non ancora annunciate (player.sphereNotified);
// l'array vuoto svuota l'elenco, la chiave mancante lo lascerebbe com'e'. L'elenco completo
// arriva da GET /user/sphere. Salvataggi di prima: le bacheche gia' possedute contano come annunciate.
function respondSphereCheck(res) {
  const owned = Object.keys(sphereBoards());
  if (!player.sphereNotified) player.sphereNotified = owned.map(Number);
  const fresh = owned.filter((id) => !player.sphereNotified.includes(Number(id)));
  player.sphereNotified.push(...fresh.map(Number));
  savePlayer();
  const userSphere = { userSphereDatas: fresh.map(userSphereData), notChargedSphereBoardIds: [] };
  send(res, 200, { ret: ret(), userSphere, closeEventSphereBoardIds: [] });
}

// premio di un nodo (rewardSelect di sphereMasu): 12 HP, 21 AP, 22 costo del deck (bonus sommati
// in userPointData/userDetailData), 3 medaglia, 19/20/23 parti dell'avatar
function grantSphereReward(masu, i) {
  const sel = masu.rewardSelect[i], id = masu.rewardId[i], val = masu.rewardValue[i] || 1;
  const bonus = player.sphereBonus = player.sphereBonus || { hp: 0, ap: 0, cost: 0 };
  if (sel === 12) bonus.hp += val;
  else if (sel === 21) bonus.ap += val;
  else if (sel === 22) bonus.cost += val;
  else if (sel === 3) grantItem(3, id, 1);
  else if (sel === 19 || sel === 20 || sel === 23) player.avatarParts = [...new Set([...(player.avatarParts || []), id])];
  else if (sel === 2) grantItem(2, 0, val);
  else console.log(`  [sphere] premio rewardSelect ${sel} (id ${id}) non gestito`);
}

// POST /user/sphere/update (azione 44): {sphereBoardId, releaseMasuId} o {releaseMasuId 0, allOpen 1}.
// Si scalano gli Avatar Coin, si danno i premi e, a bacheca completa, il titolo 2000+N
function respondSphereUpdate(res, req) {
  const now = serverTime();
  const snap = inventorySnapshot(now); // solo le voci toccate dai premi (vedi inventoryBlocks)
  const boardId = Number(req?.sphereBoardId);
  const board = masterRows('sphere').find((r) => r.sphereBoardId === boardId);
  const s = sphereBoards()[boardId];
  if (board && s) {
    const masu = masterRows('sphereMasu').find((r) => r.masuId === board.masuId);
    const todo = req?.allOpen ? sphereNodes(board).filter((n) => !s.unlock.includes(n))
      : [Number(req?.releaseMasuId)].filter((n) => n >= 1 && n <= 23 && !s.unlock.includes(n));
    const cost = todo.reduce((t, n) => t + (masu?.spherePoint[n - 1] || 0), 0);
    if (masu && todo.length && cost <= (player.spherePoint || 0)) {
      player.spherePoint -= cost;
      for (const n of todo) { s.unlock.push(n); grantSphereReward(masu, n - 1); }
      if (sphereNodes(board).every((n) => s.unlock.includes(n))) {
        const title = 2000 + (boardId - 2100000);
        if (masterRows('title').some((t) => t.titleId === title)) player.titles = [...new Set([...(player.titles || []), title])];
      }
      console.log(`[sphere] bacheca ${boardId}: nodi ${todo.join(',')} (-${cost} Avatar Coin)`);
    } else console.log(`[sphere] sblocco rifiutato: bacheca ${boardId}, nodi ${todo.join(',') || '-'}, costo ${cost}`);
  }
  savePlayer();
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(now), userDetail: userDetailData() },
    userSphere: { userSphereDatas: s ? [userSphereData(boardId)] : [], notChargedSphereBoardIds: [] },
    ...inventoryBlocks(now, snap),
  });
}

// Liste dell'inventario delle risposte 44/49/190.
// Ogni chiave e' OBBLIGATORIA: chiave assente o non array = errore
// della risposta. Ma l'array vuoto e' valido e il client NON sostituisce le
// liste: userMaterials/userMedals/userSkills passano voce per voce per un upsert per id (non nel
// Level Up, azione 55: li' userSkills sono le skill da togliere, vedi respondMedalEnhance;
// materiali con number 0 = tolti), e il client
// ricopia tutto l'elenco a ogni voce: con ~2000 medaglie il costo e' quadratico,
// ~6,5 s di attesa dopo ogni sblocco di nodo (banco 14 ottobre, come I-083 per il Level Up).
// Con snap (inventorySnapshot preso prima dei premi) si mandano solo le voci nuove o cambiate;
// se una voce e' sparita (l'upsert non sa togliere medaglie/skill) si rimanda la lista intera.
// KHUX_FULL_INVENTORY=1 torna alle liste complete. Le altre liste restano complete (piccole;
// keyblade/deck/parti/titoli non verificati, sub-slot e Burst li sostituiscono).
const INVENTORY_DELTA = { userMaterials: 'userMaterialId', userMedals: 'userMedalId', userSkills: 'userSkillId' };
const FULL_INVENTORY = process.env.KHUX_FULL_INVENTORY === '1';

function inventoryDeltaLists(now) {
  return { userMaterials: userMaterialsData(), userMedals: userMedalsData(now), userSkills: userSkillsData(now) };
}

function inventorySnapshot(now) {
  if (FULL_INVENTORY) return null;
  const lists = inventoryDeltaLists(now), snap = {};
  for (const [k, id] of Object.entries(INVENTORY_DELTA)) snap[k] = new Map(lists[k].map((e) => [e[id], JSON.stringify(e)]));
  return snap;
}

function inventoryBlocks(now, snap = null) {
  const lists = inventoryDeltaLists(now);
  if (snap) {
    for (const [k, id] of Object.entries(INVENTORY_DELTA)) {
      const cur = new Set(lists[k].map((e) => e[id]));
      if ([...snap[k].keys()].some((x) => !cur.has(x))) continue; // voce sparita: lista intera
      lists[k] = lists[k].filter((e) => snap[k].get(e[id]) !== JSON.stringify(e));
    }
  }
  return {
    ...lists, // userMaterials, userMedals, userSkills
    userKeyblades: userKeybladesData(),
    userDecks: userDecksData(),
    userAvatarParts: userAvatarPartsData(),
    userTitles: userTitlesData(),
    pet: { userPetParts: PET_ENABLED ? pet().ownedParts() : [] },
    emblemIds: [],
    subslotMaxNum: kbEvo().subslotMaxNum(),
    userKeybladeSubslots: userKeybladeSubslotsData(),
    ...guiltBurst().lists(), // guiltBurstFirst/MaxUserMedalIds
  };
}

// userTitles[] {userTitleId uint64, titleId}: categoria 1 («Default Title») e titoli guadagnati
function userTitlesData() {
  const ids = [...new Set([...masterRows('title').filter((r) => r.category === 1).map((r) => r.titleId),
    ...(player.titles || [])])];
  return ids.map((titleId, i) => ({ userTitleId: i + 1, titleId }));
}

// ---------------------------------------------------------------------------
// Missioni (master `mission`, server/tables/mission.json; formato in stage_gen/missions/NOTE.md
// e docs/notes/home_profilo.md#missioni). La scheda la decide SOLO il client, dal campo
// missionType della riga del master:
// 1 Beginner, 2 Daily, 3 Weekly (party), 4 Limited; il server manda tutte le righe attive
// in un unico missions[]. Il periodo: giornaliere da startDate + k giorni (l'ora di
// startDate e' anche quella del conto alla rovescia del client),
// settimanali da startDate + k settimane, Beginner e Limited senza azzeramento (valgono
// fino a beginnerLimitTime / endDate). conditionId: 1 quest completate, 3/6 Raid Boss,
// 4/9 Lux, 12 Union Cross, 28 PVP (6, 9 e 12 sono del party: senza party si contano quelli
// del giocatore).
// ---------------------------------------------------------------------------
// 35 (Beginner «Draw Medal x N»): un'unita' per ogni POST /gacha/draw riuscita, di qualunque taglia (respondGachaDraw).
const MISSION_COUNTER = { 1: 'quest', 3: 'raid', 6: 'raid', 4: 'lux', 9: 'lux', 12: 'union', 28: 'pvp', 50: 'enemy', 35: 'draw' };
// Limited (missionType 4, make-limited-missions.js): una campagna mensile dei Lux e una breve
// settimanale a rotazione, dall'ORA REALE (quella del server riparte dal 15-5-2021 a ogni avvio:
// la rotazione resterebbe ferma). Il periodo di una riga = numero del mese/della settimana reale,
// cosi' una campagna che ritorna riparte da zero. Settimana da lunedi' 08:00 UTC.
const LIMITED_ROTATION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'limited_rotation.json'), 'utf8')); } catch { return { monthly: [], weekly: [] }; }
})();
const LIMITED_GROUP = new Map();
LIMITED_ROTATION.monthly.forEach((ids, i) => ids.forEach((id) => LIMITED_GROUP.set(id, { kind: 'monthly', index: i })));
LIMITED_ROTATION.weekly.forEach((ids, i) => ids.forEach((id) => LIMITED_GROUP.set(id, { kind: 'weekly', index: i })));
function limitedPeriod(kind, realMs = realNow()) {
  return kind === 'monthly' ? clock.monthIndex(realMs) : clock.weekIndex(realMs);
}
function limitedActive(id, realMs = realNow()) {
  const g = LIMITED_GROUP.get(id);
  if (!g) return false;
  const n = LIMITED_ROTATION[g.kind].length;
  return limitedPeriod(g.kind, realMs) % n === g.index && limitedUnlocked(g);
}
// Campagne settimanali che regalano una medaglia (weeklyMedalFrom, make-limited-missions.js): solo dalla tranche
// della storia con quella data, come i banner dello Shop (decisione dell'utente 19-10: W04 regala SN++ - FF7R
// Aerith 7★, aprile 2020); prima la settimana resta senza campagna breve (la mensile dei Lux c'e' sempre).
// I premi Platinum/Draw Ticket (rewardType 40/41) delle righe di un gruppo compaiono solo dopo lo sblocco di un banner
// che li spende (gacha.ticketUnlockQuest, sp3 5); soglie calcolate una volta per catalogo, valgono anche per le mensili.
let limitedTicketMemo = null;
function limitedGroupQuest(g) {
  const cat = gachaCatalog();
  if (limitedTicketMemo?.cat !== cat) limitedTicketMemo = { cat, byGroup: new Map() };
  const key = `${g.kind}${g.index}`;
  if (!limitedTicketMemo.byGroup.has(key)) {
    const ids = new Set(LIMITED_ROTATION[g.kind][g.index]);
    const types = new Set(masterRows('mission').filter((r) => ids.has(r.id) && (r.rewardType === 40 || r.rewardType === 41)).map((r) => r.rewardType));
    limitedTicketMemo.byGroup.set(key, Math.max(0, ...[...types].map((t) => gacha.ticketUnlockQuest(cat.banners, t, GACHA_SIZES))));
  }
  return limitedTicketMemo.byGroup.get(key);
}
let storyQuestForced = null; // solo per i test: un giocatore finto oltre le soglie dei biglietti senza giocare la storia
function limitedUnlocked(g) {
  const storyQuest = storyQuestForced ?? stageNumber(lastStoryStageId());
  const from = g.kind === 'weekly' ? (LIMITED_ROTATION.weeklyMedalFrom || [])[g.index] : null;
  return (!from || gachaData.storyDay(gachaCatalog(), storyQuest) >= from) && storyQuest >= limitedGroupQuest(g);
}
// Condizioni delle Beginner (make-beginner-missions.js) calcolate dallo stato del giocatore a ogni elenco,
// non da un contatore: 30 storia superata fino alla quest targetId, 31 STR del keyblade preferito,
// 32 livello +N della serie di keyblade targetId (category), 33 Lux totali, 34 medaglie con lo Special
// Attack Bonus al massimo del tier, 39 livello del Nova (= Guilt Burst, userPoint.guiltBurstLv: +1 alla prima guilt di
// ogni medaglia, +5 alla prima guilt massima), 40 rango dello Spirit (rango della Gear di pet.js, 17 gradini da petRank).
// 41 Proud Mode: Proud superate fino alla 3 (I-200).
// 35 (Draw Medal) e' un contatore ('draw'). 36-38 e 42-44 (quest speciali, eventi, Colosseo, Union Cross) non
// hanno ancora la funzione nel server (nessuno stage di quel tipo, tabelle evStage/colosseum vuote, Union Cross senza
// Photon) e restano a 0, come il 3 (Raid Boss: nessun contatore 'raid' chiamato).
const MISSION_DERIVED = {
  // la storia piu' avanzata dagli stage superati (1-979), non lastClearStageId: i Tour (id 91xx) lo portano oltre la storia
  30: (r) => (stageNumber(lastStoryStageId()) >= (r.targetId?.[0] || 0) ? 1 : 0),
  31: () => keybladeDeckStats(favoriteKeybladeId()).attack || 0,
  32: (r) => {
    const rows = masterRows('keyblade');
    const lv = ownedKeyblades().map((k) => rows.find((x) => x.keybladeId === k.keybladeId))
      .filter((x) => x && x.category === r.targetId?.[0]).map((x) => x.lv || 0);
    return lv.length ? Math.max(...lv) : 0;
  },
  33: () => player.lux || 0,
  34: () => {
    const medals = new Map(masterRows('medal').map((m) => [m.medalId, m]));
    const prob = masterRows('guiltProb');
    return userMedalList().filter((u) => {
      const tier = medals.get(u.medalId)?.guiltValue || 0;
      const max = tier ? medalGuilt.guiltRange(prob, tier).max : 0;
      return max > 0 && (u.guiltFactor || 0) >= max;
    }).length;
  },
  39: () => guiltBurst().level(),
  // 41 «Complete up to story quest 3 in Proud Mode» (targetId 0 nella riga: la quest 3 della frase): Proud superate (I-200)
  41: (r) => (lastProudNumber() >= (r.targetId?.[0] || 3) ? 1 : 0),
  40: () => petSubslotNow().rank || 0,
};
const missionProgress = (row, s) => (MISSION_DERIVED[row.conditionId] ? MISSION_DERIVED[row.conditionId](row) : s.count);
// Durata della scheda Beginner dal primo elenco (ipotesi: il valore originale non e' noto)
const BEGINNER_DAYS = Number(process.env.KHUX_BEGINNER_DAYS || 30);

const masterDateMs = (d) => Date.parse(String(d).replace(' ', 'T') + 'Z');

// indici di periodo sull'ORA REALE (clock.js): giorno e settimana da 08:00 UTC, mese dal giorno 1 08:00
function missionPeriod(row, realMs) {
  if (row.missionType === 4 && LIMITED_GROUP.has(row.id)) {
    return LIMITED_GROUP.get(row.id).kind === 'monthly' ? clock.monthIndex(realMs) : clock.weekIndex(realMs);
  }
  if (row.missionType === 2) return clock.dayIndex(realMs);
  if (row.missionType === 3) return clock.weekIndex(realMs);
  return 0;
}

// Righe che il client puo' mostrare: scheda 1-4 (le altre le ignora), gia' iniziate, non
// scadute; le Beginner solo fino a beginnerLimitTime.
// Le date del master sono finte: si confrontano con l'ora finta.
function missionActive(row, realMs) {
  if (!(row.missionType >= 1 && row.missionType <= 4)) return false;
  const fakeMs = clock.fake(realMs, clockOffset());
  if (fakeMs < masterDateMs(row.startDate) || fakeMs >= masterDateMs(row.endDate)) return false;
  if (row.missionType === 1) {
    beginnerLimitTime(); // fissa beginnerSince al primo elenco
    return realMs < player.beginnerSince + BEGINNER_DAYS * 86400000;
  }
  if (row.missionType === 4 && LIMITED_GROUP.size) return limitedActive(row.id, realMs) && !limitedGone(row, realMs);
  if (row.missionType === 3) return weeklyActive(row, realMs);
  return true;
}

// beginnerLimitTime di /user/mission/list e /receive: null senza righe Beginner (il client lo
// usa solo per l'etichetta del tempo delle missionType 1); altrimenti la scadenza della
// scheda, BEGINNER_DAYS dal primo elenco (player.beginnerSince)
function beginnerLimitTime() {
  if (!masterRows('mission').some((r) => r.missionType === 1)) return null;
  if (!player.beginnerSince) player.beginnerSince = realNow();
  return serverTimeAt(player.beginnerSince + BEGINNER_DAYS * 86400000);
}

// contatori del periodo corrente di ogni missione: player.missions[id] = {period, count, received}
function missionState(row, realMs) {
  player.missions = player.missions || {};
  const period = missionPeriod(row, realMs);
  let s = player.missions[row.id];
  if (s && s.period !== period && s.received && limitedUnique(row)) markLimitedOnce(row.id);
  if (!s || s.period !== period) s = player.missions[row.id] = { period, count: 0, received: false };
  return s;
}

// Limited con premio unico (medaglia 3, titolo 7, parte dell'avatar 20, parte dello Spirit 33): si riscuotono una
// volta sola (decisione dell'utente 19-10, I-168). Quando la campagna ritorna nella rotazione la missione non si
// mostra se e' gia' stata riscossa (player.limitedOnce, anche finita nei Presents a fine periodo) o se il titolo o
// la parte sono gia' posseduti per altra via (niente premi fantasma); nel periodo della riscossione resta visibile.
const UNIQUE_REWARD_TYPES = new Set([3, 7, 20, 33]);
const limitedUnique = (row) => row.missionType === 4 && UNIQUE_REWARD_TYPES.has(row.rewardType);
function markLimitedOnce(id) { (player.limitedOnce ||= {})[id] = 1; }
function limitedGone(row, realMs) {
  if (!limitedUnique(row)) return false;
  const s = player.missions?.[row.id];
  if (s && s.received && s.period === missionPeriod(row, realMs)) return false;
  if (player.limitedOnce?.[row.id] || (s && s.received)) return true;
  if (row.rewardType === 33) return !!player.pet?.parts?.[row.itemId];
  if (row.rewardType === 7) return (player.titles || []).includes(row.itemId);
  if (row.rewardType === 20) return (player.avatarParts || []).includes(row.itemId);
  return false;
}

// Lux della settimana (bolla della home «Weekly Lux» dei membri del party, userRanking.lux): stessa settimana
// delle missioni settimanali (missionType 3), player.weeklyLux = {period, lux}. weeklyLux(n) aggiunge, weeklyLux() legge.
function weeklyLux(n = 0) {
  const period = clock.weekIndex(realNow());
  if (!player.weeklyLux || player.weeklyLux.period !== period) player.weeklyLux = { period, lux: 0 };
  player.weeklyLux.lux += n;
  return player.weeklyLux.lux;
}

function missionCount(counter, n) {
  if (!n) return;
  const nowMs = realNow();
  for (const row of masterRows('mission')) {
    if (MISSION_COUNTER[row.conditionId] === counter && missionActive(row, nowMs)) missionState(row, nowMs).count += n;
  }
}

// missions[] di /user/mission/list e /user/mission/receive: solo id del master (altrimenti il
// client va in crash), status 0 in corso, 1 da riscuotere, 2 riscossa
function missionsData() {
  const nowMs = realNow();
  return masterRows('mission').filter((r) => missionActive(r, nowMs)).map((r) => {
    const s = missionState(r, nowMs);
    const goal = r.targetNum?.[0] || 1;
    const count = missionProgress(r, s);
    const done = count >= goal;
    return { id: r.id, status: s.received ? 2 : done ? 1 : 0, numUpper: Math.min(count, goal), numLower: goal };
  });
}

// POST /user/mission/receive (azione 190): {receiveMissionIds}; premio rewardType/itemId/itemNum,
// poi la lista aggiornata e l'inventario completo, come /stage/clear
function respondMissionReceive(res, req) {
  const now = serverTime();
  const snap = inventorySnapshot(now); // solo le voci toccate dai premi (vedi inventoryBlocks)
  const nowMs = realNow();
  const rows = new Map(masterRows('mission').map((r) => [r.id, r]));
  for (const id of req?.receiveMissionIds || []) {
    const r = rows.get(id);
    if (!r || !missionActive(r, nowMs)) continue;
    const s = missionState(r, nowMs);
    if (s.received || missionProgress(r, s) < (r.targetNum?.[0] || 1)) continue;
    s.received = true;
    if (limitedUnique(r)) markLimitedOnce(r.id);
    grantItem(r.rewardType, r.itemId, r.itemNum);
  }
  savePlayer();
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(now), userDetail: userDetailData() },
    missions: missionsData(), beginnerLimitTime: beginnerLimitTime(),
    userSphere: userSphereAll(),
    ...inventoryBlocks(now, snap),
  });
}

// Chiusura dei periodi (spec 3.6): a ogni richiesta, se il giorno/settimana/mese reale e' avanzato
// dall'ultima chiusura, i premi delle missioni completate e non riscosse del periodo finito vanno nei
// Presents, una volta (s.received). Prima volta: si registra solo l'istante, nessuna consegna.
const SETTLE_COMMENT = { 2: 'Daily Mission reward', 3: 'Weekly Mission reward', 4: 'Limited Mission reward' };
function settleClock(realMs = realNow()) {
  const cur = { day: clock.dayIndex(realMs), week: clock.weekIndex(realMs), month: clock.monthIndex(realMs) };
  const st = player.clockSettled;
  if (st && st.day === cur.day && st.week === cur.week && st.month === cur.month) return;
  if (st) {
    for (const row of masterRows('mission')) {
      const s = (player.missions || {})[row.id];
      if (!s || s.received || !SETTLE_COMMENT[row.missionType] || s.period === missionPeriod(row, realMs)) continue;
      if (s.count >= (row.targetNum?.[0] || 1) || (MISSION_DERIVED[row.conditionId] && missionProgress(row, s) >= (row.targetNum?.[0] || 1))) {
        s.received = true;
        if (limitedUnique(row)) markLimitedOnce(row.id);
        addPresent(row.rewardType, row.itemId, row.itemNum, SETTLE_COMMENT[row.missionType]);
        console.log(`[missioni] ${row.id} non riscossa a fine periodo: premio nei Presents`);
      }
    }
  }
  player.clockSettled = cur;
  savePlayer();
}

// GET /user/mission (azione 187, all'ingresso della home): il client legge solo
// "id" (day/isFinish solo per l'azione 183 /user/mission/update). Non e' la finestra
// Missioni: id e' la riga di un'altra tabella master (stage e intervallo); id 0 =
// nessuna, il client prosegue.
function respondUserMission(res) {
  send(res, 200, { ret: ret(), id: 0, day: 0, isFinish: false });
}

// Pagina della WebView «Beginner's Guide» (login.beginnersGuide): le missioni Daily/Weekly
// dal master con premi e orari di azzeramento, e le basi della guida dell'utente
// (reference\guida_basi). Stesso stile della pagina /web/passive.
function respondBeginnerPage(res) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = masterRows('mission');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const section = (type, title, reset) => {
    const list = rows.filter((r) => r.missionType === type).sort((a, b) => (a.sortId || 0) - (b.sortId || 0));
    if (!list.length) return '';
    const items = list.map((r) => `<li>${esc(r.missionName)}<span>${r.rewardType === 2 ? 'Jewel' : 'Reward'} x${esc(r.itemNum)}</span></li>`).join('');
    return `<h2>${title}</h2><p>${reset(list[0])}</p><ul>${items}</ul>`;
  };
  const hour = (r) => String(r.startDate).slice(11, 16);
  const html = '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{margin:0;padding:12px;background:#08304f;color:#fff;font:18px sans-serif}'
    + 'h2{font-size:20px;color:#ffe27a;margin:18px 0 6px}p{margin:4px 0 8px;color:#cfe3f7}'
    + 'ul{list-style:none;margin:0;padding:0}li{padding:8px 4px;border-bottom:1px solid #2f6fa8}'
    + 'li span{float:right;color:#ffe27a}</style></head><body>'
    + '<h2>Missions</h2><p>Tap the scroll under your avatar on the home screen. Clear the goals, '
    + 'then tap Receive (or Collect All) to get the rewards.</p>'
    + section(1, 'Beginner', () => 'Available for a limited time after you start playing.')
    + section(2, 'Daily', (r) => `Reset every day at ${esc(hour(r))} (server time).`)
    + section(3, 'Weekly (party)', (r) => `Reset every ${days[new Date(masterDateMs(r.startDate)).getUTCDay()]} at `
      + `${esc(hour(r))} (server time). Progress is shared with your party: join a party to take them on.`)
    + section(4, 'Limited', () => 'Available until the date shown on each mission.')
    + '<h2>Jewels</h2><p>Jewels come from missions, quests and login bonuses. Use them to draw '
    + 'medals and buy boards.</p></body></html>';
  const buf = Buffer.from(html, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length });
  res.end(buf);
}

// ---------------------------------------------------------------------------
// Presents (docs/notes/home_profilo.md#presents). player.presents[] = {userPresentId,
// resourceType, resourceId, number, limitDatetime, comment, created[, test]}; resourceType
// come reward.type di grantItem (1/2 jewel, 3 medaglia, 4 munny, 5 materiale, 11 Lux,
// 13 keyblade, 14 Avatar Coin).
// GET /user/present (azione 20, nessun parametro; tutto
// obbligatorio): userPresent {userPresentDatas[], presentCount,
// presentCountMax, stonePresentCount, stonePresentCountMax} (int). Elemento:
// userPresentId uint64, resourceType/resourceId/number int, limitDatetime stringa data,
// comment stringa, created stringa data. La scena elenca tutte le righe e scrive presentCount/Max
// accanto a «Other» (testo 106250104) e stonePresentCount/Max accanto a «Jewels» (106250103).
// ---------------------------------------------------------------------------
const PRESENT_MAX = 200; // «Presents over the limit of 200 will be deleted» (testo 103500013)

// KHUX_TEST_PRESENTS=1: se nella scatola non resta nessun regalo di prova se ne aggiungono
// alcuni di tipi diversi (per provare le righe e la riscossione sul banco)
// Una sola volta per avvio del server: se ricomparivano subito dopo Collect All, il client
// (che rilegge la scatola dopo la riscossione) scriveva «There are items that cannot be
// collected.» (banco 14-10)
let testPresentsSeeded = false;
function seedTestPresents() {
  if (process.env.KHUX_TEST_PRESENTS !== '1' || testPresentsSeeded) return;
  testPresentsSeeded = true;
  player.presents = player.presents || [];
  if (player.presents.some((p) => p.test)) return;
  const now = realNow();
  const limit = now + 29 * 86400000;
  const medalId = masterRows('medal').some((m) => m.medalId === 90041) ? 90041 : masterRows('medal')[0]?.medalId;
  const materialId = masterRows('material')[0]?.materialId;
  const rows = [
    [2, 0, 300, 'Daily Login Bonus Reward'],
    [11, 0, 1000, 'Test: Lux'],
    [4, 0, 5000, 'Test: Munny'],
    [14, 0, 6, 'Test: Avatar Coin'],
    ...(medalId ? [[3, medalId, 1, 'Test: Medal']] : []),
    ...(materialId ? [[5, materialId, 3, 'Test: Material']] : []),
  ];
  // id progressivi mai riusati (player.presentLastId)
  let id = Math.max(player.presentLastId || 0, ...player.presents.map((p) => p.userPresentId));
  for (const [resourceType, resourceId, number, comment] of rows) {
    player.presents.push({ userPresentId: ++id, resourceType, resourceId, number, limitDatetime: limit, comment, created: now, test: true });
  }
  player.presentLastId = id;
  console.log(`[presents] ${rows.length} regali di prova aggiunti (KHUX_TEST_PRESENTS=1)`);
  savePlayer();
}

// un regalo nella scatola (id progressivi mai riusati), valido 30 giorni come gli originali
// skillId: medaglia con quella skill al livello massimo (Scrooge dei Skills to Thrill, catalogo bonus[3])
let noticesServedAt = 0;

function addPresent(resourceType, resourceId, number, comment, skillId) {
  player.presents = player.presents || [];
  const id = Math.max(player.presentLastId || 0, ...player.presents.map((p) => p.userPresentId)) + 1;
  player.presents.push({ userPresentId: id, resourceType, resourceId, number,
    limitDatetime: realNow() + 30 * 86400000, comment, created: realNow(), ...(skillId ? { skillId } : {}) });
  player.presentLastId = id;
}

// regali ancora validi: quelli scaduti (limitDatetime passato, ora del server) si tolgono
function livePresents() {
  seedTestPresents();
  const now = realNow();
  const all = player.presents || [];
  const live = all.filter((p) => (typeof p.limitDatetime === 'number' ? p.limitDatetime : Infinity) > now);
  if (live.length !== all.length) { player.presents = live; savePlayer(); }
  return live;
}

const isStonePresent = (p) => p.resourceType === 1 || p.resourceType === 2;

function userPresentData() {
  const list = livePresents();
  const stones = list.filter(isStonePresent).length;
  return {
    // i piu' recenti in alto
    userPresentDatas: list.slice().reverse().map((p) => ({
      userPresentId: p.userPresentId, resourceType: p.resourceType, resourceId: p.resourceId || 0,
      number: p.number, limitDatetime: outTime(p.limitDatetime), comment: p.comment || '', created: outTime(p.created),
    })),
    presentCount: list.length - stones, presentCountMax: PRESENT_MAX,
    stonePresentCount: stones, stonePresentCountMax: PRESENT_MAX,
  };
}

function respondUserPresent(res) {
  send(res, 200, { ret: ret(), userPresent: userPresentData() });
}

// POST /user/present/receive (azione 49): {receivePresentIds: [uint64]}, sia
// Collect sia Collect All. Tutto obbligatorio: userData
// (userPoint), userMaterials, userMedals, userSkills, userKeyblades, userDecks,
// userAvatarParts, userTitles, pet, emblemIds, sub-slot, liste del Burst (come 190), poi
// lastUserPresentIds [uint64]: i regali RIMASTI nella scatola; il client segna come riscossi
// quelli della sua lista che non ci sono.
// userStone non lo legge (la 1.0.1 si'): lo si manda lo stesso per i jewel.
function respondPresentReceive(res, body) {
  const now = serverTime();
  const snap = inventorySnapshot(now); // solo le voci toccate dai regali (vedi inventoryBlocks)
  const want = new Set((body?.receivePresentIds || []).map(Number));
  const keep = [];
  for (const p of livePresents()) {
    if (!want.has(p.userPresentId)) { keep.push(p); continue; }
    const before = (player.medals || []).length;
    grantItem(p.resourceType === 1 ? 2 : p.resourceType, p.resourceId, p.number);
    if (p.skillId && p.resourceType === 3) giveSkill(player.medals.slice(before), p.skillId);
    console.log(`[presents] riscosso ${p.userPresentId}: tipo ${p.resourceType} id ${p.resourceId} x${p.number}`);
  }
  player.presents = keep;
  savePlayer();
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(now) },
    ...inventoryBlocks(now, snap),
    lastUserPresentIds: keep.map((p) => p.userPresentId),
    userStone: { freeStone: player.freeStone || 0, payStone: 0 },
  });
}

// Skill al livello massimo sulle medaglie appena ricevute (regalo con skillId: Scrooge «with the X Skill» dei
// Skills to Thrill, catalogo bonus [3, Scrooge, 1, skillId]; le Scrooge originali la portano al massimo)
function giveSkill(medals, skillId) {
  const t = medalSkillTables();
  const row = t.byId.get(skillId);
  if (!row) { console.log(`  [skill] regalo con skill ${skillId} assente da skill.json`); return; }
  const expRow = t.expRows.get(row.expType);
  player.medalSkills = player.medalSkills || {};
  for (const m of medals) {
    player.nextUserSkillId = (player.nextUserSkillId || 0) + 1;
    player.medalSkills[m.userMedalId] = { userSkillId: player.nextUserSkillId, skillId, level: row.maxLv || 1,
      exp: expRow ? medalSkill.expToReach(expRow, row.maxLv || 1) : 0, getDatetime: realNow() };
  }
}

// Inventario iniziale da initItem: categoria 3 = medaglie del deck (equipType 3,
// equipNo = slot, param = livello), categoria 13 = keyblade iniziale. Le medaglie
// hanno userMedalId 1, 2, 3 nell'ordine degli slot.
function startingInventory() {
  const rows = masterRows('initItem');
  const medals = rows.filter((r) => r.category === 3).sort((a, b) => a.equipNo - b.equipNo)
    .map((r, i) => ({ userMedalId: i + 1, medalId: r.itemId, level: r.param || 1 }));
  const kb = rows.find((r) => r.category === 13);
  return { medals, keybladeId: kb ? kb.itemId : 1000 };
}

// HP del livello 1 dalla tabella player (generata da make-game-tables.js).
function levelHp(lv = 1) {
  const row = masterRows('player').find((r) => r.lv === lv);
  return row ? row.hp : 0;
}

// userMedals[], elemento (userSkills al massimo 2,
// userShuffleSkills).
// Le medaglie iniziali del deck (userMedalId 1-3) e quelle ricevute come premio
// (player.medals, userMedalId da 101). player.medalState[userMedalId] = {medalId, level,
// exp, removed} sovrascrive entrambe (Level Up, Evolve, materiali consumati).
function userMedalList() {
  const st = player.medalState || {};
  return [...startingInventory().medals, ...(player.medals || [])]
    .filter((m) => !st[m.userMedalId]?.removed)
    .map((m) => ({ ...m, ...(st[m.userMedalId] || {}) }));
}

// Medaglie impilabili (validPack, le medaglie di supporto): il salvataggio tiene le copie
// separate, il client le vede come una cella sola con number = copie (badge rosso), con
// userMedalId della prima copia (fino a 99 per cella, come negli screenshot originali).
// Le copie col lucchetto fanno una cella a parte: il lucchetto e' della cella (userMedalId della prima
// copia), e una copia bloccata in testa rendeva grigio tutto il mucchio negli Evolve (banco 19-10).
function stackedMedalList() {
  const pack = new Set(masterRows('medal').filter((r) => r.validPack).map((r) => r.medalId));
  const out = [], stacks = new Map();
  for (const m of userMedalList()) {
    const key = `${m.medalId}${player.medalLocks?.[m.userMedalId] ? 'L' : ''}`;
    const s = pack.has(m.medalId) && stacks.get(key);
    if (s && s.number < 99) { s.number++; s.copies.push(m.userMedalId); continue; }
    const e = { ...m, number: 1, copies: [m.userMedalId] };
    if (pack.has(m.medalId)) stacks.set(key, e);
    out.push(e);
  }
  return out;
}

// Le copie da consumare per (userMedalId della cella, numero): vendita e Level Up.
function stackCopies(userMedalId, number) {
  const cell = stackedMedalList().find((m) => m.userMedalId === Number(userMedalId));
  return cell ? cell.copies.slice(0, Math.max(1, Number(number) || 1)) : [Number(userMedalId)];
}

function userMedalElement(m, now) {
  return {
    userMedalId: m.userMedalId, // uint64
    medalId: m.medalId,
    number: m.number || 1, // uint
    level: m.level || 1, exp: m.exp || 0, // exp cumulativo
    // Level Up con medaglie speciali (server/medal-guilt.js), salvati in medalState: STR/DEF di
    // Chip/Dale, pallini dell'attacco speciale, riduzione del costo di Cid
    attackUpperNumber: m.attackUpperNumber || 0, defenseUpperNumber: m.defenseUpperNumber || 0,
    burstUpperNumber: m.burstUpperNumber || 0,
    lock: player.medalLocks?.[m.userMedalId] ? 1 : 0,
    // upperCost (int con segno): variazione del costo, NEGATIVA per Cid. Il client la nega
    // e la sottrae al costo (costo del deck, ordinamento, Optimize, anteprima
    // ed effetto 6 del risultato). medalState.upperCost = riduzione (positiva).
    upperCost: -(m.upperCost || 0),
    guiltFactor: m.guiltFactor || 0, // guiltFactor: uint, centesimi di % (10000 = +100%)
    // skill (I-088, server/medal-skill.js): solo l'id, l'oggetto va nella lista userSkills
    userSkills: [medalSkillOf(m)].filter(Boolean).map((s) => s.userSkillId),
    userShuffleSkills: medalTraits(m.userMedalId),
    getDatetime: outTime(m.getDatetime, now),
  };
}

// Trait di una medaglia (Moogle Shop): player.medalTraits[userMedalId] = [{userShuffleSkillId,
// shuffleSkillId, type, getDatetime}]. Elemento: userShuffleSkillId
// (uint64), shuffleSkillId, userMedalId (uint64), getDatetime, type (al massimo 6 per medaglia).
// Skill di una medaglia (server/medal-skill.js): player.medalSkills[userMedalId] = {userSkillId,
// skillId, level, exp, getDatetime} dopo un Overwrite riuscito; senza voce, le Scrooge hanno la
// loro skill calcolata. Tabelle lette una volta per richiesta (userMedalsData chiama medalSkillOf
// per ~2000 medaglie: masterRows a ogni chiamata costava troppo).
let medalSkillMemo = null;
function medalSkillTables() {
  if (!medalSkillMemo) {
    const skills = masterRows('skill');
    medalSkillMemo = { skills, byId: new Map(skills.map((r) => [r.skillId, r])),
      expRows: new Map(masterRows('skillExp').map((r) => [r.expId, r.value])),
      medals: new Map(masterRows('medal').map((r) => [r.medalId, r])) };
    setImmediate(() => { medalSkillMemo = null; });
  }
  return medalSkillMemo;
}
function skillRowsById() {
  return medalSkillTables().byId;
}

function medalSkillOf(m) {
  const t = medalSkillTables();
  const saved = player.medalSkills?.[m.userMedalId];
  if (saved !== undefined) return saved && t.byId.has(saved.skillId) ? saved : null;
  return medalSkill.scroogeSkill(t.medals.get(m.medalId), m.userMedalId, t.skills, t.expRows);
}

// Migrazione alla tabella skill completa e alla curva skillExp vera (I-146, skillVersion 1): le Scrooge
// possedute senza voce salvano la skill di prima (scroogeSkillV1, sulle 12 skill di allora: la regola sulla
// tabella completa ne darebbe un'altra), getDatetime della medaglia; ogni skill salvata tiene il livello
// mostrato, l'EXP diventa la soglia vera di quel livello (la curva inventata dava altri numeri). Le Scrooge
// nuove restano calcolate (medalSkillOf). Medaglie senza skill: nessuna voce.
function migrateSkills() {
  if (player.skillVersion) return;
  const t = medalSkillTables();
  const expRows = t.expRows;
  // guardia: un master vecchio o ridotto (curva inventata, poche skill, righe medaglia mancanti) darebbe una
  // migrazione sbagliata e skillVersion 1 la renderebbe definitiva: si rimanda, il salvataggio non cambia
  const miss = [];
  if (expRows.get(4)?.[0] !== 30) miss.push('skillExp senza la riga expId 4 vera');
  if (t.skills.length < 25) miss.push(`skill ${t.skills.length} < 25`);
  const noRow = userMedalList().filter((m) => !t.medals.has(m.medalId) && player.medalSkills?.[m.userMedalId] === undefined).length;
  if (noRow) miss.push(`${noRow} medaglie possedute senza riga nel master`);
  if (miss.length) {
    console.log(`[skill] migrazione rimandata: master vecchio o ridotto (${miss.join('; ')}); rigenera con node server/make-skill-table.js`);
    return;
  }
  player.medalSkills = player.medalSkills || {};
  for (const m of userMedalList()) {
    if (player.medalSkills[m.userMedalId] !== undefined) continue;
    const s = medalSkill.scroogeSkillV1(t.medals.get(m.medalId), m.userMedalId, t.skills, expRows);
    if (s) player.medalSkills[m.userMedalId] = { ...s, getDatetime: m.getDatetime };
  }
  for (const s of Object.values(player.medalSkills)) {
    const row = s && t.byId.get(s.skillId);
    const expRow = row && expRows.get(row.expType);
    if (!expRow) continue;
    s.exp = medalSkill.expToReach(expRow, Math.min(s.level || 1, row.maxLv || 1));
  }
  player.skillVersion = 1;
  savePlayer();
}

// Organizzazione XIII (medalMapVersion 1): il master ha tolto i 13 doppioni 6★ «X A» 3004xx/3006xx (erano
// le stesse medaglie degli id SE) e le 23 Tier 8 potenziate 20xxxxx/21xxxxx dei deal 2018 (ora la 6★ [+]
// potenziata). Fonte: D:\Progetto_Restauro_KH_UX\tmp\sp2b\g4\medal_mapping_audit.md. Le 7★ «X A» restano.
const ORGXIII_MEDAL_MAP = new Map([
  // doppione 6★ «X A» -> id SE
  [300443, 31176], [300483, 31196], [300486, 31206], [300638, 31226], [300446, 32186], [300449, 32196],
  [300489, 32216], [300641, 32236], [300452, 33176], [300455, 33186], [300492, 33206], [300495, 33216], [300644, 33236],
  // Tier 8 potenziata -> 6★ [+] potenziata (2000000 + id [+]): 20xxxxx = 2000000 + id SE (tutti e 13), 21xxxxx =
  // 2100000 + id SE (10: Xemnas, Axel e Roxas non hanno la copia nel master)
  ...[[31176, 301491], [31196, 301601], [31206, 301531], [31226, 301680, 1], [32186, 301634], [32196, 301658],
    [32216, 301745], [32236, 301563, 1], [33176, 301446], [33186, 301511], [33206, 301595], [33216, 301616], [33236, 301782, 1]]
    .flatMap(([se, plus, solo20]) => [[2000000 + se, 2000000 + plus], ...(solo20 ? [] : [[2100000 + se, 2000000 + plus]])]),
]);

// Sostituisce medalId nei campi del salvataggio che lo tengono: medals[], medalState[] (Evolve) e i regali
// in sospeso di tipo medaglia (resourceType 3). Il resto (userMedalId, medalSkills, medalLocks, medalTraits,
// deck, supporto, guilt) e' per userMedalId e non cambia; gacha, pet e subslot non tengono medalId.
// Versione 2: il record del livello Nova (guiltBurst.first/max, per medalId, non cala mai) tiene i vecchi id;
// l'id nuovo prende il posto del vecchio solo se non c'e' gia', cosi' la stessa medaglia non da' un secondo
// aumento (+5 e popup «NOVA LEVEL UP!» senza motivo) e il livello non scende.
function migrateMedalMap() {
  if (player.medalMapVersion >= 2) return;
  let n = 0;
  const fix = (o, k) => { const to = o && ORGXIII_MEDAL_MAP.get(o[k]); if (to) { o[k] = to; n++; } };
  if (!player.medalMapVersion) {
    for (const m of player.medals || []) fix(m, 'medalId');
    for (const st of Object.values(player.medalState || {})) fix(st, 'medalId');
    for (const p of player.presents || []) if (p.resourceType === 3) fix(p, 'resourceId');
  }
  for (const list of [player.guiltBurst?.first, player.guiltBurst?.max]) {
    if (!Array.isArray(list)) continue;
    list.forEach((id, i) => { const to = ORGXIII_MEDAL_MAP.get(id); if (to && !list.includes(to)) { list[i] = to; n++; } });
  }
  player.medalMapVersion = 2;
  if (n) console.log(`[save] Organizzazione XIII: ${n} id spostati sugli originali (medalMapVersion 2)`);
  savePlayer();
}

// elemento di userSkills
function userSkillElement(m, s, now) {
  return { userSkillId: s.userSkillId, skillId: s.skillId, level: s.level, exp: s.exp || 0,
    userMedalId: m.userMedalId, getDatetime: outTime(s.getDatetime || m.getDatetime, now) };
}

// lista userSkills: tutte le skill delle medaglie possedute, perche' il client
// cerca ogni id di userMedal.userSkills in questa tabella (un id mancante = crash)
function userSkillsData(now = serverTime(), medals = userMedalList()) {
  const out = [];
  for (const m of medals) {
    const s = medalSkillOf(m);
    if (s) out.push(userSkillElement(m, s, now));
  }
  return out;
}

// trait in sospeso (slot pieni) nel formato del client: la coda player.traitPending, il primo (medal-trait.resumption)
// Senza argomento la coda, ripulita dalle medaglie che non ci sono piu' (vendute, fuse, evolute: il login aprirebbe la
// finestra su una medaglia inesistente, revisione finale 19-10).
function medalResumptionData(queue) {
  if (!queue && (player.traitPending || []).length) {
    const owned = new Set(userMedalList().map((m) => m.userMedalId));
    const kept = player.traitPending.filter((x) => owned.has(x.userMedalId));
    if (kept.length !== player.traitPending.length) { player.traitPending = kept; savePlayer(); }
  }
  const r = medalTrait.resumption(queue || player.traitPending);
  return { ...r, userShuffleSkills: r.userShuffleSkills.map((t) => ({ ...t, getDatetime: outTime(t.getDatetime, serverTime()) })) };
}
const specialTraitIds = () => new Set(masterRows('shuffleskill').filter((r) => r.type === 2).map((r) => r.shuffleSkillId));

// POST /user/medal/shuffleskill (azione 57): scelta per un trait in sospeso (slot pieni).
// Replace {userMedalId, userShuffleSkillId: trait da togliere, enableUserShuffleSkillId: il pending}; Skip
// {userMedalId, userShuffleSkillId: il pending, enableUserShuffleSkillId: 0}.
// Risposta: userMedal e medalResumption alla radice, obbligatori; nessuna animazione.
function respondMedalShuffleSkill(res, body) {
  const medalId = Number(body?.userMedalId), removeId = Number(body?.userShuffleSkillId), enableId = Number(body?.enableUserShuffleSkillId) || 0;
  const queue = player.traitPending || [];
  const at = queue.findIndex((x) => x.userMedalId === medalId && x.userShuffleSkillId === (enableId || removeId));
  const medal = userMedalList().find((m) => m.userMedalId === medalId);
  if (at >= 0 && medal) {
    const { userMedalId, ...pending } = queue[at];
    const list = player.medalTraits?.[medalId] || [];
    if (!enableId) {
      queue.splice(at, 1);
      console.log(`  [trait] ${medalId}: trait ${pending.shuffleSkillId} scartato (Skip)`);
    } else if (list.some((x) => x.userShuffleSkillId === removeId)) {
      (player.medalTraits ||= {})[medalId] = medalTrait.resolvePending(list, { ...pending, type: 0 }, removeId);
      queue.splice(at, 1);
      console.log(`  [trait] ${medalId}: trait ${pending.shuffleSkillId} al posto di ${removeId}`);
    }
    player.traitPending = queue;
    savePlayer();
  } else console.log(`  [trait] scelta senza trait in sospeso: ${JSON.stringify(body)}`);
  const now = serverTime();
  // userMedal obbligatorio: senza la medaglia (venduta) la base della scelta o la prima posseduta
  const shown = medal || userMedalList()[0];
  send(res, 200, { ret: ret(), ...(shown ? { userMedal: userMedalElement(shown, now) } : {}), medalResumption: medalResumptionData() });
}

function medalTraits(userMedalId) {
  return (player.medalTraits?.[userMedalId] || []).map((t) => ({ ...t, userMedalId, getDatetime: outTime(t.getDatetime, serverTime()) }));
}

function userMedalsData(now) {
  return stackedMedalList().map((m) => userMedalElement(m, now));
}

// Level Up ed Evolve: solo le medaglie toccate (il client le fonde nel suo elenco). Con tutte le
// ~2000 il client restava fermo 6 s prima dell'animazione (banco dl5, I-083). Le pile dei
// materiali si rimandano per medalId: consumata la copia in cima, la pila ha un altro userMedalId.
function touchedMedalsData(baseId, comps, now, baseMedalId) {
  const ids = new Set(comps.map((m) => m.medalId));
  if (baseMedalId) ids.add(baseMedalId); // Evolve: la pila in cui e' entrata la medaglia evoluta
  return stackedMedalList().filter((m) => m.userMedalId === baseId || ids.has(m.medalId))
    .map((m) => userMedalElement(m, now));
}

// Curva dell'EXP delle medaglie, come la calcola il client: per expType t la riga
// medalMisc 105+t = [N, A, P]; l'EXP cumulativo per superare il livello L e'
// A * (L / (N-1)) ^ (P/10000), in float. Tipo 1: L1 8, L2 37, L3 88 (banco: LV1 + 70 EXP
// = LV3, «LV Up in 18»).
function medalMiscValue(id) {
  return masterRows('medalMisc').find((r) => r.medalMiscId === id)?.value || [0, 0, 0];
}

function medalExpToPass(row, lv) {
  const [n, a, p] = medalMiscValue(105 + (row.expType >= 1 && row.expType <= 6 ? row.expType : 1));
  const f = Math.fround;
  return Math.trunc(f(a * f(Math.pow(f(lv / f(n - 1)), f(p / 10000)))));
}

function medalLevelFor(row, lv, exp) {
  while (lv < row.maxLv && medalExpToPass(row, lv) <= exp) lv++;
  return lv;
}

// EXP dato da un materiale: materialExp + B*((lv-1)/(N-1))^(P/10000) con
// [N, B, P] = medalMisc 112; x1,5 (113) se ha lo stesso attributo della base, x1,5 (114)
// se condividono una fonte (source).
function materialExpFor(baseRow, matRow, matLevel) {
  const f = Math.fround;
  const [n, b, p] = medalMiscValue(112);
  let e = Math.trunc(f(matRow.materialExp + f(b * f(Math.pow(f((matLevel - 1) / f(n - 1)), f(p / 10000))))));
  if (baseRow.attribute === matRow.attribute) e = Math.trunc(f(e * (medalMiscValue(113)[0] / 10000)));
  const src = (r) => (r.source || []).slice(0, r.validSource || 0);
  if (src(baseRow).some((s) => src(matRow).includes(s))) e = Math.trunc(f(e * (medalMiscValue(114)[0] / 10000)));
  return e;
}

function setMedalState(id, patch) {
  player.medalState = player.medalState || {};
  player.medalState[id] = { ...(player.medalState[id] || {}), ...patch };
}

// POST /user/medal/enhance (azione 55, Level Up), corpo visto sul banco:
// {"baseUserMedalId":1,"componentUserMedalIds":[105],"isOverwriteSkill":0,"numbers":[],
// "isGreatSuccess":1}. Risposta: userSkills, userData.userPoint, userMedals,
// poi before/afterEnhanceUserMedal (come gli elementi di userMedals),
// enhanceEffect, overwriteSkills, successOverwrite, guiltBurstFirstLv/MaxLv e pet
// (facoltativo), infine medalResumption. Costo come nel client: medalMisc 115 (80) x livello x materiali.
// Great Success: x1,5 (medalMisc 118, ipotesi: il client manda gia' l'esito).
function respondMedalEnhance(res, body) {
  const rows = new Map(masterRows('medal').map((r) => [r.medalId, r]));
  const list = new Map(userMedalList().map((m) => [m.userMedalId, m]));
  const base = list.get(Number(body?.baseUserMedalId));
  // celle impilate: numbers[i] copie della cella componentUserMedalIds[i] (vuoto = 1)
  const cells = (body?.componentUserMedalIds || []).map(Number);
  // trascinando piu' volte la stessa cella il client la ripete ([440,440,440] senza numbers,
  // banco gu_35): ogni ripetizione prende le copie successive, non di nuovo la prima
  const taken = new Map();
  const comps = cells.flatMap((id, i) => {
    const n = Math.max(1, Number(body?.numbers?.[i]) || 1);
    const from = taken.get(id) || 0;
    taken.set(id, from + n);
    return stackCopies(id, from + n).slice(from);
  }).map((id) => list.get(id)).filter(Boolean);
  const now = serverTime();
  if (!base || !rows.get(base.medalId)) {
    console.log('  [level up] medaglia base assente:', body?.baseUserMedalId);
    return send(res, 200, { ret: ret() });
  }
  const row = rows.get(base.medalId);
  const before = userMedalElement(base, now);
  let gain = comps.reduce((s, m) => s + (rows.get(m.medalId) ? materialExpFor(row, rows.get(m.medalId), m.level || 1) : 0), 0);
  if (Number(body.isGreatSuccess)) gain = Math.trunc(gain * medalMiscValue(118)[0] / 10000);
  // con la base gia' al livello massimo (copie per pallini/guilt) x medalMisc 123 (2500: 2.000
  // invece di 8.000 a LV 100, banco gu_21)
  let cost = medalMiscValue(115)[0] * (base.level || 1) * comps.length;
  if ((base.level || 1) >= row.maxLv) cost = Math.trunc(cost * medalMiscValue(123)[0] / 10000);
  const exp = (base.exp || 0) + gain;
  const level = medalLevelFor(row, base.level || 1, exp);
  // medaglie speciali e copie (server/medal-guilt.js, docs/notes/guilt.md): pallini, sblocco e
  // rilancio della guilt, Magic Mirror, Chip/Dale (STR/DEF), Cid (costo), con i limiti della base
  const burstRow = row.validBurst ? masterRows('burst').find((b) => b.burstId === row.burstId) : null;
  const { state, events } = medalGuilt.applyEnhance(row, base,
    comps.map((m) => ({ row: rows.get(m.medalId), burstUpperNumber: m.burstUpperNumber || 0 })).filter((c) => c.row),
    { burstRow, guiltProb: masterRows('guiltProb'), isGuilt: isGuiltUnlocked() });
  // Overwrite Skill (I-088, server/medal-skill.js): con isOverwriteSkill la skill del materiale piu'
  // a sinistra passa alla base con la probabilita' del client (20% al livello 1, 100% al massimo);
  // altrimenti le skill dei materiali si perdono con i materiali
  let overwrite = null, overwriteOk = false;
  if (Number(body.isOverwriteSkill)) {
    overwrite = medalSkill.overwriteChance(comps.map((m) => ({ skill: medalSkillOf(m) })), skillRowsById(),
      medalMiscValue(121)[0], medalMiscValue(122)[0]);
    if (overwrite) {
      overwriteOk = Math.random() < overwrite.chance;
      if (overwriteOk) {
        // la base con una skill tiene il suo userSkillId (overwriteSkills ne fa l'upsert)
        const own = medalSkillOf(base)?.userSkillId;
        if (!own) player.nextUserSkillId = (player.nextUserSkillId || 0) + 1;
        player.medalSkills = player.medalSkills || {};
        const { skillId, level: lv, exp: sexp } = overwrite.skill;
        player.medalSkills[base.userMedalId] = { userSkillId: own || player.nextUserSkillId, skillId, level: lv, exp: sexp || 0, getDatetime: realNow() };
      }
    }
  }
  // azione 55: userSkills = id da CANCELLARE dalla tabella skill del client, poi
  // upsert di overwriteSkills. Solo le skill dei materiali consumati (mai quella della base, che tiene il
  // suo id): con la lista intera il client svuotava la tabella e l'ordinamento «Skill» della Medal List
  // crashava al tocco sul risultato (banco 18-10)
  const lostSkills = comps.map((m) => [m, medalSkillOf(m)])
    .filter(([, s]) => s && s.userSkillId !== medalSkillOf(base)?.userSkillId)
    .map(([m, s]) => userSkillElement(m, s, now));
  // Trait dalla fusione (I-084 parte A, server/medal-trait.js): una copia della stessa medaglia = un trait della ruota
  // (uno solo per fusione); slot pieni -> in sospeso (player.traitPending, medalResumption status 1)
  let newTrait = null, pendingTrait = null;
  if (medalTrait.gainsTrait(row, comps.map((m) => rows.get(m.medalId)))) {
    player.nextShuffleSkillId = (player.nextShuffleSkillId || 1000) + 1;
    const trait = { userShuffleSkillId: player.nextShuffleSkillId, shuffleSkillId: medalTrait.rollTrait(), type: 0, getDatetime: realNow() };
    const special = specialTraitIds();
    const got = medalTrait.addTrait(player.medalTraits?.[base.userMedalId], row.shuffleskillSlot, (id) => special.has(id), trait);
    if (got.pending) {
      pendingTrait = { ...trait, type: 1, userMedalId: base.userMedalId };
      (player.traitPending ||= []).push(pendingTrait);
    } else {
      (player.medalTraits ||= {})[base.userMedalId] = got.list;
      newTrait = trait;
    }
  }
  setMedalState(base.userMedalId, { level, exp, ...state });
  for (const m of comps) {
    setMedalState(m.userMedalId, { removed: true });
    if (player.medalTraits?.[m.userMedalId]) delete player.medalTraits[m.userMedalId]; // i trait del materiale si perdono
  }
  player.money = Math.max(0, (player.money || 0) - cost);
  savePlayer();
  if (overwrite) console.log(`  [level up] Overwrite Skill ${overwrite.skill.skillId} LV ${overwrite.skill.level}: ` +
    `${Math.round(overwrite.chance * 100)}% -> ${overwriteOk ? 'riuscito' : 'fallito'}`);
  console.log(`  [level up] ${base.userMedalId} (${row.name}) +${gain} EXP: LV ${base.level || 1} -> ${level}, ` +
    `materiali ${comps.map((m) => m.userMedalId).join(',')}, -${cost} munny; ` +
    `pallini ${base.burstUpperNumber || 0}->${state.burstUpperNumber}, guilt ${base.guiltFactor || 0}->${state.guiltFactor}` +
    (events.rolls.length ? ` (tiri ${events.rolls.join(',')})` : '') +
    `, STR +${state.attackUpperNumber}, DEF +${state.defenseUpperNumber}, costo -${state.upperCost}` +
    (newTrait ? `, trait ${newTrait.shuffleSkillId}` : pendingTrait ? `, trait ${pendingTrait.shuffleSkillId} in sospeso (slot pieni)` : ''));
  // livelli del Burst dati da questa fusione (prima guilt / guilt massima): solo con il popup
  // GuiltBonus_BurstLvup (acceso per default, KHUX_GUILT_BURST_POPUP=0 lo spegne), come guilt-burst.js
  const burstGain = guiltBurst().gained();
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(now) },
    userSkills: lostSkills,
    userMedals: touchedMedalsData(base.userMedalId, comps, now),
    beforeEnhanceUserMedal: before,
    afterEnhanceUserMedal: userMedalElement({ ...base, level, exp, ...state }, now),
    enhanceEffect: Number(body.isGreatSuccess) ? 1 : 0,
    // overwriteSkills = elementi userSkill, successOverwrite
    // (il risultato mostra il nome della skill nuova della base)
    overwriteSkills: overwriteOk ? userSkillsData(now, [base]) : [],
    successOverwrite: overwriteOk ? 1 : 0,
    guiltBurstFirstLv: burstGain.first, guiltBurstMaxLv: burstGain.max,
    // medalResumption, obbligatorio: senza, «200 ERROR :55»; status 1 solo col trait in sospeso di QUESTA fusione (scelta
    // del trait da sostituire, azione 57): un pending di un'altra medaglia aprirebbe la sua finestra nel risultato di
    // questa (revisione finale 19-10); la coda intera va al login (userData) e al training (244)
    medalResumption: pendingTrait ? medalResumptionData([pendingTrait]) : { userShuffleSkills: [], resumptionStatus: 0 },
    // pet.petSubslot: senza, l'azione 55 va in errore se isPet
    // e' acceso; il client lo usa solo se il pet esiste
    pet: { petSubslot: petSubslotNow() },
    // dopo pet (uint64): le medaglie consumate, che il
    // client toglie dall'elenco; senza, «200 ERROR :55»
    // solo le celle sparite: una pila con copie rimaste resta (arriva in userMedals)
    componentUserMedalIds: cells.filter((id) => !stackedMedalList().some((m) => m.userMedalId === id)),
  });
}

// POST /user/medal/evolve (azione 56), corpo visto sul banco:
// {"baseUserMedalId":1,"attachmentMedalIds":[116]}. La medaglia diventa evolveId della
// tabella medal, torna al livello 1; materiali consumati, costo evolveMoney. Risposta:
// userData.userPoint, userMedals, before/afterEvolveUserMedal
// come gli elementi di userMedals), pet, poi attachmentMedalIds (uint64).
function respondMedalEvolve(res, body) {
  const rows = new Map(masterRows('medal').map((r) => [r.medalId, r]));
  const list = new Map(userMedalList().map((m) => [m.userMedalId, m]));
  const base = list.get(Number(body?.baseUserMedalId));
  const cells = (body?.attachmentMedalIds || []).map(Number);
  // celle impilate: una copia per ogni volta che la cella compare nell'elenco
  const used = new Map();
  const comps = cells.map((id) => {
    const copies = stackCopies(id, (used.get(id) || 0) + 1);
    used.set(id, copies.length);
    return list.get(copies[copies.length - 1]);
  }).filter(Boolean);
  const now = serverTime();
  const row = base && rows.get(base.medalId);
  if (!row || !row.validEvolve || !rows.get(row.evolveId)) {
    console.log('  [evolve] non evolvibile:', body?.baseUserMedalId, row?.name);
    return send(res, 200, { ret: ret() });
  }
  const before = userMedalElement(base, now);
  setMedalState(base.userMedalId, { medalId: row.evolveId, level: 1, exp: 0 });
  for (const m of comps) setMedalState(m.userMedalId, { removed: true });
  // la guilt resta (guilt.md) e l'evoluta e' un medalId nuovo: il Nova sale (+1/+5) in silenzio, letto da
  // userPoint. La risposta 56 non usa guiltBurstFirst/MaxUserMedalIds: le copie in attesa si scartano qui,
  // altrimenti la risposta dopo con le liste (stage clear, draw, Moogle Shop) mostrava «NOVA LEVEL UP!»
  // fuori contesto, e il Level Up dopo le sommava al suo popup (final review 2b, I1)
  guiltBurst().lists();
  player.money = Math.max(0, (player.money || 0) - (row.evolveMoney || 0));
  savePlayer();
  console.log(`  [evolve] ${base.userMedalId} ${row.name} ${row.medalId} -> ${row.evolveId}, ` +
    `materiali ${comps.map((m) => m.userMedalId).join(',')}, -${row.evolveMoney} munny`);
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(now) },
    userMedals: touchedMedalsData(base.userMedalId, comps, now, row.evolveId),
    beforeEvolveUserMedal: before,
    afterEvolveUserMedal: userMedalElement({ ...base, medalId: row.evolveId, level: 1, exp: 0 }, now),
    pet: { petSubslot: petSubslotNow() }, // come l'azione 55 (usato solo se il pet c'e')
    // solo le celle sparite (una pila con copie rimaste resta)
    // e la base, se l'evoluta e' entrata in una pila esistente (validPack, es. Fantasia Mickey B):
    // senza, il client teneva due celle separate fino al login successivo
    attachmentMedalIds: [...new Set([...cells, base.userMedalId])]
      .filter((id) => !stackedMedalList().some((m) => m.userMedalId === id)),
  });
}

// POST /user/material/sell (azione 50) {userMaterialId, number}: dalla Sell Materials del
// Moogle Shop (EquipSellScene). Accredita il campo sell della tabella material per copia.
// Risposta: userData.userPoint, poi l'oggetto
// userMaterial: userMaterialId, materialId, number = copie rimaste.
function respondMaterialSell(res, body) {
  const id = Number(body?.userMaterialId);
  player.materials = player.materials || {};
  const have = player.materials[id] || 0;
  const n = Math.max(0, Math.min(Number(body?.number) || 0, have));
  const row = masterRows('material').find((r) => r.materialId === id);
  const gain = n * (row?.sell || 0);
  player.materials[id] = have - n;
  player.money = (player.money || 0) + gain;
  savePlayer();
  console.log(`  [vendita] materiale ${id} x${n}: +${gain} munny`);
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(serverTime()) },
    userMaterial: { userMaterialId: id, materialId: id, number: have - n },
  });
}

// POST /moogleshop/buy (azione 248): scambio di un articolo del Moogle Shop (tabella master
// moogleshop, make-moogleshop.js). Corpo non ancora visto: moogleshopId e quantita' cercati
// con piu' nomi. payType 1 = jewel (freeStone), altrimenti munny; l'articolo arriva con
// grantItem(itemType, itemId, itemNum). Risposta: shuffleskillUserMedals, userMaterials,
// emblemIds; guiltBurstFirst/MaxUserMedalIds;
// userData.userPoint. I jewel non sono nella risposta.
// Trait (scheda Traits, type 1): corpo {moogleshopId, userMedalId, userShuffleSkillId} dal
// popup «Select Medal»; userShuffleSkillId = trait da sostituire (0 = slot libero). Il trait
// e' shuffleSkillId della riga; la medaglia aggiornata torna in shuffleskillUserMedals (stesso
// formato di userMedals). Il costo si scala solo se lo scambio riesce.
function respondMoogleshopBuy(res, body) {
  body = body || {};
  const id = Number(body.moogleshopId ?? body.id);
  const n = Math.max(1, Number(body.num ?? body.number ?? body.count ?? 1) || 1);
  const row = masterRows('moogleshop').find((r) => r.moogleshopId === id);
  const now = serverTime();
  const changed = [];
  const snap = inventorySnapshot(now);
  const fail = (why) => {
    console.log(`  [moogle shop] articolo ${id} rifiutato: ${why} (corpo ${JSON.stringify(body)})`);
    // codice d'errore del server ignoto: senza i campi della risposta il client mostra
    // «200 ERROR :248» e non tocca i saldi
    send(res, 200, { ret: ret() });
  };
  if (!row) return fail('assente');
  const cost = row.price * n;
  const wallet = row.payType === 1 ? 'freeStone' : 'money';
  if ((player[wallet] || 0) < cost) return fail(`${wallet} insufficienti (${player[wallet] || 0} < ${cost})`);
  if (row.count && (player.moogleshopBought?.[id] || 0) + n > row.count) return fail('scambi esauriti');
  if (row.type === 1) {
    const medal = userMedalList().find((m) => m.userMedalId === Number(body.userMedalId));
    const mrow = medal && masterRows('medal').find((r) => r.medalId === medal.medalId);
    if (!mrow) return fail('medaglia assente');
    player.medalTraits = player.medalTraits || {};
    const list = player.medalTraits[medal.userMedalId] || [];
    const replace = Number(body.userShuffleSkillId) || 0;
    const at = replace ? list.findIndex((x) => x.userShuffleSkillId === replace) : list.length;
    if (at < 0) return fail(`trait ${replace} assente dalla medaglia ${medal.userMedalId}`);
    // La Special Trait del Training del pet (shuffleskill type 2) ha uno slot a parte: non conta
    const special = new Set(masterRows('shuffleskill').filter((r) => r.type === 2).map((r) => r.shuffleSkillId));
    const normal = list.filter((x) => !special.has(x.shuffleSkillId)).length;
    if (!replace && normal >= (mrow.shuffleskillSlot || 0)) {
      return fail(`slot pieni (${normal}/${mrow.shuffleskillSlot})`);
    }
    player.nextShuffleSkillId = (player.nextShuffleSkillId || 1000) + 1;
    list[at] = { userShuffleSkillId: player.nextShuffleSkillId, shuffleSkillId: row.shuffleSkillId, type: 0,
      getDatetime: realNow() };
    player.medalTraits[medal.userMedalId] = list;
    changed.push(medal);
    console.log(`  [moogle shop] trait ${row.shuffleSkillId} sulla medaglia ${medal.userMedalId} (${mrow.name})` +
      `${replace ? `, sostituisce ${replace}` : ''}: ${list.length}/${mrow.shuffleskillSlot}`);
  } else grantItem(row.itemType, row.itemId, row.itemNum * n);
  player[wallet] = player[wallet] - cost;
  player.moogleshopBought = player.moogleshopBought || {};
  player.moogleshopBought[id] = (player.moogleshopBought[id] || 0) + n;
  savePlayer();
  console.log(`  [moogle shop] articolo ${id} x${n}: tipo ${row.itemType} id ${row.itemId} x${row.itemNum * n}, -${cost} ${row.payType === 1 ? 'jewel' : 'munny'}`);
  // solo le voci cambiate (inventoryBlocks): con le liste intere (~2000 medaglie) il client
  // restava fermo ~5,8 s dopo «Set Trait» (banco 14-10), come lo sblocco dei nodi
  const inv = inventoryBlocks(now, snap);
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(now) },
    shuffleskillUserMedals: changed.map((m) => userMedalElement(m, now)),
    // il client legge anche userMedals e userSkills (col nome
    // predefinito): senza, «200 ERROR :248»
    userMedals: inv.userMedals,
    userSkills: inv.userSkills,
    userMaterials: inv.userMaterials,
    emblemIds: [],
    ...guiltBurst().lists(), // guiltBurstFirst/MaxUserMedalIds
  });
}

// POST /user/medal/sell (azione 51): risposta con userData.userPoint.
// Il corpo elenca le medaglie vendute: si raccolgono tutti gli userMedalId (campi con quel
// nome o array di id), si tolgono dal salvataggio e si accredita il campo sell della
// tabella medal (moltiplicato per number, se c'e'). Le medaglie iniziali del deck
// (userMedalId 1-3) non sono nel salvataggio e il client non le lascia vendere.
function soldMedalIds(body) {
  const ids = new Map();          // userMedalId -> number
  // corpo visto sul banco: {"userMedalIds":[106],"numbers":[1], ...}
  if (Array.isArray(body.userMedalIds)) {
    body.userMedalIds.forEach((id, i) => ids.set(Number(id), Number(body.numbers?.[i]) || 1));
    return ids;
  }
  (function walk(v, key) {
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === 'number' && /medal/i.test(key || '')) ids.set(x, (ids.get(x) || 0) + 1);
        else walk(x, key);
      }
    } else if (v && typeof v === 'object') {
      if (v.userMedalId !== undefined) ids.set(Number(v.userMedalId), Number(v.number) || 1);
      for (const [k, x] of Object.entries(v)) if (k !== 'userMedalId') walk(x, k);
    }
  })(body, '');
  return ids;
}

function respondMedalSell(res, body) {
  const sold = soldMedalIds(body || {});
  const rows = new Map(masterRows('medal').map((r) => [r.medalId, r]));
  // celle impilate: si vendono le prime N copie della pila. Elenco a celle calcolato una
  // volta sola (stackCopies lo ricostruiva per ogni medaglia venduta: vendite lente con
  // migliaia di medaglie)
  const cells = new Map(stackedMedalList().map((m) => [m.userMedalId, m]));
  const copies = new Set([...sold].flatMap(([id, n]) => {
    const cell = cells.get(Number(id));
    return cell ? cell.copies.slice(0, Math.max(1, Number(n) || 1)) : [Number(id)];
  }));
  let gain = 0;
  player.medals = (player.medals || []).filter((m) => {
    if (!copies.has(m.userMedalId)) return true;
    gain += rows.get(m.medalId)?.sell || 0;
    copies.delete(m.userMedalId);
    return false;
  });
  // medaglie iniziali (1-3, startingInventory): non stanno in player.medals, si segnano
  // rimosse come dopo un Level Up (banco v33: Goofy venduto restava, +90 invece di 180)
  for (const m of startingInventory().medals) {
    if (!copies.has(m.userMedalId)) continue;
    gain += rows.get(m.medalId)?.sell || 0;
    setMedalState(m.userMedalId, { removed: true });
  }
  player.money = (player.money || 0) + gain;
  savePlayer();
  console.log(`  [vendita] medaglie ${[...sold.keys()].join(',') || '(nessun id nel corpo)'}: +${gain} munny`);
  // risposta dell'azione 51: userData.userPoint, poi
  // userSkills, userMedals, infine sellUserMedalIds;
  // senza i tre in radice «200 ERROR :51»
  const now = serverTime();
  const after = stackedMedalList();
  const left = new Set(after.map((m) => m.userMedalId));
  send(res, 200, {
    ret: ret(),
    userData: { userPoint: userPointData(now) },
    userSkills: userSkillsData(now),
    userMedals: after.map((m) => userMedalElement(m, now)),
    // solo le celle sparite (una pila con copie rimaste resta)
    sellUserMedalIds: [...sold.keys()].filter((id) => !left.has(id)),
  });
}

// POST /user/medal/lock (azione 46), corpo visto sul banco:
// {"userMedalIds":[110],"isLocks":[1], ...}. Lo stato va in player.medalLocks (anche per
// le medaglie iniziali 1-3, che non sono in player.medals) e torna nel campo lock di
// userMedals. Risposta: userMedals, deleteUserMedalIds,
// poi isSubslotUpdate (intero letto come flag != 0): senza, «200 ERROR :46».
function respondMedalLock(res, body) {
  const ids = Array.isArray(body?.userMedalIds) ? body.userMedalIds : [];
  player.medalLocks = player.medalLocks || {};
  ids.forEach((id, i) => {
    if (Number(body.isLocks?.[i])) player.medalLocks[Number(id)] = 1;
    else delete player.medalLocks[Number(id)];
  });
  savePlayer();
  console.log(`  [lucchetto] ${ids.map((id, i) => `${id}=${Number(body.isLocks?.[i]) ? 1 : 0}`).join(',')}`);
  send(res, 200, { ret: ret(), userMedals: userMedalsData(serverTime()), deleteUserMedalIds: [],
    isSubslotUpdate: 0 });
}

function respondUserMedal(res) {
  // GET /user/medal (azione 15)
  send(res, 200, { ret: ret(), userMedals: userMedalsData(serverTime()) });
}

// medaglie del deck: player.deck (0 = slot vuoto) dopo Unequip, altrimenti quelle iniziali
function deckMedalIds() {
  return player.deck || startingInventory().medals.map((m) => m.userMedalId);
}

// Slot vuoti in battaglia: il client fa un turno per voce di deckMedals e non salta mai:
// uno 0 diventa una medaglia finta (master 1, Paperino blu) che attacca; i negativi fanno
// rifiutare tutto userDecks. Vedi stage_gen\deck_empty_slot e sentKeybladeDeck(id, compact).

// POST /user/medal/remove (azione 237, Unequip dal dettaglio), corpo visto sul banco:
// {"removeUserMedalId":2}. Lo slot del deck torna vuoto (0). Risposta:
// userKeyblades, userDecks, petSubslots,
// subslotMaxNum + userKeybladeSubslots.
function respondMedalRemove(res, body) {
  const id = Number(body?.removeUserMedalId);
  player.deck = deckMedalIds().map((x) => (x === id ? 0 : x));
  // anche dai deck degli altri keyblade (il corpo non dice quale: la si toglie da tutti)
  for (const d of Object.values(player.keybladeDecks || {})) d.forEach((x, i) => { if (x === id) d[i] = 0; });
  for (const set of Object.values(player.keybladeDeckSets || {})) for (const n of [2, 3]) (set[n] || []).forEach((x, i) => { if (x === id) set[n][i] = 0; });
  if (PET_ENABLED) pet().onMedalRemoved(id); // Gear del pet e 6° slot dei deck
  savePlayer();
  console.log(`  [unequip] ${id}: deck ${player.deck.join(',')}`);
  send(res, 200, {
    ret: ret(),
    userKeyblades: userKeybladesData(),
    userDecks: userDecksData(),
    // array (il primo elemento sarebbe letto come petSubslot): con un
    // elemento il client lo copia nel pet della sessione anche se il pet non esiste
    // (crash, I-005): il pet lo crea solo l'azione 170 (/pet/profile),
    // che il client chiede all'avvio solo con isPet 1. Quindi l'elemento solo con KHUX_PET=1.
    petSubslots: PET_ENABLED ? [pet().petSubslotData()] : [],
    subslotMaxNum: kbEvo().subslotMaxNum(), userKeybladeSubslots: userKeybladeSubslotsData(),
  });
}

// Keyblade posseduti. Starlight (initItem categoria 13) e' userKeybladeId 1, con il deck
// player.deck; gli altri arrivano come premio di tipo 13 (grantItem: es. Treasure Trove 2000
// dalla Quest 14, stage 1110) e stanno in player.keyblades [{userKeybladeId, keybladeId,
// getDatetime, burst}], con il deck in player.keybladeDecks[userKeybladeId] (0 = slot vuoto,
// come player.deck). Ogni keyblade ha userDeckId e userKeybladeSubslotId uguali al suo
// userKeybladeId. Preferito (isFavorite, Profilo): player.favoriteKeybladeId, di default 1.
function ownedKeyblades() {
  return [
    { userKeybladeId: USER_KEYBLADE_ID, keybladeId: kbEvo().starlightKeybladeId(startingInventory().keybladeId), burst: player.keybladeBurst || 0,
      getDatetime: realNow() },
    ...(player.keyblades || []).map((k) => ({ ...k, burst: k.burst || 0 })),
  ];
}

// 3 deck per keyblade (update 1.1.2 del 01/09/2016: «Save 3 decks per Keyblade», con almeno un keyblade a +20; pulsanti
// 1/2/3 di StartDeckEdit2_Panel_KB_ver230 e DeckEdit_SubChange_Ver131). Il client conta i deck di un keyblade dagli
// userDecks con il suo userKeybladeId, nell'ordine dell'array: il deck attivo e' userKeyblades[].userDeckId
// e i pulsanti cambiano quello, salvato con l'azione 45 (ricerca 20-10,
// D:\Progetto_Restauro_KH_UX	mp\deckset\RESEARCH.md). Deck 1 = userDeckId = userKeybladeId (player.deck /
// player.keybladeDecks, come prima), deck 2 e 3 = n x 1.000.000 + userKeybladeId in player.keybladeDeckSets[kb] =
// {active, 2: [...], 3: [...]}; il 6° slot del pet per deck (petBaseSlots per userDeckId).
const DECK_ID_STEP = 1000000;
const deckIdOf = (kb, n) => (n === 1 ? kb : n * DECK_ID_STEP + kb);
const deckOfId = (id) => ({ kb: id % DECK_ID_STEP, n: Math.floor(id / DECK_ID_STEP) || 1 });
function multiDecksUnlocked() {
  const rows = new Map(masterRows('keyblade').map((r) => [r.keybladeId, r]));
  return ownedKeyblades().some((k) => (rows.get(k.keybladeId)?.lv || 0) >= 20);
}
const activeDeck = (kb) => (multiDecksUnlocked() && [2, 3].includes(player.keybladeDeckSets?.[kb]?.active) ? player.keybladeDeckSets[kb].active : 1);
function deckMedalsOf(kb, n) {
  if (n !== 1) return player.keybladeDeckSets?.[kb]?.[n] || [];
  if (kb === USER_KEYBLADE_ID) return deckMedalIds();
  return (player.keybladeDecks || {})[kb] || [];
}
function keybladeDeckIds(userKeybladeId) {
  return deckMedalsOf(userKeybladeId, activeDeck(userKeybladeId));
}

// deckMedals da mandare: le medaglie non piu' possedute (vendute, usate come materiale) diventano
// 0, perche' un id sconosciuto il client lo cerca e non lo trova. Il client usa la lunghezza di
// deckMedals come numero di slot: Optimize
// riempie solo quelli, e il client segna il deck come cambiato (quindi lo manda in
// /user/keyblade/update/170516) confrontando solo quelle voci. Quindi fuori dalla battaglia il
// deck va completo, con uno 0 per ogni slot vuoto fino agli slot sbloccati (validConsist della
// riga keyblade): con il deck compatto Optimize riempiva solo gli slot gia' pieni (banco 12
// ottobre, Treasure Trove 2/5, I-075). compact = senza gli 0, solo per /stage/start (in
// battaglia uno 0 diventa una medaglia finta, vedi sopra deckMedalIds); un deck tutto vuoto resta
// a zeri anche li'.
function keybladeSlotCount(userKeybladeId) {
  const k = ownedKeyblades().find((x) => x.userKeybladeId === userKeybladeId);
  return Math.min(5, masterRows('keyblade').find((r) => r.keybladeId === k?.keybladeId)?.validConsist || 3);
}

function sentKeybladeDeck(userKeybladeId, compact = false, n = activeDeck(userKeybladeId)) {
  const owned = new Set(userMedalList().map((m) => m.userMedalId));
  const ids = deckMedalsOf(userKeybladeId, n).slice(0, 5).map((id) => (id > 0 && owned.has(id) ? id : 0));
  const filled = ids.filter((id) => id > 0);
  if (compact && filled.length) return filled;
  const slots = keybladeSlotCount(userKeybladeId);
  while (ids.length < slots) ids.push(0);
  while (ids.length > slots && ids[ids.length - 1] === 0) ids.pop();
  return ids;
}

function keybladeDeckStats(userKeybladeId) {
  if (userKeybladeId === USER_KEYBLADE_ID && activeDeck(userKeybladeId) === 1) return deckStats();
  const medals = masterRows('medal');
  const byId = new Map(userMedalList().map((m) => [m.userMedalId, m]));
  let attack = 0;
  let defense = 0;
  for (const id of sentKeybladeDeck(userKeybladeId)) {
    const row = medals.find((r) => r.medalId === byId.get(id)?.medalId);
    if (row) { attack += row.attack; defense += row.defense; }
  }
  return { attack, defense };
}

function favoriteKeybladeId() {
  const fav = player.favoriteKeybladeId;
  return ownedKeyblades().some((k) => k.userKeybladeId === fav) ? fav : USER_KEYBLADE_ID;
}

function favoriteKeyblade() {
  return ownedKeyblades().find((k) => k.userKeybladeId === favoriteKeybladeId());
}

// Premio di tipo 13 (keyblade): un keyblade per serie (category della tabella keyblade: le
// evoluzioni +N hanno la stessa), una copia gia' posseduta non si duplica.
function grantKeyblade(keybladeId) {
  const row = masterRows('keyblade').find((r) => r.keybladeId === keybladeId);
  if (!row) { console.log(`  [keyblade] ${keybladeId} assente dalla tabella keyblade`); return; }
  const cat = (id) => masterRows('keyblade').find((r) => r.keybladeId === id)?.category;
  if (ownedKeyblades().some((k) => cat(k.keybladeId) === row.category)) {
    console.log(`  [keyblade] ${row.name} (${keybladeId}) gia' posseduto`);
    return;
  }
  player.keyblades = player.keyblades || [];
  const userKeybladeId = Math.max(...ownedKeyblades().map((k) => k.userKeybladeId)) + 1;
  player.keyblades.push({ userKeybladeId, keybladeId, getDatetime: realNow(), burst: 0 });
  console.log(`  [keyblade] ottenuto ${row.name} (${keybladeId}): userKeybladeId ${userKeybladeId}`);
}

// Gauge degli attacchi speciali salvata nel keyblade usato (userKeybladeId di /stage/start)
function setKeybladeBurst(v) {
  const k = (player.keyblades || []).find((x) => x.userKeybladeId === player.currentUserKeybladeId);
  if (k) k.burst = v;
  else player.keybladeBurst = v;
}

// userKeyblades[], elemento (deckMedals: al massimo 5 uint64).
// totalAttack/totalDefense = somma del deck, come userPoint.attack/defense. category =
// quella della tabella keyblade (Starlight 1, Treasure Trove 201, ...).
function userKeybladeData(k) {
  const { attack, defense } = keybladeDeckStats(k.userKeybladeId);
  return {
    userKeybladeId: k.userKeybladeId, // uint64
    userDeckId: deckIdOf(k.userKeybladeId, activeDeck(k.userKeybladeId)), // uint64: il deck attivo
    userKeybladeSubslotId: k.userKeybladeId, // uint64 (vedi /keyblade/subslot)
    category: masterRows('keyblade').find((r) => r.keybladeId === k.keybladeId)?.category ?? 1,
    keybladeId: k.keybladeId,
    deckMedals: sentKeybladeDeck(k.userKeybladeId),
    // isFavorite: il Profilo mostra il keyblade preferito; senza
    // nessun preferito la riga del keyblade resta nulla (crash)
    burst: k.burst, totalAttack: attack, totalDefense: defense,
    isFavorite: k.userKeybladeId === favoriteKeybladeId() ? 1 : 0,
    skillUpperTotalHp: 0, skillUpperTotalBurst: 0, skillUpperTotalAttack: 0,
    skillUpperTotalDefence: 0, subslotRate: kbEvo().keybladeSubslotRate(k.keybladeId), // uint
    getDatetime: outTime(k.getDatetime, serverTime()),
  };
}

function userKeybladesData() {
  return ownedKeyblades().map(userKeybladeData);
}

function respondUserKeyblade(res) {
  // GET /user/keyblade (azione 11)
  send(res, 200, { ret: ret(), userKeyblades: userKeybladesData() });
}

// userDecks[], elemento: un deck per keyblade.
// petBaseSlotMedal (uint64, obbligatorio) = il 6° slot, quello del pet: 0 se
// KHUX_PET e' spento o lo slot e' vuoto (server/pet.js)
function userDecksData(compact = false) {
  const ownedMedals = new Set(userMedalList().map((m) => m.userMedalId));
  const ns = multiDecksUnlocked() ? [1, 2, 3] : [1];
  return ownedKeyblades().flatMap((k) => ns.map((n) => ({
    userDeckId: deckIdOf(k.userKeybladeId, n), userKeybladeId: k.userKeybladeId, // uint64
    deckMedals: sentKeybladeDeck(k.userKeybladeId, compact, n),
    petBaseSlotMedal: petBaseSlotMedal(player, deckIdOf(k.userKeybladeId, n), ownedMedals),
  })));
}

// POST /user/keyblade/update/170516 (azione 45): il client salva i deck e il preferito.
// Corpo: userKeyblades [{userKeybladeId, userDeckId, isFavorite}] e
// userDecks [{userDeckId, medals (userMedalId[]), petBaseSlotMedal}]. Risposta: userKeyblades
// e userDecks, gli elenchi completi.
function respondKeybladeUpdate(res, body) {
  const owned = new Set(ownedKeyblades().map((k) => k.userKeybladeId));
  const multi = multiDecksUnlocked();
  for (const k of body?.userKeyblades || []) {
    const id = Number(k.userKeybladeId);
    if (owned.has(id) && Number(k.isFavorite)) player.favoriteKeybladeId = id;
    // deck attivo (pulsanti 1/2/3)
    const { kb, n } = deckOfId(Number(k.userDeckId) || id);
    if (owned.has(id) && kb === id && (n === 1 || (multi && n <= 3)) && n !== activeDeck(id)) {
      ((player.keybladeDeckSets ||= {})[id] ||= {}).active = n;
      console.log(`  [keyblade] ${id}: deck attivo ${n}`);
    }
  }
  for (const d of body?.userDecks || []) {
    const { kb: id, n } = deckOfId(Number(d.userDeckId)); // deck 1 = userKeybladeId, 2/3 = n x 1.000.000 + id
    if (!owned.has(id) || !Array.isArray(d.medals) || n > 3 || (n > 1 && !multi)) continue;
    const medals = d.medals.map(Number).slice(0, 5);
    if (n > 1) ((player.keybladeDeckSets ||= {})[id] ||= {})[n] = medals;
    else if (id === USER_KEYBLADE_ID) player.deck = medals;
    else (player.keybladeDecks = player.keybladeDecks || {})[id] = medals;
    setPetBaseSlotMedal(player, deckIdOf(id, n), d.petBaseSlotMedal); // 6° slot (solo con KHUX_PET=1)
    console.log(`  [keyblade] deck ${id}/${n}: ${medals.join(',')}` + (PET_ENABLED ? ` + pet ${d.petBaseSlotMedal || 0}` : ''));
  }
  savePlayer();
  send(res, 200, { ret: ret(), userKeyblades: userKeybladesData(), userDecks: userDecksData() });
}

// GET /keyblade/subslot: subslotMaxNum (uint) e userKeybladeSubslots[]
// (elemento: keybladeSubslotId uint64, subslotRate uint,
// subslots[] = {slotNumber 1..subslotMaxNum, userMedalId uint64}). Ogni
// keyblade deve avere il suo subslot (userKeybladeSubslotId), anche senza slot: la
// schermata Equipment lo cerca e, se manca, va in
// crash.
function userKeybladeSubslotsData() {
  return kbEvo().userKeybladeSubslotsData(); // server/keyblade-evo.js
}

function respondKeybladeSubslot(res) {
  send(res, 200, { ret: ret(), subslotMaxNum: kbEvo().subslotMaxNum(), userKeybladeSubslots: userKeybladeSubslotsData() });
}

function respondUserDeck(res) {
  // GET /user/deck (azione 12)
  send(res, 200, { ret: ret(), userDecks: userDecksData() });
}

// GET /stage/event (azione 109, tasto «Events» dell'elenco Story):
// events[] obbligatorio (elemento: stages[] come in
// /stage/160310, eventStageId int, showIcon int, bannerUrl string, eventType int, status int,
// endTime "YYYY-MM-DD HH:MM:SS"; poi newStageId int, isLock uint, complete int),
// highScoreRank uint obbligatorio; eventCategory int facoltativo (radice).
// Senza eventi il client mostra Txt_NoEvent. Per provare un evento: save/event.json con
// l'array events (forma in docs/notes/server.md).
function respondStageEvent(res) {
  let events = [];
  const evPath = path.join(path.dirname(SAVE_FILE), 'event.json');
  if (fs.existsSync(evPath)) {
    try { events = JSON.parse(fs.readFileSync(evPath, 'utf8')); } catch (e) { console.log('[event] event.json non valido:', e.message); }
  }
  send(res, 200, { ret: ret(), events, highScoreRank: 0 });
}
// GET /user/notice (azione 241): raidNotice {isSelfRaid, isOthersRaid} uint,
// obbligatori. Il client lo chiede scegliendo «Coliseum» nel popup PvP_SelectWindow.
// GET /colosseum (azione 124): colosseumInfo {colosseumStageId int, status int},
// colosseumStages[] ({stageId, useAp, rank, stageCount} int), colosseumRank uint,
// userColosseum {userRank, userStageCount, userStageTotalCount} int. status 1 = in corso
// (stage da colosseumStages), 2 = «This event is unavailable.»
// (Txt_Description). Le tabelle master colosseum/colosseumStage della 5.0.1 sono
// vuote: senza righe il Colosseo non si puo' giocare, quindi status 2 e nessuno stage.
function respondColosseum(res) {
  send(res, 200, {
    ret: ret(),
    colosseumInfo: { colosseumStageId: 0, status: 2 },
    colosseumStages: [],
    colosseumRank: 0,
    userColosseum: { userRank: 0, userStageCount: 0, userStageTotalCount: 0 },
  });
}
// Coliseum PvP, stato «vuoto» ma valido (nessun avversario, nessuna classifica). Risposte
// (un campo obbligatorio mancante = «200 ERROR :<id>»):
// - GET /pvp (195): pvp {pvpId, playNumber, pvpPoint, pvpClass,
//   pvpRank uint; openRankingId uint64; numParticipant uint}, tutti obbligatori. pvpId = riga
//   della tabella master pvp, che il client usa senza controllo (riga assente = crash).
//   pvpClass 1..8 (con la riga rankingPvp presente).
// - GET/POST /pvp/keyblade (196/197): pvp.keybladeIds [uint64] e
//   pvp.userDecks (elementi come /user/deck). Corpo del POST:
//   userDecks [{userDeckId, medals, petBaseSlotMedal}], keybladeIds [uint64].
// - GET /pvp/vs_list (198): vsUsers [].
// - GET /ranking/pvpParade (199): pvpParade {pvpClass uint,
//   rankingPvpTopRanker []}.
// - GET /ranking/pvp, /own, /border (200/201/202,
//   con chiave pvpRanking/pvpRankingOwn/pvpRankingBorder): {rankingDatas [] (elemento:
//   userData, userDetail... per giocatore), rankingStatus int, rankingTermStart e
//   rankingTermEnd "YYYY-MM-DD HH:MM:SS"}. rankingStatus 2 = elenco, 1/3 = messaggi.
// - GET /pvp/rewardlist (203): pvpPoint uint64, scoreRewardId [uint].
// - POST /pvp/entry (204), DELETE /pvp/lock (205): solo ret.
// Sequenza del pannello PvP: DELETE /pvp/lock -> /pvp -> /pvp/keyblade -> /pvp/vs_list.
const PVP_ID = Number(process.env.KHUX_PVP_ID || 1);
function pvpSeason() {
  // stagione segnaposto: il mese corrente dell'ora del server
  const [y, m] = serverTime().slice(0, 7).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01 00:00:00`, end: `${y}-${mm}-${last} 23:59:59` };
}
function respondPvp(res, p, method, body) {
  if (p === '/pvp') {
    return send(res, 200, { ret: ret(), pvp: {
      pvpId: PVP_ID, playNumber: 0, pvpPoint: 0, pvpClass: 1, pvpRank: 0, openRankingId: 0, numParticipant: 0 } });
  }
  if (p === '/pvp/keyblade') {
    if (method === 'POST' && Array.isArray(body?.keybladeIds)) {
      player.pvpKeybladeIds = body.keybladeIds.map(Number).filter((n) => Number.isSafeInteger(n) && n >= 0);
      savePlayer();
    }
    // solo ret, come prima del 14-10: con pvp.userDecks il client
      // sostituiva i deck all'avvio e ogni battaglia andava in crash creando l'HUD del giocatore
      // (banco 14-10, risorse 35). Il Coliseo PvP resta comunque bloccato (I-120)
      return send(res, 200, { ret: ret() });
  }
  if (p === '/pvp/vs_list') return send(res, 200, { ret: ret(), vsUsers: [] });
  if (p === '/ranking/pvpParade') return send(res, 200, { ret: ret(), pvpParade: { pvpClass: 1, rankingPvpTopRanker: [] } });
  const rankingKey = { '/ranking/pvp': 'pvpRanking', '/ranking/pvp/own': 'pvpRankingOwn', '/ranking/pvp/border': 'pvpRankingBorder' }[p];
  if (rankingKey) {
    const s = pvpSeason();
    return send(res, 200, { ret: ret(), [rankingKey]: { rankingDatas: [], rankingStatus: 2, rankingTermStart: s.start, rankingTermEnd: s.end } });
  }
  if (p === '/pvp/rewardlist') return send(res, 200, { ret: ret(), pvpPoint: 0, scoreRewardId: [] });
  // /pvp/entry, /pvp/lock, /pvp/clear (194, non analizzata) e altro: il solo involucro
  return send(res, 200, { ret: ret() });
}
// playStatus di un elemento di stories[] (verificato sul client, I-201): 0 = mai completata (badge «NEW» nell'elenco
// Story), 2 = completata (timbro «COMPLETE» sul riquadro TARGET della Story). Il timbro dipende solo dal completamento,
// non dagli obiettivi: le tre spunte sotto la casella vengono da clearMissionIds. Nella Proud il timbro e «NEW» vengono
// invece da newStageId (COMPLETE = stage prima di newStageId, o newStageId 0).
const STAGE_CLEARED = Number(process.env.KHUX_STAGE_CLEARED || 2);
// newStageId quando tutte le missioni dell'elenco sono completate: 0 (il client mette il cursore sull'ultima, mostra
// «Coming Soon!» nelle caselle chiuse e, nella Proud, COMPLETE anche sull'ultima)
const ALL_CLEARED_NEW_STAGE = 0;

// prima missione di storia non ancora finita, nell'ordine di respondStageList
function nextStoryRow() {
  const scores = player.stageScores || {};
  return masterRows('stage').filter((r) => r.stageKind === 1).sort((a, b) => a.id - b.id).find((r) => !(r.stageId in scores));
}

function respondStageList(res) {
  // GET /stage/160310 (azione 108): stories[] (elemento:
  // stageId, useAp, score uint64, playStatus, clearMissionIds int[] <= 3),
  // newStageId, luxRank, openRankingId (uint).
  // Gli stage completati (player.stageScores: stageId -> record di Lux) e poi il primo
  // non ancora completato, nell'ordine del numero di missione (campo id della tabella
  // stage). playStatus: 0 = nuovo, STAGE_CLEARED (2) = completato; newStageId 0 se sono tutte completate.
  const stages = masterRows('stage').filter((r) => r.stageKind === 1).sort((a, b) => a.id - b.id);
  const scores = player.stageScores || {};
  const stories = [];
  let next = null;
  for (const r of stages) {
    if (r.stageId in scores) {
      stories.push({ stageId: r.stageId, useAp: r.useAp, score: scores[r.stageId], playStatus: STAGE_CLEARED,
        clearMissionIds: stageClearMissions(r.stageId) });
    } else {
      next = r;
      stories.push({ stageId: r.stageId, useAp: r.useAp, score: 0, playStatus: 0, clearMissionIds: [] });
      break;
    }
  }
  if (!stories.length) {
    stories.push({ stageId: START_STAGE_ID, useAp: 0, score: 0, playStatus: 0, clearMissionIds: [] });
    next = { stageId: START_STAGE_ID };
  }
  // Prova automatica delle missioni (tools/ldplayer/smoke_quests.ps1): se esiste
  // save/smoke.json {"stageId": N} l'elenco contiene solo quella missione, nuova;
  // {"stageIds": [N, ...]} (es. i tour 991001-991008) contiene solo quelle, tutte nuove
  const smokePath = path.join(path.dirname(SAVE_FILE), 'smoke.json');
  if (fs.existsSync(smokePath)) {
    const smoke = JSON.parse(fs.readFileSync(smokePath, 'utf8'));
    const ids = Array.isArray(smoke.stageIds) ? smoke.stageIds : [smoke.stageId];
    const rows = ids.map((id) => stages.find((x) => x.stageId === id)).filter(Boolean);
    if (rows.length) {
      stories.length = 0;
      for (const r of rows) stories.push({ stageId: r.stageId, useAp: 0, score: 0, playStatus: 0, clearMissionIds: [] });
      next = rows[0];
    }
  }
  send(res, 200, {
    ret: ret(),
    stories,
    newStageId: next ? next.stageId : ALL_CLEARED_NEW_STAGE,
    luxRank: 0,
    openRankingId: 0,
  });
}

// ---------------------------------------------------------------------------
// Proud Mode (I-200, docs/notes/mappe_storia.md#proud-mode): righe stage kind 4 di make-proud.js, stageId =
// 1 000 000 + stageId della storia, id = 1 000 000 + numero della missione.
// GET /stage/hard (azione 110, selezione della Proud Mode): stessa forma di /stage/160310.
// Il pulsante «Proud Mode» del client e' solo un flag (misc 125 != 0): lo sblocco e' del server.
// Decisione dell'utente (22-10): la Proud Mode si apre col completamento della storia Quest 500 (PROUD_UNLOCK_QUEST);
// poi Proud N dopo Proud N-1, come la storia (la lista originale = le Proud superate + la prossima, con «NEW»).
// ---------------------------------------------------------------------------
const PROUD_KIND = 4;
const PROUD_OFFSET = 1000000;
const PROUD_UNLOCK_QUEST = Number(process.env.KHUX_PROUD_UNLOCK_QUEST || 500);
const proudRowsSorted = () => masterRows('stage').filter((r) => r.stageKind === PROUD_KIND && r.stageId > PROUD_OFFSET).sort((a, b) => a.id - b.id);
// storia superata fino alla missione n (stage di storia completati, come la Beginner 30)
const storyClearedUpTo = (n) => stageNumber(lastStoryStageId()) >= n;
function proudUnlocked() { return storyClearedUpTo(PROUD_UNLOCK_QUEST); }
function nextProudRow() {
  const scores = player.stageScores || {};
  return proudRowsSorted().find((r) => !(r.stageId in scores));
}
// numero della Proud piu' avanzata superata (0 = nessuna): Beginner 41 «Complete up to story quest 3 in Proud Mode»
function lastProudNumber() {
  const scores = player.stageScores || {};
  let best = 0;
  for (const r of proudRowsSorted()) if (r.stageId in scores) best = Math.max(best, r.id - PROUD_OFFSET);
  return best;
}

// elenco di /stage/160310 e /stage/hard: le missioni superate e la prima non ancora superata, nell'ordine del numero
function questListOf(rows) {
  const scores = player.stageScores || {};
  const stories = [];
  let next = null;
  for (const r of rows) {
    if (r.stageId in scores) {
      stories.push({ stageId: r.stageId, useAp: r.useAp, score: scores[r.stageId], playStatus: STAGE_CLEARED,
        clearMissionIds: stageClearMissions(r.stageId) });
    } else {
      next = r;
      stories.push({ stageId: r.stageId, useAp: r.useAp, score: 0, playStatus: 0, clearMissionIds: [] });
      break;
    }
  }
  return { stories, next };
}

function respondProudList(res) {
  const rows = proudRowsSorted();
  const open = proudUnlocked() && rows.length > 0;
  const { stories, next } = open ? questListOf(rows) : { stories: [], next: null };
  if (!open) console.log(`[proud] /stage/hard: Proud Mode chiusa (storia fino alla ${stageNumber(lastStoryStageId())}, serve la ${PROUD_UNLOCK_QUEST})`);
  send(res, 200, {
    ret: ret(),
    stories,
    newStageId: next ? next.stageId : ALL_CLEARED_NEW_STAGE, // chiusa (stories []) = 0 anche lei
    luxRank: 0,
    openRankingId: 0,
  });
}

// GET /stage/achievements (azione 169, schermata Quests con le categorie; I-037, docs/notes/server.md#achievements).
// Ogni coppia numeratore/denominatore (interi a 16 bit) e' il «Progress: N%» di una categoria; COMPLETE quando
// numeratore >= denominatore, quindi 0/0 = COMPLETE (il difetto di prima: tutte le categorie complete).
// - main = Story: obiettivi compiuti delle missioni Standard (1-979) e Proud (note di versione 2.2.0: «completion
//   percentage for Standard Mode and Proud Mode challenges»); denominatore = tutti gli obiettivi di quelle missioni.
// - strength (Special), event (Events), multi (Union Cross): modalita' non ancora presenti nel server: 0/1 = «Progress:
//   0%» senza COMPLETE (nessuna sfida compiuta), finche' non ci saranno.
// - colosseumRank 0 e pvpRanking con rank 0: il client scrive «---» (nessuna classifica).
const ACHIEVEMENT_EMPTY = { numerator: 0, denominator: 1 };
function storyAchievement() {
  const done = player.clearMissions || {};
  let numerator = 0, denominator = 0;
  for (const r of masterRows('stage')) {
    const story = r.stageKind === 1 && r.id >= 1 && r.id <= STORY_LAST;
    const proud = r.stageKind === PROUD_KIND && r.stageId > PROUD_OFFSET;
    if (!story && !proud) continue;
    const n = Math.min(3, r.validSubmission || 0);
    denominator += n;
    numerator += new Set((done[r.stageId] || []).filter((m) => m >= 1 && m <= n)).size;
  }
  return { numerator, denominator };
}
function respondStageAchievements(res) {
  const main = storyAchievement();
  const cap = (v) => Math.min(0x7fff, v); // il client li legge come short
  send(res, 200, {
    ret: ret(),
    stageAchievement: {
      mainNumerator: cap(main.numerator), mainDenominator: cap(main.denominator),
      strengthNumerator: ACHIEVEMENT_EMPTY.numerator, strengthDenominator: ACHIEVEMENT_EMPTY.denominator,
      eventNumerator: ACHIEVEMENT_EMPTY.numerator, eventDenominator: ACHIEVEMENT_EMPTY.denominator,
      multiNumerator: ACHIEVEMENT_EMPTY.numerator, multiDenominator: ACHIEVEMENT_EMPTY.denominator,
      colosseumRank: 0,
      pvpRanking: { rankingStatus: 0, userPvpRanking: { rank: 0, class: 0, point: 0 } },
    },
  });
}

// In tutte le risposte di avvio "maintenance" va OMESSO: il client controlla che
// il suo tipo JSON sia null. Anche un 0 numerico vale come manutenzione attiva.

function respondSession(res) {
  // Risposta di sessione: due stringhe, entrambe decise da noi.
  send(res, 200, {
    nativeSessionId: SESSION.nativeSessionId,
    sharedSecurityKey: SESSION.sharedSecurityKey,
  });
}

function respondBootstrap(res) {
  // GET /login/token?m=0. "url" non e' una base: e' l'URL
  // completo della richiesta di sessione (corpo UUID, deviceType, nativeToken;
  // risposta {nativeSessionId, sharedSecurityKey}).
  send(res, 200, {
    url: `${SESSION_BASE}/session`,
    nativeToken: SESSION.nativeToken,
  });
}

function send(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  // risposte grandi (inventario completo): il client impiega secondi a leggerle
  if (body.length > 200000) console.log(`[send] risposta di ${Math.round(body.length / 1024)} KB`);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
function handler(scheme) {
  return (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
     try {
      let buf = Buffer.concat(chunks);
      // Le GET portano il payload cifrato nella query: ?m=0&v=<base64>. Lo si
      // tratta come se fosse il corpo, cosi' passa dallo stesso decodificatore.
      const qv = new URLSearchParams(req.url.split('?')[1] || '').get('v');
      if (!buf.length && qv) buf = Buffer.from('v=' + encodeURIComponent(qv));
      const kind = route(req.url);
      const entry = {
        scheme,
        method: req.method,
        url: req.url,
        headers: req.headers,
        handled: Boolean(kind),
        route: kind,
        ...parseBody(buf, req.headers),
      };
      logRequest(entry);
      // chiusura dei periodi delle missioni prima di ogni altra elaborazione (spec 3.6)
      if (player.created) settleClock();

      if (kind === 'status') return respondStatus(res);
      if (kind === 'login') return respondLogin(res);
      if (kind === 'coppa') return respondCoppa(res);
      if (kind === 'resourcesize') return respondResourceSize(res, entry.bodyDecoded);
      if (kind === 'master') return respondMaster(res);
      if (kind === 'masterfile') return respondMasterFile(req, res);
      if (kind === 'resource') return respondResource(res);
      if (kind === 'resourceev') return respondResourceEv(res);
      if (kind === 'resourcefile') return respondResourceFile(req, res);
      if (kind === 'tutorialstatus') return respondTutorialStatus(res, entry.bodyDecoded);
      if (kind === 'khuxlogin') return respondKhuxLogin(res);
      if (kind === 'loginbonus') return respondLoginBonus(res);
      if (kind === 'usercreate') return respondUserCreate(res, entry.bodyDecoded);
      if (kind === 'userkeyblade') return respondUserKeyblade(res);
      if (kind === 'keybladeupdate') return respondKeybladeUpdate(res, entry.bodyDecoded);
      if (kind === 'userdeck') return respondUserDeck(res);
      if (kind === 'kbsubslot') return kbEvo().respondSubslot(res, req.method, entry.bodyDecoded);
      if (kind === 'kbenhance') return kbEvo().respondEnhance(res, entry.bodyDecoded);
      if (kind === 'kbburstmax') return kbEvo().respondBurstMax(res, entry.bodyDecoded);
      if (kind === 'passivepage') return kbEvo().respondPassivePage(res); // pagina passiveSettingList, I-065
      if (kind === 'passivelist') return kbEvo().respondPassiveList(res, entry.bodyDecoded); // PUT /passive/list (249), I-065
      // Pet (server/pet.js, solo con KHUX_PET=1): 170-175 e 236
      if (kind === 'petprofile') return pet().respondProfile(res);
      if (kind === 'petparts') return pet().respondParts(res);
      if (kind === 'petcoordall') return pet().respondCoordinateAll(res);
      if (kind === 'petcoordupdate') return pet().respondCoordinateUpdate(res, entry.bodyDecoded);
      if (kind === 'petname') return pet().respondName(res, entry.bodyDecoded);
      if (kind === 'petsubslot') return pet().respondSubslot(res, entry.bodyDecoded);
      if (kind === 'petexpedition') return pet().respondExpedition(res, req.method, entry.bodyDecoded, req.url.split('?')[0]);
      if (kind === 'medalpreremove') return pet().respondPreremove(res, '/user/medal/preremove', entry.bodyDecoded);
      // GET /stage/pickup (azione 250, dopo ogni clear): missioni in evidenza, sotto la chiave
      // che il client cerca. Nessuna in evidenza: []
      if (kind === 'stagepickup') return send(res, 200, { ret: ret(), pisckupStages: [] });
      if (kind === 'usermedal') return respondUserMedal(res);
      // GET /user/skill (azione 13): userSkills completa. Senza risposta il client restava con la lista
      // vuota e la cella di una medaglia con skill (Scrooge, Overwrite) cercava il suo userSkillId nella
      // tabella delle skill senza trovarlo: crash.
      // Moogle Shop > Traits > Select Medal (I-121, banco 14-10)
      if (kind === 'userskill') return send(res, 200, { ret: ret(), userSkills: userSkillsData() });
      // GET /user/detail (azione 4, risposta userData.userDetail): dettaglio di un altro giocatore, chiesto
      // toccando la medaglia del friend nella lista amici (I-186). L'unico friend (supportUserId 1) e' il giocatore stesso
      if (kind === 'userdetail') return send(res, 200, { ret: ret(), userData: { userDetail: userDetailData() } });
      if (kind === 'medalsell') return respondMedalSell(res, entry.bodyDecoded);
      if (kind === 'medallock') return respondMedalLock(res, entry.bodyDecoded);
      if (kind === 'medalenhance') return respondMedalEnhance(res, entry.bodyDecoded);
      if (kind === 'medalshuffle') return respondMedalShuffleSkill(res, entry.bodyDecoded);
      if (kind === 'medalevolve') return respondMedalEvolve(res, entry.bodyDecoded);
      if (kind === 'medalremove') return respondMedalRemove(res, entry.bodyDecoded);
      if (kind === 'materialsell') return respondMaterialSell(res, entry.bodyDecoded);
      if (kind === 'moogleshopbuy') return respondMoogleshopBuy(res, entry.bodyDecoded);
      if (kind === 'medalmax') return respondMedalMax(res, entry.bodyDecoded);
      if (kind === 'unionchange') return respondUnionChange(res, entry.bodyDecoded);
      if (kind === 'userupdate') return respondUserUpdate(res, entry.bodyDecoded);
      // GET /user/mission/list (azione 189): missions[] e beginnerLimitTime
      if (kind === 'missionlist') { const missions = missionsData(); const beginner = beginnerLimitTime(); savePlayer(); return send(res, 200, { ret: ret(), missions, beginnerLimitTime: beginner }); }
      if (kind === 'usermission') return respondUserMission(res); // GET /user/mission (187)
      if (kind === 'beginnerpage') return respondBeginnerPage(res); // WebView «Beginner's Guide»
      // Notices (azioni 30/31, WebView /web/notices) e Album (17): server/routes-info-album.js
      if (kind === 'infolist') return send(res, 200, { ret: ret(), ...infoAlbum.informationList(SESSION_BASE) });
      if (kind === 'infopopup') return send(res, 200, { ret: ret(), ...infoAlbum.informationPopup(SESSION_BASE) });
      // Shop > Draw (azioni 75/76) e pagine/immagini dei banner
      if (kind === 'gachalist') return respondGachaList(res);
      if (kind === 'gachadraw') return respondGachaDraw(res, entry.bodyDecoded);
      if (kind === 'gachaweb') return req.method === 'POST' ? respondGachaPost(res, req.url) : respondGachaWeb(res, req.url);
      // tempi del popup Notices (segnalazione dell'utente 19-10: a volte resta vuoto a lungo al primo avvio): la
      // pagina chiama /web/notices/shown appena disegnata; il log dice quanto e' passato dalla richiesta
      if (kind === 'noticesshown') {
        const q = new URLSearchParams((entry.url || req.url || '').split('?')[1] || '');
        console.log(`  [notices] pagina disegnata ${noticesServedAt ? Date.now() - noticesServedAt : '?'} ms dopo la richiesta; fasi nella WebView (ms): risposta ${q.get('resp')}, DOM ${q.get('dom')}, primo disegno ${q.get('paint')}, load ${q.get('load')}, ora ${q.get('now')}`);
        res.writeHead(204);
        return res.end();
      }
      if (kind === 'noticespage') {
        noticesServedAt = Date.now();
        const buf = Buffer.from(infoAlbum.noticesPage(realNow()), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length });
        return res.end(buf);
      }
      if (kind === 'agreementpage' || kind === 'licensepage') {
        const buf = Buffer.from(kind === 'agreementpage' ? legalPages.agreementPage() : legalPages.licensePage(), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length });
        return res.end(buf);
      }
      if (kind === 'album') return send(res, 200, { ret: ret(), ...infoAlbum.albumData(userMedalList(), masterRows('medal'),
        (t) => (medalGuilt.GUILT_RANGES[t] || {}).max || 0) });
      // Party (82, 87) e classifiche (129-140, 178-184): server/routes-party-ranking.js
      if (['partylogin', 'partysearch', 'rankinglist', 'partycreate', 'party', 'partymembers', 'partydetail', 'partyupdate', 'partyleave', 'partyemptylist'].includes(kind)) {
        return respondPartyRanking({ send, ret, serverTime, realNow, outTime, player, userObject, userDetailData, userAvatarData, savePlayer, addPresent,
          selfElement: (now, partyId) => selfPlayerElement(now, sharedMedalData(now), partyId),
          keyblade: () => userKeybladeData(favoriteKeyblade()), lastStoryQuest: () => stageNumber(lastStoryStageId()), weeklyLux: () => weeklyLux() },
          res, kind, req.url.split('?')[0].toLowerCase(), entry.bodyDecoded);
      }
      // Avatar Boards: GET /user/sphere (azione 10, sostituisce l'elenco), POST /user/sphere/check e
      // /check/170119 (azioni 60/61: userSphere in merge, closeEventSphereBoardIds se checkTypes ha 3)
      if (kind === 'spherelist') { const userSphere = userSphereAll(); savePlayer(); return send(res, 200, { ret: ret(), userSphere }); }
      if (kind === 'sphereupdate') return respondSphereUpdate(res, entry.bodyDecoded);
      if (kind === 'spherecheck') return respondSphereCheck(res);
      if (kind === 'missionreceive') return respondMissionReceive(res, entry.bodyDecoded);
      if (kind === 'userdetailupdate') return respondUserDetailUpdate(res, req.url.split('?')[0], entry.bodyDecoded);
      // GET /moogleshop/list: moogleshops[] = {moogleshopId, limitCount} (acquisti
      // gia' fatti per riga); le righe vendute stanno nella tabella master moogleshop
      // Prova (10 ottobre): con la tabella piena ma moogleshops vuoto il client scrive «No
      // items available.»: si elencano le righe attive, limitCount = scambi rimasti
      if (kind === 'moogleshoplist') {
        const bought = player.moogleshopBought || {};
        return send(res, 200, { ret: ret(), moogleshops: masterRows('moogleshop').map((r) => ({
          moogleshopId: r.moogleshopId, limitCount: r.count ? Math.max(0, r.count - (bought[r.moogleshopId] || 0)) : 0 })) });
      }
      if (kind === 'stagelist') return respondStageList(res);
      if (kind === 'stagehard') return respondProudList(res);
      if (kind === 'stageachievements') return respondStageAchievements(res);
      if (kind === 'stagestart') return respondStageStart(res, entry.bodyDecoded);
      if (kind === 'stagecontinue') return respondStageContinue(res, req.url.split('?')[0], entry.bodyDecoded);
      if (kind === 'stageclear') return respondStageClear(res, entry.bodyDecoded);
      if (kind === 'aprecover') return respondApRecover(res);
  if (kind === 'stageevent') return respondStageEvent(res);
  if (kind === 'usernotice') return send(res, 200, { ret: ret(), raidNotice: { isSelfRaid: 0, isOthersRaid: 0 } });
  if (kind === 'colosseum') return respondColosseum(res);
      // GET /campaign (azione 143): campaigns, array di int (id delle campagne attive)
      if (kind === 'campaign') return send(res, 200, { ret: ret(), campaigns: [] });
      // POST /ranking/reward/check (azione 142): il client
      // vuole tre array in radice (lastRankingResults, rankingRewardIds, openRankingIds),
      // poi rankingReward: array vuoto = nessun premio di classifica.
      // Senza: «200 ERROR :142» al Challenge della Daily del Coliseum (banco 14-10)
      if (kind === 'rankingrewardcheck') {
        return send(res, 200, { ret: ret(), lastRankingResults: [], rankingRewardIds: [], openRankingIds: [], rankingReward: [] });
      }
      if (kind === 'pvp') return respondPvp(res, req.url.split('?')[0], req.method, entry.bodyDecoded);
      // GET /raid/list/181221 (azione 240): selfRaid (
      // raidStatus int, raid {raidId uint64, level, useAp, timeLeft, feverFlag,
      // feverTime, stageId, parts[]}) e raids[] ({...raid, isRelief, isEntry}).
      // Nessun raid: raidStatus 0.
      if (kind === 'raidlist') {
        const now = serverTime();
        return send(res, 200, {
          ret: ret(),
          selfRaid: {
            raidStatus: 0,
            raid: { raidId: 0, level: 0, useAp: 0, timeLeft: now, feverFlag: 0, feverTime: now, stageId: 0, parts: [] },
          },
          raids: [],
        });
      }
      // GET /user/support: la medaglia di supporto del giocatore (supportUser). Con
      // medalId 0 la home cerca la medaglia 0 e va in crash (riga nulla):
      // si usa la prima medaglia del deck, con la keyblade iniziale.
      // POST /user/support/update {supportMedalId = userMedalId} (azione 47, Share del dettaglio della medaglia):
      // stessa risposta della 19; la medaglia scelta resta in player.supportUserMedalId.
      if (kind === 'usersupport') {
        const sid = Number(entry.bodyDecoded?.supportMedalId);
        if (sid && userMedalList().some((u) => u.userMedalId === sid)) {
          player.supportUserMedalId = sid; savePlayer();
          console.log(`  [support] medaglia condivisa ${sid}`);
        }
        const shared = player.supportUserMedalId && userMedalList().find((u) => u.userMedalId === player.supportUserMedalId);
        const m = shared || startingInventory().medals[0] || { userMedalId: 0, medalId: 0 };
        return send(res, 200, {
          ret: ret(),
          supportUser: {
            supportUserId: 1, userName: player.name, level: luxRankFor(player.lux),
            ...playerTitleIds(), partyId: 0,
            userKeybladeId: favoriteKeybladeId(), keybladeId: favoriteKeyblade().keybladeId,
            userMedalId: m.userMedalId, medalId: m.medalId, lastActionDatetime: serverTime(),
          },
        });
      }
      // GET /stage/support/list (azione 111, chiave "supportUsers"): prima della
      // scelta del deck. Con la lista vuota il client va in crash sulle statistiche di una
      // medaglia senza riga. Elemento con userMedal,
      // userSkills[] e userAvatar. Un
      // supporto: il giocatore stesso, con la medaglia condivisa (Share).
      if (kind === 'supportlist') {
        const now = serverTime();
        const medal = sharedMedalData(now);
        const supportUsers = medal ? [selfPlayerElement(now, medal)] : [];
        return send(res, 200, { ret: ret(), supportUsers });
      }
      // GET /user/avatar (21), /user/avatar/all (22), /user/avatar/parts (23)
      if (kind === 'useravatar') {
        const p = req.url.split('?')[0];
        if (p === '/user/avatar/parts') return send(res, 200, { ret: ret(), userAvatarParts: userAvatarPartsData() });
        if (p === '/user/avatar/all') return send(res, 200, { ret: ret(), userAvatars: [userAvatarData()] });
        return send(res, 200, { ret: ret(), userAvatar: userAvatarData() });
      }
      // GET /raid/reward/151101 (azione 120): userData.userPoint,
      // raidRewards[] e guiltBurstFirst/MaxUserMedalIds. Nessun premio.
      if (kind === 'raidreward') {
        return send(res, 200, {
          ret: ret(),
          userData: { userPoint: userPointData(serverTime()) },
          raidRewards: [],
          ...guiltBurst().lists(), // guiltBurstFirst/MaxUserMedalIds
        });
      }
      // GET /user/point (azione 2) e POST /user/sphere/reset (azione 62): solo
      // userData.userPoint
      if (kind === 'userpoint') return send(res, 200, { ret: ret(), userData: { userPoint: userPointData(serverTime()) } });
      // GET /user/stone (azione 7): i jewel. freeStone = guadagnati in
      // gioco (premi delle missioni), payStone = comprati (sempre 0)
      if (kind === 'userstone') return send(res, 200, { ret: ret(), userStone: { freeStone: player.freeStone || 0, payStone: 0 } });
      // Presents: GET /user/present (azione 20) e POST /user/present/receive (azione 49)
      if (kind === 'userpresent') return respondUserPresent(res);
      if (kind === 'presentreceive') return respondPresentReceive(res, entry.bodyDecoded);
      // GET /user/material (azione 16): userMaterials[]
      if (kind === 'usermaterial') return send(res, 200, { ret: ret(), userMaterials: userMaterialsData() });
      if (kind === 'user') return respondUser(res);
      if (kind === 'userprofile') return respondUserProfile(res);
      if (kind === 'mypage') return respondMyPage(res);
      // GET /user/birthday (azione 9): birthday = AAAAMM (anno = /100, mese =
      // %100), dalla data di POST /user/create. Con 0 il client tratta il giocatore come minore
      // di 13 anni: popup Name/Message senza messaggio (AvatarInfo_Comment_U13)
      // GET /user/title (azione 18): userTitles[] {userTitleId uint64, titleId}.
      // Titoli posseduti: quelli di categoria 1 («Default Title», li ha ogni giocatore) e quelli
      // guadagnati (player.titles). Li elenca il popup Titles del Profilo (Edit, Nameplate).
      if (kind === 'usertitle') {
        return send(res, 200, { ret: ret(), userTitles: userTitlesData() });

      }
      if (kind === 'userbirthday') {
        const m = /^(\d{4})-(\d{2})/.exec(player.birthday || '');
        return send(res, 200, { ret: ret(), birthday: m ? Number(m[1]) * 100 + Number(m[2]) : 0 });
      }
      if (kind === 'session') return respondSession(res);
      if (kind === 'bootstrap') return respondBootstrap(res);
      if (kind && kind.startsWith('multi')) return multi().respond(kind, res, entry.bodyDecoded);

      const generated = schemaResponse(req.url.split('?')[0]);
      if (generated) return send(res, 200, generated);

      // Sconosciuta: rispondiamo il minimo che il client accetta, cioe' il solo
      // involucro "ret", perche' prosegua e ci mostri la richiesta successiva.
      // Scoprire la sequenza vale piu' che rispondere bene a una singola chiamata.
      send(res, 200, { ret: ret() });
     } catch (e) {
      // nessuna rotta deve poter abbattere il server: log con rotta e stack, risposta neutra
      console.log(`  [errore] rotta ${route(req.url)}: ${e && e.stack || e}`);
      if (!res.headersSent) send(res, 200, { ret: ret() });
     }
    });
  };
}

// Union Cross (server/multi.js): le funzioni del giocatore che gli servono
// Potenziamento/evoluzione dei keyblade e sub-slot (server/keyblade-evo.js)
var kbEvoInstance = null; // var: ownedKeyblades() puo' servire prima di questa riga
function kbEvo() {
  return kbEvoInstance ??= makeKeybladeEvo({
    ret, send, serverTime, masterRows, player, savePlayer, ownedKeyblades, userMedalList,
    userKeybladesData, userDecksData, userMaterialsData, userTitlesData, USER_KEYBLADE_ID,
    luxLevel: () => luxRankFor(player.lux), // condizioni Lux delle passive (PUT /passive/list)
  });
}

// Burst: livello, isGuilt e liste guiltBurstFirst/MaxUserMedalIds (server/guilt-burst.js)
var guiltBurstInstance = null;
function guiltBurst() {
  return guiltBurstInstance ??= makeGuiltBurst({ getPlayer: () => player, userMedalList, masterRows });
}

// userDetail.isGuilt: Power Bangle, premio della Quest 34 (guida dell'utente p. 16, khuxwiki;
// docs/notes/guilt.md). lastClearStageId e' uno stageId, il confronto e' sul numero della
// missione (campo id di stage, come userDetail.lastClearStageId). Con KHUX_GUILT_BURST_LV (livello
// fisso per le prove del Burst) sempre 1, come prima.
const POWER_BANGLE_QUEST = 34;
function isGuiltUnlocked() {
  const fixed = process.env.KHUX_GUILT_BURST_LV;
  if (fixed !== undefined && fixed !== '' && Number(fixed) > 0) return 1;
  return stageNumber(player.lastClearStageId) >= POWER_BANGLE_QUEST ? 1 : 0;
}

// Pet / 6° slot (server/pet.js, KHUX_PET=1)
var petInstance = null;
function pet() {
  return petInstance ??= makePet({
    ret, send, serverTime, masterRows, player, savePlayer, userMedalList, userMedalElement, schemaResponse,
    realNow, outTime, monthIndex: clock.monthIndex, weekEnd: clock.weekEnd, monthEnd: clock.monthEnd,
    medalResumption: medalResumptionData,
  });
}
// petSubslot per le azioni 55/56: spento = il segnaposto di prima (tutto a 0)
function petSubslotNow() {
  return PET_ENABLED ? pet().petSubslotData()
    : { subslotUserMedalIds: [], openSkillIds: [], rank: 0, pt: 0, magnification: 0 };
}

let multiInstance = null;
function multi() {
  return multiInstance ??= makeMulti({
    ret, send, serverTime, masterRows, userPointData, userKeybladesData, schemaResponse, player, savePlayer,
    publicHost: () => (/^https?:\/\/([^/:]+)/.exec(PUBLIC_URL) || [])[1] || '127.0.0.1',
  });
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
function start() {
  console.log('--- server privato KHUX (fase B) ---');
  // MD5 dei pacchetti di risorse calcolati subito, non alla prima richiesta del client;
  // solo l'ultima versione (l'unica annunciata): con tutte, a dozzine di GB, il server si
  // metteva in ascolto dopo minuti e il client andava in timeout («28 ERROR :251», curl 28)
  for (const v of resourceVersions().slice(-1)) {
    const n = resourceFiles(v, 'data').length + resourceFiles(v, 'index').length;
    console.log(`risorse versione ${v}: ${n} file pronti`);
  }
  console.log('url consegnata al client :', PUBLIC_URL);
  console.log('nativeSessionId          :', SESSION.nativeSessionId);
  console.log('sharedSecurityKey        :', SESSION.sharedSecurityKey);
  console.log('log delle richieste      :', LOG_FILE);
  // una tabella che non passa lo schema non viene servita e il client tiene la sua copia vecchia senza errori
  // (20-10: burst scartata per 4 valori oltre int32, Lexaeus A 7★ fermo a x1.95): avviso all'avvio
  const allTables = fs.existsSync(MASTER_DIR) ? fs.readdirSync(MASTER_DIR).filter((f) => f.endsWith('.json') && MASTER_SCHEMA[f.slice(0, -5)]).length : 0;
  const served = masterTables().filter((n) => MASTER_SCHEMA[n]).length;
  if (served < allTables) console.log(`!!! MASTER: ${allTables - served} tabelle scartate dallo schema (vedi [master] sopra), il client non le riceve`);
  else console.log(`master                   : ${served} tabelle valide`);
  console.log();

  http.createServer(handler('http')).listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`in ascolto su http://0.0.0.0:${HTTP_PORT}`);
  }).on('error', (e) => console.error('HTTP non avviato:', e.message));

  const key = path.join(CERT_DIR, 'server.key');
  const cert = path.join(CERT_DIR, 'server.crt');
  if (fs.existsSync(key) && fs.existsSync(cert)) {
    // Lo SNI dice quale host il client voleva raggiungere, anche quando l'handshake
    // poi fallisce: e' l'unico modo di vedere il nome se il DNS non passa da noi
    // (LDPlayer risolve fuori dal guest e noi dirottiamo solo il TCP).
    const sniSeen = new Set();
    https.createServer(
      {
        key: fs.readFileSync(key),
        cert: fs.readFileSync(cert),
        SNICallback: (servername, cb) => {
          if (!sniSeen.has(servername)) {
            sniSeen.add(servername);
            console.log(`\x1b[36m[tls:sni]\x1b[0m ${servername}`);
          }
          cb(null);
        },
      },
      handler('https')
    ).listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`in ascolto su https://0.0.0.0:${HTTPS_PORT}`);
    }).on('tlsClientError', (e, sock) => {
      const sni = sock.servername || '-';
      console.log(`\x1b[31m[tls:errore]\x1b[0m ${sni}  ${e.code || ''} ${e.message}`);
    }).on('error', (e) => console.error('HTTPS non avviato:', e.message));
  } else {
    console.log('HTTPS disattivato: certificato assente. Generalo con server/make-cert.sh');
  }

  multi().startPhotonLogger();

  if (DNS_ENABLED) {
    // L'IP da annunciare e' quello della nostra url pubblica.
    const m = PUBLIC_URL.match(/^https?:\/\/([^/:]+)/);
    const ip = m ? m[1] : '127.0.0.1';
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      console.log(`DNS disattivato: KHUX_PUBLIC_URL deve contenere un IP, non "${ip}"`);
    } else {
      startDns({ ip, hijack: HIJACK, upstream: DNS_UPSTREAM, port: DNS_PORT, logFile: DNS_LOG_FILE });
    }
  }
}

// Keyblade da dare senza passare dal premio (I-087), a ogni avvio e alla creazione del giocatore:
// 1. premi gia' ricevuti, cioe' primo completamento (clearGetItemType 13, es. stage 1110 ->
//    Treasure Trove) e obiettivi compiuti (submissionRewardType 13): riparazione dei salvataggi
//    (prima solo con player.keyblades assente; il salvataggio del 12-10 aveva la Quest 34 superata
//    senza Three Wishes);
// 2. serie senza nessun premio nel master 5.0.1: Moogle O' Glory (Moogle Quest), Sleeping Lion,
//    Counterpoint, Fenrir, Darkgnaw, Missing Ache, Diamond Dust (Proud Mode, assente), Stroke of
//    Midnight, Fairy Stars, Bad Guy Breaker (quest 595/683/880: con le righe 526-979 del master sono premi di
//    missione e da qui non passano piu'): altrimenti irraggiungibili (khuxwiki,
//    reference\keyblades\keyblade_levels.json «obtain»);
// 3. KHUX_KB_ALL=1: anche le serie della storia non ancora raggiunte (Divine Rose, Quest 433).
// KHUX_KB_UNOBTAINABLE=0 spegne il punto 2. Un keyblade per serie (grantKeyblade), mai doppioni.
function keybladeRewardIds() {
  const ids = [];
  for (const st of masterRows('stage')) {
    (st.clearGetItemType || []).forEach((t, i) => { if (t === 13) ids.push({ id: st.clearGetItemId[i], st, clear: true }); });
    (st.submissionRewardType || []).forEach((t, i) => { if (t === 13) ids.push({ id: st.submissionItemId[i], st, mission: i + 1 }); });
  }
  return ids;
}

function grantMissingKeyblades() {
  player.keyblades = player.keyblades || [];
  const cat = (id) => masterRows('keyblade').find((r) => r.keybladeId === id)?.category;
  const owned = () => new Set(ownedKeyblades().map((k) => cat(k.keybladeId)));
  const give = (id, why) => {
    if (owned().has(cat(id))) return;
    grantKeyblade(id);
    console.log(`[save] keyblade ${id} dato: ${why}`);
  };
  const rewards = keybladeRewardIds();
  for (const r of rewards) {
    const got = r.clear ? r.st.validClearGetItem && r.st.stageId in (player.stageScores || {})
      : ((player.clearMissions || {})[r.st.stageId] || []).includes(r.mission);
    if (got) give(r.id, `premio gia' ricevuto (stage ${r.st.stageId})`);
    else if (process.env.KHUX_KB_ALL === '1') give(r.id, `KHUX_KB_ALL (premio dello stage ${r.st.stageId})`);
  }
  if (process.env.KHUX_KB_UNOBTAINABLE !== '0') {
    const rewarded = new Set(rewards.map((r) => cat(r.id)));
    const base = masterRows('keyblade').filter((r) => r.lv === 0 && !rewarded.has(r.category));
    for (const r of base.sort((a, b) => a.category - b.category)) give(r.keybladeId, 'nessun premio nel master');
  }
}

// skill (I-146): qui e non accanto a migrateClock() perche' usa le tabelle (medalSkillTables, userMedalList)
// definite piu' avanti nel file
// id Organizzazione XIII (medalMapVersion 2), prima delle skill: migrateSkills cerca le medaglie nel master
if (player.created) migrateMedalMap(); else player.medalMapVersion = 2;
if (player.created) migrateSkills(); else player.skillVersion = 1; // nuovo giocatore: gia' sulla tabella completa

if (player.created) {
  const before = (player.keyblades || []).length;
  grantMissingKeyblades();
  if (player.keyblades.length !== before) savePlayer();
}

if (require.main === module) start();
module.exports = { SESSION, parseBody, start, route, multi };
// per i test senza client (server/test-medal-enhance.js, con KHUX_SAVE e KHUX_MASTER_DIR propri)
module.exports._test = {
  player, respondMedalEnhance, respondMedalShuffleSkill, respondUser, respondMedalEvolve, userMedalList, userMedalElement, userPointData, isGuiltUnlocked, userSkillsData,
  // server/test-keyblades.js
  kbEvo, ownedKeyblades, grantKeyblade, grantMissingKeyblades, userKeybladesData, userDecksData, masterRows,
  // server/test-keyblade-unlock.js
  respondUserCreate, respondStageClear, grantDeckSkillExp,
  // server/test-skill-migration.js
  migrateSkills, migrateMedalMap,
  // server/test-clock-migration.js
  migrateClock, clockMonthIndex: clock.monthIndex, userSkillElement, userSphereData, userKeybladeData,
  // server/test-clock-server.js
  serverTime, serverTimeAt, realNow, clockOffset, outTime, respondKhuxLogin,
  // server/test-login-bonus.js
  respondLoginBonus, loginBonusAcquirable,
  // server/test-deck-sets.js
  respondKeybladeUpdate, userDecksData, multiDecksUnlocked, activeDeck, keybladeDeckIds, respondMedalRemove,
  // server/test-pet-tricks.js
  applySteal, stealMultiplier, respondStageStart, respondStageClear, STAGE_POI, rewardRowById, ENEMY_DROP_TYPE,
  // server/test-limited.js
  missionsData, missionCount, respondMissionReceive, limitedActive, LIMITED_ROTATION, pet, limitedGroupQuest, forceStoryQuest: (q) => { storyQuestForced = q; },
  // server/test-mission-settle.js
  settleClock, MISSION_COUNTER, MISSION_DERIVED, missionProgress, petSubslotNow, guiltBurst,
  // server/test-master-clock.js
  masterRevisionNow, servedMasterRows, sessionRevision, respondLogin, respondMasterFile, masterBody, respondMaster, respondResourceSize, respondStatus,
  // server/test-story-oltre.js (missioni 526-979)
  respondStageList, lastStoryStageId, stageNumber, stageRowOf, userDetailData, ensureUnion,
  // server/test-proud.js (Proud Mode, I-200)
  respondProudList, proudUnlocked, lastProudNumber, poiStageId, stageTreasures, stageEnemyDrops,
  // server/test-achievements.js (I-037)
  respondStageAchievements,
  // server/test-gacha-server.js
  sessionRealMs, handler, sanitizeBanners, gachaCatalog, gachaShopList, respondGachaList, respondGachaDraw, respondGachaWeb, respondGachaPost, reloadGachaBanners, grantItem, maxMedal, inventoryBlocks,
};
