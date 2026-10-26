import { APP_STORE_URL, HOME_DESCRIPTION, SITE_NAME, SITE_URL, SOCIAL_URLS, SUPPORT_EMAIL, TAGLINE } from '@/lib/site';
import type { Post } from '@/lib/blog/types';

/**
 * Schema.org JSON-LD for the public website. Invisible on the page; read by
 * search engines and by AI assistants that fetch the HTML, which is why every
 * claim here must be as true as the page copy (no ratings, no reviews: there
 * are none to cite).
 */

type Json = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#app`;

export const organization: Json = {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    email: SUPPORT_EMAIL,
    sameAs: SOCIAL_URLS,
};

export const website: Json = {
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: TAGLINE,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en',
};

export const softwareApplication: Json = {
    '@type': ['MobileApplication', 'WebApplication'],
    '@id': APP_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: HOME_DESCRIPTION,
    slogan: TAGLINE,
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'iOS, Web',
    image: `${SITE_URL}/icon-512.png`,
    publisher: { '@id': ORG_ID },
    ...(APP_STORE_URL ? { installUrl: APP_STORE_URL, downloadUrl: APP_STORE_URL } : {}),
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free to start. Machina Pro is an optional subscription.',
    },
    featureList: [
        'Save links, screenshots, videos and notes from any app via the iOS share sheet',
        'Automatic summary, category, tags and key concepts for every save',
        'Connections between related saves',
        'Search by meaning, not exact words',
        'Ask questions and get answers with citations to your own saves',
        'Smart review reminders: the next day, a week later, a month later',
        'A weekly synthesis of what you saved',
        'No ads, no tracking, content never used to train AI models',
    ],
    keywords: 'second brain, AI bookmark manager, save for later, read later, knowledge base, PKM, active recall, spaced repetition',
};

export function postUrl(slug: string) {
    return `${SITE_URL}/blog/${slug}`;
}

export function blogPosting(post: Post): Json {
    return {
        '@type': 'BlogPosting',
        '@id': `${postUrl(post.slug)}#article`,
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.updated ?? post.date,
        url: postUrl(post.slug),
        mainEntityOfPage: postUrl(post.slug),
        image: `${postUrl(post.slug)}/opengraph-image`,
        articleSection: post.category,
        keywords: post.keywords.join(', '),
        inLanguage: 'en',
        author: { '@id': ORG_ID },
        publisher: { '@id': ORG_ID },
        isPartOf: { '@id': SITE_ID },
        about: { '@id': APP_ID },
    };
}

export function faqPage(faq: { q: string; a: string }[], url: string): Json {
    return {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        url,
        mainEntity: faq.map(({ q, a }) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
        })),
    };
}

export function breadcrumbs(items: { name: string; url: string }[]): Json {
    return {
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: it.name,
            item: it.url,
        })),
    };
}

/** One `<script type="application/ld+json">` holding a @graph of nodes. */
export function JsonLd({ graph }: { graph: Json[] }) {
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
        // A "</script>" inside a string would end the tag early.
        .replace(/</g, '\\u003c');
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
