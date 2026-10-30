// Special tab web pages (WebView, opened from the Details button of the Special Catalog banner). Pure HTML, no
// player or master access: server.js passes the index and the context (specialCtx).
'use strict';
const special = require('./special');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDay = (d) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(d || ''); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; };

// same pattern as the Shop catalogue (server/gacha.js): the element carries data-pin (POST URL) and data-on
const PIN_JS = 'var KHUX_PIN={1:["Pinned!","Leave and re-enter Special to see it.","pinmsg"],0:["Removed.","Leave and re-enter Special.","pinmsg off"]};'
  + 'function khuxSet(el,id,pinned){el.setAttribute("data-pin",pinned?"/web/special/unpin":"/web/special/pin/"+id);el.setAttribute("data-on",pinned?"0":"1");el.textContent=pinned?"Remove from Special":"📌 Keep in Special";}'
  + 'function khuxSay(box,cls,head,sub){box.className=cls;box.innerHTML="";var b=document.createElement("div"),s=document.createElement("small");b.textContent=head;s.textContent=sub;box.appendChild(b);box.appendChild(s);box.style.display="block";if(box.scrollIntoView)box.scrollIntoView(false);}'
  + 'function khuxPin(el,box,onOk){var on=el.getAttribute("data-on")==="1",m=KHUX_PIN[on?1:0],x=new XMLHttpRequest();x.open("POST",el.getAttribute("data-pin"));'
  + 'x.onload=function(){if(x.status===200){khuxSay(box,m[2],m[0],m[1]);if(onOk)onOk(on);}else khuxSay(box,"pinmsg err","Could not change Special","This quest cannot be kept.");};'
  + 'x.onerror=function(){khuxSay(box,"pinmsg err","Could not reach the server","Try again.");};x.send("");return false;}'
  + 'function khuxClick(el){return khuxPin(el,document.getElementById("pinmsg"),function(on){var id=el.getAttribute("data-id");'
  + 'var all=document.querySelectorAll("[data-id]"),i;for(i=0;i<all.length;i++){if(all[i].getAttribute("data-on")==="0")khuxSet(all[i],all[i].getAttribute("data-id"),false);}'
  + 'if(on)khuxSet(el,id,true);});}';

const CSS = 'body{margin:0;background:#043654;color:#fff;font:17px/1.6 sans-serif;letter-spacing:.4px;padding:6px 18px 40px}'
  + 'h1{font-size:22px;margin:8px 0 4px}h2{color:#00d4ed;font-size:18px;margin:22px 0 2px}h2:before{content:"■  "}'
  + 'h2 .now{background:#2e9e3e;color:#fff;border-radius:12px;padding:0 10px;font-size:13px;margin-left:8px;letter-spacing:0}'
  + '.n{color:#b9cfdc;font-size:14px}p{margin:4px 0 8px}img{width:100%;max-width:640px;height:auto;display:block;margin:0;border-radius:4px}'
  + '.q{padding:10px 0;border-bottom:1px solid #2f5d78}.q.pinned{border-left:5px solid #b8860b;padding-left:10px}.q.dim img{opacity:.55;filter:grayscale(.6)}'
  + '.nm{font-weight:bold;margin-top:4px}.d{color:#b9cfdc;font-size:14px}.vip{color:#ffcd4a;font-weight:bold}'
  + '.st{font-size:14px;margin:3px 0}.st.later,.st.none{color:#9fb7c6}.rp{color:#ffcd4a;font-size:13px}'
  + '.pk{margin-top:5px;border:2px solid #ffe08a;border-radius:10px;color:#fff;font:bold 14px sans-serif;padding:4px 14px;background:linear-gradient(#e0a020,#a8700a);cursor:pointer;text-decoration:none;display:inline-block}'
  + '.pk[data-on="0"]{border-color:#ffb0b0;background:linear-gradient(#ff5a5a,#d81e2e 55%,#9c1020)}'
  + '.pinmsg{display:none;position:sticky;bottom:6px;background:#2e9e3e;border-radius:8px;padding:6px 10px;font-size:16px;margin-top:10px}.pinmsg small{display:block;font-size:13px}'
  + '.pinmsg.off{background:#1a6fa8}.pinmsg.err{background:#b02020}';

function catalogPage(index, ctx = {}) {
  const periods = ctx.periods || special.PERIODS, cur = ctx.period, pinnedKey = ctx.pinnedKey || '';
  const entries = index.entries.filter((en) => en.periods && en.key !== 'catalog' && !en.training);
  const byKey = new Map(index.entries.map((en) => [en.key, en]));
  const pinned = byKey.get(pinnedKey);
  const row = (en) => {
    const id = en.evStageId, isPinned = en.key === pinnedKey, can = special.pinnable(en, cur);
    const btn = (on, label) => `<a href="#" class="pk" data-id="${id}" data-on="${on}" data-pin="${on === 1 ? `/web/special/pin/${id}` : '/web/special/unpin'}" onclick="return khuxClick(this)">${label}</a>`;
    let st = '', button = '';
    if (Math.min(...en.periods) > cur) st = '<div class="st later">Reached later in the Story</div>';
    else if (en.removed) st = '<div class="st none">Not restored: its materials have no use in this version</div>';
    else if (en.replacedBy) st = `<div class="st none">Replaced by ${esc(byKey.get(en.replacedBy)?.name || en.replacedBy)}</div>`;
    else if (isPinned) { st = '<div class="st">📌 Kept in Special</div>'; button = btn(0, 'Remove from Special'); }
    else if (can.ok) {
      st = '<div class="st">Past quest: can be kept in Special</div>';
      if (pinned) st += `<div class="rp">Replaces: ${esc(pinned.name)}</div>`;
      button = btn(1, '📌 Keep in Special');
    } else st = '<div class="st">Open in Special now</div>';
    const days = en.days === 'all' ? 'Every day' : (en.days || []).join(', ');
    return `<div class="q${isPinned ? ' pinned' : ''}${Math.min(...en.periods) > cur ? ' dim' : ''}" id="q${id}"><img src="/web/special/img/${id}.png" alt="">`
      + `<div class="nm">${esc(en.name)}</div><div class="d">${esc(days)}${en.vip ? ' · <span class="vip">VIP only</span>' : ''}</div>${st}${button}</div>
`;
  };
  const sections = periods.map((p) => {
    const rows = entries.filter((en) => Math.min(...en.periods) === p.n).map(row).join('');
    return `<h2 class="per" id="p${p.n}">${esc(p.name)}${p.n === cur ? '<span class="now">Now</span>' : ''}</h2>`
      + `<div class="n">${niceDay(p.from)} – ${niceDay(p.to)}</div>${rows || '<p class="n">No quests.</p>'}`;
  }).join('');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>Special Catalog</title><style>${CSS}</style></head><body><h1>Special Catalog</h1>`
    + '<p class="n">Quests from past periods can be kept in Special. Only one can be kept at a time.</p>'
    + `${sections}<div id="pinmsg" class="pinmsg"></div><script>${PIN_JS}</script></body></html>`;
}

module.exports = { catalogPage };
