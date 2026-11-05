// Other > Help (I-110) and Other > Credits (I-112): the pages exist and follow the safety rules of the I-110 row
// (no links, no project channels, no request for logs, non-affiliation line), and login serves their links.
//   node server/test-help-pages.js
'use strict';
const lp = require('./legal-pages');

const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

for (const [name, html] of [['help', lp.helpPage()], ['credits', lp.creditsPage()]]) {
  const text = html.toLowerCase();
  check(html.startsWith('<!doctype html>'), `${name}: not a full page`);
  check(html.includes('not affiliated with, endorsed or supported by SQUARE ENIX or Disney'), `${name}: no non-affiliation line`);
  check(!/<a\b|href=|https?:|www\./.test(text), `${name}: has a link or URL`);
  check(!/discord|github|reddit|youtube|twitter|@[a-z]|e-mail|email/.test(text), `${name}: names a project channel or an e-mail`);
  check(!/\blogs?\b|play\.log|server\.log|report a bug|bug report/.test(text), `${name}: asks for logs or bug reports`);
  check(!/apk|obb|\bdns\b|protector|liapp|download (the )?(game|client)/.test(text), `${name}: talks about getting the client or the redirect`);
  check(!/<img|<script|url\(/.test(text), `${name}: has images, scripts or external styles`);
}
check(lp.helpPage().includes('player.json'), 'help: no save section');
check(lp.helpPage().includes('%LOCALAPPDATA%\\Re-Union X\\save'), 'help: save folder path lost its backslashes (bench 05-11)');
check(lp.creditsPage().includes('Re-Union X Project'), 'credits: no project team');

// the login links help and staff point to the pages
const src = require('fs').readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');
check(/body\.help = `[^`]*\/web\/help`/.test(src) && /body\.staff = `[^`]*\/web\/credits`/.test(src), 'login links help/staff not served');
check(src.includes("p === '/web/help'") && src.includes("p === '/web/credits'"), 'routes /web/help, /web/credits missing');

if (errors.length) { console.log(`ERRORS (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: help-pages');
