"""Minimal `strings` replacement: extract printable ASCII runs from a binary."""
import sys, re
minlen = int(sys.argv[2]) if len(sys.argv) > 2 else 6
data = open(sys.argv[1], 'rb').read()
for m in re.finditer(rb'[\x20-\x7e]{%d,}' % minlen, data):
    sys.stdout.write(m.group().decode('ascii') + '\n')
