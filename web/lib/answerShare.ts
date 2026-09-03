import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { callShareApi } from './collections';
import { isHttpUrl } from './url';
import { breakIntoParagraphs, normalizeListMarkers } from './answerLayout';
import { ChatSource, Link } from './types';

/**
 * Sharing an Ask answer as a public, cited page.
 *
 * Publishing writes `shared_answers/{shareId}` through the same Admin-SDK
 * endpoint the card and collection shares use (`/api/publish-share`), so the
 * world-readable snapshot never carries `ownerUid` — for a phone-keyed
 * workspace that value is a phone number, and any client can read a public
 * share doc. The locked ruleset denies client writes to `shared_*` outright.
 * The page itself is server-rendered at /a?id= by the `share_page` function.
 *
 * TWO privacy rules hold here and nowhere else in the app:
 *
 *  1. A card in the PIN-locked privacy vault is never named on a public page.
 *     The vault can be unlocked while Ask is running, so an answer can
 *     legitimately cite a private card — the snapshot drops it. If every cited
 *     card is private there is nothing honest left to publish and the sheet
 *     refuses.
 *  2. A source is listed by its title and its ORIGINAL public URL only. No
 *     card ids go into the snapshot, so a public page can never point back
 *     into someone's library, and a card with no external URL (a note, a
 *     screenshot, another kept answer) is listed by title alone.
 *
 * Both are enforced HERE, on the way into the snapshot, not at render time.
 */

/** One source as it appears on the public page: no id, ever. */
export interface PublicAnswerSource {
    title: string;
    url?: string;
}

export interface ShareableSources {
    /** What may go on the public page, in the answer's citation order. */
    shareable: PublicAnswerSource[];
    /** Cited cards held back because they sit in the privacy vault. */
    withheldPrivate: number;
    /** Cited cards held back because they no longer resolve (deleted, or the
     *  read failed). Counted apart from the vault so the sheet can say which
     *  of the two happened instead of guessing. */
    withheldMissing: number;
}

/** Card types whose `url` is not an external page a reader can open. */
const NO_EXTERNAL_URL = new Set(['image', 'note', 'answer']);

/** A card is off-limits when it is private itself or sits in a private collection. */
function isVaultedCard(card: Pick<Link, 'isPrivate' | 'collectionIds'>, privateCollectionIds: Set<string>): boolean {
    if (card.isPrivate) return true;
    return (card.collectionIds ?? []).some((id) => privateCollectionIds.has(id));
}

/**
 * Decide what of an answer's citations may be published.
 *
 * Resolves each cited card against the loaded feed first, then reads the doc
 * for anything outside that window — a citation can name a card older than the
 * feed's page. A card that cannot be resolved at all is WITHHELD rather than
 * published on its chat-source title: we can't prove it isn't private, and a
 * page is better one source short than one private title long.
 */
export async function resolveShareableSources(
    uid: string,
    sources: ChatSource[],
    links: Link[],
    privateCollectionIds: Set<string>,
): Promise<ShareableSources> {
    const byId = new Map(links.map((l) => [l.id, l]));
    const shareable: PublicAnswerSource[] = [];
    let withheldPrivate = 0;
    let withheldMissing = 0;

    for (const source of sources) {
        let card = byId.get(source.id) ?? null;
        if (!card) {
            try {
                const snap = await getDoc(doc(db, 'users', uid, 'links', source.id));
                card = snap.exists() ? ({ id: snap.id, ...snap.data() } as Link) : null;
            } catch {
                card = null;
            }
        }
        if (!card) { withheldMissing += 1; continue; }
        if (isVaultedCard(card, privateCollectionIds)) { withheldPrivate += 1; continue; }
        const title = (card.title || source.title || '').trim();
        if (!title) { withheldMissing += 1; continue; }
        const url = NO_EXTERNAL_URL.has(card.sourceType ?? '') ? '' : (card.url || source.url || '');
        shareable.push(isHttpUrl(url) ? { title, url } : { title });
    }

    return { shareable, withheldPrivate, withheldMissing };
}

export interface PublishAnswerInput {
    shareId: string;
    question: string;
    /** The answer markdown, exactly as the chat rendered it. */
    answer: string;
    sources: PublicAnswerSource[];
    /** True when the app flagged the answer as untied to any save. */
    ungrounded?: boolean;
}

/** Publish (or re-publish) an answer as a public page. Returns the shareId.
 *
 *  The answer is published through the SAME two deterministic, text-preserving
 *  repairs the chat renders with (lib/answerLayout), so the public page reads
 *  like the answer the sharer saw rather than a rawer version of it. The server
 *  then rebuilds the snapshot from an allowlist (share_service.py
 *  `_sanitize_answer_payload`), which is where the no-ids guarantee actually
 *  holds even if a future client forgets it. */
export async function publishAnswer(uid: string, input: PublishAnswerInput): Promise<string> {
    await callShareApi('/api/publish-share', {
        uid,
        type: 'answer',
        shareId: input.shareId,
        payload: {
            question: input.question,
            answer: breakIntoParagraphs(normalizeListMarkers(input.answer)),
            sources: input.sources,
            ...(input.ungrounded ? { ungrounded: true } : {}),
        },
    });
    return input.shareId;
}

/** Take a published answer down. The URL stops resolving immediately. */
export async function unpublishAnswer(uid: string, shareId: string): Promise<void> {
    await callShareApi('/api/unpublish-share', { uid, type: 'answer', shareId });
}
