"""Which raid boss models can be shown by the client (I-221, Raids Part 2).

    python -I recon/tools/check_raid_models.py <files_dir> <out.json> [--models 0001,0002,... | --models raid_models.txt] [--served names.tsv[,names2.tsv]]

<files_dir> is the assembled resource tree (stage_gen\files). A model is usable only if every texture its LWF names
exists next to it. Per model id the output has four flags:

    fight     lwf/character/raid/<id>/{atk1,atk2,knockback1,knockback2,wait}: LWF and all its textures
    start     lwf/raid/demo/start_<id>      (played when raidStatus is 4)
    escape    lwf/raid/demo/escape_<id>     (played when raidStatus is 2)
    put_down  lwf/raid/demo/put_down_<id>   (played on every win; loaded without a null check)

    slots     weak points of the wait LWF (see weak_slots); only when the LWF is on disk. make-raid.js keeps a boss
              only if each slot N > 1 has a part of weakness N (a missing one crashes the client at fight load)

A boss is AVAILABLE when fight and put_down are true. start / escape false only mean the server must never send
raidStatus 4 / 2 for it. Models checked: those in --models (default recon/tools/raid_models.txt, one id per line,
# comments) plus every folder found under lwf/character/raid.
--served: the name lists build-resources.ps1 gives import_originals.py (first column = served path). Files in them are
not copied into the pack, so a name counts as present if it is on disk (size > 0) or served.
"""
import json
import os
import struct
import sys

ANIMS = ('atk1', 'atk2', 'knockback1', 'knockback2', 'wait')
DEMOS = ('start', 'escape', 'put_down')
HERE = os.path.dirname(os.path.abspath(__file__))


def lwf_textures(data):
    """Texture file names an LWF lists (same layout the texture census read)."""
    sb = struct.unpack_from('<i', data, 32)[0]
    so, sn = struct.unpack_from('<ii', data, 312)
    strs = []
    for k in range(sn):
        o, n = struct.unpack_from('<ii', data, so + 8 * k)
        strs.append(data[sb + o:sb + o + n].decode('utf-8', 'replace'))
    to, tn = struct.unpack_from('<ii', data, 32 + 8 * 8)
    names = []
    for k in range(tn):
        idx = struct.unpack_from('<iiiif', data, to + 20 * k)[0]
        if 0 <= idx < sn:
            names.append(strs[idx])
    return names


def _section(data, k, width):
    off, n = struct.unpack_from('<ii', data, 32 + 8 * k)
    return [struct.unpack_from('<%di' % width, data, off + 4 * width * i) for i in range(n)]


def weak_slots(path):
    """Weak points of a raid model: N for every movie instance named parts<N> that holds a 'center' or 'attack' instance,
    in any frame of the LWF. At fight load the client searches parts1-parts6 under 'char' and, for each one found, reads the
    part in slot N and looks up its raidEnemy row (an empty slot is a null row: crash, docs/notes/raid.md «Weak points»).
    Movies named parts<N> that hold only a picture are not weak points (Jack in the Box parts4/5, Darkside Omega).
    None when the file has no movie tree (or is not an LWF)."""
    try:
        with open(path, 'rb') as f:
            data = f.read()
        sb = struct.unpack_from('<i', data, 32)[0]
        strs = []
        for o, n in _section(data, 35, 2):
            strs.append(data[sb + o:sb + o + n].decode('utf-8', 'replace'))
        inst = [strs[x[0]] for x in _section(data, 24, 1)]
        objs, places = _section(data, 7, 2), _section(data, 26, 4)
        moves = {1: _section(data, 27, 2), 2: _section(data, 28, 2), 3: _section(data, 29, 3)}
        ctrls, frames, movies = _section(data, 30, 2), _section(data, 31, 2), _section(data, 33, 7)
    except (struct.error, IndexError, OSError):
        return None
    if not movies:
        return None
    # per movie: (instance name, child movie id or None) of every placement in any frame
    kids = []
    for m in movies:
        seen = set()
        fo, fn = m[3], m[4]
        for co, cn in frames[fo:fo + fn]:
            for ct, cid in ctrls[co:co + cn]:
                if ct == 0:
                    p = cid
                elif ct in moves and 0 <= cid < len(moves[ct]):
                    p = moves[ct][cid][0]
                else:
                    continue                       # animation and other controls place nothing
                if not 0 <= p < len(places):
                    continue
                _, oid, iid, _ = places[p]
                oid &= 0xffff                      # high bits are flags (format 0x12: bit 31; 0x13: more)
                if oid >= len(objs):
                    continue
                ot, oo = objs[oid]
                name = inst[iid] if 0 <= iid < len(inst) else None
                seen.add((name, oo if ot == 2 else None))
        kids.append(seen)
    marked = {i for i, s in enumerate(kids) if any(n in ('center', 'attack') for n, _ in s)}
    out = set()
    for s in kids:
        for n, child in s:
            if n and n.startswith('parts') and n[5:].isdigit() and child in marked:
                out.add(int(n[5:]))
    return sorted(out)


def folder_ok(folder, name, served=None, rel=None, notes=None):
    """folder holds <name>.lwf and every texture it names (non-empty files). A file not on disk counts as present if
    '<rel>/<file>' is in `served` (names of the base resources, which import_originals.py never copies). If the LWF
    itself is served and not on disk it cannot be read here: the folder then counts as complete (a model of the
    base resources) and a line saying so goes to `notes`."""
    served = served or ()
    p = os.path.join(folder, name + '.lwf')
    if os.path.isfile(p):
        try:
            with open(p, 'rb') as f:
                names = lwf_textures(f.read())
        except (struct.error, IndexError):
            return False
    elif rel and (rel + '/' + name + '.lwf') in served:
        if notes is not None:
            notes.append('%s: LWF in the base resources, texture list not parsed' % rel)
        return True
    else:
        return False
    for n in names:
        q = os.path.join(folder, n)
        if os.path.isfile(q) and os.path.getsize(q) > 0:
            continue
        if rel and (rel + '/' + n) in served:
            continue
        return False
    return True


def check_model(files_dir, mid, served=None, notes=None):
    base = os.path.join(files_dir, 'lwf', 'character', 'raid', mid)
    res = {'fight': all(folder_ok(os.path.join(base, a), a, served, 'lwf/character/raid/%s/%s' % (mid, a), notes)
                        for a in ANIMS)}
    for k in DEMOS:
        name = '%s_%s' % (k, mid)
        res[k] = folder_ok(os.path.join(files_dir, 'lwf', 'raid', 'demo', name), name, served, 'lwf/raid/demo/' + name, notes)
    out = {k: res[k] for k in ('fight', 'start', 'escape', 'put_down')}
    slots = weak_slots(os.path.join(base, 'wait', 'wait.lwf'))
    if slots is not None:
        out['slots'] = slots
    return out


def read_served(spec):
    names = set()
    for p in spec.split(','):
        if p:
            with open(p, encoding='utf-8') as f:
                for ln in f:
                    names.add(ln.split('	', 1)[0].strip())
    return names


def available(flags):
    return bool(flags['fight'] and flags['put_down'])


def read_models(spec):
    if os.path.isfile(spec):
        out = []
        for ln in open(spec, encoding='utf-8'):
            ln = ln.split('#', 1)[0].strip()
            if ln:
                out.append(ln)
        return out
    return [m.strip() for m in spec.split(',') if m.strip()]


def main(argv):
    files_dir, out = argv[1], argv[2]
    spec = argv[argv.index('--models') + 1] if '--models' in argv else os.path.join(HERE, 'raid_models.txt')
    ids = set(read_models(spec)) if (os.path.isfile(spec) or '--models' in argv) else set()
    root = os.path.join(files_dir, 'lwf', 'character', 'raid')
    if os.path.isdir(root):
        ids |= {d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))}
    served = read_served(argv[argv.index('--served') + 1]) if '--served' in argv else set()
    notes = []
    result = {m: check_model(files_dir, m, served, notes) for m in sorted(ids)}
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=1)
    av = [m for m in sorted(result) if available(result[m])]
    print('raid models: %d checked, %d available' % (len(result), len(av)))
    for n in sorted(set(notes)):
        print('  note: ' + n)
    for m in sorted(result):
        if not available(result[m]):
            print('  NOT available %s %s' % (m, result[m]))
    return result


if __name__ == '__main__':
    main(sys.argv)
