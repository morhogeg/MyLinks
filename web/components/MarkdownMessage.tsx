'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

/** Renders an assistant answer as Markdown, styled to match the chat. GFM gives
 *  us tables/strikethrough; remark-breaks turns single newlines into <br> so the
 *  model's line breaks survive (like the old whitespace-pre-wrap). */
export default function MarkdownMessage({ content }: { content: string }) {
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
            {content}
        </ReactMarkdown>
    );
}
