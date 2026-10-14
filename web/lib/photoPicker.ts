'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { reportError } from './errorReporter';

/**
 * Native photo picker with a hard selection cap, implemented in
 * ios/App/App/PhotoPickerPlugin.swift. The WebView's `<input type="file"
 * multiple>` opens the iOS picker with NO limit (HTML can't ask for one), so a
 * user could tick 8 photos and we then kept 5. This picker makes iOS itself
 * stop at the room left on the card.
 *
 * Usage: hand the file input's onClick to `openCappedPicker`. Everywhere but
 * the iOS app (desktop web) the input works as before.
 */
interface PhotoPickerPlugin {
    pick(options: { limit: number }): Promise<{ files: { path: string; name: string }[]; failed: number }>;
}

const PhotoPickerNative = registerPlugin<PhotoPickerPlugin>('PhotoPicker');

/** True only inside the iOS app on a build that ships the plugin. */
export function hasNativePhotoPicker(): boolean {
    return !!Capacitor?.isNativePlatform?.()
        && Capacitor.getPlatform() === 'ios'
        && Capacitor.isPluginAvailable('PhotoPicker');
}

/**
 * Open the capped picker and return the chosen photos as Files, in the order
 * the user tapped them (already downsampled to JPEG natively). A cancel
 * resolves `[]`; `failed` counts picks that couldn't be read.
 */
export async function pickPhotos(limit: number): Promise<{ files: File[]; failed: number }> {
    if (limit <= 0) return { files: [], failed: 0 };
    const res = await PhotoPickerNative.pick({ limit });
    let failed = res?.failed ?? 0;
    const files: File[] = [];
    for (const f of res?.files ?? []) {
        try {
            const blob = await (await fetch(Capacitor.convertFileSrc(`file://${f.path}`))).blob();
            if (blob.size === 0) throw new Error('empty pick');
            files.push(new File([blob], f.name, { type: 'image/jpeg' }));
        } catch {
            failed += 1;
        }
    }
    return { files, failed };
}

/**
 * onClick for an `<input type="file" accept="image/*" multiple>`: inside the
 * iOS app, cancel WebKit's uncapped picker and open the capped native one with
 * `room` slots; anywhere else do nothing, so the input's own picker opens.
 * `onPicked` gets the chosen Files (possibly none, on cancel) and how many
 * picks couldn't be read.
 */
export function openCappedPicker(
    e: { preventDefault(): void },
    room: number,
    onPicked: (files: File[], failed: number) => void,
): void {
    if (!hasNativePhotoPicker()) return;
    e.preventDefault();
    if (room <= 0) return;
    pickPhotos(room)
        .then(({ files, failed }) => onPicked(files, failed))
        .catch((err) => {
            // A double tap while the picker is up is harmless; anything else
            // means a tap that opened nothing, which is worth hearing about.
            if (!/already open/i.test(err instanceof Error ? err.message : String(err))) {
                reportError(err, 'photo-picker');
            }
        });
}
