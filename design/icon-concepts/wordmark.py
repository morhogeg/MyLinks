"""MACHINA AI drawn in the Apex language.

Same construction rules as the M: one stroke weight, terminals cut flat at the
cap line and baseline, apexes truncated rather than pointed, everything derived
from straight edges except C's arcs. Glyphs are emitted as filled subpaths and
allowed to overlap — nonzero fill unions them, which keeps each letter's parts
independently checkable instead of hand-merged into one contour.
"""
import math, os, re

from marks import m_outline, solve_vY

CAP, W = 422.0, 62.0          # cap height and stroke weight, matching Apex
TRACK, SPACE = 44.0, 124.0    # letterspacing and word space


def _rect(x, y, w, h):
    return (f"M{x:.1f} {y:.1f} L{x + w:.1f} {y:.1f} "
            f"L{x + w:.1f} {y + h:.1f} L{x:.1f} {y + h:.1f} Z")


def _poly(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"


def _diag_thickness(run):
    """Horizontal cut needed for a diagonal to carry weight W perpendicular."""
    return W * math.hypot(CAP, run) / CAP


# ─────────────────────────────────────────────────────────────────── glyphs
def g_I():
    return [_rect(0, 0, W, CAP)], W


def g_H(width=300.0):
    return [_rect(0, 0, W, CAP), _rect(width - W, 0, W, CAP),
            _rect(W, (CAP - W) / 2, width - 2 * W, W)], width


def g_N(width=318.0):
    t = _diag_thickness(width - W)
    return [_rect(0, 0, W, CAP), _rect(width - W, 0, W, CAP),
            _poly([(0, 0), (t, 0), (width, CAP), (width - t, CAP)])], width


def g_M(width=388.0):
    a, b = W / 2, width - W / 2
    c = width / 2
    vY = solve_vY(a, b, c, 0.0, CAP, W, CAP)
    return [_poly(m_outline(a, b, c, 0.0, CAP, W, vY))], width


def g_A(width=344.0):
    """Legs meeting in a flat-cut apex — the M's truncated apex, mirrored."""
    t = _diag_thickness(width / 2)
    cx = width / 2
    # BOTH legs must wind the same way. They overlap across the whole flat
    # apex, and under the default nonzero fill rule opposite windings cancel
    # there — which punches a hole clean through the top of every A.
    left = [(cx - t / 2, 0), (cx + t / 2, 0), (t, CAP), (0, CAP)]
    right = [(cx - t / 2, 0), (cx + t / 2, 0), (width, CAP), (width - t, CAP)]

    def x_in(y):
        """Inner edge of the left leg at height y — the legs splay downward, so
        this moves outward as y grows."""
        return t + (cx + t / 2 - t) * (1 - y / CAP)

    # A rectangular bar can't meet a splayed leg: it overlaps at its top edge
    # and leaves a notch at its bottom. The bar is a trapezoid tracking the
    # legs, so it fills the gap exactly at every height.
    # Overlap the legs by a few units rather than abutting them: a shared edge
    # between two subpaths antialiases into a visible hairline seam.
    y0, lap = CAP * 0.60, 6.0
    y1 = y0 + W
    bar = [(x_in(y0) - lap, y0), (width - x_in(y0) + lap, y0),
           (width - x_in(y1) + lap, y1), (x_in(y1) - lap, y1)]
    return [_poly(left), _poly(right), _poly(bar)], width


def g_C(width=372.0):
    """Radial terminals: the geometric cut, and the only curve in the set."""
    r_out = width / 2
    r_in = r_out - W
    cx, cy = width / 2, CAP / 2
    ry_out, ry_in = CAP / 2, CAP / 2 - W
    a0, a1 = math.radians(56), math.radians(304)

    def p(rx, ry, a):
        return cx + rx * math.cos(a), cy + ry * math.sin(a)

    o0, o1 = p(r_out, ry_out, a0), p(r_out, ry_out, a1)
    i1, i0 = p(r_in, ry_in, a1), p(r_in, ry_in, a0)
    # C's advance must not bound its full circle: the aperture means there is
    # no ink on the right at mid-height, and its terminals stop ~80 units short
    # of `width`. Charging the full circle opens a word-break-sized hole before
    # H, which is what made MACHINA read as MAC HINA.
    advance = max(px for px, _ in (p(r_out, ry_out, a) for a in (a0, a1))) + W / 2
    return [f"M{o0[0]:.1f} {o0[1]:.1f} "
            f"A{r_out:.1f} {ry_out:.1f} 0 1 1 {o1[0]:.1f} {o1[1]:.1f} "
            f"L{i1[0]:.1f} {i1[1]:.1f} "
            f"A{r_in:.1f} {ry_in:.1f} 0 1 0 {i0[0]:.1f} {i0[1]:.1f} Z"], advance


GLYPHS = {"M": g_M, "A": g_A, "C": g_C, "H": g_H, "I": g_I, "N": g_N}


# Optical corrections. Metric spacing alone leaves a hole after the round C and
# under A's splayed leg, because both letters' advances bound geometry that
# isn't there at the height where the eye reads the gap.
KERN = {("M", "A"): -12, ("A", "C"): -8, ("C", "H"): 0,
        ("N", "A"): -12, ("A", "I"): -20}


def wordmark(text="MACHINA AI"):
    """Lay the string out and return (subpaths, total width)."""
    out, x, prev = [], 0.0, None
    for i, ch in enumerate(text):
        if ch == " ":
            x += SPACE
            prev = None
            continue
        if prev:
            x += KERN.get((prev, ch), 0)
        subs, w = GLYPHS[ch]()
        for d in subs:
            out.append(_translate(d, x))
        x += w + (TRACK if i < len(text) - 1 else 0)
        prev = ch
    return out, x


_TOK = re.compile(r"[MLAZ]|-?\d+(?:\.\d+)?")


def _translate(d, dx):
    """Shift a subpath in x. Tokenised rather than split on whitespace, since
    the emitters write 'M0.0 0.0' with no separator. Only the x of M/L and the
    ENDPOINT x of A may move — an arc's radii and flags must not be touched."""
    toks, out, i = _TOK.findall(d), [], 0
    while i < len(toks):
        cmd = toks[i]
        if cmd in ("M", "L"):
            out += [cmd, f"{float(toks[i+1]) + dx:.1f}", toks[i+2]]
            i += 3
        elif cmd == "A":
            out += [cmd, *toks[i+1:i+6], f"{float(toks[i+6]) + dx:.1f}", toks[i+7]]
            i += 8
        elif cmd == "Z":
            out.append(cmd)
            i += 1
        else:
            raise ValueError(f"unexpected command {cmd!r}")
    return " ".join(out)


if __name__ == "__main__":
    subs, total = wordmark()
    pad = 40
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" '
           f'viewBox="{-pad} {-pad} {total + 2*pad} {CAP + 2*pad}" '
           f'width="{total + 2*pad:.0f}" height="{CAP + 2*pad:.0f}">'
           f'<rect x="{-pad}" y="{-pad}" width="{total + 2*pad}" '
           f'height="{CAP + 2*pad}" fill="#0C0C11"/>'
           + "".join(f'<path d="{d}" fill="#FFFFFF"/>' for d in subs) + "</svg>")
    here = os.path.dirname(os.path.abspath(__file__))
    open(os.path.join(here, "wordmark.svg"), "w").write(svg)
    open(os.path.join(here, "wordmark_paths.txt"), "w").write("\n".join(subs))
    print(f"width {total:.0f}  cap {CAP:.0f}  subpaths {len(subs)}")
