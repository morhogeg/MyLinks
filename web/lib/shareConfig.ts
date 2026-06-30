'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/**
 * Tiny native bridge implemented in ios/App/App/ShareConfigPlugin.swift.
 * It writes the share-ingest endpoint + token into the App Group's shared
 * UserDefaults so the Share Extension (a separate process that can't read the
 * WebView's Firebase session) can authenticate its uploads.
 */
interface ShareConfigPlugin {
    save(options: { endpoint: string; token: string }): Promise<void>;
}

const ShareConfigNative = registerPlugin<ShareConfigPlugin>('ShareConfig');

let lastSyncedUid: string | null = null;

/**
 * Push the user's share endpoint + ingest token into the App Group container so
 * the iOS Share Extension can post shared links/images on the user's behalf.
 *
 * No-op everywhere except the native iOS app. Best-effort: failures are logged
 * and swallowed so they never block app startup.
 */
export async function syncShareConfigToNative(uid: string): Promise<void> {
    if (!uid) return;
    if (!Capacitor?.isNativePlatform?.() || Capacitor.getPlatform() !== 'ios') return;
    if (lastSyncedUid === uid) return; // already pushed this session

    try {
        const getShareConfig = httpsCallable<
            { uid: string },
            { endpoint: string; token: string }
        >(functions, 'get_share_config');

        const res = await getShareConfig({ uid });
        const endpoint = res.data?.endpoint;
        const token = res.data?.token;
        if (endpoint && token) {
            await ShareConfigNative.save({ endpoint, token });
            lastSyncedUid = uid;
        }
    } catch (e) {
        console.warn('Share config sync to native failed (non-fatal):', e);
    }
}
