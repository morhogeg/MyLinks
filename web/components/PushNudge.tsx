'use client';

import { useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { registerPush, writeLocalPushPrompt } from '@/lib/push';
import { updateUserSettings } from '@/lib/storage';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { useToast } from './Toast';

/**
 * First-run notifications nudge (native only). NOT the OS prompt — iOS allows
 * that dialog once, so it must come from a deliberate user gesture: the
 * "Turn on" button here (or the Settings toggle). Shown once per account,
 * recorded with the AI-consent dual-persistence pattern: localStorage
 * (push-prompt-v1) + a `pushPromptedAt` mirror on the user doc, reconciled in
 * AuthProvider so a reinstall doesn't re-nudge.
 */
export default function PushNudge({ uid, onDone }: { uid: string; onDone: () => void }) {
    const [busy, setBusy] = useState(false);
    const toast = useToast();

    const record = () => {
        const now = Date.now();
        writeLocalPushPrompt(now);
        updateDoc(doc(db, 'users', uid), { pushPromptedAt: now }).catch(() => {});
        onDone();
    };

    const dismiss = () => {
        hapticMedium();
        record();
    };

    const enable = async () => {
        hapticLight();
        setBusy(true);
        try {
            const granted = await registerPush();
            if (granted) {
                // Push is the only reminder channel now — turn it on and record
                // that reminders should arrive here (folds out any legacy value).
                updateUserSettings(uid, { push_enabled: true, reminders_channel: ['push'] })
                    .catch(() => {});
                toast.success('Notifications on — reminders and digests will arrive here.');
            } else {
                toast.info('You can turn notifications on anytime in Settings.');
            }
        } finally {
            setBusy(false);
            record();
        }
    };

    return (
        <div className="mb-4 rounded-2xl border border-accent/25 bg-card overflow-hidden shadow-lg shadow-accent/5 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-md shadow-accent/20">
                    <BellRing className="w-[18px] h-[18px] text-white" />
                </div>
                <div className="flex-grow min-w-0">
                    <div className="text-[15px] font-bold text-text">Never miss a revisit</div>
                    <div className="text-[13px] text-text-secondary leading-snug">
                        Get reminders and digests as notifications — you can change this in Settings.
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={enable}
                        disabled={busy}
                        className="h-9 px-3.5 rounded-full bg-accent text-white text-[13px] font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                        {busy ? 'Turning on…' : 'Turn on'}
                    </button>
                    <button
                        onClick={dismiss}
                        aria-label="Not now"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
