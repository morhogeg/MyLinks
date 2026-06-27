'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { MessageCircleQuestion, ArrowUp, FileText, Brain, RotateCcw, ChevronLeft } from 'lucide-react';
import { getDirection } from '@/lib/rtl';
import { getPlatform, platformIcon, platformActiveStyle, platformColor, PLATFORM_LABELS } from '@/lib/platform';
import ConfirmDialog from './ConfirmDialog';

interface Source {
    id: string;
    title: string;
    category?: string;
    sourceName?: string | null;
    url?: string | null;
}

/** The branded tag shown on a citation card: a platform (YouTube/X/…) when the
 *  URL reveals one, otherwise the publisher name (e.g. CNN), otherwise null. */
function sourceTag(s: Source): { label: string; platform: ReturnType<typeof getPlatform> } | null {
    const platform = getPlatform(s.url || undefined);
    if (platform) return { label: PLATFORM_LABELS[platform], platform };
    const name = s.sourceName?.trim();
    if (name && !['none', 'screenshot', 'unknown'].includes(name.toLowerCase())) {
        return { label: name, platform: null };
    }
    if (s.category) return { label: s.category, platform: null };
    return null;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sources?: Source[];
    error?: boolean;
}

interface AskBrainProps {
    uid: string | null;
    totalLinks: number;
    onOpenLink: (id: string) => void;
    /** Leave Ask mode (mobile shows a back button; desktop exits via the toolbar). */
    onExit?: () => void;
    /** The user's saved categories (most-saved first) — seeds relevant prompts. */
    categories?: string[];
}

export default function AskBrain({ uid, totalLinks, onOpenLink, onExit, categories }: AskBrainProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Gate persistence until after we've loaded any saved chat, so the first
    // (empty) render doesn't clobber what's in storage.
    const hydratedRef = useRef(false);

    // Suggested prompts built from the user's own categories so they're always
    // relevant to what's actually saved. Rotated by a per-open random offset for
    // light variety — all client-side, no extra tokens.
    const rotation = useRef(Math.floor(Math.random() * 997)).current;
    const suggestions = useMemo(() => {
        const cats = (categories ?? []).filter(Boolean);
        if (!cats.length) return [] as string[];
        const start = rotation % cats.length;
        const rotated = [...cats.slice(start), ...cats.slice(0, start)];
        const picks = rotated.slice(0, 3).map(c => `What have I saved about ${c}?`);
        return [...picks, 'Summarize the key ideas from my recent saves'];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories?.join('|'), rotation]);

    // On phones the Ask view is a full-screen chat pinned to the *visual* viewport
    // so the composer rides the keyboard like a native chat app. On desktop it
    // stays an inline panel.
    const [isMobile, setIsMobile] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const syncViewportRef = useRef<() => void>(() => {});

    // Breakpoint only — changes rarely, so React state is fine here.
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 640px)');
        const onChange = () => setIsMobile(!mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    // Drive the mobile surface height from the visual viewport with *direct DOM
    // writes* (no React re-render) so it tracks the keyboard frame-for-frame
    // instead of lagging. Also locks the page behind the full-screen chat.
    useEffect(() => {
        if (!isMobile) return;
        const el = rootRef.current;
        const vvObj = window.visualViewport;
        const sync = () => {
            if (!el) return;
            const h = vvObj ? vvObj.height : window.innerHeight;
            const offset = vvObj ? vvObj.offsetTop : 0;
            el.style.height = `${h}px`;
            el.style.transform = offset ? `translateY(${offset}px)` : '';
        };
        syncViewportRef.current = sync;
        sync();
        vvObj?.addEventListener('resize', sync);
        vvObj?.addEventListener('scroll', sync);
        window.addEventListener('resize', sync);
        window.addEventListener('orientationchange', sync);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            vvObj?.removeEventListener('resize', sync);
            vvObj?.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
            window.removeEventListener('orientationchange', sync);
            document.body.style.overflow = prevOverflow;
            syncViewportRef.current = () => {};
            if (el) { el.style.height = ''; el.style.transform = ''; }
        };
    }, [isMobile]);

    const storageKey = uid ? `askbrain:chat:${uid}` : null;

    // Restore the conversation on mount (survives tab switches and reloads).
    useEffect(() => {
        if (!storageKey || hydratedRef.current) return;
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) setMessages(JSON.parse(raw));
        } catch { /* ignore corrupt/blocked storage */ }
        hydratedRef.current = true;
    }, [storageKey]);

    // Persist as the conversation grows; only an explicit Clear wipes storage.
    useEffect(() => {
        if (!storageKey || !hydratedRef.current || messages.length === 0) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(messages));
        } catch { /* ignore quota/blocked storage */ }
    }, [messages, storageKey]);

    const clearChat = () => {
        setMessages([]);
        if (storageKey) {
            try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
        }
        textareaRef.current?.focus();
    };

    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    };

    // When the input gains focus (keyboard opening), keep the latest message in
    // view. Height tracking is handled by the visual-viewport listeners above.
    const handleFocus = () => {
        setTimeout(() => { syncViewportRef.current(); scrollToBottom('auto'); }, 120);
        setTimeout(() => scrollToBottom('auto'), 350);
    };

    // Keep the latest message in view as the conversation grows.
    useEffect(() => { scrollToBottom(); }, [messages, isThinking]);

    const send = async (text: string) => {
        const question = text.trim();
        if (!question || isThinking || !uid) return;

        // History = the conversation so far (before this turn), trimmed server-side.
        const history = messages.map(m => ({ role: m.role, content: m.content }));

        setMessages(prev => [...prev, { role: 'user', content: question }]);
        setInput('');
        setIsThinking(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, question, history }),
            });
            const data = await res.json();

            if (data.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.answer || "I couldn't find an answer for that.",
                    sources: data.sources || [],
                }]);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.error || 'Something went wrong reaching your brain. Please try again.',
                    error: true,
                }]);
            }
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Could not reach your brain. Check your connection and try again.',
                error: true,
            }]);
        } finally {
            setIsThinking(false);
            textareaRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };

    // Library is empty — nothing to ask yet.
    if (totalLinks === 0) {
        return (
            <div className="text-center py-20 animate-fade-in">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-accent/20">
                    <Brain className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-medium text-text mb-2">Your brain is empty</h3>
                <p className="text-text-secondary text-sm">Save a few links first, then ask me anything about them.</p>
            </div>
        );
    }

    const isEmpty = messages.length === 0;

    return (
        <div
            ref={rootRef}
            className={`flex flex-col animate-fade-in ${isMobile
                ? 'fixed inset-x-0 top-0 z-50 bg-background'
                : 'min-h-[340px] sm:h-[calc(100dvh-320px)]'
                }`}
        >
            {/* Mobile-only top bar: back to exit + Clear (desktop exits via the toolbar). */}
            {isMobile && (
                <div className="flex items-center gap-1 px-2 h-12 shrink-0 border-b border-border-subtle">
                    <button
                        onClick={onExit}
                        aria-label="Back"
                        className="p-2 -ms-1 rounded-full text-text-secondary hover:text-text active:bg-card-hover transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-text">Ask your brain</span>
                    {!isEmpty && (
                        <button
                            onClick={() => setConfirmClear(true)}
                            className="ms-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-text-muted text-xs font-medium hover:text-text active:bg-card-hover transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Clear
                        </button>
                    )}
                </div>
            )}

            {/* Conversation */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-1 pb-4 overscroll-contain">
                {isEmpty ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                        <div className="w-14 h-14 mb-4 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-accent/20">
                            <MessageCircleQuestion className="w-7 h-7 text-white" />
                        </div>
                        <h2 className="text-xl font-semibold text-text mb-1.5">Ask your brain</h2>
                        <p className="text-text-secondary text-sm max-w-md mb-6">
                            Ask anything about the {totalLinks} {totalLinks === 1 ? 'thing' : 'things'} you&apos;ve saved.
                            Answers come only from your library, with sources you can open.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
                            {suggestions.map(s => (
                                <button
                                    key={s}
                                    onClick={() => send(s)}
                                    className="px-3.5 py-2 rounded-full bg-card border border-border-subtle text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text transition-colors cursor-pointer"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="max-w-2xl mx-auto py-2">
                        {/* Clear — desktop only; mobile uses the top-bar Clear. */}
                        <div className="hidden sm:flex sticky top-0 z-10 justify-end mb-2">
                            <button
                                onClick={() => setConfirmClear(true)}
                                title="Clear conversation"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 backdrop-blur border border-border-subtle text-text-muted text-xs font-medium hover:text-text hover:border-accent/40 transition-colors cursor-pointer"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Clear
                            </button>
                        </div>
                        <div className="space-y-5">
                        {messages.map((m, i) => (
                            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                                <div className={m.role === 'user' ? 'max-w-[85%]' : 'max-w-[90%] w-full'}>
                                    <div
                                        dir={getDirection(m.content)}
                                        className={
                                            m.role === 'user'
                                                ? 'px-4 py-2.5 rounded-2xl rounded-br-md bg-accent text-white text-[15px] leading-relaxed'
                                                : `px-4 py-3 rounded-2xl rounded-bl-md text-[15px] leading-relaxed whitespace-pre-wrap ${m.error
                                                    ? 'bg-red-500/10 border border-red-500/20 text-text'
                                                    : 'bg-card border border-border-subtle text-text'
                                                }`
                                        }
                                    >
                                        {m.content}
                                    </div>

                                    {/* Citations — clickable proof cards back to the source links */}
                                    {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                                        <div className="mt-2.5 flex flex-wrap gap-2">
                                            {m.sources.map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => onOpenLink(s.id)}
                                                    title={s.title}
                                                    className="group flex items-center gap-2.5 max-w-full ps-2.5 pe-3.5 py-2 rounded-xl bg-card border border-border-subtle shadow-sm hover:border-accent/50 hover:bg-card-hover transition-colors cursor-pointer text-start"
                                                >
                                                    {(() => {
                                                        const tag = sourceTag(s);
                                                        return (
                                                            <>
                                                                <span
                                                                    className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-lg bg-accent/10 text-accent group-hover:bg-accent/15 transition-colors"
                                                                    style={tag?.platform ? platformActiveStyle(tag.platform) : undefined}
                                                                >
                                                                    {tag?.platform ? platformIcon(tag.platform, 'w-3.5 h-3.5') : <FileText className="w-3.5 h-3.5" />}
                                                                </span>
                                                                <span className="min-w-0 flex flex-col">
                                                                    {tag && (
                                                                        <span
                                                                            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                                                                            style={tag.platform ? { color: platformColor(tag.platform) } : undefined}
                                                                        >
                                                                            {tag.label}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-[13px] font-medium text-text leading-snug">{s.title}</span>
                                                                </span>
                                                            </>
                                                        );
                                                    })()}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isThinking && (
                            <div className="flex justify-start">
                                <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-card border border-border-subtle inline-flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:-0.3s]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:-0.15s]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" />
                                </div>
                            </div>
                        )}
                        </div>
                    </div>
                )}
            </div>

            {/* Composer */}
            <div className="shrink-0 w-full max-w-2xl mx-auto px-3 sm:px-0 pt-2 sm:pt-0 pb-3 sm:pb-0" style={isMobile ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' } : undefined}>
                <div className="flex items-end gap-2 p-2 rounded-2xl bg-card border border-border-subtle shadow-[var(--shadow-card)] focus-within:border-accent/50 transition-colors">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={handleFocus}
                        rows={1}
                        placeholder={uid ? 'Ask about anything you’ve saved…' : 'Loading your library…'}
                        disabled={!uid}
                        dir={getDirection(input)}
                        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-text placeholder:text-text-muted focus:outline-none max-h-32 disabled:opacity-60"
                    />
                    <button
                        // Don't steal focus from the textarea — keeps the keyboard open
                        // and lets the click land reliably (no layout shift mid-tap).
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => send(input)}
                        disabled={!uid || isThinking || !input.trim()}
                        aria-label="Send"
                        className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <ArrowUp className="w-5 h-5" />
                    </button>
                </div>
                <p className="hidden sm:block text-center text-[11px] text-text-muted mt-2">
                    Answers are grounded only in what you&apos;ve saved.
                </p>
            </div>

            <ConfirmDialog
                isOpen={confirmClear}
                onClose={() => setConfirmClear(false)}
                onConfirm={clearChat}
                title="Clear this chat?"
                message="This removes the whole conversation. Your saved cards aren’t affected."
                confirmLabel="Clear chat"
                cancelLabel="Keep it"
                variant="danger"
            />
        </div>
    );
}
