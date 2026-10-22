import re, sys, collections
from demangle import main as extract
comps = extract(sys.argv[1])
pat = re.compile(sys.argv[2], re.I)
byscope = collections.defaultdict(set)
for parts, nm in comps:
    scope = '::'.join(parts[:-1]) if len(parts) >= 2 else parts[0]
    if pat.search('::'.join(parts)):
        byscope[scope].add(parts[-1])
for scope in sorted(byscope):
    ms = sorted(byscope[scope])
    print(f"\n### {scope}   ({len(ms)} members)")
    for m in ms: print("   ", m)
