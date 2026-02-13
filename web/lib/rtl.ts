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
