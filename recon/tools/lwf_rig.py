"""Minimal LWF reader (GREE format 0x121010 / 0x131211): flattened draw list of a frame (I-194, rig of the enemy
animations). Coordinates: LWF/Flash stage, y downwards. Matrix (scaleX, scaleY, skew0, skew1, tx, ty):
x' = sx*x + k0*y + tx; y' = k1*x + sy*y + ty. Used by video_texture_recover.py.

Place fields (checked on every LWF of the dump, 23-10, both formats):
  place.depth  = depth | clipDepth << 16: clipDepth > 0 marks a Flash MASK layer (the clip depth is always greater
                 than the depth; values up to 1737, so it is not a blend mode). The mask piece itself is never drawn
                 (they are flat colour fills, e.g. enemy 1615's 187x198 solid red square); it clips the siblings at
                 depths (depth, clipDepth]. draws() leaves masks out and lists them in Draw.masks of the clipped draws.
  place.object = objectId | (0x8000 | blendMode) << 16 (0 normal, 1 add, 5 multiply, ...).
"""
import struct, numpy as np
SECTIONS = ['stringBytes', 'animationBytes', 'translate', 'matrix', 'color', 'alphaTransform',
            'colorTransform', 'objectData', 'texture', 'textureFragment', 'bitmap', 'bitmapEx', 'font',
            'textProperty', 'text', 'particleDatabase', 'particle', 'programObject', 'graphicObject',
            'graphic', 'animation', 'buttonCondition', 'button', 'label', 'instanceName', 'eventName',
            'place', 'controlMoveM', 'controlMoveC', 'controlMoveMC', 'control', 'frame',
            'movieClipEvent', 'movie', 'movieLinkage', 'stringData']
FLAG = 0x80000000


class Draw(tuple):
    """(tex, rect, M, mul, add) con .blend (0 normale, 1 add) e .masks (tuple di liste di Draw che lo ritagliano)"""
    def __new__(cls, t, blend=0, masks=None):
        o = super().__new__(cls, t); o.blend = blend; o.masks = masks; return o
def _arr(b, sec, fmt):
    o, c = sec; sz = struct.calcsize(fmt)
    return [struct.unpack_from(fmt, b, o + i * sz) for i in range(c)]
class LWF:
    def __init__(self, path):
        b = open(path, 'rb').read(); self.b = b
        assert b[:4] == b'LWF\0', path
        self.version = b[4:7].hex()
        self.w, self.h, self.fps, self.root, self.nameid, self.bg = struct.unpack_from('<6i', b, 8)
        sec = {n: struct.unpack_from('<2i', b, 0x20 + 8 * i) for i, n in enumerate(SECTIONS)}
        self.sec = sec
        so = sec['stringBytes'][0]
        self.S = [b[so + o: so + o + l].decode('utf-8', 'replace') for o, l in _arr(b, sec['stringData'], '<2i')]
        self.translate = _arr(b, sec['translate'], '<2f')
        self.matrix = _arr(b, sec['matrix'], '<6f')
        self.alpha = [a[0] for a in _arr(b, sec['alphaTransform'], '<f')]
        self.color = _arr(b, sec['color'], '<4f')
        self.ctrans = _arr(b, sec['colorTransform'], '<2i')  # (multi colorId, add colorId)
        self.objects = _arr(b, sec['objectData'], '<2i')
        self.textures = [(self.S[s], f, w, h, sc) for s, f, w, h, sc in _arr(b, sec['texture'], '<4if')]
        self.frags = _arr(b, sec['textureFragment'], '<9i')  # sid, tex, rotated, x, y, u, v, w, h
        self.bitmaps = _arr(b, sec['bitmap'], '<2i')          # matrixId, fragId
        self.bitmapEx = _arr(b, sec['bitmapEx'], '<3i4f')     # matrixId, fragId, attribute, u,v,w,h
        self.graphicObject = _arr(b, sec['graphicObject'], '<2i')
        self.graphic = _arr(b, sec['graphic'], '<2i')
        self.place = _arr(b, sec['place'], '<4i')
        self.movem = _arr(b, sec['controlMoveM'], '<2i')
        self.movec = _arr(b, sec['controlMoveC'], '<2i')
        self.movemc = _arr(b, sec['controlMoveMC'], '<3i')
        self.control = _arr(b, sec['control'], '<2i')
        self.frame = _arr(b, sec['frame'], '<2i')
        self.movie = _arr(b, sec['movie'], '<7i')
        self.links = {self.S[s]: m for s, m in _arr(b, sec['movieLinkage'], '<2i')}
    def mat(self, mid):
        if mid & FLAG:
            sx, sy, k0, k1, tx, ty = self.matrix[mid & 0x7fffffff]
            return np.array([[sx, k0, tx], [k1, sy, ty], [0, 0, 1.]])
        tx, ty = self.translate[mid]
        return np.array([[1, 0, tx], [0, 1, ty], [0, 0, 1.]])
    def ctf(self, cid):
        """(mul rgba, add rgba)"""
        if cid & FLAG:
            try:
                m, a = self.ctrans[cid & 0x7fffffff]
                return np.array(self.color[m]), np.array(self.color[a])
            except IndexError:              # colour table not decoded for some 0x121010 files: identity
                return np.ones(4), np.zeros(4)
        return np.array([1, 1, 1, self.alpha[cid]]), np.zeros(4)
    def display(self, movie_id, frame_idx):
        """display list al fotogramma (replay 0..f). {depth: [obj, matId, ctId, placed_at, clipDepth]}"""
        depths, lo, ln, foff, fn, ceo, cen = self.movie[movie_id]
        dl = {}
        for fi in range(min(frame_idx, fn - 1) + 1):
            co, cn = self.frame[foff + fi]
            alive = set()
            for t, cid in self.control[co: co + cn]:
                if t == 0: p = cid; m = None; c = None
                elif t == 1: p, m = self.movem[cid]; c = None
                elif t == 2: p, c = self.movec[cid]; m = None
                elif t == 3: p, m, c = self.movemc[cid]
                else: continue
                dv, o, inst, pm = self.place[p]
                d, clip = dv & 0xffff, (dv >> 16) & 0xffff
                prev = dl.get(d)
                pa = prev[3] if (prev and prev[0] == o) else fi
                dl[d] = [o, m if m is not None else pm, c if c is not None else 0, pa, clip]
                alive.add(d)
            # in LWF ogni fotogramma elenca tutti gli oggetti vivi (frame = stato completo)
            for d in list(dl):
                if d not in alive: del dl[d]
        return dl
    def draws(self, movie_id=None, frame_idx=0, M=None, C=None, out=None, _lvl=0, blend=0, masks=()):
        """lista appiattita di disegni: (texId, frag, M(3x3 da spazio texture px a mondo), mul, add); i pezzi maschera
        (clipDepth) non sono disegnati: finiscono in .masks dei disegni che ritagliano"""
        if movie_id is None: movie_id = self.root
        if M is None: M = np.eye(3)
        if C is None: C = (np.ones(4), np.zeros(4))
        if out is None: out = []
        dl = self.display(movie_id, frame_idx)
        active = []                                 # (clipDepth, draws of the mask)
        for d in sorted(dl):
            o, mid, cid, pa, clip = dl[d]
            active = [a for a in active if d <= a[0]]
            ot, oid = self.objects[o & 0xffff]
            bl = blend or ((o >> 16) & 0x7fff)      # modo di fusione nei 16 bit alti (1 = add)
            W = M @ self.mat(mid)
            mul, add = self.ctf(cid)
            Cm = (C[0] * mul, C[0] * add + C[1])
            tgt = [] if clip else out
            mk = () if clip else tuple(masks) + tuple(a[1] for a in active)
            n0 = len(tgt)
            if ot == 2:
                fn = self.movie[oid][4]
                self.draws(oid, (frame_idx - pa) % max(1, fn), W, Cm, tgt, _lvl + 1, bl, mk)
            elif ot in (3, 4):
                self._bm(ot, oid, W, Cm, tgt, bl)
            elif ot == 1:
                go, gn = self.graphic[oid]
                for gt, gid in self.graphicObject[go: go + gn]:
                    if gt in (0, 1): self._bm(gt + 3, gid, W, Cm, tgt, bl)
            if clip:
                active.append((clip, tgt))
            else:
                for x in tgt[n0:]:
                    if x.masks is None:
                        x.masks = mk
        return out
    def _bm(self, ot, oid, W, C, out, bl=0):
        if ot == 3: bmid, fid = self.bitmaps[oid]
        else: bmid, fid = self.bitmapEx[oid][:2]
        sid, tex, rot, fx, fy, u, v, fw, fh = self.frags[fid]
        B = W @ self.mat(bmid)
        # pixel (px,py) del ritaglio [u,v,fw,fh] -> locale (fx+px, fy+py); ruotato non gestito
        T = np.array([[1, 0, fx - u], [0, 1, fy - v], [0, 0, 1.]])
        if rot: raise NotImplementedError('frammento ruotato')
        out.append(Draw((tex, (u, v, fw, fh), B @ T, C[0], C[1]), bl))
