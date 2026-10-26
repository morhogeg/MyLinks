import Link from 'next/link';
import { APP_STORE_URL } from '@/lib/site';

/**
 * The close of every article and the FAQ: the landing page's own "Close" card
 * (same container, type and pill button), pointing at the app. Goes to the App
 * Store once `APP_STORE_ID` is set in `lib/site.ts`; until then, to the web
 * app's sign-in at the root.
 */
export default function AppCta({ title = 'Everything you save, finally useful.' }: { title?: string }) {
    const cls =
        'mx-cta mt-8 inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-sm '
        + 'font-semibold text-accent-ink shadow-sm shadow-accent/20 transition-colors hover:bg-accent-hover';
    return (
        <section className="mx-auto max-w-3xl px-6 pb-20 pt-4">
            <div className="rounded-3xl border border-border-subtle bg-card p-10 text-center shadow-[var(--shadow-card)] sm:p-14">
                <h2 className="text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl">{title}</h2>
                <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                    Save from any app on your iPhone or the web. Machina summarizes and connects every
                    save, and answers your questions with citations to your own library. Free to start.
                </p>
                {APP_STORE_URL
                    ? <a href={APP_STORE_URL} className={cls}>Get Machina on the App Store</a>
                    : <Link href="/" className={cls}>Get started</Link>}
            </div>
        </section>
    );
}
