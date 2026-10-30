// Special tab web pages (WebView, opened from the Details button of the Special Catalog banner). Pure HTML, no
// player or master access: server.js passes the index and the context (specialCtx).
// The catalogue follows the Shop's Banner Catalog (server/gacha.js): period tabs, a summary line, a Filters sheet
// (FIND / TYPE / SHOW), a coloured side bar and a status pill per row, a details page per quest (banner or name).
// Filtering only toggles a class on the rows (data-* attributes are read once at start).
'use strict';
const special = require('./special');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDay = (d) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(d || ''); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; };

// Icons of the chips, pills and Keep button (user 31-10: no emoji): /web/special/icon/<key>.png from
// server/game_data/special_icons (recon/tools/special_icons.py: original client icons where they exist, the others drawn
// in the game's style). Only these keys are served. A missing file leaves an empty square of fixed size.
const SPECIAL_ICON_KEYS = ['weekday', 'daily', 'vip', 'mog', 'skill', 'camp', 'lock', 'removed', 'pin', 'replaced', 'later', 'now', 'medal', 'avatar', 'jewel', 'material', 'unlocked'];
const icon = (k) => `<img class="ic" src="/web/special/icon/${k}.png" alt="">`;
const KEEP_LABEL = `${icon('pin')}Keep in Special`, REMOVE_LABEL = 'Remove from Special';

// same pattern as the Shop catalogue (server/gacha.js): the element carries data-pin (POST URL) and data-on
const PIN_JS = 'var KHUX_PIN={1:["Pinned!","Leave and re-enter Special to see it.","pinmsg"],0:["Removed.","Leave and re-enter Special.","pinmsg off"]};'
  + `var KHUX_KEEP=${JSON.stringify(KEEP_LABEL)},KHUX_REMOVE=${JSON.stringify(REMOVE_LABEL)};`
  + 'function khuxSet(el,id,pinned){el.setAttribute("data-pin",pinned?"/web/special/unpin":"/web/special/pin/"+id);el.setAttribute("data-on",pinned?"0":"1");el.innerHTML=pinned?KHUX_REMOVE:KHUX_KEEP;}'
  + 'function khuxSay(box,cls,head,sub){box.className=cls;box.innerHTML="";var b=document.createElement("div"),s=document.createElement("small");b.textContent=head;s.textContent=sub;box.appendChild(b);box.appendChild(s);box.style.display="block";if(box.scrollIntoView)box.scrollIntoView(false);}'
  + 'function khuxPin(el,box,onOk){var on=el.getAttribute("data-on")==="1",m=KHUX_PIN[on?1:0],x=new XMLHttpRequest();x.open("POST",el.getAttribute("data-pin"));'
  + 'x.onload=function(){if(x.status===200){khuxSay(box,m[2],m[0],m[1]);if(onOk)onOk(on);}else khuxSay(box,"pinmsg err","Could not change Special","This quest cannot be kept.");};'
  + 'x.onerror=function(){khuxSay(box,"pinmsg err","Could not reach the server","Try again.");};x.send("");return false;}'
  + 'function khuxClick(el){return khuxPin(el,document.getElementById("pinmsg"),function(on){var id=el.getAttribute("data-id");'
  + 'var all=document.querySelectorAll("[data-id]"),i;for(i=0;i<all.length;i++){if(all[i].getAttribute("data-on")==="0")khuxSet(all[i],all[i].getAttribute("data-id"),false);}'
  + 'if(on){for(i=0;i<all.length;i++)if(all[i].getAttribute("data-id")===id&&all[i].className==="pk")khuxSet(all[i],id,true);}if(window.khuxRow)window.khuxRow(id,on);});}';

// colours of the Shop (gacha.js page / CATALOG_CSS): now green, kept gold, can be kept blue, locked and off grey
const PILL_CSS = '.s{display:inline-block;border-radius:12px;padding:0 10px;font-size:13px;line-height:1.7;margin:3px 0 0;background:#1a6fa8;color:#fff}'
  + '.s .ic{width:1.25em;height:1.25em;margin:-.2em .3em 0 -.2em}'
  + '.s-vipnow{background:#2a7a5c}.s-now{background:#2e9e3e;font-weight:bold}.s-pinned{background:#b8860b;font-weight:bold}.s-can{background:#1a6fa8}'
  + '.s-locked{background:#5a6470;color:#e0e6ea}.s-off{background:#4a5560;color:#d0d8de}.s-other{background:transparent;border:1px solid #8aa3b3;color:#b9cfdc}'
  + 'img.ic{display:inline-block;width:1.3em;height:1.3em;max-width:none;vertical-align:middle;margin:-.15em .3em 0 0;border:0;border-radius:0}'
  + '.pk{margin-top:6px;border:2px solid #ffe08a;border-radius:10px;color:#fff;font:bold 14px sans-serif;padding:3px 14px;background:linear-gradient(#e0a020,#a8700a);cursor:pointer;text-decoration:none;display:inline-block}'
  + '.pk[data-on="0"]{border-color:#ffb0b0;background:linear-gradient(#ff5a5a,#d81e2e 55%,#9c1020)}'
  + '.vip{color:#ffcd4a;font-weight:bold}.rp{color:#ffcd4a;font-size:13px}';

const CSS = 'body{margin:0;background:#043654;color:#fff;font:17px/1.6 sans-serif;letter-spacing:.4px;padding:6px 14px 40px}'
  + 'h1{font-size:22px;margin:8px 0 4px}h2{color:#00d4ed;font-size:18px;margin:18px 0 2px}h2:before{content:"\\25A0  "}'
  + '.n{color:#b9cfdc;font-size:14px}p{margin:4px 0 8px}img{height:auto;display:block;margin:0;border-radius:4px}'
  + '.hdr{display:flex;align-items:center;justify-content:space-between;gap:10px}'
  + '.fbtn,.ok{border:0;color:#fff;background:linear-gradient(#f08a3a,#d4541c);border-radius:18px;padding:5px 16px;font:bold 15px sans-serif;box-shadow:0 2px 0 #8a3510;cursor:pointer;white-space:nowrap}'
  + '.dot{display:inline-block;background:#fff;color:#d4541c;border-radius:10px;padding:0 7px;margin-left:6px;font-size:13px;line-height:1.5}.dot:empty{display:none}'
  + '.tabs{display:flex;gap:3px;margin-top:8px}.tab{flex:1 1 0;min-width:0;border:0;font-family:inherit;cursor:pointer;text-align:center;background:#0d4a70;border-radius:7px 7px 0 0;padding:4px 1px 3px;line-height:1.15;color:#b9cfdc;letter-spacing:0}'
  + '.tab b{display:block;font-size:11.5px;color:#fff}.tab .c{display:block;color:#ffa500;font-weight:bold;font-size:12px}'
  + '.tab .now{display:block;background:#2e9e3e;color:#fff;border-radius:8px;font-size:9px;margin:1px 2px 0}'
  + '.tab.on{background:linear-gradient(#25c4d8,#0a8fa3);color:#e9fbff}.tabline{height:3px;background:#0a8fa3;margin-bottom:8px}'
  + '.sum{background:#06283e;border-radius:6px;padding:6px 10px;margin:0 0 6px;font-size:15px;line-height:1.7}.sum .n1{color:#ffa500;font-weight:bold}'
  + '.tag{display:inline-block;background:#0d5f86;border:1px solid #39a7cf;border-radius:14px;padding:0 4px 0 10px;margin:3px 4px 0 0;font-size:14px;line-height:1.6}'
  + '.tag a{display:inline-block;background:#043654;border-radius:10px;width:20px;text-align:center;margin-left:5px;color:#fff;text-decoration:none}.clear{font-size:14px;margin-left:3px}'
  + '.hide{display:none!important}' // !important: .row (display:flex) comes later in the sheet and won (bench rev 221)
  // every card / campaign row: the same 5px side bar (colour by status, like the Shop's .b.now / .b.pinned) and the same
  // padding; banner at half size (640x140 -> 320x70), the text wraps under it on a narrow phone
  + '.row{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:10px 0 10px 10px;border-left:5px solid #5d8aa6;border-bottom:1px solid #2f5d78;cursor:pointer;position:relative;padding-right:28px}'
  + '.row.vipnow{border-left-color:#2a7a5c}.row.now{border-left-color:#2e9e3e}.row.pinned{border-left-color:#b8860b}.row.can{border-left-color:#1a6fa8}.row.locked{border-left-color:#7d8894}.row.off{border-left-color:#6a7580}'
  + '.row.off .im img,.row.off .th img{opacity:.5;filter:grayscale(.7)}.row.locked .im img{opacity:.6;filter:grayscale(.6)}'
  + '.row .nm{display:block;margin-bottom:2px}.row .s{font-size:14px}'
  + '.yrs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}.yc{border:1px solid #5d8aa6;border-radius:16px;padding:3px 12px;font:14px sans-serif;color:#d9e6ee;background:#083048;cursor:pointer}'
  + '.yc.on{background:#00a6bb;border-color:#7beaf7;color:#fff;font-weight:bold}.yc .yn{color:#ffa500;font-size:12px}.yc.on .yn{color:#fff}'
  + '.ml{color:#00d4ed;font-size:13px;letter-spacing:1px;padding:10px 0 2px;border-bottom:1px solid #2f5d78;text-transform:uppercase}'
  + '.go{position:absolute;right:4px;top:50%;margin-top:-18px;font-size:30px;line-height:36px;color:#9fd4ff;text-decoration:none;width:22px;text-align:center}'
  + '.card,.cr{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:10px 0 10px 10px;border-left:5px solid #5d8aa6;border-bottom:1px solid #2f5d78}'
  + '.card.vipnow,.cr.vipnow{border-left-color:#2a7a5c}.card.now,.cr.now{border-left-color:#2e9e3e}.card.pinned,.cr.pinned{border-left-color:#b8860b}.card.can,.cr.can{border-left-color:#1a6fa8}'
  + '.card.locked,.cr.locked{border-left-color:#7d8894}.card.off,.cr.off{border-left-color:#6a7580}.card.off .im img,.cr.off .th img{opacity:.5;filter:grayscale(.7)}.card.locked .im img{opacity:.6;filter:grayscale(.6)}'
  // the period timeline of a card: one column per period (the current one marked), a version under its periods
  + '.tl{flex:1 1 100%;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;margin-top:4px}'
  + '.tp{font-size:10.5px;line-height:1.3;text-align:center;color:#9fb7c6;background:#06283e;border-radius:4px;padding:2px 1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tp.cur{background:#2e9e3e;color:#fff;font-weight:bold}'
  + '.vr.one{min-width:max-content}.vr{display:flex;flex-wrap:wrap;gap:3px;align-items:center;background:rgba(255,255,255,.06);border-radius:6px;padding:3px}.vr.hl{background:rgba(0,212,237,.22);box-shadow:inset 0 0 0 1px #00d4ed}.vr.dim{opacity:.45}'
  + '.vc{display:inline-block;border:1px solid transparent;border-radius:10px;padding:0 8px;font-size:12.5px;line-height:1.7;color:#fff;text-decoration:none;white-space:nowrap;font-weight:bold}.vc .ic{width:1.1em;height:1.1em;margin:-.2em .2em 0 -.15em}'
  // VIP campaigns: compact rows with a small banner, by year and month (details / summary)
  + '.camps h3{color:#ffcd4a;font-size:16px;margin:12px 0 2px}.cm summary{cursor:pointer;color:#00d4ed;font-size:15px;padding:4px 0;border-bottom:1px solid #2f5d78}'
  + '.cr{padding:6px 0 6px 8px;gap:2px 10px}.th{flex:0 0 160px}.th img{width:160px;height:35px}.cr .info{flex:1 1 150px}.cr .nm{font-size:15px}.cr .d{font-size:12.5px}'
  + '.q{display:flex}'
  + '.q.vipnow{border-left-color:#2a7a5c}.q.now{border-left-color:#2e9e3e}.q.pinned{border-left-color:#b8860b}.q.can{border-left-color:#1a6fa8}.q.locked{border-left-color:#7d8894}.q.off{border-left-color:#6a7580}.q.other{border-left-color:#5d8aa6}'
  + '.q.off .im img{opacity:.5;filter:grayscale(.7)}.q.locked .im img{opacity:.6;filter:grayscale(.6)}'
  + '.im{flex:0 0 auto;width:320px;max-width:100%}.im img{width:100%}.info{flex:1 1 170px;min-width:0;line-height:1.4}'
  + '.nm{font-weight:bold;color:#fff;text-decoration:none}.d{color:#b9cfdc;font-size:14px}'
  + PILL_CSS
  + '.mt{color:#9fe0ff;font-size:12.5px;margin-top:4px;display:none}.none{background:#06283e;border-radius:6px;padding:14px 10px;margin:8px 0;text-align:center;color:#ffcd4a;font-size:16px}'
  // group rows: a strip of day / variant chips, each in the colour of its own status
  + '.chs{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.ch{display:inline-block;border:1px solid transparent;border-radius:10px;padding:0 7px;font-size:12.5px;line-height:1.7;color:#fff;text-decoration:none;white-space:nowrap}'
  + '.ch .ic{width:1.1em;height:1.1em;margin:-.2em .2em 0 -.15em}.c-now{background:#2e9e3e;font-weight:bold}.c-vipnow{background:#2a7a5c}.c-pinned{background:#b8860b;font-weight:bold}.c-can{background:#1a6fa8}'
  + '.c-locked{background:#5a6470;color:#e0e6ea}.c-off{background:#3d4750;color:#b0bac2}.c-other{background:transparent;border-color:#8aa3b3;color:#b9cfdc}'
  + '.pinmsg{display:none;position:sticky;bottom:6px;background:#2e9e3e;border-radius:8px;padding:6px 10px;font-size:16px;margin-top:10px}.pinmsg small{display:block;font-size:13px}'
  + '.pinmsg.off{background:#1a6fa8}.pinmsg.err{background:#b02020}'
  + '.ov{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(1,12,20,.68);z-index:5}'
  + '.sheet{display:none;position:fixed;left:10px;right:10px;top:52px;max-width:560px;margin:0 auto;max-height:calc(100% - 64px);overflow:auto;box-sizing:border-box;'
  + 'background:#0b3d5c;border:2px solid #39a7cf;border-radius:10px;padding:10px 14px;box-shadow:0 6px 18px rgba(0,0,0,.6);z-index:6;line-height:1.5}'
  + 'body.fo .ov,body.fo .sheet{display:block}.shd{display:flex;justify-content:space-between;align-items:center}.shd b{font-size:18px}'
  + '.x{background:#043654;border:1px solid #39a7cf;border-radius:50%;width:30px;height:30px;color:#fff;font-size:15px;cursor:pointer;padding:0}'
  + '.sheet h4{margin:10px 0 4px;color:#00d4ed;font-size:13px;letter-spacing:1px}'
  + '.search{display:flex;align-items:center;background:#fff;border-radius:18px;padding:2px 12px;color:#7a8a96}'
  + '.search input{flex:1;min-width:0;border:0;outline:0;font:16px sans-serif;color:#222;background:transparent;padding:4px 6px}'
  + '.hint{color:#9fb7c6;font-size:13px;margin:3px 0 0 4px}.opts{display:flex;flex-wrap:wrap;gap:6px}'
  + '.o{border:1px solid #5d8aa6;border-radius:16px;padding:3px 12px;font:14px sans-serif;color:#d9e6ee;background:#083048;cursor:pointer}'
  + '.o .ic{pointer-events:none}'
  + '.o.on{background:#00a6bb;border-color:#7beaf7;color:#fff;font-weight:bold}'
  // SHOW chips: when chosen, the colour of the row pill of that status
  + '.o.st-unl.on{background:#1a6fa8;border-color:#62a7ff}.o.st-now.on{background:#2e9e3e;border-color:#7be08a}.o.st-kept.on{background:#b8860b;border-color:#ffe08a}.o.st-can.on{background:#1a6fa8;border-color:#62a7ff}'
  + '.o.st-replaced.on,.o.st-removed.on,.o.st-later.on{background:#5a6470;border-color:#9aa4ae}'
  + '.foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px}.ok{padding:6px 20px}.reset{color:#b9cfdc;font-size:14px}';

// TYPE chips, derived from the index entry (an entry can have several types, e.g. the VIP Skill EXP is "vip skill"):
// campaign -> camp; vip flag or SQ22 -> vip; SQ12 -> daily (Daily Challenge: Cid); SQ09 / SQ07 -> mog (Moogle O' Glory,
// Keyblade Materials); SQ11 -> skill (Skill EXP); anything else (EXP/Evolve/Munny/Mythril/Adamantite... by weekday)
// -> weekday. A VIP-only quest of another family counts as vip only.
// [value, label, icon key]
const TYPE_OPTS = [['all', 'All'], ['weekday', 'Weekday', 'weekday'], ['daily', 'Daily Cid', 'daily'], ['vip', 'VIP', 'vip'], ['mog', 'MOG / Keyblade', 'mog'],
  ['skill', 'Skill', 'skill'], ['camp', 'Campaigns', 'camp']];
// SHOW chips, from the status logic of the row: can (past quest, can be kept), now (listed in Special this Shop week,
// VIP ones locked without VIP too), kept, replaced, removed (not restored), later (period not reached in the Story yet);
// `other` (current period, not this week) has no chip: All only
const SHOW_OPTS = [['all', 'All quests'], ['now', 'In Special now', 'now'], ['unl', 'Unlocked, not in Special now', 'unlocked'], ['can', 'Can be kept now', 'pin'], ['kept', 'Kept', 'pin'],
  ['replaced', 'Replaced', 'replaced'], ['removed', 'Not restored', 'removed'], ['later', 'Later in the Story', 'later']];
// chips covering several statuses (round 15, like the Shop's SHOW): «In Special now» = the banners of the Special tab
// (listed this week, open or with a padlock, and the KEPT one); «Unlocked, not in Special now» = reached by the Story but
// not in the tab (past quests, replaced ones, other weeks / days of the current period); later and not restored: neither
const SHOW_SETS = { now: ['now', 'kept'], unl: ['can', 'replaced', 'other'] };
// REWARDS chips (round 7): reward types of the drops and objective rewards of an entry
const REWARD_OPTS = [['all', 'All'], ['medal', 'Medals', 'medal'], ['avatar', 'Avatar parts', 'avatar'], ['jewel', 'Jewels', 'jewel'], ['material', 'Materials', 'material']];
const REWARD_OF_TYPE = { 3: 'medal', 20: 'avatar', 2: 'jewel', 5: 'material' };
const optLabel = ([, l, k]) => (k ? icon(k) : '') + esc(l);
function typesOf(en) {
  const t = [];
  if (en.campaign && !en.weekOf) t.push('camp'); // a week version of a recurring VIP set (round 17) is no campaign
  if (en.vip || en.family === 'SQ22') t.push('vip');
  if (en.family === 'SQ12') t.push('daily');
  if (en.family === 'SQ09' || en.family === 'SQ07') t.push('mog');
  if (en.family === 'SQ11') t.push('skill');
  if (!t.length) t.push('weekday');
  return t.join(' ');
}

// Reward names for the search box and the details page. rows(name) returns the master table (server.js masterRows); the
// result has drop(rewardId) -> names of a drop table, objective(stageId) -> names of the stage's objective rewards and
// stage(stageId) -> { objectives: [{ text, reward }] } (objective texts as the client writes them, reward «Name xN»).
const ITEM_NAMES = { 2: 'Jewels', 4: 'Munny', 11: 'Lux', 14: 'Avatar Coin', 26: 'Skip Ticket', 28: 'Skip Ticket+', 41: 'Draw Ticket' };
const TABLES = { 3: ['medal', 'medalId'], 5: ['material', 'materialId'], 20: ['avatarParts', 'avatarPartsId'] };
// objective ids (submissionIdType): 1 enemy, 5 Keyblade, 6 skill
const ID_TABLES = { 1: ['enemy', 'enemyId'], 5: ['keyblade', 'keybladeId'], 6: ['skill', 'skillId'] };
function buildNames(rows) {
  const maps = {};
  const table = ([t, key]) => (maps[t] ??= new Map((rows(t) || []).map((m) => [m[key], m])));
  const name = (type, id) => (TABLES[type] ? table(TABLES[type]).get(id)?.name : ITEM_NAMES[type]);
  const stageRow = (sid) => table(['stage', 'stageId']).get(sid);
  // objective reward i of a stage row; a medal with an assigned skill (VIP! Skill, round 18): «Scrooge (ATK B X Max & Lux++ LV 20)»
  const objName = (r, i) => {
    const t = r.submissionRewardType?.[i], nm = t ? name(t, r.submissionItemId?.[i]) : '';
    const sk = nm && t === 3 && r.submissionSkillId?.[i] ? table(['skill', 'skillId']).get(r.submissionSkillId[i])?.name : '';
    return sk ? `${nm} (${sk} LV ${r.submissionSkillLv?.[i] || '?'})` : nm;
  };
  // «Defeat the ${1:%s} within ${2:%d :#turn:#turns}» -> «Defeat the Huey within 1 turn»; %s = enemy / Keyblade / skill name
  const objText = (r, i) => {
    const n = r.submissionNum?.[i] ?? 0, what = ID_TABLES[r.submissionIdType?.[i]] ? table(ID_TABLES[r.submissionIdType[i]]).get(r.submissionId[i])?.name : '';
    return String(r.submissionName?.[i] || '').replace(/\$\{\d+:%s\}/g, '%s').replace(/\$\{\d+:%d :#turn:#turns\}/g, n === 1 ? '%d turn' : '%d turns')
      .replace(/%s/g, what || '?').replace(/%d/g, String(n)).replace(/\s+/g, ' ').trim();
  };
  return {
    drop: (rid) => {
      const r = table(['reward', 'rewardId']).get(rid);
      return r ? r.type.map((t, i) => name(t, r.id[i])).filter(Boolean) : [];
    },
    // reward types (REWARDS filter): of a drop row and of a stage's objective rewards (0 = none left out)
    dropTypes: (rid) => (table(['reward', 'rewardId']).get(rid)?.type || []).filter(Boolean),
    objectiveTypes: (sid) => (stageRow(sid)?.submissionRewardType || []).filter(Boolean),
    objective: (sid) => {
      const r = stageRow(sid);
      return r ? (r.submissionRewardType || []).map((t, i) => objName(r, i)).filter(Boolean) : [];
    },
    stage: (sid) => {
      const r = stageRow(sid);
      if (!r) return null;
      const count = Math.min(3, r.validSubmission ?? (r.submissionName || []).filter(Boolean).length);
      return { objectives: Array.from({ length: count }, (_, i) => {
        const nm = objName(r, i);
        return { text: objText(r, i), reward: nm ? `${nm} x${r.submissionItemNum?.[i] ?? 1}` : '' };
      }) };
    },
  };
}

// Status of an entry for the catalogue row and the details page. show: SHOW chip value; cls: row class (side bar);
// pill: status pill HTML; button: 1 Keep, 0 Remove, null none; why: one line of explanation (details page).
// pills that the page script also writes after a pin / unpin: [class, icon, text]
const PILLS = { kept: ['pinned', 'pin', 'Kept in Special'], can: ['can', 'pin', 'Old quest — can be kept'] };
const pillInner = ([, k, text]) => `${k ? icon(k) : ''}${text}`;
const pill = (c, k, text) => `<span class="s s-${c}">${pillInner([c, k, text])}</span>`;
function statusOf(en, ctx, data) {
  if (en.campaign) return campaignStatus(en, ctx, data);
  const { byKey, pinned, current } = data;
  const cur = ctx.period, isPinned = en.key === (ctx.pinnedKey || '');
  if (Math.min(...en.periods) > cur) {
    // ctx.unlockQuestOf(en) (server.js, special.unlockQuest on the Shop catalogue's story rows): the Story quest that
    // unlocks it, null when no quest of this version reaches it; without the lookup the generic text
    const q = ctx.unlockQuestOf ? ctx.unlockQuestOf(en) : undefined;
    const text = q === undefined ? 'Reached later in the Story' : q === null ? 'Not reached in this version of the Story' : `Unlocks at Story Quest ${q}`;
    const why = q === undefined ? 'Its period comes later in the Story: it opens when your Story reaches it.'
      : q === null ? 'Its period comes after the last Story quest of this version.' : `Its period comes later in the Story: it opens when you reach Story Quest ${q}.`;
    return { show: 'later', cls: 'off', pill: pill('off', 'later', text), button: null, why };
  }
  if (en.removed) {
    return { show: 'removed', cls: 'off', pill: pill('off', 'removed', 'Not restored'), button: null,
      why: 'This quest is not restored: the materials it gave have no use in this version.' };
  }
  // replaced only once the entry is in the past for the player (as special.pinnable): in its own periods it is a current
  // quest with the normal statuses (bench k5: the free Daily Cid in period 4, replaced from period 5)
  if (en.replacedBy && Math.max(...en.periods) < cur) {
    const rep = byKey.get(en.replacedBy);
    let by = rep?.name || en.replacedBy;
    // the replacing entry with the same name (period-1 VIP Daily Cid -> free Daily Cid): say what tells them apart
    if (rep && rep.name === en.name) {
      const p1 = (ctx.periods || special.PERIODS).find((p) => p.n === Math.min(...rep.periods));
      by += ` — ${en.vip && !rep.vip ? 'free ' : ''}from ${rep.from ? niceDay(rep.from) : p1 ? p1.name : ''}`;
    }
    return { show: 'replaced', cls: 'off', pill: pill('off', 'replaced', `Replaced by ${esc(by)}`), button: null,
      why: `In the original game this quest was replaced by ${esc(by)}, which is the one you can play.` };
  }
  if (isPinned) return { show: 'kept', cls: 'pinned', pill: pill(...PILLS.kept), button: 0, why: 'You keep this quest in Special.' };
  if (special.pinnable(en, cur).ok) {
    return { show: 'can', cls: 'can', pill: pill(...PILLS.can), button: 1,
      rp: pinned ? `<div class="rp">Replaces: ${esc(pinned.name)}</div>` : '', why: 'Its period is over: you can keep it in Special (one quest at a time).' };
  }
  if (!current.has(en) && ctx.weekday && special.isDailyCid(en) && Array.isArray(en.days) && !en.days.includes(ctx.weekday)
    && special.currentEntries({ entries: [en] }, { ...ctx, weekday: undefined }).length) {
    // Daily Cid of another day: the original listed only today's variant (special.currentEntries)
    return { show: 'other', cls: 'other', pill: pill('other', 'lock', `Opens on ${esc(dayWords(en.days))}`), button: null,
      why: "Daily Challenge: Cid lists only today's variant, as in the original game." };
  }
  if (!current.has(en)) {
    // current period, but not listed this Shop week: a campaign of another week, or an entry outside its from / to
    return { show: 'other', cls: 'other', pill: pill('other', '', en.campaign ? `Week of ${niceDay(en.campaign.start)}` : 'This period, not this week'), button: null,
      why: 'It belongs to the current period but is not listed in Special this week.' };
  }
  if (en.vip && !ctx.vip) {
    return { show: 'now', cls: 'locked', pill: pill('locked', 'lock', 'VIP only — locked'), button: null,
      why: 'It is in Special now, locked: it needs the VIP benefit of the Weekly Missions.' };
  }
  // a weekday quest on another day: what the Special tab shows today (special.lockOf: 2 open thanks to VIP, 1 padlock);
  // its banner is in the tab either way, so the SHOW value stays «now» (round 8)
  const lock = ctx.weekday ? special.lockOf(en, { weekday: ctx.weekday, vip: !!ctx.vip, pinned: false }) : 0;
  if (lock === 2) {
    return { show: 'now', cls: 'vipnow', pill: pill('vipnow', 'vip', 'Open today with VIP'), button: null,
      why: `Not its day (${esc(daysText(en))}): it is open today thanks to the VIP benefit.` };
  }
  if (lock === 1) {
    return { show: 'now', cls: 'locked', pill: pill('locked', 'lock', `Opens on ${esc(dayWords(en.days))}`), button: null,
      why: `It is in Special with a padlock today: it opens on ${esc(daysText(en))}, or every day with the VIP benefit of the Weekly Missions.` };
  }
  return { show: 'now', cls: 'now', pill: pill('now', 'now', `Open today${Array.isArray(en.days) && ctx.weekday ? ` (${ctx.weekday})` : ''}`), button: null, why: 'It is in Special now.' };
}

// a VIP campaign week (round 14): «This week · VIP» / «This week · VIP only — locked», «Kept in Special», «June 2017 ·
// can be kept with VIP» (kept campaigns need VIP), «Coming in June 2017 · Story Quest N», another week of the period
function campaignStatus(en, ctx, { pinned, current }) {
  const cur = ctx.period, my = monthYear(en.campaign.start);
  if (Math.min(...en.periods) > cur) {
    const q = ctx.unlockQuestOf ? ctx.unlockQuestOf(en) : undefined;
    return { show: 'later', cls: 'off', pill: pill('off', 'later', `Coming in ${my}${q ? ` · Story Quest ${q}` : q === null ? ' · not reached in this version' : ''}`), button: null,
      why: q ? `It comes with your Story: it opens when you reach Story Quest ${q}.` : 'It comes later in the Story.' };
  }
  const what = en.weekOf ? 'week' : 'campaign';
  if (en.key === (ctx.pinnedKey || '')) return { show: 'kept', cls: 'pinned', pill: pill(...PILLS.kept), button: 0, why: `You keep this ${what} in Special (it needs the VIP benefit).` };
  if (special.pinnable(en, cur).ok) {
    return { show: 'can', cls: 'can', pill: pill('can', 'pin', `${my} · can be kept with VIP`), button: 1,
      rp: pinned ? `<div class="rp">Replaces: ${esc(pinned.name)}</div>` : '', why: `Its week is over: you can keep it in Special; like every VIP ${en.weekOf ? 'quest' : 'campaign'} it needs the VIP benefit.` };
  }
  if (current.has(en)) {
    return ctx.vip ? { show: 'now', cls: 'now', pill: pill('now', 'now', 'This week · VIP'), button: null, why: 'It is in Special this week.' }
      : { show: 'now', cls: 'locked', pill: pill('locked', 'lock', 'This week · VIP only — locked'), button: null, why: 'It is in Special this week, locked: it needs the VIP benefit of the Weekly Missions.' };
  }
  return en.campaign.start > (ctx.shopTo || '')
    ? { show: 'other', cls: 'other', pill: pill('other', '', `Coming in ${my}`), button: null, why: 'A later week of the current period.' }
    : { show: 'other', cls: 'other', pill: pill('other', '', `${my} · not in Special now`), button: null, why: 'An earlier week of the current period: it can be kept once the period is over.' };
}

// shared by catalogue and details: entries of the catalogue, keys, the pinned entry and the quests of this Shop week
function pageData(index, ctx) {
  const entries = index.entries.filter((en) => en.periods && en.key !== 'catalog' && !en.training);
  const byKey = new Map(index.entries.map((en) => [en.key, en]));
  const pinned = byKey.get(ctx.pinnedKey || '');
  // quests of this Shop week, as the Special tab lists them (special.specialEvents): ctx.period / shopFrom / shopTo
  const current = new Set(ctx.period === undefined ? [] : special.currentEntries({ entries }, ctx));
  return { entries, byKey, pinned, current };
}
const keepButton = (id, on, extra = '') => `<a href="#" class="pk" data-id="${id}" data-on="${on}" data-pin="${on === 1 ? `/web/special/pin/${id}` : '/web/special/unpin'}"${extra}>${on === 1 ? KEEP_LABEL : REMOVE_LABEL}</a>`;
// «Monday» for one day, «Mon, Wed» for several (status lines)
const dayWords = (days) => (Array.isArray(days) && days.length === 1 ? ({ Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' })[days[0]] || days[0] : (days || []).join(', '));
const daysText = (en) => (en.days === 'all' ? 'Every day' : (en.days || []).join(', '));
const detailHref = (id) => `/web/special/detail/${id}?from=catalog`;

// ES5, no external script (round 13: «minimal» rows). Items = one row per quest (.row) and one per VIP campaign (.row.cr),
// read once at start: members (data-eid / data-show / data-mcls, one per entry, and their status lines in data-mpill),
// the periods they have, types, rewards, item names (« | »), versions. A period tab is a filter. A tap on a row (outside
// its Keep button) opens its details page. khuxRow (PIN_JS, after a pin / unpin) moves the statuses: the new kept entry
// gold, the old one back to «can be kept»; the row shows its best entry again (khuxRank, the same rank as the server).
const JS = `(function(){
var PN=__PN__,LAB={type:__TYPE__,show:__SHOW__,reward:__REWARD__},PILL=__PILL__,SHOWSET=__SHOWSET__;
__RANK__
__MATCH__
function $(id){return document.getElementById(id);}
function attr(el,a){return el&&el.getAttribute?el.getAttribute(a):null;}
function q(el,s){return el.querySelector(s);}
var items=[].map.call(document.querySelectorAll('.row'),function(el){var mp=[];try{mp=JSON.parse(attr(el,'data-mpill')||'[]');}catch(e){}
return {el:el,camp:/\\bcr\\b/.test(el.className),ids:(attr(el,'data-eid')||'').split(' '),ss:(attr(el,'data-show')||'').split(' '),mc:(attr(el,'data-mcls')||'').split(' '),mp:mp,
ps:' '+attr(el,'data-periods')+' ',t:' '+attr(el,'data-type')+' ',rw:' '+(attr(el,'data-reward')||'')+' ',ns:(attr(el,'data-search')||'').split(' | '),nv:+attr(el,'data-nv')||1,mt:q(el,'.mt')};});
var mls=[].map.call(document.querySelectorAll('.ml'),function(el){return {el:el,m:attr(el,'data-m')};});
var ycs=[].map.call(document.querySelectorAll('.yc'),function(el){return {el:el,y:attr(el,'data-yr'),n:q(el,'.yn')};});
for(var i0=0;i0<items.length;i0++){items[i0].y=attr(items[i0].el,'data-y');items[i0].mc0=items[i0].mc.slice();items[i0].mp0=items[i0].mp.slice();}
var cur={p:'all',type:'all',show:'all',reward:'all',q:''},dr=null,yr=attr($('camps'),'data-defy')||'all';
function copy(s){return {p:s.p,type:s.type,show:s.show,reward:s.reward,q:s.q};}
function match(r,s,anyPeriod){
if(!anyPeriod&&s.p!=='all'&&r.ps.indexOf(' '+s.p+' ')<0)return false;
if(s.type!=='all'&&r.t.indexOf(' '+s.type+' ')<0)return false;
if(s.show!=='all'){var want=SHOWSET[s.show]||[s.show],ok=false;for(var w=0;w<want.length;w++)if((' '+r.ss.join(' ')+' ').indexOf(' '+want[w]+' ')>=0)ok=true;if(!ok)return false;}
if(s.reward!=='all'&&r.rw.indexOf(' '+s.reward+' ')<0)return false;
return !s.q||hits(r,s.q,1).length>0;}
// item names of the row matching the query (one name at a time, khuxMatch), at most max
function hits(r,q,max){var o=[],i;for(i=0;i<r.ns.length&&o.length<max;i++)if(khuxMatch(q,r.ns[i]))o.push(r.ns[i]);return o;}
function count(s){var n=0;for(var i=0;i<items.length;i++)if(match(items[i],s))n++;return n;}
function nf(s){return (s.type!=='all'?1:0)+(s.show!=='all'?1:0)+(s.reward!=='all'?1:0)+(s.q?1:0);}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function plural(n,w){return n+' '+w+(n===1?'':'s');}
function tag(g,l){return '<span class="tag">'+l+'<a href="#" data-x="'+g+'" aria-label="Remove">×</a></span>';}
function hide(el,h){el.className=el.className.replace(/ hide/g,'')+(h?' hide':'');}
function render(){
var c={all:0},n=0,k=0,i,j,r,on,p;
// campaigns: per year counts of the matching rows; a search goes to the one year it finds (or All years)
var yc={all:0},ys=[];for(i=0;i<items.length;i++){r=items[i];if(r.camp&&match(r,cur)){yc.all++;if(!yc[r.y]){yc[r.y]=0;ys.push(r.y);}yc[r.y]++;}}
if(cur.q)yr=ys.length===1?ys[0]:'all';
// any other filter or a period tab: a year without matching campaigns gives way to the one year that has some (or All years)
else if((nf(cur)||cur.p!=='all')&&yr!=='all'&&!yc[yr])yr=ys.length===1?ys[0]:'all';
for(i=0;i<ycs.length;i++){ycs[i].n.textContent=yc[ycs[i].y]||0;ycs[i].el.className='yc'+(ycs[i].y===yr?' on':'')+(ycs[i].y!=='all'&&!yc[ycs[i].y]?' hide':'');}
for(i=0;i<items.length;i++){r=items[i];if(match(r,cur,true)){c.all++;for(p in PN)if(r.ps.indexOf(' '+p+' ')>=0)c[p]=(c[p]||0)+1;}
on=match(r,cur)&&(!r.camp||yr==='all'||r.y===yr);hide(r.el,!on);if(on){if(r.camp)k++;else n++;}}
// month labels: only above visible rows
for(i=0;i<mls.length;i++){var e=mls[i].el.nextSibling,vis=false;while(e&&!/\\bml\\b/.test(e.className||'')){if(e.className&&e.className.indexOf(' hide')<0)vis=true;e=e.nextSibling;}hide(mls[i].el,!vis);}
$('cc').textContent=yc.all;hide($('camps'),!yc.all);hide($('quests'),!n);
[].forEach.call(document.querySelectorAll('.tab'),function(t){var p=attr(t,'data-p');t.className='tab'+(p===cur.p?' on':'');$('tc'+p).textContent=c[p]||0;});
var f=nf(cur),h='<span class="n1">'+plural(n,'quest')+'</span> · '+plural(k,'campaign');
if(cur.p!=='all')h+=' in <b>'+esc(PN[cur.p])+'</b>';
if(!f)h+=cur.p==='all'?' · all periods, no filters':' · no filters';
else{h+=' match your filters:';
if(cur.type!=='all')h+=' '+tag('type',LAB.type[cur.type]);
if(cur.show!=='all')h+=' '+tag('show',LAB.show[cur.show]);
if(cur.reward!=='all')h+=' '+tag('reward',LAB.reward[cur.reward]);
if(cur.q)h+=' '+tag('q','Find: &quot;'+esc(cur.q)+'&quot;');
h+=' <a href="#" class="clear" data-x="all">Clear all</a>';}
$('sum').innerHTML=h;$('fdot').textContent=f?f:'';
// why a row matched (only while searching), and a message when nothing does
for(i=0;i<items.length;i++){r=items[i];if(!r.mt)continue;var w=cur.q&&r.el.className.indexOf(' hide')<0?hits(r,cur.q,3):[];r.mt.textContent=w.length?'Matches: '+w.join(', '):'';r.mt.style.display=w.length?'':'none';}
var none=$('none'),any=n+k;none.textContent=any?'':(cur.q?'No quests match "'+cur.q+'"':'No quests match your filters');none.style.display=any?'none':'';}
// status changes (pin / unpin): the member's status, then the row shows its best member (bar and status line)
function paint(r){var b=-1,o=0,j,k;for(j=0;j<r.ids.length;j++){k=khuxRank(r.ss[j],r.mc[j]);if(b<0||k<b){b=k;o=j;}}
r.el.className='row'+(r.camp?' cr':'')+' '+r.mc[o]+(/ hide/.test(r.el.className)?' hide':'');var s=q(r.el,'.s');if(s){s.className='s s-'+r.mc[o];s.innerHTML=r.mp[o];}}
function setMember(r,j,show){var p=PILL[show];r.ss[j]=show;r.mc[j]=p.cls;r.mp[j]=show==='can'&&r.mc0[j]==='can'?r.mp0[j]:p.html;r.el.setAttribute('data-show',r.ss.join(' '));paint(r);}
window.khuxRow=function(id,on){var name='',i,j,r;for(i=0;i<items.length;i++){r=items[i];for(j=0;j<r.ids.length;j++){if(r.ss[j]==='kept')setMember(r,j,'can');
if(r.ids[j]===id){setMember(r,j,on?'kept':'can');if(on)name=attr(r.el,'data-name');}}}
for(i=0;i<items.length;i++){r=items[i];var pk=q(r.el,'.pk');if(!pk)continue;var st=r.ss[r.ids.indexOf(attr(pk,'data-id'))],x=q(r.el,'.rp');
if(!x&&st==='can'&&name){x=document.createElement('div');x.className='rp';pk.parentNode.parentNode.insertBefore(x,pk.parentNode);}
if(x){x.textContent='Replaces\\u003a '+name;x.style.display=name&&st==='can'?'':'none';}}
render();};
// a tap anywhere on a row opens its details page (the Keep button and the links keep their own action)
[].forEach.call(items,function(r){r.el.onclick=function(e){var t=e.target;while(t&&t!==r.el){if(t.tagName==='A')return;t=t.parentNode;}location.href=attr(r.el,'data-href');};});
function sync(){
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){var g=attr(box,'data-g');[].forEach.call(box.children,function(o){o.className=o.className.replace(/ on/g,'')+(attr(o,'data-v')===dr[g]?' on':'');});});
$('fok').textContent='Show '+plural(count(dr),'result');}
function openF(){dr=copy(cur);$('fq').value=dr.q;if(document.body.className.indexOf('fo')<0)document.body.className+=' fo';sync();}
function closeF(){dr=null;document.body.className=document.body.className.replace(/ ?fo/g,'');}
$('fbtn').onclick=openF;$('fx').onclick=closeF;$('dim').onclick=closeF;
$('fq').oninput=function(){dr.q=this.value.replace(/\\s+/g,' ').replace(/^ | $/g,'');sync();};
$('fq').onkeydown=function(e){if(e.keyCode===13)this.blur();};
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){box.onclick=function(e){var t=e.target;while(t&&t!==box&&!attr(t,'data-v'))t=t.parentNode;var v=attr(t,'data-v');if(!v||!dr)return;dr[attr(box,'data-g')]=v;sync();};});
$('freset').onclick=function(e){e.preventDefault();dr.type='all';dr.show='all';dr.reward='all';dr.q='';$('fq').value='';sync();};
$('fok').onclick=function(){if(!dr)return;var s=dr;s.p=cur.p;closeF();cur=s;render();};
$('sum').onclick=function(e){var t=e.target;while(t&&t!==this&&!attr(t,'data-x'))t=t.parentNode;var x=attr(t,'data-x');if(!x)return;e.preventDefault();
if(x==='type'||x==='all')cur.type='all';if(x==='show'||x==='all')cur.show='all';if(x==='reward'||x==='all')cur.reward='all';if(x==='q'||x==='all')cur.q='';render();};
$('yrs').onclick=function(e){var t=e.target;while(t&&t!==this&&!attr(t,'data-yr'))t=t.parentNode;var y=attr(t,'data-yr');if(!y)return;yr=y;render();};
$('tabs').onclick=function(e){var t=e.target;while(t&&!attr(t,'data-p'))t=t.parentNode;if(!t)return;cur.p=attr(t,'data-p');render();};
render();
// BACK from a details page: #q<id>; a campaign row of another year selects its year first
var h=location.hash&&document.getElementById(location.hash.slice(1));if(h){var d=h;while(d&&!/\\brow\\b/.test(d.className||''))d=d.parentNode;if(d&&attr(d,'data-y')){yr=attr(d,'data-y');render();}if(h.scrollIntoView)h.scrollIntoView();}
})();`;

// the best entry of a quest (round 7-13): it gives the row its colour and its status line.
// the player's own pin before «can be kept» (ruling 31-10: a kept member takes over the group row)
const SHOW_RANK = ['now', 'kept', 'can', 'other', 'replaced', 'later', 'removed'];
const CHIP_ICON = { now: 'now', can: 'pin', kept: 'pin', replaced: 'replaced', later: 'later', removed: 'removed' };
// rank of a member status (lower = better): SHOW order, then open > open with VIP > locked. The same function runs in
// the page script (regroup after a pin / unpin) and here (groupRow), from this one source.
const CLS_RANK = ['now', 'vipnow', 'locked'];
const RANK_JS = `function khuxRank(show,cls){var s=${JSON.stringify(SHOW_RANK)}.indexOf(show),c=${JSON.stringify(CLS_RANK)}.indexOf(cls);return s*3+(c<0?0:c);}`;
const khuxRank = new Function(`${RANK_JS};return khuxRank;`)();
// FIND (round 11, user: «key» found Mickey and Keyblade quests): every query word must start a word of ONE item name
// (quest name, drop, objective reward); words = runs of letters and digits, so «Key Art #3» -> key, art, 3. Shared
// by the page script and node (tests), like the rank.
const MATCH_JS = 'function khuxWords(t){var a=String(t).toLowerCase().split(/[^a-z0-9\\u00c0-\\u024f]+/),o=[],i;for(i=0;i<a.length;i++)if(a[i])o.push(a[i]);return o;}'
  + 'function khuxMatch(q,name){var qs=khuxWords(q),ws=khuxWords(name),i,j,ok;for(i=0;i<qs.length;i++){ok=false;for(j=0;j<ws.length;j++)if(ws[j].indexOf(qs[i])===0){ok=true;break;}if(!ok)return false;}return true;}';
const khuxMatch = new Function(`${MATCH_JS};return khuxMatch;`)();
const DAY_SUFFIX = /\s*\((?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\)\s*$/;
const familyTitle = (name) => String(name).replace(DAY_SUFFIX, '').replace(/\s+\d+$/, '');
const variantOf = (en) => (Array.isArray(en.days) && en.days.length === 1 ? en.days[0] : (/\s(\d+)$/.exec(en.name) || [, '1'])[1]);

// quest families (round 12-13): permanent entries with the same title (without day / variant suffix) are one quest;
// inside, versions = same periods, VIP rule and banner (an empty banner is a version of its own), oldest first.
// Campaigns are families of one entry. key = the first entry's evStageId (/web/special/quest/<key>).
// Round 17: the week versions of a recurring VIP set (weekOf, with a campaign week) join their set's quest (same name),
// one version per week, ordered by period and then week (the set's own entry first within its first period).
const isCampaignRow = (en) => en.campaign && !en.weekOf;
const startOf = (en) => (en.campaign ? en.campaign.start : en.from || '');
function familiesOf(entries) {
  const out = [], byTitle = new Map();
  for (const en of entries.filter((x) => !isCampaignRow(x))) {
    const t = familyTitle(en.name);
    if (!byTitle.has(t)) { const f = { title: t, list: [], campaign: false }; out.push(f); byTitle.set(t, f); }
    byTitle.get(t).list.push(en);
  }
  // campaigns (round 14): by date; the same banner art again within a week of the previous one's end -> the same row
  const camps = entries.filter(isCampaignRow).sort((a, b) => (a.campaign.start < b.campaign.start ? -1 : a.campaign.start > b.campaign.start ? 1 : a.evStageId - b.evStageId));
  let last = null;
  for (const en of camps) {
    const prev = last && last.list[last.list.length - 1];
    if (prev && en.banner && artKey(prev.banner) === artKey(en.banner) && daysBetween(prev.campaign.end, en.campaign.start) <= 8) last.list.push(en);
    else { last = { list: [en], campaign: true }; out.push(last); }
  }
  for (const c of out.filter((x) => x.campaign)) c.title = campaignTitle(c.list);
  for (const f of out) {
    const vmap = new Map();
    for (const en of f.list) {
      const k = en.campaign ? `w${en.evStageId}` : `${en.periods.join(',')}|${en.vip ? 1 : 0}|${en.banner || en.evStageId}`;
      if (!vmap.has(k)) vmap.set(k, []);
      vmap.get(k).push(en);
    }
    const byWeek = (a, b) => (!a[0].campaign && !b[0].campaign ? 0 : !a[0].campaign ? -1 : !b[0].campaign ? 1
      : startOf(a[0]) < startOf(b[0]) ? -1 : startOf(a[0]) > startOf(b[0]) ? 1 : a[0].evStageId - b[0].evStageId);
    f.versions = [...vmap.values()].sort((a, b) => Math.min(...a[0].periods) - Math.min(...b[0].periods) || byWeek(a, b));
    f.key = f.list[0].evStageId;
    f.mixed = f.versions.some((v) => v[0].vip) && f.versions.some((v) => !v[0].vip);
  }
  return out;
}
// the art of a campaign banner: «… Challenge 2 banner KHUX.png» is the second week of «… Challenge banner KHUX.png»
const artKey = (b) => String(b).replace(/ \d+( banner KHUX\.png)$/i, '$1');
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
// title of a merged campaign row: the first week's title without its tail («Pt. 2…», «& More!», «& Combo…», «!»)
function campaignTitle(list) {
  if (list.length === 1) return list[0].name;
  const t = list[0].name.replace(/\s+(?:Pt\.?|Part)\s*\d+.*$/i, '').replace(/\s*(?:&|and|\+)\s*(?:Much,?\s*Much\s*)?More!?\s*$/i, '')
    .replace(/\s*&\s*Combo.*$/i, '').replace(/\s*\+\s*(?:More|0 AP Campaign)\b.*$/i, '').replace(/!+\s*$/, '').trim();
  return t || list[0].name;
}
// «Week of Jun 1, 2020»; a version of several weeks (round 17): «Mar 4 – Mar 17, 2019»
const weekLabel = ({ start, end }) => {
  if (daysBetween(start, end) <= 6) return `Week of ${niceDay(start)}`;
  return start.slice(0, 4) === end.slice(0, 4) ? `${niceDay(start).replace(/, \d{4}$/, '')} – ${niceDay(end)}` : `${niceDay(start)} – ${niceDay(end)}`;
};
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthYear = (d) => (/^(\d{4})-(\d\d)/.test(d || '') ? `${FULL_MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '');
const questHref = (key) => `/web/special/quest/${key}?from=catalog`;
// years of a version: from max(first period from, entries' from) to min(last period to, entries' to)
function versionYears(v, periods) {
  const pi = (n) => periods.find((p) => p.n === n);
  const a = pi(Math.min(...v[0].periods)), b = pi(Math.max(...v[0].periods));
  const from = [a ? a.from : '', ...v.map((en) => en.from || '')].sort().pop(), to = [b ? b.to : '9999', ...v.map((en) => en.to || '9999')].sort()[0];
  return [from.slice(0, 4), to.slice(0, 4)];
}
// helpers on the statuses of a family (statusFor memoised per page)
function statusTools(ctx, data) {
  const memo = new Map();
  const statusFor = (en) => { if (!memo.has(en)) memo.set(en, statusOf(en, ctx, data)); return memo.get(en); };
  const bestOf = (list) => list.reduce((a, b) => (khuxRank(statusFor(b).show, statusFor(b).cls) < khuxRank(statusFor(a).show, statusFor(a).cls) ? b : a));
  // the Keep / Remove button of a group of entries, only when exactly one of them can be kept (with «Replaces»)
  const keepFor = (list, extra) => {
    const keepable = list.filter((en) => statusFor(en).button !== null);
    if (keepable.length !== 1) return '';
    const st = statusFor(keepable[0]);
    return `${st.rp || ''}<div>${keepButton(keepable[0].evStageId, st.button, extra)}</div>`;
  };
  return { statusFor, bestOf, keepFor };
}

function catalogPage(index, ctx = {}) {
  const periods = ctx.periods || special.PERIODS, cur = ctx.period;
  const names = { drop: () => [], objective: () => [], dropTypes: () => [], objectiveTypes: () => [], ...(ctx.names || {}) };
  const data = pageData(index, ctx);
  const { statusFor, bestOf, keepFor } = statusTools(ctx, data);
  const stagesOf = (en) => (en.stages && en.stages.length ? en.stages : [{ dropRewardIds: en.dropRewardIds }]);
  // item names of an entry (FIND, «Matches:»): its name, its quests' names, the drop items and the objective rewards, as
  // written, without repeats (case aside)
  const namesOf = (en) => {
    const parts = [en.name];
    for (const s of stagesOf(en)) {
      if (s.quest) parts.push(s.quest);
      for (const rid of s.dropRewardIds || []) parts.push(...names.drop(rid));
    }
    for (const sid of en.stageIds || []) parts.push(...names.objective(sid));
    return parts.map((x) => String(x).replace(/\s+/g, ' ').replace(/ \| /g, ' / ').trim()).filter(Boolean);
  };
  const searchOf = (list) => { const seen = new Set(); return list.flatMap(namesOf).filter((x) => !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).join(' | '); };
  // REWARDS chips: reward types of the drop rows and of the objective rewards (3 medal, 20 avatar part, 2 Jewels, 5 material)
  const rewards = (en) => {
    const types = [...stagesOf(en).flatMap((s) => (s.dropRewardIds || []).flatMap((rid) => names.dropTypes(rid))),
      ...(en.stageIds || []).flatMap((sid) => names.objectiveTypes(sid))];
    return REWARD_OPTS.slice(1).filter(([v]) => types.some((t) => REWARD_OF_TYPE[t] === v)).map(([v]) => v).join(' ');
  };
  const uniq = (arr) => [...new Set(arr.join(' ').split(' ').filter(Boolean))].join(' ');
  const inner = (st) => st.pill.replace(/^<span[^>]*>|<\/span>$/g, '');
  // one minimal row: banner, title, ONE status line (best entry), at most ONE button, «›»; the whole row opens the
  // quest's details page. Anchors q<id> for every entry (BACK from a details page lands on the row).
  const row = (f) => {
    const all = f.list, head = f.versions[f.versions.length - 1][0], best = statusFor(bestOf(all)), href = questHref(f.key);
    const anchors = all.slice(1).map((en) => `<i id="q${en.evStageId}"></i>`).join('');
    const img = `<a class="im" href="${href}"><img loading="lazy" width="320" height="70" src="${special.imgPath(head.evStageId)}" alt=""></a>`;
    // campaigns: the weeks as a short line (no Keep button in the list: keeping is on the details page)
    const dates = f.campaign ? `<div class="d">${all.length > 1 ? `${all.length} weeks · ` : ''}${niceDay(all[0].campaign.start)} – ${niceDay(all[all.length - 1].campaign.end)}</div>` : '';
    const y = f.campaign ? all[0].campaign.start.slice(0, 4) : '';
    return `<div class="row${f.campaign ? ' cr' : ''} ${best.cls}" id="q${f.key}"${y ? ` data-y="${y}"` : ''} data-href="${href}" data-name="${esc(f.title)}" data-eid="${all.map((en) => en.evStageId).join(' ')}"`
      + ` data-show="${all.map((en) => statusFor(en).show).join(' ')}" data-mcls="${all.map((en) => statusFor(en).cls).join(' ')}" data-mpill="${esc(JSON.stringify(all.map((en) => inner(statusFor(en)))))}"`
      + ` data-periods="${uniq(all.map((en) => en.periods.join(' ')))}" data-type="${uniq(all.map(typesOf))}" data-reward="${uniq(all.map(rewards))}" data-search="${esc(searchOf(all))}" data-nv="${f.versions.length}">`
      + `${img}<div class="info"><a class="nm" href="${href}">${esc(f.title)}</a>${anchors}${dates}${best.pill}`
      + `${f.campaign ? '' : keepFor(all, ' onclick="return khuxClick(this)"')}<div class="mt"></div></div><a class="go" href="${href}" aria-label="Details">›</a></div>
`;
  };
  const fams = familiesOf(data.entries), quests = fams.filter((f) => !f.campaign), camps = fams.filter((f) => f.campaign);
  // campaigns by date with a plain month label between months; a YEAR selector (the year of the Shop week by default)
  let lastM = '';
  const campRows = camps.map((f) => {
    const m = f.list[0].campaign.start.slice(0, 7), label = m !== lastM ? `<div class="ml" data-y="${m.slice(0, 4)}" data-m="${m}">${monthYear(m + '-01')}</div>` : '';
    lastM = m;
    return label + row(f);
  }).join('');
  const years = [...new Set(camps.map((f) => f.list[0].campaign.start.slice(0, 4)))];
  // the year of the campaign of the Shop week, else the Shop week's year (bench rev 221: a week across New Year)
  const nowCamp = camps.find((f) => f.list.some((en) => data.current.has(en)));
  const shopYear = nowCamp ? nowCamp.list[0].campaign.start.slice(0, 4) : String(ctx.shopFrom || '').slice(0, 4), defYear = years.includes(shopYear) ? shopYear : 'all';
  const yearChip = (y, label, n) => `<button type="button" class="yc${y === defYear ? ' on' : ''}" data-yr="${y}">${label} <span class="yn">${n}</span></button>`;
  const yearsHtml = `<div class="yrs" id="yrs">${yearChip('all', 'All years', camps.length)}${years.map((y) => yearChip(y, y, camps.filter((f) => f.list[0].campaign.start.startsWith(y)).length)).join('')}</div>`;
  const tab = (p, name, n, now) => `<button type="button" class="tab${p === 'all' ? ' on' : ''}" data-p="${p}"><b>${esc(name)}</b>${now ? '<span class="now">Now</span>' : ''}<span class="c" id="tc${p}">${n}</span></button>`;
  const opts = (list, cls = () => '') => list.map((o, i) => `<button type="button" class="o${cls(o[0])}${i ? '' : ' on'}" data-v="${o[0]}">${optLabel(o)}</button>`).join('');
  const count = (pn) => fams.filter((f) => f.list.some((en) => en.periods.includes(pn))).length;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const pillJs = (k) => ({ cls: PILLS[k][0], html: pillInner(PILLS[k]) });
  const labels = (list) => JSON.stringify(Object.fromEntries(list.slice(1).map((o) => [o[0], optLabel(o)])));
  const js = JS.replace('__PN__', JSON.stringify(Object.fromEntries(periods.map((p) => [p.n, p.name]))))
    .replace('__TYPE__', labels(TYPE_OPTS)).replace('__SHOW__', labels(SHOW_OPTS)).replace('__SHOWSET__', JSON.stringify(SHOW_SETS)).replace('__REWARD__', labels(REWARD_OPTS))
    .replace('__PILL__', JSON.stringify({ kept: pillJs('kept'), can: pillJs('can') }))
    .replace('__RANK__', () => RANK_JS).replace('__MATCH__', () => MATCH_JS);
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>Special Catalog</title><style>${CSS}</style></head><body>`
    + '<div class="hdr"><h1>Special Catalog</h1><button type="button" class="fbtn" id="fbtn">⚙ Filters<span class="dot" id="fdot"></span></button></div>'
    + '<p class="n">Every Special quest of the game. Tap a quest for its versions, days and rewards. Old quests can be kept in Special, one at a time.</p>'
    + `<div class="tabs" id="tabs">${tab('all', 'All', fams.length)}${periods.map((p) => tab(p.n, p.name, count(p.n), p.n === cur)).join('')}</div><div class="tabline"></div>`
    + `<div class="sum" id="sum"><span class="n1">${plural(quests.length, 'quest')}</span> · ${plural(camps.length, 'campaign')} · all periods, no filters</div>`
    + '<div id="none" class="none" style="display:none"></div>'
    + `<div id="quests">${quests.map(row).join('') || '<p class="n">No quests.</p>'}</div>`
    + `<div class="camps" id="camps" data-defy="${defYear}"><h2>VIP Campaigns (<span id="cc">${camps.length}</span>)</h2><p class="n">Limited VIP campaigns of the original game, by date. Tap one for its weeks and rewards.</p>${yearsHtml}${campRows}</div>`
    + '<div class="ov" id="dim"></div><div class="sheet" id="sheet" role="dialog" aria-label="Filters">'
    + '<div class="shd"><b>Filters</b><button type="button" class="x" id="fx" aria-label="Close">✕</button></div>'
    + '<h4>FIND</h4><div class="search"><input type="search" id="fq" placeholder="Quest or reward name" autocomplete="off"></div>'
    + '<div class="hint">Matches the start of words in quest names and in the items they give (e.g. Key Art, Mythril, Cid).</div>'
    + `<h4>TYPE</h4><div class="opts" data-g="type">${opts(TYPE_OPTS)}</div>`
    + `<h4>REWARDS</h4><div class="opts" data-g="reward">${opts(REWARD_OPTS)}</div>`
    + `<h4>SHOW</h4><div class="opts" data-g="show">${opts(SHOW_OPTS, (v) => (v === 'all' ? '' : ` st-${v}`))}</div>`
    + `<div class="foot"><a href="#" class="reset" id="freset">Reset filters</a><button type="button" class="ok" id="fok">Show ${plural(fams.length, 'result')}</button></div></div>`
    + `<div id="pinmsg" class="pinmsg"></div><script>${PIN_JS}</script><script>${js}</script></body></html>`;
}

// Details page of one quest (round 13): GET /web/special/quest/<id> and the old /web/special/detail/<id> (id = any entry
// of the quest). Header: banner, title, the status line. «Versions»: one block per version, newest first, with its label,
// its periods in plain words, its status line, its days or variants (each with its own status line) and its Keep / Remove
// button. Then the quests of each version (collapsible, the newest open): AP, level, target, place, objectives with their
// rewards, drops. Modelled on the Shop's detailPage (gacha.js): «■» headings, white-bordered tables, BACK bar at the
// bottom. null = unknown id (404).
const DETAIL_CSS = 'table{width:100%;margin:6px 0 10px;border-collapse:collapse;table-layout:fixed;font-size:15px;line-height:1.4}'
  + 'th,td{border:1px solid #fff;padding:4px 8px;text-align:left;vertical-align:middle;overflow-wrap:break-word}th{background:#365e76;font-weight:normal}'
  + '.kv th{width:32%}.ob td.r{width:38%;color:#ffcd4a}.banner{width:100%;max-width:640px;margin:6px 0}'
  + 'ul.pl{margin:4px 0 8px;padding-left:22px}ul.pl li{margin:2px 0}.dr{color:#ffcd4a}'
  + '.why{border-left:4px solid #8aa3b3;background:#0a4466;padding:6px 12px;margin:8px 0 4px;font-size:15px;line-height:1.6}'
  + '.why.now,.why.vipnow{border-color:#2e9e3e}.why.pinned{border-color:#b8860b}.why.can{border-color:#1a6fa8}.why.locked,.why.off{border-color:#7d8894}'
  + 'h3{color:#ffcd4a;font-size:17px;margin:14px 0 2px}'
  + '.ver{border-left:5px solid #5d8aa6;background:#06283e;border-radius:0 8px 8px 0;padding:8px 12px;margin:8px 0}.ver h3{margin:0 0 2px;color:#fff}'
  + '.ver.now,.ver.vipnow{border-left-color:#2e9e3e}.ver.pinned{border-left-color:#b8860b}.ver.can{border-left-color:#1a6fa8}.ver.locked{border-left-color:#7d8894}.ver.off{border-left-color:#6a7580}'
  + '.mem{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:4px 0;border-top:1px solid #2f5d78}.mem b{min-width:3.2em}'
  + 'details.vq{margin:10px 0;border-top:2px solid #39a7cf}details.vq>summary{cursor:pointer;color:#00d4ed;font-size:18px;padding:6px 0}'
  + '.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:linear-gradient(rgba(2,24,40,0),rgba(2,24,40,.92) 35%)}'
  + '.back{display:inline-block;padding:7px 26px 8px;border-radius:10px;border:2px solid #9fd4ff;color:#fff;text-decoration:none;'
  + 'font:italic bold 20px sans-serif;letter-spacing:1px;background:linear-gradient(#5aa8ff,#2556c8 55%,#1b3f9c);'
  + 'box-shadow:0 2px 0 #0b2a66,inset 0 1px 0 rgba(255,255,255,.5);text-shadow:0 1px 2px #0a2a6a}'
  + '.back span{display:inline-block;margin-left:12px;width:14px;height:9px;border:3px solid #fff;border-left:0;border-radius:0 8px 8px 0;vertical-align:1px;position:relative}.back span:after{content:"";position:absolute;left:-7px;bottom:-8px;border-style:solid;border-width:6px 9px 6px 0;border-color:transparent #fff transparent transparent}'
  + 'body.hb{padding-bottom:90px}.pinmsg{position:static}';
const FULL_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
function detailPage(index, evStageId, ctx = {}) {
  const data = pageData(index, ctx);
  const fams = familiesOf(data.entries);
  const f = fams.find((x) => x.list.some((en) => en.evStageId === Number(evStageId)));
  if (!f) return null;
  const periods = ctx.periods || special.PERIODS;
  const names = { drop: () => [], stage: () => null, ...(ctx.names || {}) };
  const { statusFor, bestOf, keepFor } = statusTools(ctx, data);
  const button = (list) => keepFor(list, ' onclick="var b=this;return khuxPin(b,document.getElementById(\'pinmsg\'),function(){b.style.display=\'none\';})"');
  const versions = [...f.versions].reverse(), head = versions[0][0], best = statusFor(bestOf(f.list));
  const quests = (en) => {
    const stages = en.stages && en.stages.length ? en.stages : (en.stageIds || []).map((stageId) => ({ stageId, dropRewardIds: en.dropRewardIds }));
    return stages.map((s, i) => {
      const info = names.stage(s.stageId), ap = (en.useAp || [])[i];
      const kv = [['AP', ap ?? ''], ['Level', s.wikiLv ?? ''], ['Target', s.target || ''], ['Where', [s.world, s.room].filter(Boolean).join(' · ')]]
        .filter(([, v]) => v !== '').map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
      const obj = info && info.objectives.length ? `<h3>Objectives</h3><table class="ob"><tr><th>Objective</th><th>Reward</th></tr>${info.objectives
        .map((o) => `<tr><td>${esc(o.text)}</td><td class="r">${esc(o.reward || '—')}</td></tr>`).join('')}</table>` : '';
      const drops = [...new Set((s.dropRewardIds || []).flatMap((rid) => names.drop(rid)))];
      const dropHtml = drops.length ? `<h3>Drops</h3><p class="dr">${drops.map(esc).join(', ')}</p>`
        + '<p class="n">Drops and their rates are reconstructed: the original data is lost.</p>' : '';
      return `<h2>${esc(s.quest || en.name)}</h2><table class="kv">${kv}</table>${obj}${dropHtml}`;
    }).join('');
  };
  const verLabel = (v) => {
    if (v[0].campaign) return weekLabel(v[0].campaign);
    const [y1, y2] = versionYears(v, periods);
    return `${y1 === y2 ? y1 : `${y1}–${y2}`}${f.mixed ? ` · ${v[0].vip ? 'VIP' : 'Free'}` : v[0].vip ? ' · VIP only' : ''}`;
  };
  const block = (v, vi) => {
    const vb = statusFor(bestOf(v)), en0 = v[0];
    const pers = periods.filter((p) => en0.periods.includes(p.n)).map((p) => esc(p.name)).join(', ');
    const limits = [en0.from ? `from ${niceDay(en0.from)}` : '', en0.to ? `until ${niceDay(en0.to)}` : ''].filter(Boolean).join(', ');
    const days = v.length === 1 ? `<p>${esc(daysText(en0))}</p>`
      : `<p>${v.every((en) => Array.isArray(en.days) && en.days.length === 1) ? `One quest per day: ${esc(v.map((en) => en.days[0]).join(', '))}.` : `${v.length} quests.`}</p>`
        // one line per day / variant only when they differ (a status of their own, or a Keep button)
        + (new Set(v.map((en) => `${statusFor(en).show}|${statusFor(en).cls}`)).size > 1 || v.some((en) => statusFor(en).button !== null)
          ? v.map((en) => `<div class="mem" id="m${en.evStageId}"><b>${esc(variantOf(en))}</b>${statusFor(en).pill}${button([en])}</div>`).join('') : '');
    return `<div class="ver ${vb.cls}" id="v${vi}"><h3>${esc(verLabel(v))}</h3>`
      + `<p class="n">${v[0].weekOf ? `Week of the original game: «${esc(v[0].weekTitle || v[0].name)}»` : v[0].campaign ? 'VIP campaign of the original game' : `Period${en0.periods.length > 1 ? 's' : ''}: ${pers}`}${limits ? ` · in Special ${limits}` : ''}</p>`
      + `${vb.pill}<div class="why ${vb.cls}">${vb.why}</div>${days}${v.length === 1 ? button(v) : ''}</div>`;
  };
  const periodList = periods.filter((p) => f.list.some((en) => en.periods.includes(p.n)))
    .map((p) => `<li><b>${esc(p.name)}</b> <span class="n">${niceDay(p.from)} – ${niceDay(p.to)}</span></li>`).join('');
  const details = versions.map((v, vi) => `<details class="vq"${vi === 0 ? ' open' : ''}><summary>Quests · ${esc(verLabel(v))}</summary>`
    + v.map((en) => `${v.length > 1 ? `<h3>${esc(en.name)}</h3>` : ''}${quests(en)}`).join('') + '</details>').join('');
  const back = ctx.fromCatalog ? `<div class="bar"><a class="back" href="/web/special/catalog#q${Number(evStageId)}">BACK<span></span></a></div>` : '';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>${esc(f.title)}</title><style>${CSS}${DETAIL_CSS}</style></head><body${back ? ' class="hb"' : ''}>`
    + `<h1>${esc(f.title)}</h1><img class="banner" width="640" height="140" src="${special.imgPath(head.evStageId)}" alt="">`
    + `${best.pill}<div id="pinmsg" class="pinmsg"></div>`
    + `<h2>Version${versions.length > 1 ? 's' : ''}</h2>${versions.map(block).join('')}`
    + `<h2>Period${periodList.split('<li>').length > 2 ? 's' : ''}</h2><ul class="pl">${periodList}</ul>`
    + `${details}${back}<script>${PIN_JS}</script></body></html>`;
}

module.exports = { SHOW_SETS, catalogPage, detailPage, familiesOf, buildNames, typesOf, SPECIAL_ICON_KEYS, RANK_JS, khuxRank, MATCH_JS, khuxMatch };
