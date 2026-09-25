'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, EyeOff, ImagePlus, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { Link } from '@/lib/types';
import { addScreenshotsToCard, enrichScreenshots, enrichStep, MAX_CARD_SCREENSHOTS } from '@/lib/enrich';
import { hapticSuccess } from '@/lib/haptics';
import { useToast } from '@/components/Toast';
import ScreenshotStrip, { toPickedImages, type PickedImage } from '@/components/ScreenshotStrip';

/**
 * COMPLETE A CARD FROM THE USER'S OWN SCREENSHOTS — the whole flow, in the
 * card's detail view, in one place.
 *
 * Facebook, LinkedIn and Instagram serve the scraper a login wall, so those
 * cards are a preview at best. This block, under the summary lead, carries the
 * fix from start to finish (owner, 2026-09-25: the old one-tap version sent
 * the photos the moment they were picked, said nothing about adding several,
 * and gave no sign the card was being read or had been updated):
 *
 *  1. ASK — the honest line ("Machina couldn't read the full post") and an
 *     "Add screenshots" button, with the hint that a long post takes several.
 *  2. REVIEW — the picked screenshots in the same ordered strip the + button's
 *     Image tab uses (numbered, drag to reorder, remove, "+" for more), and
 *     nothing is sent until the user taps "Analyze".
 *  3. PROGRESS — the steps the backend is really on (`enrichStage`: upload →
 *     reading the post → rewriting the card → connections), with the count.
 *     It survives closing the card; Feed toasts the outcome if the card is
 *     not open when it lands.
 *  4. DONE — "Card updated from your N screenshots" with a success haptic,
 *     then a quiet permanent provenance line with "Add more" while there is
 *     room. Added screenshots are read TOGETHER with the earlier ones (the
 *     backend re-reads the whole set in order), so the rest of a long post
 *     adds to the card instead of replacing it.
 *  5. FAILED — the backend's reason and "Try again" with the same picks.
 *
 * ONE instance serves the partial and the completed card (the parent renders
 * it in the same slot for both), so the processing → done transition is seen
 * by the same component and can celebrate it. Follows the CARD's language.
 */
export default function ScreenshotEnrich({
    link,
    uid,
    isRtl,
    isPartial,
    className = '',
}: {
    link: Link;
    uid: string | null;
    isRtl: boolean;
    /** The card is still a partial capture (the "couldn't read" line shows). */
    isPartial: boolean;
    className?: string;
}) {
    const toast = useToast();
    const inputId = `enrich-upload-${link.id}`;
    const inputRef = useRef<HTMLInputElement>(null);
    const [picks, setPicks] = useState<PickedImage[]>([]);
    const [sending, setSending] = useState(false);
    // The last set sent: its thumbnails ride the progress view, and "Try
    // again" re-sends it without a trip back to the photo picker.
    const [lastSent, setLastSent] = useState<PickedImage[]>([]);
    const [justUpdated, setJustUpdated] = useState(false);
    // Sent and acknowledged, but the card's own 'processing' stamp has not
    // streamed in yet: keep showing progress so the block never flashes back
    // to "Add screenshots" in between.
    const [queued, setQueued] = useState(false);
    useEffect(() => {
        if (!queued) return;
        if (link.enrichStatus === 'processing') { setQueued(false); return; }
        const timer = setTimeout(() => setQueued(false), 15_000);
        return () => clearTimeout(timer);
    }, [queued, link.enrichStatus]);

    // Latest sets for event handlers and the unmount cleanup (synced after
    // render, never read during it).
    const picksRef = useRef(picks);
    const lastSentRef = useRef(lastSent);
    useEffect(() => { picksRef.current = picks; }, [picks]);
    useEffect(() => { lastSentRef.current = lastSent; }, [lastSent]);
    useEffect(() => () => {
        picksRef.current.forEach((im) => URL.revokeObjectURL(im.preview));
        lastSentRef.current.forEach((im) => URL.revokeObjectURL(im.preview));
    }, []);

    const prior = enrichScreenshots(link);
    const room = Math.max(0, MAX_CARD_SCREENSHOTS - prior.length);
    const processing = sending || queued || link.enrichStatus === 'processing';
    const failed = !processing && link.enrichStatus === 'failed';
    const completed = !!link.enrichedAt && !isPartial;
    const count = link.enrichCount ?? prior.length;

    // processing → settled without a failure = the card was just rewritten.
    const wasProcessing = useRef(link.enrichStatus === 'processing');
    useEffect(() => {
        const now = link.enrichStatus === 'processing';
        if (wasProcessing.current && !now && link.enrichStatus !== 'failed' && link.enrichedAt) {
            setJustUpdated(true);
            hapticSuccess();
        }
        wasProcessing.current = now;
    }, [link.enrichStatus, link.enrichedAt]);

    const t = (en: string, he: string) => (isRtl ? he : en);

    const addFiles = (files: File[]) => {
        const incoming = files.filter((f) => f && f.size > 0);
        if (!incoming.length) return;
        const space = Math.max(0, room - picksRef.current.length);
        if (incoming.length > space) {
            toast.info(space > 0
                ? t(`This card has room for ${room} screenshot${room === 1 ? '' : 's'}. Kept the first ${space}.`,
                    `יש בכרטיס מקום ל-${room} צילומי מסך. נשמרו ${space} הראשונים.`)
                : t(`This card already has ${MAX_CARD_SCREENSHOTS} screenshots.`, `בכרטיס כבר יש ${MAX_CARD_SCREENSHOTS} צילומי מסך.`));
        }
        const added = toPickedImages(incoming.slice(0, space));
        if (added.length) setPicks((prev) => [...prev, ...added]);
    };

    const clearPicks = () => {
        setPicks((prev) => {
            // A set that already went out once stays alive for "Try again".
            prev.filter((im) => !lastSentRef.current.includes(im)).forEach((im) => URL.revokeObjectURL(im.preview));
            return [];
        });
    };

    const send = async (set: PickedImage[]) => {
        if (!uid || !set.length || processing) return;
        setSending(true);
        setJustUpdated(false);
        // The set in flight becomes lastSent (progress thumbnails + retry);
        // anything it replaces is released.
        setLastSent((prev) => {
            prev.filter((im) => !set.includes(im)).forEach((im) => URL.revokeObjectURL(im.preview));
            return set;
        });
        try {
            await addScreenshotsToCard(uid, link.id, set.map((im) => im.file));
            hapticSuccess();
            setQueued(true);
            setPicks([]);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('Could not send the screenshots.', 'לא הצלחנו לשלוח את צילומי המסך.'));
        } finally {
            setSending(false);
        }
    };

    const fileInput = (
        <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label={t('Choose screenshots', 'בחירת צילומי מסך')}
            onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                // Reset so re-picking the same file fires onChange again.
                e.target.value = '';
            }}
        />
    );

    const pill = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-card-hover border border-border-subtle text-[12px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors cursor-pointer';

    // ── 3. PROGRESS ─────────────────────────────────────────────────────────
    if (processing) {
        // Everything being read: new screenshots are re-read together with
        // any already on the card.
        const n = link.enrichStatus === 'processing' && link.enrichCount
            ? link.enrichCount
            : prior.length + lastSent.length || 1;
        const active = sending ? 0 : enrichStep(link.enrichStage);
        const steps = [
            t(n > 1 ? `${n} screenshots sent` : 'Screenshot sent', n > 1 ? `${n} צילומי מסך נשלחו` : 'צילום המסך נשלח'),
            t('Reading the post', 'קוראים את הפוסט'),
            t('Rewriting the card', 'כותבים מחדש את הכרטיס'),
            t('Finding connections', 'מחפשים קשרים'),
        ];
        const thumbs = lastSent;
        return (
            <div className={className} dir={isRtl ? 'rtl' : 'ltr'}>
                <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4" role="status" aria-live="polite">
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-text">
                        <Sparkles className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                        {t(
                            n > 1 ? `Machina is reading your ${n} screenshots` : 'Machina is reading your screenshot',
                            n > 1 ? `Machina קורא את ${n} צילומי המסך שלך` : 'Machina קורא את צילום המסך שלך',
                        )}
                    </div>
                    {thumbs.length > 0 && (
                        <div className="mt-3 flex gap-1.5">
                            {thumbs.map((im, i) => (
                                <img
                                    key={im.id}
                                    src={im.preview}
                                    alt={t(`Screenshot ${i + 1}`, `צילום מסך ${i + 1}`)}
                                    className="w-9 h-12 rounded-md object-cover border border-border-subtle"
                                />
                            ))}
                        </div>
                    )}
                    <ol className="mt-3 space-y-1.5">
                        {steps.map((label, i) => {
                            const done = i < active;
                            const current = i === active;
                            return (
                                <li
                                    key={label}
                                    className={`flex items-center gap-2 text-[13px] ${done ? 'text-text-secondary' : current ? 'text-text font-medium' : 'text-text-muted'}`}
                                >
                                    <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                                        {done ? (
                                            <Check className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                                        ) : current ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" aria-hidden="true" />
                                        ) : (
                                            <span className="w-1.5 h-1.5 rounded-full bg-border-strong" aria-hidden="true" />
                                        )}
                                    </span>
                                    {label}
                                </li>
                            );
                        })}
                    </ol>
                    <p className="mt-3 text-[12px] text-text-muted leading-snug">
                        {t(
                            'Usually under a minute. You can close the card; it keeps going and updates itself.',
                            'בדרך כלל פחות מדקה. אפשר לסגור את הכרטיס, הוא ממשיך ויתעדכן לבד.',
                        )}
                    </p>
                </div>
            </div>
        );
    }

    // ── 2. REVIEW ───────────────────────────────────────────────────────────
    if (picks.length > 0) {
        const n = picks.length;
        return (
            <div className={className} dir={isRtl ? 'rtl' : 'ltr'}>
                <div className="rounded-2xl border border-border-subtle bg-card-hover p-4">
                    <p className="text-[14px] font-semibold text-text">
                        {prior.length
                            ? t('Add to the card', 'הוספה לכרטיס')
                            : t('Screenshots of the post', 'צילומי מסך של הפוסט')}
                    </p>
                    <p className="mt-1 mb-3 text-[12px] text-text-muted leading-snug">
                        {n > 1
                            ? t('Read in this order, top to bottom. Drag to reorder.', 'נקראים בסדר הזה, מלמעלה למטה. גררו לשינוי הסדר.')
                            : t(`Long post? Add the rest with +, top to bottom (up to ${room}).`, `פוסט ארוך? הוסיפו את ההמשך עם +, מלמעלה למטה (עד ${room}).`)}
                        {prior.length > 0 && ' ' + t(
                            `They're read together with the ${prior.length} already on the card.`,
                            `הם ייקראו יחד עם ${prior.length} שכבר בכרטיס.`,
                        )}
                    </p>
                    <ScreenshotStrip images={picks} setImages={setPicks} max={room} addInputId={inputId} isRtl={isRtl} />
                    <div className="mt-4 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => send(picks)}
                            className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-3 whitespace-nowrap rounded-xl bg-accent text-accent-ink text-[14px] font-bold hover:bg-accent-hover active:scale-[0.98] transition-all shadow-lg shadow-accent/20"
                        >
                            <Sparkles className="w-4 h-4" aria-hidden="true" />
                            {t(n > 1 ? `Analyze all ${n}` : 'Analyze', n > 1 ? `ניתוח כל ה-${n}` : 'ניתוח')}
                        </button>
                        <button
                            type="button"
                            onClick={clearPicks}
                            className="h-11 px-4 rounded-xl text-[14px] font-semibold text-text-secondary hover:text-text hover:bg-fill-subtle transition-colors"
                        >
                            {t('Cancel', 'ביטול')}
                        </button>
                    </div>
                    {fileInput}
                </div>
            </div>
        );
    }

    const failure = failed && (
        <p className="mt-2 text-[12px] text-text-muted leading-snug" role="alert">
            {link.enrichError || t('Couldn’t read those screenshots.', 'לא הצלחנו לקרוא את צילומי המסך האלה.')}
        </p>
    );
    const retryButtons = failed && (
        <>
            {lastSent.length > 0 && (
                <button type="button" onClick={() => send(lastSent)} className={pill}>
                    <RefreshCw className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span>{t('Try again', 'נסו שוב')}</span>
                </button>
            )}
        </>
    );

    // ── 4. DONE / COMPLETED ─────────────────────────────────────────────────
    if (completed) {
        return (
            <div className={className} dir={isRtl ? 'rtl' : 'ltr'}>
                {justUpdated ? (
                    <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 animate-fade-in" role="status">
                        <CheckCircle2 className="w-4 h-4 mt-[1px] text-accent shrink-0" aria-hidden="true" />
                        <p className="text-[13px] leading-relaxed text-text">
                            <span className="font-semibold">{t('Card updated.', 'הכרטיס עודכן.')}</span>{' '}
                            {t(
                                count > 1 ? `Read in full from your ${count} screenshots.` : 'Read in full from your screenshot.',
                                count > 1 ? `נקרא במלואו מ-${count} צילומי המסך שלך.` : 'נקרא במלואו מצילום המסך שלך.',
                            )}
                        </p>
                    </div>
                ) : (
                    <p className="flex items-start gap-2 text-[13px] leading-relaxed text-text-muted">
                        <CheckCircle2 className="w-3.5 h-3.5 mt-[3px] shrink-0" aria-hidden="true" />
                        <span className="min-w-0">
                            {t(
                                count > 1 ? `Read from your ${count} screenshots.` : 'Read from your screenshot.',
                                count > 1 ? `נקרא מ-${count} צילומי המסך שלך.` : 'נקרא מצילום המסך שלך.',
                            )}
                        </span>
                    </p>
                )}
                {failure}
                {uid && (room > 0 || failed) && (
                    <div className="mt-2.5 ms-[22px] flex flex-wrap items-center gap-2">
                        {retryButtons}
                        {room > 0 && (
                            <label htmlFor={inputId} className={pill}>
                                <ImagePlus className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden="true" />
                                <span>{t('Missed part of the post? Add more', 'חסר חלק מהפוסט? הוסיפו עוד')}</span>
                            </label>
                        )}
                        {fileInput}
                    </div>
                )}
            </div>
        );
    }

    // ── 1. ASK (partial card) ───────────────────────────────────────────────
    const isPdf = link.captureReason === 'pdf';
    const line = isPdf
        ? t('Machina couldn’t read this PDF.', 'לא הצלחנו לקרוא את קובץ ה-PDF.')
        : link.captureReason === 'file'
            ? t('Machina couldn’t read this file.', 'לא הצלחנו לקרוא את הקובץ.')
            : t('Machina couldn’t read the full post.', 'לא הצלחנו לקרוא את הפוסט במלואו.');
    const hint = uid
        ? t('Add screenshots of it and Machina reads it in full, right into this card.', 'הוסיפו צילומי מסך שלו ו-Machina יקרא אותו במלואו, ישר לתוך הכרטיס.')
        : t('Share a screenshot of it for the full card.', 'שתפו צילום מסך שלו כדי לקבל כרטיס מלא.');

    return (
        <div className={className} dir={isRtl ? 'rtl' : 'ltr'}>
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-text-muted">
                <EyeOff className="w-3.5 h-3.5 mt-[3px] shrink-0" aria-hidden="true" />
                <span className="min-w-0">{line} {hint}</span>
            </p>
            {failure && <div className="ms-[22px]">{failure}</div>}
            {uid && (
                <div className="mt-2.5 ms-[22px]">
                    <div className="flex flex-wrap items-center gap-2">
                        {retryButtons}
                        <label htmlFor={inputId} className={pill}>
                            <ImagePlus className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden="true" />
                            <span>
                                {!failed
                                    ? t('Add screenshots', 'הוסיפו צילומי מסך')
                                    : lastSent.length
                                        ? t('Choose other screenshots', 'בחירת צילומי מסך אחרים')
                                        : t('Try again', 'נסו שוב')}
                            </span>
                        </label>
                    </div>
                    {!failed && (
                        <p className="mt-1.5 text-[12px] text-text-muted/80 leading-snug">
                            {t(
                                `Long post? Take several as you scroll, up to ${MAX_CARD_SCREENSHOTS}. You'll review them before anything is sent.`,
                                `פוסט ארוך? צלמו כמה תוך כדי גלילה, עד ${MAX_CARD_SCREENSHOTS}. תוכלו לעבור עליהם לפני השליחה.`,
                            )}
                        </p>
                    )}
                    {fileInput}
                </div>
            )}
        </div>
    );
}
