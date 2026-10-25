"""Test of termux_node.py: python -I tools/play/packaging/test_termux_node.py [cache-dir]
Default cache D:/Progetto_Restauro_KH_UX/tmp/play/termux (downloads on first run)."""
import os, shutil, subprocess, sys, tarfile, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, 'termux_node.py')
CACHE = sys.argv[1] if len(sys.argv) > 1 else r'D:\Progetto_Restauro_KH_UX\tmp\play\termux'
USR = './data/data/com.termux/files/usr/'
errors = []

def run(cache, out):
    return subprocess.run([sys.executable, '-I', SCRIPT, cache, out], capture_output=True, text=True)

out = tempfile.mkdtemp(dir=os.path.dirname(CACHE) if os.path.isdir(os.path.dirname(CACHE)) else None)
r = run(CACHE, out)
if r.returncode != 0:
    errors.append(f'build failed ({r.returncode}): {r.stderr.strip()[-300:]}')
else:
    with tarfile.open(os.path.join(out, 'node.tar')) as t:
        names = set(t.getnames())
    for f in ('bin/node', 'lib/libz.so.1', 'lib/libc++_shared.so', 'lib/libssl.so.3'):
        if USR + f not in names:
            errors.append(f'missing in node.tar: {f}')
    if not os.path.isdir(os.path.join(out, 'licenses', 'nodejs-lts')):
        errors.append('missing licenses/nodejs-lts')

# a tampered cache file must make the build fail
bad = tempfile.mkdtemp()
if os.path.isdir(CACHE):
    for f in os.listdir(CACHE):
        if f.endswith('.deb'):
            shutil.copy(os.path.join(CACHE, f), bad)
    zl = [f for f in os.listdir(bad) if f.startswith('zlib_')]
    if zl:
        with open(os.path.join(bad, zl[0]), 'ab') as fh:
            fh.write(b'x')
        if run(bad, tempfile.mkdtemp()).returncode != 1:
            errors.append('tampered zlib deb was accepted')
    else:
        errors.append('cache has no zlib deb to tamper')
shutil.rmtree(out, ignore_errors=True); shutil.rmtree(bad, ignore_errors=True)
print('OK' if not errors else '\n'.join('FAIL: ' + e for e in errors))
sys.exit(1 if errors else 0)
