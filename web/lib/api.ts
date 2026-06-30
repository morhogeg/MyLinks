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

export function apiUrl(path: string): string {
    return API_BASE ? `${API_BASE}${path}` : path;
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
