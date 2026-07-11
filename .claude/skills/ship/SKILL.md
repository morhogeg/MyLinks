---
name: ship
description: Ship Machina AI. Merge the current branch to main, deploy the frontend to Vercel (desktop web, auto on push), deploy Cloud Functions if the backend changed, and trigger the iOS → TestFlight GitHub Actions workflow if the app changed. Update SOURCE_OF_TRUTH.md for the next session. Use whenever the user says ship, deploy, release, "push it live", "make it live", or "send to TestFlight".
---

# Ship Machina AI

> **Before anything:** read `SOURCE_OF_TRUTH.md` (repo root). It is the single
> source of truth for architecture, deploy gotchas, and the ranked backlog. All
> post-ship documentation goes THERE (§4 checkboxes + §9 session log) — never
> create or update HANDOFF/TASKS/spec files; they were consolidated and deleted.
>
> 🚨 **MANDATORY — every ship MUST update `SOURCE_OF_TRUTH.md` before it's done.**
> Not optional, not just the session log. In the SAME ship you must:
> 1. **§9 session log** — prepend a dated entry covering what advanced (features,
>    fixes, deploys) AND any **new/known issues, workarounds, or deferred owner
>    steps** discovered. Name concrete artifacts: commit SHAs, function names,
>    TestFlight build numbers, endpoints.
> 2. **§4 backlog** — check off completed items, add newly-discovered tasks/bugs,
>    re-rank if priorities shifted.
> 3. **§3 / live-state note / §2 gotchas** — update if the auth state, live build,
>    or an operational gotcha changed.
> A ship that deploys code but leaves the source of truth stale is an INCOMPLETE
> ship. Bugs you couldn't fix, workarounds you shipped, follow-ups you left (a
> console step, a config the user must set) MUST be written here so the next
> session isn't blind. Commit + push the doc update to `main` (step 8).

End-to-end release for this repo. Deploy surfaces:

- **Desktop web** → Vercel (`my-links-sable.vercel.app`). **Auto-deploys on push to `main`.**
- **iOS app** → **GitHub Actions "iOS → TestFlight" workflow**
  (`.github/workflows/ios-testflight.yml`, macOS runner, cloud-managed signing,
  build number = 1000 + run number). Manual dispatch (the push trigger is gated
  during the auth cutover — see SOURCE_OF_TRUTH §3).
- **Backend** → Python Cloud Functions in `functions/` (Firebase project
  `secondbrain-app-94da2`). Manual: `./deploy-functions.sh functions:<name>`.
- ~~iPhone PWA (Firebase Hosting)~~ — **retired**: the native iOS app replaced it.
  Do NOT routinely run `./deploy-hosting.sh`. Hosting still serves the `/api/*`
  rewrites the native app calls and the `/s`,`/c` share pages, so deploy hosting
  **only** when `firebase.json` (rewrites/headers) changes.

Local deploy commands run from the **main worktree** `~/MyLinks` (it has
`node_modules`, `web/.env.local`, and `firebase login`). The current session may
be in a git worktree under `~/MyLinks/.claude/worktrees/<name>` on a `claude/*` branch.

## Steps

1. **Assess scope.** `git status` + `git diff --name-only main...HEAD`:
   - **Frontend changed?** any file under `web/` (excluding `web/ios/`).
   - **Native iOS changed?** anything under `web/ios/` or `capacitor.config.ts`.
   - **Backend changed?** any file under `functions/`. List the specific
     functions whose code (or imported shared modules — `ai_service.py`,
     `search.py`, `models.py`) changed; they become the deploy targets.
   - **`firebase.json` changed?** only then is a hosting deploy needed.
   - **Docs/skills only?** no deploys — commit + merge + push.

2. **Commit** any uncommitted work on the current branch with a clear, scoped
   message. Skip if the tree is already clean.

3. **Typecheck** (if `web/` changed): `cd ~/MyLinks/web && ./node_modules/.bin/tsc --noEmit`
   — must exit 0. Backend: `cd functions && python -m py_compile *.py`.

4. **Merge to `main` and push.** `main` is checked out in the main worktree:
   ```bash
   git -C ~/MyLinks merge <current-branch> --no-ff --no-edit
   git -C ~/MyLinks push origin main
   ```
   If push is rejected (origin advanced), `git -C ~/MyLinks pull --no-rebase
   --no-edit origin main` then push again. The push triggers Vercel →
   **desktop web is now deploying.**

5. **Deploy Cloud Functions** (only if `functions/` changed):
   ```bash
   cd ~/MyLinks && ./deploy-functions.sh functions:<funcA>,functions:<funcB>
   ```
   Always pass explicit targets — the scheduler/webhook functions are not in the
   script's defaults. `process_link_background` may 409 transiently; retry in ~60s.

6. **Deploy to TestFlight** (if frontend or native iOS changed and the user wants
   the app updated — TestFlight builds are heavier than web deploys, so confirm
   when ambiguous). Trigger the workflow on `main`:
   ```bash
   gh workflow run "iOS → TestFlight" --repo morhogeg/MyLinks --ref main
   gh run watch "$(gh run list --workflow=ios-testflight.yml --repo morhogeg/MyLinks -L1 --json databaseId -q '.[0].databaseId')" --repo morhogeg/MyLinks
   ```
   (In a remote session without `gh`, use the GitHub MCP `actions_run_trigger`
   tool with `workflow_id: ios-testflight.yml`, or tell the user to hit Actions →
   *iOS → TestFlight* → Run workflow.) On success the build uploads to TestFlight
   automatically — no Xcode. ⚠️ Until the native-auth SPM conflict is fixed
   (SOURCE_OF_TRUTH §4 task 1), CI strips the firebase-auth plugin and ships a
   **UI-only** build; don't flip the auth flags for a build made this way.

7. **Deploy Firebase Hosting** — only if `firebase.json` changed:
   `cd ~/MyLinks && ./deploy-hosting.sh`. Otherwise skip; the iPhone PWA is retired.

8. **Update `SOURCE_OF_TRUTH.md` (MANDATORY — see the 🚨 block up top).** Not
   optional: check off / add / re-rank §4 backlog items (with commit SHAs),
   prepend a dated §9 session-log entry covering **both what advanced and any new
   issues / workarounds / deferred owner steps** (name build numbers, function
   names, endpoints), and update §3 / the live-state note / §2 gotchas if auth
   state, the live build, or an operational gotcha changed. Commit + push to
   `main` (docs, safe to commit directly). **A ship is not complete until this is
   pushed.**

9. **Report.** Tell the user exactly what shipped: desktop (Vercel, ~1–2 min),
   functions (if any), TestFlight (workflow run link + build number 1000+N,
   arrives in TestFlight after Apple processing, ~10–30 min).

## Notes / gotchas
- **Env:** `GEMINI_API_KEY` is a plain env var in `functions/.env`
  (gitignored) — not Secret Manager. Functions deploy needs a local venv so
  firebase-tools can import the source.
- **Don't redeploy what didn't change** — backend-only → functions only;
  frontend-only → push (Vercel) + TestFlight if the app should get it; docs-only
  → no deploys.
- Full operational gotchas (CORS/capacitor origins, SSE buffering, 127.0.0.1
  preview trick, deploy footguns): `SOURCE_OF_TRUTH.md` §2.
- If the command-safety classifier is briefly unavailable, wait and retry.
