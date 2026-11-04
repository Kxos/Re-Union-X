"""Values derived from source files, remembered across runs by the file's (size, mtime in ns).

Build speed (4 Nov 2026, docs/notes/risorse_layout.md «Build speed and safety»): import_jp_coco.py, jp_pet_parts.py and
jp_sound_effects.py opened the same ~13k files of the JP dump and of the static packs at every build (PNG headers, LWF
texture tables, LWF sound events, UI texts, the hash of a texture once converted to BTF) on a spinning disk: minutes of
seeks for values that never change. A value is reused only when the file still has the same size and modification time
(the stamp the directory listing gives for free on Windows); otherwise it is computed again from the file. `version` names
the code that computes the values (a change discards the whole cache). Values must survive JSON: callers convert lists
back to tuples where they compare them.

    cache = StampCache(path, version)          # path None: no file, nothing remembered (same results, no speed-up)
    v = cache.get('png_size', file, compute)   # compute(file) runs only on a miss
    cache.save()
"""
import json
import os


def stamp_of(st):
    return [st.st_size, st.st_mtime_ns]


class StampCache:
    def __init__(self, path, version):
        self.path, self.version = path, str(version)
        self.data, self.dirty, self.hits, self.misses = {}, False, 0, 0
        if path and os.path.exists(path):
            try:
                with open(path, encoding='utf-8') as fh:
                    c = json.load(fh)
                if c.get('version') == self.version:
                    self.data = c['values']
            except (ValueError, KeyError, OSError):
                self.data = {}

    def get(self, kind, path, compute, st=None):
        """compute(path), or the value remembered for this kind and file if its stamp is unchanged.
        st: an os.stat_result / DirEntry.stat() already at hand (saves a stat)."""
        try:
            stamp = stamp_of(st if st is not None else os.stat(path))
        except OSError:
            return compute(path)                 # missing file: no caching, the caller sees the usual error
        key = kind + '|' + os.path.normcase(os.path.abspath(path))
        e = self.data.get(key)
        if e is not None and e[0] == stamp:
            self.hits += 1
            return e[1]
        self.misses += 1
        v = compute(path)
        self.data[key] = [stamp, v]
        self.dirty = True
        return v

    def save(self):
        if not self.path or not self.dirty:
            return
        os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump({'version': self.version, 'values': self.data}, fh, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, self.path)
        self.dirty = False


def scan_tree(root):
    """{name with /: (path, DirEntry.stat())} of the files under root, in os.walk order (top-down, scandir order).
    On Windows the stat of a directory entry comes from the listing itself: no extra system call per file."""
    out = {}

    def walk(top, rel):
        try:
            it = os.scandir(top)
        except OSError:
            return
        dirs = []
        with it:
            for e in it:
                try:
                    is_dir = e.is_dir()
                except OSError:
                    is_dir = False
                if is_dir:
                    dirs.append(e)
                else:
                    out[rel + e.name] = (e.path, e.stat())
        for d in dirs:
            if not d.is_symlink():
                walk(d.path, rel + d.name + '/')
    walk(root, '')
    return out
