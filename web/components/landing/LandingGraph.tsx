'use client';

import { useEffect, useRef } from 'react';
import { buildGraphModel, GraphModel } from '@/lib/graph';
import { tick, ALPHA_MIN } from '@/lib/graphPhysics';
import { getCategoryColorStyle } from '@/lib/colors';
import { GRAPH_LINKS } from './demoData';
import { prefersReducedMotion } from './hooks';

/**
 * The knowledge graph on the landing page IS the app's graph — not a picture
 * of one.
 *
 * Owner call (2026-08-06 round 5): the first pass drew a hand-placed SVG
 * constellation, and it was rejected for exactly the right reason — a mockup
 * of the product's one uncopyable feature is the weakest possible way to show
 * it. This component instead runs the REAL pipeline on the demo library:
 *
 *   `buildGraphModel` (lib/graph.ts)      — the real edge builder. The demo
 *     links carry `relatedLinks` ties, so edges come from path 1 (stored AI
 *     relations), the same path a fresh real library uses.
 *   `tick` (lib/graphPhysics.ts)          — the real force simulation, with
 *     the same constants, cooling to the same rest.
 *   `getCategoryColorStyle` (lib/colors)  — the real category → color hash, so
 *     "Travel" here is the same hue "Travel" is in the app.
 *
 * The draw pass below is a faithful port of `KnowledgeGraph`'s canvas language
 * — weight-driven edge alpha/width, the offset radial gradient that lights each
 * node's top-left, the hairline ring, screen-space labels with a card-colored
 * stroke halo and greedy overlap culling. What is deliberately NOT ported:
 * cameras, panning, selection, cluster panels, Ask handoff — the interactive
 * chrome that only makes sense with a real library behind it. The camera here
 * just fits the settling constellation and eases as it spreads.
 *
 * So when this assembles on the landing page, the motion, the geometry and the
 * palette are the product's own. If the physics is retuned, this scene retunes
 * with it — which is the point.
 *
 * The canvas is `aria-hidden`; the paragraphs beside it carry the claim.
 */
export default function LandingGraph({ className = '' }: { className?: string }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return;

        let model: GraphModel | null = null;
        let raf = 0;
        let disposed = false;
        const alphaRef = { current: 1 };

        const readVar = (name: string, fallback: string) => {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name);
            return (v || fallback).trim();
        };

        /** "#RRGGBB" / "rgb()" → "rgba()" at alpha (port of the app's helpers). */
        const rgba = (color: string, alpha: number): string => {
            let c = color;
            if (c.startsWith('#')) {
                const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
                const num = parseInt(hex, 16);
                c = `rgb(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255})`;
            }
            const m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : color;
        };

        const draw = () => {
            if (!model) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const w = wrap.clientWidth;
            const h = wrap.clientHeight;
            if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
                canvas.width = w * dpr;
                canvas.height = h * dpr;
            }

            const text = readVar('--text', '#E5E5E5');
            const textSecondary = readVar('--text-secondary', '#A0A0A0');
            const textMuted = readVar('--text-muted', '#666666');
            const card = readVar('--card', '#121212');

            // Fit the whole constellation with padding; the camera is a pure
            // function of the current bounds, so it breathes with the layout
            // instead of chasing it.
            const { nodes, edges } = model;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const n of nodes) {
                minX = Math.min(minX, n.x - n.r);
                minY = Math.min(minY, n.y - n.r);
                maxX = Math.max(maxX, n.x + n.r);
                maxY = Math.max(maxY, n.y + n.r);
            }
            const pad = 44;
            const k = Math.min(
                (w - pad * 2) / Math.max(1, maxX - minX),
                (h - pad * 2) / Math.max(1, maxY - minY),
            );
            const camX = w / 2 - ((minX + maxX) / 2) * k;
            const camY = h / 2 - ((minY + maxY) / 2) * k;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.translate(camX, camY);
            ctx.scale(k, k);

            // A SCREEN-SIZE FLOOR on the ink, not a change to the physics: the
            // app views its graph at camera k≈1, but `spacingScale` deliberately
            // spreads a small library, so fitting eleven nodes into this panel
            // lands around k≈0.6 — at which the app's world-unit radii render as
            // specks and its hairline edges disappear (verified from a rendered
            // frame, not guessed). Dividing by k floors node radius (~9px) and
            // edge weight in SCREEN pixels while the simulation itself stays
            // untouched — geometry and motion are still the real thing.
            const rOf = (r: number) => Math.max(r, 9 / k);

            // Edges first, under the nodes — the app's alpha/width law, lifted
            // to stay visible at this camera distance.
            for (const e of edges) {
                const a = nodes[e.a];
                const b = nodes[e.b];
                const alpha = 0.13 + Math.max(0, Math.min(1, (e.weight - 0.7) / 0.3)) * 0.22;
                ctx.strokeStyle = rgba(textMuted, Math.min(0.55, alpha * 3));
                ctx.lineWidth = Math.max(1.2, 0.7 + Math.max(0, e.weight - 0.8) * 4) / k;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }

            // Nodes: category color, lit from the top-left, hairline ring.
            for (const n of nodes) {
                const color = getCategoryColorStyle(n.category).color;
                const r = rOf(n.r);
                const body = ctx.createRadialGradient(
                    n.x - r * 0.35, n.y - r * 0.35, r * 0.15,
                    n.x, n.y, r,
                );
                body.addColorStop(0, rgba(color, 1));
                body.addColorStop(1, rgba(color, 0.65));
                ctx.fillStyle = body;
                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = rgba(color, 0.4);
                ctx.lineWidth = 1 / k;
                ctx.stroke();
            }

            // Labels in SCREEN space (constant size at any camera), stroked in
            // the card color so they sit on edges without a plate, culled
            // greedily on overlap — all three moves are the app's.
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.lineWidth = 3;
            const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
            const byDegree = [...nodes].sort((a, b) => b.degree - a.degree);
            for (const n of byDegree) {
                const sx = n.x * k + camX;
                const sy = n.y * k + camY + rOf(n.r) * k + 5;
                const tw = ctx.measureText(n.link.title).width;
                const rect = { x1: sx - tw / 2 - 3, y1: sy - 2, x2: sx + tw / 2 + 3, y2: sy + 13 };
                if (rect.x1 < 2 || rect.x2 > w - 2 || rect.y2 > h - 2) continue;
                if (placed.some((r) => rect.x1 < r.x2 && rect.x2 > r.x1 && rect.y1 < r.y2 && rect.y2 > r.y1)) continue;
                placed.push(rect);
                ctx.strokeStyle = rgba(card, 0.7);
                ctx.strokeText(n.link.title, sx, sy);
                ctx.fillStyle = rgba(n.degree >= 3 ? text : textSecondary, 0.95);
                ctx.fillText(n.link.title, sx, sy);
            }
        };

        const loop = () => {
            if (disposed || !model) return;
            // Two ticks per frame: the real Graph view's settle takes longer
            // than a landing visitor will wait, and doubling the ticks halves
            // the wall-clock without changing the rest state it cools to.
            tick(model, alphaRef);
            tick(model, alphaRef);
            draw();
            if (alphaRef.current > ALPHA_MIN) raf = requestAnimationFrame(loop);
        };

        const start = async () => {
            model = await buildGraphModel(GRAPH_LINKS);
            if (disposed || !model) return;

            // Tighten the island ring for this stage. The builder seeds each
            // connected component's gravity anchor on a ring sized for the
            // app's full-screen canvas; in this panel that ring leaves a hollow
            // centre with the islands cramped against the corners. Pulling
            // every anchor 45% toward the centroid — and translating each
            // node's seed with its anchor so islands move as wholes — is a
            // COMPOSITION change only: gravity, repulsion and the springs then
            // run exactly as shipped, from a closer starting grid.
            const cx0 = model.nodes.reduce((s, n) => s + n.cx, 0) / model.nodes.length;
            const cy0 = model.nodes.reduce((s, n) => s + n.cy, 0) / model.nodes.length;
            for (const n of model.nodes) {
                const nx = cx0 + (n.cx - cx0) * 0.55;
                const ny = cy0 + (n.cy - cy0) * 0.55;
                n.x += nx - n.cx;
                n.y += ny - n.cy;
                n.cx = nx;
                n.cy = ny;
            }
            if (prefersReducedMotion()) {
                // Settle synchronously (bounded), show the rest state.
                for (let i = 0; i < 600 && alphaRef.current > ALPHA_MIN; i++) tick(model, alphaRef);
                draw();
                return;
            }
            loop();
        };

        // Assemble when the panel scrolls into view — the settling IS the show,
        // so it should not have already happened off-screen.
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    io.disconnect();
                    void start();
                }
            },
            { rootMargin: '0px 0px -20% 0px' },
        );
        io.observe(wrap);

        // Theme flips repaint the settled canvas (colors are read per draw).
        const mo = new MutationObserver(() => draw());
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        const ro = new ResizeObserver(() => draw());
        ro.observe(wrap);

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            io.disconnect();
            mo.disconnect();
            ro.disconnect();
        };
    }, []);

    return (
        <div ref={wrapRef} aria-hidden className={className}>
            <canvas ref={canvasRef} className="h-full w-full" />
        </div>
    );
}
