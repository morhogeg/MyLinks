'use client';

import type { ReactNode } from 'react';
import { Share, Puzzle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * First-run welcome — shown exactly once, right after a fresh workspace is
 * created for a brand-new account (see AuthProvider). One screen, one job:
 * teach the two ways to capture, then get out of the way. Dismissal is
 * persisted on the user doc (`onboarded: true`) with a localStorage fallback.
 *
 * Visual language mirrors LoginScreen (brand mark + gradient wordmark on
 * bg-background); everything is theme-token based, RTL-safe (logical
 * properties only) and safe-area aware (bottom inset padded explicitly since
 * this screen owns the full viewport).
 */
export default function Onboarding({ onDone }: { onDone: () => void }) {
    return (
        <div
            className="min-h-screen bg-background text-text flex items-center justify-center px-6"
            style={{
                paddingTop: 'max(env(safe-area-inset-top), 24px)',
                paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
            }}
        >
            <div className="w-full max-w-sm flex flex-col items-center animate-slide-up">
                {/* Brand mark — same lockup as LoginScreen so the handoff from
                    sign-in feels like one continuous flow. */}
                <div className="w-16 h-16 rounded-3xl overflow-hidden shadow-lg shadow-purple-500/20 ring-1 ring-white/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/app-icon.png" alt="Machina" className="w-full h-full object-cover" />
                </div>

                <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-center bg-[image:var(--accent-gradient)] bg-clip-text text-transparent">
                    Your brain is ready
                </h1>
                <p className="mt-2 text-sm text-text-secondary text-center leading-relaxed">
                    Save anything from anywhere. Machina reads it, organizes it,
                    and answers from it when you ask.
                </p>

                {/* The capture surfaces */}
                <div className="mt-8 w-full flex flex-col gap-3">
                    <CaptureRow
                        icon={<Share className="w-[18px] h-[18px]" />}
                        title="Share from any app"
                        body="Tap the share button in Safari, YouTube, X — anywhere — and pick Machina."
                    />
                    <CaptureRow
                        icon={<Puzzle className="w-[18px] h-[18px]" />}
                        title="Clip from your browser"
                        body="The Machina extension saves any page from Chrome, Edge, or Brave in one click."
                    />
                </div>

                <Button
                    variant="primary"
                    radius="full"
                    onClick={onDone}
                    className="mt-8 w-full"
                >
                    Start saving
                    <ArrowRight className="w-4 h-4 rtl:-scale-x-100" />
                </Button>
                <p className="mt-3 text-[12px] text-text-muted text-center">
                    You can revisit all of this any time from Settings.
                </p>
            </div>
        </div>
    );
}

function CaptureRow({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
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
