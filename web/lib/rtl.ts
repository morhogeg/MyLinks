/**
 * Utility to detect if a string contains Hebrew characters and should be displayed RTL.
 */
export function hasHebrew(text: string): boolean {
    if (!text) return false;
    // Hebrew character range: \u0590-\u05FF
    const hebrewRegex = /[\u0590-\u05FF]/;
    return hebrewRegex.test(text);
}

// Right-to-left scripts the card analysis can produce: Hebrew and Arabic
// (which also covers Persian, Urdu, Pashto, Kurdish Sorani).
const RTL_SCRIPT_RE = /[֐-׿יִ-ﭏ؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const ARABIC_SCRIPT_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
// ISO 639-1 codes the backend writes to `link.language` for RTL content.
const RTL_LANGS = new Set(['he', 'iw', 'yi', 'ar', 'fa', 'ur', 'ps', 'ckb', 'sd', 'ug']);

/** True when `text` contains any Hebrew- or Arabic-script letter. */
export function hasRtlScript(text: string | null | undefined): boolean {
    return !!text && RTL_SCRIPT_RE.test(text);
}

/**
 * Should a card's content LAYOUT run right-to-left? Hebrew and Arabic-script
 * languages. Layout only: Hebrew microcopy ("דק׳ קריאה", time-ago, related
 * reasons) keys off `isHebrewContent` instead, so an Arabic card gets RTL
 * alignment with the app's English labels, never Hebrew ones.
 */
export function isRtlContent(language: string | null | undefined, ...texts: (string | null | undefined)[]): boolean {
    if (language && RTL_LANGS.has(language.toLowerCase())) return true;
    return texts.some(hasRtlScript);
}

/** Is a card Hebrew (drives the Hebrew microcopy, not the layout)? */
export function isHebrewContent(language: string | null | undefined, ...texts: (string | null | undefined)[]): boolean {
    if (language === 'he' || language === 'iw') return true;
    return texts.some((t) => !!t && hasHebrew(t));
}

/**
 * Higher level helper to determine directionality based on content and/or language metadata.
 */
export function getDirection(text: string, language?: string): 'rtl' | 'ltr' {
    return isRtlContent(language, text) ? 'rtl' : 'ltr';
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
export function getDominantDirection(text: string, fallback: 'rtl' | 'ltr' = 'ltr'): 'rtl' | 'ltr' {
    if (!text) return fallback;
    // Direction belongs to the PROSE, not to card titles: a Hebrew answer
    // citing three long English titles must stay RTL (and vice versa), so
    // neither QUOTED spans nor **bolded** spans (how the model writes titles
    // in recap bullets) get a vote. If stripping leaves no strong chars (an
    // answer that is little more than a title), count the full text; if THAT
    // is neutral too, use the caller's fallback (e.g. the question's
    // direction).
    const prose = text
        .replace(/["\u201C\u201D\u00AB\u00BB][^"\u201C\u201D\u00AB\u00BB]{0,300}["\u201C\u201D\u00AB\u00BB]/g, ' ')
        .replace(/\*\*[^*\n]{1,300}\*\*/g, ' ');
    const count = (s: string) => ({
        // Hebrew + Arabic ranges vs Latin letters — strong directional chars
        // only (digits/punctuation are neutral and must not vote).
        rtl: (s.match(/[\u0590-\u05FF\u0600-\u06FF\u0700-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g) ?? []).length,
        ltr: (s.match(/[A-Za-z]/g) ?? []).length,
    });
    let { rtl, ltr } = count(prose);
    if (rtl === 0 && ltr === 0) ({ rtl, ltr } = count(text));
    if (rtl === 0 && ltr === 0) return fallback;
    return rtl > ltr ? 'rtl' : 'ltr';
}

/**
 * The `lang` for a piece of the user's content: "he" when it is mostly
 * Hebrew, "ar" when it is mostly Arabic script, otherwise none (the page's
 * English). `dir` alone only flips the layout; VoiceOver picks its voice from
 * `lang`, so Hebrew titles and summaries were read with the English voice.
 * Set it on the content element itself, not on a container that also holds
 * English chrome.
 */
export function contentLang(text: string | null | undefined): 'he' | 'ar' | undefined {
    if (!text || getDominantDirection(text) !== 'rtl') return undefined;
    if (hasHebrew(text)) return 'he';
    return ARABIC_SCRIPT_RE.test(text) ? 'ar' : undefined;
}
