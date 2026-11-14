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

// body: [lines]; tables: [table] -> {body, placed, missed}. Tables are placed in order, each after the previous one. A line may
// hold several cells separated by tabs (some pages put a row on one line): the match runs on the tab-split cells and must start
// and end on whole lines.
function applyTables(body, tables) {
  let out = (body || []).slice();
  let placed = 0, missed = 0, fromLine = 0;
  for (const t of tables || []) {
    const seq = cellLines(t);
    if (seq.length < 2) { missed++; continue; }
    const tok = [];
    out.forEach((l, li) => { if (li < fromLine || isTable(l)) return; const parts = String(l).split(/\t+/).map(norm).filter(Boolean);
      parts.forEach((x, k) => tok.push({ x, li, first: k === 0, last: k === parts.length - 1 })); });
    let hit = null;
    for (let i = 0; i + seq.length <= tok.length && !hit; i++) {
      if (!tok[i].first) continue;
      let k = 0;
      while (k < seq.length && tok[i + k].x === seq[k]) k++;
      if (k === seq.length && tok[i + k - 1].last) hit = [tok[i].li, tok[i + k - 1].li];
    }
    if (!hit) { missed++; continue; }
    out.splice(hit[0], hit[1] - hit[0] + 1, MARK + JSON.stringify(t));
    fromLine = hit[0] + 1; placed++;
  }
  return { body: out, placed, missed };
}

// the tables of one notice id, applied (the builders' entry point)
function withTables(id, body, file) {
  const t = load(file)[String(id)];
  return t ? applyTables(body, t) : { body, placed: 0, missed: 0 };
}

const tableOf = (line) => { try { return JSON.parse(line.slice(MARK.length)); } catch { return null; } };

module.exports = { MARK, FILE, load, applyTables, withTables, isTable, tableOf, cellLines, norm };
