"""Extract Itanium-mangled C++ names and parse their nested-name components."""
import re, sys, collections

def parse_nested(s):
    """Parse the <length><identifier> sequence of a nested name."""
    out, i = [], 0
    while i < len(s):
        m = re.match(r'(\d+)', s[i:])
        if not m: break
        n = int(m.group(1)); i += m.end()
        if i + n > len(s): break
        out.append(s[i:i+n]); i += n
    return out

def main(path):
    data = open(path, encoding='utf-8', errors='replace').read()
    names = set(re.findall(r'_?ZN[0-9A-Za-z_]{4,200}', data))
    comps = []
    for nm in names:
        body = nm[nm.index('ZN')+2:]
        parts = parse_nested(body)
        if parts:
            comps.append((parts, nm))
    return comps

if __name__ == '__main__':
    comps = main(sys.argv[1])
    print(f"# mangled symbols found: {len(comps)}")
    # namespace / class frequency (all but last component = scope)
    scopes = collections.Counter()
    for parts, nm in comps:
        if len(parts) >= 2:
            scopes['::'.join(parts[:-1])] += 1
        elif parts:
            scopes[parts[0]] += 1
    print(f"# distinct scopes: {len(scopes)}")
    for scope, n in scopes.most_common(int(sys.argv[2]) if len(sys.argv)>2 else 70):
        print(f"{n:5d}  {scope}")
