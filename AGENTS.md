# Machina (repo: MyLinks) — agent instructions

This file is the Codex equivalent of `CLAUDE.md` (same rules; keep the two in
sync if you edit either). Full migration notes, project facts, and the
known-issues list live in `docs/CODEX_ONBOARDING.md`.

**Read `SOURCE_OF_TRUTH.md` first.** It is the single source of truth for this
project: product/architecture overview (§1–§2), auth cutover state (§3), the
ranked backlog (§4), ship checklist (§5), and App Store / cost / marketing plans
(§6–§8). It is ~900 KB: read §1–§5 and the NEWEST §9 session-log entries (§9
grows downward and starts near line 1929), never the whole file.

Rules:
- When learning the codebase or picking work, start from `SOURCE_OF_TRUTH.md` §4.
- When a change needs documenting, update `SOURCE_OF_TRUTH.md` (check boxes in
  §4, add a §9 session-log entry). Do **not** create new HANDOFF/TASKS/spec/audit
  docs; the old ones were consolidated into it and deleted.
- Ship via the `ship` skill (`.agents/skills/ship/SKILL.md`): Vercel (auto on
  push to main), Cloud Functions auto-deploy on `main` pushes touching
  `functions/**` (scope with a `Deploy-Functions: a,b` merge-commit line), iOS
  via `git push -f origin main:trigger/testflight`. The iPhone PWA is retired;
  no routine `./deploy-hosting.sh`.
- Verify frontend with `cd web && npx tsc --noEmit`; backend with
  `cd functions && python -m py_compile *.py` and `pytest functions/tests -q`.
- Theme: use the Tailwind token system (`text-text`, `bg-card`, `--accent-gradient`,
  `--ease-modal`), never hardcoded colors.
- **No em dashes in user-facing strings.** `web/scripts/check-em-dash.mjs` runs
  as `prebuild` and fails Vercel and TestFlight builds on any em dash outside a
  comment in `web/components`, `web/app`, `web/lib`, or the Share Extension.
- The product name is **Machina**, never "Machina AI" (`docs/BRANDING.md` D-1).
- Work on a feature branch, never directly on `main` unless the ship skill says
  so (docs-only commits to `main` are fine). Claude sessions used `claude/*`
  branch names; use `codex/*` for the same purpose.

Skills (Codex reads them from `.agents/skills/<name>/SKILL.md`):
- `onboard` — prime a fresh session, give a verdict on the idea, wait for `go`.
- `ship` — merge to main and drive Vercel / Cloud Functions / TestFlight.
- `polish` — Apple-level UX pass on one screen, in rounds.
- `security` — code-level hardening pass; owner console steps are handed back.

## How to explain things (applies to every answer about this codebase)

Write for a sharp colleague who doesn't live in this file. Not a tutorial, not a
spec.

- **Plain language, real names.** Keep the actual terms (`shared_cards`,
  `owns(uid)`, a list query, build 1269) but explain the *mechanism* in ordinary
  words. Never let jargon stand in place of an explanation, and don't dumb the
  nouns down either.
- **Lead with the answer.** State what's true, then why. Skip the tour of how you
  got there.
- **Be concise.** No preamble, no restating the question, no recapping the plan.
  If a sentence doesn't change what the reader does or believes, cut it.
- **One analogy, only when the mechanism isn't obvious** (a filing cabinet, a
  gate), then drop it and go back to the real thing. Never stack analogies.
- **Say the scope, including the negative.** "This does NOT affect private cards"
  is often the most useful sentence in the answer.
- **Keep verified and assumed visibly apart.** Say "verified", "not verified",
  "couldn't test that here"; never blur the two, and never imply a check you
  didn't run.
- **Structure only when it earns its place.** A few short paragraphs usually beat
  a nested outline. Bold the load-bearing clause, not every other phrase.
