'use client';

import { ShieldCheck, UserX, Lock } from 'lucide-react';
import { CitationGlyph } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';
import { FlowScreen, FlowRow } from '@/components/onboarding/FlowScreen';
import { policyUrl, openExternal } from '@/lib/share';
import { isNativeApp } from '@/lib/api';

/**
 * First-run AI-consent notice (App Review 5.1.1/5.1.2, Nov 2025): names the AI
 * provider (Google Gemini) and obtains explicit consent before anything can be
 * saved. Shown once on BOTH native and web. AuthProvider gates the whole app
 * behind it and owns persistence: localStorage `ai-consent-v1` + `aiConsentAt`
 * on the user doc (see lib/aiConsent.ts).
 *
 * This is page one of the first run, and it is the one page that is a legal
 * gate rather than a product pitch, so its SUBSTANCE is fixed: the same three
 * disclosures, the same single explicit consent action, the same privacy link.
 * What changed is only the frame — it now sits in the shared `FlowScreen`
 * (components/onboarding/FlowScreen.tsx), so sign-in leads into one continuous
 * flow instead of three screens that each look like a different app.
 */
export default function AIConsentNotice({ onAccept }: { onAccept: () => void }) {
    const privacyHref = policyUrl('/privacy');
    return (
        <FlowScreen
            label="How Machina uses AI"
            icon={<Lock className="w-4 h-4" />}
            eyebrow="Before you start"
            title="Machina uses AI"
            body="Here is exactly what happens to what you save."
            footer={
                <>
                    {/* Explicit consent: one primary action, and the app stays
                        gated until it is tapped. */}
                    <Button variant="primary" radius="full" onClick={onAccept} className="w-full h-12 text-[15px]">
                        I understand, continue
                    </Button>
                    <p className="mt-3 text-[12px] text-text-muted text-center leading-relaxed">
                        By continuing, you agree to this processing. Details in our{' '}
                        <a
                            href={privacyHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                                // Native shell: open in Safari instead of
                                // navigating the WKWebView away from the app.
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
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <FlowRow
                    icon={<CitationGlyph className="w-[18px] h-[18px]" />}
                    title="Analyzed by Google Gemini"
                    body="Links, page text, images, and the questions you ask are sent to Google Gemini, Google's AI service, to create your summaries, tags, and answers."
                />
                <FlowRow
                    icon={<ShieldCheck className="w-[18px] h-[18px]" />}
                    title="Not used to train AI models"
                    body="Machina uses Gemini's paid tier: Google's terms state your content is never used to train or improve Google's models. It's kept up to 55 days for abuse checks, then deleted."
                />
                <FlowRow
                    icon={<UserX className="w-[18px] h-[18px]" />}
                    title="Sent without your identity"
                    body="Requests come from Machina's servers with no name, email, phone or IP attached."
                />
            </div>
        </FlowScreen>
    );
}
