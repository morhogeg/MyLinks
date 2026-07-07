#!/usr/bin/env python3
"""PreToolUse guard: block a bare `firebase deploy`.

Machina's deploy discipline (SOURCE_OF_TRUTH §2) is TARGETED deploys only:
- Cloud Functions  -> ./deploy-functions.sh functions:<explicit,targets>
  (pins --project secondbrain-app-94da2; a stray `firebase use` once shipped to
   the wrong project)
- Firebase Hosting -> ./deploy-hosting.sh (only when firebase.json rewrites change)

A blanket `firebase deploy` (as the stale .agent/workflows/deploy.md did) pushes
hosting + all functions to whatever project is active — a real footgun. This hook
blocks it and points at the right command. Scoped, deliberate deploys
(`firebase deploy --only firestore:rules`, `firebase deploy --only functions:foo`)
are allowed through.

Wired as a PreToolUse hook on Bash in .claude/settings.json. Exit code 2 blocks
the tool call and returns stderr to Claude.
"""
import json
import re
import sys

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # can't parse -> don't block

cmd = (payload.get("tool_input", {}) or {}).get("command", "") or ""

# Match `firebase deploy` NOT followed (anywhere) by an --only scope.
# Split on shell separators so a compound command is checked segment-by-segment.
for segment in re.split(r"&&|\|\||;|\|", cmd):
    s = segment.strip()
    if re.search(r"\bfirebase\s+deploy\b", s) and "--only" not in s:
        sys.stderr.write(
            "BLOCKED: bare `firebase deploy` is disallowed in this repo.\n"
            "Use a TARGETED deploy instead (SOURCE_OF_TRUTH.md §2):\n"
            "  • Functions: ./deploy-functions.sh functions:<funcA>,functions:<funcB>\n"
            "  • Hosting:   ./deploy-hosting.sh   (only if firebase.json rewrites changed)\n"
            "  • Rules:     firebase deploy --only firestore:rules\n"
            "A blanket deploy pushes hosting + every function to the active project "
            "(the wrong-project / lost-entitlement footgun).\n"
        )
        sys.exit(2)

sys.exit(0)
