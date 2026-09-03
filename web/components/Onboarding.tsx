'use client';

import { useState } from 'react';
import {
    Share, MoreHorizontal, Puzzle, MousePointerClick, Plus, Upload, Sparkles, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CitationGlyph } from '@/components/ui/Wordmark';
import { FlowScreen, FlowRow } from '@/components/onboarding/FlowScreen';
import ImportSheet from '@/components/ImportSheet';
import { isNativeApp } from '@/lib/api';
import { hapticLight } from '@/lib/haptics';
import { useEntitlement } from '@/components/EntitlementProvider';

/**
 * First run, page two: "Bring what you've saved".
 *
 * The single most useful thing that can happen in the first minute is that the
 * library stops being empty, so this screen is three choices and nothing else:
 *
 *   1. Import a file      -> the import sheet (bookmarks HTML, Pocket CSV, or a
 *                            pasted list). The fastest path from zero to a
 *                            library worth asking questions of.
 *   2. Save your first    -> the platform's real capture surface, taught in
 *      thing                 place: the iOS share sheet on native (including the
 *                            one-time "More… -> enable Machina" step nothing
 *                            else in the app explains), the extension and the
 *                            plus button on the web.
 *   3. Not now            -> an empty library is allowed. Saying so plainly
 *                            beats a dismiss affordance the user has to hunt for.
 *
 * Dismissal is persisted on the user doc (`onboarded: true`) with a localStorage
 * fallback; AuthProvider owns that (finishOnboarding), unchanged. The 4-step
 * story ("How Machina works") follows this screen from app/page.tsx, so this is
 * page two of three and never the last thing the user sees.

 * Every screen in the flow shares one frame (components/onboarding/FlowScreen),
 * so consent, this, and the story read as one thing rather than three.
 */
export default function Onboarding({ onDone }: { onDone: () => void }) {
    const native = isNativeApp();
    const [showHow, setShowHow] = useState(false);
    const [importing, setImporting] = useState(false);
    // One line, only for a reverse trial (never for founders or subscribers).
    const { isTrial, trialStarted, trialAnchorCards } = useEntitlement();

    return (
        <>
            <FlowScreen
                label="Bring what you've saved"
                icon={<Upload className="w-4 h-4" />}
                eyebrow="Get started"
                title="Bring what you’ve saved"
                body={showHow
                    ? undefined
                    : 'Machina is worth using the moment it has something to work with. Start with what you already have.'}
                footer={
                    <>
                        {showHow && (
                            <Button
                                variant="primary"
                                radius="full"
                                onClick={onDone}
                                className="w-full h-12 text-[15px]"
                            >
                                {native ? 'Got it' : 'Start saving'}
                                <ArrowRight className="w-4 h-4 rtl:-scale-x-100" />
                            </Button>
                        )}
                        {isTrial && (
                            <p className={`${showHow ? 'mt-3' : ''} text-[12px] text-text-muted text-center leading-relaxed`}>
                                {trialStarted
                                    ? 'Pro is free for your first 14 days. Nothing to cancel.'
                                    : `Pro is free for your first 14 days. The clock starts once you’ve saved ${trialAnchorCards} things.`}
                            </p>
                        )}
                    </>
                }
            >
                {showHow ? (
                    // The chosen path, expanded in place rather than on a fourth
                    // screen: the flow stays three screens long.
                    <ol className="flex flex-col gap-3 list-none">
                        {native ? (
                            <>
                                <li>
                                    <FlowRow
                                        n={1}
                                        icon={<Share className="w-[18px] h-[18px]" />}
                                        title="Tap Share in any app"
                                        body="In Safari, YouTube, or X, tap the Share icon and Machina shows up in the row of apps."
                                    />
                                </li>
                                <li>
                                    <FlowRow
                                        n={2}
                                        icon={<MoreHorizontal className="w-[18px] h-[18px]" />}
                                        title="Turn on Machina"
                                        badge="one time"
                                        body="Don’t see it? Swipe that row to the end, tap More…, and toggle Machina on. You only do this once."
                                    />
                                </li>
                                <li>
                                    <FlowRow
                                        n={3}
                                        icon={<CitationGlyph className="w-[18px] h-[18px]" />}
                                        title="Pick Machina to save"
                                        body="Choose Machina. It reads the page, writes a clean summary, and files it for you."
                                    />
                                </li>
                            </>
                        ) : (
                            <>
                                <li>
                                    <FlowRow
                                        n={1}
                                        icon={<Plus className="w-[18px] h-[18px]" />}
                                        title="Use the plus button"
                                        body="Paste a link, drop in a screenshot, or jot a thought. Every save lands as a card."
                                    />
                                </li>
                                <li>
                                    <FlowRow
                                        n={2}
                                        icon={<Puzzle className="w-[18px] h-[18px]" />}
                                        title="Add the browser extension"
                                        body="Get the Machina extension for Chrome, Edge, or Brave. It lives right in your toolbar."
                                    />
                                </li>
                                <li>
                                    <FlowRow
                                        n={3}
                                        icon={<MousePointerClick className="w-[18px] h-[18px]" />}
                                        title="Click it on any page"
                                        body="One click clips the whole page. Machina reads it and files it. No folders to manage."
                                    />
                                </li>
                            </>
                        )}
                    </ol>
                ) : (
                    <div className="flex flex-col gap-3">
                        <FlowRow
                            icon={<Upload className="w-[18px] h-[18px]" />}
                            title="Import a file"
                            body="Your browser bookmarks, a Pocket export, or a list of links you paste. Machina reads and files every one."
                            onClick={() => { hapticLight(); setImporting(true); }}
                        />
                        <FlowRow
                            icon={native
                                ? <Share className="w-[18px] h-[18px]" />
                                : <Plus className="w-[18px] h-[18px]" />}
                            title="Save your first thing"
                            body={native
                                ? 'Share to Machina from Safari, YouTube, or any other app. It takes 20 seconds to set up.'
                                : 'Use the plus button here, or add the browser extension and clip any page in one click.'}
                            onClick={() => { hapticLight(); setShowHow(true); }}
                        />
                        <FlowRow
                            icon={<Sparkles className="w-[18px] h-[18px]" />}
                            title="Not now"
                            body="Start empty and save as you go. Importing is always there in Settings."
                            onClick={() => { hapticLight(); onDone(); }}
                        />
                    </div>
                )}
            </FlowScreen>

            {/* The import sheet is the same one Settings opens. Once links are
                actually on their way, the welcome has done its job: get out of
                the way so the feed can fill in behind it. */}
            <ImportSheet
                isOpen={importing}
                onClose={() => setImporting(false)}
                onImported={() => { setImporting(false); onDone(); }}
            />
        </>
    );
}
