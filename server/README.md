# KHUX private server — phase B

> Historical page of phase B (October 2026: first boot with the physical phone). Today's server (LDPlayer bench,
> master, Shop, medals, traits...) is described in [HANDOFF.md](../HANDOFF.md) and in [docs/notes/](../docs/notes/):
> [server.md](../docs/notes/server.md), [banco.md](../docs/notes/banco.md), [medaglie.md](../docs/notes/medaglie.md), [shop.md](../docs/notes/shop.md).

Node, **zero dependencies**: `crypto` and `zlib` are built in, so AES-256-CBC and gzip
work without installing anything.

## What it does

It answers the two initial exchanges derived from the binary (see `../PHASE-A.md`) and
**logs everything else**.

| Exchange | Response |
|---|---|
| bootstrap | `{url, nativeToken}` (`maintenance` omitted: any value, even `0`, means maintenance) |
| session | `{nativeSessionId, sharedSecurityKey}` |

The key point: **we choose the `sharedSecurityKey`**, so from that moment on we
control the AES key of the whole channel. And the `url` we hand over becomes the
base of all subsequent calls — which is why there is no need to patch the binary.

### The logger is the real tool

The game endpoints cannot be enumerated from the binary's strings. But every
request the client sends us is logged in `logs/requests.ndjson` with
method, path, headers and **decrypted** body, and gets an empty but valid response
so that the client carries on and shows us the next call.

Discovering the sequence is worth more than answering a single call well.

## Note on the IV scheme

The payload format is documented (`JSON → base64 → AES-256-CBC → base64`), but
**we do not know how the IV is derived**. Instead of guessing, `khux-codec.js` tries
four strategies — zero IV, prepended IV, first 16 bytes of the key, last 16 — and
reports which one worked. The client's first real request will tell us by itself.

Round-trip verified on all four.

## Startup

```bash
KHUX_PUBLIC_URL="https://192.168.1.198" node server/server.js
```

| Variable | Default | Notes |
|---|---|---|
| `KHUX_PUBLIC_URL` | `https://127.0.0.1` | **The machine's IP on the LAN**, not localhost: it is what the phone must be able to reach |
| `KHUX_HTTP_PORT` | `80` | |
| `KHUX_HTTPS_PORT` | `443` | active only if the certificates exist |
| `KHUX_DNS` | active | `0` to disable the resolver |
| `KHUX_DNS_PORT` | `53` | |
| `KHUX_DNS_UPSTREAM` | `1.1.1.1` | where to forward what we do not hijack |
| `KHUX_HIJACK` | `sqex-bridge.jp,kingdomhearts.com,square-enix.com` | suffixes to hijack |

Ports 80, 443 and 53 on Windows may require elevated privileges: for local
tests use `KHUX_HTTP_PORT=8080 KHUX_DNS_PORT=5355`.

## The DNS resolver

Built in, with no dependencies (`dgram` is built in). It does two things:

1. **Hijacks** the domains listed in `KHUX_HIJACK` to our IP. It answers only
   `A` queries; for `AAAA` it returns an empty but valid response, which pushes the
   client onto IPv4.
2. **Forwards everything else** upstream, so the phone stays usable while we
   use it as DNS.

And above all it **logs every query** in `logs/dns.ndjson`. This resolves the unknown
left over from phase A: we never extracted the bootstrap host from the binary —
it lives in a packed library — and we know it only from an external source. Whatever
name the client resolves at startup will appear in the log in clear text.

If after starting the game the DNS log shows a host we are not hijacking,
add it to `KHUX_HIJACK` and try again.

So on the phone it is enough to set the manual DNS to `192.168.1.198`: no apps and no
router changes.

## Full procedure with a physical phone

### 1. Certificate

```bash
./server/make-cert.sh 192.168.1.198
```

Generates a CA and a certificate valid for `*.sqex-bridge.jp`, `*.kingdomhearts.com` and
the given IP.

### 2. APK

Use the original APK as it is: a repackaged APK is refused by the game's protector
([protector.md](../docs/notes/protector.md)). Since Android 7 apps ignore user-installed CAs, so the
CA must be a **system** CA (on the LDPlayer bench `tools/ldplayer/phaseb-guest.sh` installs it).

### 3. On the device

1. Install the original APK
2. Install `server/certs/ca.crt` as a **system CA certificate**
3. Make `psg.sqex-bridge.jp` resolve to `192.168.1.198` — local DNS, or a
   resolver that accepts overrides

### 4. Start the server and open the game

Every request will appear in the console. Those marked `[?]` are endpoints we do not
handle yet: they are exactly what we want to discover.

## Warning: VPN

On this machine Appgate SDP and Connect Tunnel appear to be active. A VPN can
hijack the routing and prevent the phone from reaching the PC on the local network:
they almost certainly have to be disabled during tests.

## Files

| File | |
|---|---|
| `server.js` | HTTP/HTTPS server, routes, logger |
| `khux-codec.js` | payload codec, with detection of the IV strategy |
| `make-cert.sh` | generation of CA and certificate |
| `logs/requests.ndjson` | every request received — not versioned |
