---
name: ship
description: Ship MyLinks / Second Brain. Merge the current branch to main, deploy the frontend to BOTH Vercel (desktop, auto on push) and Firebase Hosting (iPhone, manual ./deploy-hosting.sh), deploy Cloud Functions if the backend changed, and update HANDOFF.md for the next session. Use whenever the user says ship, deploy, release, "push it live", "make it live", or "deploy for desktop and iphone".
---

# Ship MyLinks

End-to-end release for this repo. The app has **two separate frontend deployments** and a
**separate backend** — a change isn't fully live until the right ones are all updated:

- **Desktop** → Vercel (`my-links-sable.vercel.app`). **Auto-deploys on push to `main`.**
- **iPhone** → Firebase Hosting (`secondbrain-app-94da2.web.app`). **Manual**: `./deploy-hosting.sh`.
  The iOS share/deep-links and `APP_URL` point here, so skipping this leaves the phone stale.
- **Backend** → Python Cloud Functions in `functions/` (Firebase project `secondbrain-app-94da2`).
  Manual: `./deploy-functions.sh functions:<name>`.

All deploy commands run from the **main worktree** `~/MyLinks` (it has `node_modules`,
`web/.env.local`, and `firebase login`). The current session may be in a git **worktree** under
`~/MyLinks/.claude/worktrees/<name>` on a `claude/*` branch.

## Steps

1. **Assess scope.** From the repo, run `git status` and inspect the branch's diff vs `main`
   (`git diff --name-only main...HEAD` plus any uncommitted changes). Decide:
   - **Frontend changed?** any file under `web/`.
   - **Backend changed?** any file under `functions/`. If so, list the specific functions whose
     code (or shared modules they import, e.g. `ai_service.py`, `search.py`, `models.py`) changed
     — you'll pass them as deploy targets.
   - **Docs/skills only?** then no deploy is needed, just commit + merge + push.

2. **Commit** any uncommitted work on the current branch with a clear, scoped message
   (Co-Authored-By trailer as usual). Skip if the tree is already clean.

3. **Typecheck the frontend** (if `web/` changed). The worktree often lacks `node_modules`, so
   run against the main worktree's install:
   `cd ~/MyLinks/web && ./node_modules/.bin/tsc --noEmit` — must exit 0 before deploying.
   (If you temporarily copy worktree files in to typecheck, restore them with `git checkout --`
   afterward and confirm `~/MyLinks` is clean.)

4. **Merge to `main` and push.** `main` is checked out in the main worktree, so merge there:
   ```bash
   git -C ~/MyLinks merge <current-branch> --no-ff --no-edit
   git -C ~/MyLinks push origin main
   ```
   If `push` is rejected (origin advanced), `git -C ~/MyLinks pull --no-rebase --no-edit origin main`
   then push again. The push triggers Vercel → **desktop is now deploying.**

5. **Deploy Cloud Functions** (only if `functions/` changed):
   ```bash
   cd ~/MyLinks && ./deploy-functions.sh functions:<funcA>,functions:<funcB>
   ```
   Use the specific targets you identified in step 1 (e.g. `functions:ask_brain`). The scheduler /
   webhook functions are **not** in the script's default target, so always pass explicit targets.

6. **Deploy Firebase Hosting for iPhone** (if `web/` changed):
   ```bash
   cd ~/MyLinks && ./deploy-hosting.sh
   ```
   This runs `npm run build` (static export to `web/out`) then `firebase deploy --only hosting`.
   **Never skip this for a frontend change** — see [[deploy-both-vercel-and-firebase-hosting]].

7. **Update `HANDOFF.md`** (in `~/MyLinks`) for the next session: bump the `_Last updated_` line +
   branch, add a concise "Latest session" section (what changed, which files, what was deployed),
   and demote the previous "Latest session" heading to "Earlier". Commit + push it to `main`
   (it's docs, safe to commit directly on main). Convert any relative dates to absolute.

8. **Report.** Tell the user exactly what shipped: desktop (Vercel, ~1–2 min build),
   iPhone (Firebase Hosting, done), functions (if any), and remind them to hard-refresh / reopen
   the iPhone app to clear PWA cache.

## Notes / gotchas
- **Env:** `GEMINI_API_KEY`, `TWILIO_*` are plain env vars in `functions/.env` (gitignored) — not
  Secret Manager. Functions deploy needs a local venv so firebase-tools can import the source.
- **Don't redeploy what didn't change** — backend-only change → functions deploy only (no hosting);
  frontend-only → push + hosting (no functions); docs-only → no deploys.
- If the command-safety classifier is briefly unavailable, wait and retry the same command.
