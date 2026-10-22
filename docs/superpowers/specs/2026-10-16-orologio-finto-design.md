# Server fake clock: twin months and real deadlines

Date: 16 October 2026. Status: **approved by the user on 16-10** (plan: docs/superpowers/plans/2026-10-16-orologio-finto.md) (the user's idea, refined in chat; 3.6 decided on 16-10; 16-10 revisions: calculations in real time, precomputed deadlines, monthly boundary at 08:00, dates saved in real time, resource revisions kept separate).

## 1. Goal

Make game time flow like real time (days, weeks, months) while staying within a range of dates
that are «safe» for the client, so that:

- the Daily, Weekly and Limited countdowns show the real time left until the reset
  (today Weekly and Limited say «28719 days left»);
- Daily and Weekly resets really happen even if the server is restarted (today the clock
  restarts from 15/5/2021 12:00 at every start: restarting the next day, the server believes it is
  still the same day);
- the Limited rotation (month/week) follows the same calendar.

Success criterion: on the bench, on any real day, the Daily shows the hours until 08:00
real UTC, the Weekly the days until the next Monday 08:00 UTC, the monthly Limited the days until
the end of the real month; after a server restart the values stay consistent.

## 2. Verified facts

- The countdowns follow the **server time** (`serverTime` of the login), not the device time
  (bench 16-10: guest at 10/1/2021, server at 15/5/2021, Daily «19 hours left»;
  `docs/notes/server.md#master`).
- Daily: the client counts up to `startDate + k*86400` of the master row. Weekly and
  Limited: it shows the row's `endDate`. The Weekly and Limited deadlines therefore come **only from
  the master**.
- The client downloads **all** 106 tables again when the global revision changes (the per-table
  revision is ignored); measured cost: login of 19-77 s depending on the emulator state (14-26 s
  without a new master).
- The device must stay before 29/6/2021 (local «End of Service» popup): a separate problem,
  **outside this design** (ISSUES I-128).

## 3. Design

### 3.1 Fake date: twin months

For each real month a **twin month** is chosen between May 2016 (WW release) and May 2021: same
weekday for day 1 and same length. The fake date is the real date with year and month replaced
by those of the twin, **same UTC time**. Example: Friday 16/10/2026 15:00 ->
Friday 16/10/2020 15:00.

- These match the real ones: weekday, day of the month, time, end of week, end of month.
- All 30- and 31-day months have a twin (verified for all 7 starting days). Among several
  twins the most recent one is taken.
- **February fallback** (28 days starting on Tuesday/Saturday/Sunday, 29 days starting on a day
  other than Saturday; first real case: February 2028): any 28-day February is used
  (the most recent one). For that month the weekday shown is shifted; resets and countdowns
  stay exact (3.2). For a real leap-year February, the 29th falls on the fake 1st of March.
- **Twin fixed at login.** The client takes the server time at login and then advances it
  by itself. The server therefore chooses the twin at every login (`/khux/login`) and keeps that
  offset (fake date = real date + offset) until the next login. If the session crosses the end
  of the month, the fake date continues into the next month of the fake calendar (31/10/2020 ->
  1/11/2020) instead of jumping to the twin of the new real month (which could be, for example,
  June 2019): client and server always see the same date, AP, training and gifts stay consistent.
  Deadlines are calculated in the same frame of reference. The offset is saved (`player.clockOffset`)
  only to survive a server restart while the game is open; at every login it is recalculated.
- The offset depends **only on the real month of the login**, counted with the same boundary as the
  monthly deadline (from day 1 at 08:00 UTC, i.e. the month of «now - 8 hours»): two logins in the
  same month give the same offset and the master cached in the client stays valid; it changes
  exactly together with the monthly revision (3.3). With the boundary at midnight, anyone logging in
  between 00:00 and 08:00 on day 1 would have had a new time and an old master (wrong deadlines for 8 hours).
- Safety limit: if a very long session were to take the fake date past 28/6/2021, the
  server freezes it at 28/6/2021 23:59 until the next login.

### 3.2 Two rules: calculations in real time, fake time only towards the client

- **Every period and every deadline is calculated on real time**: day = from 08:00 real UTC, week
  = from Monday 08:00 real UTC, month = from day 1 08:00 real UTC. Quest counters,
  Limited rotation, delivery to Presents, `weeklyLux` use only these indices.
- **Fake time is used only for what is sent to the client**: `serverTime`, times in the responses
  (`lastApDatetime`, `recoverDatetime`, `limitDatetime`, `getDatetime`, `beginnerLimitTime`) and
  the master's `endDate` = real instant + session offset (3.1). The server saves only
  real instants (3.7).
- This way the February fallback (3.1) never moves a reset: it only shifts the weekday
  shown, while the countdowns stay exact because deadline and «now» are
  translated by the same offset.
- No saved `data_weekly`/`data_monthly`: they are recalculated (the «data_locale» of the original idea
  is the fake date of 3.1).

### 3.3 Calculated master revision and deadlines written on the fly

- `revision = BASE + number of deadlines (Monday 08:00 and month starts 08:00) passed since 1/1/2026`.
  `BASE` remains the number we raise when we change the masters (117 today), multiplied by a
  large step (e.g. `BASE * 100000`) so that the two parts do not overlap. The session scripts
  stop forcing the revision: they pass it only as `BASE`.
- When the client requests the tables, the server rewrites **in memory** the `endDate` of the
  Weekly (missionType 3) and Limited (4) rows. The files in `server/master_data` and `server/tables` do not
  change.
- **Precomputed deadlines for a change while the game is open**: the rotation is known in advance, so
  each Limited group receives the deadline of its **next** occurrence (the active one its own,
  the one of the following week/month the end of the following week/month). The Weekly (same rows every
  week) become two alternating series A/B (3001-3010 even weeks, 3011-3020 odd), each
  with the deadline of its next week. Result: when a deadline passes while the game is open,
  the new quests already have the right countdown in the cached master, without relogin.
- The revision also counts the deadlines inside the session, but the client sees it only at
  login: at the next login it downloads the master again (once per week at most).
- The calculated revision applies **only to the master fields** (`masterRevision` of
  `/system/resourcesize`, `master.revision`/`commonRevision` of `respondMaster` and those that the
  plan will verify to belong to the master). Today the same number also ends up in fields of the
  **resources** (`darkVersionRes` and similar, `/system/status`): those stay constant, otherwise the
  client could download the ~2.3 GB of resources again every week. Observed fact (16-10): today
  `versionDat`, `commonVersionDat`, `darkVersionRes` and `darkVersionDat` of `/system/status` already
  equal the master revision, and in the four increases 114 -> 117 the client downloaded only
  the master, never the resources (the WW resources follow `versionRes`/`versionResLow`). The separation
  remains as a precaution; the plan verifies field by field what the client reads.
- The master served depends **only on the revision**: the deadlines are calculated with the offset of the
  month the revision belongs to (3.1), so each revision corresponds to a single content,
  which can be cached (3.6b).
- The client downloads the master once a week plus once more per month (~20 s), not at every login.

### 3.4 Daily

No change: with a server time that does not restart and has the real UTC time, the client's countdown
(`startDate + k days`) becomes correct by itself (the offset is a whole number of days,
the time of day matches); the server-side period is calculated on real time (3.2).

### 3.5 Limited

The rotation already uses the real month and week (`limitedPeriod`): it stays that way (3.2). The rows
receive `endDate` as in 3.3 (next occurrence of the group).

### 3.6 Week or month change while the game is open (decided with the user)

The client downloads the master again only at login. At the real deadline the server **changes immediately**:

- the progress of the old campaign stops exactly at the deadline (Lux, quests and enemies from then on
  count only for the new one): no double rewards by keeping the game open for days;
- `/user/mission/list` immediately sends the rows of the new campaign, which in the cached master
  already have the right deadline (precomputation of 3.3);
- claiming a quest of the old campaign is refused (normal response, without
  reward; the quest disappears from the list);
- **the rewards of quests completed and not claimed before the deadline go to the Presents**
  (comment «Limited Mission reward» / «Weekly Mission reward», gift expiry like the others):
  nobody loses an earned reward, nothing to exploit. This also applies to the Dailies (same rule,
  a single one). **A single checkpoint**: at every request the server compares the real
  day/week/month indices with those of the last saved settlement (`player.clockSettled`);
  if one has advanced, it closes the past periods (completed and unclaimed rewards -> Presents, once
  per quest and period, `player.missions[id].received`) and updates `clockSettled`.
  Steady-state cost: three integer comparisons per request. The check runs **at the start** of every
  request, before any other processing (Node is single-threaded): a claim that
  arrives right on the boundary finds the quest already closed and the reward already in the Presents, never
  paid twice.
- February without a twin: the fallback of 3.1 is fine with the user (16-10).

### 3.6b Login speed (user request)

Today's measurements (LDPlayer bench, 16-10): login without a new master 14-26 s; with the master downloaded again
(106 tables, 18 MB) 19-77 s depending on the emulator state. Server work to serve the
master: ~0.35 s (reading, JSON, double encryption of 18 MB) plus schema validation, repeated
at every request.

Design rules:

- the master is downloaded again only when the revision changes, i.e. at a passed weekly or monthly
  deadline (or at one of our master changes): at most ~5 times a month, never at every login;
- the twin and the deadlines at login are calculations of a few microseconds;
- **cache by revision and file date**: tables read, validated, encrypted and with md5 calculated
  once, `mission` with the deadlines applied included, then served from memory (recalculation only if
  the revision or a `master_data` file changes); today they are redone at every request;
- the delivery of unclaimed rewards to the Presents happens once per period, not at every login.

Test: measurement script (`tools/ldplayer/session/login-time.ps1`, to be written) that performs N relogins and
reports the time until `/khux/login` and until the home screen (first `/mypage` request). Criteria: login
without a new master no slower than today (+1 s at most, average of 5); login with the new master
no slower than today on the same emulator; server work for `/system/master` < 50 ms with the
cache.

### 3.7 Saved times

The server already keeps some times in real ms (AP: `apTime`). Rule: **everything that is saved and
counts for a deadline goes in real ms**, converted to the fake date only when responding to the client.
To be converted once (migration at the first start with the new version):

| Saved field | Today | After | Migration |
|---|---|---|---|
| `player.presents[].limitDatetime` | fake string | real ms | +29 days from now for those not expired |
| `player.beginnerSince` | fake string | real ms | now (the 30-day Beginner window restarts) |
| pet training `readyAt` | ms of the fake time | real ms | ready immediately |
| `getDatetime` of medals, keyblades, Spirit parts, spheres | fake string | real ms | shifted as a block so that the most recent one is the instant of the migration (the order is kept) |
| `player.pet.expedition` training month («This Month's Training») | fake month | real month index | the count of the current month is kept |

With the `getDatetime` in real ms, changing twin between two logins does not mix up the «most
recent» order of the Medal List: everything is converted with the offset of the current session. Accepted
effect: many years from now, the dates of very old items, converted with the twin of that time,
may turn out earlier than 2016 (display only).

`player.missions[].period` and `player.weeklyLux.period` become indices on real time (3.2):
they change scale once (at the first start the counters of the current period are reset, without
deliveries to the Presents for that transition).

### 3.8 Components

- `server/clock.js` (new, no dependencies, real time injectable for tests):
  `twinOffset(realMs)`, `fake(realMs, offset)`, `dayIndex/weekIndex/monthIndex(realMs)`,
  `weekEnd(realMs)`, `monthEnd(realMs)`, `masterRevision(base, realMs)`, twin table.
- `server/tables/mission.json`: Weekly in two series A/B (3.3).
- `server/server.js`: `serverTime()`/`serverTimeAt()` use `clock`; `respondMaster`/`masterBody`
  apply the deadlines on the fly and the calculated revision; migration of 3.7.
- `server/pet.js`: training and `getDatetime` of the parts in real ms, real training month.
- Session scripts: `-Revision` becomes the `BASE`.
- `KHUX_SERVER_TIME` remains for tests (fixed fake date, as today).

### 3.9 Tests

- `server/test-clock.js` (offline): twins for all months 2026-2035 (weekday,
  day of the month, length, February fallback), monotonic function within a month, end of
  week/month, revision that changes only at deadlines, date always between 5/2016 and 28/6/2021,
  month boundary at 08:00 on day 1 (offset and revision change together), settlement of
  periods only once (no double reward in the Presents, even after a restart).
- Test of the on-the-fly deadlines: `mission` tables served with `endDate` = end of week/month, same
  content for the same revision.
- Test of the revisions: the resource versions do not change when the master one changes
  (no resource download on the bench after a simulated week change).
- Bench: Daily/Weekly/Limited with the real days; server restart -> same values; a simulated
  week change (`KHUX_REAL_NOW` to move the real time in tests) -> master downloaded again,
  new campaign.

## 4. Outside this design

- The device date (I-128) and the choice of where the server will run.
- Shop banners (`/gacha/*`) to spend the Limited tickets.
