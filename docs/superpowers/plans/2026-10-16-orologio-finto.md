# Fake clock (twin months) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans, one task at a time. Steps use checkboxes (`- [ ]`).

**Goal:** the server time flows like the real time within safe dates (twin months 5/2016-5/2021),
so Daily, Weekly and Limited show the true times and really reset, even after a restart.

**Architecture:** a pure module `server/clock.js` (twins, period indices, deadlines, revision).
The server computes periods and deadlines on the real time and converts to fake time only what it sends to the
client (twin offset fixed at login). The served master receives on the fly the deadlines of
Weekly/Limited and a computed revision; rewards not claimed at the end of the period go into the Presents.

**Technologies:** Node 24 (no new dependency), tests `node server/test-*.js`, LDPlayer bench
with the scripts in `tools/ldplayer/session/`.

**Spec:** `docs/superpowers/specs/2026-10-16-orologio-finto-design.md` (approved on 16-10).

## Global constraints

- Fake date always between 1/5/2016 and 28/6/2021 23:59:59 UTC; never beyond 28/6/2021.
- Boundaries: day from 08:00 real UTC, week from Monday 08:00 real UTC, month from day 1 08:00 real UTC.
- The twin offset depends only on the real month of «now - 8 hours»; it is fixed at `/khux/login`.
- Master revision = `BASE * 100000 + weeks + months elapsed since 1/1/2026` (BASE = `KHUX_REVISION`, 117 today).
- The computed revision only in the master fields; the resource ones (`versionRes`, `versionResLow`, `darkVersionRes`) stay fixed.
- The server saves only real instants (ms); the fake time only in the responses.
- Rewards completed and not claimed at the end of the period (Daily, Weekly, Limited) -> Presents, only once.
- Login: without a new master no slower than today (+1 s, average of 5); server work for `/system/master` < 50 ms with the cache.
- Project rules: commit + push at every verified step (`git -c safe.directory=*`, `git commit -F <file>`,
  `git pull --rebase` before the push, messages in Italian with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
  files in UTF-8 without BOM; never taps on the bench with the game closed (`AppAlive`); press SKIP on dialogues.

## Points to watch in review

1. Server restart with the game open: it must resume the same offset (`player.clockOffset`) and not deliver twice into the Presents (Task 2, Task 3).
2. Login between 00:00 and 08:00 of day 1: offset and revision of the previous month, together (Task 1, Task 5).
3. Real February without a twin (e.g. 2028, leap year starting on a Tuesday): exact countdowns, no shifted reset (Task 1).
4. Old save (fake 2021 strings): the migration must not lose valid gifts nor put dates «in the future» (Task 6).
5. Week change with the game open: claiming the old campaign does not pay, the reward arrives in the Presents (Task 3).

---

### Task 1: module `server/clock.js`

**Files:**
- Create: `server/clock.js`
- Create: `server/test-clock.js`

**Interfaces produced** (all in real UTC ms, no state):
- `twinOffset(realMs) -> number` (ms to add to the real time)
- `fake(realMs, offset) -> number`, `fakeString(realMs, offset) -> 'AAAA-MM-GG hh:mm:ss'`
- `dayIndex(realMs)`, `weekIndex(realMs)`, `monthIndex(realMs) -> integer`
- `dayEnd(realMs)`, `weekEnd(realMs)`, `monthEnd(realMs) -> real ms of the next deadline`
- `weekStartOf(weekIndex)`, `monthEndOf(monthIndex) -> real ms`
- `masterRevision(base, realMs) -> integer`
- constants `SAFE_FROM`, `SAFE_TO`, `DAY`

- [ ] **Step 1: write the test** `server/test-clock.js`

```js
// Test of server/clock.js (fake clock, twin months): node server/test-clock.js
'use strict';
const c = require('./clock');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const U = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);
const len = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// twins: all the months 2026-2035, mid-month at 15:00
for (let y = 2026; y <= 2035; y++) {
  for (let m = 1; m <= 12; m++) {
    const r = U(y, m, 15, 15);
    const f = new Date(c.fake(r, c.twinOffset(r)));
    check(f.getTime() >= c.SAFE_FROM && f.getTime() <= c.SAFE_TO, `${y}-${m}: fuori intervallo ${f.toISOString()}`);
    check(f.getUTCHours() === 15, `${y}-${m}: ora ${f.getUTCHours()}`);
    const exact = !(m === 2 && (len(y, 2) === 29 || [0, 2, 6].includes(new Date(Date.UTC(y, 1, 1)).getUTCDay())));
    if (exact) {
      check(f.getUTCDate() === 15, `${y}-${m}: giorno ${f.getUTCDate()}`);
      check(f.getUTCDay() === new Date(r).getUTCDay(), `${y}-${m}: giorno della settimana`);
    }
  }
}
// example from the spec: Friday 16/10/2026 15:00 -> 16/10/2020 15:00
const ex = U(2026, 10, 16, 15);
check(c.fakeString(ex, c.twinOffset(ex)) === '2020-10-16 15:00:00', `esempio: ${c.fakeString(ex, c.twinOffset(ex))}`);
// month boundary at 08:00: between 00:00 and 08:00 of day 1 the previous month still applies
check(c.twinOffset(U(2026, 11, 1, 7, 59)) === c.twinOffset(U(2026, 10, 20)), 'giorno 1 07:59: scostamento del mese prima');
check(c.twinOffset(U(2026, 11, 1, 8, 0)) === c.twinOffset(U(2026, 11, 20)), 'giorno 1 08:00: scostamento nuovo');
check(c.monthIndex(U(2026, 11, 1, 7, 59)) === c.monthIndex(U(2026, 10, 31)), 'monthIndex al confine');
// deadlines
check(c.dayEnd(U(2026, 10, 16, 15)) === U(2026, 10, 17, 8), 'dayEnd');
check(c.dayEnd(U(2026, 10, 16, 7)) === U(2026, 10, 16, 8), 'dayEnd prima delle 8');
check(c.weekEnd(U(2026, 10, 16, 15)) === U(2026, 10, 19, 8), 'weekEnd (lunedi 19/10 08:00)');
check(c.weekEnd(U(2026, 10, 19, 8)) === U(2026, 10, 26, 8), 'weekEnd esattamente al confine');
check(c.monthEnd(U(2026, 10, 16, 15)) === U(2026, 11, 1, 8), 'monthEnd');
check(c.monthEnd(U(2026, 11, 1, 7)) === U(2026, 11, 1, 8), 'monthEnd prima delle 8 del giorno 1');
check(c.weekStartOf(c.weekIndex(U(2026, 10, 16))) === U(2026, 10, 12, 8), 'weekStartOf');
check(c.monthEndOf(c.monthIndex(U(2026, 10, 16))) === U(2026, 11, 1, 8), 'monthEndOf');
// exact countdowns even in the fallback February (2028: leap year, starts on a Tuesday)
for (const r of [U(2028, 2, 10, 12), U(2028, 2, 29, 12)]) {
  const o = c.twinOffset(r);
  check(c.fake(c.weekEnd(r), o) - c.fake(r, o) === c.weekEnd(r) - r, `febbraio 2028: conto settimanale ${new Date(r).toISOString()}`);
  check(c.fake(c.monthEnd(r), o) - c.fake(r, o) === c.monthEnd(r) - r, `febbraio 2028: conto mensile`);
}
// monotonic within a month
const o10 = c.twinOffset(U(2026, 10, 2));
check(c.fake(U(2026, 10, 31, 23), o10) > c.fake(U(2026, 10, 2), o10), 'monotona');
// safety limit
check(c.fake(U(2026, 10, 1), Date.UTC(2021, 5, 30) - U(2026, 10, 1)) === c.SAFE_TO, 'tetto al 28/6/2021');
// revision: changes only at the deadlines, and together with the offset at the monthly boundary
const rv = (r) => c.masterRevision(117, r);
check(rv(U(2026, 10, 13, 9)) === rv(U(2026, 10, 19, 7, 59)), 'revisione stabile nella settimana');
check(rv(U(2026, 10, 19, 8)) === rv(U(2026, 10, 19, 7, 59)) + 1, 'revisione +1 al lunedi');
check(rv(U(2026, 11, 1, 8)) > rv(U(2026, 11, 1, 7, 59)), 'revisione al confine mensile');
check(rv(U(2026, 1, 1)) >= 117 * 100000 && rv(U(2035, 12, 31)) < 118 * 100000, 'revisione nel blocco della BASE');
check(rv(U(2035, 12, 31)) < 2 ** 31, 'revisione < 2^31');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: clock.js');
```

- [ ] **Step 2: run it and watch it fail**

Run: `node server/test-clock.js`
Expected: error `Cannot find module './clock'`.

- [ ] **Step 3: write `server/clock.js`**

```js
// Server fake clock (docs/superpowers/specs/2026-10-16-orologio-finto-design.md).
// Pure functions on the real time (UTC ms). The fake date is the real date in its «twin month»
// between 5/2016 and 5/2021 (same weekday of day 1, same length; fallback for
// Februaries without a twin: the most recent 28-day February). The offset is chosen from the
// month of «now - 8 hours», i.e. with the same boundary as the monthly deadline (day 1 08:00 UTC).
'use strict';
const DAY = 86400000;
const H8 = 8 * 3600000;
const SAFE_FROM = Date.UTC(2016, 4, 1);
const SAFE_TO = Date.UTC(2021, 5, 28, 23, 59, 59);
const DAY0 = Date.UTC(2018, 0, 1, 8); // Monday 1/1/2018 08:00 UTC: origin of days and weeks
const REV0 = Date.UTC(2026, 0, 1, 8);

const info = (y, m) => ({ y, m, first: Date.UTC(y, m, 1), len: new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
  wd: new Date(Date.UTC(y, m, 1)).getUTCDay() });
const CANDIDATES = [];
for (let y = 2016; y <= 2021; y++) {
  for (let m = 0; m < 12; m++) if (!(y === 2016 && m < 4) && !(y === 2021 && m > 4)) CANDIDATES.push(info(y, m));
}
const twinCache = new Map();
function twinOf(y, m) {
  const key = y * 12 + m;
  if (!twinCache.has(key)) {
    const r = info(y, m);
    let c = CANDIDATES.filter((x) => x.len === r.len && x.wd === r.wd);
    if (!c.length) c = CANDIDATES.filter((x) => x.len === 28);
    twinCache.set(key, c[c.length - 1]);
  }
  return twinCache.get(key);
}
function monthKey(realMs) {
  const d = new Date(realMs - H8);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
}
function twinOffset(realMs) {
  const { y, m } = monthKey(realMs);
  return twinOf(y, m).first - Date.UTC(y, m, 1);
}
const fake = (realMs, offset) => Math.min(Math.max(realMs + offset, SAFE_FROM), SAFE_TO);
const fakeString = (realMs, offset) => new Date(fake(realMs, offset)).toISOString().slice(0, 19).replace('T', ' ');
const dayIndex = (r) => Math.floor((r - DAY0) / DAY);
const weekIndex = (r) => Math.floor((r - DAY0) / (7 * DAY));
const monthIndex = (r) => { const { y, m } = monthKey(r); return y * 12 + m; };
const dayEnd = (r) => DAY0 + (dayIndex(r) + 1) * DAY;
const weekEnd = (r) => DAY0 + (weekIndex(r) + 1) * 7 * DAY;
const weekStartOf = (w) => DAY0 + w * 7 * DAY;
const monthEndOf = (mi) => Date.UTC(Math.floor(mi / 12), (mi % 12) + 1, 1) + H8;
const monthEnd = (r) => monthEndOf(monthIndex(r));
// master revision: BASE (ours, bumped at every change of the masters) for a large step, plus
// the weekly and monthly deadlines elapsed since 1/1/2026
function masterRevision(base, realMs) {
  return base * 100000 + (weekIndex(realMs) - weekIndex(REV0)) + (monthIndex(realMs) - monthIndex(REV0));
}

module.exports = { DAY, SAFE_FROM, SAFE_TO, twinOffset, fake, fakeString, dayIndex, weekIndex, monthIndex,
  dayEnd, weekEnd, monthEnd, weekStartOf, monthEndOf, masterRevision };
```

- [ ] **Step 4: run the test**

Run: `node server/test-clock.js`
Expected: `OK: clock.js`. If a month in 2026-2035 has no exact twin and is not a February, the test names it: the table must be fixed (not the test).

- [ ] **Step 5: commit**

```bash
git -c safe.directory=* add server/clock.js server/test-clock.js
# message in a UTF-8 file: "Orologio finto: modulo clock.js (mesi gemelli) e prova" + Co-Authored-By
git -c safe.directory=* commit -F ../../tmp/msg_clock1.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 2: server time from the new clock, offset fixed at login

**Files:**
- Modify: `server/server.js` (lines ~240-256 `SERVER_TIME_START`/`serverTime`/`serverTimeAt`; `respondKhuxLogin` ~647; every `Date.now()` that measures game time: `apState` ~908, `player.apTime = Date.now()` ~1349 and ~1418)
- Create: `server/test-clock-server.js`

**Interfaces:**
- Consumes: `clock.twinOffset`, `clock.fakeString`, `clock.fake`.
- Produces (in `server.js`, exported in `module.exports._test`): `realNow() -> ms`, `clockOffset() -> ms`,
  `outTime(v, fallback) -> string` (number = real instant -> fake date; string = left as it is; missing = `fallback`).

- [ ] **Step 1: test** `server/test-clock-server.js`

```js
// Server time from the fake clock (server.js + clock.js): node server/test-clock-server.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-clocksrv-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_SERVER_TIME;
const realNow = Date.now;
const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-16T15:00:00Z');
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };

call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
call(t.respondKhuxLogin);
check(t.serverTime() === '2020-10-16 15:00:00', `serverTime ${t.serverTime()}`);
// the session crosses the month: the offset stays the one from the login
at('2026-11-02T10:00:00Z');
check(t.serverTime() === '2020-11-02 10:00:00', `dopo il cambio mese senza login: ${t.serverTime()}`);
// restart with the game open: the saved offset is resumed
check(JSON.parse(fs.readFileSync(SAVE, 'utf8')).clockOffset === t.clockOffset(), 'clockOffset salvato');
// new login in November: twin of November 2026 (starts on a Sunday, 30 days -> November 2020)
call(t.respondKhuxLogin);
check(t.serverTime().startsWith('2020-11-02'), `login di novembre: ${t.serverTime()}`);
check(t.outTime(Date.parse('2026-11-02T10:00:00Z')) === '2020-11-02 10:00:00', 'outTime numero');
check(t.outTime('2021-05-15 12:00:00') === '2021-05-15 12:00:00', 'outTime stringa vecchia');
check(t.outTime(undefined, 'x') === 'x', 'outTime assente');

Date.now = realNow;
try { fs.unlinkSync(SAVE); } catch { /* removed */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: ora del server');
```

- [ ] **Step 2: run it**: `node server/test-clock-server.js` -> fails (`t.respondKhuxLogin` or `t.serverTime` not exported, or serverTime `2021-05-15 ...`).

- [ ] **Step 3: implement in `server/server.js`**

Replace the block `SERVER_TIME_START` ... `serverTimeAt` with:

```js
// Server time (docs/superpowers/specs/2026-10-16-orologio-finto-design.md): real date in its
// twin month (clock.js), with the offset fixed at /khux/login (player.clockOffset) because the
// client advances on its own the time received at login. KHUX_SERVER_TIME (tests): fixed fake date
// at server start, as before.
const clock = require('./clock');
const STARTED_AT = Date.now();
const REVISION = Number(process.env.KHUX_REVISION || 0); // BASE of the master revision
const realNow = () => Date.now();
function clockOffset() {
  if (process.env.KHUX_SERVER_TIME) return Date.parse(process.env.KHUX_SERVER_TIME) - STARTED_AT;
  return Number.isFinite(player.clockOffset) ? player.clockOffset : clock.twinOffset(realNow());
}
function serverTime() {
  return serverTimeAt(realNow());
}
// The server time corresponding to a real instant (ms). Format read.
function serverTimeAt(realMs) {
  return clock.fakeString(realMs, clockOffset());
}
// saved real instant (number) -> fake date; strings of old saves left as they were
const outTime = (v, fallback) => (typeof v === 'number' ? serverTimeAt(v) : v || fallback);
```

(`player` is declared further down with `const`: `clockOffset()` reads it only when it is called, after loading.)

In `respondKhuxLogin`, before `send`:

```js
  // new login: the client takes the time from here, the twin of the current month applies until the next one
  player.clockOffset = clock.twinOffset(realNow());
  savePlayer();
```

Replace in `server.js` the `Date.now()` calls that measure game time with `realNow()`
(`grep -n "Date.now()" server/server.js`: keep `Date.now()` only in `STARTED_AT` and in the log timings).
Add to `module.exports._test`: `serverTime, serverTimeAt, realNow, clockOffset, outTime, respondKhuxLogin`.

- [ ] **Step 4: tests**: `node server/test-clock-server.js` -> `OK: ora del server`; then
`node server/test-limited.js`, `node server/test-keyblade-unlock.js`, `node server/test-keyblades.js`,
`node server/test-medal-enhance.js`, `node server/test-medal-guilt.js` -> all OK.

- [ ] **Step 5: commit** («Orologio finto: ora del server dai mesi gemelli, scostamento al login» = "Fake clock: server time from the twin months, offset at login").

---

### Task 3: quest periods in real time and closing of the periods into the Presents

**Files:**
- Modify: `server/server.js` (quest block ~1650-1800: `missionPeriod`, `missionActive`, `missionState`,
  `weeklyLux`, `missionCount`, `missionsData`, `respondMissionReceive`, `limitedPeriod`, `limitedActive`,
  `beginnerLimitTime`; handler ~2860)
- Modify: `server/test-limited.js` (uses `realNow` instead of `Date.now` if needed)
- Create: `server/test-mission-settle.js`

**Interfaces:**
- Consumes: `clock.dayIndex/weekIndex/monthIndex`, `realNow()`, `addPresent(type, id, num, comment)` (existing).
- Produces: `settleClock(realMs = realNow())` (exported in `_test`), `missionPeriod(row, realMs)` with real indices.

- [ ] **Step 1: test** `server/test-mission-settle.js`

```js
// Closing of the quest periods (server.js settleClock): node server/test-mission-settle.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-settle-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.env.KHUX_SAVE = SAVE; process.env.KHUX_PET = '1';
delete process.env.KHUX_SERVER_TIME;
const realNowFn = Date.now; const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-16T15:00:00Z');
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
t.player.medals = t.player.medals || [];
quiet(() => t.settleClock());

const daily = t.masterRows('mission').find((r) => r.missionType === 2 && t.MISSION_COUNTER[r.conditionId] === 'quest');
const list1 = quiet(() => t.missionsData());
check(list1.some((m) => m.id === daily.id), 'Daily attiva');
quiet(() => t.missionCount('quest', daily.targetNum[0]));
check(quiet(() => t.missionsData()).find((m) => m.id === daily.id).status === 1, 'Daily completata');
const presentsBefore = (t.player.presents || []).length;
// the next day at 09:00: period closed, reward in the Presents once
at('2026-10-17T09:00:00Z');
quiet(() => t.settleClock());
quiet(() => t.settleClock());
const added = (t.player.presents || []).slice(presentsBefore);
check(added.length >= 1 && added.some((p) => p.comment === 'Daily Mission reward'), `Presents: ${JSON.stringify(added)}`);
check(quiet(() => t.missionsData()).find((m) => m.id === daily.id).status === 0, 'Daily ripartita');
// claiming the old campaign: no reward
const stone = t.player.freeStone || 0;
call(t.respondMissionReceive, { receiveMissionIds: [daily.id] });
check((t.player.freeStone || 0) === stone, 'riscossione dopo la scadenza pagata');
// restart: no second delivery
const n = (t.player.presents || []).length;
quiet(() => t.settleClock());
check((t.player.presents || []).length === n, 'consegna doppia');
// 08:00 boundary: at 07:59 on the 18th the day is still the 17th
at('2026-10-18T07:59:00Z');
quiet(() => t.missionCount('quest', 1));
at('2026-10-18T08:00:00Z');
check(quiet(() => t.missionsData()).find((m) => m.id === daily.id).numUpper === 0, 'azzeramento alle 08:00');

Date.now = realNowFn;
try { fs.unlinkSync(SAVE); } catch { /* removed */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: chiusura dei periodi');
```

- [ ] **Step 2: run it**: `node server/test-mission-settle.js` -> fails (`settleClock` does not exist).

- [ ] **Step 3: implement**

In `missionPeriod`, `missionActive`, `missionState`, `missionCount`, `missionsData`, `respondMissionReceive`,
`weeklyLux`: the parameter becomes the real time (`const nowMs = realNow();` instead of
`Date.parse(serverTime().replace(' ', 'T') + 'Z')`). New `missionPeriod`:

```js
// period indices on the REAL TIME (clock.js): day and week from 08:00 UTC, month from day 1 08:00
function missionPeriod(row, realMs) {
  if (row.missionType === 4 && LIMITED_GROUP.has(row.id)) {
    return LIMITED_GROUP.get(row.id).kind === 'monthly' ? clock.monthIndex(realMs) : clock.weekIndex(realMs);
  }
  if (row.missionType === 2) return clock.dayIndex(realMs);
  if (row.missionType === 3) return clock.weekIndex(realMs);
  return 0;
}
```

In `missionActive(row, realMs)`: the master dates are fake, they are compared with the fake time:
`const fakeMs = clock.fake(realMs, clockOffset());` instead of `nowMs` in the comparisons with `startDate`/`endDate`;
Beginner: `realMs < player.beginnerSince + BEGINNER_DAYS * 86400000` (see Task 6 for `beginnerSince` in ms).

`limitedPeriod(kind, realMs = realNow())` uses `clock.monthIndex`/`clock.weekIndex` (same boundaries as the
quests; `LIMITED_WEEK0` is removed). `weeklyLux(n)`: `period = clock.weekIndex(realNow())`.

New function, after `respondMissionReceive`:

```js
// Closing of the periods (spec 3.6): at every request, if the real day/week/month has advanced
// since the last closing, the rewards of the completed and unclaimed quests of the finished period go into the
// Presents, once (s.received). First time: only the instant is recorded, no delivery.
const SETTLE_COMMENT = { 2: 'Daily Mission reward', 3: 'Weekly Mission reward', 4: 'Limited Mission reward' };
function settleClock(realMs = realNow()) {
  const cur = { day: clock.dayIndex(realMs), week: clock.weekIndex(realMs), month: clock.monthIndex(realMs) };
  const st = player.clockSettled;
  if (st && st.day === cur.day && st.week === cur.week && st.month === cur.month) return;
  if (st) {
    for (const row of masterRows('mission')) {
      const s = (player.missions || {})[row.id];
      if (!s || s.received || !SETTLE_COMMENT[row.missionType] || s.period === missionPeriod(row, realMs)) continue;
      if (s.count >= (row.targetNum?.[0] || 1) || (MISSION_DERIVED[row.conditionId] && missionProgress(row, s) >= (row.targetNum?.[0] || 1))) {
        s.received = true;
        addPresent(row.rewardType, row.itemId, row.itemNum, SETTLE_COMMENT[row.missionType]);
        console.log(`[missioni] ${row.id} non riscossa a fine periodo: premio nei Presents`);
      }
    }
  }
  player.clockSettled = cur;
  savePlayer();
}
```

In the handler, right after `logRequest(entry);`:

```js
      // closing of the quest periods before any other processing (spec 3.6)
      if (player.created) settleClock();
```

Export in `_test`: `settleClock, MISSION_COUNTER`.

- [ ] **Step 4: tests**: `node server/test-mission-settle.js` -> OK; `node server/test-limited.js` -> OK
(the test moves `Date.now`, which is now also the server's real time: no change expected; if it fails
on the «return of the campaign», check that `missionPeriod` uses `realMs`).

- [ ] **Step 5: commit** («Missioni: periodi in ora reale e premi non riscossi nei Presents» = "Quests: periods in real time and unclaimed rewards in the Presents").

---

### Task 4: Weekly in two alternating series A/B

**Files:**
- Create: `server/make-weekly-series.js`
- Modify: `server/tables/mission.json`, `server/master_data/mission.json` (generated)
- Modify: `server/server.js` (`missionActive`)
- Modify: `server/test-mission-settle.js` (Weekly case)

**Interfaces:**
- Produces: rows 3011-3020 copies of 3001-3010; `weeklySeries(row) -> 0 | 1` (0 for 3001-3010, 1 for 3011-3020).

- [ ] **Step 1: test** — add at the bottom of `server/test-mission-settle.js`, before the summary:

```js
// Weekly A/B: only one series active per week, alternating
at('2026-10-14T12:00:00Z');
const wk = quiet(() => t.missionsData()).map((m) => m.id).filter((id) => id >= 3001 && id <= 3020);
at('2026-10-21T12:00:00Z');
const wk2 = quiet(() => t.missionsData()).map((m) => m.id).filter((id) => id >= 3001 && id <= 3020);
check(wk.length === 10 && wk2.length === 10, `Weekly attive ${wk.length}/${wk2.length}`);
check(!wk.some((id) => wk2.includes(id)), 'serie A/B non alternate');
```

- [ ] **Step 2: run**: fails (20 Weekly active or no row 3011).

- [ ] **Step 3: generator** `server/make-weekly-series.js`

```js
#!/usr/bin/env node
// Weekly in two alternating series (fake clock spec 3.3): 3001-3010 even weeks, 3011-3020
// odd. Each one receives in the served master the deadline of ITS next week, so that at the week
// change with the game open the new quests already have the right countdown.
//   node server/make-weekly-series.js   (then bump KHUX_REVISION)
'use strict';
const fs = require('fs');
const path = require('path');
for (const file of [path.join(__dirname, 'tables', 'mission.json'), path.join(__dirname, 'master_data', 'mission.json')]) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => !(r.id >= 3011 && r.id <= 3020));
  const a = rows.filter((r) => r.id >= 3001 && r.id <= 3010);
  const b = a.map((r) => ({ ...r, id: r.id + 10 }));
  fs.writeFileSync(file, JSON.stringify([...rows, ...b].sort((x, y) => x.id - y.id), null, 1) + '\n');
  console.log(`${file}: ${a.length} Weekly A + ${b.length} B`);
}
```

In `server.js`, `missionActive`, before `return true`:

```js
  // Weekly A/B (make-weekly-series.js): 3001-3010 even weeks, 3011-3020 odd (real time)
  if (row.missionType === 3) return clock.weekIndex(realMs) % 2 === (row.id >= 3011 ? 1 : 0);
```

- [ ] **Step 4**: `node server/make-weekly-series.js`, then `node server/test-mission-settle.js` and
`node server/test-limited.js` -> OK.

- [ ] **Step 5: commit** («Weekly in due serie alternate A/B» = "Weekly in two alternating series A/B").

---

### Task 5: master with computed revision, on-the-fly deadlines and cache

**Files:**
- Modify: `server/server.js` (`respondStatus` ~280: `versionDat`...; `respondResourceSize` ~372;
  `masterBody` ~397; `masterTables`/`respondMaster`/`respondMasterFile` ~455-500)
- Create: `server/test-master-clock.js`

**Interfaces:**
- Consumes: `clock.masterRevision`, `clock.weekEnd`, `clock.weekStartOf`, `clock.monthEndOf`, `clock.weekIndex`,
  `clock.monthIndex`, `clock.twinOffset`, `clock.fakeString`, `LIMITED_ROTATION`, `LIMITED_GROUP`.
- Produces: `masterRevisionNow() -> integer`, `servedMasterRows(name, realMs) -> rows` (exported in `_test` with
  `masterBody`, `respondMaster`, `respondResourceSize`).

- [ ] **Step 1: test** `server/test-master-clock.js`

```js
// Master served with the fake clock: node server/test-master-clock.js
'use strict';
process.env.KHUX_REVISION = '117';
delete process.env.KHUX_SERVER_TIME;
const realNowFn = Date.now; const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-16T15:00:00Z');
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };

const rev = t.masterRevisionNow();
check(rev > 117 * 100000, `revisione ${rev}`);
const m = call(t.respondMaster);
check(m.master.revision === rev && m.mission.revision === rev, 'revisione nel master');
const rows = t.servedMasterRows('mission', Date.now());
const end = (id) => rows.find((r) => r.id === id).endDate;
// week of 12/10/2026 (even or odd index): one Weekly series expires Monday 19/10, the other on 26/10
const a = end(3001), b = end(3011);
check(new Set([a, b]).size === 2 && [a, b].includes('2020-10-19 08:00:00') && [a, b].includes('2020-10-26 08:00:00'), `Weekly ${a} / ${b}`);
// Limited: the active monthly one expires on 1/11 08:00 fake
const activeMonthly = t.LIMITED_ROTATION.monthly.find((ids) => ids.every((id) => t.limitedActive(id)));
check(end(activeMonthly[0]) === '2020-11-01 08:00:00', `Limited mensile ${end(activeMonthly[0])}`);
// same content for the same revision, and served in less than 50 ms from the cache
const b1 = t.masterBody('mission'); const t0 = process.hrtime.bigint();
call(t.respondMaster);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
check(t.masterBody('mission').equals(b1), 'contenuto cambiato senza cambio di revisione');
check(ms < 50, `respondMaster ${ms.toFixed(1)} ms con la cache`);
// resources: versionRes/darkVersionRes do not follow the master revision
const st = call(t.respondStatus);
check(st.darkVersionRes === 117 && st.versionDat === rev, `status ${st.versionDat} ${st.darkVersionRes}`);
// the week after: new revision, new deadlines
at('2026-10-19T09:00:00Z');
check(t.masterRevisionNow() === rev + 1, 'revisione +1 al lunedi');

Date.now = realNowFn;
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: master con l\'orologio');
```

- [ ] **Step 2: run**: fails (`masterRevisionNow` does not exist).

- [ ] **Step 3: implement**

```js
// computed master revision (spec 3.3): BASE = KHUX_REVISION, plus the elapsed deadlines
const masterRevisionNow = () => clock.masterRevision(REVISION, realNow());

// served rows: for «mission» the deadlines of the Weekly A/B and of the Limited groups (next
// occurrence), in fake time with the offset of the revision's month
function servedMasterRows(name, realMs) {
  const rows = masterRows(name);
  if (name !== 'mission') return rows;
  const off = clock.twinOffset(realMs);
  const w = clock.weekIndex(realMs), mi = clock.monthIndex(realMs);
  const nextWeek = (i, n) => { let k = w; while (k % n !== i) k++; return clock.weekStartOf(k + 1); };
  const nextMonth = (i, n) => { let k = mi; while (k % n !== i) k++; return clock.monthEndOf(k); };
  return rows.map((r) => {
    let endMs = null;
    if (r.missionType === 3) endMs = nextWeek(r.id >= 3011 ? 1 : 0, 2);
    const g = LIMITED_GROUP.get(r.id);
    if (r.missionType === 4 && g) {
      endMs = g.kind === 'monthly' ? nextMonth(g.index, LIMITED_ROTATION.monthly.length) : nextWeek(g.index, LIMITED_ROTATION.weekly.length);
    }
    return endMs === null ? r : { ...r, endDate: clock.fakeString(endMs, off) };
  });
}
```

`masterBody(name)` with a cache per revision and file date:

```js
const masterBodyCache = new Map(); // name -> {key, body, md5}
function masterBody(name) {
  const file = path.join(MASTER_DIR, name + '.json');
  if (!/^[A-Za-z0-9]+$/.test(name) || !fs.existsSync(file)) return null;
  const st = fs.statSync(file);
  const key = `${masterRevisionNow()}:${st.mtimeMs}:${st.size}`;
  const hit = masterBodyCache.get(name);
  if (hit && hit.key === key) return hit.body;
  const json = Buffer.from(JSON.stringify(servedMasterRows(name, realNow())), 'utf8');
  const c = crypto.createCipheriv('aes-256-cbc', Buffer.from(masterKey(name), 'utf8'), Buffer.alloc(16));
  const body = Buffer.from(Buffer.concat([c.update(json), c.final()]).toString('base64'), 'utf8');
  masterBodyCache.set(name, { key, body, md5: crypto.createHash('md5').update(body).digest('hex') });
  return body;
}
```

(Note: today `masterBody` encrypts the file as it is; `JSON.stringify(masterRows(name))` produces the same
JSON content without spaces: before proceeding verify on the bench that the client accepts compact tables —
`server/tables/*.json` already writes them indented and the client reads JSON, so expected OK.)

`masterTables()`: memoize the validation result per name and `mtimeMs`/`size` (same idea, map
`masterValidCache`). `respondMaster`: `revision: masterRevisionNow()` in `master` and in every table; md5 from
`masterBodyCache.get(name).md5` after `masterBody(name)`. `respondResourceSize`:
`Number(req?.masterRevision) >= masterRevisionNow()`. `respondStatus`: `versionDat`, `commonVersionDat`,
`darkVersionDat` = `masterRevisionNow()`; `darkVersionRes` = `REVISION` (fixed).

Export in `_test`: `masterRevisionNow, servedMasterRows, masterBody, respondMaster, respondResourceSize, respondStatus, LIMITED_ROTATION, limitedActive`.

- [ ] **Step 4: tests**: `node server/test-master-clock.js` -> OK; all the other tests `server/test-*.js` -> OK.

- [ ] **Step 5: commit** («Master: revisione calcolata, scadenze di Weekly e Limited al volo, cache» = "Master: computed revision, Weekly and Limited deadlines on the fly, cache").

---

### Task 6: saved times in real ms and migration of the saves

**Files:**
- Modify: `server/server.js` (presents ~1880-1935: `seedTestPresents`, `addPresent`, `livePresents`,
  `userPresentData`; `beginnerLimitTime` ~1740; writes of `getDatetime` ~1226, ~1522, ~2203, ~2360, ~2594;
  reads ~1532, ~2043, ~2078, ~2623; save loading ~729)
- Modify: `server/pet.js` (training ~196-330, parts ~139-160, trait ~293), `server/grant-all-medals.js` (~34)
- Create: `server/test-clock-migration.js`

**Interfaces:**
- Consumes: `realNow()`, `outTime(v, fallback)`, `clock.monthIndex`.
- Produces: `migrateClock()` (in `_test`), `ctx.realNow`, `ctx.outTime`, `ctx.monthIndex` for `pet.js`.

- [ ] **Step 1: test** `server/test-clock-migration.js`

```js
// Migration of the saves to the fake clock: node server/test-clock-migration.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-clockmig-${process.pid}.json`);
fs.writeFileSync(SAVE, JSON.stringify({
  created: true, name: 'Vecchio', medals: [
    { userMedalId: 101, medalId: 1, level: 1, getDatetime: '2021-05-15 12:00:00' },
    { userMedalId: 102, medalId: 1, level: 1, getDatetime: '2021-05-16 12:00:00' }],
  presents: [{ userPresentId: 1, resourceType: 2, resourceId: 0, number: 10, limitDatetime: '2021-06-10 00:00:00', comment: 'x', created: '2021-05-15 12:00:00' }],
  beginnerSince: '2021-05-15 12:00:00', missions: { 2001: { period: 5, count: 1, received: false } },
  pet: { training: { total: 3, monthly: 2, month: '2021-05', readyAt: Date.parse('2021-05-16T08:00:00Z'), medals: [] } },
}));
process.env.KHUX_SAVE = SAVE; process.env.KHUX_PET = '1';
delete process.env.KHUX_SERVER_TIME;
const realNowFn = Date.now; const now = Date.parse('2026-10-16T15:00:00Z'); Date.now = () => now;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const p = t.player;
check(p.clockVersion === 1, 'migrazione non fatta');
check(p.medals[1].getDatetime === now && p.medals[0].getDatetime === now - 86400000, `getDatetime ${p.medals.map((m) => m.getDatetime)}`);
check(p.presents[0].limitDatetime === now + 29 * 86400000, 'regalo: +29 giorni');
check(p.beginnerSince === now, 'beginnerSince');
check(Object.keys(p.missions || {}).length === 0, 'contatori dei periodi non azzerati');
check(p.pet.training.readyAt === 0 && p.pet.training.month === t.clockMonthIndex(now), 'training');
check(t.outTime(p.medals[1].getDatetime) === t.serverTime(), 'uscita in ora finta');
// second time: no change
const before = JSON.stringify(p); quiet(() => t.migrateClock());
check(JSON.stringify(p) === before, 'migrazione ripetuta');
Date.now = realNowFn;
try { fs.unlinkSync(SAVE); } catch { /* removed */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: migrazione');
```

- [ ] **Step 2: run**: fails (`clockVersion` missing).

- [ ] **Step 3: implement**

Migration (called right after loading the save, before `grantMissingKeyblades`):

```js
// Migration to the fake clock (spec 3.7): saved times in real ms. The old fake strings
// (time that restarted from 15/5/2021) have no real instant: getDatetime shifted as a block with the
// most recent = now (the order is kept), gifts +29 days, Beginner from now, training ready,
// period counters reset (they change scale).
function migrateClock() {
  if (player.clockVersion === 1) return;
  const now = realNow();
  const holders = [
    ...(player.medals || []), ...(player.keyblades || []), ...Object.values(player.sphere || {}),
    ...Object.values(player.medalSkills || {}), ...Object.values(player.medalTraits || {}).flat(),
  ].filter((o) => o && typeof o.getDatetime === 'string');
  const ms = (s) => Date.parse(s.replace(' ', 'T') + 'Z');
  const max = Math.max(0, ...holders.map((o) => ms(o.getDatetime)).filter(Number.isFinite));
  for (const o of holders) { const v = ms(o.getDatetime); o.getDatetime = Number.isFinite(v) ? now - (max - v) : now; }
  if (player.pet?.parts) for (const k of Object.keys(player.pet.parts)) player.pet.parts[k] = now;
  for (const p of player.presents || []) { p.limitDatetime = now + 29 * 86400000; p.created = now; }
  if (player.beginnerSince) player.beginnerSince = now;
  player.missions = {};
  delete player.weeklyLux;
  delete player.clockSettled;
  if (player.pet?.training) { player.pet.training.readyAt = 0; player.pet.training.month = clock.monthIndex(now); }
  player.clockVersion = 1;
  savePlayer();
}
```

Writes: every `getDatetime: serverTime()` / `getDatetime: now` that SAVES into `player` becomes
`getDatetime: realNow()` (lines ~1226, ~1522, ~2203, ~2360, ~2594; `pet.js` ~159 and ~293 with `ctx.realNow()`;
`grant-all-medals.js` ~34 with `Date.now()`). Reads towards the client: `getDatetime: outTime(m.getDatetime, now)`
(~2043), `outTime(s.getDatetime || m.getDatetime, now)` (~2078), `outTime(s.getDatetime, serverTime())` (~1532),
`outTime(k.getDatetime, serverTime())` (~2623), `pet.js` ~149 `getDatetime: ctx.outTime(t)`.
Final check: `grep -n "getDatetime" server/*.js` — no write into `player` with a string.

Presents: `addPresent` and `seedTestPresents` save `limitDatetime: realNow() + 30 * 86400000` (29 for the
tests) and `created: realNow()`; `livePresents` filters with `(typeof p.limitDatetime === 'number' ? p.limitDatetime : Infinity) > realNow()`;
`userPresentData` sends `limitDatetime: outTime(p.limitDatetime)`, `created: outTime(p.created)`.

Beginner: `player.beginnerSince = realNow()` at the first read; `beginnerLimitTime()` returns
`serverTimeAt(player.beginnerSince + BEGINNER_DAYS * 86400000)`; in `missionActive` the Beginner check
becomes `realMs < player.beginnerSince + BEGINNER_DAYS * 86400000`.

`pet.js`: `ctx` receives `realNow`, `outTime`, `monthIndex: clock.monthIndex` (add them where `server.js`
builds the context of `makePet`); `serverMs()` -> `ctx.realNow()`; `fmt(t.readyAt)` -> `ctx.outTime(t.readyAt)`;
`training()`: `const month = ctx.monthIndex(ctx.realNow());`; the `weekEnd`/`monthEnd` deadlines of the GET of
`respondExpedition` are computed with `clock` equivalents passed in `ctx` and sent with `ctx.outTime`.

Export in `_test`: `migrateClock`, `clockMonthIndex: clock.monthIndex`.

- [ ] **Step 4: tests**: `node server/test-clock-migration.js` -> OK; all the `server/test-*.js` -> OK.

- [ ] **Step 5: commit** («Orari salvati in ora reale e migrazione dei salvataggi» = "Saved times in real time and migration of the saves").

---

### Task 7: session scripts, login measurement and bench test

**Files:**
- Modify: `tools/ldplayer/session/run-server.ps1`, `relogin.ps1`, `cycle.ps1`, `update-resources.ps1`
  (comment: `-Revision` = BASE of the master revision; new `-RealNow <ISO>` in `run-server`/`relogin`
  that sets `KHUX_REAL_NOW`)
- Modify: `server/server.js` (`realNow`: with `KHUX_REAL_NOW` = fake real instant at start + elapsed time)
- Create: `tools/ldplayer/session/login-time.ps1`
- Modify: `docs/notes/server.md`, `docs/notes/home_profilo.md#limited`, `HANDOFF.md`

- [ ] **Step 1: `realNow` for the bench tests**

```js
// KHUX_REAL_NOW (bench tests): the real time starts from that instant at server start
const REAL_SHIFT = process.env.KHUX_REAL_NOW ? Date.parse(process.env.KHUX_REAL_NOW) - STARTED_AT : 0;
const realNow = () => Date.now() + REAL_SHIFT;
```

`run-server.ps1`: `param(..., [string]$RealNow)` and `if ($RealNow) { $env:KHUX_REAL_NOW = $RealNow }`;
`relogin.ps1`: `[string]$RealNow` passed as `-RealNow $RealNow` in the `run-server` command line.

- [ ] **Step 2: `login-time.ps1`**

```powershell
# Login measurement: N relogins, time until /khux/login and total (lines of relogin.ps1).
#   .\login-time.ps1 -N 5 [-RealNow 2026-10-19T09:00:00Z]
param([int]$N = 5, [string]$RealNow)
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot))
Set-Location $repo
$rows = @()
for ($i = 1; $i -le $N; $i++) {
    $out = & "$PSScriptRoot\relogin.ps1" -Tag "lt$i" $(if ($RealNow) { @('-RealNow', $RealNow) }) 2>&1 | Out-String
    $login = [regex]::Match($out, 'POST /khux/login\s+([\d,]+) s').Groups[1].Value -replace ',', '.'
    $tot = [regex]::Match($out, 'totale ([\d,]+) s').Groups[1].Value -replace ',', '.'
    $master = @(Get-Content 'D:\Progetto_Restauro_KH_UX\logs\server.log' -Encoding Unicode | Select-String 'GET /master/').Count
    $rows += [pscustomobject]@{ giro = $i; login = [double]$login; totale = [double]$tot; tabelle = $master }
}
$rows | Format-Table | Out-String
"media login: {0:N1} s, media totale: {1:N1} s" -f ($rows | Measure-Object login -Average).Average, ($rows | Measure-Object totale -Average).Average
```

- [ ] **Step 3: measurement before** (with the code of `main` before Tasks 1-6, or note today's values):
`.\tools\ldplayer\session\login-time.ps1 -N 5` -> save the table in `docs/notes/server.md#master`.

- [ ] **Step 4: bench, current week.** `relogin.ps1 -Tag ck` (re-downloads the master once: new
revision). Screenshots of the Daily, Weekly and Limited tabs: Daily «N hours left» = hours until 08:00 real
UTC; Weekly «N days left» = days until Monday 08:00 UTC; monthly Limited = days until the 1st of the month
08:00. Compare with the PC's real time (`Get-Date -AsUTC`).

- [ ] **Step 5: bench, restart.** `relogin.ps1 -Tag ck2`: same values, `tabelle` = 0 in `login-time` (no
master download).

- [ ] **Step 6: bench, simulated week change.** `relogin.ps1 -Tag ck3 -RealNow <next Monday 09:00Z>`:
master re-downloaded (106 tables), **no** `GET /resource/` in the log, new short Limited campaign and opposite Weekly
series; a reward of a quest completed and not claimed in the previous week appears in the Presents.
Then `relogin.ps1 -Tag ck4` without `-RealNow` to go back to the true time.

- [ ] **Step 7: measurement after**: `login-time.ps1 -N 5` -> criteria of the Global constraints; results in `docs/notes/server.md`.

- [ ] **Step 8: documentation and commit.** `docs/notes/server.md` (clock, computed revision, measurements),
`docs/notes/home_profilo.md#limited` (true deadlines, Presents), `HANDOFF.md` (bench state: revision =
BASE 117 + deadlines; new `-RealNow` parameters). Commit «Orologio finto: script, misura del login, banco» (= "Fake clock: scripts, login measurement, bench").
