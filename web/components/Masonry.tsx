'use client';

import { Children, isValidElement, useEffect, useRef, useState, type Key, type ReactNode } from 'react';

interface MasonryProps {
    children: ReactNode;
    /** Target column width in px; column count is derived from container width. */
    columnWidth?: number;
    /** Gap between columns and cards, in px. */
    gap?: number;
}

/** Which column each card sits in, for the column count it was made for. */
interface Placement {
    columns: number;
    byKey: ReadonlyMap<Key, number>;
}

/** Edits up to this size keep every untouched card in its column. */
const SMALL_CHANGE = 3;

/**
 * Where each card goes this render, given where they went last time.
 *
 * Cards used to be dealt round-robin by INDEX, so one save at the top (or one
 * delete) shifted every later card into the next column. Keys only reconcile
 * within one parent, so React remounted the whole grid: every card replayed
 * its entrance and lost its state. Now a small edit keeps every surviving
 * card where it was: a new card goes to the shortest column (by count; the
 * leftmost on a tie), a removed one just frees its slot, and cards appended at
 * the end fill the shortest columns too. The grid is re-dealt round-robin
 * (row-major, newest first, as before) only when the column count changes or
 * the list really changed: a filter, a search, a new sort. Keeping old
 * columns through those would leave a lopsided, out-of-order grid.
 */
function place(prev: Placement, keys: Key[], columns: number): Placement {
    const byKey = new Map<Key, number>();
    if (prev.columns === columns) {
        const current = new Set(keys);
        let removed = 0;
        prev.byKey.forEach((_, k) => { if (!current.has(k)) removed++; });
        // New cards placed BEFORE a surviving one are inserts (a save at the
        // top); new cards after the last survivor are an append (load more).
        let lastKept = -1;
        keys.forEach((k, i) => { if (prev.byKey.has(k)) lastKept = i; });
        let inserted = 0;
        let added = 0;
        keys.forEach((k, i) => {
            if (prev.byKey.has(k)) return;
            added++;
            if (i < lastKept) inserted++;
        });
        // Survivors whose relative order changed (a re-sort): their count is
        // what is left after the longest run already in the old order.
        const kept = keys.filter((k) => prev.byKey.has(k));
        const order = new Map<Key, number>();
        let n = 0;
        prev.byKey.forEach((_, k) => order.set(k, n++));
        const moved = kept.length - longestIncreasingRun(kept.map((k) => order.get(k)!));
        if (removed === 0 && added === 0 && moved === 0) return prev;
        if (lastKept >= 0 && removed + inserted + moved <= SMALL_CHANGE) {
            const counts = new Array<number>(columns).fill(0);
            kept.forEach((k) => counts[prev.byKey.get(k)!]++);
            // Filled in list order: the map's order is what the next render
            // compares against, so it must match the list or every render
            // would look like a re-sort.
            keys.forEach((k) => {
                const was = prev.byKey.get(k);
                if (was !== undefined) {
                    byKey.set(k, was);
                    return;
                }
                let shortest = 0;
                for (let c = 1; c < columns; c++) if (counts[c] < counts[shortest]) shortest = c;
                byKey.set(k, shortest);
                counts[shortest]++;
            });
            return { columns, byKey };
        }
    }
    keys.forEach((k, i) => byKey.set(k, i % columns));
    return { columns, byKey };
}

/** Length of the longest strictly increasing subsequence (patience sort). */
function longestIncreasingRun(values: number[]): number {
    const tails: number[] = [];
    for (const v of values) {
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (tails[mid] < v) lo = mid + 1;
            else hi = mid;
        }
        tails[lo] = v;
    }
    return tails.length;
}

/**
 * Lightweight flexbox masonry.
 *
 * Cards are dealt across N columns (N derived from the container width) so
 * reading order stays row-major — item 0 in the first column, item 1 in the
 * second, etc. The top row therefore reads left-to-right in list order (newest
 * first), and small edits after that keep each card in its column (see
 * `place`). Each column is a flex stack, so cards hug their own content with no
 * equal-height dead space.
 *
 * Uses flexbox rather than CSS multi-column on purpose: multicol mis-paints
 * transformed elements (our card entrance animation) in Safari and is inherently
 * column-major, which would break the desired ordering.
 */
export default function Masonry({ children, columnWidth = 340, gap = 16 }: MasonryProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [columnCount, setColumnCount] = useState(1);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const compute = () => {
            const width = el.clientWidth;
            setColumnCount(Math.max(1, Math.floor((width + gap) / (columnWidth + gap))));
        };
        compute();
        const observer = new ResizeObserver(compute);
        observer.observe(el);
        return () => observer.disconnect();
    }, [columnWidth, gap]);

    const items = Children.toArray(children);
    // Children.toArray keys every element; the index is only a fallback.
    const keys = items.map((child, i) => (isValidElement(child) && child.key != null ? child.key : `#${i}`));

    // Last render's placement, carried forward (state updated during render,
    // React's pattern for deriving from the previous render): `place` returns
    // the same object when nothing moved, which ends the re-render at once.
    const [placement, setPlacement] = useState<Placement>({ columns: 0, byKey: new Map() });
    const next = place(placement, keys, columnCount);
    if (next !== placement) setPlacement(next);

    const columns: ReactNode[][] = Array.from({ length: columnCount }, () => []);
    items.forEach((child, i) => {
        columns[next.byKey.get(keys[i]) ?? 0].push(child);
    });

    return (
        <div ref={ref} className="flex items-start" style={{ gap }}>
            {columns.map((col, i) => (
                <div key={i} className="flex flex-col flex-1 min-w-0" style={{ gap }}>
                    {/* Each card sits in a `cv-card` wrapper so off-screen cards
                        skip layout/paint (virtualization-lite, report 3.15). The
                        wrapper reuses the child's own key so reconciliation and the
                        card entrance animation are unaffected. */}
                    {col.map((child, j) => (
                        <div key={(isValidElement(child) && child.key != null) ? child.key : j} className="cv-card">
                            {child}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
