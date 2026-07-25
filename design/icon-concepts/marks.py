"""Three structurally distinct M constructions for Machina AI.

The existing mark is a monoline polyline: vertical stems, round caps, a V that
stops at 58% depth. That is an icon-set glyph, not a drawn letterform. Each
design below is built on a different principle rather than a different styling
of the same skeleton:

  APEX    a real typographic M — filled outline, apexes cut flat at the cap
          line, diagonals carried to a sharp full-depth vertex on the baseline.
  THREAD  one continuous monoline ribbon whose middle is a hanging curve
          instead of a folded V; every join and terminal is round.
  INLAY   heavy machined mass carrying an engraved channel along its spine,
          the channel inverting the mass's value in whichever palette it wears.
"""
import math

CANVAS = 1024


# ------------------------------------------------------------------ geometry
def _unit(dx, dy):
    L = math.hypot(dx, dy)
    return dx / L, dy / L


def _line(p, d):
    return (p, d)


def _inter(l1, l2):
    """Intersection of two infinite lines given as (point, direction)."""
    (x1, y1), (dx1, dy1) = l1
    (x2, y2), (dx2, dy2) = l2
    den = dx1 * dy2 - dy1 * dx2
    if abs(den) < 1e-9:
        raise ValueError("parallel")
    t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / den
    return (x1 + t * dx1, y1 + t * dy1)


def _offset(p, q, hw, sign):
    """The edge line of a stroke of half-width hw laid along p->q.

    sign=+1 takes the 'upper' side: for both of an M's diagonals the normal
    (dy, -dx) points away from the baseline, so one sign serves both.
    """
    dx, dy = q[0] - p[0], q[1] - p[1]
    ux, uy = _unit(dx, dy)
    nx, ny = uy, -ux
    return _line((p[0] + sign * hw * nx, p[1] + sign * hw * ny), (ux, uy))


def m_outline(a, b, c, capY, baseY, w, vY, v_cut=None):
    """Outline of a classical M as a single closed contour (an M has no holes).

    a/b are the stem centre lines, c the vertex centre line, w the stroke
    weight. vY is where the diagonal centre lines cross; the drawn tip sits
    below it by the miter extension. v_cut truncates that tip flat.
    """
    hw = w / 2.0
    vert = (0.0, 1.0)
    L_right = _line((a + hw, 0), vert)
    R_left = _line((b - hw, 0), vert)
    cap = _line((0, capY), (1.0, 0.0))

    ldU = _offset((a, capY), (c, vY), hw, +1)
    ldL = _offset((a, capY), (c, vY), hw, -1)
    rdU = _offset((c, vY), (b, capY), hw, +1)
    rdL = _offset((c, vY), (b, capY), hw, -1)

    pts = [(a - hw, baseY), (a - hw, capY),
           _inter(cap, ldU), _inter(ldU, rdU), _inter(rdU, cap),
           (b + hw, capY), (b + hw, baseY), (b - hw, baseY),
           _inter(R_left, rdL)]

    if v_cut is None:
        pts.append(_inter(rdL, ldL))
    else:
        cut = _line((0, v_cut), (1.0, 0.0))
        pts += [_inter(rdL, cut), _inter(ldL, cut)]

    pts += [_inter(ldL, L_right), (a + hw, baseY)]
    return pts


def _tip_y(a, b, c, capY, baseY, w, vY):
    hw = w / 2.0
    return _inter(_offset((c, vY), (b, capY), hw, -1),
                  _offset((a, capY), (c, vY), hw, -1))[1]


def solve_vY(a, b, c, capY, baseY, w, target_tip):
    """Pick the centre-line vertex so the *drawn* tip lands on target_tip."""
    lo, hi = capY + 10.0, target_tip
    for _ in range(80):
        mid = (lo + hi) / 2.0
        if _tip_y(a, b, c, capY, baseY, w, mid) < target_tip:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def _path(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"


def _bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _centre(pts, cx=512.0, cy=504.0):
    """Centre the contour optically — 8px above true centre, since every one of
    these marks carries more mass low (the V) than high."""
    x0, y0, x1, y1 = _bbox(pts)
    dx, dy = cx - (x0 + x1) / 2.0, cy - (y0 + y1) / 2.0
    return [(x + dx, y + dy) for x, y in pts], (dx, dy)


# -------------------------------------------------------------------- APEX
def apex():
    a, b, c = 326.0, 698.0, 512.0
    capY, baseY, w = 300.0, 722.0, 62.0
    vY = solve_vY(a, b, c, capY, baseY, w, baseY)      # full-depth vertex
    pts, _ = _centre(m_outline(a, b, c, capY, baseY, w, vY))
    return {
        "key": "apex", "label": "A · APEX", "kind": "fill",
        "d": _path(pts),
        # No core dot: the pointed vertex IS the detail, and a dot inside that
        # narrow V reads as a defect rather than a focal point.
        "core": None, "light": (512.0, 500.0),
        "note": "typographic outline · flat apexes",
    }


# ------------------------------------------------------------------ THREAD
def thread():
    a, b = 320.0, 704.0
    capY, baseY = 300.0, 704.0
    dip = 628.0                       # deeper sag, so it reads M and not U
    k = (b - a) * 0.19                # tighter controls => steeper shoulders
    m = (dip - capY) / 0.75           # cubic midpoint sits at 0.75 of the control rise
    d = (f"M{a} {baseY} L{a} {capY} "
         f"C{a + k:.1f} {capY + m:.1f} {b - k:.1f} {capY + m:.1f} {b} {capY} "
         f"L{b} {baseY}")
    return {
        "key": "thread", "label": "B · THREAD", "kind": "stroke",
        "d": d, "w": 58, "cap": "round", "join": "round",
        "core": (512.0, dip), "core_r": 14, "light": (512.0, 545.0),
        "note": "continuous ribbon · hanging curve",
    }


# ------------------------------------------------------------------- INLAY
def inlay():
    """Heavy mass carrying an engraved channel along its spine.

    The channel is a value INVERSION of the mass in both palettes, never a
    mid-tone: that keeps contrast high, and when the channel falls below a
    pixel at notification size the mark degrades to a clean solid M rather
    than to mush.
    """
    a, b, c = 330.0, 694.0, 512.0
    capY, baseY, w = 306.0, 716.0, 96.0
    vY = solve_vY(a, b, c, capY, baseY, w, baseY)
    pts, (dx, dy) = _centre(m_outline(a, b, c, capY, baseY, w, vY))

    inset = 44.0                       # the channel stops short of the terminals
    sk = [(a, baseY - inset), (a, capY), (c, vY), (b, capY), (b, baseY - inset)]
    sk = [(x + dx, y + dy) for x, y in sk]
    return {
        "key": "inlay", "label": "C · INLAY", "kind": "seam",
        "d": _path(pts),
        "seam_d": "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in sk),
        "seam_w": 28,
        "core": None, "light": (512.0, 500.0),
        "note": "heavy mass · engraved channel",
    }


# ----------------------------------------------------------------- CURRENT
def current():
    return {
        "key": "current", "label": "CURRENT", "kind": "stroke",
        "d": "M296 694 L296 306 L512 528 L728 306 L728 694",
        "w": 56, "cap": "round", "join": "round",
        "core": (512.0, 528.0), "core_r": 14,
        "note": "monoline · round caps · V stops at 58%",
    }


DESIGNS = [current(), apex(), thread(), inlay()]


def emit(mk, paint, extra="", widen=0.0):
    """Render one mark painted with `paint` (a fill for outlines, a stroke for
    monolines) so every kind drops into the same treatment pipeline."""
    if mk["kind"] in ("fill", "seam"):
        return f'<path d="{mk["d"]}" fill="{paint}" {extra}/>'
    return (f'<path d="{mk["d"]}" fill="none" stroke="{paint}" '
            f'stroke-width="{mk["w"] + widen}" stroke-linecap="{mk["cap"]}" '
            f'stroke-linejoin="{mk["join"]}" {extra}/>')


def emit_seam(mk, paint, extra="", widen=0.0):
    """The inlaid channel of light — only SEAM-kind marks carry one."""
    return (f'<path d="{mk["seam_d"]}" fill="none" stroke="{paint}" '
            f'stroke-width="{mk["seam_w"] + widen}" stroke-linecap="round" '
            f'stroke-linejoin="round" {extra}/>')
