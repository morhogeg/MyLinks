import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

/**
 * Everything public is crawlable, including by AI assistants' crawlers, which
 * are named explicitly so an allow is on record for each (several respect only
 * a rule that names them). Blocked: the API proxies and Firebase's auth
 * handler, which are not pages. Public share pages (`/s`, `/c`, `/a`) carry
 * their own `noindex`, so they stay crawlable for that tag to be seen.
 */
const AI_CRAWLERS = [
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
    'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
    'PerplexityBot', 'Perplexity-User',
    'Google-Extended', 'Applebot', 'Applebot-Extended',
    'Bingbot', 'DuckAssistBot', 'meta-externalagent', 'MistralAI-User',
];
const DISALLOW = ['/api/', '/__/'];

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            { userAgent: '*', allow: '/', disallow: DISALLOW },
            { userAgent: AI_CRAWLERS, allow: '/', disallow: DISALLOW },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
