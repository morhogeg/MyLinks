/**
 * Utility to detect if a string contains Hebrew characters and should be displayed RTL.
 */
export function hasHebrew(text: string): boolean {
    if (!text) return false;
    // Hebrew character range: \u0590-\u05FF
    const hebrewRegex = /[\u0590-\u05FF]/;
    return hebrewRegex.test(text);
}

/**
 * Higher level helper to determine directionality based on content and/or language metadata.
 */
export function getDirection(text: string, language?: string): 'rtl' | 'ltr' {
    if (language === 'he') return 'rtl';
    if (hasHebrew(text)) return 'rtl';
    return 'ltr';
}

/**
 * The direction MOST of the text reads in — by counting strong-directional
 * characters — rather than whichever script happens to appear first.
 *
 * Why not `dir="auto"` (first-strong)? An English answer whose bullet OPENS
 * with a quoted Hebrew title flips that whole line RTL: the bullet marker
 * jumps to the right, the English prose renders right-aligned, and trailing
 * punctuation scrambles ("An :(saved: 2026-07-17)…"). Majority counting keeps
 * an English-dominant block LTR (embedded Hebrew runs still render RTL inline,
 * which standard bidi handles correctly) and a Hebrew-dominant block RTL.
 */
export function getDominantDirection(text: string): 'rtl' | 'ltr' {
    if (!text) return 'ltr';
    // Direction belongs to the PROSE, not to quoted card titles: a Hebrew
    // answer citing three long English titles must stay RTL (and vice versa),
    // so quoted spans don't get a vote. If stripping leaves no strong chars
    // (an answer that is little more than a quoted title), fall back to
    // counting the full text.
    const prose = text.replace(/["\u201C\u201D\u00AB\u00BB][^"\u201C\u201D\u00AB\u00BB]{0,200}["\u201C\u201D\u00AB\u00BB]/g, ' ');
    const count = (s: string) => ({
        // Hebrew + Arabic ranges vs Latin letters — strong directional chars
        // only (digits/punctuation are neutral and must not vote).
        rtl: (s.match(/[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\uFB1D-\uFDFF\uFE70-\uFEFF]/g) ?? []).length,
        ltr: (s.match(/[A-Za-z]/g) ?? []).length,
    });
    let { rtl, ltr } = count(prose);
    if (rtl === 0 && ltr === 0) ({ rtl, ltr } = count(text));
    return rtl > ltr ? 'rtl' : 'ltr';
}
