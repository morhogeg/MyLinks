/**
 * Where the extension talks to, in one place.
 *
 * Production only: the extension sends saves to exactly one endpoint, the
 * `share_ingest` Cloud Function behind mymachina.app (the same /api/share the
 * iPhone share sheet uses). The browser test harness (e2e/extension) swaps
 * this file in a COPY of the extension to point at a local stub; nothing in
 * the shipped code can be redirected at runtime.
 */

/** The Machina web app. Saves go to its /api/share rewrite. */
export const APP_ORIGIN = 'https://mymachina.app';

/** share_ingest: authenticates with the X-Ingest-Token header, no cookies. */
export const SHARE_ENDPOINT = `${APP_ORIGIN}/api/share`;

/** Library home, opened by "Open Machina". */
export const APP_URL = `${APP_ORIGIN}/`;

/** Signed in: connects this browser in one click. Signed out: after sign-in. */
export const CONNECT_URL = `${APP_ORIGIN}/?connect=extension`;

/** Settings > Browser extension (token, Reset, help). */
export const SETTINGS_URL = `${APP_ORIGIN}/?settings=extension`;

export const PRIVACY_URL = `${APP_ORIGIN}/privacy`;

/** Origins whose top-frame root page may connect or disconnect the extension. */
export const BRIDGE_ORIGINS = [APP_ORIGIN];
