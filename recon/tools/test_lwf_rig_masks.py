"""lwf_rig: Flash mask layers (clip depth in the high 16 bits of place.depth) are not drawn and clip their siblings
(I-194, 23-10). Runs on the extracted dump when present, else skips.

Clip range (2 Nov): LWF depths are 0-based while the clip depth keeps Flash's 1-based value, so a mask at depth d with
clip depth c clips the depths d+1 .. c-1; the sibling exactly at c is NOT clipped.
  * enemy 1615 wait: mask (187x198 red square, depth 2, clip 6) clips texture 5 (depth 3); texture 4 sits at depth 6,
    entirely inside the mask's rectangle, so both rules draw the same picture: 1615 is neutral, not a counter-example.
  * raid 1012 atk1 (movie 37): mask 130 (depth 31, clip 34) and mask 140 (depth 47, clip 51) never overlap the pieces at
    depths 34 (lit face, texture 132) and 51 (claw, texture 144) in any of the 125 frames; with the old inclusive rule
    both were invisible for the whole animation, while wait and start draw them (same rig on 0013 with 2016 files)."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lwf_rig  # noqa: E402

import deep_donors as dd  # noqa: E402

LWF_1615 = os.path.join(dd.JP431, 'lwf', 'character', 'enemy', '1615', 'wait', 'wait.lwf')
LWF_1012 = os.path.join(dd.JP431, 'lwf', 'character', 'raid', '1012', 'atk1', 'atk1.00001806.lwf')


@unittest.skipUnless(os.path.exists(LWF_1615), 'dump not present')
class MaskTest(unittest.TestCase):
    def test_1615_mask(self):
        L = lwf_rig.LWF(LWF_1615)
        dr = L.draws(frame_idx=3)
        texs = [d[0] for d in dr]
        self.assertNotIn(7, texs)                         # the 187x198 red mask is never drawn
        clipped = {d[0] for d in dr if d.masks}
        self.assertEqual(clipped, {5})                    # depth 3; texture 4 is at the clip depth 6: not clipped
        self.assertIn(4, texs)
        mask = [d for d in dr if d.masks][0].masks[0]
        self.assertEqual([m[0] for m in mask], [7])
        self.assertTrue(all(d.blend == 0 for d in dr))

    @unittest.skipUnless(os.path.exists(LWF_1012), 'raid 1012 not present')
    def test_1012_piece_at_clip_depth_is_drawn(self):
        L = lwf_rig.LWF(LWF_1012)
        dr = L.draws(frame_idx=100)
        by = {d[0]: d for d in dr}
        for tex in (132, 144):                            # lit face (depth 34) and claw (depth 51): clip depths
            self.assertIn(tex, by)
            self.assertFalse(by[tex].masks, 'texture %d must not be clipped' % tex)
        self.assertEqual([m[0] for m in by[131].masks[0]], [130])   # depth 32, inside mask 31..34: clipped


if __name__ == '__main__':
    unittest.main()
