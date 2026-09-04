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
 * over embeddings, corroborated by shared concepts/tags.
 *
 * Order of the returned list, and the contract the Graph view depends on:
 *  1. This card's OWN stored relations (LLM-verified prose reasons).
 *  2. REVERSE stored relations — cards that stored a pointer AT this one. Blind
 *     spot 1 above is exactly this case, and the graph draws stored relations
 *     from both directions, so omitting them made the graph honestly report
 *     more connections than the card detail listed (owner QA).
 *  3. Live matches, by score, with a deterministic reason built from the shared
 *     signal — no model call, no latency, no cost.
 * Every pass shares one cap (`MAX_RELATED`) and one dedupe/exclusion set.
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

// Gemini embeddings sit on a high cosine floor; the backend badges > 0.85 as a
// strong tie. Alone, a match must clear SEMANTIC_MIN; with a shared concept or
// tag corroborating it, SEMANTIC_ASSIST_MIN is enough. Exported so the
// knowledge-graph view (lib/graph.ts) qualifies edges by the SAME bar — the
// graph must never show a tie this list wouldn't.
export const STRONG = 0.85;
export const SEMANTIC_MIN = 0.8;
export const SEMANTIC_ASSIST_MIN = 0.74;
// Cards the detail view lists per card. Exported because the graph keeps, for
// every node, exactly the live ties that would make this list — so the two
// surfaces show the same connections (owner QA, 2026-09-04: a card listed two
// related cards while its graph node drew one edge).
export const MAX_RELATED = 8;
// A concept-only tie (shared vocabulary, no qualifying embedding match) is only
// trusted when the two cards' embeddings still point roughly the same way. Well
// below SEMANTIC_ASSIST_MIN on purpose: a veto on the clearly unrelated, not a
// second similarity bar.
export const CONCEPT_SIM_FLOOR = 0.55;

/**
 * Concepts too widespread in this library to prove two cards are related.
 *
 * The model attaches broad labels ("Israel", "Economic Policy", "Analysis") to
 * cards across unrelated subjects, so counting them as shared signal chains a
 * Hyundai review into a cluster about pay gaps and enlistment figures (owner
 * QA, 2026-08-07). A concept carried by a large share of the library, or by
 * more than a flat ceiling of cards, is vocabulary, not a tie. ONE definition,
 * used by both the Related list and the graph, so neither can qualify a tie the
 * other rejects.
 */
export function genericConcepts(links: Link[]): Set<string> {
    const df = new Map<string, number>();
    for (const l of links) {
        for (const c of new Set((l.concepts ?? []).map((s) => (s || '').toLowerCase()).filter(Boolean))) {
            df.set(c, (df.get(c) ?? 0) + 1);
        }
    }
    const ceiling = Math.max(4, Math.min(30, Math.ceil(links.length * 0.15)));
    const generic = new Set<string>();
    for (const [c, n] of df) if (n > ceiling) generic.add(c);
    return generic;
}

/**
 * THE qualification bar for a live (computed) tie between two cards, shared by
 * the Related list and the graph. Relatedness must mean "about the same
 * specific thing", NOT "same broad area". Two paths, both requiring a SPECIFIC
 * signal:
 *   - semantic: strong embedding similarity (>= SEMANTIC_MIN, i.e. the same
 *     precise topic), or a softer one (>= SEMANTIC_ASSIST_MIN) backed by a
 *     shared specific concept.
 *   - concept: >= 2 shared specific concepts, and (when both cards have vectors)
 *     embeddings that do not contradict it (>= CONCEPT_SIM_FLOOR).
 * `sharedSpecific` counts shared concepts that are NOT generic in this library
 * (see genericConcepts). Deliberately NOT qualifying: same category, shared
 * broad tags. Returns the tie's kind, or null.
 */
export function qualifyLiveTie(
    sim: number,
    sharedSpecific: number,
    haveVectors: boolean,
): 'semantic' | 'concept' | null {
    if (sim >= SEMANTIC_MIN || (sim >= SEMANTIC_ASSIST_MIN && sharedSpecific >= 1)) return 'semantic';
    if (sharedSpecific >= 2 && (!haveVectors || sim >= CONCEPT_SIM_FLOOR)) return 'concept';
    return null;
}

/**
 * Rank among already-qualified live ties: real similarity first; concept
 * overlap and (weakly) tags / category only break ties. Shared by the Related
 * list and the graph's per-node budget so both keep the same top entries.
 */
export function liveScore(sim: number, sharedConcepts: number, sharedTags: number, sameCategory: boolean): number {
    return (sim > 0 ? sim : 0.5) + sharedConcepts * 0.05 + sharedTags * 0.01 + (sameCategory ? 0.01 : 0);
}

/**
 * Normalize an embedding read from Firestore. The backend has stored the field
 * both as a plain array and as a Firestore Vector — the web SDK surfaces the
 * latter as a VectorValue object whose numbers live behind `.toArray()`.
 */
export function toVector(raw: unknown): number[] | null {
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
export function overlap(a: string[] | undefined, b: string[] | undefined): string[] {
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
export function liveReason(
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

export function getRelatedCards(
    link: Link,
    allLinks: Link[],
    isRtl: boolean,
    // Cards already behind you in the current navigation path (the back-stack).
    // Relatedness is symmetric, so the card you arrived *from* would otherwise
    // top this list — pointless when the Back arrow already returns you there.
    // Excluding them keeps every slot a genuinely new place to go.
    excludeIds?: Iterable<string>,
): RelatedCardEntry[] {
    if (!allLinks?.length) return [];
    const byId = new Map(allLinks.map((l) => [l.id, l]));
    const used = new Set<string>([link.id, ...(excludeIds ?? [])]);
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

    // 2) Reverse stored relations — cards that pointed AT this one when they
    //    were saved. Their reason is phrased from the other card's perspective
    //    but describes the same tie, so it stays honest prose.
    for (const other of allLinks) {
        if (entries.length >= MAX_RELATED) break;
        if (used.has(other.id)) continue;
        if (other.status === 'processing' || other.status === 'failed') continue;
        const rel = other.relatedLinks?.find((r) => r.id === link.id);
        if (!rel) continue;
        used.add(other.id);
        entries.push({
            link: other,
            reason: rel.reason,
            strong: rel.similarity > STRONG,
            sharedConcepts: rel.commonConcepts ?? [],
        });
    }
    if (entries.length >= MAX_RELATED) return entries;

    // 3) Live matches — cards the snapshot can't know about (saved later, or
    //    this card predates the graph entirely). Qualified by the SAME bar and
    //    ranked by the SAME score the graph uses (qualifyLiveTie / liveScore),
    //    with the library's generic concepts discounted the same way.
    const myVec = toVector(link.embedding_vector);
    const generic = genericConcepts(allLinks);
    const candidates: Array<{ entry: RelatedCardEntry; score: number }> = [];
    for (const other of allLinks) {
        if (used.has(other.id)) continue;
        // Skip in-flight / failed captures — nothing meaningful to relate to.
        if (other.status === 'processing' || other.status === 'failed') continue;

        // Only SPECIFIC concepts corroborate a tie (and are worth naming in the
        // reason / chips): a concept the whole library carries says nothing
        // about whether these two cards belong together.
        const sharedConcepts = overlap(link.concepts, other.concepts).filter((c) => !generic.has(c.toLowerCase()));
        const sharedTags = overlap(link.tags, other.tags);
        const sameCategory = !!link.category && link.category === other.category;
        const otherVec = myVec ? toVector(other.embedding_vector) : null;
        const haveVectors = !!(myVec && otherVec && myVec.length === otherVec.length);
        const sim = haveVectors ? cosine(myVec!, otherVec!) : 0;

        if (!qualifyLiveTie(sim, sharedConcepts.length, haveVectors)) continue;

        candidates.push({
            score: liveScore(sim, sharedConcepts.length, sharedTags.length, sameCategory),
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
