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

/**
 * The local record is per WORKSPACE (`ai-consent-v1:<uid>`), never per device.
 * A device-wide key let the next account on a shared phone skip the notice and
 * had AuthProvider copy the previous person's timestamp into the new account's
 * `aiConsentAt`: a consent record for someone who never saw the disclosure.
 * The user doc stays the source of truth; this is only the offline cache.
 */
const keyFor = (workspaceId: string) => `${AI_CONSENT_KEY}:${workspaceId}`;

/** Millisecond timestamp of this workspace's consent recorded on this device, or null. */
export function readLocalAiConsent(workspaceId: string | null | undefined): number | null {
    if (!workspaceId) return null;
    try {
        const raw = localStorage.getItem(keyFor(workspaceId));
        if (!raw) return null;
        const ts = Number(raw);
        return Number.isFinite(ts) && ts > 0 ? ts : null;
    } catch {
        // Private mode — rely on the user-doc record (`aiConsentAt`) alone.
        return null;
    }
}

/** Record consent locally (best effort — the user-doc mirror is the backup). */
export function writeLocalAiConsent(workspaceId: string, ts: number): void {
    try {
        localStorage.setItem(keyFor(workspaceId), String(ts));
    } catch {
        // Private mode — the user-doc mirror still records it.
    }
}
