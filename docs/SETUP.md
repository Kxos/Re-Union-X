# How to play Re-Union X — setting up the restored game on your own Windows PC

> **Read this first.**
>
> - **Today the way to play is long and complex.** Everything below is the real procedure used on the
>   development PC, written down honestly, including the parts that are still hard or impossible for
>   someone outside the project ([steps that are hard today](#current-limitations)). Once the work is
>   finished the process will be simplified into a **single launcher**; until then, expect to spend time on it.
> - **The game is a work in progress.** Expect bugs and crashes. You are very welcome to report them
>   ([Reporting bugs](#reporting-bugs)) and we will try to fix them as soon as possible.
> - **Unofficial fan project.** It is not affiliated with, endorsed or sponsored by Square Enix or Disney;
>   *Kingdom Hearts* and all related names and assets belong to their owners
>   ([THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)).
> - **This repository never distributes Square Enix files** (APK, OBB, IPA, assets, audio, master
>   data). You must dump them yourself from your own device or your own installation of the game; this
>   project does not provide, host or link them. This guide only lists which files the scripts expect.

Everything here is derived from the scripts in [`tools/ldplayer/`](../tools/ldplayer/) and from
[HANDOFF.md](../HANDOFF.md#restarting), [banco.md](notes/banco.md), [server.md](notes/server.md),
[protector.md](notes/protector.md), [risorse_layout.md](notes/risorse_layout.md) and
[ricerca_esterna.md](notes/ricerca_esterna.md). Status of this guide: 22 October 2026.

## Contents

1. [What you get](#what-you-get)
2. [Requirements](#requirements)
3. [Files you must dump yourself](#files-you-must-dump-yourself)
4. [First-time setup](#first-time-setup)
5. [Building the game data and resources](#building-the-game-data-and-resources)
6. [Starting a session](#starting-a-session)
7. [Daily use](#daily-use)
8. [Troubleshooting](#troubleshooting)
9. [Reporting bugs](#reporting-bugs)
10. [Current limitations](#current-limitations)
11. [Known machine-specific settings](#known-machine-specific-settings)

---

## What you get

The **original, unmodified** Android client of *Kingdom Hearts Union χ[Cross]* WW 4.3.1, running in the
LDPlayer 9 emulator on your PC and talking to a local server (`server/server.js`, Node.js) instead of the
Square Enix servers that closed in 2021. Single-player only: new player and Prologue, home screen, story
quests **1-979** on the original maps and rooms, Medal List, Level Up, Evolve, Moogle Shop, Shop with the
original banners, Profile, Missions, Avatar Boards, pet. Every difference from the original game is
explained in the in-game Notices ([web version](https://kxos.github.io/Re-Union-X/notices/)).
No Union Cross, raids, Coliseum PvP or events yet.

## Requirements

| What | Version / setting | Why |
|---|---|---|
| **Windows** 10 or 11, 64-bit | the bench runs on Windows 11 Pro | all scripts are PowerShell 5.1 (`powershell.exe`) |
| **LDPlayer 9** | **9.5.37** is the tested build; download the real 9 package `https://res.ldrescdn.com/download/package/LDPlayer9.0.exe` (the site's «LDPlayer 9» button installs LDPlayer 14) | the only bench where the game's LIAPP protector lets the original APK start ([protector.md](notes/protector.md)) |
| LDPlayer instance | **instance 0**, **Android 9 (64-bit)**, resolution **1920x1080** (landscape), **root off** | the scripts talk to instance 0 and tap at 1920x1080 coordinates; the protector rejects other Android versions (code 13380225 on Android >= 12) and repackaged APKs (code 90) |
| **Node.js** | any recent LTS; the bench uses **v24.14.0** | the server; **no npm packages** to install |
| **Python** | **3.10** (the bench uses 3.10.11), on `PATH` as `python` | resource-building tools in `recon/tools/` |
| Python packages | `pip install pillow numpy scipy` (bench: Pillow 12.2.0, numpy 2.2.6, scipy 1.15.3) | the only third-party imports of `recon/tools/` (Pillow and numpy for textures and maps, scipy for `make_nova_logo.py`) |
| **Git for Windows** (with Git Bash and its OpenSSL) | any | cloning, and `server/make-cert.sh` (OpenSSL 3.x) |
| **Disk space** | plan for **at least 60 GB free** on the drive that holds the work folder | inputs ~7 GB (OBBs 2.1 GB, 5.0.1 APK 0.2 GB, IPAs 0.2 GB, other non-public inputs ~5 GB or more), intermediate packs a few GB, **every resource version ~4.2 GiB** (versions share the OBB parts through hard links, so the folder must be on NTFS), plus ~4.2 GiB inside the emulator and a download cache peak; the author's `resource_data` folder holds 30 GB of old versions |
| RAM | 16 GB recommended | after several 2-4 GB downloads `Ld9BoxHeadless` grows to ~30 GB committed memory ([banco.md](notes/banco.md#ldplayer)) |
| Administrator rights | only to change the Windows DNS server and, if needed, firewall rules | see [Network](#44-network-windows-dns-ip-firewall) |

**Not needed for playing:** Java/JDK, Ghidra, Android Studio / `adb`, apktool, MuMu, a phone. Those were
only for the research work (phase A/C), whose tools are kept private.

## Files you must dump yourself

None of these are in the repository (`.gitignore` excludes them), and this project does not provide,
host or link them: dump them from your own device or your own installation of the game. The «Where it
goes» column uses the folder layout the scripts expect today
([Known machine-specific settings](#known-machine-specific-settings)): `<W>` = the work folder,
`D:\Progetto_Restauro_KH_UX` on the author's PC.

| File | Version | Where it goes | What for |
|---|---|---|---|
| Android APK `com.square_enix.android_googleplay.khuxww`, **arm64-v8a** variant | **WW 4.3.1** (April 2021; not 4.4.0, a post-shutdown transition build) | `<W>\apk\khux-4.3.1-original.apk`, and its `lib/arm64-v8a/libcocos2dcpp.so` extracted to `<repo>\recon\ext\ww431\` | the game itself (installed unmodified in LDPlayer); the library is read by the resource index builder |
| `main.76.com.square_enix.android_googleplay.khuxww.obb` | 5.0.1 WW | `<W>\obb76\` | base game graphics served as KHUX resources |
| `patch.87.com.square_enix.android_googleplay.khuxww.obb` | 5.0.1 WW | `<W>\obb76\` | same |
| `base.apk` of the offline client | **5.0.1** WW | extracted (it is a zip) to `<W>\apk501\ext\` | `assets\aliud.png` (index of the OBBs) and `lib\arm64-v8a\libcocos2dcpp.so`, which holds the **resource key** (read through a local, untracked configuration: `recon/tools/private_tools.py`); its `extra.mp4` holds the 55 offline master tables (`<W>\apk501\extra_files\`) |
| iOS IPA | **WW 4.3.1** | `addnl.mp4` + `addnl.png` (and the name list `names_addnl.tsv`) in `<W>\ipa431\` | the KHUX layouts of 4.3.1 that the Android OBBs lack |
| iOS IPA | **WW 4.4.0** | its `misc.mp4` data in `<W>\ipa440\miscdata`, name list `names440misc.tsv` | 2,403 original `text/ui` texts, a few layouts and images |
| Local reference data folders (not provided by this project) | JP 4.3.1 game data (the folder with `cocostudio/`, `json/`, `lwf/`, `stage/`, `text/` ...) and a work folder derived from it (`bundle2016/files`, `rooms_merged/`, `schema_v2_work/`) | anywhere: environment variables `KHUX_JP_DATA` / `KHUX_REF_WORK`, or `local_paths.jp_data` / `local_paths.ref_work` in the untracked `khux_local.json` (read by `recon/tools/private_tools.py` and `server/local-paths.js`) | original story maps and rooms of quests 1-979, enemy graphics, JP CocoStudio layouts, NPC texts, many images; **not provided by this project** ([Current limitations](#current-limitations)) |
| thethiny `KHUx-Server` data | `data/*.json` (`burst.json`, `enemyAttack.json`, `stage.json` ...) | `<W>\external\thethiny_2026-10-13\KHUx-Server\data\` and `<W>\external\thethiny\` | values used when generating the master tables; community project credited in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) |
| Roboloid medal database and images | `medal_db.json`, medal PNGs | `<W>\external\roboloid\` | medal values and medal images (`fetch_medal_images.py`); community project credited in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) |
| khuxwiki dumps | `medals.json`, `quests.json`, `wiki_all.json`, `enemy_stats_oltre.json` | `<W>\wiki\` | medal values, quest objectives, enemy stats; made with `recon/tools/wiki_dump.py` from [khuxwiki.com](https://www.khuxwiki.com/) |

## First-time setup

### 4.1 Clone and folder layout

The scripts currently use **fixed paths**. The least painful way today is to reproduce the author's layout
exactly (if your PC has no `D:` drive, `subst D: C:\SomeFolder` gives you one for the session):

```
D:\Progetto_Restauro_KH_UX\                    <W>, the work folder (NTFS)
├── Android\KH-UX-Dark-Road-Restoration\       this repository
├── LDPlayer\LDPlayer9\                        LDPlayer 9 install folder (ld.exe, ldconsole.exe)
├── apk\  apk501\  obb76\  ipa431\  ipa440\    the files of the table above
├── external\  wiki\  reference\
├── resource_data\<N>\{data,index}             built resource versions (served to the game)
├── stage_gen\  rooms_gen\  enemy_gen\  medal_gen\  raisedraw_gen\  compact\  catalog\  layouts\
├── logs\server.log                            server log written by run-server.ps1
└── screenshots\                               screenshots and tombstones from the scripts
```

```powershell
git clone https://github.com/Kxos/Re-Union-X.git D:\Progetto_Restauro_KH_UX\Android\KH-UX-Dark-Road-Restoration
cd D:\Progetto_Restauro_KH_UX\Android\KH-UX-Dark-Road-Restoration
```

Run the scripts from the repository folder in Windows PowerShell. Their messages are in Italian.

### 4.2 Install LDPlayer 9 and the APK

1. Install LDPlayer 9 (link in [Requirements](#requirements)) into `D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9`.
2. Keep instance 0 at its defaults: Android 9 64-bit, 1920x1080, **root off**. Settings can only be changed
   with the instance off (`vms\config\leidian0.config`).
3. Start it and install the **original** APK (never a patched or re-signed one: LIAPP refuses it with code 90).
   `adb` does not work with this LDPlayer version; use its own tools:

   ```powershell
   D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9\ldconsole.exe launch --index 0
   D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9\ldconsole.exe installapp --index 0 --filename D:\Progetto_Restauro_KH_UX\apk\khux-4.3.1-original.apk
   ```

4. Do not open the game yet: without the steps below it only shows the «End of Service» popup.

### 4.3 Certificate and guest script

The game talks HTTPS to `*.kingdomhearts.com` / `*.sqex-bridge.jp`; the local server answers with its own
certificate, and the emulator must trust its CA **as a system CA** (the original APK ignores user CAs and
cannot be re-patched).

1. Find your PC's LAN IPv4 (`ipconfig`, or `powershell -File server\lan-ip.ps1`). Give the PC a
   **fixed** address (DHCP reservation in the router): the IP is baked into the certificate and the scripts.
2. In **Git Bash**, from the repository folder:

   ```bash
   bash server/make-cert.sh <your-ip>          # writes server/certs/ca.crt, server.crt, server.key (backdated to 2020)
   openssl x509 -subject_hash_old -noout -in server/certs/ca.crt    # prints the hash, e.g. dc2bc61b
   ```

3. Copy into LDPlayer's shared folder `C:\Users\<you>\Documents\XuanZhi9\Misc\` (seen in the guest as
   `/mnt/shared/Misc`):
   - `server\certs\ca.crt` renamed to `<hash>.0` (e.g. `dc2bc61b.0`);
   - `tools\ldplayer\phaseb-guest.sh`.

`phaseb-guest.sh` (run as root through `ld.exe`) does four things, **none of them permanent**, so it must be
run again **after every emulator start**:

1. mounts a tmpfs copy of `/system/etc/security/cacerts` and adds the `*.0` CAs from `Misc` (system CA);
2. redirects TCP 80/443 of the game's uid only to your PC (`iptables` DNAT);
3. sets the guest clock to **15 May 2021 12:00** (`051512002021.00`), automatic time off: after 29/6/2021
   the client shows the «End of Service» popup and never connects;
4. turns Android's private DNS off, rejects port 853 (DNS-over-TLS) and redirects port 53 to your PC.

### 4.4 Network: Windows DNS, IP, firewall

LDPlayer's VirtualBox NAT hands the guest **the DNS servers configured in Windows**, and only when the
instance starts ([banco.md](notes/banco.md#ldplayer)):

1. Windows Settings → Network → your Ethernet/Wi-Fi adapter → IPv4 DNS: set it to **your PC's LAN IP**
   (not `127.0.0.1`: VirtualBox discards loopback DNS servers). The local server forwards every name it
   does not hijack to `1.1.1.1`, so the PC keeps working while the server runs. **Set it back to automatic
   when you finish playing**: with the server off, the PC has no DNS.
2. After changing the DNS, fully restart LDPlayer (`ldconsole quitall`, then `launch --index 0`).
3. The server listens on UDP 53, TCP 80 and 443 (and UDP 5055, log only). On the bench no administrator
   rights were needed. If the network profile is «Public», add firewall rules (as administrator):

   ```powershell
   New-NetFirewallRule -DisplayName "KHUX server" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80,443 -Profile Any
   New-NetFirewallRule -DisplayName "KHUX DNS" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 53 -Profile Any
   ```

4. Turn VPNs off. If port 53 is taken (Internet Connection Sharing, started by Hyper-V/WSL):
   `Stop-Service SharedAccess` as administrator, `Start-Service SharedAccess` afterwards.

## Building the game data and resources

The server needs two things that cannot be in the repository because they are (or derive from) Square
Enix data: the **master tables** (`server/master_data/`, `server/game_data/`) and the **resource packs**
(`<W>\resource_data\<N>\`). Both are built on your PC from the files above.

### 5.1 Master tables (`server/master_data`, `server/game_data`)

> **Honest status:** there is **no single script** that rebuilds these folders from scratch today. They
> were built step by step over the project (29 `server/make-*.js` / `import-master.js` scripts, most of
> which modify the existing tables in place, plus `recon/tools/make_banner_catalog.py`,
> `make_banner_images.py`, `make_shop_art.py`, `gen_tours_v2.py` for `game_data`). Several scripts read
> research files of the author's work folder (`reference\`, `wiki\`, `stage_gen\orig_stages*`, `tmp\`).
> A reproducible rebuild script is a prerequisite of the launcher ([limitations](#current-limitations)).

The documented starting point ([old journal, «How to resume the work»](journal/fino-al-2026-10-11.md)):

```powershell
node server\make-master-stub.js --force          # 106 minimal tables
node server\import-master.js D:\Progetto_Restauro_KH_UX\apk501\extra_files `
  avatarParts initItem misc stage world stageDrama enemy enemyAttack keyblade skill buff `
  burst battleMisc badstatus tutorialMisc medalMisc material title theater raidEnemy raidEnemyAttack
$env:KHUX_MEDALS_ALL='1'; $env:KHUX_WORLDTOUR='1'; $env:KHUX_TOURS_V2='1'
node server\make-game-tables.js D:\Progetto_Restauro_KH_UX\wiki\medals.json
```

…followed by the other generators (`make-story-oltre.js`, `make-enemy-oltre.js`, `make-skill-table.js`,
`make-moogleshop.js`, `make-banners.js`, `make-login-bonus.js`, `make-pet-tables.js`, ...) whose order is
not written down in one place. **Project rule: never run `make-game-tables.js` alone** on an existing `master_data`:
it regenerates tables that the other generators then extend or patch. Check the result with `node server\check-stage-data.js`.
The 5.0.1 tables in `apk501\extra_files` are extracted from the 5.0.1 `extra.mp4` with the 5.0.1 key
(container format decoding and protector analysis tools are kept private; `recon/tools/private_tools.py`
says where the build looks for them).

After any change to `server/master_data`, raise the **master revision** (`-Revision`, default **178** in
`run-server.ps1`, `relogin.ps1`, `cycle.ps1`, `update-resources.ps1`) so the game downloads the tables again.

### 5.2 Resource packs

A resource version is: the 5.0.1 OBBs + `addnl` of the 4.3.1 IPA + static packs (medal images, recovered
rooms, original enemy graphics, draw-result animations) + the generated pack (maps, rebuilt layouts,
textures, texts), merged into one index ([risorse_layout.md](notes/risorse_layout.md#pacchetti)).

```powershell
.\tools\ldplayer\session\build-resources.ps1 -Version N     # N = next free number in <W>\resource_data
```

- Output: `<W>\resource_data\N\data\d0000...` (40 parts, ~4.2 GiB; every part under 2 GiB, total under
  20 GiB) and `index\misc.png`. It is built in `_build_N` and renamed only after the final checks, so a
  failed build is never served. **The server always announces the highest numbered version** — build only
  with the game stopped.
- What it reads (all under `<W>`): `apk501\ext\lib\arm64-v8a\libcocos2dcpp.so` (key) and
  `apk501\ext\assets\aliud.png`; `obb76\main.76…obb`, `patch.87…obb`; `ipa431\addnl.{mp4,png}`,
  `names_addnl.tsv`; `ipa440\names440misc.tsv`, `miscdata`; `resource_data\7\data` (the base version,
  OBB + addnl in 64 MB pieces made with `recon/tools/resource_split.py`) and `resource_data\names_v4.tsv`
  (name list); the local reference data folders (`jp_data`; `ref_work\bundle2016\files`);
  `layouts\orig`, `layouts\ui_texts`; `catalog\files`, `catalog\enemy_wait`, `catalog\keyblade_lwf`,
  `catalog\raisedraw_ww`, `catalog\img_alias`, `catalog\ipa440_extract`; `external\roboloid\cache\map`;
  `reference\empty_slot\stock_medal_khuxwiki.png`; the static packs `medal_gen\files`
  (`fetch_medal_images.py`), `rooms_gen\files` (`make_jp_rooms.py`, ~10 min the first time),
  `enemy_gen\files` (`make_jp_enemies.py`), `raisedraw_gen`; `stage_gen\files` (story maps from
  `import_orig_stages.py`); `compact\` (cache); and `server\master_data\*.json`,
  `<repo>\recon\ext\ww431\libcocos2dcpp.so`.
- Time: the generators and the merge take minutes once the static packs are cached; the first build on a
  new machine has never been measured.
- `-Quick` (~40 s) only rewrites the generated pack directly inside the emulator for layout tests. **Never
  use `-Quick` when a newer version than the installed one exists**; it is a developer tool, not needed to play.

## Starting a session

**Every time you start the emulator** (cold start, from [HANDOFF.md](../HANDOFF.md#restarting)):

```powershell
# 0. Windows DNS = your PC's IP (section 4.4)
# 1. emulator
D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9\ldconsole.exe launch --index 0
# 2. MANDATORY after every emulator start: system CA, clock 15/5/2021, DNS and TCP redirection
D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9\ld.exe -s 0 "sh /mnt/shared/Misc/phaseb-guest.sh <your-ip>"
# 3. server + game (existing player) up to the home screen
.\tools\ldplayer\session\relogin.ps1 -Tag x
```

The guest script prints `CA di sistema: N`, `uid del gioco ...: 80/443 -> <ip>`, the clock and
`DNS: privato spento, 53 -> <ip>, 853 chiusa`.

### First time: a new player

1. Start only the server: `powershell -File .\tools\ldplayer\session\run-server.ps1`
   (no save in `server\save\player.json` = new player). Its log is `<W>\logs\server.log`; the first lines say
   `risorse versione N: … file pronti` and `master : 106 tabelle valide`, then the four «in ascolto» lines.
2. Open the game in LDPlayer. If Google Play Games asks to sign in, close it with Back.
3. Title screen (it must say «Version 4.3.1» and **no** End of Service popup): tap **KHUX START**.
   Then: contract (Accept), date of birth (Register), **Download** (accept every Download dialog), opening
   movie (SKIP), name, avatar editor, Union choice, Prologue battle, results, home.
   (`cycle.ps1` automates exactly this, but it **deletes the save** first.)
4. The full resources (~4.2 GiB) are downloaded only by a player who has finished the tutorial. Once at the
   home screen, run:

   ```powershell
   .\tools\ldplayer\session\update-resources.ps1
   ```

   It restarts the server with `-TutorialFinished`, relaunches the game and waits for the download (~5 min)
   and the installation. **Then tap by hand KHUX START (200,1020) and Download (1220,715)** if the game is
   waiting on them. Do not close the game during the installation: a half-installed `files/r` crashes the home
   screen; if it happens, run `update-resources.ps1` again.

## Daily use

```powershell
.\tools\ldplayer\session\relogin.ps1 -Tag x                     # server + game with the saved player
.\tools\ldplayer\session\relogin.ps1 -Tag x -Save prove         # use server\save\prove.json instead of player.json
.\tools\ldplayer\session\relogin.ps1 -Tag x -RealNow 2026-12-09T10:00:00Z   # fake "now" (see below)
```

- **Saves** live in `server\save\` (`player.json` by default, `-Save <name>` = `<name>.json`). They are plain
  JSON written at every change; back them up by copying the file while the server is stopped.
- **Fake clock**: the server shows dates in a «twin» month of 2016-2021 with the same weekdays as today, and
  resets Daily/Weekly/monthly content at the real 08:00 UTC deadlines ([server.md](notes/server.md#orologio)).
  `-RealNow <ISO>` makes the server believe the real time starts at that instant (to reach the next day or week
  without waiting); after that the time flows normally. The emulator clock always stays at 15/5/2021.
- **Never restart only the server with the game open**: the session key is lost and the game can no longer
  talk to it. Always use `relogin.ps1`.
- At the end: close the game, stop `node` (`Get-Process node | Stop-Process`), set the Windows DNS back to
  automatic.

| Script (`tools/ldplayer/session/`) | What it does |
|---|---|
| `run-server.ps1 [-Revision N] [-RealNow ISO] [-Save name] [-TutorialFinished]` | starts only the server (`node server\server.js`) with the environment it needs (public URL, resource folder, resource key from the local configuration, pet on); log in `<W>\logs\server.log` |
| `relogin.ps1 -Tag x [same options]` | stops `node`, starts `run-server.ps1` detached, relaunches the game and taps KHUX START until `/khux/login`, then waits for the home (screenshot `x_home`) |
| `cycle.ps1 -Tag x` | **deletes `server\save\player.json`** and plays a new player automatically up to the home |
| `update-resources.ps1` | makes the game download and install the newest resource version, then `relogin.ps1` |
| `build-resources.ps1 -Version N` / `-Quick` / `-DryRun` | builds a resource version ([5.2](#52-resource-packs)) |
| `story.ps1 -Tag x` | plays the story quest marked NEW (bench automation) |
| `sweep.ps1`, `login-time.ps1` | developer checks (button map, login timing) |

Other scripts in `tools/ldplayer/`: `bench_start.ps1` (launch + KHUX START for an existing player),
`bench_flow.ps1`/`bench_prologue.ps1` (new player automation), `tombstone.ps1` (crash capture; the deeper capture tools are kept private).
All of them use `bench_lib.ps1`, which **refuses to tap when the game is not running** (taps on the LDPlayer
home open advertising tabs in your browser).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| **«End of Service Notification»** popup on the title screen | the guest clock is after 29/6/2021: `phaseb-guest.sh` was not run after the emulator start. Run it, then relaunch the game |
| **«A connection error has occurred (6 ERROR :251)»** | the name does not resolve: Windows DNS not set to your IP, LDPlayer not restarted after the change, server not running, or `phaseb-guest.sh` not run (private DNS still on). One error right after a server restart is normal: OK retries |
| **«7 ERROR»** / guest without network (`ip route` has no default route) | `ldconsole reboot --index 0`, wait for boot (`ld.exe -s 0 "getprop sys.boot_completed"` = 1), `phaseb-guest.sh`, `relogin.ps1`. If it persists after a quick restart: `ldconsole quitall`, wait until `Ld9BoxHeadless` is gone, end the leftover `VBoxNetDHCP`/`VBoxNetNAT`, launch again |
| TLS errors / no HTTP request in the log, only DNS lines | the CA is missing as a system CA (`CA di sistema` count unchanged): check the `<hash>.0` file in `Misc` and that the certificate was made for your current IP |
| **Black screen** or stuck after login | a resource download or install was interrupted, or the installed version does not match the served one: run `update-resources.ps1` and let it finish |
| **Crash** to the LDPlayer home | right after an installation a one-off crash is known: relaunch. Otherwise note what you did and report it ([Reporting bugs](#reporting-bugs)); developers capture it with `tombstone.ps1` ([banco.md](notes/banco.md#crash)) |
| **Download stuck** or downloads everything again at every start | full disk in the guest («Save error … storage space»): free space; or a newer version was built while the game was running. Run `update-resources.ps1` and wait until it says `installate` |
| «Game data has been updated. You will be returned to the title screen.» | the master revision changed (new week/month or new `-Revision`): OK, then log in again (`relogin.ps1`; twice if the first crashes after the master download) |
| LDPlayer error **«g_pPipeMemHead->arBufHead[i].usingPipeId != nPipeId»** and LDPlayer crash | several `ld.exe` at once, or one killed halfway. Never kill `ld.exe`; `ldconsole quit --index 0`, `launch`, `phaseb-guest.sh` again. The scripts serialize `ld.exe` with a system mutex |
| «paging file too small» from `ld.exe` | LDPlayer memory grew after big downloads: `ldconsole quit --index 0`, `launch`, `phaseb-guest.sh` |
| Title screen does not react, Android dialog «Launcher3 isn't responding» | tap «Wait» (640,649), then run `bench_start.ps1` or `relogin.ps1` again |
| Server does not start, port in use | another `node` is running (`Get-Process node`), or port 53 is taken by `SharedAccess` (section 4.4) |

## Reporting bugs

Bugs and crashes are expected: please report them, we will try to fix them as soon as possible.

- **[Open a bug report](https://github.com/Kxos/Re-Union-X/issues/new?template=bug_report.yml)**
  (GitHub issue form of this repository), or
- reply to the [Reddit post](https://www.reddit.com/r/KingdomHearts/comments/1xcbwjg/).

Be as descriptive as possible. Checklist:

- [ ] what you were doing: screen, quest number, the exact steps to reproduce it;
- [ ] what you expected and what happened instead;
- [ ] the exact error text, or a screenshot / short video;
- [ ] whether it happens every time;
- [ ] date and time (with time zone), so we can find it in the logs;
- [ ] resources version and master revision if you know them: the first lines of `logs\server.log` say
      `risorse versione N`; the master revision is the `-Revision` you used (default in `run-server.ps1`);
- [ ] emulator and version (e.g. LDPlayer 9.5.37, Android 9) and your Windows version;
- [ ] the server log `D:\Progetto_Restauro_KH_UX\logs\server.log` (path used by the session scripts) if you
      can share it; it contains your player name and your PC's IP, nothing else personal.

Template to copy, fill and paste:

```markdown
**Summary:** <one line> — e.g. Game crashes when opening Evolve on a 6★ medal

**Where (screen / quest number):** e.g. Medal List > Evolve; or Quest 670

**Steps to reproduce:**
1. e.g. Open MENU > Medal List
2. e.g. Tap Evolve, pick Chill Ripper
3. e.g. Tap OK on the confirmation

**Expected:** e.g. the evolve animation plays and the medal gets +1★

**What happened (exact error text):** e.g. black screen, then back to the LDPlayer home

**Every time? (yes / no / sometimes):** e.g. yes, 3 out of 3

**Date and time (with time zone):** e.g. 2026-10-22 21:40 CEST

**Resources version / master revision:** e.g. resources 58 / revision 178

**Emulator + version:** e.g. LDPlayer 9.5.37, Android 9

**Windows version:** e.g. Windows 11 Pro 24H2

**Attachments (screenshot / video / logs\server.log):** e.g. screenshot attached, server.log attached
```

## Play package (private builds)

For a few testers the author builds a **ready-to-play package** on the development PC with
`tools/play/packaging/make-play-package.ps1`. The player only double-clicks `Play.bat`: the launcher
(`tools/play/launcher/`) prepares a dedicated LDPlayer 9.5.37 instance, and the server runs **inside the
emulator** on a pinned Node.js for Android (`tools/play/packaging/termux-node.lock`, started by
`tools/play/guest/rx-start.sh`), so no Windows DNS change, IP or firewall rule is needed. A package contains
files that this project never distributes, so packages are private, personal and never published; this
repository only holds the code that builds and runs them.

## Current limitations

What is missing in the game is listed in the in-game Notices and in [ISSUES.md](ISSUES.md). This list is
about **the setup**: steps that today are impossible or very hard for someone outside the project.

1. **Some build inputs are not provided by this project** (local reference data folders: JP 4.3.1 data and a work
   folder derived from it, set with `KHUX_JP_DATA` / `KHUX_REF_WORK`). `build-resources.ps1`
   stops without them (`manca ...`), and they are the source of the story maps and rooms of quests 1-979,
   enemy graphics and many layouts. A simplified setup that works only from files a user can legally dump
   from their own installation is planned.
2. **No reproducible rebuild of the master tables** (`server/master_data`, `server/game_data`): no single
   script, an undocumented order, and inputs that are the author's research files (`reference\world_schema\
   oltre525\*.json`, `reference\keyblades\keyblade_levels.json`, `reference\passives\...`, `wiki\*.json`,
   `stage_gen\orig_stages*\...`). Without them the server has nothing to serve.
3. **Many intermediate folders are inputs of `build-resources.ps1` but no script creates them from the raw
   files** in one go: `resource_data\7` and `resource_data\names_v4.tsv`, `ipa431\names_addnl.tsv`,
   `ipa440\names440misc.tsv` and `miscdata`, `layouts\orig`, `layouts\ui_texts`, `catalog\files`,
   `catalog\enemy_wait`, `stage_gen\files`, `external\roboloid\cache\map`, `reference\empty_slot\...`.
   They were produced by hand with tools in `recon/tools/` during the research.
4. **Fixed paths and IP** everywhere (next section): `D:\Progetto_Restauro_KH_UX`, `192.168.1.185`,
   LDPlayer folder, emulator index 0, 1920x1080 tap coordinates.
5. **Changing the Windows DNS** of the whole PC (and remembering to put it back) is required, with admin rights.
6. **Manual taps** after `update-resources.ps1` (KHUX START, Download) and `phaseb-guest.sh` after every
   emulator start.
7. **Only LDPlayer 9 with Android 9 works** (LIAPP protector); no phone, no other emulator, no Android >= 12.
8. Script messages and comments are in Italian.
9. Online modes (Union Cross, raids, PvP, events) do not exist yet.

## Known machine-specific settings

Inventory of every hard-coded value that ties the play path to the author's PC (22 October 2026), as
`file:line`. **Change?** = a player on another PC would have to change it (or reproduce it exactly).
`<W>` = `D:\Progetto_Restauro_KH_UX`. Comment-only mentions (documentation of where an analysis lives) are
not listed except where noted. The research tools (Ghidra scripts and the like) are kept private, outside
the repository, and are not listed.

### Session scripts (`tools/ldplayer/`)

| File:line | Value | Kind | Change? |
|---|---|---|---|
| `bench_lib.ps1:7` | `$LD = 'D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9'` | LDPlayer path | **yes** |
| `bench_lib.ps1:8` | `com.square_enix.android_googleplay.khuxww` | package name | no |
| `bench_lib.ps1:9` | `$SCREEN_W = 1920` (and every tap coordinate in the bench scripts) | resolution 1920x1080 | keep the resolution |
| `bench_lib.ps1:12` | `$env:USERPROFILE\Documents\XuanZhi9\Pictures` | LDPlayer shared folder | only if LDPlayer's shared folders were moved |
| `bench_lib.ps1:13` | `D:\Progetto_Restauro_KH_UX\screenshots` | output folder | **yes** |
| `bench_lib.ps1:19` | mutex `Global\khux_ld_exe` | name | no |
| `bench_lib.ps1:24` | `ld.exe -s 0` | emulator index 0 | if you use another instance |
| `phaseb-guest.sh:20` | clock `051512002021.00` (15/5/2021) | guest clock | no |
| `phaseb-guest.sh:22-23` | `/system/etc/security/cacerts`, `/mnt/shared/Misc` | guest paths | no |
| `phaseb-guest.sh:5` (comment) | `C:\Users\<utente>\Documents\XuanZhi9\Misc` | shared folder | no (generic) |
| `session/run-server.ps1:21` | `$logs = 'D:\Progetto_Restauro_KH_UX\logs'` | log folder | **yes** |
| `session/run-server.ps1:23` | `KHUX_PUBLIC_URL = 'https://192.168.1.185'` | **PC IP** | **yes** |
| `session/run-server.ps1:19` | `-Revision 178` default | master revision | no (raised by the project) |
| `session/run-server.ps1:45` | `D:\Progetto_Restauro_KH_UX\resource_data` | resources | **yes** |
| `<W>\private\khux_local.json` (read by `recon/tools/private_tools.py`, used by `run-server.ps1` and `build-resources.ps1`) | where the resource key comes from (local, untracked; or the `KHUX_RESOURCE_KEY` variable) | local configuration | **yes** |
| `session/relogin.ps1:10`, `:12` | `-Revision 178`; log `D:\…\logs\server.log` | revision; log path | log: **yes** |
| `session/cycle.ps1:5`, `:7` | `-Revision 178`; log path | same | log: **yes** |
| `session/update-resources.ps1:7`, `:9`, `:28` | `-Revision 178`; log path; `D:\…\resource_data` | same | **yes** |
| `session/update-resources.ps1:32` | `/data/data/com.square_enix.android_googleplay.khuxww/files/r` | guest path | no |
| `session/build-resources.ps1:37` | `$D = 'D:\Progetto_Restauro_KH_UX'` — **every input and output of the script derives from it** (~80 uses: `stage_gen`, `apk501`, `obb76`, `ipa431`, `ipa440`, `catalog`, `layouts`, `reference\…`, `external\roboloid\cache\map`, `compact`, `resource_data`; the local reference data folders come from `private_tools.py path jp_data` / `path ref_work`) | work folder | **yes** (one line, but the folder tree must match) |
| `session/build-resources.ps1:528` | `-Out 'D:\Progetto_Restauro_KH_UX\logs\server.log'` | log path | **yes** |
| `session/story.ps1:8`, `sweep.ps1:10-11`, `login-time.ps1:13` | log / report paths under `<W>\logs` | log path | yes (developer scripts) |
| `smoke_quests.ps1:6`, `:10` | `<W>\stage_gen\smoke_results.json`, log path | paths | yes (developer) |
| `route_1060.ps1:2`, `:4` | `Set-Location 'D:\…\Android\KH-UX-Dark-Road-Restoration'`, log path | repo path | yes (developer) |
| `tombstone.ps1:5`, `:7` | `<W>\screenshots`, `$env:USERPROFILE\Documents\XuanZhi9\Pictures` | paths | yes (crash capture) |

### Server and certificate

| File:line | Value | Kind | Change? |
|---|---|---|---|
| `server/server.js:667` | `KHUX_RESOURCE_DIR` default `server/resource_data` (overridden by `run-server.ps1`) | path | no |
| `server/make-cert.sh:4` (usage) | example IP `192.168.1.50`; the real IP is the argument | — | pass your IP |
| `start-server.bat` | detects the IP (`server\lan-ip.ps1`); historical phone path, not used by the LDPlayer bench | — | no |
| `server/dns.js` | hijacked suffixes `sqex-bridge.jp,kingdomhearts.com,square-enix.com`, upstream `1.1.1.1` (env `KHUX_HIJACK`, `KHUX_DNS_UPSTREAM`) | network | no |

### Master-table generators (`server/make-*.js`, run to build `server/master_data`)

All overridable by an environment variable, but the defaults point to the author's folder:

| File:line | Default path(s) | Change? |
|---|---|---|
| `make-game-tables.js:44`, `:87`, `:97`, `:246`, `:340`, `:347`, `:546`, `:615`, `:646`, `:733`, `:793` | `<W>\external\thethiny`, `<W>\medal_gen\medal_map.json`, `<W>\external\roboloid\medal_db.json`, `<W>\wiki\wiki_all.json` (×3), `<W>\enemy_gen\files`, `<W>\resource_data\names_v4.tsv` (×2), `<W>\external\thethiny_2026-10-13\KHUx-Server\data\burst.json`, `<W>\stage_gen\tours_v2\tours.json` | **yes** |
| `make-story-oltre.js:464`, `:468-469`, `:475-476`, `:478`, `:480-481`, `:484` | local reference data folder (`KHUX_JP_DATA`, `KHUX_JP_ROOT`), `wiki\wiki_all.json`, `names_v4.tsv`, thethiny `stage.json`, `wiki\quests.json`, `reference\world_schema\oltre525\oltre525.json`, `stage_gen\orig_stages_oltre\stage_poi_oltre.json`, `…\bgm_per_quest.json`, `stage_gen\orig_stages_oltre\stage` | **yes** |
| `make-enemy-oltre.js:36`, `:39`, `:41`, `:43`, `:46` | `<W>\reference\world_schema\oltre525` (**no env override**), `wiki\enemy_stats_oltre.json`, `names_v4.tsv`, `enemy_gen\files`, JP enemy detail from the local reference data folder (`KHUX_JP_DATA`) | **yes** |
| `make-skill-table.js:47-49` | thethiny `KHUx-Server\data`, `wiki\wiki_all.json`, report in `<W>\tmp\skill\report.md` | **yes** |
| `make-passives.js:41-42` | `<W>\reference\keyblades\keyblade_levels.json`, `<W>\reference\passives\Passives_khuxwiki.wikitext` (**no env override**) | **yes** |
| `make-keyblade-levels.js:39` | `<W>\reference\keyblades\keyblade_levels.json` (**no env override**) | **yes** |
| `make-guilt-burst.js:46`, `make-proud.js:254` | `names_v4.tsv`, `wiki\wiki_all.json` | **yes** |
| `enemy-attack-fix.js:21-22`, `burst-anim-fix.js:30`, `:90` | thethiny `enemyAttack.json`/`burst.json`, `names_v4.tsv`, `<W>\reference\burst_anim\mapping_final.json` | **yes** |
| `variable-power.js:163-164`, `medal-power-fix.js:134-135`, `:140` (both loaded by `make-game-tables.js`) | `<W>\external\roboloid\medal_db.json`, thethiny `burst.json`, `<W>\wiki\wiki_all.json` | **yes** |
| `check-stage-data.js:97` | `<W>\wiki\quests.json` | yes (check tool) |
| `import-master.js:6` (comment) | `<W>\apk501\extra_files` (path is an argument) | no |

### Resource tools (`recon/tools/`, run by `build-resources.ps1` or to make its inputs)

`D = r'D:\Progetto_Restauro_KH_UX'` hard-coded at module level, used for default inputs/outputs:

| File:line | Used by | Change? |
|---|---|---|
| `import_jp_coco.py:47` | `build-resources.ps1` (JP layouts) | **yes** |
| `import_jp_raisedraw.py:73` | `build-resources.ps1` | **yes** |
| `jp_sound_effects.py:30` | `build-resources.ps1` | **yes** |
| `make_carousel_anim.py:45` | `build-resources.ps1` (called **without arguments**) | **yes** |
| `make_nova_logo.py:38` | `build-resources.ps1` | **yes** |
| `make_jp_rooms.py:49` | makes `rooms_gen` | **yes** |
| `make_jp_enemies.py:64` | makes `enemy_gen` | **yes** |
| `import_orig_stages.py:83` | makes `stage_gen\orig_stages*` | **yes** |
| `deep_donors.py:48`, `extra_donors.py:38` | enemy graphics (via `make_jp_enemies.py`) | **yes** |
| `make_missing_part.py:42`, `gen_tours_v2.py:54`, `check_rooms.py:39` | maps / checks | yes |
| `shop_icons.py:14` | `DEFAULT_BASE` = local reference data folder (`KHUX_JP_DATA`) | no |
| `special_icons.py:18` | `DEFAULT_BASE` = local reference data folder (`KHUX_JP_DATA`): original icons of the Special Catalog (the others are drawn) | no |

### Not in files, but machine state

| Setting | Value on the author's PC | Change? |
|---|---|---|
| Windows adapter IPv4 DNS | `192.168.1.185` during sessions, automatic afterwards | **yes** (your IP) |
| `LDPlayer9\vms\config\leidian0.config` | `networkSettings.networkDNS: 192.168.1.185` (no effect, left from a test), shared folders `C:/Users/Kxos/Documents/XuanZhi9/{Applications,Pictures,Misc}` | no (LDPlayer writes its own) |
| LDPlayer shared folder `Misc` | `dc2bc61b.0` (CA of the author's certificate) + `phaseb-guest.sh` | **yes** (your CA hash) |
| `server/certs/` | certificate made for `192.168.1.185` | **yes** (regenerate) |
