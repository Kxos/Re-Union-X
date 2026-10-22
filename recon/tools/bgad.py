"""Stub: the real bgad module is kept outside the public repository (container format decoding).

The private copy is loaded by recon/tools/private_tools.py; without it this import fails with a
message that says where the module is expected.
"""
import os
import runpy
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import private_tools  # noqa: E402

if __name__ == '__main__':
    runpy.run_path(private_tools.path('bgad.py'), run_name='__main__')
else:
    private_tools.replace(__name__)
