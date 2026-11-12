// Other > Legal Information (I-109): popup Legal.json
// con due pulsanti che aprono la WebView su un link di /system/login:
// - UserAgreementButton: titolo testo 104040001, URL = link "agreement" (LOGIN_LINKS[5]);
// - LicenseButton: titolo testo 104040003, URL = link "license".
// Con i link vuoti la WebView restava bianca (banco 14-10). Pagine nostre, stile di /web/notices:
// condizioni del server di restauro e licenze dei componenti di terze parti citati dal client.

const STYLE = '<style>body{margin:0;background:#174a5c;color:#e8f2f6;font:18px sans-serif;padding:6px 14px 40px}'
  + 'h1{color:#fff;font-size:22px;margin:12px 0 4px}h2{color:#5fe0f0;font-size:19px;margin:18px 0 6px}'
  + 'p,li{line-height:1.45}ul{padding-left:22px}.n{color:#8fb3c0;font-size:15px}'
  + '.c{border-bottom:2px dotted #8fb3c0;padding:8px 0}</style>';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const page = (body) => '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">' + STYLE + '</head><body>' + body + '</body></html>';

function agreementPage() {
  const sections = [
    ['About this server', [
      'This is a private, non-commercial restoration server for KINGDOM HEARTS Union χ[Cross], made so that the game can still be played after the end of the official service.',
      'It is not operated, endorsed or supported by SQUARE ENIX or Disney. KINGDOM HEARTS and all characters, images, music and texts of the game belong to their respective owners.']],
    ['Your data', [
      'Your progress is saved only on the computer that runs this server. Nothing is sent to SQUARE ENIX or to any other service.',
      'Backing up the save file is your responsibility: deleting it erases your progress.']],
    ['Purchases', [
      'There are no real-money purchases. Jewels, Medals and items come only from quests, missions, presents and events of this server.']],
    ['No warranty', [
      'The server is provided as it is, without any warranty. Some features of the original game may be missing or behave differently.']],
  ];
  return page('<h1>User Agreement</h1><p class="n">KINGDOM HEARTS Union χ[Cross] restoration server</p>'
    + sections.map(([h, ps]) => `<h2>&#9632; ${esc(h)}</h2>` + ps.map((p) => `<p>${esc(p)}</p>`).join('')).join(''));
}

// componenti open source le cui stringhe stanno in libcocos2dcpp.so 4.3.1 (licenze dei progetti)
const COMPONENTS = [
  ['cocos2d-x', 'MIT License'],
  ['LWF (Lightweight SWF)', 'zlib License'],
  ['libcurl', 'curl License (MIT/X derivative)'],
  ['OpenSSL', 'OpenSSL / SSLeay License'],
  ['zlib', 'zlib License'],
  ['libpng', 'libpng License'],
  ['libogg / libvorbis', 'BSD 3-Clause License'],
  ['Photon (Exit Games)', 'Photon SDK License'],
  ['RapidJSON', 'MIT License'],
  ['TinyXML-2', 'zlib License'],
  ['FreeType', 'FreeType License (FTL)'],
  ['Chipmunk2D', 'MIT License'],
];

function licensePage() {
  return page('<h1>License</h1><p class="n">Open source software used by the game client</p>'
    + COMPONENTS.map(([n, l]) => `<div class="c"><b>${esc(n)}</b><br><span class="n">${esc(l)}</span></div>`).join('')
    + '<h2>&#9632; Restoration server</h2><p>The restoration server and its tools are original code written for this project.</p>');
}

// Other > Help (I-110) and Other > Credits (I-112): login links "help" and "staff" (LOGIN_LINKS[3], [4]), same style.
// Safety rules (user 05-11, I-110 row): the game name only to describe it, with the non-affiliation line; no logos, art
// or copied texts; nothing on where to get the client or game files, on the DNS redirect or on the protector; no request
// for logs or personal data; NO links and no names of the project's channels (Discord, site, GitHub, e-mail).
// TODO (user 05-11): a «Common problems» section, written also for players on phones.
const NOT_AFFILIATED = 'Re-Union X is a fan restoration of KINGDOM HEARTS Union χ[Cross]. It is not affiliated with, endorsed or supported by SQUARE ENIX or Disney.';
const section = ([h, ps]) => `<h2>&#9632; ${esc(h)}</h2>` + ps.map((p) => (Array.isArray(p)
  ? `<p><b>${esc(p[0])}</b><br>${esc(p[1])}</p>` : `<p>${esc(p)}</p>`)).join('');

function helpPage() {
  const sections = [
    ['What is Re-Union X', [
      NOT_AFFILIATED,
      'It brings back the single-player game after the end of the official service: the original game talks to a small restoration server that runs on your own device, and your progress stays there.']],
    ['Frequently asked questions', [
      ['Why does the game download data?', 'The first start downloads the game resources (a few GB). After an update of the server only the game data is downloaded again (some MB): tap Download when the popup asks.'],
      ['Why do events come back on their own dates?', 'Events, raids and campaigns return on a reconstructed calendar. The Notices explain how it works.'],
      ['Can I play with other players?', 'No: the restoration is single player. Parties, Union Cross, Coliseum and PvP are not available yet; the Notices say what changes in their place.'],
      ['Where are the raid bosses?', 'In the Events tab: the Raid Catalog lists the raids you can keep and play again.'],
      ['Can I buy Jewels?', 'No. There are no real-money purchases: Jewels, Medals and items come from quests, missions, presents and events.']]],
    ['Your save', [
      ['Where is it?', 'On PC it is the file player.json in the folder %LOCALAPPDATA%\\Re-Union X\\save.'],
      ['Backup', 'Close the game first, then copy player.json somewhere safe. To restore it, close the game and copy it back.'],
      ['Start over', 'Close the game and delete player.json: the next start creates a new player. This cannot be undone.'],
      ['Updates', 'A new version of the game keeps your save.']]],
    ['Differences from the original', [
      'Every feature that works differently from the original game is explained in the in-game Notices.']],
  ];
  return page('<h1>Help</h1><p class="n">Re-Union X</p>' + sections.map(section).join(''));
}

// Credits in the game's own style (user 12-11): the blue of the game's pages, cyan section titles with the square, gold
// key words, cards with the side bar of the catalogues, pills like the game's tags; the testers in the purple of their
// Discord role. Same people as the site's Credits section, with no links (rules above).
const TESTERS = ['aryna', 'Drybomber', 'LuxHollow', 'Luxe', 'Maria', 'Richard(GUSTU)']; // Trusted role, 12-11 (thethiny is above)
const CREDITS_CSS = '<style>body{margin:0;background:#043654;color:#fff;font:17px/1.6 sans-serif;letter-spacing:.3px;padding:8px 14px 40px}'
  + 'h1{font-size:24px;margin:8px 0 0;text-align:center;letter-spacing:1px}.sub{text-align:center;color:#b9cfdc;font-size:14px;margin:0 0 10px}'
  + 'h2{color:#00d4ed;font-size:18px;margin:20px 0 6px}h2:before{content:"\\25A0  "}b.g{color:#ffcd4a}'
  + '.intro{text-align:center;margin:6px auto 12px;max-width:640px;padding:10px 14px;border-top:1px solid #2f5d78;border-bottom:1px solid #2f5d78}'
  + '.intro .st{display:block;color:#ffcd4a;font-size:20px;line-height:1}'
  + '.ded{position:relative;margin:8px 0 6px;padding:14px 16px 12px;border:2px solid #ffe08a;border-radius:14px;'
  + 'background:linear-gradient(#0b4f8f,#06283e);box-shadow:0 0 0 2px #043654,0 0 0 4px #b8860b}'
  + '.ded .nm{font-size:26px;font-weight:bold;font-style:italic;margin:2px 0 4px;text-shadow:0 2px 0 #022238}'
  + '.pill{display:inline-block;border-radius:12px;padding:0 12px;font-size:12px;font-weight:bold;letter-spacing:1.5px;line-height:1.8;color:#fff}'
  + '.p-gold{background:linear-gradient(#ffcf6b,#e0a43a);color:#3a2400}.p-blue{background:linear-gradient(#45a6e2,#2a7fbf)}'
  + '.p-purple{background:linear-gradient(#b57bd0,#9b59b6 55%,#7a3f94)}.p-pink{background:linear-gradient(#ff8fa8,#e0506f)}'
  + '.row{padding:10px 0 10px 12px;border-left:5px solid #1a6fa8;border-bottom:1px solid #2f5d78}.row p{margin:4px 0 0}'
  + '.row.t{border-left-color:#9b59b6}.names{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}'
  + '.names span{border:1px solid #c79be0;background:#3b2152;color:#f1e2fb;border-radius:14px;padding:1px 12px;font-weight:bold;font-size:15px}'
  + '.heart{margin:18px 0 6px;padding:14px 16px;text-align:center;border:2px solid #ff8fa8;border-radius:14px;background:linear-gradient(#0d4a70,#06283e)}'
  + '.heart .h{color:#ff6f8f;font-size:30px;line-height:1}.heart .ttl{font-size:21px;font-weight:bold;font-style:italic;margin:4px 0}'
  + '.heart .sign{color:#ffcf6b;font-style:italic;font-weight:bold;margin-top:8px}'
  + '.n{color:#b9cfdc;font-size:14px}</style>';

function creditsPage() {
  const k = (s) => esc(s).replace(/\*([^*]+)\*/g, '<b class="g">$1</b>'); // *words* in gold
  const row = (tag, text, cls = '', extra = '') => `<div class="row ${cls}"><span class="pill ${cls === 't' ? 'p-purple' : 'p-blue'}">${esc(tag)}</span>`
    + `<p>${k(text)}</p>${extra}</div>`;
  const body = '<h1>Credits</h1><p class="sub">Re-Union X</p>'
    + `<div class="intro"><span class="st">&#10022;</span>${k('This restoration stands on the work of people who *preserved* and *documented* the game long before us.')}</div>`
    + `<div class="ded"><span class="pill p-gold">SPECIAL THANKS</span><div class="nm">thethiny</div><p>${k('Without thethiny this project would most likely never have got off the ground. His tools *opened the game\'s data*, his server showed that *bringing it back was possible*, and his public work gave us the map we have followed since the very first day. *We are deeply, truly grateful.*')}</p></div>`
    + `<h2>Re-Union X Project</h2><p>${k('The restoration server, its tools and these pages were made by the *Re-Union X Project* team.')}</p>`
    + '<h2>With the help of</h2>'
    + row('Roboloid & Ultimadei', 'The KHUχ database: *Medal data, multipliers and special attack conditions*.')
    + row('KHUX Wiki & KH Wiki', '*Quests, Medals, special attacks and events* used as references.')
    + row('ReLux Team', 'Research on the game\'s *events, raids, Union Cross and campaigns*, the archive of the official notices and player-made calculators. Lead developer *LuxHollow*: a steady support to this project.')
    + row('SmellyOctopus', 'Thank you for teaching so many of us to *play free-to-play wisely*, and for keeping us company back then with *videos full of joy*. Those videos are now *a huge help* as references for the restoration.')
    + row('Testers', 'They play the restoration first and *report what breaks*, so that everyone else finds it working.', 't',
      `<div class="names">${TESTERS.map((n) => `<span>${esc(n)}</span>`).join('')}</div>`)
    + `<div class="heart"><div class="h">&#9829;</div><span class="pill p-pink">FROM THE HEART</span><div class="ttl">To our community</div><p>${k('Thank you to *every player who never let this game go*: to everyone who kept videos, screenshots and guides, shared what they remembered or simply asked “is it coming back?”. You are the reason this restoration keeps going, and *this game lives on because of you*.')}</p><div class="sign">May your heart be your guiding key.</div></div>`
    + '<h2>The original game</h2>'
    + `<p>${esc('KINGDOM HEARTS Union χ[Cross] was developed and published by SQUARE ENIX. KINGDOM HEARTS and all its characters, images, music and texts belong to SQUARE ENIX and Disney.')}</p><p class="n">${esc(NOT_AFFILIATED)}</p>`;
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + CREDITS_CSS + '</head><body>' + body + '</body></html>';
}

module.exports = { agreementPage, licensePage, helpPage, creditsPage, NOT_AFFILIATED, TESTERS };
