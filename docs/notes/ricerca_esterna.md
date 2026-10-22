# External sources and contacts

No Square Enix material is in the repository, and this project does not provide, host or link it. The
files the scripts expect are dumped by each user from their own device or installation
([SETUP.md](../SETUP.md#files-you-must-dump-yourself)); on the author's PC they live under
`D:\Progetto_Restauro_KH_UX\`.

<a id="file"></a>
## Local inputs

| File | Where | Notes |
|---|---|---|
| Original APK 4.3.1 | `apk\khux-4.3.1-original.apk` | Square Enix v3 signature |
| `main.76…obb`, `patch.87…obb` | `obb76\` | 5.0.1 WW |
| APK 5.0.1 `base.apk` | `apk501\` | `ext\` = extraction; `extra_files\` = 55 master tables |
| `addnl.mp4/png` iOS IPA 4.3.1 | `ipa431\` | 10,145 records; KHUX layouts of 4.3.1 |
| `misc.mp4` IPA 4.4.0 | `ipa440\` | 2,403 `text/ui` texts, 21 layouts |
| assets of the APK 4.3.1 | `assets431\` | `json/server_api.json`, `info/` |
| khuxwiki | `wiki\` | `wiki_dump.py` (6,544 pages by template or ~27,000 with `--all`), `medals.json`, `quests.json` |
| thethiny | `external\thethiny` | binary rows `*_raw.json` and decodings `*_dec.json` |
| Roboloid | `external\roboloid\medal_db.json` | 2,100 medals with evolutions |
| reference sheets | `reference\spriters\` | 112 community sprite sheets, local only, for visual comparison |

- The 4.3.1 client looks for OBBs `main.60`/`patch.69`: not available; the 5.0.1 ones are used as KHUX
  resources ([risorse_layout.md](risorse_layout.md#pacchetti)). Avoid 4.4.0 (transition build).

<a id="fonti"></a>
## Data sources

Credits and licences are in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

- **thethiny/KHUxTools** and **thethiny/KHUx-Server** (GitHub): `data/*_raw.json` with binary rows
  of the masters of an earlier version (stage 1,140, enemy 665, medal 522, reward 1,457, player
  301). `raw_master.py` (reward, player with the 4.3.1 schema) and `raw_master_old.py` (stage, enemy, medal:
  `char[N+1]` strings, enemies with 5 levels, uncertain fields `unk_<offset>`).
- **Roboloid/khux** (GitHub: medals, avatar and pet parts, enemy frames, backgrounds), `src/search.js` =
  `medalDatabase`.
- **luxenvulpies/KHUX_Medal_Website** (1,881 medals).
- `xlash123/khux-re-api` (4.3.1 protocol, event enemy ids = 5 + album + rank);
  **wikiwiki.jp/khux** (quests 1-750).
- No public source is known for `mappoi`, the complete masters, the `sphere*`, `mission`,
  `moogleshop`, `shuffleskill` tables.
- User's guide (PDF) in `reference\guida_basi`: daily/weekly quests, login bonus,
  keyblade unlocks, tiers, traits.

<a id="contatti"></a>
## Community (ISSUES I-029)

- The project asks the community only for **information** (screenshots, videos, rules, guides), never
  for game files: README «What we are looking for» and the
  [Reddit post of 22 October](https://www.reddit.com/r/KingdomHearts/comments/1xcbwjg/).
- Study of thethiny's public repositories: `reference\world_schema\thethiny_repos.md` (local).
