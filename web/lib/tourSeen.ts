/**
 * "How Machina works" (components/OnboardingTour) shows once per ACCOUNT, not
 * per device. Two records, the same dual persistence as `aiConsentAt` /
 * `pushPromptedAt`:
 *   - localStorage `machina_onboarding_v1` = '1': what app/page.tsx checks at
 *     boot. A cache.
 *   - `tourSeenAt` (ms) on the user doc: the authoritative record, so a user
 *     who saw the tour on their phone doesn't get it again on desktop web.
 * AuthProvider reconciles the two when the doc resolves (reconcileTourSeen,
 * below); the tour writes both when it is finished or skipped.
 */
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { reportError } from './errorReporter';

export const ONBOARDING_STORAGE_KEY = 'machina_onboarding_v1';

function writeLocal(seen: boolean): void {
    try {
        if (seen) localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
        else localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    } catch {
        // Private mode: the user-doc record still covers other devices.
    }
}

function readLocal(): boolean {
    try {
        return !!localStorage.getItem(ONBOARDING_STORAGE_KEY);
    } catch {
        return false;
    }
}

/**
 * Run once the user doc is known, BEFORE auth stops loading (app/page.tsx
 * reads the local key right after). The doc wins: if it says seen, cache that
 * locally. Otherwise:
 *   - a fresh workspace (`onboarded: false`) has not seen the tour, whatever
 *     this browser remembers. The local key is device-wide, so it may belong
 *     to another account that used this browser; clear it so the new account
 *     gets its one viewing. That other account's own doc re-sets the key the
 *     next time it signs in here.
 *   - an existing account that saw the tour on this device before the doc
 *     record existed: mirror the local flag up to the doc.
 */
export function reconcileTourSeen(
    docId: string,
    data: Record<string, unknown> | undefined,
    fresh: boolean,
): void {
    if (typeof data?.tourSeenAt === 'number') {
        writeLocal(true);
        return;
    }
    if (fresh) {
        writeLocal(false);
        return;
    }
    if (readLocal()) {
        updateDoc(doc(db, 'users', docId), { tourSeenAt: Date.now() })
            .catch((e) => reportError(e, 'tour-seen-reconcile'));
    }
}

/** The tour was finished or skipped: record it locally and on the user doc. */
export function markTourSeen(uid: string | null): void {
    // A replay from Settings finds the key already set, and the doc was
    // written (or mirrored by reconcileTourSeen) the first time round.
    const already = readLocal();
    writeLocal(true);
    if (!uid || already) return;
    updateDoc(doc(db, 'users', uid), { tourSeenAt: Date.now() })
        .catch((e) => reportError(e, 'tour-seen-write'));
}
