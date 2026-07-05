'use client';

import { useMemo } from 'react';
import { Link2, ArrowRight } from 'lucide-react';
import { Link } from '@/lib/types';
import { allClusters } from '@/lib/connections';
import { hapticLight } from '@/lib/haptics';

/**
 * The Connections surface (M10) — the opted-in home for every concept cluster
 * across recent saves. The feed shows only the single strongest connection
 * proactively; here the user has tapped in, so we relax the threshold (≥2) and
 * list them all, strongest first. Each member links back to its card.
 */
export default function ConnectionsView({
    links,
    onOpenCard,
}: {
    links: Link[];
    onOpenCard: (id: string) => void;
}) {
    // Relaxed threshold (2): the user opted in, so smaller patterns are welcome
    // here even though they'd be too quiet to interrupt the feed with.
    const clusters = useMemo(() => allClusters(links, 2), [links]);

    if (clusters.length === 0) {
        return (
            <div className="text-center py-16 animate-fade-in">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/15 flex items-center justify-center">
                    <Link2 className="w-7 h-7 text-accent" />
                </div>
                <p className="text-text font-semibold">No connections yet</p>
                <p className="text-sm text-text-muted mt-1.5 max-w-xs mx-auto leading-relaxed">
                    As you save more, Machina surfaces the themes that link your cards
                    together and gathers them here.
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
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                        <div className="w-9 h-9 shrink-0 rounded-xl bg-accent/15 flex items-center justify-center">
                            <Link2 className="w-[18px] h-[18px] text-accent" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-[15px] font-bold text-accent truncate">
                                {cluster.concept}
                            </h3>
                            <p className="text-xs text-text-muted">
                                {cluster.links.length} cards connect here
                            </p>
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
