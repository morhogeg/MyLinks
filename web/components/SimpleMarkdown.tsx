'use client';

import React from 'react';

interface SimpleMarkdownProps {
    content: string;
    className?: string;
    isCompact?: boolean;
    isRtl?: boolean;
}

/**
 * Simple markdown renderer for AI summaries
 * Handles: ## headings, - bullet points, **bold**
 */
export default function SimpleMarkdown({ content, className = '', isCompact = false, isRtl = false }: SimpleMarkdownProps) {
    if (!content) return null;

    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let currentListItems: string[] = [];
    let key = 0;

    const flushList = () => {
        if (currentListItems.length > 0) {
            elements.push(
                <ul key={key++} className={`list-disc ${isRtl ? 'pr-5' : 'pl-5'} ${isCompact ? 'space-y-3 mb-5' : 'space-y-3 mb-6'} text-text-secondary`} dir="auto">
                    {currentListItems.map((item, i) => (
                        <li key={i} className={isCompact ? "leading-relaxed" : "leading-relaxed"}>
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
            let headingText = trimmed.slice(3);

            // Translate headers if RTL
            if (isRtl) {
                const upperHeading = headingText.toUpperCase();
                if (upperHeading === 'KEY POINTS') headingText = 'נקודות עיקריות';
                else if (upperHeading === 'CONCLUSIONS' || upperHeading === 'CONCLUSION') headingText = 'מסקנות';
            }

            elements.push(
                <h3 key={key++} dir="auto" className={`font-bold text-text uppercase tracking-wide ${isCompact ? 'text-[11px] mt-6 mb-3' : 'text-base mt-8 mb-5 border-b border-red-500 pb-2'} ${isRtl ? 'text-right' : 'text-left'}`}>
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

        // If compact mode and text looks like multiple sentences without breaks, split them
        if (isCompact && trimmed.includes('. ') && !trimmed.includes('\n')) {
            // Split by period + space, but keep the period
            const sentences = trimmed.split(/(\. )/g).reduce((acc: string[], part, i, arr) => {
                if (i % 2 === 0) {
                    const sentence = part + (arr[i + 1] || '');
                    if (sentence.trim()) acc.push(sentence.trim());
                }
                return acc;
            }, []);

            sentences.forEach((sentence, i) => {
                elements.push(
                    <p key={`${key++}-${i}`} dir="auto" className={`text-text-secondary ${isCompact ? 'mb-3 text-xs leading-relaxed' : 'mb-5 leading-relaxed'} ${isRtl ? 'text-right' : 'text-left'}`}>
                        {formatInlineStyles(sentence)}
                    </p>
                );
            });
        } else {
            elements.push(
                <p key={key++} dir="auto" className={`text-text-secondary ${isCompact ? 'mb-4 text-xs leading-relaxed' : 'mb-5 leading-relaxed'} ${isRtl ? 'text-right' : 'text-left'}`}>
                    {formatInlineStyles(trimmed)}
                </p>
            );
        }
    }

    // Flush any remaining list items
    flushList();

    return <div className={`${className} ${isRtl ? 'text-right' : 'text-left'}`} dir="auto">{elements}</div>;
}
