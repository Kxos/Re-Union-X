"""Node.js runtime archive for the LDPlayer 9 guest (Android 9, x86_64), from the Termux packages pinned in
termux-node.lock.

    python -I tools/play/packaging/termux_node.py <cache-dir> <out-dir>

Downloads the missing .deb files into <cache-dir>, checks their SHA-256 (exit 1 on a mismatch), merges the
data members of every package into <out-dir>/node.tar (symlinks kept, paths ./data/data/com.termux/files/usr/...)
and copies each package's copyright file into <out-dir>/licenses/<package>/. In the guest the archive is
unpacked under /data/local/rx and node runs with LD_LIBRARY_PATH=<root>/data/data/com.termux/files/usr/lib.
"""
import hashlib, io, os, sys, tarfile, urllib.parse, urllib.request

REPO = 'https://packages.termux.dev/apt/termux-main/'
LOCK = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'termux-node.lock')


def read_lock():
    rows = []
    with open(LOCK, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith('#'):
                name, version, filename, sha = line.split()
                rows.append((name, version, filename, sha))
    return rows


def ar_members(data):
    """Members of a Debian ar archive: {name: bytes}."""
    if not data.startswith(b'!<arch>\n'):
        raise ValueError('not an ar archive')
    out, pos = {}, 8
    while pos + 60 <= len(data):
        header = data[pos:pos + 60]
        name = header[:16].decode('ascii').strip().rstrip('/')
        size = int(header[48:58].decode('ascii').strip())
        out[name] = data[pos + 60:pos + 60 + size]
        pos += 60 + size + (size & 1)
    return out


def main(cache, out):
    os.makedirs(cache, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    tar_path = os.path.join(out, 'node.tar')
    with tarfile.open(tar_path + '.tmp', 'w') as merged:
        for name, version, filename, sha in read_lock():
            local = os.path.join(cache, os.path.basename(filename).replace(':', '%3A'))
            if not os.path.exists(local):
                url = REPO + urllib.parse.quote(filename)
                print(f'download {url}')
                with urllib.request.urlopen(url, timeout=120) as r, open(local + '.part', 'wb') as fh:
                    fh.write(r.read())
                os.replace(local + '.part', local)
            data = open(local, 'rb').read()
            if hashlib.sha256(data).hexdigest() != sha:
                print(f'SHA-256 mismatch: {local}', file=sys.stderr)
                return 1
            members = ar_members(data)
            payload = next(v for k, v in members.items() if k.startswith('data.tar'))
            with tarfile.open(fileobj=io.BytesIO(payload), mode='r:*') as t:
                for m in t.getmembers():
                    f = t.extractfile(m) if m.isfile() else None
                    if m.isfile() and m.name.endswith(f'/share/doc/{name}/copyright'):
                        lic = os.path.join(out, 'licenses', name)
                        os.makedirs(lic, exist_ok=True)
                        body = f.read()
                        open(os.path.join(lic, 'copyright'), 'wb').write(body)
                        f = io.BytesIO(body)
                    merged.addfile(m, f)
    os.replace(tar_path + '.tmp', tar_path)
    print(f'{tar_path}: {os.path.getsize(tar_path)} bytes')
    return 0


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
