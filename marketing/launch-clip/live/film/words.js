/**
 * The film's words: every caption, when it shows and where. Pure data on the
 * film's clock (A = makeEdit().at), so the picture (script.js), the narrator
 * (audio/synth-vo.py live, through voiceOf) and the copy checks (verify.mjs)
 * all read this one list. The captions ARE the script: the voice says what
 * the screen shows, so the two cannot drift apart.
 *
 * `place` names a slot in the format's caption layout (formats.js), or 'end'
 * for the endcard. A `\n` is a line break on screen only; the voice reads
 * straight on. Kickers are labels, never spoken. `duck` dips the music
 * further under that line's voice (the score runs fullest over Ask, and the
 * tagline is the brand line, as the reel ducks its brand lines).
 *
 * The film opens on the app and the ring of saves with no words (owner,
 * 2026-10-06: the subtitle line "is not needed" at the start).
 */

/** @param {Record<string, number>} A  @param {number} end  @param {string} format */
export function wordsOf(A, end, format) {
  // (16:9 sets it narrow: the slab moves left for the sources and a long
  // second line ran into it)
  const answerLine = format === 'portrait' ? 'Every answer comes\nstraight from your saves.' : 'Every answer\ncomes straight\nfrom your saves.';
  return [
    { t0: A.home + 5.75, t1: A.modeImage - 0.05, kicker: 'Save', text: 'Save anything,\nfrom anywhere.', place: 'side' },
    { t0: A.modeImage + 0.1, t1: A.phase0 - 0.05, text: 'A link, a screenshot,\nor a note.', place: 'side' },
    { t0: A.phase0 + 0.2, t1: A.done + 0.35, text: 'Machina reads it,\nsummarizes it,\nand files it.', place: 'side' },
    { t0: A.landed + 0.3, t1: A.close - 0.05, text: 'Each save becomes a card,\nwith the key points\npulled out.', place: 'side' },
    { t0: A.findHome + 0.05, t1: A.findDone + 0.25, kicker: 'Find', text: 'Find it in\nyour own words.', place: 'side' },
    { t0: A.askOpen + 0.05, t1: A.sent + 0.1, kicker: 'Ask', text: 'Ask anything.', place: 'side' },
    { t0: A.stream + 0.2, t1: A.graph - 0.1, text: answerLine, place: 'side', duck: 0.4 },
    { t0: A.graph + 0.25, t1: A.revisit - 0.1, kicker: 'Connect', text: 'Related saves\nfind each other,\nall on their own.', place: 'side' },
    { t0: A.revisit + 0.15, t1: A.expand + 0.05, kicker: 'Revisit', text: 'When a save calls for action,\nMachina turns it into a to-do.', place: 'side' },
    { t0: A.expand + 0.25, t1: A.end + 1.2, text: 'Every week, Machina\nbrings back what’s\nworth remembering.', place: 'side' },
    { t0: A.outro + 2.85, t1: end + 1, text: 'Everything you save, finally useful.', place: 'end', cls: 'tagline', duck: 0.4 },
  ];
}

/** How long after its caption starts arriving the narrator begins a line. */
const LEAD = 0.1;

/**
 * The narrator's script: one line per caption, starting as the caption
 * arrives, and it has to be spoken before that caption leaves (or the film
 * ends). Format-free: the two cuts break some lines differently, but say
 * the same words.
 */
export function voiceOf(A, end) {
  return wordsOf(A, end, 'landscape').map((w) => ({
    start: w.t0 + LEAD,
    window: Math.min(w.t1, end) - (w.t0 + LEAD),
    text: w.text.split(/\s+/).join(' '),
    ...(w.duck ? { duck: w.duck } : {}),
  }));
}
