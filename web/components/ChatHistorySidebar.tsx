'use client';

import { useEffect, useState } from 'react';
import {
    Pencil,
    Trash2,
    X,
    Check,
    PanelLeftClose,
    PanelLeftOpen,
    MessagesSquare,
} from 'lucide-react';
import { ChatSession } from '@/lib/types';

interface ChatHistorySidebarProps {
    chats: ChatSession[];
    activeChatId: string | null;
    onSelect: (id: string) => void;
    onRename: (id: string, title: string) => void;
    /** Routed through the parent's branded ConfirmDialog — we never delete directly. */
    onRequestDelete: (id: string) => void;
    variant: 'desktop' | 'mobile';
    // Desktop only
    collapsed?: boolean;
    onToggleCollapse?: () => void;
    // Mobile only
    open?: boolean;
    onClose?: () => void;
}

/** "2h ago", "Yesterday", "Apr 3" — compact relative time for the chat list. */
function relativeTime(ts: number): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day === 1) return 'Yesterday';
    if (day < 7) return `${day}d ago`;
    const d = new Date(ts);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A single conversation row with select + inline rename + delete. */
function ChatRow({
    chat,
    active,
    onSelect,
    onRename,
    onRequestDelete,
}: {
    chat: ChatSession;
    active: boolean;
    onSelect: () => void;
    onRename: (title: string) => void;
    onRequestDelete: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(chat.title);

    const startEditing = () => { setDraft(chat.title); setEditing(true); };
    const commit = () => {
        const next = draft.trim();
        if (next && next !== chat.title) onRename(next);
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-card-hover border border-accent/40">
                <input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commit(); }
                        if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
                    }}
                    onBlur={commit}
                    className="flex-1 min-w-0 bg-transparent text-sm text-text focus:outline-none"
                />
                <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={commit}
                    aria-label="Save name"
                    className="shrink-0 p-1 rounded-md text-accent hover:bg-accent/10 transition-colors"
                >
                    <Check className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div
            className={`group relative flex items-center rounded-xl transition-colors ${
                active ? 'bg-accent/10 text-text' : 'hover:bg-card-hover text-text-secondary'
            }`}
        >
            <button
                onClick={onSelect}
                title={chat.title}
                className="flex-1 min-w-0 flex flex-col items-start text-start px-3 py-2 min-h-[44px] justify-center cursor-pointer"
            >
                <span className={`w-full truncate text-sm leading-snug ${active ? 'font-medium text-text' : ''}`}>
                    {chat.title}
                </span>
                <span className="text-[11px] text-text-muted">{relativeTime(chat.updatedAt)}</span>
            </button>
            {/* Row actions: always tappable on mobile, hover-revealed on desktop. */}
            <div className="flex items-center pe-1.5 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                    onClick={startEditing}
                    aria-label="Rename chat"
                    className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-white/5 transition-colors"
                >
                    <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => onRequestDelete()}
                    aria-label="Delete chat"
                    className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}

/** Shared inner content: the scrollable list of conversations. */
function SidebarBody({
    chats,
    activeChatId,
    onSelect,
    onRename,
    onRequestDelete,
}: Pick<ChatHistorySidebarProps, 'chats' | 'activeChatId' | 'onSelect' | 'onRename' | 'onRequestDelete'>) {
    return (
        <>
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5 overscroll-contain scrollbar-subtle">
                {chats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center px-3 py-10 text-text-muted">
                        <MessagesSquare className="w-6 h-6 mb-2 opacity-50" />
                        <p className="text-xs">No saved chats yet</p>
                    </div>
                ) : (
                    chats.map(c => (
                        <ChatRow
                            key={c.id}
                            chat={c}
                            active={c.id === activeChatId}
                            onSelect={() => onSelect(c.id)}
                            onRename={title => onRename(c.id, title)}
                            onRequestDelete={() => onRequestDelete(c.id)}
                        />
                    ))
                )}
            </div>
        </>
    );
}

/**
 * Chat history for "Ask your brain".
 * - desktop: a persistent, collapsible left panel (mirrors the Tag Explorer).
 * - mobile: a slide-over drawer above the full-screen chat surface.
 */
export default function ChatHistorySidebar(props: ChatHistorySidebarProps) {
    const { variant } = props;

    // Escape closes the mobile drawer. Declared unconditionally (rules-of-hooks);
    // it only does work for the open mobile variant.
    const mobileOpen = variant === 'mobile' && !!props.open;
    const onClose = props.onClose;
    useEffect(() => {
        if (!mobileOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [mobileOpen, onClose]);

    if (variant === 'desktop') {
        const { collapsed, onToggleCollapse } = props;
        // A full-height panel that's part of the page: a right-edge divider rather
        // than a floating card, spanning the whole Ask view height.
        return (
            <aside
                className={`hidden sm:flex flex-col shrink-0 h-full min-h-0 border-e border-border-subtle transition-[width] duration-300 ease-in-out ${
                    collapsed ? 'w-12 items-center pe-0' : 'w-60 xl:w-72 pe-4'
                }`}
            >
                {collapsed ? (
                    <button
                        onClick={onToggleCollapse}
                        aria-label="Show chat history"
                        title="Show chat history"
                        className="mt-1 p-2 rounded-xl text-text-secondary hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                    >
                        <PanelLeftOpen className="w-5 h-5" />
                    </button>
                ) : (
                    <>
                        <div className="shrink-0 flex items-center justify-between mb-2 ps-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">History</span>
                            <button
                                onClick={onToggleCollapse}
                                aria-label="Hide chat history"
                                title="Hide chat history"
                                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                            >
                                <PanelLeftClose className="w-4 h-4" />
                            </button>
                        </div>
                        <SidebarBody {...props} />
                    </>
                )}
            </aside>
        );
    }

    // Mobile drawer
    if (!props.open) return null;

    // Selecting/creating a chat should also close the drawer on mobile.
    const closeAfter = <T extends unknown[]>(fn: (...args: T) => void) => (...args: T) => { fn(...args); onClose?.(); };

    return (
        <div className="fixed inset-0 z-[60] flex animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-[82%] max-w-xs h-full bg-card border-e border-white/10 shadow-2xl flex flex-col safe-pt safe-pb animate-slide-in-left">
                <div className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-border-subtle">
                    <span className="font-semibold text-text">Chat history</span>
                    <button
                        onClick={onClose}
                        aria-label="Close history"
                        className="p-2 -me-2 rounded-full text-text-muted hover:text-text active:bg-card-hover transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 flex flex-col p-3 min-h-0">
                    <SidebarBody
                        {...props}
                        onSelect={closeAfter(props.onSelect)}
                    />
                </div>
            </div>
        </div>
    );
}
