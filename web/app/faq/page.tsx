import type { Metadata } from 'next';
import Link from 'next/link';
import SitePage from '@/components/site/SitePage';
import AppCta from '@/components/blog/AppCta';
import { FAQ } from '@/lib/faq';
import { SITE_OG_IMAGE, SITE_URL } from '@/lib/site';
import { JsonLd, breadcrumbs, faqPage, organization, softwareApplication } from '@/lib/seo';

const TITLE = 'Machina FAQ: features, pricing, devices and privacy';
const DESCRIPTION =
    'What Machina is, how saving from any app works, what Ask Machina does, which devices it runs on, '
    + 'what it costs, and what happens to your data.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/faq' },
    openGraph: { type: 'website', url: '/faq', title: TITLE, description: DESCRIPTION, siteName: 'Machina', images: [SITE_OG_IMAGE] },
    twitter: { card: 'summary_large_image', site: '@machinaapp', title: TITLE, description: DESCRIPTION, images: [SITE_OG_IMAGE] },
};

/** Static, auth-free (`lib/publicRoutes.tsx`). The answers live in `lib/faq.ts`. */
export default function FaqPage() {
    return (
        <SitePage>
            <JsonLd
                graph={[
                    organization,
                    softwareApplication,
                    faqPage(FAQ, `${SITE_URL}/faq`),
                    breadcrumbs([
                        { name: 'Machina', url: `${SITE_URL}/` },
                        { name: 'FAQ', url: `${SITE_URL}/faq` },
                    ]),
                ]}
            />
            <div className="mx-auto max-w-2xl px-6 pb-16 pt-16 sm:pt-24">
                <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">FAQ</p>
                <h1 className="mt-3 text-center text-4xl font-semibold tracking-tight text-text text-balance sm:text-5xl">
                    Questions about Machina
                </h1>
                <dl className="mt-14 divide-y divide-border-subtle border-y border-border-subtle">
                    {FAQ.map(({ q, a }) => (
                        <div key={q} className="py-7">
                            <dt className="text-lg font-semibold tracking-tight text-text">{q}</dt>
                            <dd className="mt-3 text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">{a}</dd>
                        </div>
                    ))}
                </dl>
                <p className="mt-10 text-center text-[15px] text-text-secondary">
                    Something else? Write to{' '}
                    <a href="mailto:support@mymachina.app" className="text-text underline decoration-text-muted/50 underline-offset-[3px]">
                        support@mymachina.app
                    </a>{' '}
                    or read the <Link href="/privacy" className="text-text underline decoration-text-muted/50 underline-offset-[3px]">privacy policy</Link>.
                </p>
            </div>
            <AppCta />
        </SitePage>
    );
}
