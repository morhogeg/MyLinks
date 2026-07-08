"""Runtime configuration flags.

Kept dependency-free (stdlib only) so any module can import it without dragging
in `main` — which is exactly the circular import `search.py` used to dodge with a
lazy `from main import REQUIRE_AUTH` inside the request handler.
"""

import os

# Staged auth rollout gate. When ON, callables must resolve the user from a
# verified token; when OFF (pre-cutover), a client-supplied uid fallback is
# allowed. Flipping this is an owner-only cutover step (SOURCE_OF_TRUTH §11 O1) —
# do not change the default here.
REQUIRE_AUTH = os.environ.get("REQUIRE_AUTH", "").lower() in ("1", "true", "yes")
