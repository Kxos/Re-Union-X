"""lwf_rig: Flash mask layers (clip depth in the high 16 bits of place.depth) are not drawn and clip their siblings
(I-194, 23-10). Runs on the extracted dump when present (enemy 1615 wait), else skips."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lwf_rig  # noqa: E402

import deep_donors as dd  # noqa: E402

LWF_1615 = os.path.join(dd.JP431, 'lwf', 'character', 'enemy', '1615', 'wait', 'wait.lwf')


@unittest.skipUnless(os.path.exists(LWF_1615), 'dump not present')
class MaskTest(unittest.TestCase):
    def test_1615_mask(self):
        L = lwf_rig.LWF(LWF_1615)
        dr = L.draws(frame_idx=3)
        texs = [d[0] for d in dr]
        self.assertNotIn(7, texs)                         # the 187x198 red mask is never drawn
        clipped = {d[0] for d in dr if d.masks}
        self.assertEqual(clipped, {4, 5})                 # depths 3..6 of the main timeline
        mask = [d for d in dr if d.masks][0].masks[0]
        self.assertEqual([m[0] for m in mask], [7])
        self.assertTrue(all(d.blend == 0 for d in dr))


if __name__ == '__main__':
    unittest.main()
