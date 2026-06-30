'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SharedCollection } from '@/lib/types';
import { PublicShell, SharedCardTile, PublicStatus } from '@/components/PublicShare';

/**
 * Public, read-only view of a shared collection snapshot.
 * Client-rendered and keyed off the `?id=` query param (NOT a dynamic route)
 * so it works under the Next.js static export. Reads a world-readable
 * shared_collections/{id} doc — no auth required.
 */
function SharedCollectionContent() {
    const params = useSearchParams();
    const id = params.get('id');
    const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
    const [data, setData] = useState<SharedCollection | null>(null);

    useEffect(() => {
        if (!id) { setState('missing'); return; }
        let active = true;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'shared_collections', id));
                if (!active) return;
                if (snap.exists()) {
                    setData(snap.data() as SharedCollection);
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

    if (state === 'loading') return <PublicStatus>Loading collection…</PublicStatus>;
    if (state === 'missing' || !data) {
        return <PublicStatus>This collection isn’t available. It may have been unshared or removed.</PublicStatus>;
    }

    const count = data.cards?.length ?? 0;
    return (
        <PublicShell
            title={data.name}
            subtitle={data.description || `${count} ${count === 1 ? 'card' : 'cards'}`}
        >
            {count === 0 ? (
                <p className="text-text-muted">This collection is empty.</p>
            ) : (
                <div className="grid gap-4 sm:gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
                    {data.cards.map((card, i) => (
                        <SharedCardTile key={i} card={card} />
                    ))}
                </div>
            )}
        </PublicShell>
    );
}

export default function SharedCollectionPage() {
    return (
        <Suspense fallback={<PublicStatus>Loading…</PublicStatus>}>
            <SharedCollectionContent />
        </Suspense>
    );
}
