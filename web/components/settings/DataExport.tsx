'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import {
    collection, query, orderBy, limit, startAfter, getDocs, documentId,
    type QueryDocumentSnapshot, type DocumentData, type Query, type QuerySnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isNativeApp } from '@/lib/api';
import { track } from '@/lib/analytics';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { List, RowShell, RowText } from './primitives';

/**
 * Settings → Export my data.
 *
 * Fetches ALL of the signed-in user's links + collections client-side and
 * downloads two files: a full-fidelity JSON and a human-readable Markdown. This
 * is the honest answer to the PKM audience's pre-adoption question — "can I get
 * my data out?" — with no server round-trip.
 *
 * Reads are paginated (batched by document id) so a 1000-card library streams
 * in pages instead of hanging on one giant query, and every doc is included
 * (ordering by document id can't silently drop docs missing a sort field).
 *
 * Web downloads via a Blob object URL. The native iOS shell has no file-save
 * plugin wired (only @capacitor/share, which shares text/URLs, not files), so
 * rather than a broken button it shows an honest "use the web app" note.
 */

const PAGE_SIZE = 500;

/** Read every doc in a user subcollection, batched by document id. */
async function fetchAllDocs(
    uid: string,
    sub: 'links' | 'collections',
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
    const ref = collection(db, 'users', uid, sub);
    const out: QueryDocumentSnapshot<DocumentData>[] = [];
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    // Ordering by __name__ (document id) guarantees every doc is returned and
    // gives a stable pagination cursor.
    for (;;) {
        const q: Query<DocumentData> = cursor
            ? query(ref, orderBy(documentId()), startAfter(cursor), limit(PAGE_SIZE))
            : query(ref, orderBy(documentId()), limit(PAGE_SIZE));
        const snap: QuerySnapshot<DocumentData> = await getDocs(q);
        out.push(...snap.docs);
        if (snap.size < PAGE_SIZE) break;
        cursor = snap.docs[snap.docs.length - 1];
    }
    return out;
}

/** Firestore Timestamps → millis so the JSON export is portable and readable. */
function jsonReplacer(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
        return (value as { toMillis: () => number }).toMillis();
    }
    return value;
}

/** Best-effort human date from the several shapes createdAt can take. */
function displayDate(value: unknown): string {
    let ms: number | null = null;
    if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
        ms = (value as { toMillis: () => number }).toMillis();
    } else if (typeof value === 'number' && Number.isFinite(value)) {
        ms = value;
    } else if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) ms = parsed;
    }
    if (ms === null) return '';
    try {
        return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
}

function mdEscape(s: string): string {
    return String(s).replace(/\r?\n/g, ' ').trim();
}

/** Build the readable Markdown export from raw link/collection docs. */
function buildMarkdown(
    links: QueryDocumentSnapshot<DocumentData>[],
    collections: QueryDocumentSnapshot<DocumentData>[],
): string {
    const lines: string[] = [];
    const now = new Date();
    lines.push('# Machina export');
    lines.push('');
    lines.push(`Exported ${now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · ${links.length} card${links.length === 1 ? '' : 's'} · ${collections.length} collection${collections.length === 1 ? '' : 's'}`);
    lines.push('');

    lines.push('## Cards');
    lines.push('');
    if (links.length === 0) lines.push('_No cards yet._');
    for (const doc of links) {
        const d = doc.data();
        const title = typeof d.title === 'string' && d.title ? d.title : 'Untitled';
        lines.push(`### ${mdEscape(title)}`);
        if (typeof d.url === 'string' && d.url) lines.push(`- URL: ${mdEscape(d.url)}`);
        if (typeof d.category === 'string' && d.category) lines.push(`- Category: ${mdEscape(d.category)}`);
        if (Array.isArray(d.tags) && d.tags.length) lines.push(`- Tags: ${d.tags.map((t: unknown) => mdEscape(String(t))).join(', ')}`);
        const date = displayDate(d.createdAt);
        if (date) lines.push(`- Saved: ${date}`);
        if (typeof d.summary === 'string' && d.summary) {
            lines.push('');
            lines.push(mdEscape(d.summary));
        }
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    if (collections.length > 0) {
        lines.push('## Collections');
        lines.push('');
        for (const doc of collections) {
            const d = doc.data();
            const name = typeof d.name === 'string' && d.name ? d.name : 'Untitled collection';
            lines.push(`### ${mdEscape(name)}`);
            if (typeof d.description === 'string' && d.description) lines.push(mdEscape(d.description));
            lines.push('');
        }
    }

    return lines.join('\n');
}

/** Trigger a browser download of `content` as `filename`. */
function downloadBlob(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after a tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DataExport() {
    const { uid } = useAuth();
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const native = isNativeApp();

    const handleExport = async () => {
        if (!uid || busy) return;
        setBusy(true);
        try {
            const [links, collections] = await Promise.all([
                fetchAllDocs(uid, 'links'),
                fetchAllDocs(uid, 'collections'),
            ]);

            const json = JSON.stringify({
                exportedAt: new Date().toISOString(),
                version: 1,
                counts: { links: links.length, collections: collections.length },
                links: links.map((d) => ({ id: d.id, ...d.data() })),
                collections: collections.map((d) => ({ id: d.id, ...d.data() })),
            }, jsonReplacer, 2);

            const markdown = buildMarkdown(links, collections);

            downloadBlob(json, 'machina-export.json', 'application/json');
            downloadBlob(markdown, 'machina-export.md', 'text/markdown');

            track('export_used', { count: links.length });
            toast.success(`Exported ${links.length} card${links.length === 1 ? '' : 's'}.`);
        } catch {
            toast.error('Export failed — please try again.');
        } finally {
            setBusy(false);
        }
    };

    // Native: no file-save plugin is wired, so be honest instead of shipping a
    // button that silently does nothing.
    if (native) {
        return (
            <List>
                <RowShell tile={<Download className="w-[16px] h-[16px]" />} tileClass="bg-teal-600">
                    <RowText title="Export my data" sub="Available on the Machina web app." />
                </RowShell>
            </List>
        );
    }

    return (
        <List>
            <RowShell
                tile={<Download className="w-[16px] h-[16px]" />}
                tileClass="bg-teal-600"
                onClick={busy ? undefined : handleExport}
            >
                <RowText
                    title={busy ? 'Preparing your export…' : 'Export my data'}
                    sub="Download all your cards and collections as JSON + Markdown."
                />
            </RowShell>
        </List>
    );
}
