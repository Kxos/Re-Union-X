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
const SPECIAL_ICON_KEYS = ['weekday', 'daily', 'vip', 'mog', 'skill', 'camp', 'lock', 'removed', 'pin', 'replaced', 'later', 'now', 'medal', 'avatar', 'jewel', 'material'];
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
  + '.hide{display:none}'
  // every row: the same 5px side bar (colour by status, like the Shop's .b.now / .b.pinned) and the same padding, so
  // banners and text line up; banner at half size (640x140 -> 320x70), the text wraps under it on a narrow phone
  + '.q{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:10px 0 10px 10px;border-left:5px solid #5d8aa6;border-bottom:1px solid #2f5d78}'
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
  + '.o.st-now.on{background:#2e9e3e;border-color:#7be08a}.o.st-kept.on{background:#b8860b;border-color:#ffe08a}.o.st-can.on{background:#1a6fa8;border-color:#62a7ff}'
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
const SHOW_OPTS = [['all', 'All quests'], ['can', 'Can be kept now', 'pin'], ['now', 'In Special now', 'now'], ['kept', 'Kept', 'pin'],
  ['replaced', 'Replaced', 'replaced'], ['removed', 'Not restored', 'removed'], ['later', 'Later in the Story', 'later']];
// REWARDS chips (round 7): reward types of the drops and objective rewards of an entry
const REWARD_OPTS = [['all', 'All'], ['medal', 'Medals', 'medal'], ['avatar', 'Avatar parts', 'avatar'], ['jewel', 'Jewels', 'jewel'], ['material', 'Materials', 'material']];
const REWARD_OF_TYPE = { 3: 'medal', 20: 'avatar', 2: 'jewel', 5: 'material' };
const optLabel = ([, l, k]) => (k ? icon(k) : '') + esc(l);
function typesOf(en) {
  const t = [];
  if (en.campaign) t.push('camp');
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
      return r ? (r.submissionRewardType || []).map((t, i) => name(t, r.submissionItemId[i])).filter(Boolean) : [];
    },
    stage: (sid) => {
      const r = stageRow(sid);
      if (!r) return null;
      const count = Math.min(3, r.validSubmission ?? (r.submissionName || []).filter(Boolean).length);
      return { objectives: Array.from({ length: count }, (_, i) => {
        const t = r.submissionRewardType?.[i], nm = t ? name(t, r.submissionItemId?.[i]) : '';
        return { text: objText(r, i), reward: nm ? `${nm} x${r.submissionItemNum?.[i] ?? 1}` : '' };
      }) };
    },
  };
}

// Status of an entry for the catalogue row and the details page. show: SHOW chip value; cls: row class (side bar);
// pill: status pill HTML; button: 1 Keep, 0 Remove, null none; why: one line of explanation (details page).
// pills that the page script also writes after a pin / unpin: [class, icon, text]
const PILLS = { kept: ['pinned', 'pin', 'Kept in Special'], can: ['can', 'pin', 'Past quest: can be kept in Special'] };
const pillInner = ([, k, text]) => `${k ? icon(k) : ''}${text}`;
const pill = (c, k, text) => `<span class="s s-${c}">${pillInner([c, k, text])}</span>`;
function statusOf(en, ctx, { byKey, pinned, current }) {
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
    return { show: 'removed', cls: 'off', pill: pill('off', 'removed', 'Not restored: its materials have no use in this version'), button: null,
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
    return { show: 'other', cls: 'other', pill: pill('other', '', `Listed on ${esc(en.days.join(', '))} only`), button: null,
      why: "Daily Challenge: Cid lists only today's variant, as in the original game." };
  }
  if (!current.has(en)) {
    // current period, but not listed this Shop week: a campaign of another week, or an entry outside its from / to
    return { show: 'other', cls: 'other', pill: pill('other', '', en.campaign ? `Week of ${niceDay(en.campaign.start)}` : 'This period, not this week'), button: null,
      why: 'It belongs to the current period but is not listed in Special this week.' };
  }
  if (en.vip && !ctx.vip) {
    return { show: 'now', cls: 'locked', pill: pill('locked', 'lock', 'VIP only (locked)'), button: null,
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
    return { show: 'now', cls: 'locked', pill: pill('locked', 'lock', `Locked today · opens on ${esc(daysText(en))}`), button: null,
      why: `It is in Special with a padlock today: it opens on ${esc(daysText(en))}, or every day with the VIP benefit of the Weekly Missions.` };
  }
  return { show: 'now', cls: 'now', pill: pill('now', 'now', 'Open in Special now'), button: null, why: 'It is in Special now.' };
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
const daysText = (en) => (en.days === 'all' ? 'Every day' : (en.days || []).join(', '));
const detailHref = (id) => `/web/special/detail/${id}?from=catalog`;

// ES5, no external script. Rows: one read of the attributes at start; filtering toggles " hide" on the row, and on
// the period section when none of its rows is visible. A row is one entry or a group of entries sharing a banner
// (data-eid / data-show: space-separated, one per member; data-n: members). khuxRow (called by PIN_JS after a pin /
// unpin) moves the statuses: the new kept entry gold, the old one back to «can be kept» (a group: its chips).
const JS = `(function(){
var PN=__PN__,LAB={type:__TYPE__,show:__SHOW__,reward:__REWARD__},PILL=__PILL__,CHIP_ICON=__CHIP_ICON__;
__RANK__
__MATCH__
function $(id){return document.getElementById(id);}
function attr(el,a){return el&&el.getAttribute?el.getAttribute(a):null;}
var rows=[].map.call(document.querySelectorAll('.q'),function(el){return {el:el,ids:(attr(el,'data-eid')||'').split(' '),f:attr(el,'data-first')==='1',p:attr(el,'data-period'),t:' '+attr(el,'data-type')+' ',ss:(attr(el,'data-show')||'').split(' '),rw:' '+(attr(el,'data-reward')||'')+' ',n:+attr(el,'data-n')||1,ns:(attr(el,'data-search')||'').split(' | '),mt:el.querySelector('.mt'),nf:+attr(el,'data-nf'),q:attr(el,'data-search')||''};});
var secs=[].map.call(document.querySelectorAll('.sec'),function(el){return {el:el,p:attr(el,'data-p')};});
var cur={p:'all',type:'all',show:'all',reward:'all',q:''},dr=null;
function copy(s){return {p:s.p,type:s.type,show:s.show,reward:s.reward,q:s.q};}
// a row per entry (or group) and period: the All tab uses the first rows only (r.f), so nothing is counted twice there
function match(r,s,anyPeriod){
if(!anyPeriod){if(s.p==='all'&&!r.f)return false;if(s.p!=='all'&&r.p!==s.p)return false;}
if(s.type!=='all'&&r.t.indexOf(' '+s.type+' ')<0)return false;
if(s.show!=='all'&&(' '+r.ss.join(' ')+' ').indexOf(' '+s.show+' ')<0)return false;
if(s.reward!=='all'&&r.rw.indexOf(' '+s.reward+' ')<0)return false;
return !s.q||hits(r,s.q,1).length>0;}
// item names of the row matching the query (one name at a time, khuxMatch), at most max
function hits(r,q,max){var o=[],i;for(i=0;i<r.ns.length&&o.length<max;i++)if(khuxMatch(q,r.ns[i]))o.push(r.ns[i]);return o;}
function count(s){var n=0;for(var i=0;i<rows.length;i++)if(match(rows[i],s))n++;return n;}
function nf(s){return (s.type!=='all'?1:0)+(s.show!=='all'?1:0)+(s.reward!=='all'?1:0)+(s.q?1:0);}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function plural(n){return n+' quest'+(n===1?'':'s');}
function tag(g,l){return '<span class="tag">'+l+'<a href="#" data-x="'+g+'" aria-label="Remove">×</a></span>';}
function render(){
var c={all:0},n=0,m=0,i,r,on,sh={};
for(i=0;i<rows.length;i++){r=rows[i];if(match(r,cur,true)){if(r.f)c.all++;c[r.p]=(c[r.p]||0)+1;}
on=match(r,cur);if(on){n++;m+=cur.p==='all'?r.nf:r.n;sh[r.p]=1;}r.el.className=r.el.className.replace(/ hide/g,'')+(on?'':' hide');}
for(i=0;i<secs.length;i++)secs[i].el.className='sec'+(sh[secs[i].p]?'':' hide');
[].forEach.call(document.querySelectorAll('.tab'),function(t){var p=attr(t,'data-p');t.className='tab'+(p===cur.p?' on':'');$('tc'+p).textContent=c[p]||0;});
var k=nf(cur),h='<span class="n1">'+plural(n)+'</span>';
if(m!==n)h+=' <small class="n">('+m+' with every day and variant)</small>';
if(cur.p!=='all')h+=' from <b>'+esc(PN[cur.p])+'</b>';
if(!k)h+=cur.p==='all'?' · all periods, no filters':' · no filters';
else{h+=cur.p==='all'?' match:':' match your filters:';
if(cur.type!=='all')h+=' '+tag('type',LAB.type[cur.type]);
if(cur.show!=='all')h+=' '+tag('show',LAB.show[cur.show]);
if(cur.reward!=='all')h+=' '+tag('reward',LAB.reward[cur.reward]);
if(cur.q)h+=' '+tag('q','Find: &quot;'+esc(cur.q)+'&quot;');
h+=' <a href="#" class="clear" data-x="all">Clear all</a>';}
$('sum').innerHTML=h;$('fdot').textContent=k?k:'';
// why a row matched (only while searching), and a message when nothing does
for(i=0;i<rows.length;i++){r=rows[i];if(!r.mt)continue;var w=cur.q&&r.el.className.indexOf(' hide')<0?hits(r,cur.q,3):[];r.mt.textContent=w.length?'Matches: '+w.join(', '):'';r.mt.style.display=w.length?'':'none';}
var none=$('none');none.textContent=n?'':(cur.q?'No quests match "'+cur.q+'"':'No quests match your filters');none.style.display=n?'none':'';}
// one member of a row changes status: a single row gets the new bar and pill, a group the new chip colour
function paint(r,cls,html){r.el.className='q '+cls+(/ hide/.test(r.el.className)?' hide':'');var s=r.el.querySelector('.s');if(s){s.className='s s-'+cls;s.innerHTML=html;}}
// a group: the chip of the member, then the row bar and pill of the best member again (khuxRank, as on the server)
function regroup(r){var b=-1,bc='',bh='',j,ch;for(j=0;j<r.ids.length;j++){ch=r.el.querySelector('.ch[data-eid="'+r.ids[j]+'"]');if(!ch)continue;
var c=attr(ch,'data-cls'),k=khuxRank(r.ss[j],c);if(b<0||k<b){b=k;bc=c;bh=PILL[r.ss[j]]?PILL[r.ss[j]].html:attr(ch,'data-pill');}}
if(b>=0)paint(r,bc,bh);}
function setMember(r,j,show){var p=PILL[show];r.ss[j]=show;r.el.setAttribute('data-show',r.ss.join(' '));
if(r.ids.length===1){paint(r,p.cls,p.html);return;}
var ch=r.el.querySelector('.ch[data-eid="'+r.ids[j]+'"]');if(ch){ch.className='ch c-'+p.cls;ch.setAttribute('data-cls',p.cls);var ic=ch.querySelector('.ic');if(ic&&CHIP_ICON[show])ic.src='/web/special/icon/'+CHIP_ICON[show]+'.png';}
regroup(r);}
window.khuxRow=function(id,on){var name='',i,j,r;for(i=0;i<rows.length;i++){r=rows[i];for(j=0;j<r.ids.length;j++){if(r.ss[j]==='kept')setMember(r,j,'can');
if(r.ids[j]===id){setMember(r,j,on?'kept':'can');if(on){var t=r.ids.length===1?r.el.querySelector('.nm'):r.el.querySelector('.ch[data-eid="'+id+'"]');name=t?(attr(t,'title')||t.textContent):'';}}}}
for(i=0;i<rows.length;i++){r=rows[i];var pk=r.el.querySelector('.pk');if(!pk)continue;var st=r.ss[r.ids.indexOf(attr(pk,'data-id'))],x=r.el.querySelector('.rp');
if(!x&&st==='can'&&name){x=document.createElement('div');x.className='rp';pk.parentNode.parentNode.insertBefore(x,pk.parentNode);}
if(x){x.textContent='Replaces\\u003a '+name;x.style.display=name&&st==='can'?'':'none';}}
render();};
function sync(){
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){var g=attr(box,'data-g');[].forEach.call(box.children,function(o){o.className=o.className.replace(/ on/g,'')+(attr(o,'data-v')===dr[g]?' on':'');});});
$('fok').textContent='Show '+plural(count(dr));}
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
$('tabs').onclick=function(e){var t=e.target;while(t&&!attr(t,'data-p'))t=t.parentNode;if(!t)return;cur.p=attr(t,'data-p');render();};
render();
var h=location.hash&&document.getElementById(location.hash.slice(1));if(h&&h.scrollIntoView)h.scrollIntoView();
})();`;

// group rows (round 7, user 31-10): entries of one period section with the same banner art (the seven Daily Cid days,
// VIP! Materials and Materials 2...) take one row. Best member status first: it gives the row its bar and pill.
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

function catalogPage(index, ctx = {}) {
  const periods = ctx.periods || special.PERIODS, cur = ctx.period;
  const names = { drop: () => [], objective: () => [], dropTypes: () => [], objectiveTypes: () => [], ...(ctx.names || {}) };
  const data = pageData(index, ctx), { entries } = data;
  const per = (en) => Math.min(...en.periods);
  // searchable text of an entry: its name, its quests' names, the drop items and the objective rewards (lower case)
  const stagesOf = (en) => (en.stages && en.stages.length ? en.stages : [{ dropRewardIds: en.dropRewardIds }]);
  const search = (en) => {
    const parts = [en.name];
    for (const s of stagesOf(en)) {
      if (s.quest) parts.push(s.quest);
      for (const rid of s.dropRewardIds || []) parts.push(...names.drop(rid));
    }
    for (const sid of en.stageIds || []) parts.push(...names.objective(sid));
    const seen = new Set();
    return parts.map((x) => String(x).replace(/\s+/g, ' ').replace(/ \| /g, ' / ').trim())
      .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).join(' | ');
  };
  // REWARDS chips: reward types of the drop rows and of the objective rewards (3 medal, 20 avatar part, 2 Jewels, 5 material)
  const rewards = (en) => {
    const types = [...stagesOf(en).flatMap((s) => (s.dropRewardIds || []).flatMap((rid) => names.dropTypes(rid))),
      ...(en.stageIds || []).flatMap((sid) => names.objectiveTypes(sid))];
    return REWARD_OPTS.slice(1).filter(([v]) => types.some((t) => REWARD_OF_TYPE[t] === v)).map(([v]) => v).join(' ');
  };
  const statusMemo = new Map();
  const statusFor = (en) => { if (!statusMemo.has(en)) statusMemo.set(en, statusOf(en, ctx, data)); return statusMemo.get(en); };
  // one row per entry (or group) and period (bench 31-10: the current period lists every quest it has); the first one of
  // an entry (its first period) carries id="q<id>" (hash of the details BACK) and data-first, the All tab shows only those
  const row = (en, p) => {
    const id = en.evStageId, href = detailHref(id), first = p === per(en), st = statusFor(en);
    const button = st.button === null ? '' : keepButton(id, st.button, ' onclick="return khuxClick(this)"');
    return `<div class="q ${st.cls}" id="q${id}${first ? '' : `-p${p}`}" data-eid="${id}"${first ? ' data-first="1"' : ''} data-period="${p}" data-type="${typesOf(en)}" data-show="${st.show}" data-search="${esc(search(en))}" data-reward="${rewards(en)}" data-n="1" data-nf="${first ? 1 : 0}">`
      + `<a class="im" href="${href}"><img loading="lazy" width="320" height="70" src="${special.imgPath(id)}" alt=""></a>`
      + `<div class="info"><a class="nm" href="${href}">${esc(en.name)}</a><div class="d">${esc(daysText(en))}${en.vip ? ' · <span class="vip">VIP only</span>' : ''}</div>`
      + `${st.pill}${st.rp || ''}${button ? `<div>${button}</div>` : ''}<div class="mt"></div></div></div>
`;
  };
  const groupRow = (list, p) => {
    const sts = list.map(statusFor), best = sts.reduce((a, b) => (khuxRank(b.show, b.cls) < khuxRank(a.show, a.cls) ? b : a));
    const head = list[0], href = detailHref(head.evStageId), anyFirst = list.some((en) => per(en) === p);
    const uniq = (arr) => [...new Set(arr.join(' ').split(' ').filter(Boolean))].join(' ');
    const chips = list.map((en, j) => {
      const st = sts[j], k = st.cls === 'locked' ? 'lock' : st.cls === 'vipnow' ? 'vip' : CHIP_ICON[st.show];
      return `<a class="ch c-${st.cls}"${per(en) === p ? ` id="q${en.evStageId}"` : ''} data-eid="${en.evStageId}" data-cls="${st.cls}" data-pill="${esc(st.pill.replace(/^<span[^>]*>|<\/span>$/g, ''))}" href="${detailHref(en.evStageId)}" title="${esc(en.name)}">${k ? icon(k) : ''}${esc(variantOf(en))}</a>`;
    }).join('');
    const keepable = list.filter((en, j) => sts[j].button !== null);
    const button = keepable.length === 1 ? `${statusFor(keepable[0]).rp || ''}<div>${keepButton(keepable[0].evStageId, statusFor(keepable[0]).button, ' onclick="return khuxClick(this)"')}</div>` : '';
    const days = list.every((en) => Array.isArray(en.days) && en.days.length === 1);
    return `<div class="q ${best.cls}" id="g${head.evStageId}-p${p}" data-eid="${list.map((en) => en.evStageId).join(' ')}"${anyFirst ? ' data-first="1"' : ''} data-period="${p}" data-type="${uniq(list.map(typesOf))}" data-show="${sts.map((s) => s.show).join(' ')}" data-search="${esc(list.map(search).join(' | '))}" data-reward="${uniq(list.map(rewards))}" data-n="${list.length}" data-nf="${list.filter((en) => per(en) === p).length}">`
      + `<a class="im" href="${href}"><img loading="lazy" width="320" height="70" src="${special.imgPath(head.evStageId)}" alt=""></a>`
      + `<div class="info"><span class="nm">${esc(familyTitle(head.name))}</span><div class="d">${list.length} ${days ? 'days' : 'variants'}${list.every((en) => en.vip) ? ' · <span class="vip">VIP only</span>' : ''}</div>`
      + `${best.pill}<div class="chs">${chips}</div>${button}<div class="mt"></div></div></div>
`;
  };
  // the rows of a section: entries with the same (non-empty) banner art together, in the order of their first entry
  const rowsOf = (p) => {
    const groups = [], byBanner = new Map();
    for (const en of entries.filter((x) => x.periods.includes(p))) {
      const g = en.banner ? byBanner.get(en.banner) : null;
      if (g) g.push(en); else { const ng = [en]; groups.push(ng); if (en.banner) byBanner.set(en.banner, ng); }
    }
    return groups;
  };
  const secRows = new Map(periods.map((p) => [p.n, rowsOf(p.n)]));
  const sections = periods.map((p) => {
    const rows = secRows.get(p.n).map((g) => (g.length === 1 ? row(g[0], p.n) : groupRow(g, p.n))).join('');
    return `<div class="sec" data-p="${p.n}"><h2 class="per" id="p${p.n}">${esc(p.name)}</h2>`
      + `<div class="n">${niceDay(p.from)} – ${niceDay(p.to)}</div>${rows || '<p class="n">No quests.</p>'}</div>`;
  }).join('');
  const tab = (p, name, n, now) => `<button type="button" class="tab${p === 'all' ? ' on' : ''}" data-p="${p}"><b>${esc(name)}</b>${now ? '<span class="now">Now</span>' : ''}<span class="c" id="tc${p}">${n}</span></button>`;
  const opts = (list, cls = () => '') => list.map((o, i) => `<button type="button" class="o${cls(o[0])}${i ? '' : ' on'}" data-v="${o[0]}">${optLabel(o)}</button>`).join('');
  // All: the rows that hold the first period of one of their entries
  const n = [...secRows].reduce((t, [pn, gs]) => t + gs.filter((g) => g.some((en) => per(en) === pn)).length, 0), nq = `${n} quest${n === 1 ? '' : 's'}`;
  const pillJs = (k) => ({ cls: PILLS[k][0], html: pillInner(PILLS[k]) });
  const labels = (list) => JSON.stringify(Object.fromEntries(list.slice(1).map((o) => [o[0], optLabel(o)])));
  const js = JS.replace('__PN__', JSON.stringify(Object.fromEntries(periods.map((p) => [p.n, p.name]))))
    .replace('__TYPE__', labels(TYPE_OPTS)).replace('__SHOW__', labels(SHOW_OPTS)).replace('__REWARD__', labels(REWARD_OPTS))
    .replace('__PILL__', JSON.stringify({ kept: pillJs('kept'), can: pillJs('can') }))
    .replace('__CHIP_ICON__', JSON.stringify(CHIP_ICON)).replace('__RANK__', () => RANK_JS).replace('__MATCH__', () => MATCH_JS);
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>Special Catalog</title><style>${CSS}</style></head><body>`
    + '<div class="hdr"><h1>Special Catalog</h1><button type="button" class="fbtn" id="fbtn">⚙ Filters<span class="dot" id="fdot"></span></button></div>'
    + '<p class="n">Quests from past periods can be kept in Special. Only one can be kept at a time. Tap a banner, or a day, for its details.</p>'
    + `<div class="tabs" id="tabs">${tab('all', 'All', n)}${periods.map((p) => tab(p.n, p.name, secRows.get(p.n).length, p.n === cur)).join('')}</div><div class="tabline"></div>`
    + `<div class="sum" id="sum"><span class="n1">${nq}</span> · all periods, no filters</div><div id="none" class="none" style="display:none"></div>${sections}`
    + '<div class="ov" id="dim"></div><div class="sheet" id="sheet" role="dialog" aria-label="Filters">'
    + '<div class="shd"><b>Filters</b><button type="button" class="x" id="fx" aria-label="Close">✕</button></div>'
    + '<h4>FIND</h4><div class="search"><input type="search" id="fq" placeholder="Quest or reward name" autocomplete="off"></div>'
    + '<div class="hint">Matches the start of words in quest names and in the items they give (e.g. Key Art, Mythril, Cid).</div>'
    + `<h4>TYPE</h4><div class="opts" data-g="type">${opts(TYPE_OPTS)}</div>`
    + `<h4>REWARDS</h4><div class="opts" data-g="reward">${opts(REWARD_OPTS)}</div>`
    + `<h4>SHOW</h4><div class="opts" data-g="show">${opts(SHOW_OPTS, (v) => (v === 'all' ? '' : ` st-${v}`))}</div>`
    + `<div class="foot"><a href="#" class="reset" id="freset">Reset filters</a><button type="button" class="ok" id="fok">Show ${nq}</button></div></div>`
    + `<div id="pinmsg" class="pinmsg"></div><script>${PIN_JS}</script><script>${js}</script></body></html>`;
}

// Details page of one entry (GET /web/special/detail/<evStageId>, from the catalogue row): banner, days, periods, status
// and Keep button, then every quest with AP, level, target, objectives and their rewards, drops. Modelled on the Shop's
// detailPage (gacha.js): «■» headings, white-bordered tables, BACK bar at the bottom. null = unknown id (404).
const DETAIL_CSS = 'table{width:100%;margin:6px 0 10px;border-collapse:collapse;table-layout:fixed;font-size:15px;line-height:1.4}'
  + 'th,td{border:1px solid #fff;padding:4px 8px;text-align:left;vertical-align:middle;overflow-wrap:break-word}th{background:#365e76;font-weight:normal}'
  + '.kv th{width:32%}.ob td.r{width:38%;color:#ffcd4a}.banner{width:100%;max-width:640px;margin:6px 0}'
  + 'ul.pl{margin:4px 0 8px;padding-left:22px}ul.pl li{margin:2px 0}.dr{color:#ffcd4a}'
  + '.why{border-left:4px solid #8aa3b3;background:#0a4466;padding:6px 12px;margin:8px 0 4px;font-size:15px;line-height:1.6}'
  + '.why.now,.why.vipnow{border-color:#2e9e3e}.why.pinned{border-color:#b8860b}.why.can{border-color:#1a6fa8}.why.locked,.why.off{border-color:#7d8894}'
  + 'h3{color:#ffcd4a;font-size:17px;margin:14px 0 2px}'
  + '.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:linear-gradient(rgba(2,24,40,0),rgba(2,24,40,.92) 35%)}'
  + '.back{display:inline-block;padding:7px 26px 8px;border-radius:10px;border:2px solid #9fd4ff;color:#fff;text-decoration:none;'
  + 'font:italic bold 20px sans-serif;letter-spacing:1px;background:linear-gradient(#5aa8ff,#2556c8 55%,#1b3f9c);'
  + 'box-shadow:0 2px 0 #0b2a66,inset 0 1px 0 rgba(255,255,255,.5);text-shadow:0 1px 2px #0a2a6a}'
  + '.back span{display:inline-block;margin-left:12px;width:14px;height:9px;border:3px solid #fff;border-left:0;border-radius:0 8px 8px 0;vertical-align:1px;position:relative}.back span:after{content:"";position:absolute;left:-7px;bottom:-8px;border-style:solid;border-width:6px 9px 6px 0;border-color:transparent #fff transparent transparent}'
  + 'body.hb{padding-bottom:90px}.pinmsg{position:static}';
function detailPage(index, evStageId, ctx = {}) {
  const data = pageData(index, ctx);
  const en = data.entries.find((x) => x.evStageId === Number(evStageId));
  if (!en) return null;
  const periods = ctx.periods || special.PERIODS;
  const names = { drop: () => [], stage: () => null, ...(ctx.names || {}) };
  const id = en.evStageId, st = statusOf(en, ctx, data);
  const pers = periods.filter((p) => en.periods.includes(p.n))
    .map((p) => `<li><b>${esc(p.name)}</b> <span class="n">${niceDay(p.from)} – ${niceDay(p.to)}</span></li>`).join('');
  const limits = [en.from ? `from ${niceDay(en.from)}` : '', en.to ? `until ${niceDay(en.to)}` : ''].filter(Boolean).join(', ');
  const camp = en.campaign ? `<p>Campaign week: ${niceDay(en.campaign.start)} – ${niceDay(en.campaign.end)}.</p>` : '';
  const button = st.button === null ? '' : `<div class="pin">${keepButton(id, st.button, ' id="pinbtn" onclick="return khuxPin(this,document.getElementById(\'pinmsg\'),function(){document.getElementById(\'pinbtn\').style.display=\'none\';})"')}</div>`;
  const stages = en.stages && en.stages.length ? en.stages : (en.stageIds || []).map((stageId) => ({ stageId, dropRewardIds: en.dropRewardIds }));
  const quests = stages.map((s, i) => {
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
  const back = ctx.fromCatalog ? `<div class="bar"><a class="back" href="/web/special/catalog#q${id}">BACK<span></span></a></div>` : '';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>${esc(en.name)}</title><style>${CSS}${DETAIL_CSS}</style></head><body${back ? ' class="hb"' : ''}>`
    + `<h1>${esc(en.name)}</h1><img class="banner" width="640" height="140" src="${special.imgPath(id)}" alt="">`
    + `<p>${esc(daysText(en))}${en.vip ? ' · <span class="vip">VIP only</span>' : ''}</p>`
    + `${st.pill}<div class="why ${st.cls}">${st.why}</div>${st.rp || ''}${button}<div id="pinmsg" class="pinmsg"></div>`
    + `<h2>Period${en.periods.length > 1 ? 's' : ''}</h2><ul class="pl">${pers}</ul>${limits ? `<p class="n">In Special ${limits}.</p>` : ''}${camp}`
    + `${quests}${back}<script>${PIN_JS}</script></body></html>`;
}

module.exports = { catalogPage, detailPage, buildNames, typesOf, SPECIAL_ICON_KEYS, RANK_JS, khuxRank, MATCH_JS, khuxMatch };
