# Third-party notices

Re-Union X is an unofficial, non-commercial fan restoration of *Kingdom Hearts Union χ[Cross]*. The
project's own code and documentation are under the MIT licence ([LICENSE](LICENSE)); that licence covers
nothing listed below.

## Square Enix and Disney

*Kingdom Hearts*, *Kingdom Hearts Union χ[Cross]*, *Kingdom Hearts Dark Road* and every related name,
character, image, sound, text and piece of game data are the property of **Square Enix Co., Ltd.** and
**Disney** (and, where applicable, other rights holders). This project is **not affiliated with, endorsed
by or sponsored by** Square Enix, Disney or any of their partners. Names of games, characters, Medals,
quests and places appear in this repository only to identify what the code works with.

This repository does not contain or distribute the game client, its packages, assets or audio, nor the
original master data files. It does contain a limited set of **factual tables, partly reconstructed**, that
the server needs where the original tables are lost; their content is facts and short names (ids, numbers,
item and mission names) gathered from the community sources below and from screenshots and videos of the
game:

- Avatar Board grids (`server/tables/sphere.json`, `sphereArray.json`, `sphereMasu.json`): reconstructed
  from KHUX Wiki pages and screenshots of the boards;
- mission names and conditions (`server/tables/mission.json`, `server/limited_missions.tsv`): KHUX Wiki;
- passives (`server/tables/passives.json`): KHUX Wiki «Passives»;
- Spirit tables (`server/tables/petRank.json`, `petSkill.json`, `petParts.json`, `server/pet_parts.tsv`,
  `server/pet_points.json`): KHUX Wiki and KH Wiki (see below for the CC BY-SA files);
- Trait Medals (`server/trait_medals.json`): KHUX Wiki «Trait Medal» and the original in-game notices;
- small lookup files of the build tools (`recon/tools/*.tsv`, `*.json`: resource names, ids and our own
  mappings).

Users must dump the files the scripts expect from their own device or installation; the project does not
provide, host or link them.

## Community sources

Facts, names and values from the following community projects were used as references. Where data
derived from them is in the repository, it is listed here; the original authors keep their rights.

### KH Wiki (khwiki.com) — CC BY-SA 4.0

Text of the KH Wiki is available under the
[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/) licence.
Data in this repository derived from KH Wiki pages (Medal, Special Traits, Spirit parts, story music
notes, enemy pages) is shared under the same licence, with attribution to the KH Wiki contributors:

- `server/pet_parts.tsv`, `server/tables/petParts.json` (Spirit part names, together with the KHUX Wiki);
- `server/make-pet-tables.js` (Special Trait list: names and unlock rates; Spirit Trick values);

These three files carry an `SPDX-License-Identifier: CC-BY-SA-4.0` note with the attribution (at the top of
`pet_parts.tsv` and `make-pet-tables.js`; in `server/tables/petParts.json.license` for the JSON file, which
cannot hold comments). Also using KH Wiki facts (short references, no copied text):

- `server/make-story-oltre.js` (music of quests 526-979, read at build time from a local dump);
- the wiki references in `docs/notes/` and `docs/ISSUES.md`.

### KHUX Wiki (khuxwiki.com)

Quest objectives, mission names, Medal values, keyblade levels, Spirit Tricks, area descriptions and many
other facts come from the KHUX Wiki and its contributors. No licence is stated for that wiki (checked on
22 October 2026: the page footer states none; the local dump only has per-image CC BY-SA 3.0 templates);
data taken from it is kept to facts and short names, credited here:

- mission names and conditions: `server/tables/mission.json`, `server/limited_missions.tsv`,
  `server/make-beginner-missions.js`, `server/make-limited-missions.js`;
- area connections and their short wiki descriptions: `recon/tools/world_links.json`;
- guest allies of the story quests: `recon/tools/ally_families.json`;
- keyblade levels: generated locally by `server/make-keyblade-levels.js` from a local wiki dump, never
  versioned;
- Spirit Trick effects and values (texts rewritten in our own words): `server/make-pet-tables.js`,
  `server/tables/petSkill.json`;
- Medal, quest, enemy and skill values read at build time from local dumps (`recon/tools/wiki_dump.py`).

Other wikis consulted for facts: **wikiwiki.jp/khux** (quests 1-750).

### Roboloid & Ultimadei

The [Roboloid KHUχ database](https://roboloid.github.io/khux/) (medal data, multipliers, special attack
conditions) was used as a reference; its files are read locally at build time and are not in this
repository.

### thethiny

[KHUxTools](https://github.com/thethiny/KHUxTools), [KHUx-Server](https://github.com/thethiny/KHUx-Server)
and [KHUx-Recomp](https://github.com/thethiny/KHUx-Recomp) (MIT licence, © 2026 thethiny; their licence
explicitly excludes game data, assets and binaries) documented the formats and the master data this
project builds on. No code from them is copied here; game data from them is read locally and is not in
this repository. [Modding-Database](https://github.com/thethiny/Modding-Database) (GPL-3.0) was consulted
as a reference only; nothing from it is included.

### xlash123

[khux-re-api](https://github.com/xlash123/khux-re-api) documented the 4.3.1 protocol; its findings were
confirmed independently from the client and re-implemented in our own code (`server/khux-codec.js`).

### Other references

- **luxenvulpies/KHUX_Medal_Website**: medal list, consulted as a reference.
- Screenshots and videos of the original game by many players, used as visual references only (kept
  locally).

## Fonts

The project portal (`docs/index.html`) loads **M PLUS Rounded 1c** from Google Fonts, under the
[SIL Open Font License 1.1](https://openfontlicense.org/).
