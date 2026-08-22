/**
 * Break a wall-of-text answer into readable paragraphs.
 *
 * WHY THIS IS NOT A PROMPT FIX. The RAG prompt has asked for this since
 * 2026-07-28 — twice over, once in the rules list and once in the output-format
 * suffix that is the last thing the model reads — and long answers still came
 * back as one unbroken block (owner, five times). A rule the model applies
 * "usually" is not a layout; the reader either gets paragraphs or they don't.
 * So the prompt keeps asking (a model that structures its own answer does it
 * better than any splitter can — real bullets, real mini-headings), and this
 * guarantees a floor underneath it.
 *
 * It is deliberately conservative:
 *  - an answer that ALREADY has structure (a blank line, a list, a heading, a
 *    quote, a code fence, a table) is returned untouched — the model's own
 *    formatting always wins;
 *  - short answers stay one plain paragraph, because breaking those up is
 *    noise (the threshold is LENGTH, not sentence count — the wall the owner
 *    reported was only three sentences long, they were just enormous);
 *  - it only ever inserts blank lines. No word of the answer changes, nothing
 *    is reordered, nothing is dropped.
 *
 * Applied at RENDER time (see AskBrain's MarkdownMessage), which means it also
 * repairs answers already sitting in the user's chat history, and covers both
 * RAG paths — the native buffered one and the web streamed one — without either
 * needing to know about it.
 */

/** Target paragraph length in characters. Sentences are grouped greedily up to
 *  this — so an answer of short sentences gets 2-3 per paragraph, while the
 *  90-word monsters a comparison answer produces get one each. Sentence COUNT
 *  is the wrong unit: the reported wall was only three sentences long. */
const PARAGRAPH_CHARS = 220;
/** An answer shorter than this reads fine as one paragraph whatever its shape. */
const MIN_CHARS = 320;
/** …and one with fewer sentences than this cannot be split at all. */
const MIN_SENTENCES = 3;

/** Lines that mean "the model formatted this itself — hands off." */
const STRUCTURED_LINE = /^\s*(?:[-*+•]\s|\d+[.)]\s|#{1,6}\s|>\s|```|\|)/;

/** Abbreviations that end in a period WITHOUT ending a sentence. */
const ABBREVIATIONS = new Set([
    'e.g', 'i.e', 'etc', 'vs', 'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'no',
    'fig', 'approx', 'est', 'inc', 'ltd', 'co', 'jr', 'sr', 'u.s', 'u.k',
    // Political/military titles — "Rep. Ralph Norman" must not split ("Rep."
    // stranded a name on a card, 2026-08-22; same list as SimpleMarkdown's
    // ABBREV_END guard).
    'rep', 'sen', 'gov', 'gen', 'col', 'lt', 'sgt', 'capt', 'rev', 'hon',
    'adm', 'maj', 'pres', 'sec',
]);

/**
 * Split prose into sentences. Conservative by design — when in doubt it does
 * NOT split, because a missed break costs nothing and a wrong one mangles the
 * text. Guards: decimals (3.5), single initials (J. Smith), the abbreviation
 * list above, and closing punctuation/quotes that trail the terminator.
 */
function splitSentences(text: string): string[] {
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '\n') continue;

        if (ch === '\n') {
            // A hard line break the model put in IS a boundary.
            const piece = text.slice(start, i + 1);
            if (piece.trim()) out.push(piece);
            start = i + 1;
            continue;
        }

        // Swallow any run of terminators plus the closing quote/bracket that
        // belongs to this sentence ("…!?" / `…."` / `…)` ).
        let end = i;
        while (end + 1 < text.length && '.!?'.includes(text[end + 1])) end++;
        while (end + 1 < text.length && '"\'”’»)]'.includes(text[end + 1])) end++;

        const next = text[end + 1];
        // A sentence ends only when whitespace follows (or the text does).
        if (next !== undefined && !/\s/.test(next)) { i = end; continue; }

        if (ch === '.') {
            const before = text.slice(Math.max(0, start), i);
            const lastWord = (before.match(/([\p{L}\p{N}.]+)$/u)?.[1] ?? '').toLowerCase();
            // 3.5 — a decimal, not a full stop.
            if (/\d$/.test(before) && /^\d/.test(text.slice(end + 1).trimStart())) { i = end; continue; }
            // "J." — an initial.
            if (/^\p{L}$/u.test(lastWord)) { i = end; continue; }
            if (ABBREVIATIONS.has(lastWord.replace(/\.$/, ''))) { i = end; continue; }
        }

        out.push(text.slice(start, end + 1));
        start = end + 1;
        i = end;
    }
    const tail = text.slice(start);
    if (tail.trim()) out.push(tail);
    return out;
}

/** The answer, with blank lines inserted between groups of sentences when it
 *  would otherwise render as one block. Returns the input unchanged whenever it
 *  is already structured, or short enough not to need it. */
export function breakIntoParagraphs(text: string): string {
    if (!text) return text;
    // ANY line break means the model laid this out itself — paragraphs, a list,
    // a **bold** mini-heading, a table. Its formatting always wins, and a
    // renderer that second-guesses it would mangle exactly the good answers.
    // The wall this exists for has no line breaks at all.
    if (/\n/.test(text)) return text;
    if (STRUCTURED_LINE.test(text)) return text;
    if (text.trim().length < MIN_CHARS) return text;

    const sentences = splitSentences(text).map((s) => s.trim()).filter(Boolean);
    if (sentences.length < MIN_SENTENCES) return text;

    // Greedy fill: start a new paragraph when the current one is already at
    // length. Every paragraph keeps at least one sentence, so a single very
    // long sentence is never cut in half.
    const groups: string[][] = [[]];
    let width = 0;
    for (const sentence of sentences) {
        const current = groups[groups.length - 1];
        if (current.length && width + sentence.length > PARAGRAPH_CHARS) {
            groups.push([sentence]);
            width = sentence.length;
        } else {
            current.push(sentence);
            width += sentence.length + 1;
        }
    }
    if (groups.length < 2) return text;
    return groups.map((g) => g.join(' ')).join('\n\n');
}
