# Phase C — the fields of the master tables

Target: the native client library of the **WW 4.3.1-72** build, the same as phase A.

| | |
|---|---|
| Master table classes | **107** |
| Tables with extracted fields | **106** (the 107th is the abstract base) |
| Total fields | **1,739** |
| **Of the 54 tables removed in the switch to offline** | **54 out of 54, 759 fields** |

Results: `recon/out/master_fields_ww431.json` and `master_fields_ww431.txt` (field names per table, in
order), `recon/out/master_types_ww431.json` (name and type of every column, in order). The analysis
method and its notes are kept private; this page keeps what the server needs.

---

## 1. Field names

The fields are in **camelCase** — `medalId`, `maxAttack`, `shuffleSkillGroupId` — and every table is
deserialized from JSON by key name.

## 2. The order of the fields is the order of the columns

The fields are listed in the order in which the client reads them, i.e. the order of the table's
columns — and the primary key comes first in **93 tables out of 106**:

```
Medal        medalId, imageId, thumbId, cutinId, imageCategory, artId, displayId, sortId, …
Shop         shopId, productId, sortId, type, os, price, coin, addCoin, …
LoginBonus   loginBonusId, bonusType, title, description, comment, day, startDate, endDate, …
Stage        stageId, stageBinId, id, name, mapName, useAp, chapterId, worldId, …
```

## 3. The `*Misc` tables are key/value pairs

Eight tables have **only two fields**: `Misc`, `DarkMisc`, `XtresMisc`, `MedalMisc`, `BattleMisc`,
`DarkBattleMisc` (`{miscId, value}` and similar), `SkillExp` (`{expId, value}`), `DarkMapList`
(`{mapId, mapListId}`). They are genuinely two-column tables, where the configuration is in the rows.

## 4. Types

The names and the order of the fields were followed by their **types** (`master_types_ww431.json`):
naming conventions cover a lot (`*Id`/`sortId`/`num`/`price` integers, `valid*`/`display`/`show`
booleans, `name`/`flavor`/`explanation`/`comment` strings, `startDate`/`endDate` timestamps), and every
type was then checked against what the client accepts from our server.

## 5. Tools

`recon/tools/master_fields.py` and `recon/tools/master_types.py` produced these schemas (the inputs they
need are kept private). The server reads only the outputs in `recon/out/`.
