import type { Metadata } from 'next';
import SitePage from '@/components/site/SitePage';
import PostCard from '@/components/blog/PostCard';
import AppCta from '@/components/blog/AppCta';
import { POSTS } from '@/lib/blog';
import type { BlogCategory } from '@/lib/blog/types';
import { SITE_OG_IMAGE, SITE_URL } from '@/lib/site';
import { JsonLd, breadcrumbs, organization, postUrl } from '@/lib/seo';

const TITLE = 'Machina blog: second brains, active recall and saving what you find';
const DESCRIPTION =
    'Practical guides on building a second brain, active recall, spaced repetition, the forgetting curve, '
    + 'and saving TikToks, Reels, screenshots and recipes so you can find them later.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: {
        canonical: '/blog',
        types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: 'Machina blog' }] },
    },
    openGraph: { type: 'website', url: '/blog', title: TITLE, description: DESCRIPTION, siteName: 'Machina', images: [SITE_OG_IMAGE] },
    twitter: { card: 'summary_large_image', site: '@machinaapp', title: TITLE, description: DESCRIPTION, images: [SITE_OG_IMAGE] },
};

const SECTIONS: { category: BlogCategory; title: string }[] = [
    { category: 'Second brain', title: 'Building a second brain' },
    { category: 'Learning science', title: 'Remembering what you learn' },
    { category: 'How-to', title: 'Saving from your phone' },
];

/** Static, auth-free (`lib/publicRoutes.tsx`), prerendered in full. */
export default function BlogIndex() {
    return (
        <SitePage>
            <JsonLd
                graph={[
                    organization,
                    {
                        '@type': 'Blog',
                        '@id': `${SITE_URL}/blog#blog`,
                        name: 'Machina blog',
                        url: `${SITE_URL}/blog`,
                        description: DESCRIPTION,
                        publisher: { '@id': `${SITE_URL}/#organization` },
                        blogPost: POSTS.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: postUrl(p.slug), datePublished: p.date })),
                    },
                    breadcrumbs([
                        { name: 'Machina', url: `${SITE_URL}/` },
                        { name: 'Blog', url: `${SITE_URL}/blog` },
                    ]),
                ]}
            />
            <header className="mx-auto max-w-2xl px-6 pb-6 pt-16 text-center sm:pt-24">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Blog</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-text text-balance sm:text-5xl">
                    Save less blindly. Remember more.
                </h1>
                <p className="mt-5 text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                    Guides on keeping a second brain that actually works, the learning science of
                    remembering what you read, and getting your saves out of every app they are stuck in.
                </p>
            </header>
            {SECTIONS.map(({ category, title }) => {
                const posts = POSTS.filter((p) => p.category === category);
                if (!posts.length) return null;
                return (
                    <section key={category} className="mx-auto max-w-5xl px-6 py-10" aria-labelledby={`blog-${category}`}>
                        <h2 id={`blog-${category}`} className="text-2xl font-semibold tracking-tight text-text">
                            {title}
                        </h2>
                        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {posts.map((p) => <PostCard key={p.slug} post={p} />)}
                        </div>
                    </section>
                );
            })}
            <div className="pt-10">
                <AppCta />
            </div>
        </SitePage>
    );
}
