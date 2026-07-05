'use client';

import { useMemo } from 'react';
import { Link2, ArrowRight, ArrowLeftRight } from 'lucide-react';
import { Link } from '@/lib/types';
import { crossCategoryClusters } from '@/lib/connections';
import { getCategoryColorStyle } from '@/lib/colors';
import { hapticLight } from '@/lib/haptics';

/**
 * The Connections surface (M10) — deliberately NOT a category browser.
 *
 * It shows only clusters that *bridge 2+ categories*: cards filed under
 * different categories that nonetheless share a concept. Those links are exactly
 * what a category filter can never surface (it keeps the categories apart), so
 * this earns its place as a distinct lens rather than a second way to browse
 * buckets. Each cluster names the categories it bridges (as their real colored
 * chips) and lists its members; tapping one opens the card.
 */
export default function ConnectionsView({
    links,
    onOpenCard,
}: {
    links: Link[];
    onOpenCard: (id: string) => void;
}) {
    const clusters = useMemo(() => crossCategoryClusters(links, 2), [links]);

    if (clusters.length === 0) {
        return (
            <div className="text-center py-16 animate-fade-in">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/15 flex items-center justify-center">
                    <Link2 className="w-7 h-7 text-accent" />
                </div>
                <p className="text-text font-semibold">No cross-category links yet</p>
                <p className="text-sm text-text-muted mt-1.5 max-w-xs mx-auto leading-relaxed">
                    When cards from different categories turn out to share a theme,
                    Machina surfaces that hidden thread here — the kind of link a
                    category filter would never show.
                </p>
            </div>
        );
    }

    const open = (id: string) => {
        hapticLight();
        onOpenCard(id);
    };

    return (
        <div className="flex flex-col gap-4 animate-fade-in">
            {clusters.map((cluster) => (
                <section
                    key={cluster.key}
                    className="rounded-2xl border border-border-subtle bg-card overflow-hidden"
                >
                    <div className="flex items-start gap-3 px-4 py-3 border-b border-border-subtle">
                        <div className="w-9 h-9 shrink-0 rounded-xl bg-accent/15 flex items-center justify-center">
                            <Link2 className="w-[18px] h-[18px] text-accent" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-[15px] font-bold text-accent truncate">
                                {cluster.concept}
                            </h3>
                            {/* The categories this thread bridges — the point of the view. */}
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                {cluster.categories.map((cat, i) => (
                                    <span key={cat} className="flex items-center gap-1.5">
                                        {i > 0 && (
                                            <ArrowLeftRight className="w-3 h-3 text-text-muted shrink-0" />
                                        )}
                                        <span
                                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border"
                                            style={getCategoryColorStyle(cat)}
                                        >
                                            {cat}
                                        </span>
                                    </span>
                                ))}
                                <span className="text-xs text-text-muted">
                                    · {cluster.links.length} cards
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="p-2">
                        {cluster.links.map((link) => (
                            <button
                                key={link.id}
                                onClick={() => open(link.id)}
                                className="group w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg hover:bg-card-hover transition-colors min-h-[40px]"
                            >
                                <ArrowRight className="w-3.5 h-3.5 shrink-0 text-accent opacity-60 group-hover:translate-x-0.5 transition-transform" />
                                <span className="truncate text-sm text-text">{link.title}</span>
                            </button>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
