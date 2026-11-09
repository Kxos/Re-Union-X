"""Question boards of the event quiz quests (Events Part 4, Task 6): one drama and one board picture per quiz stage.

    python -I recon/tools/make_quiz_dramas.py [--out <stage_gen>\\files] [--plan recon/tools/quiz_dramas.json]
        [--boards <private boards folder>] [--jp <JP 4.3.1 data>] [--list <stage_gen>\\event_dramas.json] [--assign] [--dry]

A quiz quest asks its question on a picture board shown by the drama before the quest (docs/notes/events.md, «Quiz boards»):
the drama img/light/SEQ/<id>.l is a 320-byte script that loads the board img/light/NPC/<picture>.png, slides it in, holds the
transparent picture img/light/NPC/30300.png in slot 5009 for 600 s (the board stays until the player taps SKIP) with music
501000810, then fades out. Every original quiz run used the same dramas 1900501..1900520 and boards 39101..39120 (the CDN swapped
the files for each run) and no worldwide copy survives, so our static resources give every quiz stage its OWN ids:
  * plan (this repository, ids only): recon/tools/quiz_dramas.json {"<donor stage id>": {"records", "source", "boards":
    [{"drama", "picture", "file"}]}}, append-only; --assign adds the stages of the private boards manifest that the plan lacks,
    with the next free ids of the ranges below (Brainteaser 10/10 shows 4 boards in a row: 4 dramas, in the manifest order);
  * boards (private, never in the repository): the user-approved boards of tmp\\events\\quiz\\boards_final (manifest.json:
    source reconstructed / footage_redraw / original_screenshot), copied as <picture>.png (btf_fix.py turns them into BTF);
  * dramas: the JP 4.3.1 quiz script (any revision of img/light/SEQ/1900501: all are identical but for the picture id) read at
    build time, with the picture id (int 13, byte 52) set to the stage's picture; nothing else changes;
  * 30300.png: written here, a fully transparent 426x480 picture (same size and pixels as the JP file, no copy).
--list writes the drama ids now in the pack (a JSON list) for the master run: KHUX_EVENT_DRAMAS (make-events.js checks every id
of event_config.json quizDramas against it). Ranges (free in every WW / JP index and in our packs, checked 10 Nov 2026): dramas
1906101..1906199, pictures 39401..39499. Exit 1 when a source is missing or a range is full.
"""
import argparse
import json
import os
import re
import shutil
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
D = r'D:\Progetto_Restauro_KH_UX'
PLAN = os.path.join(HERE, 'quiz_dramas.json')
BOARDS = os.path.join(D, 'tmp', 'events', 'quiz', 'boards_final')
DRAMA_RANGE = (1906101, 1906199)
PICTURE_RANGE = (39401, 39499)
TEMPLATE_ID, TEMPLATE_PICTURE, PICTURE_INT = 1900501, 39101, 13
HOLD = 30300
HOLD_SIZE = (426, 480)


def png_transparent(w, h):
    """bytes of a fully transparent RGBA PNG (no Pillow: runs with python -I)"""
    def chunk(t, data):
        return struct.pack('>I', len(data)) + t + data + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)
    raw = b''.join(b'\x00' + b'\x00' * (4 * w) for _ in range(h))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def template(jp):
    """the JP quiz script (bytes) and its path: a revision of SEQ/1900501, checked to be the 320-byte shape with one picture id"""
    seq = os.path.join(jp, 'img', 'light', 'SEQ')
    names = sorted(n for n in os.listdir(seq) if re.fullmatch(r'%d(\.\d{8}| \(\d+\))?\.l' % TEMPLATE_ID, n))
    if not names:
        raise SystemExit('no img/light/SEQ/%d.l in %s' % (TEMPLATE_ID, seq))
    path = os.path.join(seq, '%d.l' % TEMPLATE_ID if '%d.l' % TEMPLATE_ID in names else names[-1])
    b = open(path, 'rb').read()
    v = struct.unpack('<%di' % (len(b) // 4), b) if len(b) % 4 == 0 else ()
    if len(b) != 320 or v[PICTURE_INT] != TEMPLATE_PICTURE or v.count(TEMPLATE_PICTURE) != 1 or HOLD not in v:
        raise SystemExit('%s is not the 320-byte quiz script with one picture id %d' % (path, TEMPLATE_PICTURE))
    return b, path


def drama_bytes(tpl, picture):
    return tpl[:PICTURE_INT * 4] + struct.pack('<i', picture) + tpl[PICTURE_INT * 4 + 4:]


def assign(plan, manifest):
    """add the manifest's stages missing from the plan (ascending stage id), next free ids; returns the stage ids added"""
    used_d = {b['drama'] for e in plan.values() for b in e['boards']}
    used_p = {b['picture'] for e in plan.values() for b in e['boards']}
    nd = max(used_d | {DRAMA_RANGE[0] - 1}) + 1
    npic = max(used_p | {PICTURE_RANGE[0] - 1}) + 1
    added = []
    for sid in sorted(manifest, key=int):
        if sid in plan:
            continue
        m = manifest[sid]
        boards = []
        for f in m.get('files') or [m['file']]:
            if nd > DRAMA_RANGE[1] or npic > PICTURE_RANGE[1]:
                raise SystemExit('quiz drama or picture range full (%s, %s)' % (DRAMA_RANGE, PICTURE_RANGE))
            boards.append({'drama': nd, 'picture': npic, 'file': f})
            nd += 1
            npic += 1
        plan[sid] = {'records': m.get('record') or [], 'source': m['source'], 'boards': boards}
        added.append(sid)
    return added


def main(argv=None):
    import private_tools
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(D, 'stage_gen', 'files'))
    ap.add_argument('--plan', default=PLAN)
    ap.add_argument('--boards', default=BOARDS)
    ap.add_argument('--jp', default=None)
    ap.add_argument('--list', default=os.path.join(D, 'stage_gen', 'event_dramas.json'))
    ap.add_argument('--assign', action='store_true', help='add the stages of the boards manifest that the plan lacks')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args(argv)
    plan = json.load(open(a.plan, encoding='utf-8'))['stages'] if os.path.exists(a.plan) else {}
    mf = os.path.join(a.boards, 'manifest.json')
    if not os.path.exists(mf):
        raise SystemExit('boards manifest missing: ' + mf)
    manifest = json.load(open(mf, encoding='utf-8'))
    if a.assign:
        added = assign(plan, manifest)
        print('plan: %d stages added' % len(added))
        if not a.dry:
            doc = {'_doc': 'Own drama and board picture ids of the event quiz stages (recon/tools/make_quiz_dramas.py; Events Part 4 '
                           'Task 6): donor stage id -> records, board source, boards [{drama, picture, file}]. Append-only. Ids only: '
                           'the boards are private (user-approved, tmp/events/quiz/boards_final).',
                   'stages': {k: plan[k] for k in sorted(plan, key=int)}}
            with open(a.plan, 'w', encoding='utf-8', newline='\n') as fh:
                json.dump(doc, fh, ensure_ascii=False, indent=1)
                fh.write('\n')
    tpl, tpl_path = template(a.jp or private_tools.local_path('jp_data'))
    jobs = []
    for sid in sorted(plan, key=int):
        for b in plan[sid]['boards']:
            src = os.path.join(a.boards, b['file'])
            if not os.path.exists(src):
                raise SystemExit('board missing: %s (stage %s)' % (src, sid))
            jobs.append((b['drama'], b['picture'], src))
    seq_dir = os.path.join(a.out, 'img', 'light', 'SEQ')
    npc_dir = os.path.join(a.out, 'img', 'light', 'NPC')
    print('%d stages, %d boards; template %s' % (len(plan), len(jobs), os.path.basename(tpl_path)))
    if a.dry:
        return 0
    os.makedirs(seq_dir, exist_ok=True)
    os.makedirs(npc_dir, exist_ok=True)
    for drama, picture, src in jobs:
        with open(os.path.join(seq_dir, '%d.l' % drama), 'wb') as fh:
            fh.write(drama_bytes(tpl, picture))
        shutil.copyfile(src, os.path.join(npc_dir, '%d.png' % picture))
    with open(os.path.join(npc_dir, '%d.png' % HOLD), 'wb') as fh:
        fh.write(png_transparent(*HOLD_SIZE))
    if a.list:
        os.makedirs(os.path.dirname(a.list), exist_ok=True)
        with open(a.list, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(sorted(d for d, _, _ in jobs), fh)
    print('written %d dramas, %d boards and %d.png into %s; list %s' % (len(jobs), len(jobs), HOLD, a.out, a.list or '-'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
