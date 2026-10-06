/**
 * The edit: which captured frame of the session the screen shows, moment by
 * moment (seq.js). Pure data on purpose: the picture (script.js), the score
 * (live/score.mjs) and the checks (live/verify.mjs) all read the film's clock
 * from here, so a retimed hold moves the camera, the words and the music
 * together.
 */

import { glide, hold, makeSeq, play } from './seq.js';

/** @param {{marks: Record<string, number>, count: number, flags?: Record<string, number[]>}} session */
export function makeEdit(session) {
  const flash = session.flags?.['Close matches'] ?? [];
  const seq = makeSeq(session, [
    play('boot', 'arrive', 'exit', { fps: 30 }),
    play('bootExit', 'exit', 'home', { fps: 60 }),
    // (8.8s: the ring orbits under the narrator's opening lines, words.js)
    hold('home', 'home', 8.8),
    play('dialog', 'dialogOpen', 'modeImage', { fps: 30 }),
    hold('dialogSet', ['modeImage', -1], 0.6),
    play('modeImage', 'modeImage', 'modeNote', { fps: 60 }),
    hold('modeImageHold', ['modeNote', -1], 0.75),
    play('modeNote', 'modeNote', 'modeLink', { fps: 60 }),
    hold('modeNoteHold', ['modeLink', -1], 0.75),
    play('modeLink', 'modeLink', 'filled', { fps: 60 }),
    hold('modeLinkHold', ['filled', -1], 0.35),
    hold('filled', 'filled', 0.8),
    play('phase0', 'phase0', 'phase1'),
    play('phase1', 'phase1', 'phase2'),
    play('phase2', 'phase2', 'phase3'),
    play('phase3', 'phase3', 'phase4'),
    play('phase4', 'phase4', 'done'),
    play('done', 'done', 'landed'),
    hold('landed', 'landed', 3.0),
    play('detail', 'detail', 'detailScroll', { fps: 60 }),
    hold('detailRead', ['detailScroll', -1], 0.9),
    glide('detailScroll', 'detailScroll', ['detailEnd', -1], 0.9),
    hold('detailEnd', 'detailEnd', 1.8),
    play('close', 'detailClose', 'findHome', { fps: 60 }),
    hold('findHome', 'findHome', 0.45),
    play('focus', 'focus', 'typing'),
    play('typing', 'typing', 'searching', { skip: flash }),
    play('searching', 'searching', 'result'),
    play('result', 'result', 'findDone'),
    hold('resultHold', ['findDone', -1], 2.0),
    play('findDone', 'findDone', 'findClear'),
    play('findClear', 'findClear', 'askHome'),
    hold('askHome', 'askHome', 0.35),
    play('askOpen', 'askOpen', 'askTyping'),
    play('askTyping', 'askTyping', 'sent'),
    // never the thinking line between send and the first words (the app's
    // "Searching your …", which says "library"): the reel kit's rule too
    // (audio/verify.mjs NEVER_SHOWN). The question holds for those 0.2s.
    hold('sent', ['sent', -1], 0.2),
    play('stream', 'stream', 'sources', { fps: 15 }),
    play('sources', 'sources', 'graph'),
    hold('srcHold', ['graph', -1], 3.0),
    play('graph', 'graph', 'revisitOpen', { fps: 60 }),
    hold('graphHold', ['revisitOpen', -1], 1.3),
    // (the first frame after the tap is the Revisit view mounting: blank)
    play('revisit', ['revisitOpen', 1], 'revisitHold'),
    // (3.4s: the narrator's Revisit line runs 3.4s and must finish on its beat)
    hold('revHold', 'revisitHold', 3.4),
    play('expand', 'expand', 'recapScroll', { fps: 60 }),
    hold('expHold', ['recapScroll', -1], 1.0),
    glide('recap', 'recapScroll', ['end', -1], 4.0),
    hold('end', ['end', -1], 1.6),
    // (not 'end' itself: that frame was snapped after the clock resumed, and the
    // recap had started to fade)
    hold('outro', ['end', -1], 5.6),
  ]);
  // the gather: the ring of saves spirals into the phone, 1.9s before the Add
  // dialog opens. The opening's beats (the spiral, the band coming in, the
  // camera settling, "Save anything") hang off it, so a longer orbit moves
  // them together.
  seq.at.gather = seq.at.dialog - 1.9;
  return seq;
}

/**
 * Frames a lift shows that the screen does not show at that moment, so the
 * live page needs them as stills (bake.mjs exports them): the Add dialog as it
 * rises from the + (its settled frame) and as it folds back into the feed (its
 * last frame before it closes).
 */
export function stillFrames(session) {
  const m = session.marks;
  let dialogLast = m.done;
  for (let i = m.done; i < m.landed; i++) if (session.rects[i]?.dialog) dialogLast = i;
  return { dialogSettled: m.modeImage - 1, dialogLast };
}

/**
 * The film's chapters, in seconds on the film's clock (A = makeEdit().at):
 * the live page's scrubber marks and the video page's chapter list
 * (live/player.mjs) both read them from here.
 */
export function chaptersOf(A) {
  return [
    { t: 0, name: 'Open' },
    { t: A.home + 5.7, name: 'Save' },
    { t: A.findHome - 0.3, name: 'Find' },
    { t: A.askHome - 0.2, name: 'Ask' },
    { t: A.graph - 0.1, name: 'Connect' },
    { t: A.revisit - 0.15, name: 'Revisit' },
  ];
}
