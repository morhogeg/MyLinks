import { GEIST_MONO_WOFF2, GEIST_SANS_WOFF2 } from './fontData';

/**
 * Geist — the app's typeface, from the same `geist` npm package `web/` uses, so
 * the film's type is byte-identical to the product's.
 *
 * Registered as a plain `@font-face` over a base64 data URI, with NO
 * `delayRender` gate. That absence is the point, and it took four attempts:
 *  - `@remotion/google-fonts` → no egress to fonts.gstatic.com here, so every
 *    frame silently fell back to Helvetica.
 *  - `@font-face` → `public/fonts/*.woff2` → the request stalled intermittently
 *    and timed out a frame's delayRender ~500 frames into a 2025-frame render.
 *  - `document.fonts.ready` as the ready signal → it waits on unrelated pending
 *    faces, and Remotion freezes page timers for determinism, so the `setTimeout`
 *    meant to rescue a stuck load could never fire.
 *  - `FontFace.load()` on the data URI → still died at the same frame, because
 *    the hazard was never the load: it is that ANY pending delayRender on a page
 *    that gets wedged mid-render kills the whole render.
 * With a data URI there is nothing to fetch, `font-display: block` makes
 * Chromium hold text paint until the face is decoded, and a frame can no longer
 * take the render down with it.
 */

export const sans = 'Geist';
export const mono = 'Geist Mono';

const register = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('machina-fonts')) return;

  const style = document.createElement('style');
  style.id = 'machina-fonts';
  style.textContent = `
    @font-face {
      font-family: 'Geist';
      src: url(data:font/woff2;base64,${GEIST_SANS_WOFF2}) format('woff2-variations');
      font-weight: 100 900;
      font-style: normal;
      font-display: block;
    }
    @font-face {
      font-family: 'Geist Mono';
      src: url(data:font/woff2;base64,${GEIST_MONO_WOFF2}) format('woff2-variations');
      font-weight: 100 900;
      font-style: normal;
      font-display: block;
    }
  `;
  document.head.appendChild(style);

  // Kick the decode immediately (fire-and-forget — nothing waits on it).
  try {
    [400, 500, 600, 700, 800, 900].forEach((w) => {
      void document.fonts.load(`${w} 40px Geist`);
    });
    void document.fonts.load('500 40px "Geist Mono"');
  } catch {
    /* a browser without the CSS Font Loading API still gets the @font-face */
  }
};

register();
