# Raids: design

Status: written 1 November 2026; the author approved the open questions the same day (section «Answered by the author»).
Decisions marked **(author)** come from the author; **(builder's call)** marks choices made while writing, open to change.

## Intent

Restore **all the raids of the original game** **(author)**, not only the Weekly Raids. The game should behave as in the
original wherever the original is known, and every deviation is declared in the in-game Notices. Raids also unlock what
waits for them: VIP stays locked until raids and Union Cross exist **(author)**, with no workaround meanwhile.

## Goals

- Every family of the census: story raid bosses, Weekly, Weekend-only, Monthly, Daily, Radiant Reward and one-off event
  raids, with their original boss, map, tier, dates and rewards where known.
- A solo player can defeat every raid, with the original HP, through repeated attempts.
- Nothing is lost for good: past raids stay reachable from the **Raid Catalog**.
- The title popup works in raids (see I-220).

## Non-goals

- Real multiplayer. Party help on a boss waits for the multiplayer work.
- Union Cross, Coliseum, PvP, and event features that are not raids.
- Balance of jewels and missions (I-164).

## Anti-goals (a failure even if it works)

- Invented numbers presented as original: every reconstructed value is labelled in the data and declared in the Notices.
- Fake players or simulated helpers **(author)**.
- A raid that cannot be finished alone, or a catalogue that lets a reward be taken twice.
- SE files, decompiled code or private sources in the public repository.

## Sources

All private and local, under `D:\Progetto_Restauro_KH_UX\private\events\sources\`:

- `raid_census\` (`RAID_CENSUS.md`, `raid_census.json`, `raid_bosses.md`, `HOLES.md`): 524 rows, 49 bosses. **This is the
  calendar of record**: it corrects the dates in `raid_values.json`.
- `raid_values\` (`RAID_VALUES.md`, `raid_values.json`, `MISSING.md`): HP, coins, boards, every value with its source and
  confidence. Video frames behind the HP in `D:\Progetto_Restauro_KH_UX\tmp\raid_hp\`.
- `raid_rewards\` (`a_weekly`, `b_events`, `c_coins_drops`, `d_video`, each with its `GAPS.md`, and `CORRECTIONS.md`, to apply
  when the data is built): boards, coins, drops.
- Original 2016 raid rows: `D:\Progetto_Restauro_KH_UX\external\thethiny_2026-10-13\KHUx-Server\data\` (`raidEnemy`,
  `raidEnemyAttack`, `raidReward`, `raidSetting`).

## How a player meets raids

**Which raids the player sees (author).** The raid shown follows the player's story quest and changes every Monday, like
the Shop and Special tabs: the story date picks the original period, then one original week per real Monday. Before
September 2018 this means the event raids of that period, after it the Weekly Raids with the tiers of the moment.

**Story raid bosses (author: as in the original).** In quests up to 825 a raid boss can appear during normal quests, by the
original quest ranges. From 826 on they appear only in raid events (official notice of 24 January 2019). Quests whose boss
is unknown use the nearest known boss of the range and are declared in the Notices **(builder's call)**; 89 quests between
614 and 825 are in this case, and 19 more have conflicting sources (`HOLES.md`).

**Raid events.** As in the original, event quests hold Eggcognito enemies and defeating them spawns the boss of that event:
3 Eggcognito, or the fewer the original gave in bonus time. Bonus hours and AP per period as in the sources (for example
0 / 5 / 90 from 15 July 2019).

**Raid Catalog (author).** A banner in the raid list opens a page with every raid, by period, with filters and details, in
the style of the Special Catalog. Past raids can be played from it. Whether one is pinned as in Special (one at a time) or
all open at once is **for the builder to propose**, following the Special tab's behaviour.

## A raid fight, played alone

Confirmed on the original rules (khuxwiki, Raid Boss page; 2016 tables):

- **The boss keeps its damage between attempts** until its timer ends **(author)**. Sources say a failed boss can be
  finished later by paying AP, and that several players hit the same boss; none states plainly that main HP persists, so
  the first bench task checks how the client treats it.
- **Timer per boss**, then it flees: original `bossUpTime` in minutes where known (10, 20, 120, 180), about 20 minutes for
  Weekly Raids (inferred from timers seen in footage).
- **AP:** the first fight costs 0, each further attempt on the same boss costs the original `useAp` (10 in the 2016 rows,
  1 for some events), both from the data.
- **Weak points:** destroyed parts stay down for 3 minutes, the timer resets at every fight, and they then come back with
  partial HP. Destroying one delays the enemy's turn by one round.
- **Boss level:** +1 per defeat of a boss the player summoned, as in the sources; the level raises rewards and Lux.
- **Lux** whenever the boss takes damage.

**Raid Coins, alone.** Victory always, MVP/Host once (in the original the two do not stack when they are the same person,
and alone they always are), All Points Defeated only if every weak point falls before the boss. This corrects the first
idea of giving every share automatically. Each table pays **one slot among alternatives**, so a Gem Drop pays coins or one gem,
not both; in some weeks medals replace coins in the two bonus columns (Heartless Tsum). Story raids pay items, not coins.

From 12 August 2019, flat from LV 1 to 99:

| Tier | Victory | MVP/Host | All Points |
|---|---|---|---|
| Beginner | 120 / 180 | 30 | 30 |
| Intermediate | 150 / 225 | 45 | 45 |
| Advanced | 180 / 270 | 60 | 60 |
| Legendary | 210 / 315 | 75 | 75 |
| Epic | 240 / 360 | 90 | 90 |

From September 2018 to that date, by level: LV 1-9 40/60, 10, 10; LV 10-19 120/180, 30, 30; LV 20-29 150/220, 60, 60;
LV 30-99 180/270, 60, 60. The odds of the higher Victory amount and of gems are unknown: use a rare chance for the high amount,
about 10% (one player's report, weak), and rising gem odds by tier, both labelled reconstructed **(builder's call)**.

**Boards.** Known for all 130 Weekly and Radiant rows (66 boards, 13 rows with an inferred layout) and all WW event rows
that had one. Whether cells must be bought in order and boards unlock in sequence is not documented: buy in the wiki's cell
order, as the rising costs suggest, and boards all open **(builder's call)**, to be replaced if footage shows otherwise.

**Repeating (author).** Raids from the catalogue give Raid Coins every time, as if live. Each raid keeps its own boards,
which can always be completed; each board reward can be taken once only.

**Title popup.** Titles granted by a raid reach the client in the raid clear response, new titles only (I-220).

**What counts as one raid (builder's call).** Boards, coins and one-time rewards belong to the census row (the week): every source lists one board set per week, so all its tiers share them (inferred; video frames may confirm). Damage and boss level belong to the row at a tier. Playing live or from the catalogue shares the same progress, so no reward can be taken twice. The damage of a boss ends with its timer; the boss level stays within the raid.

**Story boss frequency.** The original rule of the JP wiki: about 80 enemy kills spawn a boss, counted across quests, and a boss always appears on its fixed quests. Replays of story quests count; Special and event quests do not **(builder's call)**. The Ω roll above quest 555 is unknown: use the rule known below it, declared.

## Values

**HP, static era from 12 August 2019.** By tier and period, not by boss or level (official notice; video readings):

| Tier | HP |
|---|---|
| Beginner | 150,000,000 (all rows, labelled inferred where not read: **builder's call**) |
| Intermediate | 150 billion |
| Advanced | 42, 54, 70, 150, 200, 300, 350, 400 billion by period |
| Legendary | 700 billion |
| Epic | 999,999,999,999 |

Step dates are known only between two video uploads: use the midpoint week and label it **(builder's call)**. Gem Drop uses
its own tier's value.

**HP, older eras.** 2016 rows where they exist. Between 2016 and August 2019, HP grows with level up to a cap that rises over
time (1.2 to 16.5 billion at the cap); the curve below the cap is not established, so it is reconstructed and declared.

**ATK and DEF (author: deduced from context).** No value is known after 2016. Deduce them per tier and period from the
ratios of the 23 bosses with original rows, checked against the only external hint (about 50,000 STR needed against Epic) and
against the story enemies of the same period. Declared in the Notices as reconstructed, and replaced if data appears.

**Attacks.** Original rows of `raidEnemyAttack` where they exist; other bosses reuse their family's moves, declared.

## Graphics

All 49 bosses have a model LWF in the JP 4.3.1 data (22 links inferred, 3 of them from image and id order only), but textures are complete for only 27 of them (see `docs/notes/raid.md`, Texture coverage: correction after Part 1); our WW resources
hold only the tutorial Darkside. Import them with the existing JP importers. This means a new resource version and packs
near the current size limits, to be measured first.

## Answered by the author

1. **Who must beat what.** Beginner and Intermediate within reach of a normal deck; Advanced, Legendary and Epic only for maxed decks, as late-game content. Original HP and original timer. If a `maxpower` deck cannot do it on the bench, lengthen the timer first, never lower the HP.
2. **If the client does not keep damage between attempts.** No client patch: only the original client runs. The server starts the boss from the remaining HP. If that is impossible too, stop before step 2 and go back to the author.
3. **JP-only raids (185 rows).** First the 201 WW rows in the weekly rotation. JP-only raids come later in the Raid Catalog only, labelled JP, when their data is enough.
4. **Weeks without a raid.** As in the original: the raid list stays empty, while story bosses and the Raid Catalog remain. Weekend-only and Daily raids open only on the real weekend or day. Radiant Reward raids show beside the Weekly ones when they ran.
5. **Unknown rewards.** The raid ships anyway with the standard board of its type, generic rewards already known, declared as reconstructed in the Notices. No invented rare medals or items. The rewards are the subject of a dedicated research in `private\events\sources\raid_rewards\`.

## Order of work (builder's call)

This is several projects. Suggested order, each usable when finished:

1. **Bench spike:** the client's raid routes and tables, spawn, a boss fight, persistence, flee, clear. Answers what no
   document says.
2. **One raid end to end:** one Weekly week at one tier: event quest, Eggcognito, boss, coins, one board, title popup.
3. **All Weekly Raids,** by story date.
4. **Raid Catalog.**
5. **Older event families.**
6. **Story raid bosses.**
7. **VIP re-check:** raid missions start counting towards the Weekly Missions, with no rule changed; VIP stays locked until Union Cross exists **(author's rule)**.

## Notices (mandatory)

A new IMPORTANT notice declares: raids are solo for now and the boss keeps its damage; all reconstructed values (ATK, DEF,
older HP curves, inferred tiers and coin tables); bosses of unknown story quests; the Raid Catalog as our addition; repeatable
coins and boards. Run `node server/export-notices.js`.

## Left to the builder

Table and route names, save format, how the Monday rotation shares code with the Shop and Special tabs, catalogue layout
details within the Special style, and how the master revision and resource versions are delivered, following
`docs/notes/banco.md`.

## Known gaps

From `HOLES.md` and `MISSING.md`: exact HP steps and bosses never read (Greedy Grouch, Holiday Sleigh, Guard Armor, Jack in the
Box, normal Queen Bee), stage ids, quest Lux, drop odds, attack patterns after 2016, spawn formula beyond the egg count, reward odds, board order, whether coins and boards are shared across tiers (footage queue ready in `raid_rewards\d_video\tools`,
YouTube refused new downloads on 1 November), Greedy Grouch and Loudmouth Parade rewards, JP rows after 2018-11-11. The game is built with what is known; a later source replaces a
reconstructed value without a design change.
