// Union Cross (multigiocatore, azioni 158-166 di json/server_api.json): risposte per un
// giocatore da solo. Note in docs/notes/union_cross.md.
//
// Il client 4.3.1 gioca le stanze con Photon (ExitGames LoadBalancing, linkato nella
// libreria): dopo /multi/create si collega in UDP al master server di
// /multi/status.serverAddress ("host:porta"), crea o entra in una stanza e solo dopo manda
// /multi/start. Un server Photon non c'e': qui sotto c'e' solo un ascoltatore UDP che
// registra i pacchetti del client (per un futuro emulatore) senza rispondere, cosi' il
// collegamento scade e il client mostra il suo errore di connessione.
'use strict';

const dgram = require('dgram');

const PHOTON_PORT = Number(process.env.KHUX_PHOTON_PORT || 5055);

function routeMulti(p) {
  switch (p) {
    case '/multi/status': return 'multistatus';
    case '/multi/talk': return 'multitalk';
    case '/multi/matching/member/list': return 'multimembers';
    case '/multi/create': case '/multi/recreate': return 'multicreate';
    case '/multi/start': return 'multistart';
    case '/multi/retire': return 'multiretire';
    case '/multi/continue': return 'multicontinue';
    case '/multi/clear': return 'multiclear';
    default: return null;
  }
}

// ctx: { ret, send, serverTime, masterRows, userPointData, userKeybladesData, schemaResponse,
//        publicHost, player, savePlayer }
function makeMulti(ctx) {
  // Eventi Union Cross attivi = righe valide della master `multi` con la data del server
  // dentro [startTime, endTime]. Senza eventi il client va in crash: il pannello Union Cross
  // della schermata Quest legge multiEvents[0] senza controllare che ci sia
  // e poi la riga master `multi` di quel multiId (tabella 0x3e).
  function activeMultis() {
    const now = ctx.serverTime();
    return ctx.masterRows('multi').filter((r) => r.valid && (!r.startTime || r.startTime <= now)
      && (!r.endTime || now <= r.endTime));
  }

  // GET /multi/status (158): serverAddress (stringa, obbligatoria), multiEvents[]
  // (obbligatorio; elemento multiId int, useAp int, endTime data, bannerUrl
  // stringa), multiUsers[] (facoltativo, elementi come supportUsers).
  function status() {
    return {
      ret: ctx.ret(),
      serverAddress: `${ctx.publicHost()}:${PHOTON_PORT}`,
      multiEvents: activeMultis().map((r) => ({
        multiId: r.multiId, useAp: r.useAp, endTime: r.endTime || '2030-12-31 23:59:59', bannerUrl: r.bannerUrl || '',
      })),
      multiUsers: [],
    };
  }

  // GET /multi/matching/member/list (166): matchingMemberList[] = membri del Party che cercano
  // compagni (stesso formato di /stage/support/list con la chiave
  // «matchingMemberList»). Vuoto: il tasto Button_Last_Member resta nascosto. Lo stesso
  // elenco riempie la lista Multi (layout PartyTop_MultiMemberList_Scene_ver150).
  function members() {
    return { ret: ctx.ret(), matchingMemberList: [] };
  }

  // POST /multi/create (160, corpo {multiId}) e /multi/recreate (161, {multiId,
  // prevMultiRoomId}), i cinque array come /stage/start, poi multiStageId (uint)
  // e multiRoomId (uint64). Lo stage: il primo di stageStartId..stageEndId della riga multi.
  function create(body) {
    const multiId = Number(body?.multiId) || activeMultis()[0]?.multiId || 0;
    const row = ctx.masterRows('multi').find((r) => r.multiId === multiId);
    const multiStageId = row?.stageStartId?.[0] || ctx.masterRows('multiStage')[0]?.multiStageId || 0;
    const p = ctx.player;
    p.multiRoomSeq = (p.multiRoomSeq || 0) + 1;
    p.multiRoom = { multiId, multiStageId, multiRoomId: p.multiRoomSeq };
    ctx.savePlayer();
    console.log(`[multi] stanza ${p.multiRoomSeq}: multiId ${multiId}, multiStageId ${multiStageId}`
      + ' (il client ora prova Photon UDP sulla porta ' + PHOTON_PORT + ')');
    return {
      ret: ctx.ret(),
      userRandomEnemies: [], userEnemyDropItems: [], userTreasures: [], userRandomEnemyLevel: [], timeMissionIds: [],
      multiStageId, multiRoomId: p.multiRoomSeq,
    };
  }

  // POST /multi/start (162; corpo multiId, multiStageId, userKeybladeId, roomCreateUserId,
  // multiRoomId, isSteal); risposta: userData.userPoint e
  // (userKeybladeId uint64, campaigns[]). Il client la manda solo dopo essere
  // entrato nella stanza Photon: offline non ci arriva.
  function start(body) {
    return {
      ret: ctx.ret(),
      userData: { userPoint: ctx.userPointData(ctx.serverTime()) },
      userKeybladeId: Number(body?.userKeybladeId) || 1,
      campaigns: [],
    };
  }

  return {
    route: routeMulti,
    respond(kind, res, body) {
      switch (kind) {
        case 'multistatus': return ctx.send(res, 200, status());
        // GET /multi/talk (159): multiTalkIds[] (frasi rapide della stanza)
        case 'multitalk': return ctx.send(res, 200, { ret: ctx.ret(), multiTalkIds: [] });
        case 'multimembers': return ctx.send(res, 200, members());
        case 'multicreate': return ctx.send(res, 200, create(body));
        case 'multistart': return ctx.send(res, 200, start(body));
        // POST /multi/retire (164): il client non legge campi oltre a ret
        case 'multiretire': return ctx.send(res, 200, { ret: ctx.ret() });
        // POST /multi/continue (165): userKeyblades[]
        case 'multicontinue': return ctx.send(res, 200, { ret: ctx.ret(), userKeyblades: ctx.userKeybladesData() });
        // POST /multi/clear (163): schema automatico (api_responses_auto_ww431.json), mai
        // visto sul banco: serve una partita Photon finita
        case 'multiclear': {
          const r = ctx.schemaResponse('/multi/clear') || { ret: ctx.ret() };
          if (r.userData?.userPoint) r.userData.userPoint = ctx.userPointData(ctx.serverTime());
          return ctx.send(res, 200, r);
        }
        default: return ctx.send(res, 200, { ret: ctx.ret() });
      }
    },
    // Ascoltatore Photon: registra i datagrammi (intestazione Photon UDP: peerId 2 byte,
    // crcEnabled 1, commandCount 1, time 4, challenge 4, poi i comandi) senza rispondere.
    startPhotonLogger(log = console.log) {
      if (process.env.KHUX_PHOTON === '0') return null;
      const sock = dgram.createSocket('udp4');
      const seen = new Map();
      sock.on('message', (msg, rinfo) => {
        const k = `${rinfo.address}:${rinfo.port}`;
        const n = (seen.get(k) || 0) + 1;
        seen.set(k, n);
        if (n <= 5 || n % 50 === 0) {
          log(`\x1b[35m[photon]\x1b[0m ${k} #${n} ${msg.length} byte: ${msg.subarray(0, 48).toString('hex')}`);
        }
      });
      sock.on('error', (e) => log('Photon UDP non avviato:', e.message));
      sock.bind(PHOTON_PORT, '0.0.0.0', () => log(`in ascolto su udp://0.0.0.0:${PHOTON_PORT} (Photon, solo log)`));
      return sock;
    },
  };
}

module.exports = { makeMulti, routeMulti, PHOTON_PORT };
