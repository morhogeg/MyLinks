---
name: onboard
description: Prime a fresh session on Machina AI (repo MyLinks) before doing work. Reads SOURCE_OF_TRUTH.md and the other core docs, builds a mental model of the product/architecture/backlog/current state, confirms how to verify and ship, then proceeds to the user's actual request. Use at the START of a new session, or when the user says onboard, prime, "get up to speed", "review the docs", "understand the project", "read the source of truth", or opens with a feature/bug request and no prior context.
---

# Onboard on Machina AI

> Goal: in one pass, go from a cold session to enough context to safely pick up
> work — then do the thing the user actually asked for. Don't stop after reading;
> reading is step 1, the request is the point.

`SOURCE_OF_TRUTH.md` (repo root) is the **single source of truth**: product,
architecture, auth state, the ranked backlog, ship checklist, and session log.
Everything else is reference. Do NOT create new HANDOFF/TASKS/spec/audit docs —
the old ones were consolidated into `SOURCE_OF_TRUTH.md` and deleted.

## Steps

1. **Read the core docs, in this order** (they are the map):
   - `CLAUDE.md` — the rules (source of truth, ship path, verify commands, theme
     tokens). Already loaded as project instructions, but reconfirm.
   - `SOURCE_OF_TRUTH.md` — read enough to build a real model:
     - **§1–§2** — what Machina is + architecture/stack (Next.js 16 / React 19 /
       Tailwind v4 in `web/`; Python Cloud Functions in `functions/`; Firebase +
       Vercel + Capacitor iOS).
     - **§3** — auth cutover state (the thing most changes gate on).
     - **§4 — THE BACKLOG**, ranked most-urgent-first. This is where open work,
       bugs, and priorities live. Skim the top items even if you already know the
       task, so your change fits the current priorities.
     - **§5** — ship checklist (what `/ship` automates).
     - **§9 — session log**: read the **most recent few entries** to learn what
       the last sessions did, what's in flight, and any deferred owner steps.
       The file is large (~200KB); §9 is near the end and grows downward — read
       the newest entries, not the whole log.
   - **Only if relevant to the request**, pull the matching reference doc:
     `AUTH_SPEC.md` / `NATIVE_AUTH_SETUP.md` (auth), `SHARE_EXTENSION.md` (iOS
     share), `AUDIT.md` (2026-07-09 findings + remediation tracker),
     `web/VERCEL.md`, `extension/README.md`, `docs/IOS_CICD.md` (TestFlight CI).

2. **Orient in the tree.** Note the current branch (`git status`) and where the
   change will live: frontend `web/` (excluding `web/ios/` = native), backend
   `functions/`, browser `extension/`. Don't deep-read code yet — locate the area
   the request touches.

3. **Report a short briefing** (3–6 lines) so the user can course-correct before
   you build:
   - What Machina is, in one line.
   - Current state that matters for this request (e.g. auth cutover status, any
     in-flight work or blocker from §4 / §9).
   - Which surface(s) the request touches and your intended approach.
   Then continue — don't wait for approval unless the request is ambiguous or the
   backlog shows it conflicts with in-flight work; in that case ask.

4. **Do the request.** Implement on the current `claude/*` branch. While working,
   respect the house rules from `CLAUDE.md`:
   - **Theme:** use Tailwind tokens (`text-text`, `bg-card`, `--accent-gradient`,
     `--ease-modal`) — never hardcoded white/black/hex.
   - Keep changes scoped; match surrounding code style.

5. **Verify** before calling it done:
   - Frontend: `cd web && npx tsc --noEmit` — must exit 0.
   - Backend: `cd functions && python -m py_compile *.py`.
   - Run the relevant flow if there's runtime surface to observe.

6. **Document + hand off.** When the change is meaningful, update
   `SOURCE_OF_TRUTH.md`: check/add/re-rank the relevant **§4** backlog items and
   prepend a dated **§9** session-log entry (what advanced + any new issue,
   workaround, or deferred owner step). This keeps the next fresh session from
   being blind. To deploy, use the **`/ship`** skill — don't hand-roll deploys.

## Notes
- If the user opened with a concrete feature/bug ("add X", "fix Y"), treat that as
  the request for steps 4–6; this skill is the wrapper that gets you ready for it.
- If they only said "onboard" / "get up to speed" with no task, stop after the
  step-3 briefing and ask what they want to work on.
- Don't over-read: §4 (top) + newest §9 entries + the one reference doc that
  matches the task is usually enough. Pull more only when the task needs it.
