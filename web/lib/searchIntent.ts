/**
 * Does this search query read like a QUESTION rather than a lookup?
 *
 * Search finds cards; Ask answers with a cited paragraph. Typing "why do we
 * dream" into the search field is a question the card grid can only answer
 * sideways, so the feed offers one row above the results ("Ask Machina: …")
 * that hands the same words to Ask. It is an OFFER, never an auto-switch —
 * the results still render underneath.
 *
 * Two signals, both cheap and language-agnostic enough for the app's mixed
 * English/Hebrew libraries:
 *   1. The query ends in a question mark.
 *   2. It OPENS with a question word AND carries at least one more word —
 *      "how" on its own is a lookup for cards about how-to; "how do I focus"
 *      is a question.
 */

/** Openers, English + Hebrew. Hebrew has no case, so lowercasing is a no-op there. */
const QUESTION_WORDS = new Set([
    'what', 'how', 'why', 'when', 'where', 'who', 'which', 'is', 'are', 'can', 'should',
    'מה', 'איך', 'למה', 'מדוע', 'מתי', 'איפה', 'מי', 'איזה', 'האם',
]);

export function looksLikeQuestion(query: string): boolean {
    const trimmed = query.trim();
    if (trimmed.length < 2) return false;
    if (trimmed.endsWith('?')) return true;
    const words = trimmed.split(/\s+/);
    if (words.length < 2) return false;
    // Strip punctuation/quotes off the opener so «"why» and «why,» still count.
    const first = words[0].toLowerCase().replace(/[^\p{L}]/gu, '');
    return QUESTION_WORDS.has(first);
}
