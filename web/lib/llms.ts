import { POSTS } from '@/lib/blog';
import { FAQ } from '@/lib/faq';
import { HOME_DESCRIPTION, SITE_URL, SUPPORT_EMAIL, TAGLINE } from '@/lib/site';

/**
 * `/llms.txt` (the llmstxt.org convention: a Markdown map of the site for
 * language models) and `/llms-full.txt` (the same, with the FAQ and every
 * article inlined, so an assistant can read the whole site in one fetch).
 * Built from the same post list as the blog, so they never drift.
 */
function header() {
    return [
        '# Machina',
        '',
        `> ${TAGLINE} ${HOME_DESCRIPTION}`,
        '',
        'Machina is an iPhone app and a web app (mymachina.app). People use it as a second brain for',
        'everything they save online: they share links, screenshots, videos and notes to it from any app,',
        'and Machina summarizes, tags and connects each save automatically. They find things later by',
        'searching by meaning or by asking questions answered from their own saves, with citations.',
        'Smart review reminders (next day, a week later, a month later) and a weekly synthesis bring saves back. No ads, no',
        'tracking, content never used to train AI models. Free to start; Machina Pro is optional.',
        '',
        '## Pages',
        '',
        `- [Home](${SITE_URL}/): what Machina does, where it runs, privacy`,
        `- [FAQ](${SITE_URL}/faq): features, pricing, devices, privacy`,
        `- [Blog](${SITE_URL}/blog): guides on second brains, active recall, spaced repetition and saving from social apps`,
        `- [Privacy policy](${SITE_URL}/privacy)`,
        `- [Terms of service](${SITE_URL}/terms)`,
        '',
    ];
}

function articleIndex() {
    return [
        '## Articles',
        '',
        ...POSTS.map((p) => `- [${p.title}](${SITE_URL}/blog/${p.slug}): ${p.description}`),
        '',
        '## Contact',
        '',
        `- Support: ${SUPPORT_EMAIL}`,
        '',
    ];
}

export function llmsTxt() {
    return [...header(), ...articleIndex()].join('\n');
}

export function llmsFullTxt() {
    const faq = FAQ.map(({ q, a }) => `### ${q}\n\n${a}\n`);
    const articles = POSTS.map((p) => [
        `## ${p.title}`,
        '',
        `${SITE_URL}/blog/${p.slug} (published ${p.date})`,
        '',
        p.body.trim(),
        '',
        ...(p.faq?.length ? ['### Questions', '', ...p.faq.map(({ q, a }) => `**${q}** ${a}\n`)] : []),
    ].join('\n'));
    return [...header(), '## FAQ', '', ...faq, ...articles, ''].join('\n');
}
