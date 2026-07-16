'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Pencil,
    Trash2,
    X,
    Check,
    PanelLeftClose,
    PanelLeftOpen,
    MessagesSquare,
    SquarePen,
    MoreHorizontal,
    Search,
} from 'lucide-react';
import { ChatSession } from '@/lib/types';

interface ChatHistorySidebarProps {
    chats: ChatSession[];
    activeChatId: string | null;
    onSelect: (id: string) => void;
    onNewChat: () => void;
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
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuUp, setMenuUp] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Open the menu, flipping it above the row when there isn't room below
    // (the list scrolls with overflow, so a downward menu would clip on last rows).
    const openMenu = () => {
        const rect = menuRef.current?.getBoundingClientRect();
        if (rect) setMenuUp(window.innerHeight - rect.bottom < 120);
        setMenuOpen(true);
    };

    const startEditing = () => { setMenuOpen(false); setDraft(chat.title); setEditing(true); };
    const commit = () => {
        const next = draft.trim();
        if (next && next !== chat.title) onRename(next);
        setEditing(false);
    };

    // Close the actions menu on outside tap or Escape, keeping it self-contained.
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

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
                active ? 'bg-card-hover' : 'hover:bg-card-hover'
            }`}
        >
            {/* Selected indicator — a calm accent bar that reads well in light and dark. */}
            {active && <span className="absolute start-0 inset-y-2 w-[3px] rounded-full bg-accent z-10" />}
            <button
                onClick={onSelect}
                title={chat.title}
                className="flex-1 min-w-0 flex flex-col items-start text-start ps-3.5 pe-1 py-2 min-h-[42px] justify-center cursor-pointer"
            >
                <span dir="auto" className={`w-full truncate text-sm leading-snug text-start ${active ? 'font-medium text-text' : 'text-text-secondary'}`}>
                    {chat.title}
                </span>
                <span className="text-[11px] text-text-muted">{relativeTime(chat.updatedAt)}</span>
            </button>
            {/* Row actions. A single calm "more" affordance, laid out as a real flex
                sibling (not an overlay) so the title always truncates with room to
                spare and the dots never crowd a long name. The fixed-width slot
                reserves its space even while the button is hover-hidden on desktop,
                so revealing it never reflows the row. The dots stay vertically
                centered on the title + time block. */}
            <div
                ref={menuRef}
                className="relative shrink-0 self-stretch flex items-center justify-center w-9 pe-1"
            >
                <button
                    onClick={(e) => { e.stopPropagation(); if (menuOpen) setMenuOpen(false); else openMenu(); }}
                    aria-label="Chat actions"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className={`relative z-10 p-1.5 rounded-lg text-text-muted hover:text-text active:bg-card-hover sm:hover:bg-fill-strong transition-all sm:opacity-0 sm:group-hover:opacity-100 ${menuOpen ? 'opacity-100 sm:opacity-100 text-text bg-card-hover' : ''}`}
                >
                    <MoreHorizontal className="w-4 h-4" />
                </button>

                {menuOpen && (
                    <div
                        role="menu"
                        className={`absolute z-20 end-0 min-w-[9rem] py-1 rounded-xl bg-card border border-border-subtle shadow-lg shadow-black/10 animate-fade-in ${menuUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                    >
                        <button
                            role="menuitem"
                            onClick={(e) => { e.stopPropagation(); startEditing(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:text-text hover:bg-card-hover transition-colors text-start"
                        >
                            <Pencil className="w-4 h-4 shrink-0" />
                            Rename
                        </button>
                        <button
                            role="menuitem"
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRequestDelete(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors text-start"
                        >
                            <Trash2 className="w-4 h-4 shrink-0" />
                            Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Elegant, borderless "New chat" action (Gemini-style): icon + label, calm hover. */
function NewChatItem({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="shrink-0 w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-text hover:bg-card-hover transition-colors cursor-pointer"
        >
            <SquarePen className="w-4 h-4 text-text-secondary" />
            New chat
        </button>
    );
}

/** Small section heading above the conversation list. */
function SectionLabel() {
    return (
        <div className="shrink-0 px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Recent
        </div>
    );
}

/** Quiet history search — appears once the list is long enough to need it.
 *  Matches conversation titles AND the text of questions/answers, so "that
 *  answer about mortgage rates" is findable months later. */
function HistorySearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div className="shrink-0 mt-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border-subtle focus-within:border-accent/40 transition-colors">
            <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="Search chats"
                dir="auto"
                className="flex-1 min-w-0 bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    aria-label="Clear search"
                    className="shrink-0 p-0.5 rounded-full text-text-muted hover:text-text transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
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
    emptyLabel = 'No saved chats yet',
}: Pick<ChatHistorySidebarProps, 'chats' | 'activeChatId' | 'onSelect' | 'onRename' | 'onRequestDelete'> & { emptyLabel?: string }) {
    return (
        <>
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5 overscroll-contain scrollbar-soft">
                {chats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center px-3 py-10 text-text-muted">
                        <MessagesSquare className="w-6 h-6 mb-2 opacity-50" />
                        <p className="text-xs">{emptyLabel}</p>
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

    // History search (both variants). Only offered once the list is long
    // enough that scanning it stops being trivial.
    const [query, setQuery] = useState('');
    const showSearch = props.chats.length >= 6;
    const visibleChats = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q || !showSearch) return props.chats;
        return props.chats.filter(c =>
            c.title.toLowerCase().includes(q) ||
            c.messages.some(m => m.content.toLowerCase().includes(q)));
    }, [props.chats, query, showSearch]);
    const emptyLabel = showSearch && query.trim() ? 'No chats match your search' : undefined;

    if (variant === 'desktop') {
        const { collapsed, onToggleCollapse } = props;
        // A full-height panel that's part of the page: a right-edge divider rather
        // than a floating card, spanning the whole Ask view height.
        return (
            <aside
                className={`hidden sm:flex flex-col shrink-0 h-full min-h-0 border-e border-border-subtle transition-[width] duration-300 ease-in-out ${
                    collapsed ? 'w-12 items-center pe-0' : 'w-72 xl:w-80 pe-3'
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
                        <div className="shrink-0 flex items-center justify-end mb-0.5">
                            <button
                                onClick={onToggleCollapse}
                                aria-label="Hide chat history"
                                title="Hide chat history"
                                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                            >
                                <PanelLeftClose className="w-4 h-4" />
                            </button>
                        </div>
                        <NewChatItem onClick={props.onNewChat} />
                        {showSearch && <HistorySearch value={query} onChange={setQuery} />}
                        {props.chats.length > 0 && <SectionLabel />}
                        <SidebarBody {...props} chats={visibleChats} emptyLabel={emptyLabel} />
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
            <div className="relative w-[82%] max-w-xs h-full bg-card border-e border-border-strong shadow-2xl flex flex-col safe-pt safe-pb animate-slide-in-left">
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
                    <NewChatItem onClick={closeAfter(props.onNewChat)} />
                    {showSearch && <HistorySearch value={query} onChange={setQuery} />}
                    {props.chats.length > 0 && <SectionLabel />}
                    <SidebarBody
                        {...props}
                        chats={visibleChats}
                        emptyLabel={emptyLabel}
                        onSelect={closeAfter(props.onSelect)}
                    />
                </div>
            </div>
        </div>
    );
}
