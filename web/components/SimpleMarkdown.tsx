'use client';

import React from 'react';

interface SimpleMarkdownProps {
    content: string;
    className?: string;
}

/**
 * Simple markdown renderer for AI summaries
 * Handles: ## headings, - bullet points, **bold**
 */
export default function SimpleMarkdown({ content, className = '' }: SimpleMarkdownProps) {
    if (!content) return null;

    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let currentListItems: string[] = [];
    let key = 0;

    const flushList = () => {
        if (currentListItems.length > 0) {
            elements.push(
                <ul key={key++} className="list-disc list-inside space-y-1.5 mb-4 text-text-secondary">
                    {currentListItems.map((item, i) => (
                        <li key={i} className="leading-relaxed">
                            {formatInlineStyles(item)}
                        </li>
                    ))}
                </ul>
            );
            currentListItems = [];
        }
    };

    const formatInlineStyles = (text: string): React.ReactNode => {
        // Handle **bold** text
        const boldRegex = /\*\*(.+?)\*\*/g;
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;

        while ((match = boldRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.slice(lastIndex, match.index));
            }
            parts.push(<strong key={`bold-${match.index}`} className="font-semibold text-text">{match[1]}</strong>);
            lastIndex = boldRegex.lastIndex;
        }

        if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
        }

        if (parts.length === 0) return text;
        if (parts.length === 1 && typeof parts[0] === 'string') return parts[0];
        return <>{parts}</>;
    };

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines but flush list first
        if (!trimmed) {
            flushList();
            continue;
        }

        // ## Heading
        if (trimmed.startsWith('## ')) {
            flushList();
            const headingText = trimmed.slice(3);
            elements.push(
                <h3 key={key++} className="text-sm font-bold text-text uppercase tracking-wider mt-5 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                    {headingText}
                </h3>
            );
            continue;
        }

        // - Bullet point
        if (trimmed.startsWith('- ')) {
            currentListItems.push(trimmed.slice(2));
            continue;
        }

        // Regular paragraph
        flushList();
        elements.push(
            <p key={key++} className="text-text-secondary leading-relaxed mb-3">
                {formatInlineStyles(trimmed)}
            </p>
        );
    }

    // Flush any remaining list items
    flushList();

    return <div className={className}>{elements}</div>;
}
