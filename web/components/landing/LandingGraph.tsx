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
        const cam = { k: 1, x: 0, y: 0 };
        const drag = { index: -1, pointerId: -1 };

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
            const pad = 36;
            // The camera FREEZES while a finger holds a node — the fit is a
            // function of the bounds, and re-fitting mid-drag slides the whole
            // world under the pointer. It re-engages on release and eases the
            // dragged layout back into frame.
            if (drag.index < 0) {
                cam.k = Math.min(
                    (w - pad * 2) / Math.max(1, maxX - minX),
                    (h - pad * 2) / Math.max(1, maxY - minY),
                );
                cam.x = w / 2 - ((minX + maxX) / 2) * cam.k;
                cam.y = h / 2 - ((minY + maxY) / 2) * cam.k;
            }
            const k = cam.k;
            const camX = cam.x;
            const camY = cam.y;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.translate(camX, camY);
            ctx.scale(k, k);

            // A SCREEN-SIZE FLOOR on the ink, not a change to the physics: the
            // app views its graph at camera k≈1, but `spacingScale` deliberately
            // spreads a small library, so fitting eleven nodes into this panel
            // lands around k≈0.6 — at which the app's world-unit radii render as
            // specks and its hairline edges disappear (verified from a rendered
            // frame, not guessed). Dividing by k floors node radius (~8px) and
            // edge weight in SCREEN pixels while the simulation itself stays
            // untouched — geometry and motion are still the real thing.
            const rOf = (r: number) => Math.max(r, 8 / k);

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
            // the card color so they sit on edges without a plate, placed
            // greedily by degree — the app's moves, plus two the landing scale
            // demands (round 6, from a production frame where labels sat ON
            // neighbouring discs): every candidate rect is ALSO tested against
            // every node's screen circle, and a label that collides below its
            // node retries ABOVE before being dropped. The app can afford
            // label-vs-label tests only because its camera zooms; this one
            // cannot.
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            const discs = nodes.map((n) => ({
                x: n.x * k + camX, y: n.y * k + camY, r: rOf(n.r) * k + 2,
            }));

            // Island captions FIRST — the app's signature: each named cluster
            // gets its theme drawn above it, uppercase, in the secondary ink
            // with the card-colored stroke. The names come from the model
            // itself (`clusterLabel` over the demo links' concepts), so TOKYO /
            // ESPRESSO / COOKING are the pipeline's own naming, not captions
            // typed here. Their rects are claimed before node labels are laid
            // out, same precedence as the app: a cluster's theme outranks a
            // single card's title.
            ctx.textBaseline = 'alphabetic';
            ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
            for (const cluster of model.clusters) {
                if (!cluster.label) continue;
                let sumX = 0;
                let minY = Infinity;
                for (const i of cluster.nodeIndices) {
                    sumX += discs[i].x;
                    minY = Math.min(minY, discs[i].y - discs[i].r);
                }
                const label = cluster.label.toUpperCase();
                const tw = ctx.measureText(label).width;
                const rawX = sumX / cluster.nodeIndices.length;
                const sx = Math.min(Math.max(rawX, tw / 2 + 8), w - tw / 2 - 8);
                const sy = Math.max(minY - 12, 14);
                ctx.strokeStyle = rgba(card, 0.7);
                ctx.strokeText(label, sx, sy);
                ctx.fillStyle = rgba(textSecondary, 0.8);
                ctx.fillText(label, sx, sy);
                placed.push({ x1: sx - tw / 2 - 4, y1: sy - 13, x2: sx + tw / 2 + 4, y2: sy + 3 });
            }

            ctx.textBaseline = 'top';
            ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            const hitsDisc = (r: { x1: number; y1: number; x2: number; y2: number }, skip: number) =>
                discs.some((d, i) => {
                    if (i === skip) return false;
                    const nx = Math.max(r.x1, Math.min(d.x, r.x2));
                    const ny = Math.max(r.y1, Math.min(d.y, r.y2));
                    return (d.x - nx) ** 2 + (d.y - ny) ** 2 < d.r * d.r;
                });
            const order = nodes.map((_, i) => i).sort((a, b) => nodes[b].degree - nodes[a].degree);
            for (const i of order) {
                const n = nodes[i];
                const d = discs[i];
                const tw = ctx.measureText(n.link.title).width;
                // Candidate spots, in preference order: below, above, right,
                // left — a tight island hangs its labels outward instead of
                // dropping them (round 12: the Roman island lost half its
                // labels on a phone-sized panel with below/above alone).
                const spots: { x: number; y: number; align: CanvasTextAlign }[] = [
                    { x: d.x, y: d.y + d.r + 4, align: 'center' },
                    { x: d.x, y: d.y - d.r - 17, align: 'center' },
                    { x: d.x + d.r + 6, y: d.y - 6, align: 'left' },
                    { x: d.x - d.r - 6, y: d.y - 6, align: 'right' },
                ];
                for (const spot of spots) {
                    const x1 = spot.align === 'center' ? spot.x - tw / 2 - 3
                        : spot.align === 'left' ? spot.x - 3 : spot.x - tw - 3;
                    const rect = { x1, y1: spot.y - 2, x2: x1 + tw + 6, y2: spot.y + 13 };
                    if (rect.x1 < 2 || rect.x2 > w - 2 || rect.y1 < 2 || rect.y2 > h - 2) continue;
                    if (placed.some((r) => rect.x1 < r.x2 && rect.x2 > r.x1 && rect.y1 < r.y2 && rect.y2 > r.y1)) continue;
                    if (hitsDisc(rect, i)) continue;
                    placed.push(rect);
                    ctx.textAlign = spot.align;
                    ctx.strokeStyle = rgba(card, 0.7);
                    ctx.strokeText(n.link.title, spot.x, spot.y);
                    ctx.fillStyle = rgba(n.degree >= 3 ? text : textSecondary, 0.95);
                    ctx.fillText(n.link.title, spot.x, spot.y);
                    ctx.textAlign = 'center';
                    break;
                }
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
            if (alphaRef.current > ALPHA_MIN || drag.index >= 0) raf = requestAnimationFrame(loop);
        };

        /** (Re)start the settle loop — used by the drag handlers, which reheat
         *  a cooled layout so the island answers the finger. */
        const ensureLoop = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(loop);
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
                const nx = cx0 + (n.cx - cx0) * 0.75;
                const ny = cy0 + (n.cy - cy0) * 0.75;
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

        // Drag — the app's gesture, on the app's mechanism: while grabbed, the
        // node is PINNED (fx/fy, the same fields KnowledgeGraph's drag sets)
        // and the simulation reheats, so the rest of the island follows on the
        // real springs rather than being translated as pixels. Hit-testing is
        // in screen space with a finger-sized slop.
        const nodeAt = (sx: number, sy: number): number => {
            if (!model) return -1;
            let best = -1;
            let bestD = Infinity;
            for (let i = 0; i < model.nodes.length; i++) {
                const n = model.nodes[i];
                const dx = n.x * cam.k + cam.x - sx;
                const dy = n.y * cam.k + cam.y - sy;
                const rr = Math.max(n.r * cam.k, 8) + 14; // slop
                const d2 = dx * dx + dy * dy;
                if (d2 < rr * rr && d2 < bestD) { best = i; bestD = d2; }
            }
            return best;
        };
        const toWorld = (sx: number, sy: number) =>
            ({ x: (sx - cam.x) / cam.k, y: (sy - cam.y) / cam.k });
        const onPointerDown = (e: PointerEvent) => {
            if (!model || prefersReducedMotion()) return;
            const rect = canvas.getBoundingClientRect();
            const i = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (i < 0) return; // empty canvas: let the page scroll
            drag.index = i;
            drag.pointerId = e.pointerId;
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
            const wpt = toWorld(e.clientX - rect.left, e.clientY - rect.top);
            model.nodes[i].fx = wpt.x;
            model.nodes[i].fy = wpt.y;
            alphaRef.current = Math.max(alphaRef.current, 0.35);
            canvas.style.cursor = 'grabbing';
            ensureLoop();
        };
        const onPointerMove = (e: PointerEvent) => {
            if (!model) return;
            const rect = canvas.getBoundingClientRect();
            if (drag.index >= 0 && e.pointerId === drag.pointerId) {
                const wpt = toWorld(e.clientX - rect.left, e.clientY - rect.top);
                model.nodes[drag.index].fx = wpt.x;
                model.nodes[drag.index].fy = wpt.y;
                alphaRef.current = Math.max(alphaRef.current, 0.25);
                return;
            }
            // Idle affordance (desktop): a grab cursor over any node.
            canvas.style.cursor = nodeAt(e.clientX - rect.left, e.clientY - rect.top) >= 0 ? 'grab' : 'default';
        };
        const endDrag = (e: PointerEvent) => {
            if (!model || drag.index < 0 || e.pointerId !== drag.pointerId) return;
            model.nodes[drag.index].fx = null;
            model.nodes[drag.index].fy = null;
            drag.index = -1;
            drag.pointerId = -1;
            canvas.style.cursor = 'grab';
            // A short re-settle eases the island — and the un-frozen camera —
            // back into a fitted frame.
            alphaRef.current = Math.max(alphaRef.current, 0.2);
            ensureLoop();
        };
        canvas.style.touchAction = 'pan-y';
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);

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
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', endDrag);
            canvas.removeEventListener('pointercancel', endDrag);
        };
    }, []);

    return (
        <div ref={wrapRef} aria-hidden className={className}>
            <canvas ref={canvasRef} className="h-full w-full" />
        </div>
    );
}
