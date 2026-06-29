'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { MessageCircleQuestion, ArrowUp, FileText, Brain, Plus, ChevronLeft, MessagesSquare, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { getDirection } from '@/lib/rtl';
import { getPlatform, platformIcon, platformActiveStyle, platformColor, PLATFORM_LABELS } from '@/lib/platform';
import { appCheckHeaders } from '@/lib/firebase';
import { ChatMessage, ChatSource, ChatSession } from '@/lib/types';
import { subscribeChats, createChat, updateChat, deleteChat } from '@/lib/chats';
import ConfirmDialog from './ConfirmDialog';
import ChatHistorySidebar from './ChatHistorySidebar';

/** The branded tag shown on a citation card: a platform (YouTube/X/…) when the
 *  URL reveals one, otherwise the publisher name (e.g. CNN), otherwise null. */
function sourceTag(s: ChatSource): { label: string; platform: ReturnType<typeof getPlatform> } | null {
    const platform = getPlatform(s.url || undefined);
    if (platform) return { label: PLATFORM_LABELS[platform], platform };
    const name = s.sourceName?.trim();
    if (name && !['none', 'screenshot', 'unknown'].includes(name.toLowerCase())) {
        return { label: name, platform: null };
    }
    if (s.category) return { label: s.category, platform: null };
    return null;
}

/** Renders an assistant answer as Markdown, styled to match the chat. GFM gives
 *  us tables/strikethrough; remark-breaks turns single newlines into <br> so the
 *  model's line breaks survive (like the old whitespace-pre-wrap). */
function MarkdownMessage({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc ps-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ps-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-hover">
                        {children}
                    </a>
                ),
                code: ({ children }) => <code className="px-1 py-0.5 rounded bg-card-hover text-[13px] font-mono">{children}</code>,
            }}
        >
            {content}
        </ReactMarkdown>
    );
}

/** Subtle "copy this answer" affordance shown under each assistant bubble. */
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable — silently no-op */ }
    };
    return (
        <button
            onClick={onCopy}
            aria-label={copied ? 'Copied' : 'Copy answer'}
            className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-text-muted text-xs hover:text-text transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
        >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
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

const HISTORY_COLLAPSE_KEY = 'askbrain:histcollapsed';

export default function AskBrain({ uid, totalLinks, onOpenLink, onExit, categories }: AskBrainProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Saved conversations (Firestore: users/{uid}/chats) ────────────────────
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [chatsLoaded, setChatsLoaded] = useState(false);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [chatToDelete, setChatToDelete] = useState<string | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);          // mobile drawer
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // desktop panel

    // Mirrors of state for use inside async/debounced closures without re-subscribing.
    const activeChatIdRef = useRef<string | null>(null);
    const lastSavedRef = useRef<string>('');   // signature of the last persisted messages
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Gate persistence until the initial load/migration has run, so the first
    // (empty) render doesn't create a stray chat.
    const hydratedRef = useRef(false);

    // Suggested prompts built from the user's own categories so they're always
    // relevant to what's actually saved. Rotated by a per-open random offset for
    // light variety — all client-side, no extra tokens.
    const rotation = useRef(Math.floor(Math.random() * 997)).current;
    const suggestions = useMemo(() => {
        const cats = (categories ?? []).filter(Boolean);
        if (!cats.length) return [] as string[];
        const start = rotation % cats.length;
        const [a, b, c] = [...cats.slice(start), ...cats.slice(0, start)];
        // Varied, action-oriented prompts (not the same "What have I saved about X?"
        // each time) — but each must stand on its own, so no forced cross-topic
        // links between unrelated categories. All client-side.
        const out: string[] = [`What are the key takeaways from my ${a} saves?`];
        if (b) out.push(`Summarize what I've saved on ${b}`);
        if (c && c !== a) out.push(`What's the latest I saved about ${c}?`);
        out.push('Give me a quick recap of my recent saves');
        return out.slice(0, 4);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories?.join('|'), rotation]);

    // On phones the Ask view is a full-screen chat pinned to the *visual* viewport
    // so the composer rides the keyboard like a native chat app. On desktop it
    // stays an inline panel beside the history sidebar.
    const [isMobile, setIsMobile] = useState(false);
    const [deskHeight, setDeskHeight] = useState<number | null>(null);
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

    // Desktop: fill from the panel's top down to the viewport bottom so the
    // composer sits at the very bottom and the sidebar spans the full height —
    // no dead space, no guessed offset. Recomputed on resize.
    useEffect(() => {
        if (isMobile) return;
        const el = rootRef.current;
        if (!el) return;
        const measure = () => {
            // Viewport-relative top → fill to the bottom of the window. In Ask mode
            // the view fills the viewport so the page doesn't scroll and this stays put.
            const top = el.getBoundingClientRect().top;
            setDeskHeight(Math.max(360, window.innerHeight - top - 12));
        };
        measure();
        const raf = requestAnimationFrame(measure);
        window.addEventListener('resize', measure);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
    }, [isMobile, totalLinks]);

    // Restore the desktop sidebar's collapsed preference.
    useEffect(() => {
        try {
            if (localStorage.getItem(HISTORY_COLLAPSE_KEY) === '1') setSidebarCollapsed(true);
        } catch { /* ignore blocked storage */ }
    }, []);
    const toggleSidebar = () => {
        setSidebarCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem(HISTORY_COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
            return next;
        });
    };

    // Live-subscribe to the saved conversations so the history list stays in sync
    // across devices (mirrors how Feed.tsx subscribes to links).
    useEffect(() => {
        if (!uid) return;
        const unsub = subscribeChats(uid, next => { setChats(next); setChatsLoaded(true); });
        return () => { unsub(); setChatsLoaded(false); };
    }, [uid]);

    // One-time init after the first chats snapshot. We deliberately start on a
    // fresh, empty New chat after every load/refresh — past conversations stay in
    // the sidebar and can be reopened explicitly. We only migrate any legacy
    // single-conversation localStorage into saved history so it isn't lost.
    useEffect(() => {
        if (!uid || !chatsLoaded || hydratedRef.current) return;
        hydratedRef.current = true;
        const legacyKey = `askbrain:chat:${uid}`;
        let legacy: ChatMessage[] | null = null;
        try {
            const raw = localStorage.getItem(legacyKey);
            if (raw) legacy = JSON.parse(raw);
        } catch { /* ignore corrupt/blocked storage */ }

        (async () => {
            if (legacy && legacy.length > 0 && chats.length === 0) {
                try { await createChat(uid, legacy); } catch { /* ignore */ }
            }
            if (legacy) { try { localStorage.removeItem(legacyKey); } catch { /* ignore */ } }
        })();
    }, [uid, chatsLoaded, chats]);

    // Persist the working conversation: create on the first assistant reply,
    // then update in place. Skips writes when content is unchanged.
    const persistConversation = useCallback(async (msgs: ChatMessage[]) => {
        if (!uid) return;
        if (!msgs.some(m => m.role === 'assistant')) return; // wait for a real exchange
        const sig = JSON.stringify(msgs);
        if (sig === lastSavedRef.current) return;
        try {
            if (activeChatIdRef.current) {
                await updateChat(uid, activeChatIdRef.current, { messages: msgs });
            } else {
                const id = await createChat(uid, msgs);
                activeChatIdRef.current = id;
                setActiveChatId(id);
            }
            lastSavedRef.current = sig;
        } catch { /* transient write error; snapshot keeps the list consistent */ }
    }, [uid]);

    // Debounced auto-save as the conversation grows.
    useEffect(() => {
        if (!uid || !hydratedRef.current || messages.length === 0) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        const snapshot = messages;
        saveTimer.current = setTimeout(() => persistConversation(snapshot), 600);
        return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    }, [messages, uid, persistConversation]);

    // ── Conversation actions ──────────────────────────────────────────────────
    const newChat = () => {
        setActiveChatId(null);
        activeChatIdRef.current = null;
        setMessages([]);
        lastSavedRef.current = '';
        setInput('');
        textareaRef.current?.focus();
    };

    const selectChat = (id: string) => {
        const chat = chats.find(c => c.id === id);
        if (!chat) return;
        setActiveChatId(id);
        activeChatIdRef.current = id;
        setMessages(chat.messages);
        lastSavedRef.current = JSON.stringify(chat.messages);
        setInput('');
    };

    const renameChat = (id: string, title: string) => {
        if (!uid) return;
        const chat = chats.find(c => c.id === id);
        // Preserve list ordering — a rename shouldn't resurface the chat.
        updateChat(uid, id, { title, updatedAt: chat?.updatedAt }).catch(() => {});
    };

    const confirmDeleteChat = () => {
        if (!uid || !chatToDelete) return;
        const id = chatToDelete;
        deleteChat(uid, id).catch(() => {});
        if (id === activeChatId) newChat();
        setChatToDelete(null);
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

    // Scroll-to-dismiss: dragging the conversation collapses the keyboard (like
    // the iOS Messages/Claude chat), leaving just the input field. Use a real
    // touch drag past a small threshold so taps — and the programmatic scroll
    // after sending — don't dismiss it.
    const touchStartY = useRef(0);
    const onConvTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
    const onConvTouchMove = (e: React.TouchEvent) => {
        if (!isMobile || document.activeElement !== textareaRef.current) return;
        if (Math.abs(e.touches[0].clientY - touchStartY.current) > 12) {
            textareaRef.current?.blur();
        }
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
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                    ...(await appCheckHeaders()),
                },
                body: JSON.stringify({ uid, question, history, stream: true }),
            });

            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('text/event-stream') && res.body) {
                // Streaming backend: drop an empty in-progress bubble, then fold each
                // SSE event into it. We mutate the *last* message (this assistant turn)
                // immutably so React re-renders as tokens land.
                setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [] }]);
                const patchLast = (patch: Partial<ChatMessage>) =>
                    setMessages(prev => {
                        const next = [...prev];
                        const last = next[next.length - 1];
                        next[next.length - 1] = { ...last, ...patch };
                        return next;
                    });
                const appendText = (text: string) =>
                    setMessages(prev => {
                        const next = [...prev];
                        const last = next[next.length - 1];
                        next[next.length - 1] = { ...last, content: last.content + text };
                        return next;
                    });

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let firstToken = true;
                let done = false;
                while (!done) {
                    const { value, done: streamDone } = await reader.read();
                    if (streamDone) break;
                    buffer += decoder.decode(value, { stream: true });
                    // Events are separated by a blank line; keep the trailing partial.
                    const chunks = buffer.split('\n\n');
                    buffer = chunks.pop() ?? '';
                    for (const chunk of chunks) {
                        const line = chunk.split('\n').find(l => l.startsWith('data:'));
                        if (!line) continue;
                        let evt: { type?: string; text?: string; sources?: ChatSource[]; error?: string };
                        try {
                            evt = JSON.parse(line.slice(line.indexOf(':') + 1).trim());
                        } catch { continue; }
                        if (evt.type === 'token') {
                            if (firstToken) { setIsThinking(false); firstToken = false; }
                            appendText(evt.text || '');
                        } else if (evt.type === 'sources') {
                            patchLast({ sources: evt.sources || [] });
                        } else if (evt.type === 'error') {
                            setIsThinking(false);
                            patchLast({ content: evt.error || 'Something went wrong reaching your brain. Please try again.', error: true });
                            done = true;
                        } else if (evt.type === 'done') {
                            done = true;
                        }
                    }
                }
                return;
            }

            // Non-streaming backend (current prod): existing JSON behavior unchanged.
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

    // The chat column (top bar on mobile + conversation + composer) is shared by
    // both layouts; the desktop layout wraps it next to the history sidebar.
    const chatColumn = (
        <div className={isMobile ? 'flex flex-col flex-1 min-h-0' : 'flex flex-col flex-1 min-w-0 min-h-0 h-full sm:ps-5'}>
            {/* Mobile-only top bar: back, history, title, New chat. */}
            {isMobile && (
                <div className="flex items-center gap-1 px-2 h-12 shrink-0 border-b border-border-subtle">
                    <button
                        onClick={onExit}
                        aria-label="Back"
                        className="p-2 -ms-1 rounded-full text-text-secondary hover:text-text active:bg-card-hover transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setHistoryOpen(true)}
                        aria-label="Chat history"
                        className="p-2 rounded-full text-text-secondary hover:text-text active:bg-card-hover transition-colors"
                    >
                        <MessagesSquare className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-text truncate">Ask your brain</span>
                    {!isEmpty && (
                        <button
                            onClick={newChat}
                            className="ms-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-text-muted text-xs font-medium hover:text-text active:bg-card-hover transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            New
                        </button>
                    )}
                </div>
            )}

            {/* Conversation */}
            <div
                ref={scrollRef}
                onTouchStart={onConvTouchStart}
                onTouchMove={onConvTouchMove}
                className="flex-1 flex flex-col overflow-y-auto px-3 sm:px-1 pt-1 pb-4 overscroll-contain scrollbar-soft"
            >
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
                    <div className="w-full max-w-2xl mx-auto mt-auto py-2">
                        <div className="space-y-5">
                        {messages.map((m, i) => (
                            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start group'}>
                                <div className={m.role === 'user' ? 'max-w-[85%]' : 'max-w-[90%] w-full'}>
                                    <div
                                        dir={getDirection(m.content)}
                                        className={
                                            m.role === 'user'
                                                // User message: a compact accent pill.
                                                ? 'px-4 py-2.5 rounded-2xl rounded-br-md bg-accent text-white text-[15px] leading-relaxed'
                                                : m.error
                                                    // Errors keep a subtle container so they stand out.
                                                    ? 'px-4 py-3 rounded-2xl rounded-bl-md text-[15px] leading-relaxed bg-red-500/10 border border-red-500/20 text-text whitespace-pre-wrap'
                                                    // AI answer: plain text on the page (no bubble), like Gemini.
                                                    : 'px-1 text-[15px] leading-relaxed text-text'
                                        }
                                    >
                                        {/* User and error bubbles stay plain text; assistant answers render Markdown. */}
                                        {m.role === 'assistant' && !m.error
                                            ? <MarkdownMessage content={m.content} />
                                            : m.content}
                                    </div>

                                    {/* Copy affordance — subtle, under non-error assistant answers. */}
                                    {m.role === 'assistant' && !m.error && m.content && (
                                        <CopyButton text={m.content} />
                                    )}

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
                                <div className="px-1 py-1 inline-flex items-center gap-1.5">
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
        </div>
    );

    return (
        <div
            ref={rootRef}
            style={!isMobile && deskHeight ? { height: deskHeight } : undefined}
            className={`animate-fade-in ${isMobile
                ? 'fixed inset-x-0 top-0 z-50 bg-background flex flex-col'
                : 'flex min-h-[360px]'
                }`}
        >
            {/* Desktop: persistent history panel beside the chat. */}
            {!isMobile && (
                <ChatHistorySidebar
                    variant="desktop"
                    chats={chats}
                    activeChatId={activeChatId}
                    onSelect={selectChat}
                    onNewChat={newChat}
                    onRename={renameChat}
                    onRequestDelete={(id) => setChatToDelete(id)}
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={toggleSidebar}
                />
            )}

            {chatColumn}

            {/* Mobile: history as a slide-over drawer above the chat. */}
            {isMobile && (
                <ChatHistorySidebar
                    variant="mobile"
                    chats={chats}
                    activeChatId={activeChatId}
                    onSelect={selectChat}
                    onNewChat={newChat}
                    onRename={renameChat}
                    onRequestDelete={(id) => setChatToDelete(id)}
                    open={historyOpen}
                    onClose={() => setHistoryOpen(false)}
                />
            )}

            <ConfirmDialog
                isOpen={chatToDelete !== null}
                onClose={() => setChatToDelete(null)}
                onConfirm={confirmDeleteChat}
                title="Delete this chat?"
                message="This permanently removes the conversation from your history. Your saved cards aren’t affected."
                confirmLabel="Delete"
                cancelLabel="Keep it"
                variant="danger"
            />
        </div>
    );
}
