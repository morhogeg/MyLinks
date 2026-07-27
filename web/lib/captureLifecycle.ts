'use client';

/**
 * Per-capture completion LATCH — the one place that answers "has THIS capture
 * already shown its banner lifecycle?".
 *
 * WHY THIS EXISTS
 * ---------------
 * A single shared item is narrated by TWO independent banner sources:
 *
 *   1. `useSharedCaptureBanner` — the optimistic bridge, armed from the iOS
 *      Share Extension's App Group flag and anchored to the extension's
 *      capture-start wall clock (`startedAt`).
 *   2. `useProcessingBanner` — the authoritative Firestore source, anchored to
 *      the placeholder card's `processingStartedAt` (which the server stamps
 *      when it RECEIVES the upload — seconds after the extension started).
 *
 * Neither source knew what the other had already shown. So when the bridge ran
 * out its ramp and played its finish frame BEFORE the server's placeholder card
 * streamed into the feed, the card's arrival started a second, brand-new
 * lifecycle: the bar reappeared and replayed the phases (owner-reported,
 * 2026-07-27). Making that impossible with a timing nudge is emergent and
 * fragile; making it impossible with a shared latch is structural.
 *
 * THE INVARIANT
 * -------------
 * One logical capture drives at most ONE banner lifecycle per app session.
 * Once a capture has shown its finish frame, no later source — an optimistic
 * re-arm, a late placeholder card, a foreground event, a duplicate/retried
 * card — may reopen a banner for it. A genuinely NEW capture is unaffected.
 *
 * CORRELATING THE TWO SOURCES
 * ---------------------------
 * The two clocks are NOT equal. The extension's `startedAt` is capture start on
 * the device; the card's `processingStartedAt` is server-receive time, strictly
 * later (see the long comment in useProcessingBanner around its handoff
 * anchoring). So the latch cannot key on timestamp equality. Instead each
 * placeholder card CLAIMS at most one unclaimed capture entry — the nearest one
 * in time inside a bounded window — and a claimed entry is never offered to a
 * second card. Nearest-match plus one-claim-each is what keeps two captures a
 * few seconds apart from being confused for one another:
 *
 *   share A @ t=0 ─ card A @ t=5s  → |5-0|=5  < |5-30|=25  → claims entry A
 *   share B @ t=30s ─ card B @ t=35s → entry A is taken    → claims entry B
 *
 * Timestamps can also be missing entirely; a card with no usable clock simply
 * gets its own entry keyed by card id and is never correlated to a share.
 *
 * PURITY
 * ------
 * The lookups (`isShareCaptureFinished`, `isCardCaptureFinished`) are pure
 * reads, safe to call during render — they resolve a card to its capture with
 * the same nearest-match rule the claim uses, so the very first render after a
 * late card arrives already knows the capture is spent (no one-frame flash).
 * Only `beginShareCapture` / `claimCardCapture` / `finish*` mutate, and those
 * are called from effects.
 */

/**
 * How long AFTER a capture's start clock a server placeholder may still be
 * recognised as belonging to that capture. Comfortably longer than the
 * optimistic bridge's own 30s give-up (so the card it was waiting for is still
 * matchable), short enough that an unrelated capture minutes later can never be
 * swallowed by a stale entry.
 */
export const CLAIM_FORWARD_MS = 90_000;
/**
 * Tolerated backwards skew between the device clock (extension `startedAt`) and
 * the server clock (`processingStartedAt`). A card should never predate its own
 * capture, but both clocks are wall clocks on different machines.
 */
export const CLAIM_SKEW_MS = 60_000;
/** Entries are session-scoped bookkeeping; forget ones nothing has touched. */
const ENTRY_TTL_MS = 10 * 60_000;
/** Hard cap so a long session can't grow the registry without bound. */
const MAX_ENTRIES = 32;

export interface CaptureEntry {
    /** Which source opened this entry. Only `share` entries are claimable. */
    origin: 'share' | 'card';
    /** The Share Extension's capture-start wall clock, when this came from one. */
    startMs: number | null;
    /** The placeholder card that claimed this capture, once one has. */
    cardId: string | null;
    /** That card's own start clock at claim time — a re-stamp means a new attempt. */
    cardStartMs: number | null;
    /** True once this capture has shown its finish frame. The latch. */
    finished: boolean;
    touchedAt: number;
}

let entries: CaptureEntry[] = [];

/** Test/dev hook: forget every capture (a fresh "app session"). */
export function resetCaptureLifecycle(): void {
    entries = [];
}

/** Read-only view of the registry, for tests and debugging. */
export function captureEntries(): readonly CaptureEntry[] {
    return entries;
}

function prune(now: number): void {
    entries = entries.filter((e) => now - e.touchedAt < ENTRY_TTL_MS);
    if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES);
}

/**
 * The capture a placeholder card belongs to, or null. PURE — no mutation, safe
 * during render.
 *
 * Resolution order:
 *  1. the entry this exact card already claimed (same id AND same start clock —
 *     a re-stamped `processingStartedAt` is a RETRY, i.e. a new capture);
 *  2. otherwise the nearest unclaimed Share-Extension entry inside the window.
 */
export function findCaptureForCard(cardId: string, cardStartMs: number | null): CaptureEntry | null {
    for (const e of entries) {
        if (e.cardId === cardId && e.cardStartMs === cardStartMs) return e;
    }
    if (cardStartMs == null) return null;
    let best: CaptureEntry | null = null;
    let bestDist = Infinity;
    for (const e of entries) {
        if (e.origin !== 'share' || e.cardId !== null || e.startMs == null) continue;
        const delta = cardStartMs - e.startMs;
        if (delta < -CLAIM_SKEW_MS || delta > CLAIM_FORWARD_MS) continue;
        const dist = Math.abs(delta);
        if (dist < bestDist) {
            best = e;
            bestDist = dist;
        }
    }
    return best;
}

/**
 * Bind a placeholder card to its capture, creating an entry if it correlates to
 * no pending share. Idempotent. Mutates — call from an effect, not render.
 */
export function claimCardCapture(cardId: string, cardStartMs: number | null): CaptureEntry {
    const now = Date.now();
    prune(now);
    const found = findCaptureForCard(cardId, cardStartMs);
    if (found) {
        found.cardId = cardId;
        found.cardStartMs = cardStartMs;
        found.touchedAt = now;
        return found;
    }
    const entry: CaptureEntry = {
        origin: 'card',
        startMs: cardStartMs,
        cardId,
        cardStartMs,
        finished: false,
        touchedAt: now,
    };
    entries.push(entry);
    prune(now);
    return entry;
}

/** Has the capture this card belongs to already shown its finish frame? PURE. */
export function isCardCaptureFinished(cardId: string, cardStartMs: number | null): boolean {
    return findCaptureForCard(cardId, cardStartMs)?.finished ?? false;
}

/**
 * Latch: this card's capture has resolved and shown its finish frame. Called
 * when a card genuinely leaves `status: 'processing'`.
 */
export function finishCardCapture(cardId: string, cardStartMs: number | null): void {
    const now = Date.now();
    const entry = findCaptureForCard(cardId, cardStartMs) ?? claimCardCapture(cardId, cardStartMs);
    entry.finished = true;
    entry.touchedAt = now;
}

/** The Share-Extension entry for this exact capture-start clock, or null. PURE. */
function findShareCapture(startMs: number): CaptureEntry | null {
    for (const e of entries) {
        if (e.origin === 'share' && e.startMs === startMs) return e;
    }
    return null;
}

/**
 * Register the capture the optimistic bridge is about to open a banner for.
 * Idempotent for a given start clock (the App Group flag is one-shot, but a
 * foreground re-check must never mint a second entry). Mutates.
 */
export function beginShareCapture(startMs: number): CaptureEntry {
    const now = Date.now();
    prune(now);
    const existing = findShareCapture(startMs);
    if (existing) {
        existing.touchedAt = now;
        return existing;
    }
    const entry: CaptureEntry = {
        origin: 'share',
        startMs,
        cardId: null,
        cardStartMs: null,
        finished: false,
        touchedAt: now,
    };
    entries.push(entry);
    prune(now);
    return entry;
}

/** Has this shared capture already shown its finish frame? PURE. */
export function isShareCaptureFinished(startMs: number): boolean {
    return findShareCapture(startMs)?.finished ?? false;
}

/** Latch: the optimistic bridge played its terminal ("Saved") frame. */
export function finishShareCapture(startMs: number): void {
    const entry = beginShareCapture(startMs);
    entry.finished = true;
    entry.touchedAt = Date.now();
}
