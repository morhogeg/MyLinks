'use client';

import type { Link } from './types';
import { progressFor, CEILING, toMs } from './shareProgress';
import { stageProgress, type CaptureKind } from './scanPhases';
import { lastShareHandoff } from './shareConfig';

/**
 * Where ONE in-flight (`processing`) card is on its capture ramp. Both surfaces
 * that narrate a capture read it from here: the app-level pill
 * (useProcessingBanner, for the newest card) and the card's own status line
 * (Card.tsx). Same inputs, same curve, same per-card high-water mark, so the
 * card and the pill always say the same phase at the same moment.
 */
export interface CardCaptureProgress {
    /** 0–CEILING (never 100 on its own; the card resolving is the finish). */
    progress: number;
    kind: CaptureKind;
    /** The backend stage's step for a LINK capture, when reported. */
    stageStep?: number;
}

// Highest % shown per card this session. The backend re-stamps
// `processingStartedAt` when its job actually starts (seconds after the client
// wrote it), which moves the ramp's anchor LATER; without a shared high-water
// mark the number would step back, and a card that re-mounts (tab switch,
// scroll) would disagree with the pill. Module-level so every surface and every
// mount of the same card reads one value.
const shownPct = new Map<string, number>();
const MAX_TRACKED = 64;

export function captureKindOf(l: Pick<Link, 'sourceType'>): CaptureKind {
    return l.sourceType === 'image' ? 'image' : l.sourceType === 'youtube' ? 'video' : 'link';
}

/**
 * Progress for one processing card at wall-clock `clock` (epoch ms).
 * `fallbackStart` is only used when the card carries no usable timestamp.
 */
export function cardCaptureProgress(l: Link, clock: number, fallbackStart?: number): CardCaptureProgress {
    // The shared start clock stamped on the card (processingStartedAt, then
    // createdAt); first-seen only when a card carries neither.
    const cardStartMs = toMs(l.processingStartedAt) ?? toMs(l.createdAt) ?? fallbackStart ?? clock;
    // CONTINUITY ACROSS PROCESSES: the Share Extension anchors its HUD at capture
    // start, but the card's processingStartedAt is stamped when the server
    // receives the upload — seconds LATER. Anchoring at the card's stamp made the
    // in-app banner restart near 0 after the extension showed a high number
    // (owner-reported, 2026-07-13). If a Share-Extension hand-off from the same
    // capture era exists, anchor at the EARLIER of the two clocks and never show
    // less than the % the extension already showed (capped at the curve ceiling
    // so a legacy "100" hint can't fake completion).
    const handoff = lastShareHandoff();
    const matching = handoff && Math.abs(handoff.startMs - cardStartMs) < 10 * 60_000 ? handoff : null;
    const startMs = matching ? Math.min(cardStartMs, matching.startMs) : cardStartMs;
    const handoffFloor = matching?.pct !== undefined ? Math.min(matching.pct, CEILING) : 0;
    const elapsed = Math.max(0, clock - startMs);
    // Honor the backend's per-stage milestone: floor the % to the reported stage
    // and pin the phase step to it (shared mapping — scanPhases.stageProgress), so
    // the narration never runs ahead of the real work. Absent on a pre-deploy
    // backend, in which case the time ramp / label carry as before.
    const { step, floor } = stageProgress(l.processingStage);
    const progress = Math.max(progressFor(elapsed), handoffFloor, floor, shownPct.get(l.id) ?? 0);
    if (!shownPct.has(l.id) && shownPct.size >= MAX_TRACKED) {
        const oldest = shownPct.keys().next().value;
        if (oldest !== undefined) shownPct.delete(oldest);
    }
    shownPct.set(l.id, progress);
    const kind = captureKindOf(l);
    // The stage step labels the LINK phase precisely; other kinds keep their own
    // pct-derived phrasing, so only forward it when a stage is actually present.
    return { progress, kind, stageStep: kind === 'link' && l.processingStage ? step : undefined };
}

/** Forget a card's high-water mark once its capture has resolved. */
export function forgetCardProgress(id: string): void {
    shownPct.delete(id);
}
