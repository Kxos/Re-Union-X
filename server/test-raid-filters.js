// Filter matrix of the Raid Catalog (raid-pages.js, Task 9), run by the page script itself in headless Edge, as
// test-special-filters.js: every period tab, TYPE, TIER and SHOW chip, some FIND queries and combinations, in the default year
// and in All years. What is really DISPLAYED (computed style) must match the filters, every matching row of the selected year
// must be displayed (and a year with matches must be selected when any row matches), the summary, tab counts, year chips and
// «Show N results» must agree, month labels without rows hidden, the empty-state message exactly when nothing shows. Then a
// keep and a remove through the page's own kxRow: the side bars, status lines, buttons and «Replaces» lines move.
// Fixture page and, when present, the real local index. Skipped without Edge (KHUX_EDGE overrides its path).
//   node server/test-raid-filters.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const pages = require('./raid-pages'), calendar = require('./raid-calendar'), special = require('./special');
const EDGE = process.env.KHUX_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const errors = [];
if (!fs.existsSync(EDGE)) { console.log('test-raid-filters: skipped (headless Edge not found)'); process.exit(0); }

/* eslint-disable no-var */
function probe() {
  window.addEventListener('load', function () {
    var out = { pass: 0, fail: 0, failed: [] };
    try {
      var $ = function (id) { return document.getElementById(id); };
      var A = function (el, a) { return el.getAttribute(a); };
      var SETS = { now: ['now', 'kept'] };
      var words = function (t) { return String(t).toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter(Boolean); };
      var prefix = function (q, name) { var ws = words(name); return words(q).every(function (w) { return ws.some(function (x) { return x.indexOf(w) === 0; }); }); };
      var shown = function (el) { while (el && el.nodeType === 1) { if (getComputedStyle(el).display === 'none') return false; el = el.parentNode; } return true; };
      var R = [].map.call(document.querySelectorAll('.row'), function (r) {
        return { el: r, p: A(r, 'data-periods'), t: A(r, 'data-type'), tr: A(r, 'data-tier').split(' '), st: A(r, 'data-show'), dn: A(r, 'data-done'), ns: (A(r, 'data-search') || '').split(' | '), y: A(r, 'data-y') };
      });
      var matches = function (r, f, anyPeriod) {
        if (!anyPeriod && f.p !== 'all' && r.p !== f.p) return false;
        if (f.type !== 'all' && r.t !== f.type) return false;
        if (f.tier !== 'all' && r.tr.indexOf(f.tier) < 0) return false;
        if (f.show !== 'all' && (SETS[f.show] || [f.show]).indexOf(r.st) < 0) return false;
        if (f.prog !== 'all' && (r.dn === '1') !== (f.prog === 'done')) return false;
        return !f.q || r.ns.some(function (n) { return prefix(f.q, n); });
      };
      var chip = function (g, v) { return document.querySelector('.opts[data-g="' + g + '"] [data-v="' + v + '"]'); };
      var check = function (name, f, year) {
        var d = document.querySelector('.yc[data-yr="' + A($('rows'), 'data-defy') + '"]'); if (d) d.click();
        $('fbtn').click(); $('freset').click();
        chip('type', f.type).click(); chip('tier', f.tier).click(); chip('show', f.show).click(); chip('prog', f.prog).click();
        $('fq').value = f.q; $('fq').oninput(); $('fok').click();
        document.querySelector('.tab[data-p="' + f.p + '"]').click();
        if (year === 'all') document.querySelector('.yc[data-yr="all"]').click();
        var err = [], sel = A(document.querySelector('.yc.on'), 'data-yr'), vis = 0, any = 0, inSel = 0;
        R.forEach(function (r) {
          var m = matches(r, f), inYear = sel === 'all' || r.y === sel, v = shown(r.el);
          if (m) { any++; if (inYear) inSel++; }
          if (v && !(m && inYear)) err.push('visible but not matching: ' + A(r.el, 'data-name'));
          if (!v && m && inYear) err.push('matching but hidden: ' + A(r.el, 'data-name'));
          if (v) vis++;
        });
        if (any && !inSel) err.push(any + ' rows match but the selected year ' + sel + ' shows none');
        var ms = /^(\d+) raids?/.exec($('sum').textContent);
        if (!ms || +ms[1] !== vis) err.push('summary «' + $('sum').textContent.slice(0, 40) + '» vs visible ' + vis);
        [].forEach.call(document.querySelectorAll('.tab'), function (t) {
          var p = A(t, 'data-p'), want = R.filter(function (r) { var g = {}; for (var k in f) g[k] = f[k]; g.p = p; return matches(r, g); }).length;
          if (+$('tc' + p).textContent !== want) err.push('tab ' + p + ' says ' + $('tc' + p).textContent + ', expected ' + want);
        });
        [].forEach.call(document.querySelectorAll('.yc'), function (yc) {
          var y = A(yc, 'data-yr'), n = R.filter(function (r) { return (y === 'all' || r.y === y) && matches(r, f); }).length;
          if (+yc.querySelector('.yn').textContent !== n) err.push('year chip ' + y + ' says ' + yc.querySelector('.yn').textContent + ', expected ' + n);
          if (y !== 'all' && !n && shown(yc)) err.push('year chip ' + y + ' shown without raids');
        });
        $('fbtn').click(); var fok = $('fok').textContent, nres = R.filter(function (r) { return matches(r, f); }).length; $('fx').click();
        if (fok !== 'Show ' + nres + ' result' + (nres === 1 ? '' : 's')) err.push('button «' + fok + '» vs ' + nres);
        [].forEach.call(document.querySelectorAll('.ml'), function (ml) {
          var has = false, e = ml.nextSibling; while (e && !(e.className && /(^| )ml( |$)/.test(e.className))) { if (e.nodeType === 1 && shown(e)) has = true; e = e.nextSibling; }
          if (shown(ml) !== has) err.push('month label ' + A(ml, 'data-m') + (has ? ' hidden over visible rows' : ' shown without rows'));
        });
        var none = shown($('none')) && $('none').textContent;
        if (!vis && !none) err.push('no empty-state message');
        if (vis && none) err.push('empty-state message with visible rows');
        if (none && f.prog !== 'all' && none.indexOf(f.prog === 'done' ? 'No completed raids' : 'No incomplete raids') !== 0) err.push('empty-state message without the progress: ' + none);
        if (f.prog !== 'all' && $('sum').textContent.indexOf(f.prog === 'done' ? 'Completed' : 'Incomplete') < 0) err.push('summary without the progress tag');
        if (f.q) R.forEach(function (r) { var mt = r.el.querySelector('.mt'); if (shown(r.el) && !/^Matches: /.test(mt.textContent)) err.push('no Matches line on ' + A(r.el, 'data-name')); });
        if (err.length) { out.fail++; out.failed.push({ name: name + ' [' + year + ']', err: err.slice(0, 4) }); } else out.pass++;
      };
      var base = { p: 'all', type: 'all', tier: 'all', show: 'all', prog: 'all', q: '' };
      var w = function (o) { var f = {}, k; for (k in base) f[k] = base[k]; for (k in o) f[k] = o[k]; return f; };
      var cases = [['no filters', w({})]];
      [].forEach.call(document.querySelectorAll('.tab'), function (t) { if (A(t, 'data-p') !== 'all') cases.push(['tab ' + A(t, 'data-p'), w({ p: A(t, 'data-p') })]); });
      ['type', 'tier', 'show', 'prog'].forEach(function (g) { [].forEach.call(document.querySelectorAll('.opts[data-g="' + g + '"] .o'), function (o) { var v = A(o, 'data-v'); if (v !== 'all') { var x = {}; x[g] = v; cases.push([g + ' ' + v, w(x)]); } }); });
      ['trick', 'blue tri', 'sora', 'mythril', 'zzzz'].forEach(function (q) { cases.push(['find «' + q + '»', w({ q: q })]); });
      cases.push(['show can + tier advanced', w({ show: 'can', tier: 'advanced' })]);
      cases.push(['type radiant + tab 3', w({ type: 'radiant', p: '3' })]);
      cases.push(['find «trick» + show now', w({ q: 'trick', show: 'now' })]);
      cases.push(['prog done + tier beginner', w({ prog: 'done', tier: 'beginner' })]);
      cases.push(['prog todo + show can + tab 3', w({ prog: 'todo', show: 'can', p: '3' })]);
      cases.push(['prog done + find «trick»', w({ prog: 'done', q: 'trick' })]);
      cases.push(['prog done + show removed', w({ prog: 'done', show: 'removed' })]);
      cases.forEach(function (c) { ['default', 'all'].forEach(function (y) { try { check(c[0], c[1], y); } catch (e) { out.fail++; out.failed.push({ name: c[0] + ' [' + y + ']', err: ['exception: ' + e.message] }); } }); });
      // keep / remove through the page script (the XHR answered 200): bars, status lines, buttons, «Replaces»
      var byId = function (id) { return document.getElementById('q' + id); };
      var can = R.filter(function (r) { return r.st === 'can'; }).map(function (r) { return A(r.el, 'data-eid'); });
      var kept = R.filter(function (r) { return r.st === 'kept'; }).map(function (r) { return A(r.el, 'data-eid'); });
      if (can.length && kept.length) {
        $('fbtn').click(); $('freset').click(); $('fok').click();
        document.querySelector('.tab[data-p="all"]').click(); document.querySelector('.yc[data-yr="all"]').click();
        var kerr = [], k0 = kept[0], c0 = can[0];
        window.kxRow(c0, true);
        if (A(byId(c0), 'data-show') !== 'kept' || !/(^| )pinned( |$)/.test(byId(c0).className) || !/Kept in the raid list/.test(byId(c0).querySelector('.s').textContent)) kerr.push('kept row not gold');
        if (A(byId(c0).querySelector('.pk'), 'data-on') !== '0') kerr.push('kept row without Remove');
        if (A(byId(k0), 'data-show') !== 'can' || !/(^| )can( |$)/.test(byId(k0).className) || A(byId(k0).querySelector('.pk'), 'data-on') !== '1') kerr.push('old kept row not back to can');
        var rp = byId(k0).querySelector('.rp');
        if (!rp || rp.textContent !== 'Replaces: ' + A(byId(c0), 'data-name') || !shown(rp)) kerr.push('Replaces line: ' + (rp && rp.textContent));
        window.kxRow(c0, false);
        if (A(byId(c0), 'data-show') !== 'can' || document.querySelectorAll('.row[data-show="kept"]').length) kerr.push('remove left a kept row');
        if (rp && shown(rp)) kerr.push('Replaces line shown with nothing kept');
        if (kerr.length) { out.fail++; out.failed.push({ name: 'keep / remove', err: kerr }); } else out.pass++;
      }
    } catch (e) { out.fail++; out.failed.push({ name: 'probe', err: [String(e && e.stack || e)] }); }
    var pre = document.createElement('pre'); pre.id = 'probe'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
  });
}
/* eslint-enable no-var */

function run(index, ctx, label) {
  const file = path.join(os.tmpdir(), `khux-raid-filters-${process.pid}-${label.replace(/\W+/g, '_')}.html`);
  fs.writeFileSync(file, pages.catalogPage(index, ctx).replace('</body>', `<script>(${probe.toString()})();</script></body>`));
  let r = null;
  try {
    const out = cp.execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--dump-dom', 'file:///' + file.replace(/\\/g, '/')],
      { encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    const m = /<pre id="probe">([^<]*)<\/pre>/.exec(out);
    r = m && JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  } catch (e) { errors.push(`${label}: Edge failed (${e.message.split('\n')[0]})`); }
  try { fs.unlinkSync(file); } catch { /* gone */ }
  if (!r) { errors.push(`${label}: no result`); return; }
  for (const f of r.failed) errors.push(`${label}: ${f.name}: ${f.err.join(' | ')}`);
  console.log(`  ${label}: ${r.pass} passed, ${r.fail} failed`);
}

const PERIODS = special.PERIODS;
const tier = (censusId, evStageId, start, end, t, boss, extra = {}) => ({ key: `${censusId}/${t}`, censusId, family: 'weekly', start, end, tier: t, boss, available: true,
  stageId: 980000 + evStageId, evStageId, level: 25, hp: 1, boards: ['Enhancement Boards'], sphereBoardIds: [3000000 + evStageId], ...extra });
const fx = { entries: [
  tier('A', 8071, '2018-09-03', '2018-09-09', 'single', 'Merry-Go-Rowdy', { family: 'radiant reward' }),
  tier('B', 8072, '2018-12-31', '2019-01-06', 'single', 'Trickmaster', { family: 'weekly (pre-series raid event)' }),
  tier('C', 8100, '2019-10-07', '2019-10-13', 'Beginner', 'Trickmaster'), tier('C', 8100, '2019-10-07', '2019-10-13', 'Advanced', 'Blue Trident Tail'),
  tier('D', 8101, '2019-10-14', '2019-10-20', 'Beginner', 'Trickmaster'), tier('D', 8101, '2019-10-14', '2019-10-20', 'Epic', 'Darkside'),
  tier('E', 8102, '2019-11-04', '2019-11-10', 'Advanced', 'Behemoth', { available: false }),
  tier('F', 8150, '2020-06-01', '2020-06-07', 'Legendary', 'Darkside'), tier('G', 8180, '2020-12-07', '2020-12-13', 'Epic', 'Red Trident Tail'),
] };
const ctxFor = (index, week, kept) => ({ ...week, current: new Set(calendar.weekRows(index, week).map((r) => r.censusId)), kept, periods: PERIODS,
  unlockQuestOf: () => 900, stageDone: (sid) => sid % 3 !== 1, boardItems: (id) => (id % 2 ? ['Sora & Moogle B'] : ['Mythril Shard']), imgVersion: 1 });
run(fx, ctxFor(fx, { shopFrom: '2019-10-17', shopTo: '2019-10-23' }, 'A'), 'fixture');
let real = null; try { real = JSON.parse(fs.readFileSync(path.join(__dirname, 'game_data', 'raids.json'), 'utf8')); } catch { /* no local index */ }
if (real) {
  const week = { shopFrom: '2019-10-17', shopTo: '2019-10-23' };
  const past = calendar.catalogRows(real).find((r) => r.available && r.end < week.shopFrom);
  run(real, ctxFor(real, week, past && past.censusId), 'real index');
}
if (errors.length) { console.log('test-raid-filters: FAIL\n' + errors.slice(0, 40).join('\n')); process.exit(1); }
console.log('test-raid-filters: OK');
