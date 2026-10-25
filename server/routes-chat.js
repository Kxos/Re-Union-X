// Chat del party di un solo giocatore (I-210, opzione 2 scelta dall'autore il 25-10; protocollo ricavato dal client,
// note private «i210_party_chat»). Prima il tocco sull'icona della chat chiudeva il gioco (layout Chat_Panel assente);
// con i layout JP importati il client chiede:
// - 24 GET /payment/info: paymentInfo.cesaLimitAge; sotto 13 nasconde il campo di testo (solo adesivi);
// - 6 GET /user/chat: userData.userChat {userId, tagName, userEndpointUrl, stampIds}, authToken, userToken;
// - poi il servizio di chat, HTTP in chiaro (niente cifratura ne' m=/i=/v=, intestazione X-HTTP-USER-TOKEN), agli url
//   userEndpointUrl (U) e party.chatEndpointUrl (C) con chatId del party (1):
//     GET U/user?getChatEntry=1&getBlockEntry=1 -> {chatEntry:[{chatId, chatReadMessageNumber, chatUnreadCount}], blockEntry}
//     PUT U/user/chat/<id> {chatReadMessageNumber}
//     GET C/chat/message/<id>?count=N&startIndex=K | &startMessageNumber=N -> {entry, startIndex, itemPerPage, totalResults}
//     POST C/chat/message/<id>/0 {messageData, userIpAddress}; adesivi come testo ISTAMP:TALKS:<id> / ISTAMP:MEDAL:<id>
//     DELETE C/chat/message/<id>/<messageNumber>; POST C/chat/message/report; U/user/block[/<tag>]
//   Scritture: basta un 2xx. Messaggio: messageNumber, tagName, userEndPointUrl (P maiuscola), nickName (= userId del
//   mittente in decimale: il client lo converte con stoull e lo confronta con user.userId per i propri messaggi),
//   userImageUrl, messageData, messageStatus, createAt (formato delle date della API principale).
// Il servizio sta sotto /chatsvc sullo stesso host (/user e' gia' l'azione 1 della API principale). Il party ha un solo
// membro, quindi i messaggi sono solo del giocatore: restano nel salvataggio (player.chat), al massimo 1000.
'use strict';

const PREFIX = '/chatsvc';
const CHAT_ID = 1;
const MAX_MESSAGES = 1000;
const MAX_CHARS = 40; // misc 809, il limite del campo di testo
const USER_ID = 1;

const CHAT_URL = (deps) => deps.publicUrl.replace(/\/+$/, '') + PREFIX;

function routeChat(p) {
  if (p === '/user/chat') return 'userchat';
  if (p === '/payment/info') return 'paymentinfo';
  if (p === PREFIX || p.startsWith(PREFIX + '/')) return 'chatsvc';
  return null;
}

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

const state = (player) => {
  if (!player.chat) player.chat = { messages: [], read: 0, last: 0 };
  return player.chat;
};

function addMessage(deps, text) {
  const c = state(deps.player);
  c.last = Math.max(c.last || 0, ...c.messages.map((m) => m.messageNumber)) + 1;
  c.messages.push({ messageNumber: c.last, messageData: text, createAt: deps.serverTime() });
  if (c.messages.length > MAX_MESSAGES) c.messages.splice(0, c.messages.length - MAX_MESSAGES);
  deps.savePlayer();
  return c.last;
}

// il servizio di chat legge createAt come ora giapponese (UTC+9), la API principale come UTC: senza lo spostamento un
// messaggio appena mandato mostrava «9 hours ago» (banco 25-10). Nel salvataggio resta l'ora del server
const JST_MS = 9 * 3600 * 1000;
const toJst = (s) => {
  const t = Date.parse(String(s).replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? new Date(t + JST_MS).toISOString().slice(0, 19).replace('T', ' ') : s;
};

const element = (deps, m) => ({
  messageNumber: m.messageNumber, tagName: String(USER_ID), userEndPointUrl: CHAT_URL(deps), nickName: String(USER_ID),
  userImageUrl: '', messageData: m.messageData, messageStatus: 0, createAt: toJst(m.createAt),
});

// kind: 'userchat' | 'paymentinfo' | 'chatsvc'; body: corpo JSON in chiaro (servizio) o decifrato (API principale)
function respondChat(deps, res, kind, method, url, body) {
  const ret = deps.ret ? deps.ret() : {};
  if (kind === 'paymentinfo') {
    return json(res, 200, { ret, paymentInfo: { cesaLimitAge: 20, chargeMoneyThisMonth: 0, lastchargeMoneyThisMonth: 0 } });
  }
  if (kind === 'userchat') {
    return json(res, 200, { ret, userData: { userChat: { userId: USER_ID, tagName: String(USER_ID), userEndpointUrl: CHAT_URL(deps),
      stampIds: deps.stampIds ? deps.stampIds() : [] } }, authToken: 'rx-chat', userToken: 'rx-chat' });
  }
  const [p, q] = url.split('?');
  const path = p.toLowerCase().slice(PREFIX.length);
  const query = new URLSearchParams(q || '');
  const inParty = Boolean(deps.player.party);
  const c = inParty ? state(deps.player) : { messages: [], read: 0 };
  const lastNumber = c.messages.length ? c.messages[c.messages.length - 1].messageNumber : 0;
  if (method === 'GET' && path === '/user') {
    return json(res, 200, { chatEntry: [{ chatId: CHAT_ID, chatReadMessageNumber: c.read || 0,
      chatUnreadCount: c.messages.filter((m) => m.messageNumber > (c.read || 0)).length }], blockEntry: [] });
  }
  if (method === 'PUT' && path === `/user/chat/${CHAT_ID}`) {
    const n = Number(body && body.chatReadMessageNumber);
    if (inParty && Number.isFinite(n)) { c.read = Math.min(Math.max(c.read || 0, n), lastNumber); deps.savePlayer(); }
    return json(res, 200, {});
  }
  if (method === 'GET' && path === `/chat/message/${CHAT_ID}`) {
    const count = Math.max(1, Math.min(Number(query.get('count')) || MAX_MESSAGES, MAX_MESSAGES));
    let list = c.messages, start = 0;
    if (query.has('startMessageNumber')) list = list.filter((m) => m.messageNumber >= Number(query.get('startMessageNumber')));
    else start = Math.max(0, Number(query.get('startIndex')) || 0);
    return json(res, 200, { entry: list.slice(start, start + count).map((m) => element(deps, m)), startIndex: start,
      itemPerPage: count, totalResults: list.length });
  }
  if (method === 'POST' && path === `/chat/message/${CHAT_ID}/0`) {
    const text = body && body.messageData;
    if (typeof text !== 'string' || !text) return json(res, 400, {});
    if (inParty) addMessage(deps, /^ISTAMP:/.test(text) ? text : [...text].slice(0, MAX_CHARS).join(''));
    return json(res, 200, {});
  }
  const del = new RegExp(`^/chat/message/${CHAT_ID}/(\\d+)$`).exec(path);
  if (method === 'DELETE' && del) {
    if (inParty) {
      c.messages = c.messages.filter((m) => m.messageNumber !== Number(del[1]));
      deps.savePlayer();
    }
    return json(res, 200, {});
  }
  // segnalazione e blocco: nessun altro utente nel party
  if (path === '/chat/message/report' || path === '/user/block' || path.startsWith('/user/block/')) return json(res, 200, {});
  return json(res, 404, {});
}

module.exports = { routeChat, respondChat, addMessage, CHAT_URL, CHAT_ID, PREFIX };
