'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/lib/types';
import { Sparkles, Brain, Compass, ArrowUpRight, Loader2 } from 'lucide-react';

interface SmartPulseProps {
    links: Link[];
    uid: string;
}

export default function SmartPulse({ links, uid }: SmartPulseProps) {
    const [pulse, setPulse] = useState<{
        theme: string;
        summary: string;
        learningPath: string[];
    } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const generatePulse = async () => {
            if (links.length < 3 || !uid) return;

            setIsLoading(true);
            try {
                // We'll target the last 15 links for the pulse
                const recentLinks = links.slice(0, 15);
                const context = recentLinks.map(l => ({
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
                            1. "theme": A punchy 2-3 word name for the current intellectual focus (e.g. "Modern AI Engineering", "Mindful Stoicism").
                            2. "summary": A 1-2 sentence high-level summary of what I am currently obsessed with.
                            3. "learningPath": A list of 3 logical "next steps" or topics I should explore next based on these interests.
                            
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
                    // Try to parse the JSON output from the AI
                    try {
                        const parsed = JSON.parse(data.response.replace(/```json|```/g, ''));
                        setPulse(parsed);
                    } catch {
                        // Fallback if AI doesn't return perfect JSON
                        setPulse({
                            theme: "Current Focus",
                            summary: data.response.substring(0, 150) + "...",
                            learningPath: ["Continue exploring", "Check related tags", "Deep dive into categories"]
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

    if (!pulse && !isLoading) return null;

    return (
        <div className="relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-accent/20 via-purple-500/10 to-transparent opacity-50 transition-opacity group-hover:opacity-70" />

            <div className="relative bg-card/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start">
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
                        <>
                            <h2 className="text-3xl font-black text-text group-hover:text-white transition-colors">
                                {pulse?.theme}
                            </h2>
                            <p className="text-text-secondary text-sm md:text-base leading-relaxed max-w-2xl">
                                {pulse?.summary}
                            </p>
                        </>
                    )}
                </div>

                <div className="w-full md:w-64 space-y-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-text-muted">
                        <Compass className="w-3 h-3" />
                        Learning Path
                    </div>
                    <div className="grid gap-2">
                        {isLoading ? (
                            [1, 2, 3].map(i => <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />)
                        ) : (
                            pulse?.learningPath.map((path, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-accent/30 hover:bg-white/10 transition-all group/item"
                                >
                                    <span className="text-xs font-bold text-text-secondary group-hover/item:text-text truncate pr-2">
                                        {path}
                                    </span>
                                    <ArrowUpRight className="w-3 h-3 text-text-muted group-hover/item:text-accent" />
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
