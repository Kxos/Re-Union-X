// Chat del party di un solo giocatore (routes-chat.js, I-210): node server/test-chat.js
'use strict';
const chat = require('./routes-chat');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

let saved = 0;
const player = { party: { name: 'Rx' } };
const deps = { player, savePlayer: () => { saved++; }, serverTime: () => '2021-05-15 12:00:00', publicUrl: 'https://127.0.0.1', stampIds: () => [1, 2] };
const call = (method, url, body) => {
  let code = 0, out = null;
  chat.respondChat(deps, { writeHead(c) { code = c; }, end(b) { out = b && b.length ? JSON.parse(b.toString('utf8')) : null; } },
    chat.routeChat(url.split('?')[0].toLowerCase()), method, url, body);
  return { code, out };
};

// rotte: il servizio sta sotto un prefisso (/user e' gia' l'azione 1 della API principale)
check(chat.routeChat('/chatsvc/user') === 'chatsvc' && chat.routeChat('/chatsvc/chat/message/1') === 'chatsvc', 'rotta del servizio');
check(chat.routeChat('/user/chat') === 'userchat' && chat.routeChat('/payment/info') === 'paymentinfo', 'rotte 6 e 24');
check(chat.routeChat('/user') === null, '/user rubata alla API principale');
check(chat.CHAT_URL(deps) === 'https://127.0.0.1/chatsvc', `url ${chat.CHAT_URL(deps)}`);

// 6 GET /user/chat: userId 1 (il client confronta nickName dei messaggi con user.userId), url del servizio, stampIds
const uc = call('GET', '/user/chat?m=1').out;
check(uc?.userData?.userChat?.userId === 1 && uc.userData.userChat.userEndpointUrl === 'https://127.0.0.1/chatsvc'
  && JSON.stringify(uc.userData.userChat.stampIds) === '[1,2]' && uc.authToken && uc.userToken && uc.ret, `user/chat ${JSON.stringify(uc)}`);
// 24 /payment/info: sotto i 13 anni il client nasconde il testo (solo adesivi)
check(call('GET', '/payment/info?m=1').out?.paymentInfo?.cesaLimitAge >= 13, 'cesaLimitAge < 13');

// vuota: niente messaggi, voce della chat 1 con 0 non letti
let r = call('GET', '/chatsvc/user?getChatEntry=1&getBlockEntry=1').out;
check(JSON.stringify(r) === '{"chatEntry":[{"chatId":1,"chatReadMessageNumber":0,"chatUnreadCount":0}],"blockEntry":[]}', `user ${JSON.stringify(r)}`);
r = call('GET', '/chatsvc/chat/message/1?count=1000&startIndex=0').out;
check(JSON.stringify(r) === '{"entry":[],"startIndex":0,"itemPerPage":1000,"totalResults":0}', `vuota ${JSON.stringify(r)}`);

// invio: testo e adesivo, numeri crescenti, nickName = userId in decimale, salvati
check(call('POST', '/chatsvc/chat/message/1/0', { messageData: 'Hello', userIpAddress: '127.0.0.1' }).code === 200, 'POST testo');
call('POST', '/chatsvc/chat/message/1/0', { messageData: 'ISTAMP:TALKS:2' });
r = call('GET', '/chatsvc/chat/message/1?count=1000&startIndex=0').out;
const m = r.entry;
check(r.totalResults === 2 && m[0].messageNumber === 1 && m[1].messageNumber === 2 && m[1].messageData === 'ISTAMP:TALKS:2', `messaggi ${JSON.stringify(r)}`);
check(m[0].nickName === '1' && m[0].tagName === '1' && m[0].userEndPointUrl === 'https://127.0.0.1/chatsvc' && m[0].messageStatus === 0
  && m[0].createAt === '2021-05-15 12:00:00' && m[0].userImageUrl === '', `campi ${JSON.stringify(m[0])}`);
check(saved >= 2 && player.chat.messages.length === 2, 'non salvati');
// startMessageNumber: dal numero dato in poi
r = call('GET', '/chatsvc/chat/message/1?count=1000&startMessageNumber=2').out;
check(r.entry.length === 1 && r.entry[0].messageNumber === 2, `startMessageNumber ${JSON.stringify(r)}`);
// lettura: PUT del numero letto, i non letti scendono
check(call('PUT', '/chatsvc/user/chat/1', { chatReadMessageNumber: 1 }).code === 200, 'PUT letto');
r = call('GET', '/chatsvc/user?getChatEntry=1&getBlockEntry=1').out;
check(r.chatEntry[0].chatReadMessageNumber === 1 && r.chatEntry[0].chatUnreadCount === 1, `non letti ${JSON.stringify(r)}`);
// cancellazione e segnalazione/blocco (nessun altro utente): 2xx
check(call('DELETE', '/chatsvc/chat/message/1/1').code === 200 && player.chat.messages.length === 1, 'DELETE');
check(call('POST', '/chatsvc/chat/message/report', { chatId: 1, messageNumber: 2, type: 1, comment: '' }).code === 200, 'report');
check(call('POST', '/chatsvc/user/block', {}).code === 200, 'block');
// dopo una cancellazione il numero non si riusa
call('POST', '/chatsvc/chat/message/1/0', { messageData: 'again' });
check(player.chat.messages.at(-1).messageNumber === 3, 'numero riusato');
// testo oltre 40 caratteri (misc 809) o non stringa: tagliato / rifiutato
check(call('POST', '/chatsvc/chat/message/1/0', { messageData: 'x'.repeat(200) }).code === 200 && player.chat.messages.at(-1).messageData.length === 40, 'taglio a 40');
check(call('POST', '/chatsvc/chat/message/1/0', { messageData: 5 }).code === 400, 'messageData non stringa accettato');
// tetto: al massimo 1000 messaggi (il client ne chiede 1000)
for (let i = 0; i < 1005; i++) chat.addMessage(deps, 'm' + i);
check(player.chat.messages.length === 1000, `tetto ${player.chat.messages.length}`);
// senza party: chat vuota e nessuna scrittura
const lone = { ...deps, player: {} };
let out = null;
chat.respondChat(lone, { writeHead() {}, end(b) { out = JSON.parse(b.toString('utf8')); } }, 'chatsvc', 'GET', '/chatsvc/chat/message/1?startIndex=0');
check(out && out.totalResults === 0 && !lone.player.chat, 'chat senza party');

// rotte del server vero: nessuna rotta precedente le intercetta
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-chat-${process.pid}.json`);
fs.copyFileSync(path.join(__dirname, 'save', 'maxpower.json'), SAVE);
process.env.KHUX_SAVE = SAVE;
const log = console.log; console.log = () => {};
let t; try { t = require('./server')._test; } finally { console.log = log; }
for (const [u, k] of [['/user/chat?m=1&i=1&v=x', 'userchat'], ['/payment/info?m=1', 'paymentinfo'], ['/chatsvc/chat/message/1/0', 'chatsvc'],
  ['/chatsvc/user?getChatEntry=1', 'chatsvc'], ['/user', 'user']]) check(t.route(u) === k, `server: ${u} -> ${t.route(u)}`);
fs.rmSync(SAVE, { force: true });

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: chat');
