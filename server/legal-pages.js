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

module.exports = { agreementPage, licensePage };
