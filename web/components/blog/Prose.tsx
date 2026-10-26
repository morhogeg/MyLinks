import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Article Markdown → the site's type scale. Server-rendered at build time, so
 * the full text is in the static HTML. Same tokens and rhythm as the policy
 * pages and the landing's prose sections: `text-text` for headings,
 * `text-text-secondary` for body, 15-16px at relaxed leading.
 */
const components: Components = {
    h2: ({ children }) => (
        <h2 className="mt-12 scroll-mt-24 text-2xl font-semibold tracking-tight text-text text-balance">{children}</h2>
    ),
    h3: ({ children }) => (
        <h3 className="mt-8 text-lg font-semibold text-text">{children}</h3>
    ),
    p: ({ children }) => <p className="mt-5 text-pretty">{children}</p>,
    ul: ({ children }) => <ul className="mt-5 list-disc space-y-2 pl-6 marker:text-text-muted">{children}</ul>,
    ol: ({ children }) => <ol className="mt-5 list-decimal space-y-2 pl-6 marker:text-text-muted">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
    blockquote: ({ children }) => (
        <blockquote className="mt-6 border-l-2 border-border-strong pl-5 text-text [&>p]:mt-3 [&>p:first-child]:mt-0">
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-10 border-border-subtle" />,
    a: ({ href = '', children }) => {
        const cls = 'text-text underline decoration-text-muted/50 underline-offset-[3px] transition-colors hover:decoration-text';
        return href.startsWith('/')
            ? <Link href={href} className={cls}>{children}</Link>
            : <a href={href} className={cls} target="_blank" rel="noopener">{children}</a>;
    },
    table: ({ children }) => (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border-subtle">
            <table className="w-full border-collapse text-left text-[14px]">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-card">{children}</thead>,
    th: ({ children }) => <th className="border-b border-border-subtle px-4 py-3 font-semibold text-text">{children}</th>,
    td: ({ children }) => <td className="border-b border-border-subtle px-4 py-3 align-top">{children}</td>,
    code: ({ children }) => <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[0.9em] text-text">{children}</code>,
};

export default function Prose({ markdown }: { markdown: string }) {
    return (
        <div className="text-[15px] leading-relaxed text-text-secondary sm:text-base sm:leading-[1.75]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {markdown}
            </ReactMarkdown>
        </div>
    );
}
