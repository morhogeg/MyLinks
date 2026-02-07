'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/lib/types';
import { Brain, Compass, ArrowUpRight, Loader2, Sparkles, X } from 'lucide-react';

interface SmartPulseProps {
    links: Link[];
    uid: string;
}

interface PulseData {
    theme: string;
    summary: string;
    learningPath: {
        topic: string;
        sourceIds: string[];
    }[];
}

export default function SmartPulse({ links, uid }: SmartPulseProps) {
    const [pulse, setPulse] = useState<PulseData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activePathIndex, setActivePathIndex] = useState<number | null>(null);

    useEffect(() => {
        const generatePulse = async () => {
            if (links.length < 3 || !uid) return;

            setIsLoading(true);
            try {
                // We'll target the last 15 links for the pulse
                const recentLinks = links.slice(0, 15);
                const context = recentLinks.map(l => ({
                    id: l.id,
                    title: l.title,
                    category: l.category,
                    summary: l.summary
                }));

                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [{
                            role: 'user',
                            content: `Analyze these recent knowledge saves and provide a global synthesis.
                            
                            Saves: ${JSON.stringify(context)}
                            
                            Return a JSON object with:
                            1. "theme": A punchy 2-3 word name for the current intellectual focus.
                            2. "summary": A 1-2 sentence high-level summary.
                            3. "learningPath": A list of 3 topics. For EACH topic, include an array of "sourceIds" from the provided list that most directly inspired this suggestion.
                            
                            Format: { "theme": string, "summary": string, "learningPath": [{ "topic": string, "sourceIds": string[] }] }
                            
                            JSON ONLY.`
                        }],
                        context: {
                            title: "Global Brain Pulse",
                            category: "Synthesis",
                            summary: "Analyzing recent growth."
                        }
                    }),
                });

                const data = await response.json();
                if (data.success) {
                    try {
                        const parsed = JSON.parse(data.response.replace(/```json|```/g, ''));
                        setPulse(parsed);
                    } catch {
                        // Attempt a more robust parse or fallback
                        setPulse({
                            theme: "Current Focus",
                            summary: "I'm synthesizing your recent saves into a coherent direction.",
                            learningPath: [
                                { topic: "Continue exploring", sourceIds: [] },
                                { topic: "Check related tags", sourceIds: [] },
                                { topic: "Deep dive into categories", sourceIds: [] }
                            ]
                        });
                    }
                }
            } catch (error) {
                console.error('Pulse generation failed:', error);
            } finally {
                setIsLoading(false);
            }
        };

        generatePulse();
    }, [links.length, uid]);

    const getSourceLinks = (sourceIds: string[]) => {
        return links.filter(l => sourceIds.includes(l.id));
    };

    if (!pulse && !isLoading) return null;

    return (
        <div className="relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-accent/20 via-purple-500/10 to-transparent opacity-50 transition-opacity group-hover:opacity-70" />

            <div className="relative bg-card/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col lg:flex-row gap-8 items-start">
                <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-2xl bg-accent text-white shadow-lg shadow-accent/20 animate-pulse-slow">
                            <Brain className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] uppercase font-black tracking-[0.2em] text-accent">Pulse Analysis</span>
                    </div>

                    {isLoading ? (
                        <div className="space-y-3 py-4">
                            <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
                            <div className="h-4 w-full bg-white/5 rounded-lg animate-pulse" />
                            <div className="h-4 w-2/3 bg-white/5 rounded-lg animate-pulse" />
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                            <h2 className="text-3xl font-black text-text group-hover:text-white transition-colors mb-2">
                                {pulse?.theme}
                            </h2>
                            <p className="text-text-secondary text-sm md:text-lg leading-relaxed max-w-2xl font-medium">
                                {pulse?.summary}
                            </p>
                        </div>
                    )}
                </div>

                {/* Right Column: Learning Path */}
                <div className="w-full lg:w-96 shrink-0 lg:pl-4 space-y-4 border-l-0 lg:border-l border-white/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-text-muted">
                            <Compass className="w-3 h-3 text-accent" />
                            Learning Path
                        </div>
                        {activePathIndex !== null && (
                            <button
                                onClick={() => setActivePathIndex(null)}
                                className="text-[9px] uppercase font-bold text-accent hover:text-white transition-colors flex items-center gap-1"
                            >
                                <X className="w-2.5 h-2.5" />
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="grid gap-2">
                        {isLoading ? (
                            [1, 2, 3].map(i => <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />)
                        ) : (
                            pulse?.learningPath.map((path, i) => (
                                <div key={i} className="space-y-2">
                                    <button
                                        onClick={() => setActivePathIndex(activePathIndex === i ? null : i)}
                                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${activePathIndex === i
                                                ? 'bg-accent/20 border-accent/40 ring-1 ring-accent/20 shadow-lg shadow-accent/10'
                                                : 'bg-white/5 border-white/5 hover:border-accent/40 hover:bg-white/10'
                                            }`}
                                    >
                                        <span className={`text-[13px] font-bold transition-colors ${activePathIndex === i ? 'text-white' : 'text-text-secondary group-hover:text-text'
                                            }`}>
                                            {path.topic}
                                        </span>
                                        <ArrowUpRight className={`w-4 h-4 transition-all duration-300 ${activePathIndex === i ? 'rotate-45 text-accent scale-110' : 'text-text-muted group-hover:text-accent'
                                            }`} />
                                    </button>

                                    {activePathIndex === i && (
                                        <div className="px-2 py-1 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="flex items-center gap-2 text-[9px] uppercase font-black tracking-widest text-accent mb-2">
                                                <Sparkles className="w-2.5 h-2.5" />
                                                Source Evidence
                                            </div>
                                            {path.sourceIds && path.sourceIds.length > 0 ? (
                                                getSourceLinks(path.sourceIds).map(l => (
                                                    <div
                                                        key={l.id}
                                                        className="flex items-start gap-2.5 bg-white/5 p-2 rounded-lg border border-white/5 hover:border-white/10 transition-all"
                                                    >
                                                        <div className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full bg-accent/60" />
                                                        <span className="text-[11px] leading-tight text-text-secondary font-medium italic">
                                                            {l.title}
                                                        </span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-[11px] text-text-muted italic pl-4">No specific links identified.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
