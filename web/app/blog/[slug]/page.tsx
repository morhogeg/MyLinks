import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SitePage from '@/components/site/SitePage';
import Prose from '@/components/blog/Prose';
import PostCard from '@/components/blog/PostCard';
import AppCta from '@/components/blog/AppCta';
import { POSTS, getPost, readingMinutes, relatedPosts } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';
import { JsonLd, blogPosting, breadcrumbs, faqPage, organization, postUrl } from '@/lib/seo';

export const dynamicParams = false;

export function generateStaticParams() {
    return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const post = getPost((await params).slug);
    if (!post) return {};
    const url = `/blog/${post.slug}`;
    return {
        // Search results cut titles near 60 characters; a long one spends
        // that room on the article, not the brand.
        title: post.title.length > 52 ? post.title : `${post.title} · Machina`,
        description: post.description,
        alternates: { canonical: url },
        openGraph: {
            type: 'article',
            url,
            title: post.title,
            description: post.description,
            siteName: 'Machina',
            publishedTime: post.date,
            modifiedTime: post.updated ?? post.date,
            section: post.category,
        },
        twitter: { card: 'summary_large_image', site: '@machinaapp', title: post.title, description: post.description },
    };
}

const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** One article. Static, auth-free (`lib/publicRoutes.tsx`), full text in the HTML. */
export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
    const post = getPost((await params).slug);
    if (!post) notFound();
    const related = relatedPosts(post);
    return (
        <SitePage>
            <JsonLd
                graph={[
                    organization,
                    blogPosting(post),
                    breadcrumbs([
                        { name: 'Machina', url: `${SITE_URL}/` },
                        { name: 'Blog', url: `${SITE_URL}/blog` },
                        { name: post.title, url: postUrl(post.slug) },
                    ]),
                    ...(post.faq?.length ? [faqPage(post.faq, postUrl(post.slug))] : []),
                ]}
            />
            <article className="mx-auto max-w-2xl px-6 pb-16 pt-14 sm:pt-20">
                <nav aria-label="Breadcrumb" className="text-sm text-text-secondary">
                    <Link href="/blog" className="transition-colors hover:text-text">&larr; Blog</Link>
                </nav>
                <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {post.category}
                </p>
                <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-text text-balance sm:text-5xl">
                    {post.title}
                </h1>
                <p className="mt-5 text-sm text-text-muted">
                    <time dateTime={post.updated ?? post.date}>
                        {post.updated ? `Updated ${fmt(post.updated)}` : fmt(post.date)}
                    </time>
                    {' · '}{readingMinutes(post)} min read
                </p>
                <div className="mt-6">
                    <Prose markdown={post.body} />
                </div>
                {post.faq?.length ? (
                    <section aria-labelledby="questions" className="mt-14">
                        <h2 id="questions" className="text-2xl font-semibold tracking-tight text-text">Questions</h2>
                        <dl className="mt-6 space-y-6">
                            {post.faq.map(({ q, a }) => (
                                <div key={q}>
                                    <dt className="font-semibold text-text">{q}</dt>
                                    <dd className="mt-2 text-[15px] leading-relaxed text-text-secondary sm:text-base">{a}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ) : null}
            </article>
            <AppCta />
            {related.length > 0 && (
                <section className="mx-auto max-w-5xl px-6 pb-20" aria-labelledby="keep-reading">
                    <h2 id="keep-reading" className="text-2xl font-semibold tracking-tight text-text">Keep reading</h2>
                    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {related.map((p) => <PostCard key={p.slug} post={p} />)}
                    </div>
                </section>
            )}
        </SitePage>
    );
}
