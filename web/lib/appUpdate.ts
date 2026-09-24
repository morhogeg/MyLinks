'use client';

/**
 * Forced update for the native iOS app.
 *
 * The owner can retire old builds (a breaking API change, a bad release) by
 * writing one Firestore doc, `config/app`, which the rules make readable by
 * anyone by id and writable by no client (firestore.rules):
 *
 *   { minBuild: 1340, message?: "…", appStoreId?: "1234567890" }
 *
 * A native build whose CFBundleVersion (1000 + CI run number) is below
 * `minBuild` shows a blocking "Update Machina" screen (components/NativeShell).
 *
 * FAILS OPEN, always: no doc, no `minBuild`, a network or rules error, an
 * unreadable build number, or the web (not native) all mean "don't block".
 * A broken check must never lock people out of their library.
 */

import { doc, getDocFromServer } from 'firebase/firestore';
import { isNativeApp } from './api';

export interface UpdateRequirement {
    /** Owner-written copy for the screen, if any. */
    message?: string;
    /** Numeric App Store id for the Update button; absent = no button. */
    appStoreId?: string;
}

/** Build-time fallback for the App Store id (the doc's `appStoreId` wins). */
const APP_STORE_ID_FALLBACK = process.env.NEXT_PUBLIC_APP_STORE_ID || '';

async function nativeBuildNumber(): Promise<number | null> {
    try {
        const { App } = await import('@capacitor/app');
        const n = Number.parseInt((await App.getInfo()).build, 10);
        if (Number.isFinite(n) && n > 0) return n;
    } catch {
        // Older native build without @capacitor/app — fall through.
    }
    const baked = Number.parseInt(process.env.NEXT_PUBLIC_BUILD_NUMBER || '', 10);
    return Number.isFinite(baked) && baked > 0 ? baked : null;
}

/**
 * Resolve whether this native build is below the required minimum. Returns
 * the requirement to show, or null for "carry on" (including every failure).
 */
export async function checkForcedUpdate(): Promise<UpdateRequirement | null> {
    if (!isNativeApp()) return null;
    try {
        const build = await nativeBuildNumber();
        if (build === null) return null;
        const { db } = await import('./firebase');
        // From the server, not the offline cache: an old cached minBuild must
        // not keep blocking after the owner lowers it, and offline = no block.
        const snap = await getDocFromServer(doc(db, 'config', 'app'));
        if (!snap.exists()) return null;
        const data = snap.data() as Record<string, unknown>;
        const minBuild = typeof data.minBuild === 'number' ? data.minBuild : Number(data.minBuild);
        if (!Number.isFinite(minBuild) || build >= minBuild) return null;
        const message = typeof data.message === 'string' && data.message.trim() ? data.message.trim() : undefined;
        const rawId = typeof data.appStoreId === 'string' || typeof data.appStoreId === 'number'
            ? String(data.appStoreId)
            : APP_STORE_ID_FALLBACK;
        const appStoreId = /^\d+$/.test(rawId) ? rawId : undefined;
        return { message, appStoreId };
    } catch {
        return null;
    }
}

/** The App Store product page. Capacitor hands non-app URLs to iOS, which
    opens apps.apple.com links in the App Store app. */
export function appStoreUrl(appStoreId: string): string {
    return `https://apps.apple.com/app/id${appStoreId}`;
}
