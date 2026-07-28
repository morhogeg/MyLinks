import { Link } from './types';
import { overlap, toVector, STRONG, SEMANTIC_MIN, SEMANTIC_ASSIST_MIN } from './related';

/**
 * The knowledge-graph model behind the Graph view — nodes are cards, edges are
 * the SAME relations the card detail's "See also" shows, so the two surfaces
 * never disagree about what's connected:
 *
 *  - `ai` edges: the backend's save-time `relatedLinks` (vector search + LLM
 *    verification, with a curated "why" sentence).
 *  - `semantic` / `concept` edges: the live client-side matches lib/related.ts
 *    computes on card open (same thresholds, imported from there), which cover
 *    the snapshot's blind spots — old cards that never learned about newer ones.
 *
 * Building the live edges is O(n²) over 768-dim embeddings, so `buildGraphModel`
 * is async and yields to the event loop between row chunks — the view shows a
 * "mapping" state instead of freezing the main thread.
 */

export interface GraphNode {
    link: Link;
    id: string;
    degree: number;
    /** Render radius (world units) — derived from degree. */
    r: number;
    // Force-simulation state, owned by the view. Seeded by the builder so a
    // category starts near its cluster-mates instead of exploding from (0,0).
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Drag pin — while set, the simulation holds the node here. */
    fx: number | null;
    fy: number | null;
}

export interface GraphEdge {
    /** Endpoint indices into the model's `nodes` array. */
    a: number;
    b: number;
    /** Tie strength in the embedding's cosine range — drives width/alpha/springs. */
    weight: number;
    strong: boolean;
    kind: 'ai' | 'semantic' | 'concept';
}

export interface GraphModel {
    nodes: GraphNode[];
    edges: GraphEdge[];
    /** Adjacency: node index → indices of its edges in `edges`. */
    adjacency: number[][];
    /** Cards with no qualifying tie — counted, not drawn. */
    isolatedCount: number;
    clusterCount: number;
    totalCards: number;
}

/** A cooperative-cancellation token for the chunked build. */
export interface BuildSignal {
    cancelled: boolean;
}

// Above this many cards the O(n²) embedding pass is skipped (AI + concept
// edges still connect the graph); below it the full live pass runs.
const MAX_PAIRWISE = 600;
// Live (computed) edges per node are capped so dense libraries stay legible —
// AI-verified edges are never capped (the backend already limits them per card).
const MAX_LIVE_EDGES_PER_NODE = 5;
// Rows of the pairwise loop per event-loop yield.
const CHUNK_ROWS = 24;

const pairKey = (i: number, j: number) => (i < j ? `${i}|${j}` : `${j}|${i}`);

/** Deterministic per-id jitter so the layout is stable across rebuilds. */
function idHash(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function nodeRadius(degree: number): number {
    return Math.min(16, 5 + 3 * Math.sqrt(degree));
}

export async function buildGraphModel(
    links: Link[],
    signal?: BuildSignal,
): Promise<GraphModel | null> {
    // Only settled cards participate — in-flight/failed captures have no analysis.
    const pool = links.filter((l) => l.status !== 'processing' && l.status !== 'failed');
    const indexById = new Map<string, number>();
    pool.forEach((l, i) => indexById.set(l.id, i));

    type Candidate = { i: number; j: number; weight: number; strong: boolean; kind: GraphEdge['kind'] };
    const kept = new Map<string, Candidate>();

    // 1) Stored AI relations — always kept (both directions collapse to one edge,
    //    strongest similarity wins).
    for (let i = 0; i < pool.length; i++) {
        for (const rel of pool[i].relatedLinks ?? []) {
            const j = indexById.get(rel.id);
            if (j === undefined || j === i) continue;
            const key = pairKey(i, j);
            const weight = Math.max(0.6, Math.min(1, rel.similarity || 0.8));
            const prev = kept.get(key);
            if (!prev || weight > prev.weight) {
                kept.set(key, { i, j, weight, strong: weight > STRONG, kind: 'ai' });
            }
        }
    }

    // 2) Live edges — the related.ts qualification bar, applied pairwise.
    const liveCandidates: Candidate[] = [];
    if (pool.length >= 2 && pool.length <= MAX_PAIRWISE) {
        // Pre-normalize embeddings once so each pair is a plain dot product.
        const vectors: (Float32Array | null)[] = pool.map((l) => {
            const raw = toVector(l.embedding_vector);
            if (!raw) return null;
            let norm = 0;
            for (const v of raw) norm += v * v;
            if (!norm) return null;
            norm = Math.sqrt(norm);
            const out = new Float32Array(raw.length);
            for (let k = 0; k < raw.length; k++) out[k] = raw[k] / norm;
            return out;
        });
        const concepts = pool.map((l) => new Set((l.concepts ?? []).map((c) => c.toLowerCase()).filter(Boolean)));

        for (let i = 0; i < pool.length; i++) {
            if (signal?.cancelled) return null;
            // Yield between chunks so the UI stays responsive during the build.
            if (i % CHUNK_ROWS === 0 && i > 0) await new Promise((r) => setTimeout(r, 0));
            const vi = vectors[i];
            const ci = concepts[i];
            for (let j = i + 1; j < pool.length; j++) {
                if (kept.has(pairKey(i, j))) continue;

                let shared = 0;
                if (ci.size) for (const c of concepts[j]) if (ci.has(c)) shared++;

                const vj = vectors[j];
                let sim = 0;
                if (vi && vj && vi.length === vj.length) {
                    for (let k = 0; k < vi.length; k++) sim += vi[k] * vj[k];
                }

                const semantic = sim >= SEMANTIC_MIN || (sim >= SEMANTIC_ASSIST_MIN && shared >= 1);
                const conceptual = shared >= 2;
                if (!semantic && !conceptual) continue;

                liveCandidates.push({
                    i,
                    j,
                    weight: semantic ? sim : Math.min(0.79, 0.7 + shared * 0.03),
                    strong: sim > STRONG,
                    kind: semantic ? 'semantic' : 'concept',
                });
            }
        }
    } else if (pool.length > MAX_PAIRWISE) {
        // Big-library fallback: concept co-occurrence via an inverted index (the
        // conceptual path of related.ts), skipping the O(n²) embedding pass.
        const byConcept = new Map<string, number[]>();
        pool.forEach((l, i) => {
            for (const c of new Set((l.concepts ?? []).map((s) => s.toLowerCase()).filter(Boolean))) {
                let list = byConcept.get(c);
                if (!list) byConcept.set(c, (list = []));
                list.push(i);
            }
        });
        const sharedCount = new Map<string, number>();
        for (const members of byConcept.values()) {
            if (members.length < 2 || members.length > 30) continue; // broad concepts connect nothing specific
            for (let a = 0; a < members.length; a++) {
                for (let b = a + 1; b < members.length; b++) {
                    const key = pairKey(members[a], members[b]);
                    sharedCount.set(key, (sharedCount.get(key) ?? 0) + 1);
                }
            }
        }
        for (const [key, count] of sharedCount) {
            if (count < 2 || kept.has(key)) continue;
            const [i, j] = key.split('|').map(Number);
            liveCandidates.push({ i, j, weight: Math.min(0.79, 0.7 + count * 0.03), strong: false, kind: 'concept' });
        }
    }
    if (signal?.cancelled) return null;

    // Cap live edges per node, strongest first, so hubs don't become hairballs.
    liveCandidates.sort((a, b) => b.weight - a.weight);
    const liveDegree = new Array<number>(pool.length).fill(0);
    for (const c of liveCandidates) {
        if (liveDegree[c.i] >= MAX_LIVE_EDGES_PER_NODE || liveDegree[c.j] >= MAX_LIVE_EDGES_PER_NODE) continue;
        const key = pairKey(c.i, c.j);
        if (kept.has(key)) continue;
        kept.set(key, c);
        liveDegree[c.i]++;
        liveDegree[c.j]++;
    }

    // 3) Assemble: connected cards become nodes; the rest are counted.
    const degree = new Array<number>(pool.length).fill(0);
    for (const e of kept.values()) {
        degree[e.i]++;
        degree[e.j]++;
    }
    const nodeIndex = new Map<number, number>(); // pool index → node index
    const nodes: GraphNode[] = [];
    const categoryAngle = new Map<string, number>();
    for (let i = 0; i < pool.length; i++) {
        if (!degree[i]) continue;
        const link = pool[i];
        const cat = link.category || 'Other';
        if (!categoryAngle.has(cat)) categoryAngle.set(cat, categoryAngle.size);
        nodeIndex.set(i, nodes.length);
        // Seed near the category's slice of a ring, with deterministic jitter —
        // the simulation then only has to refine, not untangle.
        const slice = categoryAngle.get(cat)!;
        const h = idHash(link.id);
        const angle = (slice / Math.max(1, categoryAngle.size)) * Math.PI * 2 + ((h % 1000) / 1000 - 0.5) * 0.9;
        const dist = 160 + ((h >>> 10) % 1000) / 1000 * 220;
        nodes.push({
            link,
            id: link.id,
            degree: degree[i],
            r: nodeRadius(degree[i]),
            x: Math.cos(angle) * dist,
            y: Math.sin(angle) * dist,
            vx: 0,
            vy: 0,
            fx: null,
            fy: null,
        });
    }
    // Re-space the seeds now that the full category count is known.
    const catCount = Math.max(1, categoryAngle.size);
    for (const n of nodes) {
        const slice = categoryAngle.get(n.link.category || 'Other')!;
        const h = idHash(n.id);
        const angle = (slice / catCount) * Math.PI * 2 + ((h % 1000) / 1000 - 0.5) * (Math.PI * 2 / catCount) * 0.8;
        const dist = 140 + ((h >>> 10) % 1000) / 1000 * 240;
        n.x = Math.cos(angle) * dist;
        n.y = Math.sin(angle) * dist;
    }

    const edges: GraphEdge[] = [];
    const adjacency: number[][] = nodes.map(() => []);
    for (const e of kept.values()) {
        const a = nodeIndex.get(e.i)!;
        const b = nodeIndex.get(e.j)!;
        adjacency[a].push(edges.length);
        adjacency[b].push(edges.length);
        edges.push({ a, b, weight: e.weight, strong: e.strong, kind: e.kind });
    }

    // Cluster count — union-find over the kept nodes.
    const parent = nodes.map((_, i) => i);
    const find = (x: number): number => {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    };
    for (const e of edges) {
        const ra = find(e.a);
        const rb = find(e.b);
        if (ra !== rb) parent[ra] = rb;
    }
    const roots = new Set<number>();
    for (let i = 0; i < nodes.length; i++) roots.add(find(i));

    return {
        nodes,
        edges,
        adjacency,
        isolatedCount: pool.length - nodes.length,
        clusterCount: roots.size,
        totalCards: pool.length,
    };
}

/**
 * The one-sentence "why" for an edge, shown in the selection panel. Prefers the
 * LLM-curated reason either endpoint stored about the other; falls back to the
 * deterministic shared-signal sentence related.ts uses for live matches.
 */
export function edgeReason(selected: Link, neighbor: Link, isRtl: boolean): string | null {
    const stored =
        selected.relatedLinks?.find((r) => r.id === neighbor.id)?.reason
        ?? neighbor.relatedLinks?.find((r) => r.id === selected.id)?.reason;
    if (stored) return stored;
    const sharedConcepts = overlap(selected.concepts, neighbor.concepts);
    if (sharedConcepts.length >= 2) {
        return isRtl
            ? `נוגע גם ב־${sharedConcepts[0]} וגם ב־${sharedConcepts[1]}`
            : `Also explores ${sharedConcepts[0]} and ${sharedConcepts[1]}`;
    }
    if (sharedConcepts.length === 1) {
        return isRtl ? `נוגע גם ב־${sharedConcepts[0]}` : `Also explores ${sharedConcepts[0]}`;
    }
    return isRtl ? 'עוסק בנושא קרוב מאוד' : 'Covers closely related ground';
}
