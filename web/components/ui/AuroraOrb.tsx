/**
 * Aurora — the hero identity/thinking orb: gooey brand-gradient metaballs that
 * drift and merge (see `.aurora-orb` in globals.css). For focal moments with
 * room + attention — the empty Ask state, launch — NOT inline spinners (that's
 * the WorkingRing's job). Decorative, so `aria-hidden`.
 *
 * The merge look comes from an SVG goo filter (`feGaussianBlur` + `feColorMatrix`
 * alpha threshold) referenced by `.aurora-orb`. It's rendered here so the filter
 * ships with the orb. NOTE: this filter is GPU-heavier and has historically been
 * finicky in WKWebView — device-verify on iOS; without it the orb degrades to
 * three soft blend-blobs, which still reads fine.
 */
export function AuroraOrb({ size = 76, className = '' }: { size?: number; className?: string }) {
    return (
        <span
            aria-hidden
            className={`inline-block ${className}`}
            style={{ width: size, height: size }}
        >
            {/* goo filter — 0-size host, referenced by url(#machina-goo) */}
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
                <filter id="machina-goo">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                    <feColorMatrix
                        in="blur"
                        mode="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
                        result="goo"
                    />
                    <feBlend in="SourceGraphic" in2="goo" />
                </filter>
            </svg>
            <span className="aurora-orb block w-full h-full">
                <span className="blob blob-1" />
                <span className="blob blob-2" />
                <span className="blob blob-3" />
            </span>
        </span>
    );
}

export default AuroraOrb;
