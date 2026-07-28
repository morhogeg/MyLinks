'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Waypoints, X } from 'lucide-react';
import { Link } from '@/lib/types';
import { buildGraphModel, edgeReason, GraphModel, BuildSignal } from '@/lib/graph';
import { getCategoryColorStyle } from '@/lib/colors';
import { getDominantDirection } from '@/lib/rtl';
import { hapticLight } from '@/lib/haptics';

/**
 * The Graph view — the library as a living constellation. Every card the
 * knowledge graph has connected is a node (colored by category, sized by how
 * connected it is); every edge is a relation the card detail's "See also"
 * would show (same data, same thresholds — see lib/graph.ts).
 *
 * Rendering is a single 2D canvas driven by a custom force simulation (no
 * graph library): O(n²) repulsion + edge springs + weak centering gravity,
 * cooling to rest. That's deliberate — the view must run inside the Capacitor
 * WKWebView, where a plain canvas is the one dependable fast path.
 *
 * Interaction model:
 *  - tap/click a node → ego focus: its neighborhood lights up, everything else
 *    recedes, and a panel explains each connection (the stored LLM "why" when
 *    one exists). Tapping a neighbor walks the graph; "Open card" opens the
 *    real card detail.
 *  - drag a node to tug the layout; drag the background to pan; wheel/pinch to
 *    zoom; double-tap or the ⤢ button to re-fit.
 * The camera auto-frames the graph while it settles, and stops the moment the
 * user takes over.
 */

interface Palette {
    bg: string;
    card: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    accentRing: string;
}

interface Camera {
    k: number;
    x: number;
    y: number;
}

/** Parse "rgb(r, g, b)" / "rgba(…)" into an rgba() string at the given alpha. */
function rgba(color: string, alpha: number): string {
    const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return color;
    return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

function readPalette(): Palette {
    const s = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => (s.getPropertyValue(name) || fallback).trim();
    return {
        bg: v('--background', '#050505'),
        card: v('--card', '#121212'),
        text: v('--text', '#E5E5E5'),
        textSecondary: v('--text-secondary', '#A0A0A0'),
        textMuted: v('--text-muted', '#666666'),
        accentRing: v('--accent-ring', 'rgba(174, 184, 206, 0.34)'),
    };
}

// ── Simulation constants ─────────────────────────────────────────────────────
const REPULSION = 3200;        // many-body charge (world units²)
const REPULSION_MAX_DIST = 480;
const GRAVITY = 0.018;         // pull toward the centroid, scaled by alpha
const VELOCITY_DECAY = 0.8;
const ALPHA_DECAY = 0.99;
const ALPHA_MIN = 0.015;
const TAP_SLOP = 7;            // px of movement that still counts as a tap

export default function KnowledgeGraph({
    links,
    loading,
    filtered,
    onOpenCard,
}: {
    /** The card pool (already privacy-filtered by the Feed). */
    links: Link[];
    /** True while the full-library fetch is still in flight. */
    loading: boolean;
    /** True when grid filters/search currently scope the pool. */
    filtered: boolean;
    onOpenCard: (link: Link) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [model, setModel] = useState<GraphModel | null>(null);
    const [building, setBuilding] = useState(true);
    const [selected, setSelected] = useState<number | null>(null);
    const [categoryFocus, setCategoryFocus] = useState<string | null>(null);
    // Bumped by the MutationObserver when the .light class flips — palette and
    // canvas colors re-derive from the live CSS tokens.
    const [themeNonce, setThemeNonce] = useState(0);

    // Mutable render/sim state the rAF loop reads without re-rendering React.
    const camRef = useRef<Camera>({ k: 0.8, x: 0, y: 0 });
    const alphaRef = useRef(1);
    const autoFitRef = useRef(true);
    const drawPendingRef = useRef(true);
    const hoverRef = useRef<number | null>(null);
    const paletteRef = useRef<Palette | null>(null);
    const selectedRef = useRef<number | null>(null);
    const focusRef = useRef<string | null>(null);
    const reducedMotionRef = useRef(false);
    selectedRef.current = selected;
    focusRef.current = categoryFocus;

    // ── Build the model (chunked; cancelled when the pool changes) ───────────
    useEffect(() => {
        const signal: BuildSignal = { cancelled: false };
        setBuilding(true);
        setSelected(null);
        buildGraphModel(links, signal).then((m) => {
            if (signal.cancelled || !m) return;
            alphaRef.current = 1;
            autoFitRef.current = true;
            if (reducedMotionRef.current) {
                // Settle the layout up front so nothing animates.
                for (let t = 0; t < 300 && alphaRef.current > ALPHA_MIN; t++) tick(m, alphaRef);
            }
            setModel(m);
            setBuilding(false);
            drawPendingRef.current = true;
        });
        return () => {
            signal.cancelled = true;
        };
    }, [links]);

    // ── Theme + reduced motion ───────────────────────────────────────────────
    useEffect(() => {
        paletteRef.current = readPalette();
        drawPendingRef.current = true;
    }, [themeNonce]);
    useEffect(() => {
        const observer = new MutationObserver(() => setThemeNonce((n) => n + 1));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        reducedMotionRef.current = mq.matches;
        const onMq = () => { reducedMotionRef.current = mq.matches; };
        mq.addEventListener('change', onMq);
        return () => {
            observer.disconnect();
            mq.removeEventListener('change', onMq);
        };
    }, []);

    // ── Canvas sizing (DPR-aware) ────────────────────────────────────────────
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;
        const resize = () => {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const { width, height } = container.getBoundingClientRect();
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            drawPendingRef.current = true;
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    // Selection changes re-light the canvas and give the sim a nudge redraw.
    useEffect(() => {
        drawPendingRef.current = true;
    }, [selected, categoryFocus, model]);

    // ── The rAF loop: physics + draw ─────────────────────────────────────────
    useEffect(() => {
        if (!model) return;
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            const canvas = canvasRef.current;
            if (!canvas || !canvas.width) return;
            const simActive = alphaRef.current > ALPHA_MIN;
            if (simActive) tick(model, alphaRef);
            if (autoFitRef.current) {
                const target = fitCamera(model, canvas);
                if (target) {
                    const cam = camRef.current;
                    const ease = reducedMotionRef.current ? 1 : 0.08;
                    cam.k += (target.k - cam.k) * ease;
                    cam.x += (target.x - cam.x) * ease;
                    cam.y += (target.y - cam.y) * ease;
                    drawPendingRef.current = true;
                }
            }
            if (simActive || drawPendingRef.current) {
                drawPendingRef.current = false;
                draw(canvas, model, camRef.current, paletteRef.current ?? readPalette(), {
                    selected: selectedRef.current,
                    hover: hoverRef.current,
                    categoryFocus: focusRef.current,
                });
            }
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [model]);

    // ── Pointer interaction ──────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const pointers = new Map<number, { x: number; y: number }>();
        let mode: 'idle' | 'node' | 'pan' | 'pinch' = 'idle';
        let dragNode = -1;
        let moved = 0;
        let last = { x: 0, y: 0 };
        let pinchDist = 0;

        const toLocal = (e: PointerEvent | WheelEvent) => {
            const rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };
        const toWorld = (p: { x: number; y: number }) => {
            const cam = camRef.current;
            return { x: (p.x - cam.x) / cam.k, y: (p.y - cam.y) / cam.k };
        };
        const hitTest = (p: { x: number; y: number }): number => {
            const m = modelRef.current;
            if (!m) return -1;
            const w = toWorld(p);
            const cam = camRef.current;
            let best = -1;
            let bestDist = Infinity;
            for (let i = 0; i < m.nodes.length; i++) {
                const n = m.nodes[i];
                const dx = n.x - w.x;
                const dy = n.y - w.y;
                const reach = n.r + 6 / cam.k; // a touch-friendly halo
                const d2 = dx * dx + dy * dy;
                if (d2 < reach * reach && d2 < bestDist) {
                    best = i;
                    bestDist = d2;
                }
            }
            return best;
        };

        const onPointerDown = (e: PointerEvent) => {
            canvas.setPointerCapture(e.pointerId);
            const p = toLocal(e);
            pointers.set(e.pointerId, p);
            autoFitRef.current = false;
            if (pointers.size === 2) {
                mode = 'pinch';
                const [a, b] = [...pointers.values()];
                pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
                if (dragNode >= 0 && modelRef.current) {
                    const n = modelRef.current.nodes[dragNode];
                    n.fx = null;
                    n.fy = null;
                    dragNode = -1;
                }
                return;
            }
            moved = 0;
            last = p;
            const hit = hitTest(p);
            if (hit >= 0) {
                mode = 'node';
                dragNode = hit;
            } else {
                mode = 'pan';
            }
        };

        const onPointerMove = (e: PointerEvent) => {
            const p = toLocal(e);
            if (!pointers.has(e.pointerId)) {
                // Pure hover (desktop): highlight + cursor.
                const hit = hitTest(p);
                if (hit !== hoverRef.current) {
                    hoverRef.current = hit >= 0 ? hit : null;
                    drawPendingRef.current = true;
                }
                canvas.style.cursor = hit >= 0 ? 'pointer' : 'grab';
                return;
            }
            const prev = pointers.get(e.pointerId)!;
            pointers.set(e.pointerId, p);
            const cam = camRef.current;

            if (mode === 'pinch' && pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                if (pinchDist > 0) {
                    const factor = dist / pinchDist;
                    const k = Math.min(3.5, Math.max(0.12, cam.k * factor));
                    cam.x = mid.x - ((mid.x - cam.x) / cam.k) * k;
                    cam.y = mid.y - ((mid.y - cam.y) / cam.k) * k;
                    cam.k = k;
                }
                pinchDist = dist;
                drawPendingRef.current = true;
                return;
            }
            moved += Math.hypot(p.x - last.x, p.y - last.y);
            last = p;
            if (mode === 'node' && dragNode >= 0 && modelRef.current) {
                const n = modelRef.current.nodes[dragNode];
                const w = toWorld(p);
                n.fx = w.x;
                n.fy = w.y;
                alphaRef.current = Math.max(alphaRef.current, 0.3);
                drawPendingRef.current = true;
            } else if (mode === 'pan') {
                cam.x += p.x - prev.x;
                cam.y += p.y - prev.y;
                canvas.style.cursor = 'grabbing';
                drawPendingRef.current = true;
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            pointers.delete(e.pointerId);
            if (mode === 'node' && dragNode >= 0 && modelRef.current) {
                const n = modelRef.current.nodes[dragNode];
                n.fx = null;
                n.fy = null;
                if (moved < TAP_SLOP) {
                    hapticLight();
                    setSelected((cur) => (cur === dragNode ? null : dragNode));
                }
                dragNode = -1;
            } else if (mode === 'pan' && moved < TAP_SLOP) {
                setSelected(null);
            }
            if (pointers.size === 0) mode = 'idle';
            else if (pointers.size === 1) mode = 'pan';
            canvas.style.cursor = 'grab';
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            autoFitRef.current = false;
            const cam = camRef.current;
            const p = toLocal(e);
            const factor = Math.exp(-e.deltaY * 0.0016);
            const k = Math.min(3.5, Math.max(0.12, cam.k * factor));
            cam.x = p.x - ((p.x - cam.x) / cam.k) * k;
            cam.y = p.y - ((p.y - cam.y) / cam.k) * k;
            cam.k = k;
            drawPendingRef.current = true;
        };

        const onDoubleClick = () => {
            autoFitRef.current = true;
        };

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('dblclick', onDoubleClick);
        return () => {
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('dblclick', onDoubleClick);
        };
    }, []);

    // The pointer handlers live outside React's render cycle, so they read the
    // model through a ref that tracks the latest build.
    const modelRef = useRef<GraphModel | null>(null);
    modelRef.current = model;

    // ── Selection panel data ─────────────────────────────────────────────────
    const selection = useMemo(() => {
        if (!model || selected === null || !model.nodes[selected]) return null;
        const node = model.nodes[selected];
        const isRtl = getDominantDirection(node.link.title) === 'rtl';
        const neighbors = model.adjacency[selected]
            .map((ei) => {
                const e = model.edges[ei];
                const other = model.nodes[e.a === selected ? e.b : e.a];
                return {
                    index: e.a === selected ? e.b : e.a,
                    link: other.link,
                    weight: e.weight,
                    strong: e.strong,
                    reason: edgeReason(node.link, other.link, isRtl),
                };
            })
            .sort((a, b) => b.weight - a.weight);
        return { node, neighbors };
    }, [model, selected]);

    // ── Legend (top categories among connected nodes) ────────────────────────
    const legend = useMemo(() => {
        if (!model) return [];
        const counts = new Map<string, number>();
        for (const n of model.nodes) {
            const cat = n.link.category || 'Other';
            counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([category, count]) => ({ category, count, color: getCategoryColorStyle(category).color }));
    }, [model]);

    const refit = useCallback(() => {
        autoFitRef.current = true;
    }, []);

    const selectNeighbor = useCallback((index: number) => {
        hapticLight();
        setSelected(index);
    }, []);

    const showEmpty = !building && !loading && model && model.nodes.length < 2;
    const showLoading = loading || building;

    return (
        <div className="space-y-3 animate-fade-in">
            {/* Stats + legend header */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-0.5">
                <div className="text-[13px] font-medium text-text-secondary tabular-nums">
                    {model && !showLoading ? (
                        <>
                            <span className="whitespace-nowrap">{model.nodes.length} connected {model.nodes.length === 1 ? 'card' : 'cards'}</span>
                            <span className="text-text-muted"> · </span>
                            <span className="whitespace-nowrap">{model.edges.length} {model.edges.length === 1 ? 'connection' : 'connections'}</span>
                            {model.clusterCount > 1 && (
                                <>
                                    <span className="text-text-muted"> · </span>
                                    <span className="whitespace-nowrap">{model.clusterCount} clusters</span>
                                </>
                            )}
                            {model.isolatedCount > 0 && (
                                <span className="text-text-muted"> · <span className="whitespace-nowrap">{model.isolatedCount} not yet connected</span></span>
                            )}
                            {filtered && <span className="text-accent"> · filtered</span>}
                        </>
                    ) : (
                        <span className="text-text-muted">Mapping your knowledge…</span>
                    )}
                </div>
                <div className="hidden sm:block flex-1" />
                <div className="hidden sm:block text-[12px] text-text-muted">
                    Tap a card to explore · drag to pan · scroll to zoom
                </div>
            </div>
            {legend.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {legend.map(({ category, count, color }) => {
                        const active = categoryFocus === category;
                        return (
                            <button
                                key={category}
                                onClick={() => setCategoryFocus(active ? null : category)}
                                aria-pressed={active}
                                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] font-medium transition-colors cursor-pointer ${active
                                    ? 'bg-fill-strong border-border-strong text-text'
                                    : 'bg-card border-border-subtle text-text-secondary hover:text-text hover:bg-card-hover'
                                    }`}
                            >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                {category}
                                <span className="text-text-muted tabular-nums">{count}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* The constellation */}
            <div
                ref={containerRef}
                className="relative overflow-hidden rounded-2xl border border-border-subtle h-[calc(100dvh-330px)] min-h-[380px] sm:h-[calc(100dvh-290px)] sm:min-h-[460px]"
                style={{ background: 'radial-gradient(120% 100% at 50% 38%, var(--card), var(--background) 88%)' }}
            >
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 touch-none"
                    role="img"
                    aria-label="Knowledge graph of your saved cards and their connections"
                />

                {/* Re-fit control */}
                {model && !showLoading && !showEmpty && (
                    <button
                        onClick={refit}
                        title="Fit graph to view"
                        aria-label="Fit graph to view"
                        className="absolute bottom-3 end-3 w-9 h-9 rounded-full bg-card/90 backdrop-blur border border-border-subtle text-text-secondary hover:text-text hover:bg-card-hover flex items-center justify-center shadow-sm transition-colors cursor-pointer"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                )}

                {/* Mapping / loading state */}
                {showLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted">
                        <Waypoints className="w-8 h-8 animate-pulse" />
                        <p className="text-sm font-medium">Mapping your knowledge…</p>
                    </div>
                )}

                {/* Empty state — too few connections to draw anything meaningful */}
                {showEmpty && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
                        <Waypoints className="w-9 h-9 text-text-muted" />
                        <p className="text-[15px] font-semibold text-text">No connections to show yet</p>
                        <p className="text-[13px] text-text-secondary max-w-[340px] leading-relaxed">
                            Machina links related cards automatically as you save. Once a few cards
                            share ground, your graph appears here on its own.
                        </p>
                        {model && model.isolatedCount > 0 && (
                            <p className="text-[12px] text-text-muted">
                                {model.isolatedCount} {model.isolatedCount === 1 ? 'card is' : 'cards are'} waiting for a first connection.
                            </p>
                        )}
                    </div>
                )}

                {/* Selection panel — the "why" behind the highlighted neighborhood. */}
                {selection && (
                    <div className="absolute inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-auto sm:top-3 sm:end-3 sm:w-[330px] max-h-[46%] sm:max-h-[calc(100%-24px)] flex flex-col rounded-2xl bg-card/95 backdrop-blur-xl border border-border-subtle shadow-[var(--shadow-card)] animate-fade-in">
                        <div className="flex items-start gap-2.5 p-3.5 pb-2.5">
                            <span
                                className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: getCategoryColorStyle(selection.node.link.category || 'Other').color }}
                            />
                            <div className="flex-1 min-w-0">
                                <h3 dir="auto" className="text-[14px] font-semibold text-text leading-snug line-clamp-2">
                                    {selection.node.link.title}
                                </h3>
                                <p className="mt-0.5 text-[11px] font-medium text-text-muted uppercase tracking-wide">
                                    {selection.node.link.category || 'Other'}
                                    <span className="normal-case tracking-normal"> · {selection.neighbors.length} {selection.neighbors.length === 1 ? 'connection' : 'connections'}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => setSelected(null)}
                                aria-label="Close card details"
                                className="p-1 -m-1 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-1 space-y-0.5">
                            {selection.neighbors.map((nb) => (
                                <button
                                    key={nb.link.id}
                                    onClick={() => selectNeighbor(nb.index)}
                                    className="w-full text-start px-1.5 py-2 rounded-xl hover:bg-card-hover transition-colors cursor-pointer"
                                >
                                    <span className="flex items-center gap-2">
                                        <span
                                            className="w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{ backgroundColor: getCategoryColorStyle(nb.link.category || 'Other').color }}
                                        />
                                        <span dir="auto" className="flex-1 min-w-0 text-[13px] font-medium text-text truncate">
                                            {nb.link.title}
                                        </span>
                                        {nb.strong && (
                                            <span className="text-[10px] font-semibold text-accent bg-fill-subtle border border-border-subtle rounded-full px-1.5 py-px shrink-0">
                                                strong
                                            </span>
                                        )}
                                    </span>
                                    {nb.reason && (
                                        <span dir="auto" className="block ms-3.5 mt-0.5 text-[12px] text-text-secondary leading-snug line-clamp-2">
                                            {nb.reason}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="p-2.5 pt-1.5">
                            <button
                                onClick={() => onOpenCard(selection.node.link)}
                                className="w-full h-9 rounded-full bg-accent text-accent-ink text-[13px] font-bold hover:bg-accent-hover active:scale-[0.98] transition-all cursor-pointer"
                            >
                                Open card
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Physics ──────────────────────────────────────────────────────────────────

function tick(model: GraphModel, alphaRef: { current: number }) {
    const alpha = alphaRef.current;
    const { nodes, edges } = model;
    const n = nodes.length;

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
            if (d2 > REPULSION_MAX_DIST * REPULSION_MAX_DIST) continue;
            const d = Math.sqrt(d2);
            let f = (REPULSION * alpha) / d2;
            // Hard-core collision: overlapping nodes push apart decisively.
            const minDist = a.r + b.r + 6;
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
        const rest = a.r + b.r + 55 + (1 - strength) * 110;
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
        node.vx += -node.x * GRAVITY * alpha;
        node.vy += -node.y * GRAVITY * alpha;
        node.vx *= VELOCITY_DECAY;
        node.vy *= VELOCITY_DECAY;
        node.x += node.vx;
        node.y += node.vy;
    }

    alphaRef.current = Math.max(0, alpha * ALPHA_DECAY - 0.0001);
}

/** Camera that frames the whole graph with padding, clamped to sane zooms. */
function fitCamera(model: GraphModel, canvas: HTMLCanvasElement): Camera | null {
    if (!model.nodes.length) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of model.nodes) {
        minX = Math.min(minX, n.x - n.r);
        minY = Math.min(minY, n.y - n.r);
        maxX = Math.max(maxX, n.x + n.r);
        maxY = Math.max(maxY, n.y + n.r);
    }
    const pad = 48;
    const bw = Math.max(60, maxX - minX);
    const bh = Math.max(60, maxY - minY);
    const k = Math.min(1.4, Math.max(0.15, Math.min((width - pad * 2) / bw, (height - pad * 2) / bh)));
    return {
        k,
        x: width / 2 - ((minX + maxX) / 2) * k,
        y: height / 2 - ((minY + maxY) / 2) * k,
    };
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function draw(
    canvas: HTMLCanvasElement,
    model: GraphModel,
    cam: Camera,
    palette: Palette,
    state: { selected: number | null; hover: number | null; categoryFocus: string | null },
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.k, cam.k);

    const { nodes, edges, adjacency } = model;
    const focusNode = state.selected ?? state.hover;

    // The lit neighborhood: the focused node + everything one hop out.
    let lit: Set<number> | null = null;
    let litEdges: Set<number> | null = null;
    if (focusNode !== null && nodes[focusNode]) {
        lit = new Set([focusNode]);
        litEdges = new Set();
        for (const ei of adjacency[focusNode]) {
            litEdges.add(ei);
            const e = edges[ei];
            lit.add(e.a === focusNode ? e.b : e.a);
        }
    }
    const inFocusCategory = (i: number) =>
        !state.categoryFocus || (nodes[i].link.category || 'Other') === state.categoryFocus;

    // Edges first, under the nodes.
    for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei];
        const a = nodes[e.a];
        const b = nodes[e.b];
        const emphasized = litEdges?.has(ei) ?? false;
        let alpha: number;
        if (litEdges) alpha = emphasized ? 0.85 : 0.05;
        else if (state.categoryFocus) alpha = inFocusCategory(e.a) && inFocusCategory(e.b) ? 0.45 : 0.05;
        else alpha = 0.13 + Math.max(0, Math.min(1, (e.weight - 0.7) / 0.3)) * 0.22;

        if (emphasized) {
            // Lit edges carry both endpoint colors — a quiet gradient thread.
            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grad.addColorStop(0, rgba(getCategoryColorStyle(a.link.category || 'Other').color, alpha));
            grad.addColorStop(1, rgba(getCategoryColorStyle(b.link.category || 'Other').color, alpha));
            ctx.strokeStyle = grad;
        } else {
            ctx.strokeStyle = rgba(palette.textMuted.startsWith('#') ? hexToRgb(palette.textMuted) : palette.textMuted, alpha);
        }
        ctx.lineWidth = (emphasized ? 1.3 : 0.7) + Math.max(0, (e.weight - 0.8)) * 4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }

    // Nodes.
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const color = getCategoryColorStyle(n.link.category || 'Other').color;
        let dim = 1;
        if (lit) dim = lit.has(i) ? 1 : 0.14;
        else if (state.categoryFocus) dim = inFocusCategory(i) ? 1 : 0.14;

        const isFocused = i === state.selected || i === state.hover;
        if (isFocused) {
            // A soft halo behind the focused node.
            const halo = ctx.createRadialGradient(n.x, n.y, n.r * 0.4, n.x, n.y, n.r * 3);
            halo.addColorStop(0, rgba(color, 0.35));
            halo.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Body: category color with a lit top (radial offset gradient).
        const body = ctx.createRadialGradient(
            n.x - n.r * 0.35, n.y - n.r * 0.35, n.r * 0.15,
            n.x, n.y, n.r,
        );
        body.addColorStop(0, rgba(color, Math.min(1, 0.95 * dim + 0.05)));
        body.addColorStop(1, rgba(color, 0.65 * dim));
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();

        // Hairline ring grounds the disc on both themes.
        ctx.strokeStyle = isFocused ? rgba(color, 0.95) : rgba(color, 0.35 * dim);
        ctx.lineWidth = isFocused ? 1.6 : 1;
        ctx.stroke();
    }

    // Labels — the focused neighborhood always; otherwise only the hubs, until
    // the user zooms in far enough that density supports labelling everything.
    const labelAlpha = Math.max(0, Math.min(1, (cam.k - 0.35) / 0.3));
    const hubs = hubLabels(model);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const inLit = lit?.has(i) ?? false;
        const isFocused = i === state.selected || i === state.hover;
        let show = false;
        let alpha = 0;
        if (isFocused) { show = true; alpha = 1; }
        else if (inLit) { show = true; alpha = 0.9; }
        else if (!lit && labelAlpha > 0 && (hubs.has(i) || (cam.k >= 1.05 && n.r * cam.k >= 7))) {
            show = true;
            alpha = labelAlpha * (state.categoryFocus ? (inFocusCategory(i) ? 0.85 : 0.06) : 0.85);
        }
        if (!show || alpha <= 0.02) continue;
        const title = n.link.title.length > 30 ? `${n.link.title.slice(0, 29)}…` : n.link.title;
        const size = Math.max(10, 11 / Math.max(0.7, cam.k));
        ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        // A background-colored stroke keeps the text legible over edges.
        ctx.lineWidth = 3;
        ctx.strokeStyle = rgba(hexToRgb(palette.bg), alpha * 0.85);
        ctx.strokeText(title, n.x, n.y + n.r + 4);
        ctx.fillStyle = rgba(hexToRgb(isFocused ? palette.text : palette.textSecondary), alpha);
        ctx.fillText(title, n.x, n.y + n.r + 4);
    }
}

// The most-connected nodes — the only ones labelled at rest (labelling every
// node made the idle view an unreadable text cloud). Cached per model.
const hubCache = new WeakMap<GraphModel, Set<number>>();
function hubLabels(model: GraphModel): Set<number> {
    let hubs = hubCache.get(model);
    if (!hubs) {
        hubs = new Set(
            model.nodes
                .map((n, i) => ({ i, degree: n.degree }))
                .filter((e) => e.degree >= 3)
                .sort((a, b) => b.degree - a.degree)
                .slice(0, 12)
                .map((e) => e.i),
        );
        hubCache.set(model, hubs);
    }
    return hubs;
}

/** "#RRGGBB" → "rgb(r, g, b)" (rgba() strings pass through untouched). */
function hexToRgb(color: string): string {
    if (!color.startsWith('#')) return color;
    const hex = color.length === 4
        ? color.slice(1).split('').map((c) => c + c).join('')
        : color.slice(1);
    const num = parseInt(hex, 16);
    return `rgb(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255})`;
}
