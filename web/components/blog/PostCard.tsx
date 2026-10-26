import Link from 'next/link';
import type { Post } from '@/lib/blog/types';
import { readingMinutes } from '@/lib/blog';

/** One article in a list: the blog index and "Keep reading" under a post. */
export default function PostCard({ post }: { post: Post }) {
    return (
        <Link
            href={`/blog/${post.slug}`}
            className="group flex h-full flex-col rounded-3xl border border-border-subtle bg-card p-6 shadow-[var(--shadow-card)] transition-colors hover:bg-card-hover"
        >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                {post.category} · {readingMinutes(post)} min read
            </p>
            <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-text text-balance">
                {post.title}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-text-secondary text-pretty">
                {post.description}
            </p>
        </Link>
    );
}
