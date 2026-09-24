import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRelatedCards, relatedSimCandidates, SEMANTIC_ASSIST_MIN } from '../related.ts';
import type { AnchorSims } from '../similarity.ts';
import type { Link } from '../types.ts';

// The Related list must come out IDENTICAL whether similarity is computed from
// the vectors on the cards (the old path, still the fallback) or supplied by
// the server (lib/similarity.ts), which only returns: exact sims for the
// concept-sharing candidates, plus nearest neighbours at >= SEMANTIC_ASSIST_MIN.

function rng(seed: number) {
    return () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };
}

function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / Math.sqrt(na * nb);
}

function library(seed: number): Link[] {
    const r = rng(seed);
    const vocab = ['vacuums', 'llm agents', 'sleep', 'pasta', 'israel', 'tax', 'running', 'jazz'];
    const centers = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => r() * 2 - 1));
    return Array.from({ length: 70 }, (_, i) => {
        const c = centers[i % 4];
        const vec = c.map((x) => x + (r() - 0.5) * 0.9);
        const concepts = vocab.filter(() => r() < 0.25);
        return {
            id: `c${i}`,
            title: `Card ${i}`,
            category: i % 3 ? 'Tech' : 'Life',
            tags: r() < 0.3 ? ['misc'] : [],
            concepts,
            status: i % 17 === 5 ? 'failed' : 'unread',
            embedding_vector: i % 11 === 3 ? undefined : vec,
            relatedLinks: [],
        } as unknown as Link;
    });
}

function serverAnswer(anchor: Link, all: Link[]): AnchorSims {
    const vecOf = (l: Link) => (l.embedding_vector as number[] | undefined) ?? null;
    const a = vecOf(anchor);
    if (!a) return { anchorHasVector: false, sims: new Map(), noVector: new Set() };
    const sims = new Map<string, number>();
    const noVector = new Set<string>();
    for (const id of relatedSimCandidates(anchor, all)) {
        const v = vecOf(all.find((l) => l.id === id)!);
        if (v) sims.set(id, cosine(a, v)); else noVector.add(id);
    }
    const neighbours = all
        .filter((l) => l.id !== anchor.id && vecOf(l))
        .map((l) => ({ id: l.id, s: cosine(a, vecOf(l)!) }))
        .filter((x) => x.s >= SEMANTIC_ASSIST_MIN)
        .sort((x, y) => y.s - x.s)
        .slice(0, 50);
    for (const n of neighbours) if (!sims.has(n.id)) sims.set(n.id, n.s);
    return { anchorHasVector: true, sims, noVector };
}

const shape = (entries: ReturnType<typeof getRelatedCards>) =>
    entries.map((e) => `${e.link.id}|${e.reason}|${e.strong}|${e.sharedConcepts.join(',')}`);

test('server similarities give the same Related list as local vectors', () => {
    for (const seed of [1, 7, 42]) {
        const all = library(seed);
        let nonEmpty = 0;
        for (const anchor of all) {
            const local = getRelatedCards(anchor, all, false);
            const remote = getRelatedCards(anchor, all, false, undefined, serverAnswer(anchor, all));
            assert.deepEqual(shape(remote), shape(local), `seed ${seed} anchor ${anchor.id}`);
            if (local.length) nonEmpty++;
        }
        assert.ok(nonEmpty > 10, 'fixture produces real ties');
    }
});

test('with server sims the card vectors are not consulted', () => {
    const all = library(3).map((l) => ({ ...l, embedding_vector: undefined }) as Link);
    const withVectors = library(3);
    const anchor = withVectors[0];
    const remote = getRelatedCards(all[0], all, false, undefined, serverAnswer(anchor, withVectors));
    const local = getRelatedCards(anchor, withVectors, false);
    assert.deepEqual(shape(remote), shape(local));
});
