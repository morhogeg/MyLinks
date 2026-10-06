/**
 * Scrolling that honours Reduce Motion. CSS `scroll-behavior` is already
 * guarded in globals.css, but an explicit `behavior: 'smooth'` in a
 * scrollTo/scrollIntoView call overrides it, so those calls ask here (RM-2).
 */
export function scrollBehavior(): ScrollBehavior {
    if (typeof window === 'undefined' || !window.matchMedia) return 'smooth';
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
