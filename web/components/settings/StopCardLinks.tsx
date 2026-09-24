'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2Off } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { unpublishAllCards } from '@/lib/collections';
import { RowShell, RowText } from './primitives';

/**
 * Settings → Privacy: "Stop all public card links". One server call
 * (/api/unpublish-share with `all: true`) takes down every single-card page
 * this account has published and clears each card's shareId. Public
 * collections and shared answers are NOT touched — they are managed from the
 * collection and the answer. Reversible per card: sharing a card again
 * republishes it at the same URL.
 */
export default function StopCardLinks() {
    const { uid } = useAuth();
    const toast = useToast();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const stopAll = async () => {
        if (!uid || busy) return;
        setBusy(true);
        try {
            const n = await unpublishAllCards(uid);
            toast.success(n === 0
                ? 'You have no public card links.'
                : `Stopped ${n} public card link${n === 1 ? '' : 's'}.`);
        } catch {
            toast.error("Couldn't stop your card links. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <RowShell tile={<Link2Off className="w-[16px] h-[16px]" />} onClick={busy ? undefined : () => setConfirming(true)}>
                <RowText
                    title={busy ? 'Stopping card links…' : 'Stop all public card links'}
                    sub="Every card you shared stops opening. Collections are not affected."
                />
            </RowShell>
            {/* Portaled: this row sits inside a grouped List (overflow-hidden). */}
            {confirming && typeof document !== 'undefined' && createPortal(<ConfirmDialog
                isOpen={confirming}
                onClose={() => setConfirming(false)}
                onConfirm={stopAll}
                title="Stop all public card links?"
                message="Every link to a single card you've shared stops working right away. Public collections and shared answers stay up. Sharing a card again brings its link back."
                confirmLabel="Stop all links"
            />, document.body)}
        </>
    );
}
