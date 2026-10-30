# Special tab: period quests, Special Catalog, pinned quest, training dummy — design

Date: 2026-10-30. Decided with the user in the brainstorming of 29-10 and 30-10. Items marked **(builder's
call, proposed)** were proposed by Claude and not objected to; everything else is a user decision.

## 1. Intent

The Quests screen has a **Special** tab (unlocked after story Quest 6, `misc` 122) that today shows «No available
events.». In the original game it held the quests that farm upgrade material: weekday quests (EXP, Evolve, Munny,
Mythril, Keyblade materials, MOG...), daily challenges (Daily Cid) and VIP quests (weekly paid pass). It changed
several times between 2016 and 2021.

We restore it so that it **follows the player's story progress like the Shop banners do**: a player at an early story
quest sees the Special tab of that era, a player at the end sees the late one. Players can still reach an old quest by
**pinning** it from a catalogue, and the catalogue banner doubles as a **training dummy** quest for testing builds.

Why: Special quests are the original source of growth material; without them the medal/keyblade economy depends only on
story drops and the Moogle Shop. Following the story keeps the «replay the game in order» feel the Shop already has.

## 2. Goals, non-goals, anti-goals

Goals
- The Special tab lists the original Special quests of the period that matches the player's story quest.
- Original weekday rules apply; our weekly-missions VIP opens every weekday quest and shows the VIP quests.
- One old quest can be pinned from a web catalogue and played next to the current ones.
- A training quest lets players test builds against an unkillable enemy.
- Every deviation is explained in the in-game Notices.

Non-goals
- Events tab content, Weekly Raids (next sub-project), Union Cross, Coliseum.
- JP-only families (SQ10 Boost Medals, SQ20 Broom & Mirror premium): the client is WW **(builder's call, proposed)**.
- Exact original drop rates (unknown; see 8).
- Resource balance of rewards (done later for all modes, I-164).

Anti-goals (would be a failure even if it works)
- A Special list that ignores the story period (e.g. every quest of every era at once).
- Pinning used to bring back quests that a later, better version replaced.
- The training quest becoming a farm (any Lux, drop or reward from it).
- Any undeclared deviation from the original.

## 3. Source data

- Catalogue of the original Special quests (private, local only): `D:\Progetto_Restauro_KH_UX\private\events\special\SPECIAL_QUESTS.md`
  and `special_quests.json` (25 families SQ01-SQ25, 123 quest rows from khuxwiki infoboxes, week-by-week VIP tables,
  120 WW VIP campaigns, timeline, VIP rules, gaps). Section 7 there describes the mid-2020 steady state.
- The user's own guide `reference\guida_basi` for player-facing wording.

## 4. The Special tab as the player sees it

From top to bottom:

1. **Special Catalog banner** (always present).
   - **Details button** opens our web page `/web/special/catalog` (see 6).
   - **Tapping the banner** opens its quest list, which contains the **training quest** (see 7).
2. **Pinned quest banner** (only if the player pinned one), labelled **KEPT** like the pinned Shop banner, right below
   the catalogue. Tapping it opens that quest's list and it is played normally.
3. **Current Special quests** of the player's period, with their original weekday availability, plus the VIP ones when
   VIP is active.

The list is recomputed at every opening of the tab (the client sends `GET /stage/event` with `eventCategory` 1 at
each opening, bench 29-10), so a pin made in the catalogue appears after closing the page and reopening the tab.

## 5. Periods and the current list

### 5.1 Periods (builder's call, from the wiki timeline; the user relies on the wikis)

| # | Name | WW dates | What the tab holds |
|---|---|---|---|
| 1 | Launch | 2016-04 -> 2016-09-18 | weekday EXP / Evolve / ★-3★ / 4★-5★ Evolve / Munny / Mythril / Keyblade Materials; VIP Skill, Upgrade Quests, Daily Cid (VIP from 2016-05-19), Adamantite from 2016-05-27 |
| 2 | Expansion | 2016-09-19 -> 2018-05-24 | + MOG quests on weekends, Adamantite daily rotation (2016-10-03), Daily Cid free from 2017-04-20, weekly limited VIP theme quests (2017-02 ->) |
| 3 | Ver 2.6.0 | 2018-05-25 -> 2020-05-22 | merged Legendary / EXP & Evolve quests, MOG every day, Skill free Sat-Sun, Daily Cid; recurring VIP set (2018-10 ->) |
| 4 | Pre-Dark Road | 2020-05-23 -> 2020-11-15 | as 3 with Skill at 0 AP and the renewed VIP quests (catalogue section 7) |
| 5 | Last | 2020-11-16 -> end | «Day of the Weekly Quest» four 0-AP quests, VIP Materials quest; Daily Cid removed |

Adamantite and Mythril Madness, named above as they were in the original, are not restored (see 6).
Exact family membership per period comes from the catalogue timeline (section 3 there); the builder fixes the
boundaries in data, not in code.

### 5.2 Mapping story quest -> period

- The player's story quest gives a date the same way the Shop does for banners (story quest -> tranche -> period of
  original dates). The Special period is the one containing that date.
- The date used is the one of the player's **current Shop rotation week** (the same original week that drives the
  Shop and the VIP set rotation), so the tab may switch period inside a tranche as the weeks rotate
  **(builder's call, proposed)**.
- Before the first permanent set exists (story dates before WW launch, i.e. JP-only era) the tab shows **the earliest
  permanent version** (period 1).

### 5.3 Rules inside a period

- Weekday quests are open on their original weekdays (WW days; our day boundary as for the weekly missions).
- **VIP** = our VIP earned by finishing all Weekly Missions (`vipActive()`, benefit 100). With VIP: every weekday quest
  of the period is open on every day, and the VIP quests of the period are listed (original rule of the WJE pass,
  including its exception: the Adamantite challenges stay on their own day).
- A quest that is closed today (weekday, or VIP without VIP) is **shown locked, as in the original** (user, verified
  on the bench 30-10): the server sends `ret.functionFlags` bit 4 on every response and the event with `isLock` 1;
  the client draws it darkened with a padlock and adds the original red **«Unlock All»** button (the weekly pass).
  The client never reads the EvStage weekday/benefit fields: the server decides open/locked per quest.
- Tapping a locked banner or «Unlock All» starts the original pass purchase flow (`/payment/info`, `/user/shop`,
  `/shop/campaign`); our server does not answer `/shop/campaign`, so nothing opens and nothing can be bought (bench
  30-10). The Notices explain that locked quests open on their weekday or with the Weekly Missions VIP and that
  «Unlock All» has no function. Details still works on locked banners.
- To check when building: whether `functionFlags` bit 4 changes anything outside the Special tab (it is global).
- Period 5 content: the catalogue cannot say which free quests survived the 2020-11-16 renewal; keep the period-4 free
  quests (minus Daily Cid, explicitly removed) plus the four «Day of the Weekly Quest» quests **(builder's call,
  proposed)**.
- VIP sets that changed weekly in the original rotate **one original week per real Monday**, like the Shop rotation
  (I-165) **(builder's call, proposed)**.
  Done in round 17 (user 31-10: «faithful»): each recurring VIP set (SQ22: Medal Quest, Gems, Draw Ticket, Dual Meow
  Wow, Jewels & Spirit Part, Jewels & Avatar Parts, Subslot) has one **week version** per row of the catalogue's weekly
  tables (appendix B, 176 versions): own stage and evStage id (7700-7875, frozen in `special_periods.json` `weekly`),
  the row's three rewards, VIP, listed only in the Shop weeks it covers (it takes its set's place in the tab), pinnable
  per version from a later period; the catalogue shows each set as one quest with its weeks as versions. Weeks without
  a row keep the set's representative entry (fallback).
  Round 18: VIP! Skill joins as a weekly set (entry `vip-skill` 7092, 2019-05-27 to 2021-02-28; 25 frozen versions
  7876-7900, 7893 dropped as a repeated wiki row). A skill reward «1 6★ <skill>» is a **Scrooge 6★** (90126, the image
  on khuxwiki) with that master skill at its maxLv 20: rules `sets["VIP! Skill"].skills` (18 texts, all exact master
  names) and `skillCarrier`, stage row `submissionSkillType 1 / submissionSkillId / submissionSkillLv`, granted by
  `grantObjectiveReward` in server.js into `player.medalSkills` (as the Shop's skill medals, `giveSkill`). A row whose
  weeks are not consecutive (VIP! Skill 4 and 5 alternate) gives one version per run of weeks.
- **All 120 WW week-limited VIP campaigns** are in scope (user, 30-10): each one appears in the rotation week that
  matches its original dates, with VIP, and is a separate catalogue entry pinnable under the VIP rule. Weeks without a
  campaign show only the permanent VIP quests of the period. They can be built after the permanent quests.
- Objective rewards are first-clear only; drops repeat on every clear (original behaviour) **(builder's call, proposed)**.
- Daily challenges that reset (Daily Cid: objectives reset when the 7-day cycle completes) keep their original reset
  (`resetFlag`).

## 6. Special Catalog and pinning

- Web page `/web/special/catalog`, opened from the Details button of the catalogue banner, in the same style and with
  the same mechanics as the Shop Banner Catalog (inline JavaScript, `fetch` to the server; proven in the Shop WebView).
- It lists every period with its quests. Each quest shows whether it can be pinned and why not.
- **One pinned quest at a time** (like the Shop). Pin / unpin from the page; pinning another replaces the current one.
- What can be pinned:
  - Only quests of **past periods** (user: «pin an old quest»; same rule as the Shop, sp3 6.1). Later periods are
    visible in the catalogue but not pinnable, so the story order is kept.
  - When the story reaches the period of the pinned quest, the pin stays but the quest is shown once, in the current
    list (no duplicate KEPT banner) **(builder's call, proposed)**.
  - Old **weekday quests that a later, better version replaced** cannot be pinned (e.g. separate 2016 EXP / Evolve
    quests merged into the 2018 EXP & Evolve ones).
  - Old weekday quests **without a replacement** can be pinned, and once pinned they are playable **on any day**.
  - Quests whose rewards have no use in the 4.3.1 client are neither listed nor pinnable. Checked 30-10 on
    `keyblade.json` (4351 levels): **Adamantite Ore Challenge** (SQ08) and **Mythril Madness** (SQ06: Mythril Stone,
    Gem, Crystal) feed no keyblade upgrade, so they are **removed from every period** (user, 30-10) and the removal is
    explained in the Notices. **Keyblade Materials** (SQ07) stay: old keyblades still need their own materials
    (Starlight: Curative Leaf / Flower, Olympia: Netherstone / Ember, Lady Luck: Copper Ore / Teardrops...); they have
    no replacement, so they are pinnable.
  - **VIP quests** of old periods can be pinned, but are playable only while VIP is active (like current VIP quests).
- Data: `player.special.pinned` (quest id or absent), routes like the Shop (`POST /web/special/pin/<id>`,
  `/web/special/unpin`) **(builder's call, proposed: mirror the Shop names)**.

## 7. Training quest (behind the catalogue banner)

- One quest in the catalogue banner's list: **0 AP, no Lux, no drops, no rewards**. Purpose: test builds.
- **Map with two paths** (like the original two-path maps, generated with `gen_story_maps.py`):
  - **Path A** leads to a single **Shadow**, the quest **Target**. Beating it clears the quest and its three objectives
    (present for completeness).
  - **Path B** leads to the **training dummy**, a separate field enemy group that **cannot be killed** (huge HP, and it
    heals itself if the enemy move data allows it; huge HP alone is acceptable). The only way out is **Give Up**.
- **Chests on path B** (user, 30-10): enough CP chests (prize type 8, the special gauge; 1 gauge = 10000) to fill
  the keyblade's special gauge before reaching the dummy, so specials can be tested at once.
- The training quest **never changes the gauge saved in the keyblade** (`player.keybladeBurst`): a clear of path A
  after taking the chests must not hand a full gauge to the real quests **(builder's call, proposed)**.
- The player chooses the path. The two paths must be easy to tell apart at the start (e.g. the dummy visible from the
  start) **(builder's call, proposed)**.
- Objective rewards: none; if the client requires a reward per objective, the smallest possible one **(builder's call,
  proposed)**.
- Dummy look: an existing enemy model (e.g. a large Heartless), no new graphics **(builder's call, proposed)**.

## 8. Technical constraints already verified

Bench and static analysis of 30-10 (`docs/notes/server.md#eventi`):
- The tab list comes from `GET /stage/event` (body `eventCategory` 1); each banner needs a master `evStage` row and
  stage rows; the master must carry **all** rows the list can ever show from login (the list changes per opening, the
  master only per revision).
- `evStage` rows: every field mandatory; `validStageId` = count of `stageId` (max 5, array trimmed); `startTime`,
  `endTime`, `endDispTime`, `boardEndTime` must be dates. Bad row = «Master data error» at login.
- `isLock` 1 hides a banner; `isLock` 2 shows it with «Available»; tapping a visible banner always opens its quest list.
- Details button appears when `evStage.detailUrl` is set; the URL must not contain `?` (the client appends
  `?<session params>`).
- Events containing stage 95100 or 95200 are dropped by the client.
- Every master change needs a revision bump (session scripts default 211 since 30-10; never lower).

Known gaps (from the catalogue, section 6): original stage/map/enemy data and drop tables of the Special quests are not
available; the builder builds stages from known enemies and resource stage bins, with drops based on the wiki rewards.
The Special «Progress» counter on the Quests screen (`/stage/achievements`, I-037) must count the Special objectives.

## 9. Notices

One IMPORTANT notice (or more) explaining: the Special tab follows the story period; the Special Catalog and the single
pinned quest; VIP comes from the Weekly Missions; Adamantite Ore Challenge and Mythril Madness are not restored because
their materials have no use in this client version; the training quest with the unkillable dummy (no rewards, leave with
Give Up); reconstructed drop rates.

## 10. Left to the builder

- Sub-project split and order (suggested: framework + one period end to end, then the other periods, then catalogue and
  pinning, then the training quest).
- Stage ids, eventStageId ranges, banner images (640x140, original style; `reference\` first).
- Catalogue page layout within the Shop Catalog style.
- How the Special objectives are counted in I-037.
- Tests (server unit tests like `test-moogleshop.js`, bench checks).
