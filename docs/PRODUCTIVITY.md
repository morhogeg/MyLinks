# 5 productivity improvements — from "Getting Started with Loops"

Source: the Claude Code team's article *Getting started with loops* (shared via
[@trq212](https://x.com/trq212), July 2026). It defines a **loop** as an agent
repeating cycles of work until a stop condition is met, and categorizes four
types by how they're triggered and stopped:

| Loop | You hand off | Use it when | Reach for |
|---|---|---|---|
| **Turn-based** | the check | you're exploring or deciding | custom verification skills |
| **Goal-based** | the stop condition | you know what "done" looks like | `/goal` |
| **Time-based** | the trigger | work happens on a schedule / outside the project | `/loop`, `/schedule` |
| **Proactive** | the prompt | work is recurring and well-defined | all of the above + dynamic workflows |

Two cross-cutting themes from the article drive the recommendations below:
- **Maintain code quality:** keep the codebase clean, *give Claude a way to verify
  its own work*, make docs reachable, use a second agent for review, and — when a
  result misses the bar — **encode the fix into the system, not just the instance.**
- **Manage token usage:** pick the right primitive/model, set clear stop criteria,
  pilot before large runs, use scripts for deterministic work, right-size
  intervals, and review with `/usage`.

This doc records the recommendations and what was implemented in this session so
the advice survives (per CLAUDE.md: no new HANDOFF docs — this is a reference).

---

## 1. Close the turn-based loop: a real verification skill  ✅ implemented

**The gap:** Machina's loop ended at `tsc --noEmit` + `py_compile`, so *you* were
the verification step every single turn — exactly the manual "check" the
article says to hand off. The article's centerpiece is a `verify-frontend-change`
SKILL.md; its rule: *"the more quantitative the checks are, the easier it is for
Claude to self-verify."*

**Done this session:** `.claude/skills/verify/SKILL.md` + `smoke.mjs`. The skill
runs the static checks, a **theme-token lint** (flags new hardcoded colors in the
diff — enforces the CLAUDE.md rule automatically), then **drives the changed page
in real Chromium** (`smoke.mjs`, via the pre-installed browser) and **fails on any
console error or page exception**, screenshotting before/after. Gotchas are seeded
from `SOURCE_OF_TRUTH.md` §2 (the `localhost`-vs-`127.0.0.1` emulator trap, the
`window.Capacitor` native-detection footgun, static-export-vs-Vercel divergence,
WKWebView SSE buffering).

**Use it:** invoke `/verify` after any non-trivial `web/` or `functions/` change,
and before `/ship`. Grow its Gotchas section every time a real bug slips
past — that is the article's "encode it to improve the system" applied to
verification.

## 2. Use goal-based loops with deterministic exit criteria  ⟶ habit

**Why:** for multi-step tasks, `/goal` lets an evaluator model decide "done"
against *your* criteria instead of Claude stopping early. The prerequisite is #1 —
quantitative checks are what make "done" judgeable.

**Ready-to-paste for this project:**
```
/goal the /verify skill passes end-to-end (tsc clean, token lint clean, zero
      console errors on the changed page). stop after 5 tries.
```
```
/goal every automatable P0/P1 item in SOURCE_OF_TRUTH §4 is either done or has its
      exact remaining owner-step written into the backlog. stop after 6 tries.
```
**General habit (any project):** before starting a multi-turn task, write the
exit criterion *and* a turn cap into the prompt ("stop after N tries"). Deterministic
criteria (tests passing, a Lighthouse score, zero console errors) work best.

## 3. Move CI-watching into time-based / proactive loops  ⟶ habit

**Why:** the ship flow ends by manually dispatching the *iOS → TestFlight*
workflow, which someone then watches by hand — textbook time-based-loop work
("the work happens outside your project on a schedule").

**Do this:**
- After `/ship` triggers the workflow, hand off the watch instead of polling
  manually. A TestFlight build takes ~20–30 min, so **match the interval** — don't
  poll every 5 minutes:
  ```
  /loop 10m check the latest iOS → TestFlight run; when it succeeds, record the
            build number (1000 + run number) in SOURCE_OF_TRUTH §9 and stop.
  ```
- For PRs, **subscribe to PR activity** (the session can react to CI/review webhook
  events) rather than re-checking by hand.
- Consider one `/schedule` routine for genuinely recurring work — e.g. a morning
  check of Cloud Functions error logs / digest-function health — routed to a
  smaller model, with the capable model reserved for judgment calls.

## 4. Encode failures into the system, not just the fix  ✅ partially implemented

**The article:** *"When an individual result doesn't meet the standard, don't stop
at fixing the individual issue — try to encode it to improve the system for all
future iterations."* You already do this in the ship skill's Gotchas banner;
this session extended it into the **harness**:

- **Deploy guard hook (written):** `.claude/hooks/guard-firebase-deploy.py` blocks
  a bare `firebase deploy` (the wrong-project / lost-entitlement footgun from §2)
  and points at the targeted commands; scoped deploys pass through. Tested across
  bare/compound/targeted cases.
  **Action for you:** wire it into `.claude/settings.json` — see
  `.claude/hooks/README.md` for the exact block. (Claude Code requires a *human*
  to edit settings.json, since hooks run arbitrary commands — an agent can't
  self-grant them.)
- **Stale workflow removed:** deleted `.agent/workflows/deploy.md`, which did a
  blanket `firebase deploy` — directly contradicting the targeted-deploy discipline.
- **Fewer permission prompts (your move):** run `/fewer-permission-prompts` to
  generate a reviewed allowlist in `.claude/settings.json`. Fewer interruptions =
  longer uninterrupted loops. (Left to you deliberately: an agent self-granting a
  broad allowlist is exactly what the harness blocks.)
- **Second-agent review:** make `/code-review` a standard pre-ship step — a
  reviewer with fresh context is less biased than the agent that wrote the change.

## 5. Manage tokens with progressive disclosure — and reuse the kit  ✅ implemented

**Two applications of the article's token guidance:**

**(a) Progressive disclosure of `SOURCE_OF_TRUTH.md` (done).** It was 950 lines,
loaded into context every session. Split into a slim hot core (~500 lines: live
state + §4 backlog + §5 ship checklist + recent §9) plus `docs/reference/`:
`app-store-readiness.md`, `cost-and-keys.md`, `marketing.md`,
`session-log-archive.md` (older entries). All content preserved verbatim
(verified line-for-line); CLAUDE.md and the ship skill still resolve. Keep §9
trimmed — page older entries into the archive as it grows.

**(b) A reusable bootstrap kit (seeded in the Versus repo).** Your MyLinks system
— pointer-CLAUDE.md → slim source-of-truth → verify/ship skills with real Gotchas
— took ~38 sessions to evolve. It's now a portable starter in the (previously
empty) Versus repo so future projects begin with the machinery, not a blank
`.claude/`. Keep using **scripts for deterministic work** (your `deploy-*.sh`
already embody this — cheaper than re-reasoning the steps each time).

---

## Quick reference — which loop for which Machina task

- *"Does this UI change actually work?"* → **turn-based**, `/verify`.
- *"Get all automatable P1 items to done."* → **goal-based**, `/goal … stop after N`.
- *"Watch the TestFlight build / this PR."* → **time-based**, `/loop` or PR subscription.
- *"Every morning, check function errors."* → **proactive**, `/schedule` + a small model.
- Review usage with `/usage`; stop over-reaching agents from `/workflows`.
