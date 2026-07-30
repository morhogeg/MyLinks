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
    /** Index into the model's `clusters` — this node's THEME (a component, or
     *  one community inside a large component). */
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

/**
 * One THEMED group of cards — the unit the user sees captioned on the canvas
 * and opens in the cluster panel. Usually a whole connected component, but a
 * large component is sub-divided into its communities (see `splitIntoThemes`)
 * so a 24-card island reads as "AI safety" / "coding agents" instead of one
 * undifferentiated "TECH". Membership is DISJOINT — every node belongs to
 * exactly one theme, which is what keeps "Save as collection" and "Ask about
 * this" unambiguous.
 */
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
    /** Themed groups, largest component first — parallel to each node's
     *  `cluster`. See GraphCluster: one per component, or one per community
     *  inside a component large enough to hold several distinct themes. */
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

// Below this many nodes the layout gets extra breathing room (see spacingScale).
const SPACIOUS_BELOW = 25;

/**
 * How much to stretch the layout for a given node count. A small graph — a
 * search-filtered view, say 11 cards — used the same spring/repulsion constants
 * as a 200-card library, packed into a knot, and then auto-fit zoomed all the
 * way in, so every label fired at once on top of its neighbours (owner QA).
 * Stretching rest lengths, repulsion and island radii pushes those nodes apart
 * and lets the fit settle wider. Graphs at or above SPACIOUS_BELOW nodes are
 * untouched (factor 1) — big libraries already have their own density problem.
 */
export function spacingScale(nodeCount: number): number {
    if (nodeCount >= SPACIOUS_BELOW) return 1;
    return 1 + ((SPACIOUS_BELOW - nodeCount) / SPACIOUS_BELOW) * 1.1;
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

    // Every component is split into its THEMES (one group for small islands,
    // several communities for a big one) so no island is left captioned with a
    // single generic word. Labels are deduped within a component — two adjacent
    // groups both called "AI" would name nothing.
    const compThemes = comps.map((members) => splitIntoThemes(members, nodes, edges, adjacency));
    // Library-wide concept frequency — the denominator that tells a cluster's
    // SUBJECT apart from its vocabulary (see conceptScores).
    const libraryDf = new Map<string, number>();
    for (const n of nodes) {
        for (const c of conceptSet(n)) libraryDf.set(c, (libraryDf.get(c) ?? 0) + 1);
    }
    const clusters: GraphCluster[] = [];
    for (const groups of compThemes) {
        const taken = new Set<string>();
        for (const g of groups) {
            const label = clusterLabel(g.map((i) => nodes[i]), libraryDf, taken);
            if (label) taken.add(label.toLowerCase());
            clusters.push({ label, nodeIndices: g });
        }
    }
    for (let ci = 0; ci < clusters.length; ci++) {
        for (const i of clusters[ci].nodeIndices) nodes[i].cluster = ci;
    }

    const placedIslands: { x: number; y: number; r: number }[] = [];
    const spacing = spacingScale(nodes.length);
    for (let c = 0; c < comps.length; c++) {
        const members = comps[c];
        const R = (70 + 52 * Math.sqrt(members.length)) * spacing;
        let x = 0;
        let y = 0;
        if (placedIslands.length) {
            // Walk outward on a spiral until this island clears every placed one.
            for (let t = 1; t < 4000; t++) {
                const angle = t * 0.6;
                const dist = (60 + t * 11) * spacing;
                x = Math.cos(angle) * dist;
                y = Math.sin(angle) * dist;
                if (placedIslands.every((p) => Math.hypot(x - p.x, y - p.y) >= p.r + R + 70 * spacing)) break;
            }
        }
        placedIslands.push({ x, y, r: R });
        // A split island gives each theme its own gravity sub-anchor on a ring
        // inside the island, so the communities settle as visibly separate lobes
        // and each caption sits over the cards it actually names. Springs still
        // hold the island together — this only biases where within it a group
        // comes to rest.
        const groups = compThemes[c];
        const sub = groups.length > 1 ? R * 0.42 : 0;
        for (let g = 0; g < groups.length; g++) {
            const a = (g / groups.length) * Math.PI * 2;
            const ax = x + Math.cos(a) * sub;
            const ay = y + Math.sin(a) * sub;
            const seedR = (sub ? R * 0.45 : R) * 0.8;
            for (const i of groups[g]) {
                const n = nodes[i];
                n.cx = ax;
                n.cy = ay;
                // Deterministic in-island seed so the layout is stable across builds.
                const h = idHash(n.id);
                const angle = ((h % 1000) / 1000) * Math.PI * 2;
                const dist = (((h >>> 10) % 1000) / 1000) * seedR;
                n.x = ax + Math.cos(angle) * dist;
                n.y = ay + Math.sin(angle) * dist;
            }
        }
    }

    return {
        nodes,
        edges,
        adjacency,
        clusters,
        isolatedCount: pool.length - nodes.length,
        // What the header counts is what the user can see and tap: themes, not
        // raw components (a split island contributes several).
        clusterCount: clusters.length,
        totalCards: pool.length,
    };
}

// A component at or above this size is a candidate for splitting into themes —
// below it, one island genuinely is one subject and a single caption tells the
// truth. Each surviving community must hold at least MIN_THEME cards, or the
// canvas fills with two-card captions that say nothing.
const SPLIT_ABOVE = 9;
const MIN_THEME = 3;

/**
 * Split one connected component into its themed communities, or return it whole.
 *
 * Weighted label propagation (a cheap Louvain stand-in): every node starts in
 * its own community and repeatedly adopts whichever community its edges pull
 * hardest toward. It converges in a handful of passes, needs no tuning
 * parameter, and — visited in a fixed order with ties broken by lowest label —
 * is fully deterministic, which the seeded layout depends on.
 *
 * Why this exists: connected components alone produce one giant hairball plus a
 * scatter of pairs, so the big island could only ever be captioned with one
 * generic word ("TECH") while actually containing several distinct subjects.
 * Membership stays disjoint — a card sits in exactly one theme.
 */
function splitIntoThemes(
    members: number[],
    nodes: GraphNode[],
    edges: GraphEdge[],
    adjacency: number[][],
): number[][] {
    if (members.length < SPLIT_ABOVE) return [members];

    const inComp = new Set(members);
    const label = new Map<number, number>();
    for (const i of members) label.set(i, i);
    // Fixed visit order (hubs first, then by node index) — no Math.random, so
    // two builds of the same library produce the same themes.
    const order = [...members].sort((a, b) => nodes[b].degree - nodes[a].degree || a - b);

    for (let pass = 0; pass < 12; pass++) {
        let changed = false;
        for (const i of order) {
            const pull = new Map<number, number>();
            for (const ei of adjacency[i]) {
                const e = edges[ei];
                const j = e.a === i ? e.b : e.a;
                if (!inComp.has(j)) continue;
                const l = label.get(j)!;
                pull.set(l, (pull.get(l) ?? 0) + e.weight);
            }
            if (!pull.size) continue;
            let best = label.get(i)!;
            let bestPull = pull.get(best) ?? -1;
            for (const [l, w] of pull) {
                // Ties go to the lowest label — deterministic, and it stops two
                // equally-pulled communities from swapping forever.
                if (w > bestPull || (w === bestPull && l < best)) {
                    best = l;
                    bestPull = w;
                }
            }
            if (best !== label.get(i)) {
                label.set(i, best);
                changed = true;
            }
        }
        if (!changed) break;
    }

    const byLabel = new Map<number, number[]>();
    for (const i of members) {
        const l = label.get(i)!;
        let list = byLabel.get(l);
        if (!list) byLabel.set(l, (list = []));
        list.push(i);
    }
    const groups = [...byLabel.values()].sort((a, b) => b.length - a.length);
    const kept = groups.filter((g) => g.length >= MIN_THEME);
    if (kept.length < 2) return [members];

    // Re-home every node from a below-threshold community into whichever kept
    // group it is most strongly tied to, so a split never silently drops cards.
    const groupOf = new Map<number, number>();
    kept.forEach((g, gi) => g.forEach((i) => groupOf.set(i, gi)));
    for (const g of groups) {
        if (g.length >= MIN_THEME) continue;
        for (const i of g) {
            const pull = new Map<number, number>();
            for (const ei of adjacency[i]) {
                const e = edges[ei];
                const j = e.a === i ? e.b : e.a;
                const gi = groupOf.get(j);
                if (gi === undefined) continue;
                pull.set(gi, (pull.get(gi) ?? 0) + e.weight);
            }
            let best = 0;
            let bestPull = -1;
            for (const [gi, w] of pull) {
                if (w > bestPull || (w === bestPull && gi < best)) {
                    best = gi;
                    bestPull = w;
                }
            }
            kept[best].push(i);
            groupOf.set(i, best);
        }
    }
    return kept.sort((a, b) => b.length - a.length);
}

/** A card's concepts, lowercased and de-duplicated. */
function conceptSet(n: GraphNode): Set<string> {
    return new Set((n.link.concepts ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** Words too common in titles to identify anything. */
const TITLE_STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'at', 'by', 'from',
    'is', 'are', 'was', 'were', 'be', 'how', 'what', 'why', 'when', 'this', 'that', 'these',
    'his', 'her', 'its', 'their', 'you', 'your', 'vs', 'new', 'more', 'about', 'into', 'over',
]);

/** Title words, lowercased — the second, independent evidence of a subject. */
function titleWords(n: GraphNode): Set<string> {
    return new Set(
        (n.link.title ?? '')
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w)),
    );
}

/**
 * Rank a cluster's concepts by how well each one NAMES it, not by how often it
 * appears.
 *
 * Raw frequency was the original rule and it produced captions like
 * "Comparative Analysis · Performance Metrics" over fourteen cards about Lionel
 * Messi (owner QA, 2026-07-30). The reason is that an analysis vocabulary
 * ("comparative analysis", "performance metrics", "case study") gets attached
 * by the model to cards ACROSS the whole library, so inside any one cluster it
 * out-counts the subject — nobody saves ten cards in order to discuss
 * comparative analysis.
 *
 * Three signals, multiplied:
 *  - **coverage** — how much of the cluster carries the concept (as before);
 *  - **distinctiveness** — what share of the concept's LIBRARY-wide appearances
 *    land in this cluster. "Lionel Messi" is nearly exclusive to its cluster
 *    (≈1.0); "Comparative Analysis" is spread everywhere (≈0.2). This is the
 *    signal that fixes the bug, and it needs no hand-maintained stopword list:
 *    a word is generic because the library says so.
 *  - **title echo** — a concept whose words also show up in the members' own
 *    titles is what the cards are literally about, so it gets a boost.
 */
function conceptScores(
    members: GraphNode[],
    libraryDf: Map<string, number>,
): { display: string; count: number; score: number }[] {
    const counts = new Map<string, { display: string; count: number; inTitles: number }>();
    const titles = members.map(titleWords);
    for (let mi = 0; mi < members.length; mi++) {
        for (const c of new Set((members[mi].link.concepts ?? []).map((s) => s.trim()).filter(Boolean))) {
            const key = c.toLowerCase();
            let entry = counts.get(key);
            if (!entry) counts.set(key, (entry = { display: c, count: 0, inTitles: 0 }));
            entry.count++;
        }
    }
    for (const [key, entry] of counts) {
        // A multi-word concept echoes a title when ALL its significant words do
        // ("lionel messi" in "Lionel Messi's Dribbling…").
        const words = key.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w));
        if (!words.length) continue;
        for (const t of titles) if (words.every((w) => t.has(w))) entry.inTitles++;
    }
    const size = members.length;
    return [...counts.entries()]
        .map(([key, e]) => {
            const coverage = e.count / size;
            // Library appearances can never be fewer than this cluster's, so
            // distinctiveness is in (0, 1].
            const distinctiveness = e.count / Math.max(e.count, libraryDf.get(key) ?? e.count);
            const titleEcho = 1 + (e.inTitles / size);
            return { display: e.display, count: e.count, score: coverage * distinctiveness * titleEcho };
        })
        .sort((a, b) => b.score - a.score || b.count - a.count || a.display.localeCompare(b.display));
}

/**
 * Auto-name a cluster from what its cards are actually ABOUT — the best-scoring
 * concept (see conceptScores), plus a second when it genuinely co-defines the
 * theme, falling back to the dominant category and finally to the most common
 * category. The tail of that chain is deliberately loose: EVERY island gets a
 * caption (owner QA — unlabeled pairs looked broken and had no tap target for
 * the cluster panel), and the caption doubles as the cluster's handle, so
 * "roughly right" beats absent. Deterministic, no model call.
 *
 * `taken` holds the labels already used by sibling themes in the SAME
 * component; a candidate that collides is skipped in favour of the next one
 * down the chain, since two lobes of one island both reading "AI" would name
 * neither. When every candidate is taken the first one is used anyway — a
 * duplicate caption still beats a blank island with no tap target.
 */
function clusterLabel(
    members: GraphNode[],
    libraryDf: Map<string, number>,
    taken?: Set<string>,
): string | null {
    if (members.length < 2) return null;
    const ranked = conceptScores(members, libraryDf);
    const floor = Math.max(2, Math.ceil(members.length * 0.25));
    const top = ranked[0];
    const byCategory = new Map<string, number>();
    for (const n of members) byCategory.set(n.category, (byCategory.get(n.category) ?? 0) + 1);
    const [cat, catCount] = [...byCategory.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

    // Ordered candidates; the later ones only come into play when a sibling
    // theme already claimed the obvious name.
    const candidates: string[] = [];
    const pair = (a: string, b: string) => (a.toLowerCase() === b.toLowerCase() ? a : `${a} · ${b}`);
    if (top && top.count >= floor) {
        // The partner must be a real second subject, not the runner-up of a
        // one-subject cluster: it has to clear the coverage floor AND hold its
        // own on score, or the caption dilutes the name that was right.
        const second = ranked.find((r) =>
            r.display.toLowerCase() !== top.display.toLowerCase()
            && r.count >= floor
            && r.score >= top.score * 0.6);
        if (second) candidates.push(pair(top.display, second.display));
        candidates.push(top.display);
    } else {
        if (catCount >= members.length * 0.7) candidates.push(cat);
        if (top) candidates.push(top.display);
        candidates.push(cat);
    }
    for (const r of ranked.slice(1, 5)) {
        if (top) candidates.push(pair(top.display, r.display));
        candidates.push(r.display);
    }
    if (top) candidates.push(pair(top.display, cat));
    candidates.push(cat);

    return candidates.find((c) => !taken?.has(c.toLowerCase())) ?? candidates[0] ?? null;
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
