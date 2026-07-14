'use client';

import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';

interface MasonryProps {
    children: ReactNode;
    /** Target column width in px; column count is derived from container width. */
    columnWidth?: number;
    /** Gap between columns and cards, in px. */
    gap?: number;
}

/**
 * Lightweight flexbox masonry.
 *
 * Cards are distributed round-robin across N columns (N derived from the
 * container width), so reading order stays row-major — item 0 in the first
 * column, item 1 in the second, etc. The top row therefore reads left-to-right
 * in list order (newest first). Each column is a flex stack, so cards hug their
 * own content with no equal-height dead space.
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
    const columns: ReactNode[][] = Array.from({ length: columnCount }, () => []);
    items.forEach((child, i) => {
        columns[i % columnCount].push(child);
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
