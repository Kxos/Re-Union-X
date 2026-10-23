"""Prototype (I-194): recover lost enemy texture pieces from gameplay video frames, guided by the original LWF rig.

    python -I recon/tools/video_texture_recover.py --id 1544 --anim wait --rig-frames 10 \
        --video "<dir with full-resolution frames>/*.png" --out <work dir> [--truth <png>] [--scales 1.2:2.2:0.05]

Offline, read only: the rig (JP LWF) and the known textures come from the generator's own rules (make_jp_enemies.py
fill_tex, run with --dry); nothing is written outside --out. The video frames are the user's local material (never in
the repository); so are the outputs.

Method:
 1. render the known pieces of the chosen rig frame(s) (missing ones blank) on a canvas in LWF units;
 2. coarse search of the enemy in every video frame: masked normalised cross-correlation of that render at 1/4
    resolution over a range of isotropic scales (and over the rig frames, to match the pose);
 3. refine each detection (scale, position, per-channel colour gain/bias) by minimising the L1 difference between
    the rendered known pieces and the video (differentiable sampling, Adam); the pixels that a missing piece could
    cover are left out;
 4. inverse warp: every texel of a missing piece drawn in that rig frame goes through its LWF matrix and the
    detection's similarity to a screen position; the video is sampled there and brought back to texture colour
    space (inverse colour gain); texels hidden by pieces drawn above it (draw order, alpha >= 0.5) are dropped;
 5. fusion over all detections: colour = median; what lies behind each texel = the known pieces drawn below it,
    then the scene (median of a ring of screen pixels around the piece); alpha: opaque where the samples agree
    with each other and differ from what is behind them (largest connected region), soft edges by projecting
    (sample - behind) onto (colour - behind); colour of the edge texels = nearest opaque texel;
 6. sheets: video crop | rig + recovered pieces | rig with the pieces missing (| rig + --truth).

Limits of the prototype: rigid pose per detection (one rig frame), no motion blur, no lighting/hit-flash model; pieces
only seen at screen scale < 1 texel/pixel come out soft.
"""
import argparse, glob, json, os, sys
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lwf_rig import LWF  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--id', type=int, required=True)
ap.add_argument('--anim', default='wait')
ap.add_argument('--rig-frames', default='10', help='rig frames to match (comma list or a:b:step)')
ap.add_argument('--video', required=True, help='glob of full-resolution video frames (PNG)')
ap.add_argument('--out', required=True)
ap.add_argument('--scales', default='1.2:2.2:0.05')
ap.add_argument('--ncc', type=float, default=0.76, help='coarse acceptance threshold')
ap.add_argument('--max-loss', type=float, default=0.025, help='refined L1 acceptance threshold (0-1)')
ap.add_argument('--truth', action='append', default=[], metavar='TEX=PNG', help='reference for a piece, for the metrics')
a = ap.parse_args()
DEV = 'cuda' if torch.cuda.is_available() else 'cpu'
os.makedirs(a.out, exist_ok=True)


def rng(s, cast=float):
    if ':' in s:
        lo, hi, st = map(float, s.split(':'))
        return [cast(x) for x in np.arange(lo, hi + st / 2, st)]
    return [cast(x) for x in s.split(',')]


# ---- rig and known textures (generator rules, read only)
_argv = sys.argv
sys.argv = ['make_jp_enemies.py', '--dry']
import make_jp_enemies as MJE  # noqa: E402
sys.argv = _argv


def load_png(p):
    b = open(p, 'rb').read()
    if b[:4] == b'\x89PNG':
        im = Image.open(p).convert('RGBA')
    else:
        import btf
        im = btf.decode(b).convert('RGBA')
    t = torch.tensor(np.asarray(im), dtype=torch.float32).permute(2, 0, 1) / 255.
    t[:3] *= t[3:4]
    return t.to(DEV)


def load_rig(d, anim):
    rel = str(d)
    jd = os.path.join(MJE.a.jp, rel)
    jp_all = {x: MJE.listing(os.path.join(jd, x)) for x in os.listdir(jd)}
    jp = jp_all.get(anim) or {}
    lw = jp[anim + '.lwf']
    pre = '%s/%s/%s/' % (MJE.ENEMY, rel, anim)
    L = LWF(lw)
    dims = MJE.tex_dims(lw)
    have = {}
    for i, t in enumerate(L.textures):
        q, _ = MJE.fill_tex(pre, anim, t[0], jp, jp_all, dims)
        if q:
            x = load_png(q)
            w, h = t[2:4]
            have[i] = x if x.shape[1:] == (h, w) else F.interpolate(x[None], size=(h, w), mode='bilinear', align_corners=False)[0]
    return L, have


L, have = load_rig(a.id, a.anim)
missing = [i for i in range(len(L.textures)) if i not in have]
RF = rng(a.rig_frames, int)
print('rig', a.id, a.anim, 'textures', len(L.textures), 'missing', [(i, L.textures[i][2:4]) for i in missing])


def tex_grid(tw, th, M, ox, oy, s, step=1.0):
    """texel centres of a (tw x th) texture under the LWF matrix M -> screen (s, ox, oy): (xs, ys)"""
    jj, ii = torch.meshgrid(torch.arange(th, device=DEV) + .5, torch.arange(tw, device=DEV) + .5, indexing='ij')
    Mt = torch.tensor(M, dtype=torch.float32, device=DEV)
    wx = Mt[0, 0] * ii + Mt[0, 1] * jj + Mt[0, 2]
    wy = Mt[1, 0] * ii + Mt[1, 1] * jj + Mt[1, 2]
    return ox + wx * s, oy + wy * s


def sample(V, xs, ys):
    H, W = V.shape[1:]
    g = torch.stack([xs / W * 2 - 1, ys / H * 2 - 1], -1)
    if g.dim() == 2:
        g = g[None]
    return F.grid_sample(V[None], g[None], mode='bilinear', align_corners=False, padding_mode='border')[0]


class Pose:
    """one rig frame rendered on a canvas in LWF units (origin = bbox corner)"""
    def __init__(self, f):
        self.f = f
        self.dr = [d for d in L.draws(frame_idx=f)]
        xs, ys = [], []
        for tex, (u, v, w, h), M, mul, add in self.dr:
            for cx, cy in ((u, v), (u + w, v), (u, v + h), (u + w, v + h)):
                p = M @ np.array([cx, cy, 1.])
                xs.append(p[0]); ys.append(p[1])
        self.x0, self.y0 = min(xs) - 2, min(ys) - 2
        self.W, self.H = int(np.ceil(max(xs) + 2 - self.x0)), int(np.ceil(max(ys) + 2 - self.y0))

    def render(self, texs, scale=1.0, upto=None):
        H, W = int(self.H * scale), int(self.W * scale)
        jj, ii = torch.meshgrid(torch.arange(H, device=DEV) + .5, torch.arange(W, device=DEV) + .5, indexing='ij')
        wx, wy = self.x0 + ii / scale, self.y0 + jj / scale
        C = torch.zeros(4, H, W, device=DEV)
        for k, d in enumerate(self.dr):
            if upto is not None and k >= upto:
                break
            tex, _r, M, mul, add = d
            t = texs.get(tex)
            if t is None:
                continue
            th, tw = t.shape[1:]
            Mi = np.linalg.inv(M)
            u = Mi[0, 0] * wx + Mi[0, 1] * wy + Mi[0, 2]
            v = Mi[1, 0] * wx + Mi[1, 1] * wy + Mi[1, 2]
            s = F.grid_sample(t[None], torch.stack([u / tw * 2 - 1, v / th * 2 - 1], -1)[None], align_corners=False)[0]
            al = s[3:4] * float(mul[3])
            rgb = s[:3] * torch.tensor(mul[:3], dtype=torch.float32, device=DEV)[:, None, None] * float(mul[3]) \
                + torch.tensor(add[:3], dtype=torch.float32, device=DEV)[:, None, None] * al
            if getattr(d, 'blend', 0) == 1:
                C = torch.cat([(C[:3] + rgb).clamp(max=1), C[3:4]])
            else:
                C = torch.cat([rgb, al]) + (1 - al) * C
        return C


poses = {f: Pose(f) for f in RF}
poses = {f: p for f, p in poses.items() if any(d[0] in have for d in p.dr)}
miss_drawn = sorted({d[0] for p in poses.values() for d in p.dr if d[0] in missing})
print('rig frames', list(poses), 'missing pieces drawn there', miss_drawn)


def known_mask(p):
    """canvas (scale 1) pixels usable for registration: known pieces opaque, outside every missing piece footprint"""
    R = p.render(have)
    hole = {t: torch.ones(4, L.textures[t][3], L.textures[t][2], device=DEV) for t in missing}
    Hm = p.render(hole)[3]
    return R, (R[3] > 0.95) & (Hm < 0.01)


# ---- 1/2. coarse search
Q = 4
frames = sorted(glob.glob(a.video))
dets = []
for fp in frames:
    V = torch.tensor(np.asarray(Image.open(fp).convert('RGB')), dtype=torch.float32, device=DEV).permute(2, 0, 1) / 255.
    Vq = F.interpolate(V[None], scale_factor=1 / Q, mode='area')[0]
    cand = []
    for f, p in poses.items():
        R, Mk = known_mask(p)
        for s in rng(a.scales):
            h, w = max(3, int(round(p.H * s / Q))), max(3, int(round(p.W * s / Q)))
            T = F.interpolate(torch.cat([R, Mk[None].float()])[None], size=(h, w), mode='area')[0]
            M = (T[4:5] > 0.99).float()
            n = M.sum()
            if n < 20:
                continue
            rgb = T[:3] / T[3:4].clamp(min=1e-3) * M
            tz = (rgb - (rgb.sum((1, 2)) / n)[:, None, None]) * M
            sV = F.conv2d(Vq[:, None], M[None])[:, 0]
            sV2 = F.conv2d((Vq ** 2)[:, None], M[None])[:, 0]
            num = torch.cat([F.conv2d(Vq[c:c + 1][None], tz[c:c + 1][None]) for c in range(3)], 1)[0]
            var = (sV2 - sV ** 2 / n).clamp(min=float(n) * 4e-4)
            ncc = (num / torch.sqrt(var * (tz ** 2).sum((1, 2)).clamp(min=1e-6)[:, None, None])).mean(0)
            mp = F.max_pool2d(ncc[None, None], 9, 1, 4)[0, 0]
            for y, x in ((ncc == mp) & (ncc > a.ncc)).nonzero().tolist():
                cand.append((float(ncc[y, x]), f, s, x * Q, y * Q))
    cand.sort(reverse=True)
    keep = []
    for c in cand:
        if all(abs(c[3] - k[3]) > 15 * Q or abs(c[4] - k[4]) > 15 * Q for k in keep):
            keep.append(c)
    # ---- 3. refine
    for ncc0, f, s, x, y in keep:
        p = poses[f]
        R, Mk = known_mask(p)
        rgbR = (R[:3] / R[3:4].clamp(min=1e-3))
        jj, ii = torch.meshgrid(torch.arange(p.H, device=DEV) + .5, torch.arange(p.W, device=DEV) + .5, indexing='ij')
        ps = torch.tensor([float(x), float(y)], device=DEV, requires_grad=True)
        sc = torch.tensor([float(s)], device=DEV, requires_grad=True)
        gb = torch.tensor([1., 1, 1, 0, 0, 0], device=DEV, requires_grad=True)
        opt = torch.optim.Adam([{'params': [ps], 'lr': 0.5}, {'params': [sc], 'lr': 0.004}, {'params': [gb], 'lr': 0.01}])
        for it in range(400):
            if it == 150:
                for g in opt.param_groups:
                    g['lr'] *= 0.2
            obs = sample(V, ps[0] + ii * sc[0], ps[1] + jj * sc[0])
            loss = ((rgbR * gb[:3, None, None] + gb[3:, None, None] - obs).abs().mean(0))[Mk].mean()
            opt.zero_grad(); loss.backward(); opt.step()
        if float(loss) > a.max_loss:
            continue
        with torch.no_grad():
            s1 = float(sc); ox, oy = float(ps[0]) - p.x0 * s1, float(ps[1]) - p.y0 * s1   # screen of LWF origin
            g, b = gb[:3, None, None], gb[3:, None, None]
            rec = {'frame': os.path.basename(fp), 'rig': f, 'ncc': ncc0, 'loss': float(loss), 's': s1, 'ox': ox, 'oy': oy,
                   'gain': gb.tolist(), 'pieces': {}}
            for k, d in enumerate(p.dr):
                tex = d[0]
                if tex not in missing:
                    continue
                tw, th = L.textures[tex][2:4]
                xs, ys = tex_grid(tw, th, d[2], ox, oy, s1)
                I = (sample(V, xs, ys) - b) / g
                # behind: known pieces drawn below, in the canvas, sampled at the same world points
                below = p.render(have, upto=k)
                wx, wy = (xs - ox) / s1, (ys - oy) / s1
                cg = torch.stack([(wx - p.x0) / p.W * 2 - 1, (wy - p.y0) / p.H * 2 - 1], -1)[None]
                Bk = F.grid_sample(below[None], cg, align_corners=False)[0]
                # above: transmittance of the pieces drawn above (known or missing = occluder)
                above = {t: (have[t] if t in have else torch.ones(4, L.textures[t][3], L.textures[t][2], device=DEV))
                         for t in range(len(L.textures))}
                abv = Pose.__new__(Pose); abv.__dict__.update(p.__dict__); abv.dr = p.dr[k + 1:]
                Ta = 1 - F.grid_sample(abv.render(above)[3:4][None], cg, align_corners=False)[0, 0]
                # scene: ring of screen pixels around the piece (texel space, 6 texels wide)
                ring = []
                for du in range(-6, tw + 6):
                    for dv in range(-6, th + 6):
                        if not (0 <= du < tw and 0 <= dv < th):
                            ring.append((du + .5, dv + .5))
                ring = torch.tensor(ring, device=DEV)
                Mt = d[2]
                rx = ox + s1 * (Mt[0, 0] * ring[:, 0] + Mt[0, 1] * ring[:, 1] + Mt[0, 2])
                ry = oy + s1 * (Mt[1, 0] * ring[:, 0] + Mt[1, 1] * ring[:, 1] + Mt[1, 2])
                scene = ((sample(V, rx[None], ry[None]).reshape(3, -1).median(1).values)[:, None, None] - b) / g
                Bstr = Bk[:3] / Bk[3:4].clamp(min=1e-3)
                behind = Bk[3:4] * Bstr + (1 - Bk[3:4]) * scene
                I[:, Ta < 0.5] = float('nan')
                rec['pieces'][tex] = {'I': I.cpu().numpy(), 'B': behind.cpu().numpy()}
            dets.append(rec)
            print(os.path.basename(fp), 'rig f%d' % f, 'ncc %.3f loss %.4f s %.3f' % (ncc0, float(loss), s1), flush=True)

print('detections', len(dets))
if not dets:
    raise SystemExit('no detection: enemy not found in the frames (scale range, pose or occlusion)')


# ---- 5. fusion
def fuse(Is, Bs):
    I, B = np.array(Is), np.array(Bs)
    med = np.nanmedian(I, 0)
    seen = ~np.isnan(med[0])
    med = np.nan_to_num(med)
    dist = np.nanmedian(np.linalg.norm(I - B, axis=1), 0)
    spread = np.nanmedian(np.linalg.norm(I - med[None], axis=1), 0)
    hard = seen & (np.nan_to_num(dist) > 0.12) & (np.nan_to_num(spread, nan=1) < 0.12)
    hard = ndimage.binary_opening(hard, iterations=1)
    lab, n = ndimage.label(hard)
    if n:
        hard = lab == (1 + int(np.argmax(ndimage.sum(hard, lab, range(1, n + 1)))))
    core = ndimage.binary_erosion(hard, iterations=1)
    if not core.any():
        core = hard
    if not core.any():
        return None, {'seen': float(seen.mean()), 'opaque': 0}
    idx = ndimage.distance_transform_edt(~core, return_distances=False, return_indices=True)
    Fc = np.where(core[None], med, med[:, idx[0], idx[1]])
    num = ((I - B) * (Fc[None] - B)).sum(1)
    den = ((Fc[None] - B) ** 2).sum(1)
    A = np.nanmedian(np.clip(num / np.maximum(den, 1e-4), 0, 1), 0)
    A = np.nan_to_num(A)
    A[core] = 1.0
    A[~ndimage.binary_dilation(hard, iterations=2)] = 0
    flat = np.nanmean(den, 0) < 0.01
    A[flat] = hard[flat]
    rgba = np.concatenate([np.clip(Fc, 0, 1), A[None]]).transpose(1, 2, 0)
    return Image.fromarray((rgba * 255 + .5).astype(np.uint8), 'RGBA'), \
        {'seen': float(seen.mean()), 'opaque': int(hard.sum()), 'spread_255': float(np.nanmedian(spread[hard]) * 255)}


report = {'id': a.id, 'anim': a.anim, 'detections': len(dets), 'pieces': {}}
recovered = {}
for tex in miss_drawn:
    Is = [d['pieces'][tex]['I'] for d in dets if tex in d['pieces']]
    Bs = [d['pieces'][tex]['B'] for d in dets if tex in d['pieces']]
    im, st = fuse(Is, Bs)
    st['samples'] = len(Is)
    report['pieces'][tex] = st
    if im is not None:
        im.save(os.path.join(a.out, 'recovered_%d_%s_tex%d.png' % (a.id, a.anim, tex)))
        t = torch.tensor(np.asarray(im), dtype=torch.float32, device=DEV).permute(2, 0, 1) / 255.
        t[:3] *= t[3:4]
        recovered[tex] = t


def straight(t):
    return torch.where(t[3:4] > 1e-3, t[:3] / t[3:4].clamp(min=1e-3), torch.zeros_like(t[:3]))


truth = {}
for x in a.truth:
    k, pth = x.split('=', 1)
    truth[int(k)] = load_png(pth)
for tex, T in truth.items():
    if tex in recovered:
        R = recovered[tex]
        both = (T[3] > .5) & (R[3] > .5)
        report['pieces'][tex].update({
            'truth_alpha_mae_255': float((T[3] - R[3]).abs().mean() * 255),
            'truth_rgb_mae_255': float((straight(T) - straight(R)).abs().mean(0)[both].mean() * 255),
            'truth_iou': float(both.sum() / ((T[3] > .5) | (R[3] > .5)).sum())})
json.dump(report, open(os.path.join(a.out, 'report.json'), 'w'), indent=1)
print(json.dumps(report['pieces'], indent=1))

# ---- 6. sheet: video | rig + recovered | rig, pieces missing (| rig + truth)
picks = [dets[i] for i in sorted({0, len(dets) // 3, 2 * len(dets) // 3, len(dets) - 1})]
rows = []
for d in picks:
    p = poses[d['rig']]
    s = d['s']
    V = Image.open(os.path.join(os.path.dirname(frames[0]), d['frame'])).convert('RGB')
    x0, y0 = d['ox'] + p.x0 * s, d['oy'] + p.y0 * s
    W, H = int(p.W * s), int(p.H * s)
    crop = V.crop((int(round(x0)), int(round(y0)), int(round(x0)) + W, int(round(y0)) + H))
    g = np.array(d['gain'])

    def comp(texs):
        r = p.render(texs, scale=s)
        im = np.asarray(_pil(r)).astype(float)[:H, :W] / 255
        im[..., :3] = im[..., :3] * g[:3] + g[3:]
        bg = np.asarray(crop).astype(float)[:im.shape[0], :im.shape[1]] / 255
        return Image.fromarray((np.clip(bg * (1 - im[..., 3:]) + im[..., :3] * im[..., 3:], 0, 1) * 255).astype(np.uint8))

    def _pil(t):
        x = torch.cat([straight(t).clamp(0, 1), t[3:4].clamp(0, 1)]).permute(1, 2, 0).cpu().numpy()
        return Image.fromarray((x * 255 + .5).astype(np.uint8), 'RGBA')
    row = [crop, comp({**have, **recovered}), comp(have)]
    if truth:
        row.append(comp({**have, **truth}))
    rows.append(row)
lab = ['video frame', 'rig + recovered', 'rig, pieces missing', 'rig + truth'][:len(rows[0])]
W = max(r[0].width for r in rows); H = max(r[0].height for r in rows)
S = Image.new('RGB', ((W + 8) * len(lab), (H + 8) * len(rows) + 16), (40, 40, 48))
for j, n in enumerate(lab):
    ImageDraw.Draw(S).text((j * (W + 8) + 2, 2), n, fill=(255, 255, 0))
for i, r in enumerate(rows):
    for j, im in enumerate(r):
        S.paste(im, (j * (W + 8), 16 + i * (H + 8)))
S.save(os.path.join(a.out, 'sheet_%d_%s.png' % (a.id, a.anim)))
print('sheet', os.path.join(a.out, 'sheet_%d_%s.png' % (a.id, a.anim)))
