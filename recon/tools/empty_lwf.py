"""Empty LWF (format 0x121010) written by our own code: one frame, no graphics, no events.

    python -I recon/tools/empty_lwf.py <out.lwf> writes the file

The client crashes when some LWFs are missing (it loads them and adds a NULL child): NPC idle
animations, the Moogle Shop moogle, keyblade evolution, Spirit Training. An empty movie with a
single frame ends at once, so the flow goes on. Built with the minimal LWF writer of
make_pet_motions.py; 900x700 stage, 30 fps (the size has no effect on an empty movie).
Used by make_layouts.py and npc_placeholders.py (bytes in memory, nothing tracked in git).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_pet_motions  # noqa: E402

_CACHE = []


def build():
    """-> bytes of the empty LWF (deterministic)."""
    if not _CACHE:
        _CACHE.append(make_pet_motions.Lwf('empty', (900, 700)).build([[]], 0))
    return _CACHE[0]


def write(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(build())


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    write(sys.argv[1])
