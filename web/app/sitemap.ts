import type { MetadataRoute } from 'next';
import { POSTS } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

/** `/welcome` is left out on purpose: its canonical is `/`. */
export default function sitemap(): MetadataRoute.Sitemap {
    const newest = POSTS.reduce((d, p) => ((p.updated ?? p.date) > d ? (p.updated ?? p.date) : d), '2026-10-26');
    return [
        { url: `${SITE_URL}/`, lastModified: newest, changeFrequency: 'weekly', priority: 1 },
        { url: `${SITE_URL}/blog`, lastModified: newest, changeFrequency: 'weekly', priority: 0.8 },
        { url: `${SITE_URL}/faq`, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 0.7 },
        ...POSTS.map((p) => ({
            url: `${SITE_URL}/blog/${p.slug}`,
            lastModified: p.updated ?? p.date,
            changeFrequency: 'monthly' as const,
            priority: 0.7,
        })),
        { url: `${SITE_URL}/privacy`, lastModified: '2026-10-22', changeFrequency: 'yearly', priority: 0.2 },
        { url: `${SITE_URL}/terms`, lastModified: '2026-10-22', changeFrequency: 'yearly', priority: 0.2 },
    ];
}
