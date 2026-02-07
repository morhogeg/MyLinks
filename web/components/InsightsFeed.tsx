'use client';

import { Link } from '@/lib/types';
import { Lightbulb, Tag, ArrowRight, X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface InsightsFeedProps {
    links: Link[];
    onOpenDetails: (link: Link) => void;
    isSelectionMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelection?: (id: string) => void;
}

export default function InsightsFeed({
    links,
    onOpenDetails,
    isSelectionMode,
    selectedIds,
    onToggleSelection
}: InsightsFeedProps) {
    const [now, setNow] = useState<number>(0);

    useEffect(() => {
        const timer = setTimeout(() => setNow(Date.now()), 0);
        return () => clearTimeout(timer);
    }, []);

    const getTimeAgo = (timestamp: number, now_val: number): string => {
        const seconds = Math.floor((now_val - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        return new Date(timestamp).toLocaleDateString();
    };

    return (
        <div className="space-y-6">
            {links.map((link) => (
                <article
                    key={link.id}
                    className={`bg-card rounded-2xl border transition-all group flex items-start gap-4 p-6 ${selectedIds?.has(link.id)
                        ? 'border-accent bg-accent/5 ring-1 ring-accent'
                        : 'border-border-subtle hover:shadow-xl'
                        } ${isSelectionMode ? 'cursor-pointer select-none' : 'cursor-default'}`}
                    onClick={() => {
                        if (isSelectionMode && onToggleSelection) {
                            onToggleSelection(link.id);
                        } else {
                            onOpenDetails(link);
                        }
                    }}
                >
                    {isSelectionMode && (
                        <div className="mt-1">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds?.has(link.id)
                                ? 'bg-accent border-accent text-white'
                                : 'border-text-muted bg-background'
                                }`}>
                                {selectedIds?.has(link.id) && <X className="w-3.5 h-3.5" />}
                            </div>
                        </div>
                    )}

                    <div className="flex-1">
                        <div className="flex items-start gap-4">
                            <div className="mt-1 p-3 rounded-2xl bg-yellow-500/10 text-yellow-500 shadow-inner group-hover:scale-110 transition-transform">
                                <Lightbulb className="w-6 h-6 fill-yellow-500/20" />
                            </div>

                            <div className="flex-1 space-y-3">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-[10px] uppercase font-black tracking-widest text-accent bg-accent/10 px-2 py-0.5 rounded-md">
                                        {link.category}
                                    </span>
                                    <span className="text-[10px] text-text-muted font-medium tabular-nums">
                                        {now > 0 ? getTimeAgo(link.createdAt, now) : '...'}
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold text-text group-hover:text-accent transition-colors leading-snug">
                                    {link.title}
                                </h3>

                                <div className="bg-background/50 rounded-xl p-4 border border-border-subtle relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-50" />
                                    <p className="text-text-secondary italic text-sm leading-relaxed">
                                        &quot;{link.metadata.actionableTakeaway || 'Analyze this link to get an actionable insight...'}&quot;
                                    </p>
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                    <div className="flex gap-2">
                                        {link.tags.slice(0, 3).map(tag => (
                                            <span key={tag} className="text-[10px] text-text-muted flex items-center gap-1">
                                                <Tag className="w-3 h-3" />
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                    <button className="flex items-center gap-1 text-xs font-bold text-accent group-hover:translate-x-1 transition-transform">
                                        Full Summary <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>
            ))}
        </div>
    );
}
