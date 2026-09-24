import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { batchedUpdate } from '@/lib/collections';
import { retagList, tagMatches } from '@/lib/tags';

export { retagList };

/**
 * Library-wide tag management (Tag Explorer → Rename / Merge / Delete).
 *
 * Tags live on each card (`tags: string[]`), so a rename is a sweep: find
 * every card carrying the tag (or a spelling of it that differs only by case,
 * or a nested child like "Work/Project" under "Work"), rewrite its tags, and
 * commit in ≤450-op batches (batchedUpdate). Renaming onto a tag that already
 * exists IS a merge — duplicates collapse case-insensitively.
 *
 * `variants` are the exact stored spellings to look for (the caller collects
 * them from every card it has loaded: the live window + the search library);
 * the query is `array-contains-any`, capped at 30 values, so it is chunked.
 */

const ANY_LIMIT = 30;

async function sweepTag(uid: string, from: string, to: string | null, variants: string[]): Promise<number> {
    const linksRef = collection(db, 'users', uid, 'links');
    const wanted = Array.from(new Set([from, ...variants].filter((v) => tagMatches(v, from))));
    const updates = new Map<string, string[]>();
    for (let i = 0; i < wanted.length; i += ANY_LIMIT) {
        const snap = await getDocs(query(linksRef, where('tags', 'array-contains-any', wanted.slice(i, i + ANY_LIMIT))));
        snap.docs.forEach((d) => {
            if (updates.has(d.id)) return;
            const tags = Array.isArray(d.data().tags) ? (d.data().tags as string[]) : [];
            const next = retagList(tags, from, to);
            if (next.length !== tags.length || next.some((t, j) => t !== tags[j])) updates.set(d.id, next);
        });
    }
    const ids = Array.from(updates.keys());
    await batchedUpdate(
        ids.map((id) => doc(db, 'users', uid, 'links', id)),
        (batch, ref) => batch.update(ref, { tags: updates.get(ref.id)! }),
    );
    return ids.length;
}

/** Rename (or merge into an existing tag). Returns the number of cards changed. */
export function renameTag(uid: string, from: string, to: string, variants: string[]): Promise<number> {
    return sweepTag(uid, from, to, variants);
}

/** Remove a tag (and its nested children) from every card. */
export function deleteTag(uid: string, tag: string, variants: string[]): Promise<number> {
    return sweepTag(uid, tag, null, variants);
}
