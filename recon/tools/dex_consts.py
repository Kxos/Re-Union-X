"""Valori delle costanti static final di un dex, per campi il cui nome contiene un testo.

    python -I recon/tools/dex_consts.py <apk> OBB_     # -> OBB_MAIN_VERSION_CODE 60, OBB_PATCH_VERSION_CODE 69
"""
import struct
import sys
import zipfile


def uleb(d, o):
    r = s = 0
    while True:
        b = d[o]; o += 1
        r |= (b & 0x7f) << s; s += 7
        if b < 0x80:
            return r, o


z = zipfile.ZipFile(sys.argv[1])
d = z.read('classes.dex')
want = sys.argv[2]
(str_sz, str_off, type_sz, type_off, proto_sz, proto_off, field_sz, field_off,
 meth_sz, meth_off, cls_sz, cls_off) = struct.unpack_from('<12I', d, 0x38)


def string(i):
    o = struct.unpack_from('<I', d, str_off + i * 4)[0]
    n, o = uleb(d, o)
    return d[o:o + n * 3].split(b'\0')[0].decode('utf-8', 'replace')


def typename(i):
    return string(struct.unpack_from('<I', d, type_off + i * 4)[0])


def field(i):
    c, t, n = struct.unpack_from('<HHI', d, field_off + i * 8)
    return typename(c), typename(t), string(n)


def encoded_value(o):
    b = d[o]; o += 1
    vt, va = b & 0x1f, b >> 5
    if vt in (0x00, 0x02, 0x03, 0x04, 0x06):        # byte short char int long
        n = va + 1
        v = int.from_bytes(d[o:o + n], 'little', signed=vt != 0x03)
        return v, o + n
    if vt in (0x10, 0x11, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x15, 0x16):
        n = va + 1
        v = int.from_bytes(d[o:o + n], 'little')
        if vt == 0x17:
            v = string(v)
        return v, o + n
    if vt == 0x1e:
        return None, o
    if vt == 0x1f:
        return bool(va), o
    raise ValueError('tipo %x' % vt)


for c in range(cls_sz):
    (cidx, acc, sup, ifo, src, ann, cdata, sval) = struct.unpack_from('<8I', d, cls_off + c * 32)
    if not cdata or not sval:
        continue
    o = cdata
    nsf, o = uleb(d, o); nif, o = uleb(d, o); ndm, o = uleb(d, o); nvm, o = uleb(d, o)
    fields = []
    fi = 0
    for _ in range(nsf):
        diff, o = uleb(d, o); af, o = uleb(d, o)
        fi += diff
        fields.append(fi)
    o = sval
    n, o = uleb(d, o)
    for k in range(n):
        v, o = encoded_value(o)
        if k < len(fields):
            cls, ty, name = field(fields[k])
            if want in name:
                print(cls, name, ty, v)
