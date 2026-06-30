'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Minus, Plus, Volume2, Pause, Play, ExternalLink, BookOpen, Loader2 } from 'lucide-react';
import { Link } from '@/lib/types';
import { getDirection } from '@/lib/rtl';
import { appCheckHeaders } from '@/lib/firebase';
import { apiUrl } from '@/lib/api';

interface Paragraph {
    type: 'p' | 'h2' | 'h3' | 'li' | 'blockquote';
    text: string;
}

interface ReadingViewProps {
    link: Link;
    onClose: () => void;
}

type SpeechState = 'idle' | 'playing' | 'paused';

const FONT_KEY = 'reader-font-size';
const MIN_FONT = 15;
const MAX_FONT = 26;

export default function ReadingView({ link, onClose }: ReadingViewProps) {
    const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
    const [title, setTitle] = useState(link.title);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fontSize, setFontSize] = useState(19);
    const [progress, setProgress] = useState(0);
    const [speech, setSpeech] = useState<SpeechState>('idle');

    const scrollRef = useRef<HTMLDivElement>(null);
    const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

    // Restore the reader's preferred font size.
    useEffect(() => {
        const saved = Number(localStorage.getItem(FONT_KEY));
        if (saved >= MIN_FONT && saved <= MAX_FONT) setFontSize(saved);
    }, []);

    // Fetch a clean, readable version of the article on open. On-demand so it
    // works for every saved link, including ones saved before this feature.
    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(apiUrl('/api/article'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()) },
                    body: JSON.stringify({ url: link.url }),
                });
                const data = await res.json();
                if (cancelled) return;
                if (data.success && Array.isArray(data.paragraphs) && data.paragraphs.length) {
                    setParagraphs(data.paragraphs);
                    if (data.title) setTitle(data.title);
                } else {
                    setError(data.error || "We couldn't pull a readable version of this page.");
                }
            } catch {
                if (!cancelled) setError('Could not reach the article. Check your connection.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [link.url]);

    // Stop any speech when leaving the reader.
    useEffect(() => {
        return () => { if (ttsSupported) window.speechSynthesis.cancel(); };
    }, [ttsSupported]);

    // Close on Escape.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
    };

    const changeFont = (delta: number) => {
        setFontSize(prev => {
            const next = Math.max(MIN_FONT, Math.min(MAX_FONT, prev + delta));
            localStorage.setItem(FONT_KEY, String(next));
            return next;
        });
    };

    const dir = getDirection(title + ' ' + (paragraphs[0]?.text ?? ''), link.language);
    const speechLang = link.language === 'he' || dir === 'rtl' ? 'he-IL' : (link.language || 'en-US');

    // Read the article aloud, one paragraph per utterance so long pieces don't
    // get truncated by the speech engine. State follows the queue.
    const startSpeaking = useCallback(() => {
        if (!ttsSupported || !paragraphs.length) return;
        const synth = window.speechSynthesis;
        synth.cancel();
        const blocks = [title, ...paragraphs.map(p => p.text)].filter(Boolean);
        blocks.forEach((text, i) => {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = speechLang;
            u.rate = 1;
            if (i === blocks.length - 1) u.onend = () => setSpeech('idle');
            synth.speak(u);
        });
        setSpeech('playing');
    }, [ttsSupported, paragraphs, title, speechLang]);

    const toggleSpeech = () => {
        if (!ttsSupported) return;
        const synth = window.speechSynthesis;
        if (speech === 'idle') {
            startSpeaking();
        } else if (speech === 'playing') {
            synth.pause();
            setSpeech('paused');
        } else {
            synth.resume();
            setSpeech('playing');
        }
    };

    const renderBlock = (p: Paragraph, i: number) => {
        const d = getDirection(p.text, link.language);
        switch (p.type) {
            case 'h2':
                return <h2 key={i} dir={d} className="font-bold mt-8 mb-3" style={{ fontSize: '1.4em' }}>{p.text}</h2>;
            case 'h3':
                return <h3 key={i} dir={d} className="font-semibold mt-6 mb-2" style={{ fontSize: '1.2em' }}>{p.text}</h3>;
            case 'li':
                return (
                    <div key={i} dir={d} className="flex gap-2.5 mb-2.5">
                        <span className="text-accent mt-[0.4em] shrink-0">•</span>
                        <span className="flex-1">{p.text}</span>
                    </div>
                );
            case 'blockquote':
                return <blockquote key={i} dir={d} className="border-s-2 border-accent/40 ps-4 my-4 italic text-text-secondary">{p.text}</blockquote>;
            default:
                return <p key={i} dir={d} className="mb-5 leading-[1.75]">{p.text}</p>;
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col animate-in fade-in duration-200">
            {/* Reading progress */}
            <div className="absolute top-0 inset-x-0 h-0.5 bg-transparent z-10">
                <div
                    className="h-full bg-[image:var(--accent-gradient)] transition-[width] duration-150 ease-out"
                    style={{ width: `${progress * 100}%` }}
                />
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 safe-pt border-b border-border-subtle">
                <button
                    onClick={onClose}
                    title="Back"
                    aria-label="Back to details"
                    className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-text-secondary hover:text-text hover:bg-card-hover transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm font-medium hidden sm:inline">Back</span>
                </button>

                <div className="flex items-center gap-1.5">
                    {/* Font size */}
                    <div className="flex items-center rounded-xl bg-card border border-border-subtle">
                        <button onClick={() => changeFont(-1)} disabled={fontSize <= MIN_FONT} title="Smaller text" aria-label="Decrease font size" className="p-2 text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                            <Minus className="w-4 h-4" />
                        </button>
                        <span className="px-1 text-[11px] font-semibold text-text-muted tabular-nums select-none">Aa</span>
                        <button onClick={() => changeFont(1)} disabled={fontSize >= MAX_FONT} title="Larger text" aria-label="Increase font size" className="p-2 text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Listen (TTS) */}
                    {ttsSupported && !loading && !error && (
                        <button
                            onClick={toggleSpeech}
                            title={speech === 'playing' ? 'Pause' : speech === 'paused' ? 'Resume' : 'Listen'}
                            aria-label="Listen to article"
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors cursor-pointer ${speech !== 'idle'
                                ? 'bg-accent text-white border-accent'
                                : 'bg-card border-border-subtle text-text-secondary hover:text-text hover:border-accent/40'
                                }`}
                        >
                            {speech === 'playing' ? <Pause className="w-4 h-4" /> : speech === 'paused' ? <Play className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            <span className="hidden sm:inline">{speech === 'idle' ? 'Listen' : speech === 'playing' ? 'Pause' : 'Resume'}</span>
                        </button>
                    )}

                    {!!link.url && /^https?:\/\//.test(link.url) && (
                        <a href={link.url} target="_blank" rel="noopener noreferrer" title="Open original" aria-label="Open original" className="p-2 rounded-xl bg-card border border-border-subtle text-text-secondary hover:text-accent hover:border-accent/40 transition-colors">
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                </div>
            </div>

            {/* Article */}
            <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
                <article className="max-w-[44rem] mx-auto px-5 sm:px-8 py-8 sm:py-12 safe-pb" style={{ fontSize }}>
                    {loading ? (
                        <div aria-busy="true">
                            {/* Status message — the reader fetches + cleans the page on demand,
                                which can take a moment, so say what's happening. */}
                            <div className="flex items-center gap-2.5 text-text-secondary text-sm mb-7" style={{ fontSize: '0.8em' }}>
                                <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
                                <span>Fetching the original article and tidying it up for reading…</span>
                            </div>
                            <div className="space-y-4 animate-pulse">
                                <div className="h-9 w-3/4 bg-card-hover rounded-lg" />
                                <div className="h-4 w-32 bg-card-hover rounded" />
                                <div className="pt-4 space-y-3">
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <div key={i} className="h-4 bg-card-hover rounded" style={{ width: `${70 + ((i * 7) % 30)}%` }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="text-center py-16">
                            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-card-hover flex items-center justify-center">
                                <BookOpen className="w-7 h-7 text-text-muted" />
                            </div>
                            <h3 className="text-lg font-medium text-text mb-1.5">Reader unavailable</h3>
                            <p className="text-text-secondary text-sm max-w-md mx-auto mb-5">{error}</p>
                            {!!link.url && /^https?:\/\//.test(link.url) && (
                                <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors">
                                    <ExternalLink className="w-4 h-4" /> Open original
                                </a>
                            )}
                        </div>
                    ) : (
                        <>
                            <h1 dir={dir} className="font-bold leading-tight mb-3 text-text" style={{ fontSize: '1.6em' }}>{title}</h1>
                            {(link.sourceName || link.metadata?.estimatedReadTime) && (
                                <div className="flex items-center gap-2 text-text-muted text-sm mb-8 pb-6 border-b border-border-subtle">
                                    {link.sourceName && <span className="font-medium">{link.sourceName}</span>}
                                    {link.sourceName && link.metadata?.estimatedReadTime ? <span>·</span> : null}
                                    {link.metadata?.estimatedReadTime ? <span>{link.metadata.estimatedReadTime} min read</span> : null}
                                </div>
                            )}
                            <div className="text-text/90">
                                {paragraphs.map(renderBlock)}
                            </div>
                        </>
                    )}
                </article>
            </div>
        </div>
    );
}
