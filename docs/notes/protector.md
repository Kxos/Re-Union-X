# Game protector and choice of the bench (closed on 7 October 2026)

The game ships with a third-party protector (LIAPP) that decides on which devices the client may run. The
protector was analysed; tools and notes are private. What matters for running the project:

- **Use only the original APK.** A re-signed or patched APK is refused (the game closes at once with
  error code **90**).
- **Bench: LDPlayer 9 (Android 9), root off.** On it the original APK starts with no refusal. On
  Android 12 and later (phones and other emulators) the original APK is refused (code **13380225**).
- Ruled out as the cause: clock, installer, emulator versus phone, USB debugging.
- The «End of Service» popup is a date deadline inside the client (29/6/2021): the guest clock
  must be kept at 15/5/2021 (`phaseb-guest.sh`).
- The server CA must be installed as a system CA (targetSdk 29 does not trust user CAs and
  the APK cannot be re-patched).
