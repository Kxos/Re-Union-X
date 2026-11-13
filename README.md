# Re-Union X

*A fan restoration of Kingdom Hearts Union χ[Cross]* (repository: Re-Union-X)

**English** | [Italiano](README.it.md)

**How to play:** [docs/SETUP.md](docs/SETUP.md) · **Project site:** [Re-Union X](https://re-union-x.github.io/Re-Union-X/) · **Help wanted:** [Reddit post](https://www.reddit.com/r/KingdomHearts/comments/1xcbwjg/) / [What we are looking for](#what-we-are-looking-for) · **Bugs:** [open a bug report](https://github.com/Re-Union-X/Re-Union-X/issues/new?template=bug_report.yml)

> Setting the game up today is long and complex (it will become a single launcher when the work is finished),
> and the game is a work in progress: expect bugs and crashes, and please report them.

> **Disclaimer.** This is an unofficial, non-commercial fan project. It is not affiliated with, endorsed or
> sponsored by Square Enix or Disney. *Kingdom Hearts*, *Kingdom Hearts Union χ[Cross]* and all related names,
> characters and assets belong to their owners. No game files are distributed here. See
> [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
>
> **Name.** «Re-Union X» is not related to **KH ReUnion** ([@KH_ReUnion](https://x.com/KH_ReUnion)), a separate fan
> project with a similar name. If its team asks us to change our name, we will gladly discuss it.

Preservation project: bringing **Kingdom Hearts Union χ[Cross] · Dark Road** back as a
locally playable experience, after the servers shut down (May 2021) and almost all of
Union χ was removed from the app, which was reduced to a theater mode.

> All the working documentation (HANDOFF, ISSUES, technical notes, journal) is in English since 22 October 2026;
> this README is also available [in Italian](README.it.md). Feel free to open an issue.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Obtaining the client and assessing feasibility | ✅ done |
| 2 | Technical reconnaissance — architecture, protocol, data schema | ✅ done |
| A | Static analysis of the client: hosts and endpoints | ✅ done |
| B | Minimal REST server → the client reaches the home screen | ✅ **unmodified original** APK 4.3.1 on LDPlayer 9 (Android 9): new player, Prologue, home |
| C | Field schema of the 54 master tables | ✅ done — 106 tables, 1,739 fields |
| D | Master data, quests and single-player combat | 🔄 from new player to home; story quests **1–979** with the original maps and rooms (from the JP 4.3.1 data), cutscenes, per-quest music, original enemy stats and levels, objectives, chests and Trophies; Special Attacks with variable damage and enemy attacks; Medal List, selling, Level Up (Special Attack dots and Bonus, Skills, traits, Trait Medals), Evolve, Moogle Shop, Shop with the original banners (807 deals with their guarantees, pity, weekly rotation, seasonal banners, a kept banner and a filterable catalog), Profile, Missions and Limited campaigns, Avatar Boards, pet, Lux levels up to 999, Special tab with its catalog, **Raids** (solo), complete for the worldwide game (6 November): all **194** worldwide raids of 2016-2021 (424 tiers, 501 Raid Boards), every boss restored (45 models, some reconstructed and approved), the original banners and a Details page per raid with the original notice, weekly raids following the Story, story raid bosses in quests 4-825, Raid Coins and a Raid Catalog (every past raid by game year, filters, one past raid kept in Events); one raid rule, not original (Monday-Friday the original AP, Saturday-Sunday 0 AP, Lux x2 and Bonus Time all day); values lost in the original data rebuilt and declared on each page; Raid Board cells follow one path (original grid layout not restored); Japan-only raids not served (worldwide content only); later additions with the events (I-227 with I-166), in-game Notices explaining every deviation from the original. **Event quests** (non-raid events), parts 1-4 done (10 November): events follow the Story like the Shop, an Event Catalog (every event with its quests, one past event kept), original maps, enemies, objectives, rewards and drop chances, short events open their whole original day, no Raid Boss from event quests (the original rule from January 2019); served: the April 2019 events, the Gem Quests of 2017-2021 (weekly, monthly, gem drop and daily gem events) and the Event Coin events of 2018-2020 and the challenge and battle events of 2018-04..2021 (Defeat events, Big Bonus Challenges, Keyblade Challenges, quizzes with their boards rebuilt from the original screenshots, videos and wiki texts, the 2020 Surprise events on their whole original day, Time Missions, community-goal and completion bonuses paid once): 305 events, 2,181 of 3,071 quests; the 38 event enemies of parts 2-3 and 15 more of part 4 rebuilt with their special attacks; Booster rewards recorded and given with the Boosters; Event Coins that never expire (one balance per board set) and 41 Event Boards in 7 sets (boards with a Booster cell wait for the Boosters, their coins are kept); Org XIII events, Boosters and the other events follow. Enemy graphics: all **245** enemy families of quests 1–979 complete (27 October; final in-game check open, I-194): **209** fully original (123 from the original JP 4.3.1 files, 86 original files recovered elsewhere in the game data), **36** restored by reconstruction (25 mostly original with a few pieces rescaled or rebuilt, 11 recoloured from a twin) |
| E | Self-hosted Photon for Union Cross / raids / PvP | ⬜ |

Status as of 10 November 2026. Screens that the 4.3.1 client can no longer find in its
resources (CocoStudio layouts, texts, animations) are **rebuilt**: from nearby originals,
from the widget names the client looks up, and from reference images of the time.

**[HANDOFF.md](HANDOFF.md)** — how to resume: bench status and next step.
**[In-game Notices](https://re-union-x.github.io/Re-Union-X/notices/)** (web page in the game's style; also as [docs/NOTICES.md](docs/NOTICES.md)) — how the restored game works and where it differs from the original.
**[docs/ISSUES.md](docs/ISSUES.md)** — open and closed issues; technical notes by area in
[docs/notes/](docs/notes/), full work journal (every solved issue with its cause) in
[docs/journal/](docs/journal/).
**[REPORT.md](REPORT.md)** — reconnaissance results. **[PHASE-A.md](PHASE-A.md)** — static analysis.
**[PHASE-C.md](PHASE-C.md)** — the fields of the master tables.

## What we are looking for

We ask only for **information**, never for game files. Much of the game content was downloaded from
the servers after install and is rebuilt by the project. Since 27 October no enemy family of the story
is missing any more (appeal of 22 October on
[Reddit](https://www.reddit.com/r/KingdomHearts/comments/1xcbwjg/)); screenshots and videos of the
**36 reconstructed families** (listed on the [site](https://re-union-x.github.io/Re-Union-X/#status)) still
help to check and improve them, as do the enemies of events and anything about **events, Coliseum, Union Cross and PvP** (screenshots, videos,
rules, rewards, guides). Please get in touch by opening an issue; do not send or post game files.

## Technical summary

- The game is **Cocos2d-x with logic in native C++** (not Unity/IL2CPP).
- The client library carries almost no function names: the API layer was found from the protocol
  strings.
- The client is protected by a third-party protector: only the original APK runs, on Android 9
  ([protector.md](docs/notes/protector.md)).
- Two network stacks: **REST** (AES-256-CBC + gzip, key negotiated with the server) and
  **Photon/eNet UDP** for realtime.
- The client's master table classes expose the data schema: **107 tables** in the online WW 4.3.1
  build, **54 removed** in the move to the offline 5.0.1. Those 54 are the exact measure of
  the work — and their **759 fields** were recovered from the binary, with column names and
  order.
- The **combat engine is still intact** in the offline client: it needs to be fed with data,
  not rewritten.

## Layout

```
REPORT.md, PHASE-*.md   Reconnaissance and analysis
HANDOFF.md              How to resume the work (status and next step)
docs/                   ISSUES.md (issues), notes/ (technical notes by area), journal/ (journal),
                        NOTICES.md and notices/ (in-game Notices, web page on GitHub Pages)
server/                 Node.js server: REST API, DNS, generated master and game tables
                        (server/README.md)
tools/ldplayer/         LDPlayer bench: startup, sessions (session/), tombstones
recon/tools/            Analysis and resource-building tools (Python)
recon/out/              Interface schemas: master table fields and types, response schemas
                        (the client research scripts are kept private, outside the repository)
recon/dl/ ext/ web/     Proprietary material — NOT versioned
```

### Bench workflow

| Command | Purpose |
|---|---|
| `tools/ldplayer/session/relogin.ps1` | restarts server and app with the saved player, up to the home screen |
| `tools/ldplayer/session/build-resources.ps1 -Quick` | rebuilds layouts and texts and writes them into the guest (~40 s, no download) |
| `tools/ldplayer/session/build-resources.ps1 -Version N` + `update-resources.ps1` | new full resource version, downloaded by the client (~5 min); then tap KHUX START (200,1020) and Download (1220,715) by hand |
| `node server/check-stage-data.js` | offline check of the quest data |
| `node server/export-notices.js [--check]` | exports the in-game Notices to `docs/NOTICES.md` and `docs/notices/index.html` |

### Tools

| Script | Function |
|---|---|
| client research tools (private) | produced the interface, response and master schemas in `recon/out` |
| `strings.py` | String extractor for binaries |
| `demangle.py`, `scope_methods.py` | Research helpers on the names in the binary |
| `elfinfo.py` | Architecture and endianness of an ELF |
| `make_layouts.py` | Replacement CocoStudio layouts: copies of originals, scenes, built layouts, widget clones, armatures, texts |
| `resource_pack.py`, `resource_merge.py` | BGAD package of the generated resources and merged index (with space reserve for the quick cycle) |
| `import_ui_texts.py` | Original `text/ui` texts from the 4.4.0 IPA |
| `layout_tree.py`, `scene_tree.py` | Layout and scene structure |
| `import_orig_stages.py`, `make_jp_rooms.py` | Original story stages and rooms from the JP 4.3.1 and 2016 data (quests 1-979) |
| `import_jp_coco.py` | Original JP CocoStudio layouts in place of the generated ones (list `jp_coco_layouts.txt`) |
| `make_jp_enemies.py`, `deep_donors.py` | Original enemy graphics; missing textures found by content in other files of the same creature |

## Credits

This restoration stands on the work of people who preserved and documented the game long before us:

- **thethiny** — [KHUxTools](https://github.com/thethiny/KHUxTools) (resource and master-data tools),
  [KHUx-Server](https://github.com/thethiny/KHUx-Server) (server and API remake, original master data),
  [KHUx-Recomp](https://github.com/thethiny/KHUx-Recomp) (static recompilation and decompile of the 1.0.1 client),
  [Modding-Database](https://github.com/thethiny/Modding-Database). Most of what this project does builds on the
  formats he documented.
  **Without thethiny this project would most likely never have got off the ground.** His tools opened the game's
  data, his server showed that bringing it back was possible, and his public work gave us the map we followed from
  the very first day. We are deeply, truly grateful.
- **Roboloid** and **Ultimadei** — the [Roboloid KHUχ database](https://roboloid.github.io/khux/) (medal data,
  multipliers, special attack conditions, asset gallery).
- **KHUX Wiki** ([khuxwiki.com](https://www.khuxwiki.com/)) and **KH Wiki** ([khwiki.com](https://www.khwiki.com/)) —
  quests, medals, special attacks, events and images used as references.
- **ReLux Team** — research on the game's events, raids, Union Cross and campaigns, the archive and index of the
  official notices, player-made calculators, and pointers to community references, which guide the restoration of
  the event modes.
  - **LuxHollow** — ReLux lead developer, and a steady support to this project. The ReLux companion package gave us a late
    worldwide master snapshot: the schedule, quest and enemy rows of the 2018-2021 events (Org XIII, The Keyblade
    War, challenge events), and the reference for Coliseum seasons and boards, Union Cross, PvP, rankings, event
    boards and Boosters.
  - The ReLux Team also shared, with their permission, their index of the enemy graphics: it names the original record
    of every enemy texture, so the enemy animations, special attacks and hit effects are now rebuilt exactly as the
    game drew them.
- **SmellyOctopus** ([YouTube](https://www.youtube.com/@SmellyOctopus)) — thank you for teaching so many of us to
  play free-to-play wisely, and for keeping us company back then with videos full of joy. Those KHUX videos are now
  a huge help as references and information for the restoration.

## Repository rules

The code and documentation are our own work, under the MIT licence ([LICENSE](LICENSE)), which covers
only that. A few data files hold facts and short texts derived from community wikis and databases,
credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); names of games, characters, Medals and
places appear only to identify what the code works with and belong to their owners.

APKs, IPAs, OBBs, native libraries, assets, audio and Square Enix master data are never
versioned — `.gitignore` excludes them. Anyone who wants to reproduce the work has to dump
the client from their own device or installation; the project does not provide or link it.
Container format decoding and protector analysis tools are kept private.

**Non-commercial** project, for preservation and interoperability with a discontinued
service.
