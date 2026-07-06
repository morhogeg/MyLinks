"""Centralized runtime configuration flags.

These were previously defined in `main.py` and imported back into leaf modules
(e.g. `search.py` did `from main import REQUIRE_AUTH`), which created an
awkward dependency from a leaf module onto the Cloud Functions entrypoint. They
live here so any module can read them without importing `main`.

All flags are read from the environment once at import time. Deploys restart the
runtime, so a flag change takes effect on the next deploy — matching how the
functions were already configured.
"""

import os


def _flag(name: str) -> bool:
    return os.environ.get(name, "").lower() in ("1", "true", "yes")


# Auth enforcement flag for the staged multi-user rollout. When OFF (default),
# the backend still accepts a client-supplied uid so the current app keeps
# working; a verified ID token is preferred when present. When ON, every data
# endpoint/callable REQUIRES a valid ID token and derives the workspace uid from
# it (client-supplied uids are rejected). See NATIVE_AUTH_SETUP.md.
REQUIRE_AUTH = _flag("REQUIRE_AUTH")

# App Check enforcement. When falsy, verification is attempted and logged but
# never blocks (soft rollout); when true, a missing/invalid token is rejected.
APPCHECK_ENFORCE = _flag("APPCHECK_ENFORCE")

# Public origin of the web app. Shared by the entrypoint (CORS defaults, share
# config) and the share-page renderer without either importing `main`.
APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")
