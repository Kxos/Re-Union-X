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

function creditsPage() {
  const sections = [
    ['Re-Union X Project', ['The restoration server, its tools and these pages were made by the Re-Union X Project team.']],
    ['With the help of', [
      ['thethiny', 'Tools and documentation of the game formats, server research and original data, on which most of this work builds.'],
      ['Roboloid and Ultimadei', 'The KHUχ database: Medal data, multipliers and special attack conditions.'],
      ['KHUX Wiki and KH Wiki', 'Quests, Medals, special attacks, events and images used as references.'],
      ['ReLux Team', 'Research on events, raids, Union Cross and campaigns, and player-made calculators.'],
      ['SmellyOctopus', 'Thank you for teaching so many of us to play free-to-play wisely, and for keeping us company back then with videos full of joy. Those videos are now a huge help as references for the restoration.'],
      ['The community', 'Players who shared screenshots, videos, notes and memories of the game, and the testers of the restoration.']]],
    ['The original game', [
      'KINGDOM HEARTS Union χ[Cross] was developed and published by SQUARE ENIX. KINGDOM HEARTS and all its characters, images, music and texts belong to SQUARE ENIX and Disney.',
      NOT_AFFILIATED]],
  ];
  return page('<h1>Credits</h1><p class="n">Re-Union X</p>' + sections.map(section).join(''));
}

module.exports = { agreementPage, licensePage, helpPage, creditsPage, NOT_AFFILIATED };
