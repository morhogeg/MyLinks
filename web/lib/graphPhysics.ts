import { GraphModel, spacingScale } from './graph';

/**
 * The Graph view's force simulation — one tick of it.
 *
 * Extracted from KnowledgeGraph so the physics can be exercised WITHOUT a
 * browser: it is pure arithmetic over a GraphModel, and its stability is the
 * difference between "the constellation assembles" and the frames of visible
 * jitter the owner reported (2026-08-01). See lib/__checks__ notes in §9.
 *
 * O(n²) repulsion + edge springs + weak per-island gravity, cooling to rest.
 */

// ── Simulation constants ─────────────────────────────────────────────────────
const REPULSION = 4200;        // many-body charge (world units²)
const REPULSION_MAX_DIST = 480;
const GRAVITY = 0.05;          // pull toward the node's ISLAND anchor (per component)
const VELOCITY_DECAY = 0.8;
const ALPHA_DECAY = 0.99;
export const ALPHA_MIN = 0.015;

/**
 * Ceiling on how far a node may travel in ONE tick (world units, scaled with
 * the layout's spacing).
 *
 * WHY THIS EXISTS: repulsion is an inverse-square law, so two nodes that happen
 * to seed almost on top of each other produce an impulse that scales as 1/d² —
 * unbounded. A single such pair used to fling nodes clear across the canvas and
 * back on consecutive frames, which is what read as "major jitter" for the
 * first seconds. Both ends are now bounded: the force gets a distance floor
 * (below) and the resulting motion gets this speed limit. Convergence is
 * unaffected — the layout still reaches the same rest state, it just walks
 * there instead of teleporting.
 */
const MAX_STEP = 16;

export function tick(model: GraphModel, alphaRef: { current: number }) {
    const alpha = alphaRef.current;
    const { nodes, edges } = model;
    const n = nodes.length;
    // Small graphs spread out (see lib/graph.ts spacingScale) — the same factor
    // the builder used for island radii, so seeds and forces agree.
    const spacing = spacingScale(n);
    const repulsion = REPULSION * spacing * spacing;
    const repulsionMax = REPULSION_MAX_DIST * spacing;

    // Many-body repulsion + collision, one O(n²) pass.
    for (let i = 0; i < n; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < n; j++) {
            const b = nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 === 0) {
                dx = (Math.random() - 0.5) * 0.1;
                dy = (Math.random() - 0.5) * 0.1;
                d2 = dx * dx + dy * dy;
            }
            if (d2 > repulsionMax * repulsionMax) continue;
            const d = Math.sqrt(d2);
            const minDist = a.r + b.r + 6;
            // DISTANCE FLOOR on the inverse-square term. Two nodes seeded close
            // together otherwise generate an impulse with no upper bound (1/d²
            // as d→0), which is what threw nodes across the canvas on the first
            // frames. Below "touching" the repulsion stops growing; the
            // hard-core collision term underneath is what separates them, and
            // it grows only linearly.
            const dRep2 = Math.max(d2, minDist * minDist);
            let f = (repulsion * alpha) / dRep2;
            // Hard-core collision: overlapping nodes push apart decisively.
            if (d < minDist) f += ((minDist - d) / minDist) * 2.5;
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
        }
    }

    // Edge springs — stronger ties pull shorter.
    for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const strength = 0.35 + Math.max(0, Math.min(1, (e.weight - 0.7) / 0.3)) * 0.5;
        const rest = a.r + b.r + (65 + (1 - strength) * 130) * spacing;
        const f = ((d - rest) / d) * 0.08 * strength * alpha * 8;
        const fx = dx * f;
        const fy = dy * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
    }

    // Weak centering gravity + integration.
    for (const node of nodes) {
        if (node.fx !== null && node.fy !== null) {
            node.x = node.fx;
            node.y = node.fy;
            node.vx = 0;
            node.vy = 0;
            continue;
        }
        node.vx += (node.cx - node.x) * GRAVITY * alpha;
        node.vy += (node.cy - node.y) * GRAVITY * alpha;
        node.vx *= VELOCITY_DECAY;
        node.vy *= VELOCITY_DECAY;
        // Speed limit (see MAX_STEP): the layout may converge fast, but it may
        // not teleport. Direction is preserved, only the magnitude is capped,
        // so the settle keeps its shape and simply stops flickering.
        const step = Math.hypot(node.vx, node.vy);
        const cap = MAX_STEP * spacing;
        if (step > cap) {
            const scale = cap / step;
            node.vx *= scale;
            node.vy *= scale;
        }
        node.x += node.vx;
        node.y += node.vy;
    }

    alphaRef.current = Math.max(0, alpha * ALPHA_DECAY - 0.0001);
}
