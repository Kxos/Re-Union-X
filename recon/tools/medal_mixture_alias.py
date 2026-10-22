"""Alias delle cartelle mixture/medal/compose/<imageId>/Medal_L per l'animazione di Level Up ed Evolve.

Il client (Level Up Evolve) aggancia a ogni istanza drowMedalNNN dei LWF
card_strength_result/card_evolution_result la LWF mixture/medal/compose/<imageId>/Medal_L/Medal_L.lwf
(imageId = campo +4 della riga medal). Il WW ne serve solo 21: per le altre medaglie le cornici restavano
vuote (banco 19-10). Negli originali la Medal_L.lwf e' la stessa per tutte (648 byte, una texture dal nome
fisso Medal_L_<hex di «Medal_L_90011.png»>.png) e la texture e' byte per byte img/medal/Medal_L_<id>.png.
Niente file nuovi: righe «nome<TAB>bersaglio» per resource_merge.py --alias.

    python -I recon/tools/medal_mixture_alias.py <medal.json> <uscita.tsv>
"""
import json
import sys

LWF_SRC = 'mixture/medal/compose/90041/Medal_L/Medal_L.lwf'   # servita dal WW (names_v4 e addnl)
TEX = 'Medal_L_4d6564616c5f4c5f39303031312e706e67.png'          # nome fisso dentro ogni cartella


def aliases(medals):
    out = []
    for i in sorted({m['imageId'] for m in medals if m.get('imageId')}):
        d = 'mixture/medal/compose/%d/Medal_L/' % i
        out.append((d + 'Medal_L.lwf', LWF_SRC))
        out.append((d + TEX, 'img/medal/Medal_L_%d.png' % i))
    return out


def main():
    medals = json.load(open(sys.argv[1], encoding='utf-8'))
    rows = aliases(medals)
    with open(sys.argv[2], 'w', encoding='utf-8', newline='\n') as fh:
        for name, target in rows:
            fh.write('%s\t%s\n' % (name, target))
    print('%s: %d alias per %d immagini di medaglia' % (sys.argv[2], len(rows), len(rows) // 2))


if __name__ == '__main__':
    main()
