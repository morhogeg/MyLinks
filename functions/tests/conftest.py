"""Shared test setup for the offline backend harness.

These tests must run OFFLINE — no Firestore, no network, no GEMINI key — with
plain ``pytest``. Several ``functions/`` modules import ``firebase_admin`` /
``google-genai`` / ``requests`` at module top, so before any test imports a
target module we install *lightweight fakes* for those heavy dependencies into
``sys.modules`` — but ONLY when the real package is not importable. In CI, where
``functions/requirements.txt`` is installed, the real packages win and these
fakes are never used, so the same tests exercise the real import paths there.

The fakes are just enough to let the modules import and to let the *pure logic*
under test run; anything that would actually touch Firestore or Gemini is either
never called by these tests or is monkeypatched at the ``db.get_db`` boundary.
"""

import importlib
import sys
import types
from pathlib import Path

# ── Make the functions/ package importable (its modules use flat imports like
#    ``from db import get_db``) ──────────────────────────────────────────────
FUNCTIONS_DIR = Path(__file__).resolve().parent.parent
if str(FUNCTIONS_DIR) not in sys.path:
    sys.path.insert(0, str(FUNCTIONS_DIR))


def _real_import(name: str) -> bool:
    """True if ``name`` can be imported for real (so we must NOT fake it)."""
    try:
        importlib.import_module(name)
        return True
    except Exception:
        return False


def _ensure_pkg(name: str) -> types.ModuleType:
    """Return sys.modules[name], creating an empty package module if absent and
    wiring it onto its parent as an attribute."""
    if name in sys.modules:
        return sys.modules[name]
    mod = types.ModuleType(name)
    mod.__path__ = []  # mark as a package so submodule imports work
    sys.modules[name] = mod
    if "." in name:
        parent, child = name.rsplit(".", 1)
        setattr(_ensure_pkg(parent), child, mod)
    return mod


def _transactional(fn):
    """Identity stand-in for ``@google.cloud.firestore.transactional`` — runs the
    wrapped function directly when called with a transaction object."""
    return fn


def _install_fakes():
    # google.cloud.firestore  (rate_limit uses @firestore.transactional; others
    # only touch attributes at call time, which these tests don't hit)
    if not _real_import("google.cloud.firestore"):
        fs = _ensure_pkg("google.cloud.firestore")
        fs.transactional = _transactional
        # Any other attribute (SERVER_TIMESTAMP, Query, Increment, …) resolves to
        # a harmless sentinel so import-time references never fail.
        fs.__getattr__ = lambda attr: object()  # type: ignore[attr-defined]

    # google.cloud.firestore_v1.vector.Vector
    if not _real_import("google.cloud.firestore_v1.vector"):
        vec_mod = _ensure_pkg("google.cloud.firestore_v1.vector")

        class Vector(list):
            """Minimal Vector stand-in: a list subclass, so ``isinstance(x, Vector)``
            is False for a plain list (drift detection) and ``list(v)`` works."""

        vec_mod.Vector = Vector

    # google.cloud.firestore_v1.base_vector_query.DistanceMeasure (search.py)
    if not _real_import("google.cloud.firestore_v1.base_vector_query"):
        bvq = _ensure_pkg("google.cloud.firestore_v1.base_vector_query")
        bvq.DistanceMeasure = types.SimpleNamespace(COSINE="COSINE", EUCLIDEAN="EUCLIDEAN")

    # google.genai  (ai_service: `from google import genai`)
    if not _real_import("google.genai"):
        genai = _ensure_pkg("google.genai")
        genai.Client = lambda *a, **k: types.SimpleNamespace()

    # firebase_admin  (db.py: initialize_app / firestore / get_app; others too)
    if not _real_import("firebase_admin"):
        fa = _ensure_pkg("firebase_admin")
        fa.initialize_app = lambda *a, **k: types.SimpleNamespace()

        def _get_app(*a, **k):
            return types.SimpleNamespace()

        fa.get_app = _get_app
        fa.firestore = types.SimpleNamespace(client=lambda *a, **k: None)
        fa.storage = types.SimpleNamespace()
        fa.auth = types.SimpleNamespace()

    # firebase_functions (only imported by main/search, which these tests avoid,
    # but faked defensively so an incidental import never explodes)
    if not _real_import("firebase_functions"):
        ff = _ensure_pkg("firebase_functions")
        _passthrough = lambda *a, **k: (lambda f: f)
        for name in ("https_fn", "scheduler_fn", "firestore_fn", "options"):
            ns = types.SimpleNamespace()
            setattr(ns, "__getattr__", lambda attr: _passthrough)
            setattr(ff, name, ns)

    # requests  (digest_service / main import it at top)
    if not _real_import("requests"):
        _ensure_pkg("requests")


_install_fakes()
