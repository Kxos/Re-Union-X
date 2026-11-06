"""Reads archived SQUARE ENIX BRIDGE notices from the Wayback Machine in a given order and logs their heading, game and images.

    python -I recon/tools/sqex_notice_sweep.py CDX ORDER OUTDIR LOG [DELAY]

CDX: lines «<notice id> <Wayback timestamp>» (the archived copies of cache.sqex-bridge.jp/guest/information/<id>);
ORDER: notice ids separated by blanks, the order to read them in (ids not in CDX are skipped); OUTDIR: where the HTML
copies go (untrusted downloads, local only, e.g. D:\\Progetto_Restauro_KH_UX\\tmp\\jp_banners\\notices); LOG: one line per id,
«id|date|heading / game|image keys» (keys of cache.sqex-bridge.jp/img/<key> without the site's own two icons; the first
one is the notice banner). Ids already in LOG are skipped, so a stopped run resumes. One request at a time, DELAY
seconds apart (default 5: Wayback blocks faster readers for hours); after a connection failure it waits 3 minutes more
each time (at most 30 min) and stops after 12 in a row (Wayback rate block).
Used for the JP raid cards (docs/notes/raid.md «Japan-only raids», Cards).
"""
import html
import os
import re
import sys
import time
import urllib.error
import urllib.request

CHROME = {'7t3cNUFMq', '7tXjNfcjs'}  # the BRIDGE game icon and logo, on every notice


def parse(t):
    """(date, heading / game, [image keys]) of a notice page"""
    h = re.search(r'newsHeading">\s*(.*?)</h2>', t, re.S)
    g = re.search(r'class="title_icon"[^>]*alt="([^"]*)"|alt="([^"]*)" class="title_icon"', t)
    title = html.unescape(re.sub('<[^>]+>', '', h.group(1))).strip() if h else ''
    game = html.unescape((g.group(1) or g.group(2)) if g else '')
    date = re.search(r'(\d\d)月(\d\d)日\s*(\d\d:\d\d)', t)
    keys = [k for k in dict.fromkeys(re.findall(r'cache\.sqex-bridge\.jp/img/([A-Za-z0-9]+)', t)) if k not in CHROME]
    return (date.group(0) if date else ''), (title + ' / ' + game).replace('|', '/'), keys


def main(cdx, order_file, outdir, log, delay=5.0):
    delay = float(delay)
    ts = {}
    for line in open(cdx):
        p = line.split()
        if len(p) == 2 and p[0].isdigit():
            ts[int(p[0])] = p[1]
    done = set()
    if os.path.exists(log):
        done = {int(l.split('|')[0]) for l in open(log, encoding='utf-8') if l.split('|')[0].isdigit()}
    os.makedirs(outdir, exist_ok=True)
    fails = 0
    with open(log, 'a', encoding='utf-8') as L:
        for i in (int(x) for x in open(order_file).read().split()):
            if i in done or i not in ts:
                continue
            fn = os.path.join(outdir, 'n%d.html' % i)
            if not os.path.exists(fn):
                u = 'https://web.archive.org/web/%sid_/http://cache.sqex-bridge.jp/guest/information/%d' % (ts[i], i)
                try:
                    data = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'restoration-research/1.0'}), timeout=60).read()
                    open(fn, 'wb').write(data)
                    fails = 0
                    time.sleep(delay)
                except urllib.error.HTTPError as e:
                    L.write('%d|ERR %s||\n' % (i, e.code))
                    L.flush()
                    time.sleep(600 if e.code == 429 else delay)
                    continue
                except Exception as e:  # connection refused / timeout: Wayback rate block
                    fails += 1
                    print('fail', i, e, flush=True)
                    if fails >= 12:
                        sys.exit('stopped: %d connection failures in a row' % fails)
                    time.sleep(min(1800, 180 * fails))
                    continue
            date, title, keys = parse(open(fn, encoding='utf-8', errors='replace').read())
            L.write('%d|%s|%s|%s\n' % (i, date, title, ','.join(keys)))
            L.flush()


if __name__ == '__main__':
    if len(sys.argv) not in (5, 6):
        sys.exit(__doc__)
    main(*sys.argv[1:])
