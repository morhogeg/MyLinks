'use client';

import { useEffect, useRef } from 'react';
import { MODE_DRAWS, resolvePreset, type OrbState, type OrbSize } from 'thinking-orbs';

/**
 * BrandOrb — Jakub Antalík's Thinking Orbs, in Machina's colours.
 *
 * The library only ships a monochrome ink (`fillStyle = rgba(a,a,a,o)` — a
 * grayscale value per dot; there's no colour prop). To keep the EXACT shipped
 * animations but paint them in our palette, we drive the library's own exported
 * draw functions (`MODE_DRAWS` / `resolvePreset`) through a Canvas2D context
 * whose `fillStyle` setter remaps the grey level onto a pink↔purple stop. Every
 * dot, orbit and sweep is the library's; only the ink is ours.
 *
 * The rAF loop, DPR scaling, reduced-motion single-frame, and off-screen /
 * hidden-tab pausing mirror the library's own <ThinkingOrb> exactly.
 */

// Brand stops (sRGB). Bright ink → pink, shadowed ink → purple.
const PINK: [number, number, number] = [236, 72, 153];   // #EC4899
const PURPLE: [number, number, number] = [168, 85, 247];  // #A855F7
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

interface BrandOrbProps {
    /** Which of the six library animations. @default 'working' */
    state?: OrbState;
    /** Tuned size preset — 64 or 20 CSS px. @default 64 */
    size?: OrbSize;
    /** Speed multiplier on the preset's baked speed. @default 1 */
    speed?: number;
    className?: string;
    'aria-label'?: string;
}

/** Wrap a Canvas2D ctx so grayscale fills are repainted in the brand palette. */
function recolor(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
    return new Proxy(ctx, {
        get(target, prop) {
            const value = (target as unknown as Record<string, unknown>)[prop as string];
            return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
        set(target, prop, value) {
            if (prop === 'fillStyle' && typeof value === 'string') {
                const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
                if (m) {
                    const g = +m[1] / 255;                       // grey level 0..1
                    const o = m[4] !== undefined ? +m[4] : 1;    // preserve the depth alpha
                    const r = lerp(PINK[0], PURPLE[0], g);
                    const gr = lerp(PINK[1], PURPLE[1], g);
                    const b = lerp(PINK[2], PURPLE[2], g);
                    (target as unknown as Record<string, unknown>).fillStyle = `rgba(${r},${gr},${b},${o})`;
                    return true;
                }
            }
            (target as unknown as Record<string, unknown>)[prop as string] = value;
            return true;
        },
    }) as CanvasRenderingContext2D;
}

export default function BrandOrb({ state = 'working', size = 64, speed = 1, className = '', ...rest }: BrandOrbProps) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;

        const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        const raw = canvas.getContext('2d');
        if (!raw) return;
        const ctx = recolor(raw);

        const { mode, speed: baseSpeed, opts } = resolvePreset(state, size);
        const draw = MODE_DRAWS[mode];
        const rate = baseSpeed * speed;
        // Always paint with the library's dark-ink shading; colour is ours anyway,
        // so the orb looks identical on light and dark grounds.
        const paint = (t: number) => {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, size, size);
            draw(ctx, size, t, true, opts);
        };

        const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            paint(0.6); // one representative static frame
            return;
        }

        let rafId = 0;
        let running = false;
        const frame = () => {
            paint(performance.now() / 1000 * rate);
            if (running) rafId = requestAnimationFrame(frame);
        };
        const start = () => { if (!running) { running = true; rafId = requestAnimationFrame(frame); } };
        const stop = () => { running = false; cancelAnimationFrame(rafId); };

        paint(performance.now() / 1000 * rate);

        const io = typeof IntersectionObserver !== 'undefined'
            ? new IntersectionObserver(([e]) => {
                (e.isIntersecting && document.visibilityState !== 'hidden') ? start() : stop();
            })
            : null;
        io?.observe(canvas);
        const onVis = () => { document.visibilityState === 'hidden' ? stop() : start(); };
        document.addEventListener('visibilitychange', onVis);
        if (!io) start();

        return () => {
            stop();
            io?.disconnect();
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [state, size, speed]);

    return (
        <canvas
            ref={ref}
            width={size}
            height={size}
            style={{ width: size, height: size }}
            className={`shrink-0 ${className}`}
            aria-hidden
            {...rest}
        />
    );
}
