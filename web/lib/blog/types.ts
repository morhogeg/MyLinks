/**
 * One article on the public blog (`/blog/<slug>`). Posts live one per file in
 * `lib/blog/posts/` and are registered in `lib/blog/index.ts`.
 *
 * The body is Markdown (GitHub-flavoured: tables, lists, links), rendered at
 * build time by `components/blog/Prose.tsx`. No H1 in the body: the page
 * renders `title` as the H1.
 */
export type BlogCategory = 'Second brain' | 'Learning science' | 'How-to';

export type Post = {
    /** URL segment, lowercase-kebab. Never change after publishing: it is the URL. */
    slug: string;
    /** The H1 and the base of the <title>. Aim for under 60 characters. */
    title: string;
    /** Meta description and the index-card blurb. 140-160 characters. */
    description: string;
    /** ISO date, yyyy-mm-dd. */
    date: string;
    /** ISO date of the last meaningful edit, when there was one. */
    updated?: string;
    category: BlogCategory;
    /** Search phrases the post is written for. Feeds JSON-LD `keywords` only. */
    keywords: string[];
    /** Rendered as a "Questions" section at the end and as FAQPage JSON-LD. */
    faq?: { q: string; a: string }[];
    /** Markdown. Starts with the direct answer to the title's question. */
    body: string;
};
