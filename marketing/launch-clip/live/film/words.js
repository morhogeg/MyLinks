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
 * further under that line's voice: the first line (over the boot's strikes),
 * the Ask answer (the score is fullest there), and the name and the tagline
 * (the brand lines, as the reel ducks its brand lines).
 *
 * The opening is the reel's: the problem, then the name (owner, 2026-10-06:
 * "narration is missing in the first few seconds, we had it before"), but
 * without the subtitle line ("not needed"), and with the launch film's
 * "a thread" where the reel said "a recipe" (no cooking content, 2026-10-02).
 */

/** @param {Record<string, number>} A  @param {number} end  @param {string} format */
export function wordsOf(A, end, format) {
  // (16:9 sets it narrow: the slab moves left for the sources and a long
  // second line ran into it)
  const answerLine = format === 'portrait' ? 'Every answer comes\nstraight from your saves.' : 'Every answer\ncomes straight\nfrom your saves.';
  const P = format === 'portrait';
  return [
    // the opening, over the boot and the ring of saves (the `open` slot)
    { t0: A.boot + 0.45, t1: A.bootExit + 0.35, text: P ? 'You save things\neverywhere.' : 'You save things everywhere.', place: 'open', cls: 'open', duck: 0.5 },
    { t0: A.bootExit + 0.5, t1: A.home + 2.75, text: P ? 'An article here.\nA video there.\nA thread somewhere else.' : 'An article here. A video there.\nA thread somewhere else.', place: 'open', cls: 'open' },
    { t0: A.home + 2.95, t1: A.gather - 1.7, text: P ? 'Saved, and rarely\nseen again.' : 'Saved, and rarely seen again.', place: 'open', cls: 'open' },
    { t0: A.gather - 1.5, t1: A.gather + 0.15, text: 'Introducing Machina.', place: 'open', cls: 'open', duck: 0.4 },
    { t0: A.gather + 1.05, t1: A.modeImage - 0.05, kicker: 'Save', text: 'Save anything,\nfrom anywhere.', place: 'side' },
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
