'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SharedCardDoc } from '@/lib/types';
import { PublicShell, SharedCardTile, PublicStatus } from '@/components/PublicShare';

/**
 * Public, read-only "Machina page" for a single shared card.
 * Client-rendered, keyed off `?id=` (static-export safe); reads a world-readable
 * shared_cards/{id} doc with no auth.
 */
function SharedCardContent() {
    const params = useSearchParams();
    const id = params.get('id');
    const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
    const [data, setData] = useState<SharedCardDoc | null>(null);

    useEffect(() => {
        if (!id) { setState('missing'); return; }
        let active = true;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'shared_cards', id));
                if (!active) return;
                if (snap.exists()) {
                    setData(snap.data() as SharedCardDoc);
                    setState('ready');
                } else {
                    setState('missing');
                }
            } catch {
                if (active) setState('missing');
            }
        })();
        return () => { active = false; };
    }, [id]);

    if (state === 'loading') return <PublicStatus>Loading…</PublicStatus>;
    if (state === 'missing' || !data) {
        return <PublicStatus>This card isn’t available. It may have been removed.</PublicStatus>;
    }

    return (
        <PublicShell title="Shared from Machina" subtitle={data.card.sourceName || undefined}>
            <div className="max-w-xl">
                <SharedCardTile card={data.card} />
            </div>
        </PublicShell>
    );
}

export default function SharedCardPage() {
    return (
        <Suspense fallback={<PublicStatus>Loading…</PublicStatus>}>
            <SharedCardContent />
        </Suspense>
    );
}
