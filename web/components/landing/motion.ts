/**
 * THE CINEMATIC KILL SWITCH — one line controls the landing's advanced motion.
 *
 * `true`  → the page runs the full choreography: scroll-driven panel
 *           enter/exit (Apple-product-page style, via CSS scroll-driven
 *           animations), pointer parallax on the hero mark and headline, the
 *           glass sticky header, hover lift + sheen on cards and the CTA, the
 *           breathing hero bloom and the drifting graph lattice.
 * `false` → every one of those disappears and the page is EXACTLY the
 *           pre-cinematic landing (one-shot entrances only). This is the
 *           revert the owner asked for: flip this boolean, ship, done — no
 *           other file needs touching, because everything cinematic is gated
 *           on the `mx-cine` class this flag controls and on this flag
 *           directly (the hero parallax listener).
 *
 * Safety rails that hold in BOTH states: `prefers-reduced-motion` collapses
 * all of it (landing.css reduce block + the listener's own media-query gate),
 * scroll-driven animations sit behind `@supports (animation-timeline: view())`
 * so unsupporting browsers get the classic entrances, and no copy or DOM
 * differs between states — the reviewer-reads-text rule is untouched.
 */
export const CINEMATIC_LANDING = true;
