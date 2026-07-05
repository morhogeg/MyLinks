import { Link } from './types';

/**
 * Related cards for the open-card view — live, not just the save-time snapshot.
 *
 * Every card stores `relatedLinks` computed by the backend graph service when it
 * was saved (vector search + LLM verification, with a curated "why" sentence).
 * That snapshot has two blind spots this module fills in client-side:
 *
 *  1. It's one-directional in time — a card saved in January never learns about
 *     related cards saved in June (the June card points back, but January's
 *     stored list is frozen).
 *  2. Cards that predate the graph (or whose embedding failed) have nothing.
 *
 * The feed already holds every card's `embedding_vector` and `concepts` in
 * memory, so we can compute fresh matches on open for free: cosine similarity
 * over embeddings, corroborated by shared concepts/tags. Stored AI relations
 * come first (their reasons are LLM-verified prose); live matches fill the
 * remaining slots with a deterministic reason built from the shared signal —
 * no model call, no latency, no cost.
 */

export interface RelatedCardEntry {
    link: Link;
    /** One sentence on how this card relates to the open one. */
    reason: string;
    /** High-confidence tie (backend's "strong" badge threshold). */
    strong: boolean;
    /** Concepts both cards share — rendered as chips. */
    sharedConcepts: string[];
}

const MAX_RELATED = 4;
// Gemini embeddings sit on a high cosine floor; the backend badges > 0.85 as a
// strong tie. Alone, a match must clear SEMANTIC_MIN; with a shared concept or
// tag corroborating it, SEMANTIC_ASSIST_MIN is enough.
const STRONG = 0.85;
const SEMANTIC_MIN = 0.8;
const SEMANTIC_ASSIST_MIN = 0.74;

/**
 * Normalize an embedding read from Firestore. The backend has stored the field
 * both as a plain array and as a Firestore Vector — the web SDK surfaces the
 * latter as a VectorValue object whose numbers live behind `.toArray()`.
 */
function toVector(raw: unknown): number[] | null {
    if (Array.isArray(raw)) return raw.length ? (raw as number[]) : null;
    if (raw && typeof (raw as { toArray?: unknown }).toArray === 'function') {
        const arr = (raw as { toArray: () => number[] }).toArray();
        return arr.length ? arr : null;
    }
    return null;
}

function cosine(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (!na || !nb) return 0;
    return dot / Math.sqrt(na * nb);
}

/** Case-insensitive intersection, preserving the first list's display casing. */
function overlap(a: string[] | undefined, b: string[] | undefined): string[] {
    if (!a?.length || !b?.length) return [];
    const byKey = new Map<string, string>();
    for (const s of a) if (s) byKey.set(s.toLowerCase(), s);
    const out: string[] = [];
    for (const s of b) {
        const key = (s || '').toLowerCase();
        const display = byKey.get(key);
        if (display !== undefined) {
            out.push(display);
            byKey.delete(key);
        }
    }
    return out;
}

/** Deterministic "why related" sentence for a live (non-AI-verified) match. */
function liveReason(
    sharedConcepts: string[],
    sharedTags: string[],
    sameCategory: boolean,
    category: string,
    isRtl: boolean,
): string {
    if (sharedConcepts.length >= 2) {
        return isRtl
            ? `נוגע גם ב־${sharedConcepts[0]} וגם ב־${sharedConcepts[1]}`
            : `Also explores ${sharedConcepts[0]} and ${sharedConcepts[1]}`;
    }
    if (sharedConcepts.length === 1) {
        return isRtl ? `נוגע גם ב־${sharedConcepts[0]}` : `Also explores ${sharedConcepts[0]}`;
    }
    if (sharedTags.length) {
        const tag = sharedTags[0].split('/').pop() || sharedTags[0];
        return isRtl ? `מתויג גם הוא ב־${tag}` : `Shares the “${tag}” tag`;
    }
    if (sameCategory && category) {
        return isRtl ? `עוד מ־${category}` : `More from ${category}`;
    }
    return isRtl ? 'עוסק בנושא קרוב מאוד' : 'Covers closely related ground';
}

export function getRelatedCards(link: Link, allLinks: Link[], isRtl: boolean): RelatedCardEntry[] {
    if (!allLinks?.length) return [];
    const byId = new Map(allLinks.map((l) => [l.id, l]));
    const used = new Set<string>([link.id]);
    const entries: RelatedCardEntry[] = [];

    // 1) Stored AI relations — LLM-verified at save time with a curated reason.
    //    Resolved against the live feed so deleted targets drop out.
    for (const rel of link.relatedLinks ?? []) {
        if (entries.length >= MAX_RELATED) break;
        const target = byId.get(rel.id);
        if (!target || used.has(rel.id)) continue;
        used.add(rel.id);
        entries.push({
            link: target,
            reason: rel.reason,
            strong: rel.similarity > STRONG,
            sharedConcepts: rel.commonConcepts ?? [],
        });
    }
    if (entries.length >= MAX_RELATED) return entries;

    // 2) Live matches — cards the snapshot can't know about (saved later, or
    //    this card predates the graph entirely).
    const myVec = toVector(link.embedding_vector);
    const candidates: Array<{ entry: RelatedCardEntry; score: number }> = [];
    for (const other of allLinks) {
        if (used.has(other.id)) continue;
        // Skip in-flight / failed captures — nothing meaningful to relate to.
        if (other.status === 'processing' || other.status === 'failed') continue;

        const sharedConcepts = overlap(link.concepts, other.concepts);
        const sharedTags = overlap(link.tags, other.tags);
        const sameCategory = !!link.category && link.category === other.category;
        const otherVec = myVec ? toVector(other.embedding_vector) : null;
        const sim = myVec && otherVec ? cosine(myVec, otherVec) : 0;

        // Relatedness must mean "about the same specific thing," NOT "same broad
        // area." Two paths, both requiring a SPECIFIC signal:
        //   • semantic — strong embedding similarity (≥0.80, i.e. same precise
        //     topic), or a softer one (≥0.74) backed by a shared *concept*.
        //   • conceptual — ≥2 shared concepts (concepts are granular:
        //     "sun exposure", "UV radiation" — unlike the broad category tags
        //     HEALTH/SCIENCE that half the library shares).
        // Deliberately NOT qualifying signals: same category, and shared broad
        // tags. Otherwise every Health card would relate to every other — the
        // two sun-exposure cards must stand out from the rest of Health, and
        // only embedding similarity / specific concepts distinguish them.
        const semantic = sim >= SEMANTIC_MIN || (sim >= SEMANTIC_ASSIST_MIN && sharedConcepts.length >= 1);
        const conceptual = sharedConcepts.length >= 2;
        if (!semantic && !conceptual) continue;

        // Rank by real similarity first; concept overlap and (weakly) tags /
        // category only break ties among already-qualified cards.
        const score = (sim > 0 ? sim : 0.5)
            + sharedConcepts.length * 0.05
            + sharedTags.length * 0.01
            + (sameCategory ? 0.01 : 0);

        candidates.push({
            score,
            entry: {
                link: other,
                reason: liveReason(sharedConcepts, sharedTags, sameCategory, link.category, isRtl),
                strong: sim > STRONG,
                sharedConcepts,
            },
        });
    }

    candidates.sort((a, b) => b.score - a.score);
    for (const { entry } of candidates) {
        if (entries.length >= MAX_RELATED) break;
        entries.push(entry);
    }
    return entries;
}
