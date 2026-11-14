// Tables of the original notices (14-11, user: in the Details pages the original notices lost their tables, every cell on a
// line of its own). The private notice texts (notice_text.json) are the page text, so a table arrives as its cells one per
// line. The tables themselves come from the SQUARE ENIX BRIDGE notice pages saved by the ReLux Team (private, never in the
// repo): tmp\notice_tables\build.py -> reference\notice_tables\notice_tables.json {noticeId: [table]}, table = rows of cells
// {t: [lines], h: header, cs: colspan, rs: rowspan}.
// applyTables(body, tables) puts each table back where its cells are, as one line MARK + JSON (the notice builders keep the
// body a list of strings); catalog-pages.js noticeBlocks draws it. A table whose cells are not found in that order is left as
// the lines it was (counted as missed). Nothing of a sentence changes: the same cell texts, laid out as the original table.
'use strict';
const fs = require('fs');

const FILE = process.env.KHUX_NOTICE_TABLES || 'D:\\Progetto_Restauro_KH_UX\\reference\\notice_tables\\notice_tables.json';
const MARK = '\u2063table:';
const norm = (s) => String(s || '').replace(/[\u00a0\s]+/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').trim();

const isTable = (line) => typeof line === 'string' && line.startsWith(MARK);

let cache = null;
function load(file = FILE) {
  if (cache && cache.file === file) return cache.data;
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* absent on this machine: notices stay as lines */ }
  cache = { file, data };
  return data;
}

// the cell lines of a table, in reading order (empty cells give none)
const cellLines = (table) => table.flatMap((row) => row.flatMap((c) => (c.t || []).map(norm).filter(Boolean)));

// body: [lines]; tables: [table] -> {body, placed, missed}. Tables are placed in order, each after the previous one. The match
// runs on the text without its spaces (the notice texts and the saved pages space the same cells differently: «[ Maximum STR :
// 30050 ]» / «[Maximum STR: 30050]», a row on one line with tabs on some pages) and must start and end on whole lines.
const key = (x) => norm(x).replace(/\s+/g, '');
function applyTables(body, tables) {
  let out = (body || []).slice();
  let placed = 0, missed = 0, fromLine = 0;
  for (const t of tables || []) {
    const cells = cellLines(t);
    if (cells.length < 2) { missed++; continue; }
    const want = cells.map(key).join('');
    let text = '';
    const startAt = new Map(), endAt = new Map();
    out.forEach((l, li) => {
      if (li < fromLine) return;
      if (isTable(l)) { text += '\u0000'; return; } // a table already placed: a match never runs across it
      const k = key(l);
      if (!k) return;
      if (!startAt.has(text.length)) startAt.set(text.length, li);
      text += k; endAt.set(text.length, li);
    });
    let hit = null;
    for (let p = text.indexOf(want); p >= 0 && !hit; p = text.indexOf(want, p + 1)) {
      if (startAt.has(p) && endAt.has(p + want.length)) hit = [startAt.get(p), endAt.get(p + want.length)];
    }
    if (!hit) { missed++; continue; }
    out.splice(hit[0], hit[1] - hit[0] + 1, MARK + JSON.stringify(t));
    fromLine = hit[0] + 1; placed++;
  }
  return { body: out, placed, missed };
}

// The Medal table of the Shop notices when its saved page is missing (14-11, user: Gauge and Tier showed as loose numbers): the
// header «Medal / Special Attack / Gauge / Tier / Damage*», then per Medal its name lines, the Special Attack lines, the Gauge,
// the Tier, the «×» Damage, and optionally «Supernova» + its lines + its «×» Damage. Laid out as the original pages draw it
// (name over two rows, Supernova across three columns). Anything off this shape leaves the lines unchanged.
const HEAD = ['Medal', 'Special Attack', 'Gauge', 'Tier', 'Damage*'];
const NUM = /^\d{1,2}$/, DMG = /^[×x]\s*\d/;
function medalTables(body) {
  const out = body.slice();
  let placed = 0;
  for (let i = 0; i + HEAD.length <= out.length; i++) {
    if (!HEAD.every((h, k) => norm(out[i + k]) === h)) continue;
    const rows = [HEAD.map((h) => ({ t: [h], h: 1 }))];
    let j = i + HEAD.length;
    for (;;) {
      // name lines (up to the «[Target…» line), special attack lines, gauge, tier, damage
      let a = j; while (a < out.length && !/^\[Target/i.test(norm(out[a])) && a - j < 3) a++;
      let g = a; while (g < out.length && !NUM.test(norm(out[g])) && g - a < 4) g++;
      if (a === j || g === a || !NUM.test(norm(out[g])) || !NUM.test(norm(out[g + 1] || '')) || !DMG.test(norm(out[g + 2] || ''))) break;
      const lines = (x, y) => out.slice(x, y).map(norm);
      const r = [{ t: lines(j, a) }, { t: lines(a, g) }, { t: [norm(out[g])] }, { t: [norm(out[g + 1])] }, { t: [norm(out[g + 2])] }];
      j = g + 3;
      let sn = null;
      if (norm(out[j]) === 'Supernova') {
        let e = j + 1; while (e < out.length && !DMG.test(norm(out[e])) && e - j < 4) e++;
        if (e < out.length && DMG.test(norm(out[e]))) { sn = [{ t: lines(j, e), cs: 3 }, { t: [norm(out[e])] }]; j = e + 1; }
      }
      if (sn) { r[0].rs = 2; rows.push(r, sn); } else rows.push(r);
    }
    if (rows.length < 2) continue;
    out.splice(i, j - i, MARK + JSON.stringify(rows));
    placed++;
  }
  return { body: out, placed };
}

// the tables of one notice id, applied (the builders' entry point): the saved page's tables, then the Medal tables still as lines
function withTables(id, body, file) {
  const t = load(file)[String(id)];
  const r = t ? applyTables(body, t) : { body, placed: 0, missed: 0 };
  const m = medalTables(r.body);
  return { body: m.body, placed: r.placed + m.placed, missed: r.missed };
}

const tableOf = (line) => { try { return JSON.parse(line.slice(MARK.length)); } catch { return null; } };

module.exports = { MARK, FILE, load, applyTables, medalTables, withTables, isTable, tableOf, cellLines, norm };
