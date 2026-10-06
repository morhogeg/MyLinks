'use client';

import { registerPlugin } from '@capacitor/core';

/**
 * The native export's files (Settings → Export my data on iOS).
 *
 * The export is the whole library in two files, written to the app's Caches
 * directory so the share sheet can hand them to Files, AirDrop or Mail. iOS
 * only empties Caches under storage pressure, so they are deleted as soon as
 * the share sheet closes, and again at sign-out in case the app was killed
 * with the sheet open (lib/auth.ts dropNativeSession).
 */

/** The @capacitor/filesystem calls used here. Registered by name (the plugin's
 *  JS layer is exactly this registerPlugin call), so the web bundle carries no
 *  filesystem code and the web build never needs it. */
interface FilesystemPlugin {
    writeFile(opts: { path: string; data: string; directory: 'CACHE'; encoding: 'utf8' }): Promise<{ uri: string }>;
    deleteFile(opts: { path: string; directory: 'CACHE' }): Promise<void>;
}

export const Filesystem = registerPlugin<FilesystemPlugin>('Filesystem');

export const EXPORT_FILE_NAMES = ['machina-export.json', 'machina-export.md'] as const;

/** Delete every export file from Caches. Never throws (a missing file is fine). */
export async function deleteNativeExportFiles(): Promise<void> {
    for (const path of EXPORT_FILE_NAMES) {
        try {
            await Filesystem.deleteFile({ path, directory: 'CACHE' });
        } catch {
            // Not there (already deleted, or never exported): nothing to do.
        }
    }
}
