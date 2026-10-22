'use strict';
/**
 * Codec dei payload KHUX.
 *
 * Formato documentato da xlash123/khux-re-api e confermato dalle stringhe del
 * binario (sharedSecurityKey, X-HTTP-USER-TOKEN):
 *
 *     JSON --(base64)--> --(AES-256-CBC)--> --(base64)--> payload
 *
 * Quello che NON sappiamo e' come viene derivato l'IV. Finche' non vediamo
 * traffico reale non ha senso indovinare: decode() prova piu' strategie e
 * riporta quale ha funzionato, cosi' la prima richiesta vera del client ce lo
 * dice da sola.
 */

const crypto = require('crypto');
const zlib = require('zlib');

const ALGO = 'aes-256-cbc';

/** Normalizza la chiave a 32 byte: se non e' gia' lunga cosi', SHA-256. */
function normalizeKey(key) {
  const buf = Buffer.isBuffer(key) ? key : Buffer.from(String(key), 'utf8');
  if (buf.length === 32) return buf;
  return crypto.createHash('sha256').update(buf).digest();
}

/**
 * Strategie di IV da tentare, in ordine di plausibilita'.
 * Ognuna restituisce {iv, body} a partire dal testo cifrato grezzo.
 */
const IV_STRATEGIES = {
  // IV tutto a zero: il caso piu' comune nelle implementazioni frettolose
  zero: (raw) => ({ iv: Buffer.alloc(16, 0), body: raw }),
  // IV anteposto al testo cifrato
  prefix: (raw) => ({ iv: raw.subarray(0, 16), body: raw.subarray(16) }),
  // IV = primi 16 byte della chiave
  keyHead: (raw, key) => ({ iv: key.subarray(0, 16), body: raw }),
  // IV = ultimi 16 byte della chiave
  keyTail: (raw, key) => ({ iv: key.subarray(16, 32), body: raw }),
};

/** Il buffer contiene JSON leggibile? Serve a riconoscere il tentativo giusto. */
function looksLikeJson(buf) {
  if (!buf || buf.length < 2) return false;
  const s = buf.toString('utf8').trim();
  if (!/^[[{]/.test(s)) return false;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/** Prova a scompattare un gzip; se non lo e', restituisce l'originale. */
function maybeGunzip(buf) {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      return zlib.gunzipSync(buf);
    } catch {
      return buf;
    }
  }
  return buf;
}

/**
 * Decodifica un payload. Tenta tutte le strategie di IV e restituisce la prima
 * che produce JSON valido.
 *
 * @returns {{ok: boolean, json?: object, strategy?: string, raw?: Buffer, error?: string}}
 */
function decode(payload, key) {
  const k = normalizeKey(key);
  let raw;
  try {
    raw = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'base64');
  } catch (e) {
    return { ok: false, error: 'base64 esterno non valido: ' + e.message };
  }

  const attempts = [];
  for (const [name, split] of Object.entries(IV_STRATEGIES)) {
    try {
      const { iv, body } = split(raw, k);
      if (iv.length !== 16 || body.length === 0 || body.length % 16 !== 0) continue;

      const d = crypto.createDecipheriv(ALGO, k, iv);
      let out = Buffer.concat([d.update(body), d.final()]);
      out = maybeGunzip(out);

      // il livello interno e' base64
      const inner = Buffer.from(out.toString('utf8').trim(), 'base64');
      const candidate = maybeGunzip(inner);

      if (looksLikeJson(candidate)) {
        return { ok: true, json: JSON.parse(candidate.toString('utf8')), strategy: name, raw: candidate };
      }
      if (looksLikeJson(out)) {
        // variante senza base64 interno
        return { ok: true, json: JSON.parse(out.toString('utf8')), strategy: name + '+noInnerB64', raw: out };
      }
      attempts.push(name + ': decifrato ma non e\' JSON');
    } catch (e) {
      attempts.push(name + ': ' + e.message);
    }
  }
  return { ok: false, error: 'nessuna strategia di IV ha prodotto JSON', attempts };
}

/**
 * Codifica un oggetto nel formato atteso dal client.
 * Finche' non sappiamo l'IV reale, il default e' `zero`: va cambiato appena il
 * traffico ce lo dice.
 */
function encode(obj, key, strategy = 'zero') {
  const k = normalizeKey(key);
  const inner = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');

  let iv;
  if (strategy === 'keyHead') iv = k.subarray(0, 16);
  else if (strategy === 'keyTail') iv = k.subarray(16, 32);
  else if (strategy === 'prefix') iv = crypto.randomBytes(16);
  else iv = Buffer.alloc(16, 0);

  const c = crypto.createCipheriv(ALGO, k, iv);
  const body = Buffer.concat([c.update(Buffer.from(inner, 'utf8')), c.final()]);
  const full = strategy === 'prefix' ? Buffer.concat([iv, body]) : body;
  return full.toString('base64');
}

/** Chiave di sessione casuale: e' il server a sceglierla, quindi e' nostra. */
function newSecurityKey() {
  return crypto.randomBytes(32).toString('base64').slice(0, 32);
}

module.exports = { decode, encode, normalizeKey, newSecurityKey, maybeGunzip, looksLikeJson };
