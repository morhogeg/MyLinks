'use client';

import type { ReactNode } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { policyUrl, openExternal } from '@/lib/share';
import { isNativeApp } from '@/lib/api';

/**
 * First-run AI-consent notice (App Review 5.1.1/5.1.2, Nov 2025 update):
 * names the AI provider (Google Gemini) and obtains explicit consent before
 * anything can be saved. Shown once on BOTH native and web — AuthProvider
 * gates the whole app behind it (before the welcome screen and the tour) and
 * owns persistence: localStorage `ai-consent-v1` + `aiConsentAt` on the user
 * doc (see lib/aiConsent.ts).
 *
 * Visual language mirrors Onboarding/LoginScreen (brand mark + gradient
 * wordmark on bg-background); theme tokens only, RTL-safe (logical properties,
 * text-start), safe-area aware — this screen owns the full viewport.
 */
export default function AIConsentNotice({ onAccept }: { onAccept: () => void }) {
    const privacyHref = policyUrl('/privacy');
    return (
        <div
            className="min-h-screen bg-background text-text flex items-center justify-center px-6"
            style={{
                paddingTop: 'max(env(safe-area-inset-top), 24px)',
                paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
            }}
        >
            <div className="w-full max-w-sm flex flex-col items-center animate-slide-up">
                {/* Brand mark — same lockup as LoginScreen/Onboarding. */}
                <div className="w-16 h-16 rounded-3xl overflow-hidden shadow-lg shadow-purple-500/20 ring-1 ring-white-fixed/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/app-icon.png" alt="Machina" className="w-full h-full object-cover" />
                </div>

                <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-center bg-[image:var(--accent-gradient)] bg-clip-text text-transparent">
                    Machina uses AI
                </h1>
                <p className="mt-2 text-sm text-text-secondary text-center leading-relaxed">
                    Before you start, here&apos;s exactly what happens to what you save.
                </p>

                <div className="mt-8 w-full flex flex-col gap-3">
                    <InfoRow
                        icon={<Sparkles className="w-[18px] h-[18px]" />}
                        title="Analyzed by Google Gemini"
                        body="Content you save — links, page text, and images — and the questions you ask are sent to Google Gemini, Google's AI service, to create your summaries, tags, and answers."
                    />
                    <InfoRow
                        icon={<ShieldCheck className="w-[18px] h-[18px]" />}
                        title="Never used for AI training"
                        body="Machina uses Gemini only to analyze your saves for you. Machina does not use your content to train AI models."
                    />
                </div>

                {/* Explicit consent — one primary CTA; the app stays gated until
                    it's tapped. */}
                <Button
                    variant="primary"
                    radius="full"
                    onClick={onAccept}
                    className="mt-8 w-full"
                >
                    I understand — continue
                </Button>
                <p className="mt-3 text-[12px] text-text-muted text-center leading-relaxed">
                    By continuing, you agree to this processing. Details in our{' '}
                    <a
                        href={privacyHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                            // Native shell: open in Safari instead of navigating
                            // the WKWebView away from the app.
                            if (isNativeApp()) {
                                e.preventDefault();
                                openExternal(privacyHref);
                            }
                        }}
                        className="underline underline-offset-2 text-text-secondary hover:text-text transition-colors"
                    >
                        Privacy Policy
                    </a>
                    .
                </p>
            </div>
        </div>
    );
}

function InfoRow({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
    return (
        <div className="flex items-start gap-3.5 rounded-2xl bg-card border border-border-subtle p-4 text-start">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                {icon}
            </div>
            <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text leading-snug">{title}</h3>
                <p className="mt-0.5 text-[13px] text-text-secondary leading-relaxed">{body}</p>
            </div>
        </div>
    );
}
