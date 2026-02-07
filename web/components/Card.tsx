'use client';

import { Link, LinkStatus } from '@/lib/types';
import { useState, useEffect } from 'react';
import { Archive, ExternalLink, Star, X, Clock, Tag, Trash2, MessageSquare, BookOpen, ChevronRight, Sparkles } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import AIChat from './AIChat';

interface CardProps {
    link: Link;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onDelete: (id: string) => void;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (id: string) => void;
    allLinks?: Link[];
}

/**
 * Card component for displaying a saved link
 * Matches PRD Section 4.3 specifications:
 * - Title (H3, Bold)
 * - Summary (Line clamp 3)
 * - Row of Pill Badges (Tags) + Time Ago
 */
export default function Card({ link, onStatusChange, onDelete, isSelectionMode, isSelected, onToggleSelection, allLinks = [] }: CardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [now, setNow] = useState<number>(0);
    const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');

    useEffect(() => {
        const timer = setTimeout(() => setNow(Date.now()), 0);
        return () => clearTimeout(timer);
    }, []);

    // Find related links based on tag/category overlap
    const getRelatedLinks = () => {
        if (!allLinks || !allLinks.length) return [];
        return allLinks
            .filter(l => l.id !== link.id)
            .map(l => {
                let score = 0;
                if (l.category === link.category) score += 3;
                const sharedTags = l.tags.filter(t => link.tags.includes(t));
                score += sharedTags.length * 2;
                return { link: l, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(item => item.link);
    };

    const relatedLinks = isExpanded ? getRelatedLinks() : [];

    // Format relative time (e.g., "2h ago")
    const getTimeAgo = (timestamp: number, now: number): string => {
        const seconds = Math.floor((now - timestamp) / 1000);

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

                {/* Title & Actions */}
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-lg text-text leading-tight group-hover:text-white transition-colors flex-1">
                        {link.title}
                    </h3>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDeleteConfirm(true);
                            }}
                            className="p-1.5 hover:bg-red-500/20 rounded-lg text-text-muted hover:text-red-400 transition-colors"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-text-muted hover:text-white transition-colors"
                            title="Open Link"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>
                </div>

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
                        {now > 0 ? getTimeAgo(link.createdAt, now) : '...'}
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

                        {/* Tab Switcher */}
                        <div className="flex gap-4 border-b border-white/5 mb-6">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={`pb-2 px-1 text-sm font-bold transition-all relative ${activeTab === 'details' ? 'text-white' : 'text-text-muted hover:text-text-secondary'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <BookOpen className="w-4 h-4" />
                                    Insights
                                </div>
                                {activeTab === 'details' && (
                                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-accent" />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('chat')}
                                className={`pb-2 px-1 text-sm font-bold transition-all relative ${activeTab === 'chat' ? 'text-white' : 'text-text-muted hover:text-text-secondary'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4" />
                                    AI Assist
                                </div>
                                {activeTab === 'chat' && (
                                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-accent" />
                                )}
                            </button>
                        </div>

                        {activeTab === 'details' ? (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {/* Title */}
                                <h2 className="font-bold text-xl text-white mb-4">{link.title}</h2>

                                {/* Full Summary */}
                                <p className="text-text-secondary mb-4 leading-relaxed">{link.summary}</p>

                                <div className="bg-yellow-500/5 rounded-xl p-4 border border-yellow-500/10 mb-6">
                                    <h4 className="text-[10px] uppercase font-black tracking-widest text-yellow-500 mb-1">Key Takeaway</h4>
                                    <p className="text-sm italic text-text-secondary">
                                        {link.metadata.actionableTakeaway || "Analysis in progress..."}
                                    </p>
                                </div>

                                <p className="text-sm text-text-muted mb-4 flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    {link.metadata.estimatedReadTime} min read {now > 0 && `• ${getTimeAgo(link.createdAt, now)}`}
                                </p>

                                {/* Tags */}
                                <div className="flex flex-wrap gap-2 mb-8">
                                    {link.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center gap-1 text-sm px-3 py-1 bg-white/5 rounded-full text-text-secondary border border-white/5"
                                        >
                                            <Tag className="w-3 h-3" />
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                {/* Related Insights */}
                                {relatedLinks.length > 0 && (
                                    <div className="mb-8 p-4 bg-accent/5 rounded-2xl border border-accent/10">
                                        <h4 className="text-[10px] uppercase font-black tracking-widest text-accent mb-3 flex items-center gap-2">
                                            < Sparkles className="w-3 h-3" />
                                            Related from your Brain
                                        </h4>
                                        <div className="space-y-3">
                                            {relatedLinks.map((rel: Link) => (
                                                <div
                                                    key={rel.id}
                                                    className="group flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                                                    onClick={() => {
                                                        // This would ideally open the other link, but for now we just show title
                                                        console.log("Navigate to", rel.title);
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
                                                        <span className="text-xs font-bold text-text-secondary truncate group-hover:text-text transition-colors">
                                                            {rel.title}
                                                        </span>
                                                    </div>
                                                    <ChevronRight className="w-3 h-3 text-text-muted group-hover:text-accent transition-all group-hover:translate-x-0.5" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <AIChat link={link} />
                            </div>
                        )}

                        <p className="text-sm text-text-muted mb-4 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {link.metadata.estimatedReadTime} min read {now > 0 && `• ${getTimeAgo(link.createdAt, now)}`}
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
                        <div className="flex flex-wrap gap-3">
                            <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-[2] flex items-center justify-center gap-2 bg-white text-black font-medium py-3 px-4 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Open Original
                            </a>

                            <div className="flex gap-2 flex-1">
                                {link.status !== 'archived' ? (
                                    <button
                                        onClick={() => {
                                            onStatusChange(link.id, 'archived');
                                            setIsExpanded(false);
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 bg-white/10 text-text py-3 px-4 rounded-xl hover:bg-white/20 transition-colors"
                                        title="Archive"
                                    >
                                        <Archive className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            onStatusChange(link.id, 'unread');
                                            setIsExpanded(false);
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 bg-white/10 text-text py-3 px-4 rounded-xl hover:bg-white/20 transition-colors"
                                    >
                                        Unarchive
                                    </button>
                                )}

                                <button
                                    onClick={() => {
                                        onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite');
                                        setIsExpanded(false);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 bg-white/10 text-text py-3 px-4 rounded-xl hover:bg-white/20 transition-colors"
                                    title="Favorite"
                                >
                                    <Star className={`w-4 h-4 ${link.status === 'favorite' ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                                </button>

                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 text-red-400 py-3 px-4 rounded-xl hover:bg-red-500/20 transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Deletion Confirmation */}
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => {
                    onDelete(link.id);
                    setIsExpanded(false);
                }}
                title="Delete from Brain?"
                message="This will permanently remove this insight. You can't undo this action."
                confirmLabel="Delete"
            />
        </>
    );
}
