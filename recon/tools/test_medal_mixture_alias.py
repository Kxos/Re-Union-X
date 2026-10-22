"""Prova di medal_mixture_alias.py e di resource_merge.py --alias:  python recon/tools/test_medal_mixture_alias.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medal_mixture_alias as ma  # noqa: E402

rows = ma.aliases([{'imageId': 31176}, {'imageId': 31176}, {'imageId': 0}, {'imageId': 90041}])
assert rows == [
    ('mixture/medal/compose/31176/Medal_L/Medal_L.lwf', ma.LWF_SRC),
    ('mixture/medal/compose/31176/Medal_L/' + ma.TEX, 'img/medal/Medal_L_31176.png'),
    ('mixture/medal/compose/90041/Medal_L/Medal_L.lwf', ma.LWF_SRC),
    ('mixture/medal/compose/90041/Medal_L/' + ma.TEX, 'img/medal/Medal_L_90041.png'),
], rows
# il nome fisso della texture e' «Medal_L_90011.png» in esadecimale, come nelle cartelle originali
assert bytes.fromhex(ma.TEX[len('Medal_L_'):-len('.png')]).decode() == 'Medal_L_90011.png'
print('medal_mixture_alias: ok')
