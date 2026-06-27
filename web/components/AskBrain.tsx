'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircleQuestion, ArrowUp, FileText, Brain, RotateCcw } from 'lucide-react';
import { getDirection } from '@/lib/rtl';
import { getPlatform, platformIcon, platformActiveStyle, platformColor, PLATFORM_LABELS } from '@/lib/platform';

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
}

const SUGGESTIONS = [
    'What have I saved about productivity?',
    'Summarize the key ideas from my recent saves',
    'What did I save about AI?',
    'Find that article about habits',
];

export default function AskBrain({ uid, totalLinks, onOpenLink }: AskBrainProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    // On mobile the chrome above this view is much shorter than on desktop, so a
    // fixed height leaves the composer floating mid-screen. Measure our top edge
    // and fill to the bottom of the (dynamic) viewport instead. Desktop keeps its
    // CSS height (null = no inline override).
    const [mobileHeight, setMobileHeight] = useState<number | null>(null);
    // Gate persistence until after we've loaded any saved chat, so the first
    // (empty) render doesn't clobber what's in storage.
    const hydratedRef = useRef(false);

    useEffect(() => {
        const vv = window.visualViewport;
        const measure = () => {
            // sm breakpoint — desktop/tablet keep the CSS-defined height.
            if (window.matchMedia('(min-width: 640px)').matches) {
                setMobileHeight(null);
                return;
            }
            const el = rootRef.current;
            if (!el) return;
            const rectTop = el.getBoundingClientRect().top;
            // Size to the *visual* viewport so the composer tracks the keyboard: when
            // it opens, visualViewport.height shrinks and the box shrinks with it,
            // keeping the input just above the keyboard. getBoundingClientRect is
            // relative to the layout viewport, so subtract the visual viewport's
            // offset to get our top within the visible area.
            const viewportH = vv ? vv.height : window.innerHeight;
            const offsetTop = vv ? vv.offsetTop : 0;
            setMobileHeight(Math.max(viewportH - (rectTop - offsetTop) - 8, 240));
        };
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);
        vv?.addEventListener('resize', measure);
        vv?.addEventListener('scroll', measure);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
            vv?.removeEventListener('resize', measure);
            vv?.removeEventListener('scroll', measure);
        };
        // Re-measure once links load (empty state has no root ref to measure).
    }, [totalLinks]);

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

    // Keep the latest message in view as the conversation grows.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isThinking]);

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
            style={mobileHeight != null ? { height: mobileHeight } : undefined}
            className="flex flex-col min-h-[340px] animate-fade-in -mb-24 sm:mb-0 sm:h-[calc(100dvh-320px)]"
        >
            {/* Conversation */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 pb-4">
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
                            {SUGGESTIONS.map(s => (
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
                        {/* Clear — the chat persists across tabs/reloads until cleared here. */}
                        <div className="sticky top-0 z-10 flex justify-end mb-2">
                            <button
                                onClick={clearChat}
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
            <div className="max-w-2xl mx-auto w-full">
                <div className="flex items-end gap-2 p-2 rounded-2xl bg-card border border-border-subtle shadow-[var(--shadow-card)] focus-within:border-accent/50 transition-colors">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        placeholder={uid ? 'Ask your brain anything…' : 'Loading your brain…'}
                        disabled={!uid || isThinking}
                        dir={getDirection(input)}
                        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-text placeholder:text-text-muted focus:outline-none max-h-32 disabled:opacity-60"
                    />
                    <button
                        onClick={() => send(input)}
                        disabled={!uid || isThinking || !input.trim()}
                        aria-label="Send"
                        className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <ArrowUp className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-center text-[11px] text-text-muted mt-2">
                    Answers are grounded only in what you&apos;ve saved.
                </p>
            </div>
        </div>
    );
}
