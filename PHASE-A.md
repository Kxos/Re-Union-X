# Phase A — static analysis results

Target: the native client library of the **WW 4.3.1-72** build, the last fully online one. The analysis
notes and research scripts are kept private; this page keeps what the server needs to know.

---

## 1. Starting from the protocol strings

Most of the binary carries no function names, so a by-name approach does not work. Protocol strings
cannot be removed (they are needed at runtime) and were used as anchors to find the code of the API
layer:

| Anchor | Occurrences |
|---|---|
| `sharedSecurityKey` | 1 |
| `X-HTTP-USER-TOKEN` | 1 |
| `accessToken` | 1 |
| `Content-Type` | 14 |
| `https://` | 7 |
| `kingdomhearts` | **0** |

## 2. The handshake contract

- The client expects from the **session** endpoint a JSON response with **`nativeSessionId`** and
  **`sharedSecurityKey`**, and from then on sends the **`X-HTTP-USER-TOKEN: <token>`** header.
- The login payload carries `accessToken`, `platformId`, `platformType`.

This confirms what `xlash123/khux-re-api` documents, and above all **it is enough to write the first
server endpoint**: the AES key is chosen by the server, so whoever answers this handshake controls the
whole encrypted channel.

## 3. The API host is not in the client

Binary scan of **all the files of the APK**: the only Square Enix host is `cache.sqex-bridge.jp` (the
in-app news). No `api-s`, no `kingdomhearts.com`.

### The bootstrap delivers the URL

The **bootstrap** response is read as: `maintenance` (absent or null = normal operation), then `url`
(the base of every following call) and `nativeToken`. The bootstrap request sends `UUID`, `deviceType`,
`nativeToken`. **That is why the host is not in the client: the server delivers it.**

The bootstrap host itself lives in a packed library and cannot be read statically. It is documented
externally (`psg.sqex-bridge.jp/native/session`, `xlash123/khux-re-api`) and is confirmed by watching
the DNS resolution when the app starts.

**No binary patch is needed to hijack the client.** One DNS redirect and two JSON responses: our
bootstrap response hands the client the `url` of our server, the session response the
`sharedSecurityKey`.

## 4. Endpoints already known

From the format strings of the chat subsystem, which uses `%s` as the base URL:

```
%s/user                      %s/chat/message/%d
%s/user/block                %s/chat/message/%d/%d
%s/user/block/%s             %s/chat/message/report
%s/user/chat/%d
```

The main game endpoints were later read from the client's own action table (`json/server_api.json`,
321 actions; see [docs/notes/server.md](docs/notes/server.md)).

## 5. Next steps (as planned then)

1. **Phase B — the first endpoint**: answer the bootstrap with `{url: "<our server>", nativeToken: …}`
   and the session with `nativeSessionId` + `sharedSecurityKey` chosen by us.
2. **Empirical confirmation of the bootstrap host** with a DNS sink.
3. **Fields of the master tables** — done in [phase C](PHASE-C.md).
