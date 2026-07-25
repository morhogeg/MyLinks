/**
 * The one URL-scheme guard for stored card URLs.
 *
 * `link.url` is untrusted: it arrives from the web add form, the iOS share
 * sheet, the browser extension, or a scraper-populated field, and it is stored
 * verbatim on the card doc. Anything rendered as an `href` or handed to
 * `window.open()` must therefore be proven http(s) first — a stored
 * `javascript:` value in either position runs script in the app's own origin,
 * with the user's live Firestore session.
 *
 * This lived as a copy-pasted `/^https?:\/\//i` regex at five call sites, and
 * two more sites (the placeholder card's footer link, the card action sheet's
 * "Open source" row) never got the copy. One exported predicate instead, so
 * there is exactly one thing to get right.
 */
export function isHttpUrl(url: string | null | undefined): boolean {
    return !!url && /^https?:\/\//i.test(url);
}
