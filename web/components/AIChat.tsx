'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, User, Sparkles, Loader2, Info } from 'lucide-react';
import { Link } from '@/lib/types';

interface Message {
    role: 'user' | 'model';
    content: string;
}

interface AIChatProps {
    link: Link;
}

export default function AIChat({ link }: AIChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    context: {
                        title: link.title,
                        category: link.category,
                        summary: link.summary
                    },
                    content: link.summary // For now using summary as content if snippet isn't stored
                }),
            });

            const data = await response.json();
            if (data.success) {
                setMessages(prev => [...prev, { role: 'model', content: data.response }]);
            } else {
                setMessages(prev => [...prev, { role: 'model', content: "Error: " + data.error }]);
            }
        } catch (_error) {
            setMessages(prev => [...prev, { role: 'model', content: "Failed to connect to AI." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[400px] sm:h-[400px] max-h-[60vh] bg-background/30 rounded-2xl border border-white/5 overflow-hidden">
            {/* Header */}
            <div className="px-3 sm:px-4 py-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span className="text-xs font-bold uppercase tracking-wider text-text">AI Assistant</span>
                </div>
                <div className="group relative">
                    <Info className="w-4 h-4 text-text-muted cursor-help" />
                    <div className="absolute right-0 top-full mt-2 w-48 p-2 bg-card border border-border-subtle rounded-lg shadow-xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all pointer-events-none z-50">
                        <p className="text-[10px] text-text-secondary leading-tight">
                            This AI has specialized context about this link. Ask for summaries, key takeaways, or explanations.
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 sm:p-6 space-y-3 opacity-50">
                        <div className="p-3 rounded-full bg-white/5">
                            <Sparkles className="w-6 h-6 text-accent" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-text">How can I help?</p>
                            <p className="text-xs text-text-muted">Ask anything about &quot;{link.title}&quot;</p>
                        </div>
                    </div>
                )}

                {messages.map((m, i) => (
                    <div
                        key={i}
                        className={`flex items-start gap-2 sm:gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                        <div className={`p-1.5 rounded-lg ${m.role === 'user' ? 'bg-accent/20' : 'bg-white/10'}`}>
                            {m.role === 'user' ? (
                                <User className="w-3.5 h-3.5 text-accent" />
                            ) : (
                                <Sparkles className="w-3.5 h-3.5 text-white" />
                            )}
                        </div>
                        <div
                            className={`max-w-[85%] sm:max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${m.role === 'user'
                                ? 'bg-accent text-white rounded-tr-none'
                                : 'bg-card border border-border-subtle text-text rounded-tl-none'
                                }`}
                        >
                            {m.content}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex items-start gap-2 sm:gap-3">
                        <div className="p-1.5 rounded-lg bg-white/10">
                            <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                        </div>
                        <div className="bg-card border border-border-subtle text-text rounded-2xl rounded-tl-none px-3 py-2 flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span className="text-xs italic opacity-50">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 sm:p-4 bg-white/5 border-t border-white/5">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question..."
                        className="w-full bg-background/50 border border-border-subtle rounded-xl pl-4 pr-12 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all min-h-[44px]"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-accent text-white hover:scale-110 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale min-h-[40px] min-w-[40px] flex items-center justify-center"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </form>
        </div>
    );
}
