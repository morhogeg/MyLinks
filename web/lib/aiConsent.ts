/**
 * AI-processing consent (App Review 5.1.1/5.1.2, Nov 2025 update): before the
 * user can save anything, they must explicitly agree that saved content and
 * questions are sent to Google Gemini for analysis. Acceptance is recorded in
 * localStorage under this versioned key (value = ms timestamp) and mirrored to
 * the user doc as `aiConsentAt` so it survives reinstalls — AuthProvider owns
 * the gating and the mirroring; either signal counts as consent. Bump the key
 * ("ai-consent-v2", …) only if the disclosure changes materially enough to
 * require re-consent.
 */
export const AI_CONSENT_KEY = 'ai-consent-v1';

/** Millisecond timestamp of this device's recorded consent, or null. */
export function readLocalAiConsent(): number | null {
    try {
        const raw = localStorage.getItem(AI_CONSENT_KEY);
        if (!raw) return null;
        const ts = Number(raw);
        return Number.isFinite(ts) && ts > 0 ? ts : null;
    } catch {
        // Private mode — rely on the user-doc record (`aiConsentAt`) alone.
        return null;
    }
}

/** Record consent locally (best effort — the user-doc mirror is the backup). */
export function writeLocalAiConsent(ts: number): void {
    try {
        localStorage.setItem(AI_CONSENT_KEY, String(ts));
    } catch {
        // Private mode — the user-doc mirror still records it.
    }
}
