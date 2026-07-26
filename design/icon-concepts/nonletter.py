"""Three non-letter marks for Machina AI.

Each comes from a different part of what the product actually claims to be, and
each avoids the AI cliché set (four-point sparkle, orb, brain, node graph,
spiral, chat bubble). All three are built from mass rather than thin detail, so
they survive 29pt — the failure mode that killed the earlier convergence study.

  APERTURE  a machined iris closing on a point of light.
            'Machina' is a mechanism, and an iris is the simplest honest one:
            many blades, one opening. Says FOCUS — §1's word.
  CAIRN     stacked stones. A cairn is memory built one piece at a time by the
            person walking the path, and it marks the way back for them.
            Says ARCHIVE, PERMANENCE, TRUST.
  CITATION  brackets enclosing a struck point. The product's actual
            differentiator is not 'AI answers', it is CITED answers, and
            brackets are the universal mark of a reference.
"""
import math

CX, CY = 512.0, 500.0


def _poly(pts, close=True):
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    return d + " Z" if close else d


def _p(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


# ---------------------------------------------------------------- APERTURE
def aperture():
    n, R, r, twist, gap = 6, 292.0, 104.0, 21.0, 5.0
    step = 360.0 / n
    blades = []
    for i in range(n):
        a0, a1 = i * step + gap / 2, (i + 1) * step - gap / 2
        i0, i1 = _p(CX, CY, r, a0), _p(CX, CY, r, a1)
        o0, o1 = _p(CX, CY, R, a0 + twist), _p(CX, CY, R, a1 + twist)
        blades.append(
            f"M{i0[0]:.1f} {i0[1]:.1f} L{o0[0]:.1f} {o0[1]:.1f} "
            f"A{R} {R} 0 0 1 {o1[0]:.1f} {o1[1]:.1f} "
            f"L{i1[0]:.1f} {i1[1]:.1f} Z"
        )
    return {
        "key": "aperture", "label": "1 · APERTURE", "kind": "multi",
        "paths": blades,
        # the opening reads as light on porcelain by itself; on graphite it
        # needs a struck core, which is exactly what the treatment supplies
        "core": (CX, CY), "core_r": 30, "light": (CX, CY),
        "note": "machined iris · many blades, one opening",
    }


# ------------------------------------------------------------------- CAIRN
def cairn():
    # w, h, corner, rotation — deliberately unequal, so it reads as balanced
    # stones and not as a stack of UI bars
    stones = [(376.0, 120.0, 60.0, -3.0), (266.0, 112.0, 56.0, 4.5),
              (158.0, 132.0, 66.0, -2.5)]
    ys, gap = [], 26.0
    total = sum(s[1] for s in stones) + gap * (len(stones) - 1)
    y = CY - total / 2.0
    for _, h, _, _ in stones:
        ys.append(y + h / 2.0)
        y += h + gap
    ys.reverse()                       # widest stone on the bottom

    paths = []
    for (w, h, rc, rot), cy in zip(stones, ys):
        x0, y0 = CX - w / 2.0, cy - h / 2.0
        a = math.radians(rot)
        ca, sa = math.cos(a), math.sin(a)

        def T(px, py):
            dx, dy = px - CX, py - cy
            return CX + dx * ca - dy * sa, cy + dx * sa + dy * ca

        # a stadium-ish rounded rect, rotated about its own centre
        pts = [(x0 + rc, y0), (x0 + w - rc, y0), (x0 + w, y0 + rc),
               (x0 + w, y0 + h - rc), (x0 + w - rc, y0 + h), (x0 + rc, y0 + h),
               (x0, y0 + h - rc), (x0, y0 + rc)]
        q = [T(*p) for p in pts]
        paths.append(
            f"M{q[0][0]:.1f} {q[0][1]:.1f} L{q[1][0]:.1f} {q[1][1]:.1f} "
            f"Q{T(x0 + w, y0)[0]:.1f} {T(x0 + w, y0)[1]:.1f} {q[2][0]:.1f} {q[2][1]:.1f} "
            f"L{q[3][0]:.1f} {q[3][1]:.1f} "
            f"Q{T(x0 + w, y0 + h)[0]:.1f} {T(x0 + w, y0 + h)[1]:.1f} {q[4][0]:.1f} {q[4][1]:.1f} "
            f"L{q[5][0]:.1f} {q[5][1]:.1f} "
            f"Q{T(x0, y0 + h)[0]:.1f} {T(x0, y0 + h)[1]:.1f} {q[6][0]:.1f} {q[6][1]:.1f} "
            f"L{q[7][0]:.1f} {q[7][1]:.1f} "
            f"Q{T(x0, y0)[0]:.1f} {T(x0, y0)[1]:.1f} {q[0][0]:.1f} {q[0][1]:.1f} Z"
        )
    return {
        "key": "cairn", "label": "2 · CAIRN", "kind": "multi",
        "paths": paths, "core": None, "light": (CX, CY - 40),
        "note": "stacked stones · an archive built one piece at a time",
    }


# ---------------------------------------------------------------- CITATION
def citation():
    top, bot, w, arm = 300.0, 700.0, 58.0, 100.0
    lx, rx = 296.0, 728.0
    left = _poly([(lx, top), (lx + arm, top), (lx + arm, top + w),
                  (lx + w, top + w), (lx + w, bot - w), (lx + arm, bot - w),
                  (lx + arm, bot), (lx, bot)])
    right = _poly([(rx, top), (rx - arm, top), (rx - arm, top + w),
                   (rx - w, top + w), (rx - w, bot - w), (rx - arm, bot - w),
                   (rx - arm, bot), (rx, bot)])
    r = 52.0
    dot = (f"M{CX - r} {CY} A{r} {r} 0 1 0 {CX + r} {CY} "
           f"A{r} {r} 0 1 0 {CX - r} {CY} Z")
    return {
        "key": "citation", "label": "3 · CITATION", "kind": "multi",
        "paths": [left, right, dot], "core": None, "light": (CX, CY),
        "note": "brackets enclosing a struck point · a cited answer",
    }


DESIGNS = [aperture(), cairn(), citation()]
