'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowUp, FileText, Plus, MessagesSquare, Copy, Check, TriangleAlert, Sparkles, RefreshCw, Square, RotateCcw, ArrowDown, X, PanelLeftOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { getDirection } from '@/lib/rtl';
import { getPlatform, platformIcon, platformActiveStyle, platformColor, PLATFORM_LABELS, xHandle, linkedinDisplayName } from '@/lib/platform';
import { appCheckHeaders } from '@/lib/firebase';
import { authHeaders } from '@/lib/auth';
import { apiUrl, isNativeApp, fetchWithTimeout } from '@/lib/api';
import { trackFirstAsk, trackAskNoCitations, trackAskSuggestionUsed, trackAskFollowupUsed, trackAskStopped } from '@/lib/analytics';
import { reportError } from '@/lib/errorReporter';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import { ChatMessage, ChatSource, ChatSession, Link } from '@/lib/types';
import { buildAskSuggestions, buildFollowUps, newestReadyLink, ClassifiableCard } from '@/lib/askSuggestions';
import { subscribeChats, createChat, updateChat, deleteChat } from '@/lib/chats';
import { hapticLight } from '@/lib/haptics';
import ConfirmDialog from './ConfirmDialog';
import ChatHistorySidebar from './ChatHistorySidebar';
import MobileSubheader from './MobileSubheader';
import { IconButton } from './ui/Button';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/useScrollLock';

/** A usable source name, or null for placeholders the backend stores. */
function meaningfulName(name?: string | null): string | null {
    const s = name?.trim();
    if (s && !['none', 'screenshot', 'unknown', 'linkedin'].includes(s.toLowerCase())) return s;
    return null;
}

/** The byline shown on a citation card: the *specific* source identity when we
 *  can resolve one — an X @handle, a LinkedIn author, a channel/page or
 *  publisher name — otherwise the platform label, otherwise the category. The
 *  returned platform drives the brand icon/color. */
function sourceTag(s: ChatSource): { label: string; platform: ReturnType<typeof getPlatform> } | null {
    const platform = getPlatform(s.url || undefined);
    const name = meaningfulName(s.sourceName);
    if (platform === 'x') {
        const h = xHandle(s.url || undefined);
        return { label: h ? `@${h}` : (name || PLATFORM_LABELS[platform]), platform };
    }
    if (platform === 'linkedin') {
        return { label: linkedinDisplayName(s.url || undefined, s.sourceName) || PLATFORM_LABELS[platform], platform };
    }
    if (platform) {
        // YouTube channel / Facebook page / etc.: prefer the captured name.
        return { label: name || PLATFORM_LABELS[platform], platform };
    }
    if (name) return { label: name, platform: null };
    if (s.category) return { label: s.category, platform: null };
    return null;
}

/** The model sometimes writes bullets as literal glyphs ("• a • b • c"),
 *  often inline in one paragraph — Markdown doesn't parse those as a list, so
 *  they render as a wall of text. Normalize them to real Markdown list items:
 *  line-leading bullet glyphs become "- ", inline " • " separators break into
 *  new items, and "1)" numbering becomes "1.". */
function normalizeListMarkers(md: string): string {
    return md
        .replace(/^([ \t]*)[•◦▪‣·][ \t]+/gm, '$1- ')
        .replace(/[ \t]+[•◦▪‣][ \t]+/g, '\n- ')
        .replace(/^([ \t]*)(\d{1,2})\)[ \t]+/gm, '$1$2. ');
}

/** Renders an assistant answer as Markdown, styled to match the chat. GFM gives
 *  us tables/strikethrough; remark-breaks turns single newlines into <br> so the
 *  model's line breaks survive (like the old whitespace-pre-wrap). */
function MarkdownMessage({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
                // dir="auto" per block so each line/item aligns by its own first
                // strong character — an English answer that cites a Hebrew title
                // stays left-aligned, while a Hebrew line renders RTL.
                p: ({ children }) => <p dir="auto" className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul dir="auto" className="list-disc ps-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol dir="auto" className="list-decimal ps-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
                li: ({ children }) => <li dir="auto" className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-hover">
                        {children}
                    </a>
                ),
                code: ({ children }) => <code className="px-1 py-0.5 rounded bg-card-hover text-[13px] font-mono">{children}</code>,
            }}
        >
            {normalizeListMarkers(content)}
        </ReactMarkdown>
    );
}

/** Subtle "copy this answer" affordance shown under each assistant bubble.
 *  When the answer has citations, the copied text carries them along as a
 *  "Sources:" list — a pasted answer keeps its proof. */
function CopyButton({ text, sources }: { text: string; sources?: ChatSource[] }) {
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        try {
            let full = text;
            if (sources && sources.length > 0) {
                full += '\n\nSources:\n' + sources
                    .map(s => (s.url ? `- ${s.title} — ${s.url}` : `- ${s.title}`))
                    .join('\n');
            }
            await navigator.clipboard.writeText(full);
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

/** How the current ask was initiated — drives the thinking micro-copy so the
 *  status matches what's actually happening from the user's point of view.
 *  Tapping a chip the SYSTEM suggested about a specific card must not read
 *  "Searching your library…" (we suggested it; there's nothing to find). */
export type AskOrigin =
    | 'free'      // typed question → genuine library search
    | 'card'      // a chip about one specific card we suggested
    | 'library'   // a chip that genuinely sweeps the library (week/topic/recap)
    | 'followup'; // continuing the thread about already-cited sources

const THINKING_STAGES: Record<AskOrigin, string[]> = {
    // Count-free phrasing on purpose: these must always be true.
    free: ['Searching your library…', 'Reviewing relevant cards…', 'Writing your answer…'],
    card: ['Opening that card…', 'Reading it closely…', 'Writing your answer…'],
    library: ['Searching your library…', 'Reviewing relevant cards…', 'Writing your answer…'],
    followup: ['Re-reading the sources…', 'Thinking it through…', 'Writing your answer…'],
};

/** Staged "what Machina is doing" status shown while waiting for the answer —
 *  honest theater (mirrors the real pipeline) that makes the wait legible
 *  instead of three anonymous dots. Remounts per ask. */
function ThinkingIndicator({ origin }: { origin: AskOrigin }) {
    const stages = THINKING_STAGES[origin];
    const [stage, setStage] = useState(0);
    useEffect(() => {
        const t1 = setTimeout(() => setStage(1), 1600);
        const t2 = setTimeout(() => setStage(2), 4200);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);
    return (
        <div className="flex justify-start">
            <div className="px-1 py-1 inline-flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" />
                </span>
                <span key={stage} className="text-[13px] text-text-muted animate-fade-in">{stages[stage]}</span>
            </div>
        </div>
    );
}

interface AskBrainProps {
    uid: string | null;
    totalLinks: number;
    onOpenLink: (id: string) => void;
    /** Leave Ask mode (mobile shows a back button; desktop exits via the toolbar). */
    onExit?: () => void;
    /** True while a Feed-owned overlay (the cited-card LinkDetailModal, a sheet,
     *  a confirm dialog) is open ON TOP of Ask. That surface owns the edge-swipe
     *  back gesture and registers its own handler, so Ask must stand down —
     *  otherwise the single swipe fires both and pops Ask out to the home screen
     *  underneath the closing modal. See useEdgeSwipeBack's layering rule. */
    overlayOpen?: boolean;
    /** The live library (Feed's Firestore snapshot) — powers suggestions that
     *  react the moment a new card lands. */
    links: Link[];
}

const HISTORY_COLLAPSE_KEY = 'askbrain:histcollapsed';

export default function AskBrain({ uid, totalLinks, onOpenLink, onExit, overlayOpen = false, links }: AskBrainProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    // How the in-flight ask was initiated — picks the thinking micro-copy.
    const [askOrigin, setAskOrigin] = useState<AskOrigin>('free');
    // True while an SSE answer is still writing (isThinking covers only the
    // pre-first-token wait). Together they gate the Stop affordance.
    const [isStreaming, setIsStreaming] = useState(false);
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

    // Stream lifecycle guard. Every send() captures the current generation; any
    // action that invalidates the in-flight stream (New chat, switching chats, or
    // starting another send) bumps `streamGenRef` and aborts the live fetch. The
    // reader loop re-checks its captured generation before each setMessages, so a
    // stale stream can't patch the wrong conversation or index past its bubble.
    const streamGenRef = useRef(0);
    const streamAbortRef = useRef<AbortController | null>(null);

    /** Invalidate any in-flight stream and return the new generation to capture. */
    const bumpStreamGen = () => {
        streamAbortRef.current?.abort();
        streamAbortRef.current = null;
        streamGenRef.current += 1;
        return streamGenRef.current;
    };

    // Living suggested prompts, built from the actual library (newest save,
    // this week's activity, shared concepts, top categories, a dusty card) and
    // recomputed on every links snapshot — so a card saved while Ask is open
    // shows up in the chips immediately. `suggestSalt` rotates the mix and the
    // phrasing; "More ideas" bumps it. All client-side, no extra tokens.
    const [suggestSalt, setSuggestSalt] = useState(() => Math.floor(Math.random() * 997));
    const suggestions = useMemo(() => buildAskSuggestions(links, suggestSalt), [links, suggestSalt]);

    // One-tap follow-ups under the latest answer, tailored to what it actually
    // discussed. The answer's citations only carry id/title/category, but the
    // full library card (tags/concepts/summary/type) is already loaded — so we
    // resolve each cited id to its Link and let the classifier read it. Pure,
    // client-side, no extra call. Recomputed as the conversation and library move.
    const followUps = useMemo(() => {
        if (messages.length === 0) return [];
        const last = messages[messages.length - 1];
        if (last.role !== 'assistant' || last.error || !last.content) return [];
        // No grounding, no chips: an ungrounded (or citation-less) answer has
        // nothing a follow-up can be guaranteed against — offering "give me the
        // key points" of an answer the backend already flagged reads as slop.
        if (last.ungrounded || !last.sources || last.sources.length === 0) return [];
        const byId = new Map(links.map(l => [l.id, l]));
        const citedCards: ClassifiableCard[] = (last.sources ?? []).map(s =>
            byId.get(s.id) ?? { id: s.id, title: s.title, category: s.category ?? undefined }
        );
        // Everything asked/tapped this session, so a used chip is never re-offered.
        const askedTexts = messages.filter(m => m.role === 'user').map(m => m.content);
        const exchangeCount = messages.filter(m => m.role === 'assistant' && !m.error).length;
        return buildFollowUps({ citedCards, allLinks: links, askedTexts, exchangeCount });
    }, [messages, links]);

    // Watch for a brand-new card landing while a conversation is open and offer
    // it as a one-tap ask ("Just saved — ask about it"). The empty state doesn't
    // need this — its latest-save chip already updates live.
    const seenNewestRef = useRef<{ id: string; ts: number } | null>(null);
    const [freshCard, setFreshCard] = useState<{ id: string; title: string } | null>(null);
    useEffect(() => {
        const newest = newestReadyLink(links);
        if (!newest) return;
        const ts = typeof newest.createdAt === 'number' ? newest.createdAt : Date.parse(String(newest.createdAt)) || 0;
        const seen = seenNewestRef.current;
        if (seen && newest.id !== seen.id && ts > seen.ts) {
            setFreshCard({ id: newest.id, title: newest.title });
        }
        seenNewestRef.current = { id: newest.id, ts };
    }, [links]);

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

    // Swipe in from the left edge to go back — closes the history drawer first if
    // it's open, otherwise leaves Ask mode (matching the iOS pop gesture).
    //
    // Only fires when Ask is the top-most surface. When a stacked surface is open
    // above the chat it owns the back gesture and Ask stands down (see the
    // layering rule in useEdgeSwipeBack): a Feed-owned overlay (`overlayOpen` —
    // the cited-card modal / sheets, which register their own edge-swipe) or Ask's
    // own delete-confirm dialog. The history drawer stays handled here (it has no
    // handler of its own), so the swipe closes it rather than exiting Ask.
    const askEdgeSwipeEnabled = isMobile && !overlayOpen && chatToDelete === null;
    useEdgeSwipeBack(() => {
        if (historyOpen) setHistoryOpen(false);
        else onExit?.();
    }, askEdgeSwipeEnabled);

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
        lockBodyScroll();
        return () => {
            vvObj?.removeEventListener('resize', sync);
            vvObj?.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
            window.removeEventListener('orientationchange', sync);
            unlockBodyScroll();
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
        } catch (e) {
            // Transient write error; the live snapshot keeps the list consistent.
            reportError(e, 'ask-persist-conversation');
        }
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
        bumpStreamGen();            // abandon any in-flight stream from the old chat
        setIsThinking(false);
        setIsStreaming(false);
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
        bumpStreamGen();            // abandon any in-flight stream before swapping
        setIsThinking(false);
        setIsStreaming(false);
        setActiveChatId(id);
        activeChatIdRef.current = id;
        setMessages(chat.messages);
        lastSavedRef.current = JSON.stringify(chat.messages);
        setInput('');
        // Open on the last exchange, question-first (consistent with new asks).
        let lastUser = -1;
        for (let i = chat.messages.length - 1; i >= 0; i--) {
            if (chat.messages[i].role === 'user') { lastUser = i; break; }
        }
        if (lastUser >= 0) pinQuestionToTop(lastUser, 'auto');
    };

    const renameChat = (id: string, title: string) => {
        if (!uid) return;
        const chat = chats.find(c => c.id === id);
        // Preserve list ordering — a rename shouldn't resurface the chat.
        updateChat(uid, id, { title, updatedAt: chat?.updatedAt })
            .catch((e) => reportError(e, 'ask-rename-chat'));
    };

    const confirmDeleteChat = () => {
        if (!uid || !chatToDelete) return;
        const id = chatToDelete;
        deleteChat(uid, id).catch((e) => reportError(e, 'ask-delete-chat'));
        if (id === activeChatId) newChat();
        setChatToDelete(null);
    };

    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    };

    // Answer-first scrolling: instead of pinning the view to the BOTTOM of a
    // new answer (which forces a scroll-up to read from the start), pin the
    // asked QUESTION to the top of the viewport — the user sees their question
    // and the beginning of the reply, and reads downward. A "jump to latest"
    // pill covers long answers.
    const [showJump, setShowJump] = useState(false);
    const handleConvScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight >= 80);
    };
    const jumpToLatest = () => {
        setShowJump(false);
        scrollToBottom();
    };
    /** Scroll so the message at `idx` sits at the top of the conversation view. */
    const pinQuestionToTop = (idx: number, behavior: ScrollBehavior = 'smooth') => {
        requestAnimationFrame(() => {
            const container = scrollRef.current;
            if (!container) return;
            const el = container.querySelector(`[data-msg-idx="${idx}"]`) as HTMLElement | null;
            if (!el) return;
            const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 8;
            container.scrollTo({ top: Math.max(0, top), behavior });
        });
    };

    // When the input gains focus (keyboard opening), re-sync the surface height.
    // Deliberately no scroll — the reader keeps their place in the answer.
    const handleFocus = () => {
        setTimeout(() => { syncViewportRef.current(); }, 120);
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

    // Grow the composer with its content (capped by max-h-32), shrinking back
    // when cleared — rows={1} alone never grows.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }, [input]);

    // Desktop: "/" focuses the composer from anywhere in Ask mode (unless
    // already typing somewhere), mirroring the common chat-app shortcut.
    useEffect(() => {
        if (isMobile) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            const t = document.activeElement as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            e.preventDefault();
            textareaRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isMobile]);

    /** Ask a question. `base` overrides the conversation the turn builds on —
     *  used by retry to drop a failed exchange before re-sending. `origin`
     *  records how the ask started, which picks the thinking micro-copy. */
    const send = async (text: string, base?: ChatMessage[], origin: AskOrigin = 'free') => {
        const question = text.trim();
        if (!question || isThinking || !uid) return;
        setAskOrigin(origin);

        // Start a fresh stream generation — aborts any prior in-flight stream and
        // gives us a token every downstream update re-checks before touching state.
        const gen = bumpStreamGen();
        const controller = new AbortController();
        streamAbortRef.current = controller;
        const isStale = () => streamGenRef.current !== gen;

        // History = the conversation so far (before this turn), trimmed server-side.
        const baseMsgs = base ?? messages;
        const history = baseMsgs.map(m => ({ role: m.role, content: m.content }));

        setMessages([...baseMsgs, { role: 'user', content: question }]);
        setInput('');
        setIsThinking(true);
        setIsStreaming(false);
        setShowJump(false);
        // Bring the fresh question to the top of the view; the thinking status
        // and then the answer unfold right below it.
        const questionIdx = baseMsgs.length;
        pinQuestionToTop(questionIdx);

        // The native shell's WKWebView reads streamed (SSE) response bodies
        // unreliably and aborts mid-stream, which surfaced as "Couldn't reach
        // Machina". So in the app we ask for a single buffered JSON answer; the
        // browser still streams token-by-token.
        const wantStream = !isNativeApp();

        try {
            // 30s bounds connection setup only; for the streaming path fetch()
            // resolves on headers, so a long token stream is not cut off.
            const res = await fetchWithTimeout(apiUrl('/api/chat'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: wantStream ? 'text/event-stream' : 'application/json',
                    ...(await appCheckHeaders()),
                    ...(await authHeaders()),
                },
                body: JSON.stringify({ uid, question, history, stream: wantStream }),
                signal: controller.signal,
            }, 30_000);

            if (isStale()) return; // superseded while the request was in flight

            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('text/event-stream') && res.body) {
                // Streaming backend: append an empty in-progress bubble and remember
                // ITS index, so every subsequent patch targets that exact message —
                // not "the last one", which a concurrent action could have changed.
                let assistantIdx = -1;
                setMessages(prev => {
                    assistantIdx = prev.length;
                    return [...prev, { role: 'assistant', content: '', sources: [] }];
                });
                // Patch the tracked assistant bubble by index; no-op if it's gone
                // (e.g. the conversation was swapped out from under us).
                const patchAt = (patch: Partial<ChatMessage>) =>
                    setMessages(prev => {
                        if (assistantIdx < 0 || assistantIdx >= prev.length) return prev;
                        const next = [...prev];
                        next[assistantIdx] = { ...next[assistantIdx], ...patch };
                        return next;
                    });
                const appendText = (chunk: string) =>
                    setMessages(prev => {
                        if (assistantIdx < 0 || assistantIdx >= prev.length) return prev;
                        const next = [...prev];
                        next[assistantIdx] = { ...next[assistantIdx], content: next[assistantIdx].content + chunk };
                        return next;
                    });

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let firstToken = true;
                let done = false;
                while (!done) {
                    // Bail the moment this stream is superseded: stop reading and
                    // release the connection so a stale stream never mutates state.
                    if (isStale()) { try { await reader.cancel(); } catch { /* ignore */ } return; }
                    const { value, done: streamDone } = await reader.read();
                    if (streamDone) break;
                    if (isStale()) { try { await reader.cancel(); } catch { /* ignore */ } return; }
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
                        if (isStale()) { try { await reader.cancel(); } catch { /* ignore */ } return; }
                        if (evt.type === 'token') {
                            if (firstToken) {
                                setIsThinking(false);
                                setIsStreaming(true);
                                firstToken = false;
                                // Re-pin now that content can actually overflow —
                                // the first pin may have had no scroll room yet.
                                pinQuestionToTop(questionIdx);
                            }
                            appendText(evt.text || '');
                        } else if (evt.type === 'sources') {
                            patchAt({ sources: evt.sources || [] });
                        } else if (evt.type === 'ungrounded') {
                            // Answer couldn't be tied to any save — downgrade it
                            // (arrives after the prose, in place of source chips).
                            patchAt({ ungrounded: true });
                            trackAskNoCitations();
                        } else if (evt.type === 'error') {
                            setIsThinking(false);
                            patchAt({ content: evt.error || 'Something went wrong reaching Machina. Please try again.', error: true });
                            done = true;
                        } else if (evt.type === 'done') {
                            done = true;
                            trackFirstAsk();
                            hapticLight();
                        }
                    }
                }
                return;
            }

            // Non-streaming backend (current prod): existing JSON behavior unchanged.
            const data = await res.json();
            if (isStale()) return; // superseded while parsing the response

            if (data.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.answer || "I couldn't find an answer for that.",
                    sources: data.sources || [],
                    ungrounded: Boolean(data.ungrounded),
                }]);
                trackFirstAsk();
                hapticLight();
                // Buffered path (native): the whole answer just landed at once —
                // show it from the top, question first.
                pinQuestionToTop(questionIdx);
                if (data.ungrounded) trackAskNoCitations();
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.error || 'Something went wrong reaching Machina. Please try again.',
                    error: true,
                }]);
            }
        } catch {
            // A deliberate abort (New/switch/re-send) is not a user-facing error.
            if (isStale()) return;
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Couldn’t reach Machina. Check your connection and try again.',
                error: true,
            }]);
        } finally {
            // Only the current generation owns these — a superseded run must not
            // clear the newer stream's thinking state or abort controller.
            if (!isStale()) {
                setIsThinking(false);
                setIsStreaming(false);
                if (streamAbortRef.current === controller) streamAbortRef.current = null;
            }
            // Intentionally do NOT refocus the textarea here. Auto-focusing forced
            // the iOS keyboard open after every answer, so the user had to dismiss
            // it before tapping a source card. Leaving focus as-is keeps the
            // keyboard closed when it was closed (and untouched if the user is
            // still typing).
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };

    const busy = isThinking || isStreaming;

    // Stop an in-flight answer. Whatever already streamed in stays (the
    // debounced auto-save keeps it); the pre-token wait just cancels cleanly.
    const stopGeneration = () => {
        if (!busy) return;
        bumpStreamGen();
        setIsThinking(false);
        setIsStreaming(false);
        trackAskStopped();
    };

    // One-tap retry for a failed exchange: drop the trailing user+error pair
    // and re-send the same question, so the history the model sees is clean.
    const retryLast = () => {
        const errIdx = messages.length - 1;
        if (errIdx < 0 || !messages[errIdx].error) return;
        let userIdx = -1;
        for (let i = errIdx - 1; i >= 0; i--) {
            if (messages[i].role === 'user') { userIdx = i; break; }
        }
        if (userIdx < 0) return;
        send(messages[userIdx].content, messages.slice(0, userIdx));
    };

    // Library is empty — nothing to ask yet.
    if (totalLinks === 0) {
        return (
            <div className="text-center py-20 px-6 animate-fade-in">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-fill-subtle border border-border-subtle flex items-center justify-center">
                    <MessagesSquare className="w-7 h-7 text-text-secondary" strokeWidth={1.75} />
                </div>
                <h3 className="text-base font-bold text-text">Nothing to ask about yet</h3>
                <p className="mt-1.5 max-w-xs mx-auto text-sm text-text-muted leading-relaxed">
                    Machina answers only from what you&apos;ve saved. Add a few links first, then ask away.
                </p>
            </div>
        );
    }

    const isEmpty = messages.length === 0;

    // The chat column (top bar on mobile + conversation + composer) is shared by
    // both layouts; the desktop layout wraps it next to the history sidebar.
    const chatColumn = (
        <div className={isMobile ? 'flex flex-col flex-1 min-h-0' : 'flex flex-col flex-1 min-w-0 min-h-0 h-full sm:ps-5'}>
            {/* Mobile-only top bar: back, history, title, New chat. The fixed Ask
                overlay sits at the very top of the screen (it's position:fixed, so
                it ignores the body's safe-area padding), so the bar pads itself
                down past the status bar / notch. */}
            {isMobile && (
                <MobileSubheader
                    onBack={() => onExit?.()}
                    title="Ask Machina"
                    leading={
                        // A quiet icon button, same footprint as the back chevron and
                        // "New" action. The panel-open glyph signals it opens a side
                        // panel; a small dot badges an existing history without adding
                        // width. (Was a full "History" pill — too heavy in the bar.)
                        <button
                            onClick={() => setHistoryOpen(true)}
                            aria-label="Open chat history"
                            title="Chat history"
                            className="relative p-2 rounded-full text-text-secondary hover:text-text active:bg-card-hover transition-colors cursor-pointer"
                        >
                            <PanelLeftOpen className="w-5 h-5" />
                            {chats.length > 0 && (
                                <span className="absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-accent" />
                            )}
                        </button>
                    }
                >
                    {!isEmpty && (
                        <button
                            onClick={newChat}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-text-muted text-xs font-medium hover:text-text active:bg-card-hover transition-colors cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            New
                        </button>
                    )}
                </MobileSubheader>
            )}

            {/* Conversation */}
            <div
                ref={scrollRef}
                onTouchStart={onConvTouchStart}
                onTouchMove={onConvTouchMove}
                onScroll={handleConvScroll}
                className="flex-1 flex flex-col overflow-y-auto px-3 sm:px-1 pt-1 pb-4 overscroll-contain scrollbar-soft"
            >
                {isEmpty ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                        <div className="w-14 h-14 mb-4 rounded-2xl bg-fill-subtle border border-border-subtle flex items-center justify-center">
                            <MessagesSquare className="w-7 h-7 text-text-secondary" strokeWidth={1.75} />
                        </div>
                        <h2 className="text-xl font-semibold text-text mb-1.5">What do you want to recall?</h2>
                        <p className="text-text-muted text-sm max-w-xs mb-6 leading-relaxed">
                            Answers come only from your {totalLinks} {totalLinks === 1 ? 'save' : 'saves'} — with sources you can open.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
                            {suggestions.map(s => (
                                <button
                                    // key = underlying card/topic, so a fresh save still
                                    // re-animates its chip in — just with no special dress-up.
                                    key={s.key}
                                    dir="auto"
                                    // latest/rediscover chips are about ONE card we
                                    // suggested; the rest genuinely sweep the library.
                                    onClick={() => {
                                        trackAskSuggestionUsed(s.kind);
                                        send(s.text, undefined, s.kind === 'latest' || s.kind === 'rediscover' ? 'card' : 'library');
                                    }}
                                    className="animate-fade-in px-3.5 py-2 rounded-full bg-card border border-border-subtle text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text transition-colors cursor-pointer"
                                >
                                    {s.text}
                                </button>
                            ))}
                        </div>
                        {suggestions.length > 0 && (
                            <button
                                onClick={() => setSuggestSalt(v => v + 1)}
                                className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-text-muted text-xs font-medium hover:text-text transition-colors cursor-pointer"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                More ideas
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="w-full max-w-2xl mx-auto py-2">
                        <div className="space-y-5">
                        {messages.map((m, i) => (
                            <div key={i} data-msg-idx={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start group'}>
                                <div className={m.role === 'user' ? 'max-w-[85%]' : 'max-w-[90%] w-full'}>
                                    <div
                                        // dir="auto" everywhere: first-strong detection keeps a
                                        // mostly-English question with an embedded Hebrew title
                                        // LTR (getDirection flips RTL on ANY Hebrew char, which
                                        // scrambled mixed-language bubbles).
                                        dir="auto"
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
                                        <CopyButton text={m.content} sources={m.ungrounded ? undefined : m.sources} />
                                    )}

                                    {/* One-tap retry for the most recent failed exchange. */}
                                    {m.error && i === messages.length - 1 && !busy && (
                                        <button
                                            onClick={retryLast}
                                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border-subtle text-text-secondary text-[13px] font-medium hover:border-accent/40 hover:text-text transition-colors cursor-pointer"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            Try again
                                        </button>
                                    )}

                                    {/* Ungrounded downgrade — the answer couldn't be tied to any
                                        save, so we drop the "grounded" promise and say so plainly
                                        in place of the source chips (never confident-and-uncited). */}
                                    {m.role === 'assistant' && !m.error && m.ungrounded && (
                                        <div className="mt-2.5 flex items-start gap-2 max-w-full px-3 py-2 rounded-xl bg-card border border-border-subtle text-text-muted text-[12px] leading-snug">
                                            <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" />
                                            <span>Machina couldn&apos;t tie this answer to your saves — treat it with extra caution.</span>
                                        </div>
                                    )}

                                    {/* Citations — clickable proof cards back to the source links */}
                                    {m.role === 'assistant' && !m.ungrounded && m.sources && m.sources.length > 0 && (
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
                                                                            dir="auto"
                                                                            className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-text-muted text-start"
                                                                            style={tag.platform ? { color: platformColor(tag.platform) } : undefined}
                                                                        >
                                                                            {tag.label}
                                                                        </span>
                                                                    )}
                                                                    {/* dir="auto" per title: a Hebrew title renders RTL inside
                                                                        the chip instead of scrambling around the LTR layout. */}
                                                                    <span dir="auto" className="text-[13px] font-medium text-text leading-snug text-start">{s.title}</span>
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

                        {isThinking && <ThinkingIndicator origin={askOrigin} />}

                        {/* Content-aware one-tap follow-ups once the latest answer has
                            settled (empty when the turn can't produce a tailored set). */}
                        {!busy && followUps.length > 0 && (
                            <div className="flex flex-wrap gap-2 ps-1 animate-fade-in">
                                {followUps.map(f => (
                                    <button
                                        key={f.label}
                                        dir="auto"
                                        // The chip shows the short label; what's SENT is the
                                        // self-contained question carrying the cited card's
                                        // title, so backend retrieval can actually find it.
                                        onClick={() => { trackAskFollowupUsed(); send(f.question, undefined, 'followup'); }}
                                        className="px-3 py-1.5 rounded-full border border-border-subtle text-text-muted text-[13px] hover:text-text hover:border-accent/40 transition-colors cursor-pointer"
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        </div>
                    </div>
                )}
            </div>

            {/* Jump back to the latest message after scrolling up to read. */}
            {showJump && !isEmpty && (
                <div className="relative w-full max-w-2xl mx-auto h-0 z-10">
                    <button
                        onClick={jumpToLatest}
                        aria-label="Jump to latest"
                        className="absolute -top-12 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-card border border-border-subtle shadow-lg flex items-center justify-center text-text-secondary hover:text-text hover:border-accent/40 transition-colors cursor-pointer animate-fade-in"
                    >
                        <ArrowDown className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* A card saved while this conversation was open — offer it as a
                one-tap ask, so a fresh capture is immediately askable. */}
            {freshCard && !isEmpty && (
                <div className="shrink-0 w-full max-w-2xl mx-auto px-3 sm:px-0 pb-1.5 animate-fade-in">
                    <div className="flex items-center gap-2 ps-3 pe-1.5 py-1.5 rounded-xl bg-accent/10 border border-accent/25">
                        <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
                        <button
                            dir="auto"
                            onClick={() => {
                                trackAskSuggestionUsed('fresh');
                                send(`What's the gist of "${freshCard.title}"?`, undefined, 'card');
                                setFreshCard(null);
                            }}
                            className="flex-1 min-w-0 text-start text-[13px] text-text truncate cursor-pointer hover:underline underline-offset-2"
                        >
                            Just saved: <span dir="auto" className="font-medium">{freshCard.title}</span> — ask about it
                        </button>
                        <button
                            onClick={() => setFreshCard(null)}
                            aria-label="Dismiss"
                            className="shrink-0 p-1.5 rounded-full text-text-muted hover:text-text transition-colors cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}

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
                    {busy ? (
                        <IconButton
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={stopGeneration}
                            aria-label="Stop generating"
                            variant="secondary"
                            className="shrink-0"
                        >
                            <Square className="w-3.5 h-3.5 fill-current" />
                        </IconButton>
                    ) : (
                        <IconButton
                            // Don't steal focus from the textarea — keeps the keyboard open
                            // and lets the click land reliably (no layout shift mid-tap).
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => send(input)}
                            disabled={!uid || !input.trim()}
                            aria-label="Send"
                            variant="primary"
                            className="shrink-0"
                        >
                            <ArrowUp className="w-5 h-5" />
                        </IconButton>
                    )}
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
