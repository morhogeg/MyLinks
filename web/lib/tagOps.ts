import { collection, getDocs, doc } from 'firebase/firestore';
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
 * The sweep reads the whole library. It used to query `array-contains-any`
 * for the spellings this tab had loaded, so a variant ("ai" next to "AI") or
 * a child ("AI/Agents") that lived only on older cards was never found, and
 * the toast still said the tag was gone (REC-22). A library-wide rename is
 * rare and explicit; one full read is the honest price.
 */

async function sweepTag(uid: string, from: string, to: string | null): Promise<number> {
    const snap = await getDocs(collection(db, 'users', uid, 'links'));
    const updates = new Map<string, string[]>();
    snap.docs.forEach((d) => {
        const tags = Array.isArray(d.data().tags) ? (d.data().tags as string[]) : [];
        if (!tags.some((t) => typeof t === 'string' && tagMatches(t, from))) return;
        const next = retagList(tags, from, to);
        if (next.length !== tags.length || next.some((t, j) => t !== tags[j])) updates.set(d.id, next);
    });
    const ids = Array.from(updates.keys());
    await batchedUpdate(
        ids.map((id) => doc(db, 'users', uid, 'links', id)),
        (batch, ref) => batch.update(ref, { tags: updates.get(ref.id)! }),
    );
    return ids.length;
}

/** Rename (or merge into an existing tag). Returns the number of cards changed. */
export function renameTag(uid: string, from: string, to: string): Promise<number> {
    return sweepTag(uid, from, to);
}

/** Remove a tag (and its nested children) from every card. */
export function deleteTag(uid: string, tag: string): Promise<number> {
    return sweepTag(uid, tag, null);
}
