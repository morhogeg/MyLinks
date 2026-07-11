'use client';

import type { ReactNode } from 'react';
import { Share, MoreHorizontal, Sparkles, Puzzle, MousePointerClick, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { isNativeApp } from '@/lib/api';

/**
 * First-run welcome — shown exactly once, right after a fresh workspace is
 * created for a brand-new account (see AuthProvider). One screen, ONE job: get
 * the user to save their first thing, then get out of the way. Dismissal is
 * persisted on the user doc (`onboarded: true`) with a localStorage fallback
 * (mechanics unchanged — see AuthProvider.finishOnboarding).
 *
 * The single goal is platform-specific:
 *   - Native iOS: the primary capture surface is the share sheet, so we teach
 *     exactly that — including the one-time "More… → enable Machina" step that
 *     nothing else in the app explains. Pitching a desktop browser extension to
 *     someone on an iPhone (the old copy) was the activation cliff.
 *   - Desktop web: the browser extension is the right first save, so we keep
 *     that pitch — tightened to the same numbered one-goal structure.
 *
 * Visual language mirrors LoginScreen (brand mark + gradient wordmark on
 * bg-background); everything is theme-token based, RTL-safe (logical properties
 * only) and safe-area aware (bottom inset padded explicitly since this screen
 * owns the full viewport).
 */
export default function Onboarding({ onDone }: { onDone: () => void }) {
    const native = isNativeApp();

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
                    <img src="/app-icon.png" alt="Machina" className="w-full h-full object-cover" />
                </div>

                <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-center bg-[image:var(--accent-gradient)] bg-clip-text text-transparent">
                    Save your first thing
                </h1>
                <p className="mt-2 text-sm text-text-secondary text-center leading-relaxed">
                    {native
                        ? 'Machina captures straight from the iOS share sheet. Here’s the one-time setup — it takes 20 seconds.'
                        : 'Machina lives in your browser toolbar. Here’s how to clip your first page.'}
                </p>

                {/* The one goal, as an ordered, do-this-now checklist. */}
                <ol className="mt-8 w-full flex flex-col gap-3">
                    {native ? (
                        <>
                            <StepRow
                                n={1}
                                icon={<Share className="w-[18px] h-[18px]" />}
                                title="Tap Share in any app"
                                body="In Safari, YouTube, or X, tap the Share icon and Machina shows up in the row of apps."
                            />
                            <StepRow
                                n={2}
                                icon={<MoreHorizontal className="w-[18px] h-[18px]" />}
                                title="Turn on Machina"
                                note="one time"
                                body="Don’t see it? Swipe that row to the end, tap More…, and toggle Machina on. You only do this once."
                            />
                            <StepRow
                                n={3}
                                icon={<Sparkles className="w-[18px] h-[18px]" />}
                                title="Pick Machina to save"
                                body="Choose Machina — it reads the page, writes a clean summary, and files it for you."
                            />
                        </>
                    ) : (
                        <>
                            <StepRow
                                n={1}
                                icon={<Puzzle className="w-[18px] h-[18px]" />}
                                title="Add the browser extension"
                                body="Get the Machina extension for Chrome, Edge, or Brave — it lives right in your toolbar."
                            />
                            <StepRow
                                n={2}
                                icon={<MousePointerClick className="w-[18px] h-[18px]" />}
                                title="Click it on any page"
                                body="Reading something worth keeping? One click on the Machina icon clips the whole page."
                            />
                            <StepRow
                                n={3}
                                icon={<Sparkles className="w-[18px] h-[18px]" />}
                                title="Machina does the rest"
                                body="It reads the page, writes a clean summary, and auto-files it — no folders to manage."
                            />
                        </>
                    )}
                </ol>

                <Button
                    variant="primary"
                    radius="full"
                    onClick={onDone}
                    className="mt-8 w-full"
                >
                    {native ? 'Got it — let’s go' : 'Start saving'}
                    <ArrowRight className="w-4 h-4 rtl:-scale-x-100" />
                </Button>
                <p className="mt-3 text-[12px] text-text-muted text-center">
                    You can revisit all of this any time from Settings.
                </p>
            </div>
        </div>
    );
}

function StepRow({
    n,
    icon,
    title,
    body,
    note,
}: {
    n: number;
    icon: ReactNode;
    title: string;
    body: string;
    note?: string;
}) {
    return (
        <li className="flex items-start gap-3.5 rounded-2xl bg-card border border-border-subtle p-4 text-start list-none">
            {/* Numbered badge doubles as the step icon — the number conveys
                sequence, the glyph hints at the action. */}
            <div className="relative shrink-0 w-9 h-9 rounded-xl bg-accent/12 text-accent flex items-center justify-center ring-1 ring-accent/20">
                {icon}
                <span className="absolute -top-1.5 -start-1.5 w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-background tabular-nums">
                    {n}
                </span>
            </div>
            <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text leading-snug flex items-center gap-2">
                    {title}
                    {note && (
                        <span className="shrink-0 rounded-full bg-accent/12 text-accent text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 ring-1 ring-accent/20">
                            {note}
                        </span>
                    )}
                </h3>
                <p className="mt-0.5 text-[13px] text-text-secondary leading-relaxed">{body}</p>
            </div>
        </li>
    );
}
