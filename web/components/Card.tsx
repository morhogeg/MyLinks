'use client';

import { Link, LinkStatus } from '@/lib/types';
import { useState } from 'react';
import { Archive, ExternalLink, Star, X, Clock, Tag } from 'lucide-react';

interface CardProps {
    link: Link;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onDelete: (id: string) => void;
}

/**
 * Card component for displaying a saved link
 * Matches PRD Section 4.3 specifications:
 * - Title (H3, Bold)
 * - Summary (Line clamp 3)
 * - Row of Pill Badges (Tags) + Time Ago
 */
export default function Card({ link, onStatusChange, onDelete }: CardProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Format relative time (e.g., "2h ago")
    const getTimeAgo = (timestamp: number): string => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return new Date(timestamp).toLocaleDateString();
    };

    // Category color mapping
    const getCategoryColor = (category: string): string => {
        const colors: Record<string, string> = {
            'Tech': 'bg-blue-500/20 text-blue-400',
            'Articles': 'bg-purple-500/20 text-purple-400',
            'Video': 'bg-red-500/20 text-red-400',
            'Social': 'bg-pink-500/20 text-pink-400',
            'Research': 'bg-green-500/20 text-green-400',
            'Health': 'bg-emerald-500/20 text-emerald-400',
            'General': 'bg-gray-500/20 text-gray-400',
        };
        return colors[category] || colors['General'];
    };

    return (
        <>
            {/* Card */}
            <article
                className="bg-card rounded-xl p-4 hover:bg-card-hover transition-colors cursor-pointer group"
                onClick={() => setIsExpanded(true)}
            >
                {/* Category Badge */}
                <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(link.category)}`}>
                        {link.category}
                    </span>
                    {link.status === 'favorite' && (
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    )}
                    {link.status === 'archived' && (
                        <Archive className="w-4 h-4 text-gray-500" />
                    )}
                </div>

                {/* Title */}
                <h3 className="font-bold text-lg text-text leading-tight mb-2 group-hover:text-white transition-colors">
                    {link.title}
                </h3>

                {/* Summary - line clamp 3 */}
                <p className="text-text-secondary text-sm line-clamp-3 mb-3">
                    {link.summary}
                </p>

                {/* Tags and Time */}
                <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                        {link.tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-white/5 rounded-full text-text-secondary"
                            >
                                <Tag className="w-3 h-3" />
                                {tag}
                            </span>
                        ))}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-text-muted">
                        <Clock className="w-3 h-3" />
                        {getTimeAgo(link.createdAt)}
                    </div>
                </div>
            </article>

            {/* Detail Modal */}
            {isExpanded && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4"
                    onClick={() => setIsExpanded(false)}
                >
                    <div
                        className="bg-card w-full max-w-lg rounded-t-2xl md:rounded-2xl p-6 max-h-[80vh] overflow-y-auto animate-slide-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                            <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColor(link.category)}`}>
                                {link.category}
                            </span>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="p-1 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-text-secondary" />
                            </button>
                        </div>

                        {/* Title */}
                        <h2 className="font-bold text-xl text-white mb-4">{link.title}</h2>

                        {/* Full Summary */}
                        <p className="text-text-secondary mb-4 leading-relaxed">{link.summary}</p>

                        {/* Estimated Read Time */}
                        <p className="text-sm text-text-muted mb-4 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {link.metadata.estimatedReadTime} min read
                        </p>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mb-6">
                            {link.tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 text-sm px-3 py-1 bg-white/5 rounded-full text-text-secondary"
                                >
                                    <Tag className="w-3 h-3" />
                                    {tag}
                                </span>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-medium py-3 px-4 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Open Original
                            </a>

                            {link.status !== 'archived' ? (
                                <button
                                    onClick={() => {
                                        onStatusChange(link.id, 'archived');
                                        setIsExpanded(false);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-white/10 text-text py-3 px-4 rounded-xl hover:bg-white/20 transition-colors"
                                >
                                    <Archive className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        onStatusChange(link.id, 'unread');
                                        setIsExpanded(false);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-white/10 text-text py-3 px-4 rounded-xl hover:bg-white/20 transition-colors"
                                >
                                    Unarchive
                                </button>
                            )}

                            <button
                                onClick={() => {
                                    onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite');
                                    setIsExpanded(false);
                                }}
                                className="flex items-center justify-center gap-2 bg-white/10 text-text py-3 px-4 rounded-xl hover:bg-white/20 transition-colors"
                            >
                                <Star className={`w-4 h-4 ${link.status === 'favorite' ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
