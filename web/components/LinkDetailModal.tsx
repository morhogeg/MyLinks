'use client';

import { useState, useEffect } from 'react';
import { Link, LinkStatus } from '@/lib/types';
import { Archive, ExternalLink, Star, X, Clock, Tag, Trash2, MessageSquare, BookOpen, ChevronRight, Sparkles } from 'lucide-react';
import AIChat from './AIChat';
import ConfirmDialog from './ConfirmDialog';

interface LinkDetailModalProps {
    link: Link;
    allLinks: Link[];
    isOpen: boolean;
    onClose: () => void;
    onStatusChange: (id: string, status: LinkStatus) => void;
    onUpdateTags: (id: string, tags: string[]) => void;
    onDelete: (id: string) => void;
    onOpenOtherLink?: (link: Link) => void;
}

export default function LinkDetailModal({
    link,
    allLinks,
    isOpen,
    onClose,
    onStatusChange,
    onUpdateTags,
    onDelete,
    onOpenOtherLink
}: LinkDetailModalProps) {
    const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [now, setNow] = useState<number>(0);

    useEffect(() => {
        const initialTimer = setTimeout(() => setNow(Date.now()), 0);
        const timer = setInterval(() => setNow(Date.now()), 1000 * 60);
        return () => {
            clearTimeout(initialTimer);
            clearInterval(timer);
        };
    }, []);

    // Reset tab when link changes
    useEffect(() => {
        setActiveTab('details');
    }, [link.id]);

    if (!isOpen) return null;

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

    const relatedLinks = getRelatedLinks();

    const getTimeAgo = (timestamp: number, now: number): string => {
        const seconds = Math.floor((now - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative bg-card border-0 sm:border border-white/10 w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                {/* Header Actions */}
                <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/5 bg-white/5">
                    <div className="flex gap-1.5 sm:gap-2">
                        <button
                            onClick={() => onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite')}
                            className={`p-2 rounded-xl border transition-all min-h-[44px] min-w-[44px] flex items-center justify-center ${link.status === 'favorite'
                                ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500 shadow-lg shadow-yellow-500/5'
                                : 'bg-white/5 border-white/5 text-text-muted hover:text-yellow-500'
                                }`}
                        >
                            <Star className={`w-4 h-4 ${link.status === 'favorite' ? 'fill-current' : ''}`} />
                        </button>
                        <button
                            onClick={() => onStatusChange(link.id, link.status === 'archived' ? 'unread' : 'archived')}
                            className={`p-2 rounded-xl border transition-all min-h-[44px] min-w-[44px] flex items-center justify-center ${link.status === 'archived'
                                ? 'bg-accent/10 border-accent/20 text-accent shadow-lg shadow-accent/5'
                                : 'bg-white/5 border-white/5 text-text-muted hover:text-accent'
                                }`}
                        >
                            <Archive className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="p-2 rounded-xl bg-white/5 border border-white/5 text-text-muted hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-500 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex gap-1.5 sm:gap-2">
                        <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-white/5 border border-white/5 text-text-muted hover:bg-accent hover:border-accent hover:text-white transition-all shadow-lg shadow-accent/0 hover:shadow-accent/20 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl bg-white/5 border border-white/5 text-text-muted hover:bg-white/10 hover:text-white transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 scrollbar-thin scrollbar-thumb-white/10">
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
                            <h2 className="font-bold text-2xl text-white mb-4 leading-tight">{link.title}</h2>
                            <p className="text-text-secondary mb-6 leading-relaxed text-lg">{link.summary}</p>

                            <div className="bg-yellow-500/5 rounded-2xl p-5 border border-yellow-500/10 mb-8 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500 opacity-30" />
                                <h4 className="text-[10px] uppercase font-black tracking-widest text-yellow-500 mb-2">Key Takeaway</h4>
                                <p className="text-sm italic text-text-secondary leading-relaxed">
                                    &quot;{link.metadata.actionableTakeaway || "Analysis in progress..."}&quot;
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted mb-8">
                                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/5">
                                    <Clock className="w-3.5 h-3.5" />
                                    {link.metadata.estimatedReadTime} min read
                                </span>
                                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/5">
                                    <Tag className="w-3.5 h-3.5 text-accent" />
                                    {getTimeAgo(link.createdAt, now)}
                                </span>
                            </div>

                            {/* Tags */}
                            <div className="flex flex-wrap gap-2 mb-10">
                                {link.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 bg-white/5 rounded-full text-text-secondary border border-white/5 hover:border-accent/30 hover:text-white transition-all group/tag"
                                    >
                                        <Tag className="w-3 h-3" />
                                        {tag}
                                        <X
                                            className="w-3 h-3 ml-1 opacity-40 group-hover/tag:opacity-100 hover:text-red-400 cursor-pointer transition-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onUpdateTags(link.id, link.tags.filter(t => t !== tag));
                                            }}
                                        />
                                    </span>
                                ))}
                            </div>

                            {/* Related Insights */}
                            {relatedLinks.length > 0 && (
                                <div className="p-6 bg-accent/5 rounded-3xl border border-accent/10">
                                    <h4 className="text-[10px] uppercase font-black tracking-widest text-accent mb-4 flex items-center gap-2">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        Related from your Brain
                                    </h4>
                                    <div className="grid gap-3">
                                        {relatedLinks.map((rel: Link) => (
                                            <button
                                                key={rel.id}
                                                className="group flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/5 hover:border-accent/30 hover:bg-white/10 transition-all text-left"
                                                onClick={() => onOpenOtherLink?.(rel)}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="w-2 h-2 rounded-full bg-accent/40 group-hover:bg-accent group-hover:scale-125 transition-all" />
                                                    <span className="text-[13px] font-bold text-text-secondary truncate group-hover:text-text transition-colors">
                                                        {rel.title}
                                                    </span>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-all group-hover:translate-x-1" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full">
                            <AIChat link={link} />
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                title="Delete Link"
                message="Are you sure you want to delete this link? This action cannot be undone."
                confirmLabel="Delete"
                onConfirm={() => {
                    onDelete(link.id);
                    onClose();
                }}
                onClose={() => setShowDeleteConfirm(false)}
            />
        </div>
    );
}
