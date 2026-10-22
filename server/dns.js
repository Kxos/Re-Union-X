'use strict';
/**
 * Resolver DNS minimo per il dirottamento del client.
 *
 * Due ruoli, il secondo altrettanto importante del primo:
 *
 *  1. Dirottare gli host del gioco verso la nostra macchina.
 *  2. REGISTRARE OGNI QUERY. L'host del bootstrap non l'abbiamo mai estratto dal
 *     binario - vive in una libreria impacchettata - e lo conosciamo solo da fonte
 *     esterna. Il log DNS ce lo dice in chiaro: qualunque nome il client risolva
 *     all'avvio, lo vediamo comparire qui.
 *
 * Tutto cio' che non e' nella lista di dirottamento viene inoltrato a monte, cosi'
 * il telefono resta utilizzabile mentre lo usiamo come DNS.
 *
 * Nessuna dipendenza: `dgram` e' nativo.
 */

const dgram = require('dgram');
const fs = require('fs');
const path = require('path');

const TYPE = { 1: 'A', 2: 'NS', 5: 'CNAME', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 65: 'HTTPS' };

/** Legge il QNAME a partire da `off`. Nelle domande non ci sono puntatori. */
function readName(buf, off) {
  const parts = [];
  let i = off;
  let guard = 0;
  while (i < buf.length && buf[i] !== 0) {
    if ((buf[i] & 0xc0) === 0xc0) { i += 2; break; }   // puntatore: ci fermiamo
    const len = buf[i];
    if (len === 0 || i + 1 + len > buf.length) break;
    parts.push(buf.subarray(i + 1, i + 1 + len).toString('latin1'));
    i += 1 + len;
    if (++guard > 64) break;
  }
  return { name: parts.join('.'), end: i + 1 };
}

function parseQuery(buf) {
  if (buf.length < 12) return null;
  const qdcount = buf.readUInt16BE(4);
  if (qdcount < 1) return null;
  const { name, end } = readName(buf, 12);
  if (end + 4 > buf.length) return null;
  return {
    id: buf.readUInt16BE(0),
    name,
    qtype: buf.readUInt16BE(end),
    qclass: buf.readUInt16BE(end + 2),
    qEnd: end + 4,
  };
}

/** Risposta con un record A che punta a `ip`. */
function buildAnswer(buf, q, ip, ttl = 60) {
  const header = Buffer.alloc(12);
  buf.copy(header, 0, 0, 12);
  header.writeUInt16BE(0x8180, 2);   // QR=1 RD=1 RA=1, RCODE=0
  header.writeUInt16BE(1, 4);        // QDCOUNT
  header.writeUInt16BE(1, 6);        // ANCOUNT
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  const question = buf.subarray(12, q.qEnd);

  const rr = Buffer.alloc(16);
  rr.writeUInt16BE(0xc00c, 0);       // puntatore al nome nella domanda
  rr.writeUInt16BE(1, 2);            // TYPE A
  rr.writeUInt16BE(1, 4);            // CLASS IN
  rr.writeUInt32BE(ttl, 6);
  rr.writeUInt16BE(4, 10);           // RDLENGTH
  for (const [k, o] of ip.split('.').entries()) rr.writeUInt8(Number(o), 12 + k);

  return Buffer.concat([header, question, rr]);
}

/** Risposta vuota ma valida (NOERROR, zero record). Serve per AAAA. */
function buildEmpty(buf, q) {
  const header = Buffer.alloc(12);
  buf.copy(header, 0, 0, 12);
  header.writeUInt16BE(0x8180, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(0, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);
  return Buffer.concat([header, buf.subarray(12, q.qEnd)]);
}

/** Risposta «nome inesistente» (NXDOMAIN): la connessione fallisce subito invece di aspettare il timeout. */
function buildNxdomain(buf, q) {
  const r = buildEmpty(buf, q);
  r.writeUInt16BE(0x8183, 2);        // QR=1 RD=1 RA=1, RCODE=3
  return r;
}

// Host che rispondiamo inesistenti (segnalazione dell'utente 19-10, popup Notices vuoto ~10 s al login):
// Google Play Services scarica un font da fonts.gstatic.com mentre la WebView prepara la pagina, la
// connessione TLS fallisce dopo secondi (orologio del dispositivo al 2021, certificati non validi) e la
// WebView aspetta. Con NXDOMAIN il tentativo fallisce subito; i font restano quelli in cache.
const BLOCK = ['fonts.gstatic.com'];

/**
 * @param {object} opts
 * @param {string} opts.ip        indirizzo verso cui dirottare
 * @param {string[]} opts.hijack  suffissi di dominio da dirottare
 * @param {string} opts.upstream  resolver a cui inoltrare il resto
 * @param {string} opts.logFile   file NDJSON delle query
 */
function startDns({ ip, hijack, upstream = '1.1.1.1', port = 53, logFile, block = BLOCK }) {
  const sock = dgram.createSocket('udp4');
  let seq = 0;

  const shouldHijack = (name) => {
    const n = name.toLowerCase();
    return hijack.some((d) => n === d || n.endsWith('.' + d));
  };

  const log = (entry) => {
    entry.seq = ++seq;
    entry.ts = new Date().toISOString();
    if (logFile) {
      try {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
      } catch { /* il log non deve mai far cadere il resolver */ }
    }
    const tag = entry.action === 'hijack'
      ? '\x1b[35m[dns:dirottata]\x1b[0m'
      : '\x1b[90m[dns]\x1b[0m          ';
    // Solo le query A ricevono un indirizzo: su AAAA rispondiamo vuoto, e scriverlo
    // come se avessimo risposto 192.168.x.x renderebbe il log bugiardo.
    console.log(`${tag} #${entry.seq} ${entry.type} ${entry.name}` + (entry.answer || ''));
  };

  sock.on('message', (msg, rinfo) => {
    const q = parseQuery(msg);
    if (!q) return;
    const type = TYPE[q.qtype] || String(q.qtype);

    if (block.includes(q.name.toLowerCase())) {
      log({ name: q.name, type, action: 'block', from: rinfo.address, answer: ' -> inesistente (bloccato)' });
      sock.send(buildNxdomain(msg, q), rinfo.port, rinfo.address);
      return;
    }

    if (shouldHijack(q.name)) {
      // Rispondiamo solo ad A: su AAAA una risposta vuota spinge il client su IPv4.
      const isA = q.qtype === 1;
      log({
        name: q.name, type, action: 'hijack', from: rinfo.address,
        answer: isA ? ` -> ${ip}` : ' -> (vuota, forza IPv4)',
      });
      sock.send(isA ? buildAnswer(msg, q, ip) : buildEmpty(msg, q), rinfo.port, rinfo.address);
      return;
    }

    log({ name: q.name, type, action: 'forward', from: rinfo.address });

    // Inoltro a monte: il telefono deve restare utilizzabile.
    const up = dgram.createSocket('udp4');
    const timer = setTimeout(() => { try { up.close(); } catch {} }, 4000);
    up.on('message', (resp) => {
      clearTimeout(timer);
      sock.send(resp, rinfo.port, rinfo.address);
      try { up.close(); } catch {}
    });
    up.on('error', () => { clearTimeout(timer); try { up.close(); } catch {} });
    up.send(msg, 53, upstream);
  });

  sock.on('error', (e) => {
    console.error('DNS non avviato:', e.message);
    if (e.code === 'EACCES') console.error('  la porta 53 richiede privilegi elevati');
    if (e.code === 'EADDRINUSE') console.error('  porta 53 gia' + "'" + ' occupata');
  });

  sock.bind(port, '0.0.0.0', () => {
    console.log(`DNS in ascolto su 0.0.0.0:${port}  (dirotta: ${hijack.join(', ')} -> ${ip}; il resto a ${upstream})`);
  });

  return sock;
}

module.exports = { startDns, parseQuery, buildAnswer, buildNxdomain, readName, BLOCK };
