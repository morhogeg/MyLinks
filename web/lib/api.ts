// Absolute base for the Cloud-Function-backed /api/* endpoints.
//
// On the web (Vercel / Firebase Hosting) this is empty: the calls stay relative
// and the hosting layer rewrites /api/* straight to the Cloud Functions.
//
// Inside the bundled iOS app (Capacitor) there is no server behind the WebView
// origin (capacitor://localhost), so the build is compiled with
// NEXT_PUBLIC_API_BASE=https://secondbrain-app-94da2.web.app — the live
// Firebase Hosting site, which already rewrites every /api/* path to its
// function. apiUrl() prefixes that base only when it's set.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

/**
 * Staged multi-user auth rollout flag. When false (default), the app keeps its
 * current behavior (web Google gate; native loads the owner workspace) and the
 * backend still accepts a client uid. When true, web + native both require
 * sign-in (Google/Apple) and the backend enforces ID-token auth. Flip this (and
 * the matching backend REQUIRE_AUTH) only at cutover — see NATIVE_AUTH_SETUP.md.
 */
export const REQUIRE_AUTH = process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'true';

export function apiUrl(path: string): string {
    return API_BASE ? `${API_BASE}${path}` : path;
}

/**
 * fetch() with a hard timeout. A stalled socket (common on flaky cellular,
 * especially inside the iOS WKWebView) can otherwise leave a request pending
 * forever, so the caller's spinner never resolves. Aborts after `timeoutMs`;
 * the rejection surfaces through the caller's existing catch as a normal
 * network error.
 *
 * NOTE for streamed (SSE) responses: fetch() settles as soon as the response
 * *headers* arrive, so the timeout here only bounds connection setup — the
 * (legitimately long) body stream that follows is not cut off. Callers reading
 * a single JSON body get the same protection for free.
 */
export async function fetchWithTimeout(
    input: string,
    init: RequestInit = {},
    timeoutMs = 30_000,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * True when running inside the bundled native shell (Capacitor's WKWebView)
 * rather than a normal browser tab. The shell serves from capacitor://localhost
 * and injects a global `Capacitor`. Some web APIs behave differently there — most
 * notably streamed (SSE) response bodies, which the WKWebView fetch handles
 * unreliably — so callers branch on this to pick the robust path.
 */
export function isNativeApp(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.protocol === 'capacitor:'
        || Boolean((window as unknown as { Capacitor?: unknown }).Capacitor);
}
