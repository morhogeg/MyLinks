"""Importing main must initialize the default Firebase app.

@https_fn.on_call wrappers verify the caller's ID token before the function
body runs. If the default app only came up lazily inside a handler, the first
callable request on a cold instance 401'd with "The default Firebase app does
not exist" (rebuild_connections, 2026-10-22). A fresh interpreter is used so
no other test's initialization can mask a regression.
"""

import os
import subprocess
import sys

import pytest

FUNCTIONS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CHECK = (
    "import firebase_admin\n"
    "try:\n"
    "    firebase_admin.get_app()\n"
    "    raise SystemExit('app already initialized before importing main')\n"
    "except ValueError:\n"
    "    pass\n"
    "import main\n"
    "firebase_admin.get_app()\n"
)


def test_importing_main_initializes_default_app():
    pytest.importorskip("firebase_admin")
    result = subprocess.run(
        [sys.executable, "-c", CHECK],
        cwd=FUNCTIONS_DIR, capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 0, result.stderr[-2000:] or result.stdout[-2000:]
