# Machina AI (repo: MyLinks)

**Read `SOURCE_OF_TRUTH.md` first.** It is the single source of truth for this
project: product/architecture overview (§1–§2), auth cutover state (§3), the
ranked backlog (§4), ship checklist (§5), and the session log (§9). It's kept
slim (the hot path); the one-time App Store / cost / marketing reviews and the
older session-log entries now live in `docs/reference/` (linked from the §6–8
pointer in the doc).

Rules:
- When learning the codebase or picking work, start from `SOURCE_OF_TRUTH.md` §4.
- When a change needs documenting, update `SOURCE_OF_TRUTH.md` (check boxes in
  §4, add a §9 session-log entry). Do **not** create new HANDOFF/TASKS/spec/audit
  docs — the old ones were consolidated into it and deleted.
- Ship via the `/ship` skill (`.claude/skills/ship/SKILL.md`): Vercel (auto on
  push to main), Cloud Functions via `./deploy-functions.sh`, iOS via the
  "iOS → TestFlight" GitHub Actions workflow. The iPhone PWA is retired — no
  routine `./deploy-hosting.sh`.
- Verify with the `/verify` skill (`.claude/skills/verify/SKILL.md`) — it runs
  the typecheck + `py_compile`, the theme-token lint, and drives the changed page
  in a real browser. Minimum manual checks: `cd web && npx tsc --noEmit` and
  `cd functions && python -m py_compile *.py`. Don't report a UI change done on a
  green typecheck alone.
- Theme: use the Tailwind token system (`text-text`, `bg-card`, `--accent-gradient`,
  `--ease-modal`), never hardcoded colors.
