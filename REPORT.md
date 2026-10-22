# KHUX / Dark Road — Technical reconnaissance for the offline restoration

**Date:** 2026-10-06 · **Phase:** 2 (recon) — completed
**Final goal:** Union χ + Dark Road fully playable locally.

---

## 1. Verdict

The full restoration is **feasible**, but the shape of the work is different from what was assumed at the start. Two substantial corrections came out of the reconnaissance:

1. **It is not Unity/IL2CPP/C#.** It is **Cocos2d-x with the game logic in native C++**. `libjs.so` is only JavaScriptCore, used by the Square Enix SDK, not by the game. No DLLs to decompile: ARM has to be disassembled.
2. **There are two network stacks, not one.** Besides the REST API there is **Photon (Exit Games)** for realtime multiplayer (Union Cross, party, raid).

The factor that makes the project realistic is that **the C++ symbols are not stripped**: 3,555 mangled names recovered, from which the whole architecture can be rebuilt — class names, methods and, above all, the **complete schema of the master data**.

---

## 2. Material acquired

| Artifact | Status | Value |
|---|---|---|
| `recon/ext/ww431/libcocos2dcpp.so` — **APK Worldwide 4.3.1-72** | ✅ ELF64 AARCH64, 33 MB, **not encrypted, with symbols** | **Primary target.** Last fully online build (Apr 2021), English. 107 master tables |
| `recon/ext/ww431/libcocos2dcpp-armv7.so` | ✅ ELF32 ARM, 20 MB | 32-bit variant of the same build |
| `recon/ext/tw252/` — APK Taiwan 2.5.2 | ✅ ELF32 ARM, **not encrypted, with symbols** | Older online build (~2 years). Useful as a cross-check |
| `recon/web/blobs/libcocos2dcpp-image.bin` (Web Edition 5.0.1 WW) | ✅ ELF64 AARCH64, **not encrypted, with symbols** | *Offline* build. The baseline that measures what was removed |
| `recon/web/blobs/libcocos2dcpp-aot.wasm` (Web Edition 5.0.1 WW) | ✅ 61 MB wasm | The ARM64 ELF recompiled AOT to WebAssembly |
| IPA Worldwide (1.0.1 → 4.4.0) | ❌ **FairPlay, `cryptid=1` on both slices** | Unusable for code analysis. Discarded |

> **Note on 4.4.0:** to be avoided as a target. It is from June 2021, *after* the shutdown on
> 30 May, so it is already a transition build. 4.3.1 (April 2021) is the last
> fully online one.

**Two checks:**

- Neither the APKs nor the IPAs contain the *content package*: the game downloaded code and assets from the CDN on first launch. 4.4.0 weighs 1.7 GB just for `aliud.mp4` (1.5 GB of video) — verified by reading the ZIP index.
- The content package survives **only in the 5.0.1 builds**: the Web Edition `Content.zip` (2.1 GB) and the Android OBB.

---

## 3. Reconstructed architecture

### 3.1 REST stack

Confirmed in the binary the strings that document the protocol already described by `xlash123/khux-re-api`:

```
sharedSecurityKey · X-HTTP-USER-TOKEN · accessToken · session_id · Authorization
```

Flow: handshake on `psg.sqex-bridge.jp/native/session` → obtaining the `sharedSecurityKey` → payload `JSON → base64 → AES-256-CBC → base64`, with gzip.

> **Strategic key point:** the AES key is *negotiated with the server*, not hardcoded in the client. A private server picks its own key and from that moment controls the whole channel. No secret needs to be extracted from the binary.

The API host is not a string in the native code: it arrives at runtime (it was later found to be delivered by the bootstrap response, [PHASE-A.md](PHASE-A.md)).

### 3.2 Photon stack (realtime)

The client embeds the standard Photon (Exit Games) LoadBalancing client over **eNet/UDP**: with `OperationRequest`/`OperationResponse`, CRC, fragmentation, and Diffie-Hellman encryption (`opExchangeKeysForEncryption`, `establishEncryption`). It is a standard, documented Photon protocol — reproducible with a self-hosted Photon Server or an open source reimplementation. **It does not need to be reverse-engineered from scratch.**

---

## 4. The most important result: the master data schema

In the binary **every game master table has its own JSON deserializer**, with the table's name. This is exactly the bottleneck I had pointed out as the main problem — and now it is precisely quantified.

| Build | master tables |
|---|---|
| TW 2.5.2 (online, 2019) | 63 |
| **WW 4.3.1 (online, Apr 2021)** | **107** |
| WW 5.0.1 (offline, May 2021) | 56 |

The comparison that matters is **WW 4.3.1 → WW 5.0.1**: same region, consecutive versions,
straddling the shutdown exactly. It measures the removal and nothing else.

| | |
|---|---|
| Kept | 53 |
| **Removed in the switch to offline** | **54** |

### The 54 tables to rebuild — the exact measure of the work

```
Achievement      Advertisement    BenefitResource  Colosseum        ColosseumStage
Comeback         CommunicationBgm CommunicationCategory CommunicationRoom CommunicationTalk
CommunicationThumbnail DarkMainMission DarkPve     DarkPveReward    DrawMedalType
DrawPetType      Emblem           EvCampaign       EvMedalList      EvResource
EvScoreReward    EvStage          GuiltProb        KeybladeSubslot  LoginBonus
Medal            Mission          Moogleshop       Multi            MultiStage
MultiTalk        MultiTimemission MypageBackground Passive          PassiveSetting
PetRank          PetSkill         Player           Pvp              PvpScoreReward
RaidReward       RaidSetting      Ranking          RankingPvp       RankingReward
Reward           SerialcodeReward Shop             Shuffleskill     SkillExp
Sphere           SphereArray      SphereMasu       Stamp
```

It reads like the autopsy of the removal: `Medal` (the medals), `DrawMedalType`/`DrawPetType`
(the gacha), `Shop`, `Moogleshop`, `Mission`, `Multi*` (Union Cross), `Raid*`, `Sphere*`
(sphere board), `Ranking*`, `Pvp*`, `Colosseum`, `LoginBonus`, `Ev*` (events),
`Communication*` (chat and rooms). It is precisely what disappeared from the app, leaving
the theater.

> **Correction with respect to the first draft.** An earlier version of this report
> stated 40 tables, computed by comparing the Taiwan 2.5.2 build with WW 5.0.1 —
> two regions and two years apart, so the diff also included the normal
> evolution of the game and missed part of it. The correct number is **54**. Whole
> systems missing from the earlier count: `Pvp`, `PvpScoreReward`, `RankingPvp`,
> `Moogleshop`, `Passive`/`PassiveSetting`, `KeybladeSubslot` and the five
> `Communication*`.

The 53 **surviving** tables (`Enemy`, `EnemyAttack`, `Stage`, `Skill`, `Buff`,
`Burst`, `BattleMisc`, `Keyblade`, `AvatarParts`, `Material`, `RaidEnemy`…) remain a
concrete advantage: the **combat engine is still intact in the offline client**.
It does not need to be rewritten — it only needs to be fed data again.

Files: `recon/out/master_classes_{tw252,ww431,ww501}.txt`,
`master_removed_ww431_to_ww501.txt`, `master_kept_ww431_to_ww501.txt`

---

## 5. What is still missing

1. ~~**APK Worldwide 4.x**~~ — ✅ **solved.** 4.3.1-72, dumped from an own installation, has
   both architectures and is not encrypted.
2. ~~**The field names of each table.**~~ — ✅ **solved** in [phase C](PHASE-C.md): every table is read from JSON by key name, so the names and the order of the columns are known.
3. **The pre-5.0 content package.** It exists only in the 5.0.1 builds. To be assessed how much of the Union χ assets survived in `Content.zip` (2.1 GB, not downloaded yet).
4. **Real values of the master data.** The schema comes from the binary; the *contents* (medal stats, drop tables, costs) have to be rebuilt from khuxwiki.com.

---

## 6. Revised plan and estimate

| Phase | Content | Estimate |
|---|---|---|
| **A** | ✅ APK WW 4.3.1 obtained · ⬜ derive host, endpoint list and request format | 1–2 weeks |
| **B** | Minimal REST server: AES/gzip crypto + session handshake. **Milestone: the client reaches the home screen** | 1–2 weeks |
| **C** | Extract the fields of the 54 tables; define the DB schema | 2–4 weeks |
| **D** | Populate the master data from khuxwiki; single-player quests and combat | 1–2 months |
| **E** | Self-hosted Photon for Union Cross / raid / PvP | 3–6 weeks |

**Realistic total: 4–7 months** for one person working on it continuously. Phase B is the one to do first because it is the point where the project stops being theoretical.

Two factors lower the risk more than I expected: the unstripped symbols, and the combat engine still intact in the client. The real work is **rebuilding the data**, not rewriting the game.

---

## 7. Tools produced (reusable)

| File | Function |
|---|---|
| `recon/tools/strings.py` | String extractor (replacement for `strings`, missing on Windows) |
| `recon/tools/demangle.py` | Recovers and classifies Itanium C++ symbols, with frequency per scope |
| `recon/tools/scope_methods.py` | Lists the members of the classes matching a pattern |
| `recon/tools/elfinfo.py` | Class/endianness/architecture of an ELF |

---

## 8. Legal note

Reverse engineering for interoperability and preservation of a discontinued service is generally defensible. **Only the server code** is distributed: never Square Enix APKs, assets, audio or master data. Non-commercial project.

---

## 9. Recommended next step

Complete **phase A**: derive host and endpoints from the protocol strings of the WW 4.3.1 arm64
binary. That is what unlocks phase B, and phase B is the first one where something shows
on screen. (Done: [PHASE-A.md](PHASE-A.md), [PHASE-C.md](PHASE-C.md).)

In parallel, it is worth contacting **Restoration Union** — if they already have traffic captures from 2021, we skip weeks of work.
