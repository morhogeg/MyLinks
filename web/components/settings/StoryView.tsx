'use client';

import { CitationGlyph } from '../ui/Wordmark';
import { LargeTitle } from './primitives';

/**
 * Settings → The story behind Machina: a founder's note, nothing more. Plain
 * prose under the brand mark, no rows and no chrome, so it reads like a letter
 * rather than a screen. Deliberately quiet: if someone finds it, great; if not,
 * fine.
 *
 * NO EM DASHES IN THIS COPY. Owner call, 2026-07-27: at five dashes in ~250
 * words the note read as machine-written, and that is fatal for the one screen
 * whose entire job is sounding like a person. They were removed by BREAKING
 * SENTENCES, not by swapping in commas — a comma after "everywhere" let the
 * list run into the main clause, which is what made an earlier revision limp.
 * Short sentences and fragments carry the same beats and read as speech. If you
 * edit this text, keep it that way.
 */
export function StoryView() {
    return (
        <div className="pb-4">
            <CitationGlyph className="w-9 h-9 text-text mb-5 mt-1" />
            <LargeTitle>The story behind Machina</LargeTitle>
            <div className="px-1 pt-2 space-y-4 text-[15.5px] leading-relaxed text-text-secondary">
                <p>
                    Machina started with a frustration I couldn&apos;t shake. I kept saving
                    things everywhere. A post on Instagram, a thread on X, a video on
                    YouTube, an article somewhere else. And I almost never came back to any
                    of it. Worse: when I <em>did</em>{' '}remember something I&apos;d loved
                    and wanted to find it again, it was nearly impossible to recall which app
                    I&apos;d buried it in. Everything that interested me was scattered
                    across five platforms, quietly disappearing.
                </p>
                <p>
                    That hit a nerve, because collecting ideas is genuinely my thing:
                    research, accumulating knowledge, making something new out of what
                    I&apos;ve learned. None of that is a chore for me, it&apos;s the fun
                    part. So a pile of saved-and-forgotten links felt like a real loss.
                    Machina came from that genuine need. One place for everything that
                    catches my interest, wherever I found it.
                </p>
                <p>
                    Saving was never the hard part. Plenty of apps will take your links.
                    They just leave them the way they arrived. Machina actually reads what
                    you save: it summarizes, categorizes, tags, and files every card,
                    connects it to what you saved before, and resurfaces it in your digest.
                    And when you have a question, Ask lets you talk to your own library.
                    Sometimes just to find that one card fast. Sometimes for the good
                    stuff: a real answer built from your own sources.
                </p>
                <p>
                    Underneath it all is a simple belief: recalling what you&apos;ve read
                    is a crucial part of actually learning it. Coming back to an idea,
                    seeing it next to another, asking questions of it. That&apos;s where it
                    sticks. And honestly, it&apos;s just a lot of fun.
                </p>
                <p>
                    Thanks for being here.
                </p>
                <p className="text-text font-medium">– Mor</p>
            </div>
        </div>
    );
}
