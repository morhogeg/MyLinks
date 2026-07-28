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
    /** Canonical category display name — case-variants ("Sports"/"sports")
     *  merged onto the majority spelling so the legend and colors agree. */
    category: string;
    /** Index into the model's `clusters`. */
    cluster: number;
    /** Render radius (world units) — derived from degree. */
    r: number;
    // Force-simulation state, owned by the view. Seeded by the builder so a
    // node starts inside its cluster's island instead of exploding from (0,0).
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** This node's cluster anchor — gravity pulls here, not to a global origin,
     *  so separate connected components render as separate islands. */
    cx: number;
    cy: number;
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

/** One connected component of the graph — an island on screen. */
export interface GraphCluster {
    /** Auto-derived theme ("Claude Code · AI coding") — null when the cluster
     *  is too small or too diffuse to name honestly. */
    label: string | null;
    nodeIndices: number[];
}

export interface GraphModel {
    nodes: GraphNode[];
    edges: GraphEdge[];
    /** Adjacency: node index → indices of its edges in `edges`. */
    adjacency: number[][];
    /** Connected components, largest first — parallel to each node's `cluster`. */
    clusters: GraphCluster[];
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
    // Canonical category display: case-variants of the same category ("Sports"
    // vs "sports") collapse onto the spelling the library uses most, so the
    // legend never shows the same category twice and colors agree.
    const casingCounts = new Map<string, Map<string, number>>();
    for (const l of pool) {
        const raw = (l.category || 'Other').trim() || 'Other';
        const key = raw.toLowerCase();
        let variants = casingCounts.get(key);
        if (!variants) casingCounts.set(key, (variants = new Map()));
        variants.set(raw, (variants.get(raw) ?? 0) + 1);
    }
    const canonicalCategory = new Map<string, string>();
    for (const [key, variants] of casingCounts) {
        let best = '';
        let bestCount = -1;
        for (const [display, count] of variants) {
            if (count > bestCount) {
                best = display;
                bestCount = count;
            }
        }
        canonicalCategory.set(key, best);
    }

    const nodeIndex = new Map<number, number>(); // pool index → node index
    const nodes: GraphNode[] = [];
    for (let i = 0; i < pool.length; i++) {
        if (!degree[i]) continue;
        nodeIndex.set(i, nodes.length);
        const raw = (pool[i].category || 'Other').trim() || 'Other';
        nodes.push({
            link: pool[i],
            id: pool[i].id,
            degree: degree[i],
            category: canonicalCategory.get(raw.toLowerCase()) ?? raw,
            cluster: 0,
            r: nodeRadius(degree[i]),
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            cx: 0,
            cy: 0,
            fx: null,
            fy: null,
        });
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

    // Components → spatial anchors: each connected component gets its own
    // gravity island, packed on a spiral with clearance, so separate clusters
    // render as separate constellations instead of one entangled blob.
    const byRoot = new Map<number, number[]>();
    for (let i = 0; i < nodes.length; i++) {
        const r = find(i);
        let list = byRoot.get(r);
        if (!list) byRoot.set(r, (list = []));
        list.push(i);
    }
    const comps = [...byRoot.values()].sort((a, b) => b.length - a.length);
    const clusters: GraphCluster[] = comps.map((members, ci) => {
        for (const i of members) nodes[i].cluster = ci;
        return { label: clusterLabel(members.map((i) => nodes[i])), nodeIndices: members };
    });
    const placedIslands: { x: number; y: number; r: number }[] = [];
    for (const members of comps) {
        const R = 70 + 52 * Math.sqrt(members.length);
        let x = 0;
        let y = 0;
        if (placedIslands.length) {
            // Walk outward on a spiral until this island clears every placed one.
            for (let t = 1; t < 4000; t++) {
                const angle = t * 0.6;
                const dist = 60 + t * 11;
                x = Math.cos(angle) * dist;
                y = Math.sin(angle) * dist;
                if (placedIslands.every((p) => Math.hypot(x - p.x, y - p.y) >= p.r + R + 70)) break;
            }
        }
        placedIslands.push({ x, y, r: R });
        for (const i of members) {
            const n = nodes[i];
            n.cx = x;
            n.cy = y;
            // Deterministic in-island seed so the layout is stable across builds.
            const h = idHash(n.id);
            const angle = ((h % 1000) / 1000) * Math.PI * 2;
            const dist = (((h >>> 10) % 1000) / 1000) * R * 0.8;
            n.x = x + Math.cos(angle) * dist;
            n.y = y + Math.sin(angle) * dist;
        }
    }

    return {
        nodes,
        edges,
        adjacency,
        clusters,
        isolatedCount: pool.length - nodes.length,
        clusterCount: roots.size,
        totalCards: pool.length,
    };
}

/**
 * Auto-name a cluster from what its cards actually share — the concept with the
 * widest coverage (plus a second when it genuinely co-defines the theme), falling
 * back to the dominant category. Deterministic, no model call; null when the
 * cluster is too small or too diffuse to name honestly.
 */
function clusterLabel(members: GraphNode[]): string | null {
    if (members.length < 3) return null;
    const counts = new Map<string, { display: string; count: number }>();
    for (const n of members) {
        for (const c of new Set((n.link.concepts ?? []).map((s) => s.trim()).filter(Boolean))) {
            const key = c.toLowerCase();
            const entry = counts.get(key);
            if (entry) entry.count++;
            else counts.set(key, { display: c, count: 1 });
        }
    }
    const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
    const floor = Math.max(2, Math.ceil(members.length * 0.25));
    const top = ranked[0];
    if (top && top.count >= floor) {
        const second = ranked[1];
        if (second && second.count >= floor && second.display.toLowerCase() !== top.display.toLowerCase()) {
            return `${top.display} · ${second.display}`;
        }
        return top.display;
    }
    // No concept carries the room — fall back to a dominant category (≥70%).
    const byCategory = new Map<string, number>();
    for (const n of members) byCategory.set(n.category, (byCategory.get(n.category) ?? 0) + 1);
    const [cat, catCount] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    return catCount >= members.length * 0.7 ? cat : null;
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
