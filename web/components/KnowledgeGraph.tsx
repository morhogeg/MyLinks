'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, LocateFixed, Waypoints, X } from 'lucide-react';
import { AskHints, Link } from '@/lib/types';
import { buildGraphModel, edgeReason, spacingScale, GraphModel, GraphNode, BuildSignal } from '@/lib/graph';
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

/** What the graph should re-focus when the user returns from an Ask it
 *  launched — the tapped card, or the cluster holding this anchor card.
 *  Ids, not indices: the model is rebuilt on re-entry. */
export interface GraphRestoreFocus {
    selectedId?: string;
    clusterAnchorId?: string;
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
const REPULSION = 4200;        // many-body charge (world units²)
const REPULSION_MAX_DIST = 480;
const GRAVITY = 0.05;          // pull toward the node's ISLAND anchor (per component)
const VELOCITY_DECAY = 0.8;
const ALPHA_DECAY = 0.99;
const ALPHA_MIN = 0.015;
const TAP_SLOP = 7;            // px of movement that still counts as a tap

export default function KnowledgeGraph({
    links,
    loading,
    filtered,
    onOpenCard,
    onAskCluster,
    restoreFocus,
    onRestoreConsumed,
    onSaveCluster,
    onBackToAsk,
}: {
    /** The card pool (already privacy-filtered by the Feed). */
    links: Link[];
    /** True while the full-library fetch is still in flight. */
    loading: boolean;
    /** True when grid filters/search currently scope the pool. */
    filtered: boolean;
    onOpenCard: (link: Link) => void;
    /** Hand a card group to Ask Machina — question, structured hints (exact
     *  ids, exclusive grounding), and what to re-focus on return from Ask. */
    onAskCluster?: (question: string, hints: AskHints, restore: GraphRestoreFocus) => void;
    /** The focus to re-apply after returning from Ask (see onAskCluster). */
    restoreFocus?: GraphRestoreFocus | null;
    /** Called once the restore has been applied (the owner clears it). */
    onRestoreConsumed?: () => void;
    /** Save a cluster's members as a new collection; resolves true on success. */
    onSaveCluster?: (name: string, linkIds: string[]) => Promise<boolean>;
    /** Present only when the Graph was opened FROM an Ask answer — returns to
     *  that conversation (leaving Ask unmounted it, so this reopens it). */
    onBackToAsk?: () => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [model, setModel] = useState<GraphModel | null>(null);
    const [building, setBuilding] = useState(true);
    const [selected, setSelected] = useState<number | null>(null);
    const [categoryFocus, setCategoryFocus] = useState<string | null>(null);
    // A tapped island caption spotlights that cluster and opens its panel.
    const [clusterFocus, setClusterFocus] = useState<number | null>(null);
    const [savingCluster, setSavingCluster] = useState(false);
    const [savedClusters, setSavedClusters] = useState<Set<number>>(new Set());
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
    // While set, the camera glides to keep this node framed clear of the panel —
    // how "tap a connection in the list" visibly walks the graph. Any user
    // gesture (pan/zoom) takes the camera back.
    const followRef = useRef<number | null>(null);
    // While set, the camera glides to frame this whole cluster.
    const clusterFitRef = useRef<number | null>(null);
    const clusterFocusRef = useRef<number | null>(null);
    // Screen-space rects of the island captions drawn last frame, for tap tests.
    const captionRectsRef = useRef<{ x1: number; y1: number; x2: number; y2: number; cluster: number }[]>([]);
    const openRef = useRef(onOpenCard);
    // Chrome the label pass must avoid (see draw()).
    const backPillRef = useRef(false);
    backPillRef.current = !!onBackToAsk;
    const restoreRef = useRef<GraphRestoreFocus | null>(restoreFocus ?? null);
    restoreRef.current = restoreFocus ?? restoreRef.current;
    const onRestoreConsumedRef = useRef(onRestoreConsumed);
    onRestoreConsumedRef.current = onRestoreConsumed;
    selectedRef.current = selected;
    focusRef.current = categoryFocus;
    clusterFocusRef.current = clusterFocus;
    openRef.current = onOpenCard;

    // Every selection (canvas tap or panel row) starts a follow; deselect ends it.
    useEffect(() => {
        followRef.current = selected;
        if (selected !== null) autoFitRef.current = false;
    }, [selected]);
    useEffect(() => {
        clusterFitRef.current = clusterFocus;
        if (clusterFocus !== null) autoFitRef.current = false;
        setSavingCluster(false);
        drawPendingRef.current = true;
    }, [clusterFocus]);

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
            // Coming back from an Ask this graph launched: re-open the focus
            // that launched it, so Ask reads as a detour, not an exit.
            const restore = restoreRef.current;
            if (restore) {
                restoreRef.current = null;
                if (restore.selectedId) {
                    const idx = m.nodes.findIndex((n) => n.id === restore.selectedId);
                    if (idx >= 0) setSelected(idx);
                } else if (restore.clusterAnchorId) {
                    const anchor = m.nodes.find((n) => n.id === restore.clusterAnchorId);
                    if (anchor) setClusterFocus(anchor.cluster);
                }
                onRestoreConsumedRef.current?.();
            }
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
            } else if (clusterFitRef.current !== null && model.clusters[clusterFitRef.current]) {
                // Frame the focused cluster with padding.
                const members = model.clusters[clusterFitRef.current].nodeIndices;
                const dpr = Math.min(2, window.devicePixelRatio || 1);
                const w = canvas.width / dpr;
                const h = canvas.height / dpr;
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const i of members) {
                    const n = model.nodes[i];
                    minX = Math.min(minX, n.x - n.r);
                    minY = Math.min(minY, n.y - n.r);
                    maxX = Math.max(maxX, n.x + n.r);
                    maxY = Math.max(maxY, n.y + n.r);
                }
                const desktop = w >= 640;
                const freeW = desktop ? w - 360 : w;
                // Phones: the sheet can take up to 66% of the height, so only
                // the top third is genuinely free to frame into.
                const freeH = desktop ? h : h * 0.34;
                // The phone's free strip is short — a desktop-sized margin
                // would shrink the cluster to a speck inside it.
                const pad = desktop ? 70 : 34;
                const bw = Math.max(80, maxX - minX);
                const bh = Math.max(80, maxY - minY);
                const tk = Math.min(1.3, Math.max(0.2, Math.min((freeW - pad * 2) / bw, (freeH - pad * 2) / bh)));
                const cam = camRef.current;
                const ease = reducedMotionRef.current ? 1 : 0.1;
                cam.k += (tk - cam.k) * ease;
                cam.x += (freeW / 2 - ((minX + maxX) / 2) * cam.k - cam.x) * ease;
                cam.y += (freeH / 2 - ((minY + maxY) / 2) * cam.k - cam.y) * ease;
                drawPendingRef.current = true;
            } else if (followRef.current !== null && model.nodes[followRef.current]) {
                // Frame the whole EGO NETWORK — the card and everything it
                // connects to — inside the area the panel leaves free (right
                // of the desktop panel, above the phone sheet). Framing the
                // single node instead pushed its neighbours off the top edge
                // on a phone, which is exactly what the selection is for.
                const fi = followRef.current;
                const n = model.nodes[fi];
                const dpr = Math.min(2, window.devicePixelRatio || 1);
                const w = canvas.width / dpr;
                const h = canvas.height / dpr;
                const desktop = w >= 640;
                const freeW = desktop ? w - 360 : w;
                const freeH = desktop ? h : h * 0.34;
                let minX = n.x - n.r, minY = n.y - n.r, maxX = n.x + n.r, maxY = n.y + n.r;
                for (const ei of model.adjacency[fi]) {
                    const e = model.edges[ei];
                    const o = model.nodes[e.a === fi ? e.b : e.a];
                    minX = Math.min(minX, o.x - o.r);
                    minY = Math.min(minY, o.y - o.r);
                    maxX = Math.max(maxX, o.x + o.r);
                    maxY = Math.max(maxY, o.y + o.r);
                }
                // Leave room for the labels that hang under each dot.
                const pad = 46;
                const bw = Math.max(60, maxX - minX);
                const bh = Math.max(60, maxY - minY);
                const tk = Math.min(1.25, Math.max(0.4, Math.min((freeW - pad * 2) / bw, (freeH - pad * 2) / bh)));
                const cam = camRef.current;
                const ease = reducedMotionRef.current ? 1 : 0.11;
                cam.k += (tk - cam.k) * ease;
                cam.x += (freeW / 2 - ((minX + maxX) / 2) * cam.k - cam.x) * ease;
                cam.y += (freeH / 2 - ((minY + maxY) / 2) * cam.k - cam.y) * ease;
                drawPendingRef.current = true;
            }
            if (simActive || drawPendingRef.current) {
                drawPendingRef.current = false;
                captionRectsRef.current = draw(canvas, model, camRef.current, paletteRef.current ?? readPalette(), {
                    selected: selectedRef.current,
                    hover: hoverRef.current,
                    categoryFocus: focusRef.current,
                    clusterFocus: clusterFocusRef.current,
                    backPill: backPillRef.current,
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
        // Touch needs a fatter target than a mouse cursor does.
        const minHit = window.matchMedia?.('(pointer: coarse)').matches ? 22 : 16;
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
                // Every dot must be hittable: at least a 16px screen-space
                // target regardless of how small the node draws (owner QA:
                // low-degree dots were effectively un-tappable).
                const reach = Math.max(n.r + 4 / cam.k, minHit / cam.k);
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
            followRef.current = null;     // any gesture takes the camera back
            clusterFitRef.current = null;
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
                const overCaption = hit < 0 && captionRectsRef.current.some(
                    (r) => p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2,
                );
                canvas.style.cursor = hit >= 0 || overCaption ? 'pointer' : 'grab';
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
                    if (selectedRef.current === dragNode) {
                        // Second tap on the focused card opens it — the panel's
                        // Open button and this gesture agree.
                        openRef.current(modelRef.current!.nodes[dragNode].link);
                    } else {
                        setClusterFocus(null);
                        setSelected(dragNode);
                    }
                }
                dragNode = -1;
            } else if (mode === 'pan' && moved < TAP_SLOP) {
                // Empty-space tap: an island caption spotlights its cluster;
                // anywhere else clears every focus.
                const p2 = last;
                const caption = captionRectsRef.current.find(
                    (r) => p2.x >= r.x1 && p2.x <= r.x2 && p2.y >= r.y1 && p2.y <= r.y2,
                );
                if (caption) {
                    hapticLight();
                    setSelected(null);
                    setClusterFocus((cur) => (cur === caption.cluster ? null : caption.cluster));
                } else {
                    setSelected(null);
                    setClusterFocus(null);
                }
            }
            if (pointers.size === 0) mode = 'idle';
            else if (pointers.size === 1) mode = 'pan';
            canvas.style.cursor = 'grab';
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            autoFitRef.current = false;
            followRef.current = null;
            clusterFitRef.current = null;
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
                    category: other.category,
                    weight: e.weight,
                    strong: e.strong,
                    reason: edgeReason(node.link, other.link, isRtl),
                };
            })
            .sort((a, b) => b.weight - a.weight);
        // The cluster's theme feeds the panel's "Ask about this" question —
        // asking about "Political Polarization" beats asking about one title.
        const cluster = model.clusters[node.cluster];
        return {
            node,
            neighbors,
            clusterIndex: node.cluster,
            clusterLabel: cluster ? cluster.label : null,
        };
    }, [model, selected]);

    // ── Cluster panel data ───────────────────────────────────────────────────
    const clusterPanel = useMemo(() => {
        if (!model || clusterFocus === null || !model.clusters[clusterFocus]) return null;
        const cluster = model.clusters[clusterFocus];
        const members = cluster.nodeIndices
            .map((i) => model.nodes[i])
            .sort((a, b) => b.degree - a.degree);
        // The "why" headline — what actually ties these cards together
        // (owner QA: cross-category islands looked arbitrary without it).
        // Concepts shared by at least a quarter of the members name the tie;
        // otherwise the honest answer is embedding-level similarity.
        const conceptCounts = new Map<string, { display: string; count: number }>();
        for (const m of members) {
            for (const c of new Set((m.link.concepts ?? []).map((s) => s.trim()).filter(Boolean))) {
                const key = c.toLowerCase();
                const entry = conceptCounts.get(key);
                if (entry) entry.count++;
                else conceptCounts.set(key, { display: c, count: 1 });
            }
        }
        const floor = Math.max(2, Math.ceil(members.length * 0.25));
        const labelLower = (cluster.label ?? '').toLowerCase();
        const ranked = [...conceptCounts.values()]
            .filter((e) => e.count >= floor)
            .sort((a, b) => b.count - a.count)
            .map((e) => e.display);
        // Only say what the LABEL doesn't already say (owner copy QA:
        // "Geopolitics · Sovereignty — linked by Geopolitics and Sovereignty"
        // is the subject restated, not a why). Extra shared threads add real
        // information; when the label covers them all, the count alone is
        // honest; only a concept-less cluster needs the semantic-tie fallback.
        const extra = ranked.filter((t) => !labelLower.includes(t.toLowerCase())).slice(0, 2);
        const why = extra.length
            ? `also share ${extra.join(' and ')}`
            : ranked.length ? null : 'linked by closely related content';
        return { index: clusterFocus, label: cluster.label, members, why };
    }, [model, clusterFocus]);

    // One question builder for both entry points, over an EXPLICIT card set —
    // and the set is always exactly what the open panel shows (owner bug:
    // "ask about cluster" on a selected card sent its whole 6-card component
    // while the panel showed 3, and the answer counted 6 and cited 7). The
    // question NAMES the cards in quotes (quoted titles are the backend's
    // anchor trigger and the only phrasing the model can't reinterpret), and
    // the hints carry the exact ids with `exclusive` grounding, so the
    // model's context IS the named set — it cannot miscount or cite a
    // topic-matched stranger.
    const askAboutCards = useCallback((members: GraphNode[], theme: string | null, restore: GraphRestoreFocus) => {
        if (!onAskCluster || !members.length) return;
        // Internal double quotes would split the quoted span the backend
        // extracts; its title matching is punctuation-insensitive, so
        // dropping them loses nothing. Long titles truncate with an
        // ellipsis, which the backend treats as a prefix match.
        const quote = (t: string) => {
            const clean = t.replace(/["“”«»]/g, '').trim();
            return clean.length > 80 ? `“${clean.slice(0, 79)}…”` : `“${clean}”`;
        };
        const titles = members.map((m) => m.link.title);
        let question: string;
        if (members.length <= 3) {
            const quoted = titles.map(quote);
            const list = quoted.length === 2
                ? `${quoted[0]} and ${quoted[1]}`
                : quoted.join(', ');
            question = `What connects ${list}?`;
        } else {
            const about = theme ? ` about ${theme.split(' · ')[0]}` : '';
            question = `What connects my ${members.length} cards${about}, like ${quote(titles[0])} and ${quote(titles[1])}?`;
        }
        onAskCluster(question, {
            anchorTitles: titles.slice(0, 8),
            anchorIds: members.slice(0, 20).map((m) => m.id),
            exclusive: true,
        }, restore);
    }, [onAskCluster]);

    const askCluster = useCallback(() => {
        if (!clusterPanel) return;
        askAboutCards(clusterPanel.members, clusterPanel.label, { clusterAnchorId: clusterPanel.members[0]?.id });
    }, [clusterPanel, askAboutCards]);

    // The selection panel asks about the card AND the connections it lists —
    // the ego network on screen — never the (possibly larger) component.
    const askSelection = useCallback(() => {
        if (!selection || !model) return;
        const members = [selection.node, ...selection.neighbors.map((nb) => model.nodes[nb.index])];
        askAboutCards(members, selection.clusterLabel, { selectedId: selection.node.id });
    }, [selection, model, askAboutCards]);

    const saveCluster = useCallback(async () => {
        if (!clusterPanel || !onSaveCluster || savingCluster) return;
        setSavingCluster(true);
        const ok = await onSaveCluster(
            clusterPanel.label ?? 'From the graph',
            clusterPanel.members.map((m) => m.id),
        );
        setSavingCluster(false);
        if (ok) setSavedClusters((prev) => new Set(prev).add(clusterPanel.index));
    }, [clusterPanel, onSaveCluster, savingCluster]);

    // ── Legend (top categories among connected nodes) ────────────────────────
    const legend = useMemo(() => {
        if (!model) return [];
        const counts = new Map<string, number>();
        for (const n of model.nodes) {
            counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
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
                    Tap a card to explore · tap it again to open · drag to pan · scroll to zoom
                </div>
            </div>
            {/* Category legend. On a phone this WRAPPED to three rows and ate
                ~110px of the canvas (owner mobile QA) — it's one horizontally
                scrollable row there, and only wraps from sm up where there's
                width to spare. */}
            {legend.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
                    {legend.map(({ category, count, color }) => {
                        const active = categoryFocus === category;
                        return (
                            <button
                                key={category}
                                onClick={() => setCategoryFocus(active ? null : category)}
                                aria-pressed={active}
                                className={`inline-flex shrink-0 items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] font-medium transition-colors cursor-pointer ${active
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
                /* Mobile reserves less chrome now that the legend is one row. */
                className="relative overflow-hidden rounded-2xl border border-border-subtle h-[calc(100dvh-268px)] min-h-[420px] sm:h-[calc(100dvh-290px)] sm:min-h-[460px]"
                style={{ background: 'radial-gradient(120% 100% at 50% 38%, var(--card), var(--background) 88%)' }}
            >
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 touch-none"
                    role="img"
                    aria-label="Knowledge graph of your saved cards and their connections"
                />

                {/* Back to the Ask conversation that opened this view. Floats
                    over the canvas in the same material as the re-fit control,
                    at the opposite corner so the two never collide on either
                    breakpoint. Only present on the Ask → Graph path. */}
                {onBackToAsk && (
                    <button
                        onClick={onBackToAsk}
                        aria-label="Back to the chat"
                        className="absolute top-3 start-3 z-10 inline-flex items-center gap-1 h-9 ps-2 pe-3.5 rounded-full bg-card/90 backdrop-blur border border-border-subtle text-text-secondary hover:text-text hover:bg-card-hover shadow-sm transition-colors cursor-pointer"
                    >
                        <ChevronLeft className="w-4 h-4 shrink-0 rtl:rotate-180" />
                        <span className="text-[13px] font-semibold">Back to Ask</span>
                    </button>
                )}

                {/* Re-fit control */}
                {model && !showLoading && !showEmpty && (
                    <button
                        onClick={refit}
                        title="Fit graph to view"
                        aria-label="Fit graph to view"
                        /* Top-right on phones (the panel owns the bottom edge
                           there and was burying this button), bottom-right on
                           desktop where the panel sits top-right. */
                        className="absolute top-3 end-3 sm:top-auto sm:bottom-3 w-9 h-9 rounded-full bg-card/90 backdrop-blur border border-border-subtle text-text-secondary hover:text-text hover:bg-card-hover flex items-center justify-center shadow-sm transition-colors cursor-pointer"
                    >
                        <LocateFixed className="w-4 h-4" />
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

                {/* Selection panel — the "why" behind the highlighted neighborhood.
                    Layout contract (owner QA round 1): the Open button sits
                    DIRECTLY under the selected card's title so there is no doubt
                    which card it opens; the neighbor list below is explicitly
                    labelled Connections, each row tap re-focuses the graph on
                    that card (the camera follows), and each row's ↗ opens that
                    card's detail directly. */}
                {selection && (
                    <div className="absolute inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-auto sm:top-3 sm:end-3 sm:w-[330px] max-h-[66%] sm:max-h-[calc(100%-24px)] flex flex-col rounded-2xl bg-card/95 backdrop-blur-xl border border-border-subtle shadow-[var(--shadow-card)] animate-fade-in">
                        {/* Minimal, intentional hierarchy: TITLE → one action
                            row → connections. The category dot is the only
                            metadata (its color already matches the legend);
                            the old POLITICS row and the cluster chip stacked
                            two grey layers here and buried the Ask route one
                            panel deeper (owner QA). */}
                        <div className="p-3 pb-2.5 sm:p-3.5 sm:pb-3">
                            <div className="flex items-start gap-2.5">
                                <span
                                    className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: getCategoryColorStyle(selection.node.category).color }}
                                />
                                <h3 dir="auto" className="flex-1 min-w-0 text-[14px] font-semibold text-text leading-snug line-clamp-2">
                                    {selection.node.link.title}
                                </h3>
                                <button
                                    onClick={() => setSelected(null)}
                                    aria-label="Close card details"
                                    className="p-1 -m-1 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            {/* Two quiet pills — "cluster" in the Ask label is
                                what carries the scope (owner QA round 5: the
                                Connections-header placement read worse, and a
                                section label cost a row the phone didn't have).
                                The list below needs no heading; the divider
                                separates it. */}
                            <div className="mt-2.5 flex gap-2">
                                <button
                                    onClick={() => onOpenCard(selection.node.link)}
                                    className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-full bg-card border border-border-strong text-[13px] font-bold text-text hover:bg-card-hover active:scale-[0.98] transition-all cursor-pointer"
                                >
                                    Open card
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                                {onAskCluster && (
                                    <button
                                        onClick={askSelection}
                                        className="flex-1 h-9 inline-flex items-center justify-center rounded-full bg-card border border-border-strong text-[13px] font-bold text-text hover:bg-card-hover active:scale-[0.98] transition-all cursor-pointer"
                                    >
                                        Ask about these
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="mx-3 sm:mx-3.5 h-px bg-border-subtle" />
                        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5">
                            {selection.neighbors.map((nb) => (
                                <div key={nb.link.id} className="flex items-stretch gap-0.5">
                                    <button
                                        onClick={() => selectNeighbor(nb.index)}
                                        title="Focus this card in the graph"
                                        className="flex-1 min-w-0 text-start px-1.5 py-2 rounded-xl hover:bg-card-hover transition-colors cursor-pointer"
                                    >
                                        <span className="flex items-center gap-2">
                                            <span
                                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                                style={{ backgroundColor: getCategoryColorStyle(nb.category).color }}
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
                                    <button
                                        onClick={() => onOpenCard(nb.link)}
                                        aria-label={`Open ${nb.link.title}`}
                                        title="Open this card"
                                        className="self-center shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                                    >
                                        <ArrowUpRight className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Cluster panel — a tapped island caption: the auto-derived
                    theme, its members, and what to DO with the cluster (ask
                    your brain about it, keep it as a collection). Selection
                    takes precedence; closing a selection returns here. */}
                {!selection && clusterPanel && (
                    <div className="absolute inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-auto sm:top-3 sm:end-3 sm:w-[330px] max-h-[66%] sm:max-h-[calc(100%-24px)] flex flex-col rounded-2xl bg-card/95 backdrop-blur-xl border border-border-subtle shadow-[var(--shadow-card)] animate-fade-in">
                        <div className="p-3 pb-2.5 sm:p-3.5 sm:pb-3">
                            <div className="flex items-start gap-2.5">
                                <Waypoints className="mt-0.5 w-4 h-4 shrink-0 text-text-muted" />
                                <div className="flex-1 min-w-0">
                                    <h3 dir="auto" className="text-[14px] font-semibold text-text leading-snug line-clamp-2">
                                        {clusterPanel.label ?? 'A cluster of related cards'}
                                    </h3>
                                    {/* Sentence case — this line now carries the
                                        WHY of the cluster, not a section label. */}
                                    <p dir="auto" className="mt-0.5 text-[12px] text-text-secondary leading-snug">
                                        {clusterPanel.members.length} cards{clusterPanel.why ? ` · ${clusterPanel.why}` : ''}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setClusterFocus(null)}
                                    aria-label="Close cluster details"
                                    className="p-1 -m-1 rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="mt-2.5 flex gap-2">
                                {onAskCluster && (
                                    <button
                                        onClick={askCluster}
                                        className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-full bg-accent text-accent-ink text-[13px] font-bold hover:bg-accent-hover active:scale-[0.98] transition-all cursor-pointer"
                                    >
                                        Ask about this
                                    </button>
                                )}
                                {onSaveCluster && (
                                    <button
                                        onClick={saveCluster}
                                        disabled={savingCluster || savedClusters.has(clusterPanel.index)}
                                        className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-full bg-card border border-border-strong text-[13px] font-bold text-text hover:bg-card-hover active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-default"
                                    >
                                        {savedClusters.has(clusterPanel.index) ? 'Saved ✓' : savingCluster ? 'Saving…' : 'Save as collection'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="px-3 sm:px-3.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                            Cards in this cluster
                        </p>
                        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5">
                            {clusterPanel.members.map((m) => {
                                const idx = model!.nodes.indexOf(m);
                                return (
                                    <div key={m.id} className="flex items-stretch gap-0.5">
                                        <button
                                            onClick={() => selectNeighbor(idx)}
                                            title="Focus this card in the graph"
                                            className="flex-1 min-w-0 text-start px-1.5 py-2 rounded-xl hover:bg-card-hover transition-colors cursor-pointer"
                                        >
                                            <span className="flex items-center gap-2">
                                                <span
                                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                                    style={{ backgroundColor: getCategoryColorStyle(m.category).color }}
                                                />
                                                <span dir="auto" className="flex-1 min-w-0 text-[13px] font-medium text-text truncate">
                                                    {m.link.title}
                                                </span>
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => onOpenCard(m.link)}
                                            aria-label={`Open ${m.link.title}`}
                                            title="Open this card"
                                            className="self-center shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                                        >
                                            <ArrowUpRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
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
            let f = (repulsion * alpha) / d2;
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

type Rect = { x1: number; y1: number; x2: number; y2: number };
type CaptionRect = Rect & { cluster: number };

// Node-label typography (screen space) and the collision budget between two
// accepted labels.
const LABEL_SIZE = 11;
const LABEL_PAD = 2;
// Canvas titles ellipsize here — long enough to identify a card at a glance
// (30 cut most real titles mid-word); collision culling, not truncation, is
// what keeps the view readable.
const MAX_LABEL_CHARS = 48;

function draw(
    canvas: HTMLCanvasElement,
    model: GraphModel,
    cam: Camera,
    palette: Palette,
    state: { selected: number | null; hover: number | null; categoryFocus: string | null; clusterFocus: number | null; backPill?: boolean },
): CaptionRect[] {
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
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
        !state.categoryFocus || nodes[i].category === state.categoryFocus;
    const inFocusCluster = (i: number) =>
        state.clusterFocus === null || nodes[i].cluster === state.clusterFocus;
    /** 1 when a node is fully lit, 0.14 when the current focus pushes it back. */
    const dimOf = (i: number) => {
        if (lit) return lit.has(i) ? 1 : 0.14;
        if (state.categoryFocus) return inFocusCategory(i) ? 1 : 0.14;
        if (state.clusterFocus !== null) return inFocusCluster(i) ? 1 : 0.14;
        return 1;
    };

    // Edges first, under the nodes.
    for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei];
        const a = nodes[e.a];
        const b = nodes[e.b];
        const emphasized = litEdges?.has(ei) ?? false;
        let alpha: number;
        if (litEdges) alpha = emphasized ? 0.85 : 0.05;
        else if (state.categoryFocus) alpha = inFocusCategory(e.a) && inFocusCategory(e.b) ? 0.45 : 0.05;
        else if (state.clusterFocus !== null) alpha = inFocusCluster(e.a) ? 0.4 : 0.05;
        else alpha = 0.13 + Math.max(0, Math.min(1, (e.weight - 0.7) / 0.3)) * 0.22;

        if (emphasized) {
            // Lit edges carry both endpoint colors — a quiet gradient thread.
            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grad.addColorStop(0, rgba(getCategoryColorStyle(a.category).color, alpha));
            grad.addColorStop(1, rgba(getCategoryColorStyle(b.category).color, alpha));
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
        const color = getCategoryColorStyle(n.category).color;
        const dim = dimOf(i);

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

    // ── Text: island captions, then node labels ──────────────────────────────
    // Both are laid out in SCREEN space, so type stays a constant, legible size
    // at any zoom AND overlap can be settled with plain rect tests: candidates
    // are ranked, then accepted greedily — a label whose rect hits one already
    // placed is DROPPED rather than drawn across it (owner QA: small and
    // filtered graphs were an unreadable pile of stacked titles). Captions are
    // placed first, so a cluster's theme always outranks a single card's title.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const viewW = canvas.width / dpr;
    const viewH = canvas.height / dpr;
    // Chrome that floats OVER the canvas claims its space before any text is
    // laid out: the re-fit button (top-right on phones, bottom-right on
    // desktop) and, while open, the panel. A title drawn under either is at
    // best invisible and at worst sliced in half by the panel's edge.
    const isDesktop = viewW >= 640;
    const placed: Rect[] = [
        isDesktop
            ? { x1: viewW - 60, y1: viewH - 60, x2: viewW - 4, y2: viewH - 4 }
            : { x1: viewW - 60, y1: 4, x2: viewW - 4, y2: 60 },
    ];
    if (state.backPill) {
        // "Back to Ask" pill, top-start (mirrors its absolute placement).
        placed.push({ x1: 4, y1: 4, x2: 160, y2: 56 });
    }
    if (state.selected !== null || state.clusterFocus !== null) {
        placed.push(isDesktop
            // Mirrors the panel's own sizing (sm:w-[330px] at end-3 / the
            // phone sheet's max-h-[66%]) and the camera's framing math.
            ? { x1: viewW - 346, y1: 4, x2: viewW - 4, y2: viewH - 4 }
            : { x1: 4, y1: viewH * 0.34, x2: viewW - 4, y2: viewH });
    }
    const fits = (r: Rect) =>
        placed.every((p) =>
            r.x2 + LABEL_PAD < p.x1 || r.x1 - LABEL_PAD > p.x2
            || r.y2 + LABEL_PAD < p.y1 || r.y1 - LABEL_PAD > p.y2);
    const onScreen = (r: Rect) => r.x2 > 0 && r.x1 < viewW && r.y2 > 0 && r.y1 < viewH;

    // Island captions — each named cluster gets its theme drawn above it, and
    // the caption doubles as the tap target that opens the cluster panel. The
    // returned rects are in SCREEN space for the pointer handler.
    const rects: CaptionRect[] = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.lineWidth = 3;
    for (let c = 0; c < model.clusters.length; c++) {
        const cluster = model.clusters[c];
        if (!cluster.label) continue;
        let sumX = 0;
        let minY = Infinity;
        for (const i of cluster.nodeIndices) {
            sumX += nodes[i].x;
            minY = Math.min(minY, nodes[i].y - nodes[i].r);
        }
        const rawX = (sumX / cluster.nodeIndices.length) * cam.k + cam.x;
        const sy = (minY * cam.k + cam.y) - 14;
        let alpha = 0.75;
        if (lit) alpha = 0.12;
        else if (state.clusterFocus !== null) alpha = c === state.clusterFocus ? 0.95 : 0.12;
        else if (state.categoryFocus) alpha = 0.15;
        const focusedCaption = state.clusterFocus === c;
        const label = cluster.label.toUpperCase();
        const tw = ctx.measureText(label).width;
        // Nudge a caption whose island sits near a border back inside — same
        // rule as node labels; a clipped theme name reads as a glitch.
        const sx = rawX > 0 && rawX < viewW
            ? Math.min(Math.max(rawX, tw / 2 + 8), viewW - tw / 2 - 8)
            : rawX;
        ctx.strokeStyle = rgba(hexToRgb(palette.card), alpha * 0.7);
        ctx.strokeText(label, sx, sy);
        ctx.fillStyle = rgba(hexToRgb(focusedCaption ? palette.text : palette.textSecondary), alpha);
        ctx.fillText(label, sx, sy);
        // A generous tap halo around the drawn text — only consulted when no
        // node was hit, so it can afford to be finger-sized.
        rects.push({ x1: sx - tw / 2 - 18, y1: sy - 25, x2: sx + tw / 2 + 18, y2: sy + 15, cluster: c });
        // Only a caption that actually reads claims space from node labels —
        // a dimmed-to-0.12 one is background texture, not text.
        if (alpha >= 0.3) placed.push({ x1: sx - tw / 2, y1: sy - 11, x2: sx + tw / 2, y2: sy + 3 });
    }

    // Node labels — the focused neighborhood always; otherwise only the hubs,
    // until the user zooms in far enough that density supports labelling more.
    // Tier drives who wins a contested spot: focused/hovered card, then its lit
    // neighbours, then the rest by degree (hubs name the constellation).
    const labelAlpha = Math.max(0, Math.min(1, (cam.k - 0.35) / 0.3));
    const hubs = hubLabels(model);
    const candidates: { i: number; alpha: number; tier: number; focused: boolean }[] = [];
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const inLit = lit?.has(i) ?? false;
        const isFocused = i === state.selected || i === state.hover;
        if (isFocused) candidates.push({ i, alpha: 1, tier: 0, focused: true });
        else if (inLit) candidates.push({ i, alpha: 0.9, tier: 1, focused: false });
        else if (!lit && labelAlpha > 0 && (hubs.has(i) || (cam.k >= 1.05 && n.r * cam.k >= 7))) {
            const focusDim = state.categoryFocus
                ? (inFocusCategory(i) ? 0.85 : 0.06)
                : state.clusterFocus !== null
                    ? (inFocusCluster(i) ? 0.85 : 0.06)
                    : 0.85;
            const alpha = labelAlpha * focusDim;
            if (alpha > 0.02) candidates.push({ i, alpha, tier: hubs.has(i) ? 2 : 3, focused: false });
        }
    }
    candidates.sort((a, b) => a.tier - b.tier || nodes[b.i].degree - nodes[a.i].degree);

    // Discs are obstacles too: a title lying across a neighbouring dot reads as
    // badly as one lying across another title. Only LIT dots count — a dot
    // pushed back to 0.14 is atmosphere, and letting it veto a label would
    // silence the very neighbourhood the selection is meant to explain.
    const discs: (Rect | null)[] = candidates.length
        ? nodes.map((n, i) => {
            if (dimOf(i) < 1) return null;
            const dx = n.x * cam.k + cam.x;
            const dy = n.y * cam.k + cam.y;
            const dr = n.r * cam.k;
            return { x1: dx - dr, y1: dy - dr, x2: dx + dr, y2: dy + dr };
        })
        : [];
    const clearsDiscs = (r: Rect, self: number) =>
        discs.every((d, di) =>
            !d || di === self
            || r.x2 < d.x1 || r.x1 > d.x2 || r.y2 < d.y1 || r.y1 > d.y2);

    ctx.textBaseline = 'top';
    ctx.font = `600 ${LABEL_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    // On a phone a 48-char title is wider than the canvas, so nothing could ever
    // clear its neighbours — labels are also trimmed to a share of the viewport.
    const maxLabelPx = Math.min(viewW * 0.62, 280);
    for (const { i, alpha, focused } of candidates) {
        const n = nodes[i];
        let title = n.link.title.length > MAX_LABEL_CHARS
            ? `${n.link.title.slice(0, MAX_LABEL_CHARS - 1)}…`
            : n.link.title;
        let tw = ctx.measureText(title).width;
        if (tw > maxLabelPx) {
            let cut = title.replace(/…$/, '');
            while (cut.length > 6 && ctx.measureText(`${cut}…`).width > maxLabelPx) {
                cut = cut.slice(0, Math.max(6, Math.ceil(cut.length * 0.9) - 1));
            }
            title = `${cut.trimEnd()}…`;
            tw = ctx.measureText(title).width;
        }
        // Nudge a label that would run off the edge back inside — a title
        // sliced by the canvas border is no more use than one that's covered.
        const nx = n.x * cam.k + cam.x;
        const sx = nx > 0 && nx < viewW
            ? Math.min(Math.max(nx, tw / 2 + 4), viewW - tw / 2 - 4)
            : nx;
        // Below the dot is the house position; above is the fallback, so a
        // crowded hub keeps its name instead of losing it to a neighbour.
        let rect: Rect | null = null;
        for (const sy of [
            (n.y + n.r) * cam.k + cam.y + 5,
            (n.y - n.r) * cam.k + cam.y - 5 - LABEL_SIZE,
        ]) {
            const r = { x1: sx - tw / 2, y1: sy, x2: sx + tw / 2, y2: sy + LABEL_SIZE };
            if (onScreen(r) && fits(r) && clearsDiscs(r, i)) {
                rect = r;
                break;
            }
        }
        if (!rect) continue;
        const sy = rect.y1;
        placed.push(rect);
        // A background-colored stroke keeps the text legible over edges.
        // Halo in the CARD tone — the canvas sits on a card→background
        // gradient, so a bg-colored halo reads darker than its local backdrop
        // and smears ghost shapes around glyphs (owner QA round 2).
        ctx.lineWidth = 3;
        ctx.strokeStyle = rgba(hexToRgb(palette.card), alpha * 0.7);
        ctx.strokeText(title, sx, sy);
        ctx.fillStyle = rgba(hexToRgb(focused ? palette.text : palette.textSecondary), alpha);
        ctx.fillText(title, sx, sy);
    }
    return rects;
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
