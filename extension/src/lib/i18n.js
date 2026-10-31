/**
 * Every string a person reads lives in _locales/<lang>/messages.json.
 * `t()` is chrome.i18n.getMessage with a visible fallback, so a missing key
 * shows up as its own name in testing instead of an empty label.
 */

/** @param {string} key @param {string|string[]} [subs] */
export function t(key, subs) {
    const value = chrome.i18n.getMessage(key, subs);
    return value || key;
}

/**
 * Fill static markup: `data-i18n` sets text, `data-i18n-<attr>` sets an
 * attribute (aria-label, title, placeholder). Pages never put copy in HTML.
 * @param {ParentNode} root
 */
export function localize(root) {
    for (const el of root.querySelectorAll('[data-i18n]')) {
        el.textContent = t(el.getAttribute('data-i18n'));
    }
    for (const attr of ['aria-label', 'title', 'placeholder']) {
        for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) {
            el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
        }
    }
}
