'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowUp, FileText, Brain } from 'lucide-react';
import { getDirection } from '@/lib/rtl';

interface Source {
    id: string;
    title: string;
    category?: string;
    sourceName?: string | null;
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
        <div className="flex flex-col h-[calc(100dvh-320px)] min-h-[340px] animate-fade-in">
            {/* Conversation */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 pb-4">
                {isEmpty ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                        <div className="w-14 h-14 mb-4 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-accent/20">
                            <Sparkles className="w-7 h-7 text-white" />
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
                    <div className="max-w-2xl mx-auto space-y-5 py-2">
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

                                    {/* Citations — clickable chips back to the source cards */}
                                    {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {m.sources.map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => onOpenLink(s.id)}
                                                    title={s.title}
                                                    className="group inline-flex items-center gap-1.5 max-w-[260px] ps-2 pe-2.5 py-1 rounded-full bg-card-hover border border-border-subtle text-text-secondary text-xs font-medium hover:border-accent/50 hover:text-text transition-colors cursor-pointer"
                                                >
                                                    <FileText className="w-3 h-3 shrink-0 text-accent" />
                                                    <span className="truncate">{s.title}</span>
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
