"""Which raid boss models can be shown by the client (I-221, Raids Part 2).

    python -I recon/tools/check_raid_models.py <files_dir> <out.json> [--models 0001,0002,... | --models raid_models.txt] [--served names.tsv[,names2.tsv]]

<files_dir> is the assembled resource tree (stage_gen\files). A model is usable only if every texture its LWF names
exists next to it. Per model id the output has four flags:

    fight     lwf/character/raid/<id>/{atk1,atk2,knockback1,knockback2,wait}: LWF and all its textures
    start     lwf/raid/demo/start_<id>      (played when raidStatus is 4)
    escape    lwf/raid/demo/escape_<id>     (played when raidStatus is 2)
    put_down  lwf/raid/demo/put_down_<id>   (played on every win; loaded without a null check)

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
    return {k: res[k] for k in ('fight', 'start', 'escape', 'put_down')}


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
