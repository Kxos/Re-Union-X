# LDPlayer bench: startup, scripts, crashes

Technical notes of the test bench. Full history in
[../journal/fino-al-2026-10-11.md](../journal/fino-al-2026-10-11.md).

<a id="posizioni"></a>
## Where everything is

- Repository: `D:\Progetto_Restauro_KH_UX\Android\KH-UX-Dark-Road-Restoration` (Claude Code must be
  opened from here). All the work lives on D: because of the space on C:.
- LDPlayer 9.5.37: `D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9` (instance 0, Android 9, ABI
  arm64-v8a translated by houdini, root via `ld.exe`). **Original** APK 4.3.1 (the patched one stops
  at LIAPP's anti-repackaging, see [protector.md](protector.md)):
  `D:\Progetto_Restauro_KH_UX\apk\khux-4.3.1-original.apk`.
- Screenshots: `D:\Progetto_Restauro_KH_UX\screenshots` (they go through the shared
  folder `Documents\XuanZhi9\Pictures` and are moved). Server log:
  `D:\Progetto_Restauro_KH_UX\logs\server.log`.
- Player save: `server/save/player.json` (excluded from git; `KHUX_SAVE` changes it).
- Served resources: `D:\Progetto_Restauro_KH_UX\resource_data\<N>\{data,index}`; generated pack
  in `D:\Progetto_Restauro_KH_UX\stage_gen\files\` (see [risorse_layout.md](risorse_layout.md)).
- Resource catalog: `D:\Progetto_Restauro_KH_UX\catalog\` (`index.html`, `textures.tsv`,
  `layouts.tsv`, `missing_layouts.txt`).
- Visual references of the originals: `D:\Progetto_Restauro_KH_UX\reference\<schermata>\` (sources in
  `SOURCES.md`); yt-dlp in `D:\Progetto_Restauro_KH_UX\tools\yt` (with `PYTHONPATH` and
  `--js-runtimes node:<node.exe>`).

<a id="avvio"></a>
## Cold start and resume

```powershell
# 1. emulator (if off)
D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9\ldconsole.exe launch --index 0
# 2. server + re-entry of the saved player up to the home
.\tools\ldplayer\session\relogin.ps1 -Tag x            # default -Revision 177 (22-10)
# 3. MANDATORY after every emulator start (system CA, clock 15/5/2021,
#    DNS towards the PC, private DNS off, TCP 80/443 redirection of the game)
D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9\ld.exe -s 0 "sh /mnt/shared/Misc/phaseb-guest.sh 192.168.1.185"
```

- Without `phaseb-guest.sh` the client does not reach the server and stays on the «End of Service» popup
  (date deadline inside the client: the guest clock must be kept before 29/6/2021).
- The script is in `tools/ldplayer/phaseb-guest.sh` and must be copied into `Documents\XuanZhi9\Misc`.
- After an emulator restart the client may download the whole latest version again (~4.2 GiB since version 56, minutes).
- Other session scripts (`tools/ldplayer/session/`):
  - `cycle.ps1 -Tag x`: as a NEW player (deletes the save);
  - `run-server.ps1 [-Revision N] [-TutorialFinished]`: only the server (it starts detached with
    `Win32_Process.Create`: with `Start-Process` it died with the script); `-GachaShow B0306,B0456` (also in `relogin.ps1`):
    catalog banners added to the Shop list (`KHUX_GACHA_SHOW`, [shop.md](shop.md#sp2));
  - `update-resources.ps1`: makes the client download the latest complete version (~5 min) and waits for the end
    of the installation (interrupting it leaves `files/r` half-done: crash on `MyPageScene_ver340`);
  - `build-resources.ps1 -Version N` / `-Quick`: see [-Quick](#quick);
  - `story.ps1`, `sweep.ps1` (mapping of the buttons, report in `logs\sweep.txt`).
- **Master revision**: raise it by 1 in the 4 scripts (`cycle`, `relogin`, `run-server`,
  `update-resources`) after every change to `server/master_data`, then `relogin.ps1` (twice if
  the first crashes after the master download).
- **Do not restart ONLY the server with a session open**: without logging in again it can no longer decrypt the
  bodies (stageId lost). Always use `relogin.ps1`.
- The IPv4 DNS of the Windows Ethernet adapter must be **192.168.1.185** (the PC) during the
  tests and go back to **automatic** at the end of the session.

<a id="quick"></a>
## `-Quick` fast cycle and resource versions

- `tools\ldplayer\session\build-resources.ps1 -Quick` (~40 s): regenerates the generated pack
  inside the latest version and writes it directly into the guest files (tail of the data in the part
  `files/r/misc.mp4.N` where it falls, N = offset >> 31, also straddling two parts with
  `resource_parts.py`; plus `misc.png`), then restarts only the app. No download **provided that the
  sizes do not change**: if they change the client throws the resources away (`resourceRevision 0`) and
  downloads everything again. The complete versions (from 26) reserve 4 MiB for the generated pack (16 MiB
  from 29) and a padding name in the index (index reserve 64 KB); `-Quick` goes back to the
  installed sizes (`resource_merge.py --index-size`). If the pack exceeds the reserve a
  complete version is needed.
- `-Quick` rewrites only the last part: the medal images (`medal_gen`, second-to-last part)
  get in only with a complete version. It stops if the packs before the generated one (including those
  compacted in `D:\Progetto_Restauro_KH_UX\compact`, list in `resource_data\<N>\compact.txt`) are not
  as long as the installed parts: [risorse_layout.md#pezzi](risorse_layout.md#pezzi). Before touching
  version and guest it reads the sizes in the guest (`resource_parts.py --check-installed`): if the sum of the
  parts or `misc.png` are not those of the version (newer version not yet downloaded, download
  half-done) it stops: «esegui update-resources.ps1, non usare -Quick».
- A complete version is built in `resource_data\_build_<N>` (non-numeric folder: the server does not
  see it) and renamed to `<N>` only after the final checks (parts under 2 GiB, 20 GiB); `-Version N`
  of an existing folder stops before every generator and before the compaction.
- **Never `-Quick` if there is a version folder newer than the installed one**: it writes the
  newer one into the guest (corrupted data).
- A complete version (`build-resources.ps1 -Version N`) is announced immediately by the server and
  downloaded by the client: do it only with the bench stopped, then `update-resources.ps1`.
- `resource_merge` caches decrypted indexes and keystreams in `%TEMP%\khux_bgi_cache` (1 s
  instead of 60).
- Status at 11 October: **resources 32, master revision 81**. Current state (revision, installed and built
  resources): [HANDOFF.md](../../HANDOFF.md#restarting).

<a id="script"></a>
## Bench scripts (`tools/ldplayer/`)

- `bench_lib.ps1`: common functions without fixed waits. The screen is read in the guest
  (raw `screencap`, 16-byte header, `dd` of only the useful pixels, ~0.2 s). `Step` taps and
  waits for the next screen recognized by its pixels; `WaitLog` waits for a request in the log;
  `Swipe`; `SkipDialog` (light SKIP at (155,50), box (247,190,99) at (500,1000));
  `DismissTutorial`, `GameWait`, `FindTarget` (pink TARGET marker), `FindSpotlight`.
- `bench_flow.ps1 -Out <log> [-Until name|editor|union|battle]`: new player up to the first
  battle (~42 s). `bench_prologue.ps1 -Out <log> [-Seek] [-Shot x]`: Prologue and results;
  `-Seek` follows the screen (works for every stage). `bench_start.ps1`: existing player.
- `smoke_quests.ps1 -Stages ...` + `server\save\smoke.json` {stageId}: the server offers only
  that quest, the script starts it and checks the app (~75 s per quest).
  `recon/tools/smoke_pick.py` picks the 76 quests that cover rooms and enemies.
- `route_1060.ps1`: taps of 1060 (scale ~1.7 px per map unit, character at
  ~(770,600)).
- **Known limit of `-Seek`/`FindSpotlight`**: on dark maps (fog) it mistakes the background for the
  tutorial circle and takes no steps; 1070 (forest) gets stuck on the tree; in 1030 it did not
  see a `/stage/clear` that had arrived (see ISSUES I-008).
- User's rule: **dialogues with SKIP are always skipped**; results are scrolled with OK
  (960,965).
- **Re-entry stuck at the title** (18-10, three times in a row after `relogin.ps1`/`build-resources.ps1 -Quick`): the
  Android dialog «L'app Launcher3 non risponde» («Launcher3 isn't responding») covers the game and takes the taps on KHUX START. Tap
  «Attendi» («Wait», 640,649) and launch `bench_start.ps1` again.
- **Stronger enemies** (18-10, to try Second Chance and the skills that are needed on the ground):
  `relogin.ps1 -EnemyAtk 10` (or `run-server.ps1 -EnemyAtk 10`) multiplies the attack of the `enemy` table
  in the served master (`KHUX_BENCH_ENEMY_ATK`; the client takes the enemy stats from the master). The
  served revision goes up by 90000 + N, so the client downloads the master again; a `relogin.ps1` without
  the option brings it back to normal. Test tool, not a game feature: no notice.
- **Skills always or never** (18-10): `relogin.ps1 -SkillProb 100` (or `0`) fixes the probability of all the medal
  skills in the served master (`KHUX_BENCH_SKILL_PROB`, revision +80000 + P + 1). To measure an effect:
  same quest twice, only normal attacks (in AUTO the Supernova also fires), and comparison of
  `maximumDamage` in the body of `/stage/clear` (`server/logs/requests.ndjson`). Manual command: tap the
  enemy, then drag the medal upwards.
- Tests of multi-part exits: temporarily move the STG start near the exit,
  then restore and redo `-Quick`.

<a id="tocchi"></a>
## Known taps (screen 1920x1080)

- Home: MENU `1790,45` (drop-down menu), Moogle Shop `288,1000`, Profile (avatar) `260,95`,
  Missions scroll `425,130`, Other `1740,963`; ‹ › arrows of the home pages: do not tap them (the
  second page is Dark Road).
- Medal List: MENU `1790,45` then `1745,697`; Sell Medals `335,262`, medal `637,600`, Sell
  `350,1005`, confirm `1220,715`, OK `960,712`.
- Profile: Titles `330,1030`, Name/Message `808,1030`, Play Style `1155,1030`, Outfits `1590,1030`.
- Moogle Shop: Traits `340,250`, Items `700,250`, Exchange first row `1213,512`, OK `1220,712`;
  trait: row STR +1000 `600,400`, «Select Medal» `788,1012`, then drag the medal onto the slot
  (`Swipe 1640 290 630 330 900`), «Set Trait» `840,1010`. Sell Materials `1205,250`, material
  `1200,430`, Sell `1183,930`, confirm `1220,715`.
- Battle: special = **fast** diagonal swipe on the medal, `Swipe 130 790 400 520 150`
  (300-400 ms or vertical gestures do not work).

<a id="crash"></a>
## Recipe for a client crash

1. Note the last screen and the last request in `logs\server.log`: most client crashes on this bench come from a
   master row the client asks for and the server does not send, or from a resource the client loads and the
   server does not serve (missing layout, LWF or texture).
2. **Missing cocostudio layout**: the client stops while loading a layout that is not in the served
   resources (quests 699-704 on 22-10: `ActMapTimeAttack_TimePanel.json`, imported from the JP via
   `recon/tools/jp_coco_layouts.txt`). List in `catalog\missing_layouts.txt`.
3. The crash capture tools (ARM registers and stack at the crash) and the notes on reading a capture are
   kept private, outside the public repository.

<a id="ldplayer"></a>
## LDPlayer: pitfalls
- **Error «g_pPipeMemHead->arBufHead[i].usingPipeId != nPipeId» and LDPlayer crash** (11 October, twice): several ld.exe at once (quest in the background + capture or screenshot every second) or an ld.exe killed halfway corrupt the shared memory of the pipes. Now Sh of bench_lib.ps1 (and the other bench scripts) goes through a system mutex Global\khux_ld_exe: one ld.exe at a time even across different scripts. Never Stop-Process on ld.exe: if it stays hung, ldconsole quit and launch.

- adb does not open on this version: use `ld.exe -s 0 "<comando>"` (root shell in the guest) and
  `ldconsole installapp --index 0 --filename <apk>`. `ldconsole quit` may not be enough:
  `quitall`. The config (`vms\config\leidian0.config`) can be changed only with the instance off.
- Screenshot from inside the guest: `ld.exe -s 0 "screencap -p /sdcard/Pictures/x.png"`.
- Network: VirtualBox NAT Network `LdNatNetwork0` (172.16.1.0/24). If a quick restart leaves
  `VBoxNetDHCP` orphaned, `VBoxNetNAT` does not start and the guest has no network: `ldconsole quitall`, wait until
  `Ld9BoxHeadless` disappears, kill `VBoxNetDHCP`/`VBoxNetNAT`, relaunch. With the instance on
  both must be there.
- DNS: VirtualBox discards loopback DNS servers (set the PC's LAN IP) and passes the DNS to the guest only
  at instance start; in the guest the opportunistic private DNS must be turned off (done by
  `phaseb-guest.sh`: `private_dns_mode off`, REJECT on 853, DNAT of 53 towards the PC).
- LDPlayer froze (hung ld.exe): `ldconsole quit/launch` + `phaseb-guest.sh`.
- Memory: after several 2.3 GB downloads `Ld9BoxHeadless` reaches 30 GB committed and Windows refuses
  `ld.exe` («file di paging troppo piccolo», "paging file too small"): `ldconsole quit --index 0`, `launch`,
  `phaseb-guest.sh`. Do not suggest to the user to clean up C:.
- The site's «LDPlayer 9» link installs LDPlayer 14; the real package:
  `https://res.ldrescdn.com/download/package/LDPlayer9.0.exe`.

<a id="git"></a>
## Practical rules of the environment

- PowerShell (Git Bash hangs on D:); UTF-8 files without BOM; `git -c safe.directory=*`,
  `git commit -F <file>`, `git pull --rebase` before the push (other agents commit at the same time).
- Do not name a PowerShell function `R` (alias of Invoke-History).
- Python of the tools always with `-I`.
