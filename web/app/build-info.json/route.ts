import { REQUIRE_AUTH } from '@/lib/api';

/**
 * Build manifest, emitted into the bundle at build time as `/build-info.json`.
 *
 * WHY THIS EXISTS: the iOS workflow's guard step checks the *input* — that
 * `REQUIRE_AUTH_VALUE` resolved to 'true' before the build. That catches the
 * trigger-shaped bug that shipped ungated builds 1264/1266/1267, but it proves
 * nothing about the artifact: rename the env var, change the `=== 'true'` check
 * in `lib/api.ts`, or have Next stop inlining it, and the guard still passes
 * while a dead bundle ships.
 *
 * So this deliberately imports `REQUIRE_AUTH` from `@/lib/api` — the same
 * binding the app itself gates on, resolved through the same bundler inlining.
 * Whatever ends up in this file is what the app believes. CI asserts on it
 * AFTER `next build` + `cap sync`, reading the copy inside the iOS target, so
 * the thing checked is the thing that ships.
 *
 * It also ships to the device and to Vercel, so "what does this build actually
 * think?" is answerable from a running app instead of by re-reading CI logs.
 * Nothing secret goes in here — it is world-readable by design.
 */
export const dynamic = 'force-static';

export function GET() {
    return Response.json({
        // The load-bearing field. CI fails the build when this isn't true.
        requireAuth: REQUIRE_AUTH,
        // Diagnosis aids: which build is this, and from what commit.
        buildNumber: process.env.NEXT_PUBLIC_BUILD_NUMBER || null,
        commit: process.env.NEXT_PUBLIC_COMMIT_SHA || null,
        builtAt: new Date().toISOString(),
    });
}
