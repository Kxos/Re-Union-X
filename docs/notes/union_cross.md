# Union Cross (multiplayer)

«Union Cross» section of the Quest screen, unlocked after Quest 24. Server:
`server/multi.js` (hooked in by `server.js`: routes `/multi/*` -> `multi().respond`), tables
`server/make-multi-tables.js`.

<a id="api"></a>
## `/multi/*` actions

| Action | Request body fields | Response read by the client |
|---|---|---|
| 158 GET `/multi/status` | none | `serverAddress` string (req.), `multiEvents[]` (req.; element: `multiId` int, `useAp` int, `endTime` "YYYY-MM-DD HH:MM:SS", `bannerUrl` string), `multiUsers[]` (optional, elements like `supportUsers`) |
| 159 GET `/multi/talk` | none | `multiTalkIds[]` |
| 160 POST `/multi/create` | `multiId` | `userRandomEnemies[]`, `userEnemyDropItems[]`, `userTreasures[]`, `userRandomEnemyLevel[]` ({`uniqueSymbolEnemyId`, `addLevel`}), `timeMissionIds[]`, `multiStageId` uint, `multiRoomId` uint64 |
| 161 POST `/multi/recreate` | `multiId`, `prevMultiRoomId` | as 160 |
| 162 POST `/multi/start` | `multiId`, `multiStageId`, `userKeybladeId`, `roomCreateUserId`, `multiRoomId`, `isSteal` | `userData.userPoint`, `userKeybladeId` uint64, `campaigns[]`; then the client takes the room from its Photon connection and prepares the battle |
| 163 POST `/multi/clear` | `exp`, `money`, `lux`, `getPoint`, `materialId`, `number` | as `/stage/clear` (userPoint, userDetail, rewards, stageResumption, Burst lists): automatic schema, never seen |
| 164 POST `/multi/retire` | none | only `ret` |
| 165 POST `/multi/continue` | none | `userKeyblades[]` |
| 166 GET `/multi/matching/member/list` | none | key **`matchingMemberList`** (elements like `supportUsers` of `/stage/support/list`); empty accepted |

- Before the work: `/multi/status` passed with the schema (`serverAddress`, `multiEvents` empty) and
  166 received only `ret` -> rejected -> «200 ERROR :166».
- Public servers (thethiny/KHUx-Server etc.): to be checked (research in
  `reference\union_cross\NOTE.md`).

<a id="flusso"></a>
## Flow in the client

1. Tap on «Union Cross» (Quest screen): `/multi/status`, then `/multi/matching/member/list`, then the
   panel `AdventureTop2_Multi_Button`.
2. The panel needs **at least one entry in `multiEvents`** (empty = crash) and a row of the `multi`
   master for `multiEvents[0].multiId` (missing row = crash); the row's `detailUrl` (empty = Detail button
   hidden). Buttons: `Button_MultiStart`, `Mu_DetailButton`, `Button_Mu_Board` (board),
   `Button_Last_Member` (visible only with a non-empty `matchingMemberList`: opens the list of the Party
   members looking for companions, `PartyTop_MultiMemberList_Scene_ver150`, through action 166).
3. `Button_MultiStart`: stage parameters from `multiEvents[0]` (useAp, multiId) -> deck screen
   (`StartDeckMultiScene_ver260`).
4. Deck confirmation -> matching panel
   (`StartDeckMulti_PartyMatching_Base/HostPanel/GuestsPanel/AcceptPanel`) and **`/multi/create`**.
5. After `/multi/create` the client connects to a Photon server at `serverAddress` from `/multi/status`
   (custom authentication, master server, UDP), joins a lobby named `"50:<hex hash>:<n>"` and creates or
   joins a room (room properties `"%d:%d:%d"`).
6. In the room the host presses Start (`Button_Start`/`Button_LockStart`) -> `/multi/start`
   (`roomCreateUserId`/`multiRoomId` taken from the Photon room) -> battle synchronized with Photon
   events -> `/multi/clear` or `/multi/retire`; result `BattleResultMultiScene_ver150`. Connection error:
   `StartDeckEdit2_MultiConnectionError`.

<a id="offline"></a>
## What works offline and what does not

- `server/multi.js`: `/multi/status` with `serverAddress = <IP di KHUX_PUBLIC_URL>:5055` and one
  event for each valid and open row of the `multi` master; 166 with `matchingMemberList: []`;
  `/multi/create` and `/recreate` with the row's stage and a progressive `multiRoomId` (saved in
  `player.multiRoom`); `/multi/start`, `/retire`, `/continue`, `/talk` minimal; `/clear` from the
  automatic schema.
- `server/make-multi-tables.js`: master `multi` (multiId 1, always open, `useAp` 5,
  multiStage 1) and `multiStage` (1, `stageBinId` 1010). Real rows not found.
- UDP listener on port 5055 (`KHUX_PHOTON_PORT`, `KHUX_PHOTON=0` turns it off): it logs the
  client's datagrams (`[photon]` in the console) and does not reply, so the connection times out.
- **Not possible offline: the room and the match.** `/multi/start` arrives only after entering
  the Photon room, and the battle is synchronized with Photon events. It needs an emulator of a
  Photon master/game server (UDP «Photon reliable UDP» + Protocol16 serialization, operations
  Authenticate/JoinLobby/JoinOrCreateRoom/RaiseEvent, maybe encryption) with a single player in the
  room: a separate piece of work. The bench `[photon]` logs are the starting point.
- NPC companions: in the client there is no trace of filling with AI (the members come from the room).

<a id="banco"></a>
## Test on the bench

1. `node server\make-multi-tables.js`, then server restart with master revision + 1
   (`relogin.ps1 -Revision <n+1>`).
2. Quest -> Union Cross: no more «200 ERROR :166»; the panel shows the event. If it crashes,
   look at the panel (`multiEvents`, `multi` row) and the images of `Mu_Banner`/`Mu_Ground` (empty
   `bannerUrl`).
3. Start -> deck -> confirm: `/multi/create` in the log, then `[photon]` lines (the client tries
   port 5055) and after the timeout the connection error popup.

<a id="layout"></a>
## Layouts and textures of the Union Cross path

Check on `catalog\layouts.tsv`/`textures.tsv` (68 layouts, sub-layouts included, starting from
`AdventureTop2Scene_ver350`, `AdventureTop2_Multi_Button`, `PartyTop_MultiMemberList_Scene_ver150`,
`StartDeckMultiScene_ver260`, `StartDeckMulti_*`, `StartDeckEdit2_MultiConnectionError`,
`BattleResultMultiScene_ver150`, `ActionMap_*Multi*`): **all present** in the resources; no
layout to generate for panel, deck, matching and connection error.

- Missing textures (only after entering the room or in battle, so not reachable
  offline): `ActionMap_MultiBoss_EnemyCount` (MultiBoss_EnemyCount01, TimeAttack_num1),
  `ActionMap_MultiBoss_EntryGauge` (MultiBoss_EntryGauge01/02), `BattleResult_MultiBattle_Win_ver150`
  (Result_Clear_Raid), `StartDeckEdit2_FieldMenu_Multi_ver350` (But32_*, Multi_Info_title,
  Multi_Member_Panel0), `PartyTop_MultiMemberList_ver150` (Bg_Shade_Top, Conpane_Top3).
- **Certain crash if reached**: `PopupNormal_Continue_Multi` has `Countdown_panel` with 9-slice on
  Plate21, missing (crash, I-049): to be replaced like `NO_PLATE21` of `make_layouts.py`
  (but keeping the countdown visible) when the multi battle becomes possible.
- In `catalog\missing_layouts.txt`: `PopupNormal_Party_General`/`_JoinRequest` (join
  request by tapping a member of the list: with an empty list it does not
  open), `PopupNormal_Invitation_NotJoin`/`_Invitation_Jewel`/`PopupNormal_Party_Jewel`
  (invitations), `BattleResultMultiRankUP(Lock)Scene_ver220`,
  `BattleResult_GetItemMulti_ver220`, `BattleResult_MultiMember_Panel_ver220` (multi result),
  all the `PartyTop_*` (I-006).

<a id="originale"></a>
## What the original was like (`D:\Progetto_Restauro_KH_UX\reference\union_cross\NOTE.md`)

- Union Cross panel of the Quest screen: event banner, AP pill, «Details», big red
  «Begin»; on the right «Cross Board» and «Previous Members» (= `Button_Mu_Board`,
  `Button_Last_Member`).
- Up to 6 players of the same Union; «Start with Party» with «Lock Party»; otherwise public
  matching. Lobby: host + 5 columns, countdown. If nobody joins the host can start
  alone (but always in a Photon room); no filling with NPCs.
- Cross Coins (rewards: completion 150, «No Support Needed» 100, MVP 150, mission 75) spent on the
  event Cross Boards: `coinId` of the `multi` master is probably the event currency.
- No public rows of the `multi*` masters and no JSON example of `/multi/*` (thethiny does not
  implement multiplayer); list of the 2017-2021 events in
  `reference\union_cross\data\khuxwiki_Union_Cross_Quests_wikitext.txt`. Official banners
  900x200 and 640x140 (`bannerUrl`) in the same folder.
