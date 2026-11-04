"""Where a raid boss LWF puts its weak points, frame by frame (I-221, review renders).

    python -I recon/tools/raid_weak_points.py <lwf> [frame ...]   -> one line per weak point: frame, N, x, y (LWF stage)

A weak point is a movie instance named parts<N> that holds a 'center' or 'attack' instance (the rule of
check_raid_models.weak_slots: the client searches parts1-parts6 and sizes the tap marker from the part's raidEnemy row).
markers() walks the display tree of one frame with the placement matrices and returns, for each parts<N> found, the
stage position of its 'center' instance (or of 'attack' when it has no 'center'). The tap marker the client draws is
not read from the file; this only says where the part sits, to mark it on a rendered review frame.
"""
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lwf_rig  # noqa: E402
import numpy as np  # noqa: E402


def instance_names(L):
    """instanceName section: string index per instance id"""
    off, n = L.sec['instanceName']
    return [L.S[struct.unpack_from('<i', L.b, off + 4 * i)[0]] for i in range(n)]


def _display(L, movie_id, frame_idx):
    """as lwf_rig.LWF.display, with the instance id of each depth: {depth: (obj, matId, placed_at, inst, clip)}"""
    depths, lo, ln, foff, fn, ceo, cen = L.movie[movie_id]
    dl = {}
    for fi in range(min(frame_idx, fn - 1) + 1):
        co, cn = L.frame[foff + fi]
        alive = set()
        for t, cid in L.control[co: co + cn]:
            if t == 0:
                p, m = cid, None
            elif t == 1:
                p, m = L.movem[cid]
            elif t == 2:
                p, m = L.movec[cid][0], None
            elif t == 3:
                p, m = L.movemc[cid][:2]
            else:
                continue
            dv, o, inst, pm = L.place[p]
            d = dv & 0xffff
            prev = dl.get(d)
            pa = prev[2] if (prev and prev[0] == o) else fi
            dl[d] = (o, m if m is not None else pm, pa, inst, (dv >> 16) & 0xffff)
            alive.add(d)
        for d in list(dl):
            if d not in alive:
                del dl[d]
    return dl


def markers(L, frame_idx=0, names=None):
    """[(N, x, y)] stage positions of the weak points drawn at this frame, sorted by N"""
    names = names if names is not None else instance_names(L)
    found = {}

    def walk(movie_id, f, M, part):
        hit = {}
        for d, (o, mid, pa, inst, clip) in sorted(_display(L, movie_id, f).items()):
            ot, oid = L.objects[o & 0xffff]
            W = M @ L.mat(mid)
            n = names[inst] if 0 <= inst < len(names) else None
            if n in ('center', 'attack') and part is not None:
                hit.setdefault(n, (W[0, 2], W[1, 2]))
            if ot == 2:
                sub = part
                if n and n.startswith('parts') and n[5:].isdigit():
                    sub = int(n[5:])
                fn = L.movie[oid][4]
                h = walk(oid, (f - pa) % max(1, fn), W, sub)
                if sub is not None and sub != part and h and sub not in found:
                    found[sub] = h.get('center') or h.get('attack')
        return hit

    walk(L.root, frame_idx, np.eye(3), None)
    return sorted((k, float(v[0]), float(v[1])) for k, v in found.items())


def main(argv):
    L = lwf_rig.LWF(argv[1])
    n = max(m[4] for m in L.movie)
    frames = [int(x) for x in argv[2:]] or [0]
    for f in frames:
        for k, x, y in markers(L, min(f, n - 1)):
            print('%d\tparts%d\t%.1f\t%.1f' % (f, k, x, y))


if __name__ == '__main__':
    main(sys.argv)
