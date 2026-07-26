"""Dress any mark from marks.py in the two palettes the owner picked:
LUMEN (achromatic light on graphite) and MONOLITH (graphite on porcelain).

SEAM-kind marks invert the logic: the letter is a solid mass and the LIGHT is
the channel running through it, so they get a mass fill plus a lit seam rather
than a glowing body.
"""
from marks import emit, emit_seam

LUMEN_DEFS = """
    <radialGradient id="bg" cx="50%" cy="36%" r="84%">
      <stop offset="0%"   stop-color="#282833"/>
      <stop offset="42%"  stop-color="#16161D"/>
      <stop offset="100%" stop-color="#07070A"/>
    </radialGradient>
    <radialGradient id="vign" cx="50%" cy="50%" r="70%">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
      <stop offset="66%"  stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.60"/>
    </radialGradient>
    <radialGradient id="coreBloom" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="30%"  stop-color="#FFFFFF" stop-opacity="0.88"/>
      <stop offset="64%"  stop-color="#DFE4EF" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#CBD2E2" stop-opacity="0"/>
    </radialGradient>
    <filter id="haloWide" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="34"/></filter>
    <filter id="haloTight" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="9"/></filter>
    <filter id="coreglow" x="-220%" y="-220%" width="540%" height="540%">
      <feGaussianBlur stdDeviation="11" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
"""


def _light_pt(mk):
    """Where the light is seated. Distinct from the core dot: centring the
    radial on a low vertex leaves the top of the letter visibly dim."""
    return mk.get("light") or mk["core"] or (512.0, 545.0)


def lumen(mk):
    lx, ly = _light_pt(mk)
    core = ""
    if mk["core"]:
        cx, cy = mk["core"]
        core = f"""
  <g filter="url(#coreglow)">
    <circle cx="{cx}" cy="{cy}" r="{mk['core_r'] * 3.7:.0f}" fill="url(#coreBloom)"/>
    <circle cx="{cx}" cy="{cy}" r="{mk['core_r']}" fill="#FFFFFF"/>
  </g>"""

    body = f"""
  {emit(mk, "#E8ECF5", 'filter="url(#haloWide)" opacity="0.30"', widen=16)}
  {emit(mk, "#F2F5FA", 'filter="url(#haloTight)" opacity="0.42"', widen=4)}
  {emit(mk, "url(#lum)")}"""
    if mk["kind"] == "seam":
        # the channel is cut INTO a bright mass, so it reads as engraved and
        # the mark keeps full light-on-dark contrast at small sizes
        body += f"""
  {emit_seam(mk, "#15151C", 'opacity="0.92"')}
  {emit_seam(mk, "#4A4A58", 'transform="translate(0,2)" opacity="0.5"', widen=-7)}"""

    return f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>{LUMEN_DEFS}
    <radialGradient id="lum" gradientUnits="userSpaceOnUse" cx="{lx}" cy="{ly}" r="340">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="24%"  stop-color="#FBFCFE"/>
      <stop offset="60%"  stop-color="#E6EAF2"/>
      <stop offset="100%" stop-color="#C4CBDA"/>
    </radialGradient>
    <radialGradient id="aura" gradientUnits="userSpaceOnUse" cx="{lx}" cy="{ly}" r="380">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="42%"  stop-color="#CBD2E2" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#CBD2E2" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#vign)"/>
  <circle cx="{lx}" cy="{ly}" r="380" fill="url(#aura)"/>
{body}
{core}
</svg>
"""


def monolith(mk):
    if mk["kind"] == "seam":
        # inverted again: here the mass is dark, so the channel is porcelain
        core = f"""
  <g mask="url(#groovemask)">
    {emit_seam(mk, "#F3F1EA")}
    {emit_seam(mk, "#B9B5A9", 'transform="translate(0,3)" opacity="0.55"', widen=-7)}
  </g>"""
    elif mk["core"]:
        cx, cy = mk["core"]
        core = f"""
  <circle cx="{cx}" cy="{cy}" r="{mk['core_r'] - 1}" fill="#F7F5EF"/>
  <circle cx="{cx}" cy="{cy}" r="{mk['core_r'] - 1}" fill="none" stroke="#1B1B20"
          stroke-width="1.5" opacity="0.35"/>"""
    else:
        core = ""

    return f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="stone" x1="10%" y1="0%" x2="28%" y2="100%">
      <stop offset="0%"   stop-color="#FCFBF8"/>
      <stop offset="48%"  stop-color="#F2F0EA"/>
      <stop offset="100%" stop-color="#DFDCD3"/>
    </linearGradient>
    <filter id="grain2" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="3"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
    </filter>
    <linearGradient id="groove" gradientUnits="userSpaceOnUse" x1="0" y1="290" x2="0" y2="740">
      <stop offset="0%"   stop-color="#24242A"/>
      <stop offset="55%"  stop-color="#2E2E36"/>
      <stop offset="100%" stop-color="#43434E"/>
    </linearGradient>
    <radialGradient id="lift" cx="42%" cy="30%" r="78%">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.34"/>
      <stop offset="62%"  stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vign4" cx="50%" cy="44%" r="74%">
      <stop offset="0%"   stop-color="#75705F" stop-opacity="0"/>
      <stop offset="58%"  stop-color="#75705F" stop-opacity="0"/>
      <stop offset="100%" stop-color="#75705F" stop-opacity="0.17"/>
    </radialGradient>
    <filter id="ao" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10"/></filter>
    <filter id="wall2" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3.5"/></filter>
    <mask id="groovemask">
      <rect width="1024" height="1024" fill="#000000"/>
      {emit(mk, "#FFFFFF")}
    </mask>
  </defs>

  <rect width="1024" height="1024" fill="url(#stone)"/>
  <rect width="1024" height="1024" fill="url(#lift)"/>
  <rect width="1024" height="1024" filter="url(#grain2)" fill="#8B877C" opacity="0.30"/>

  <g filter="url(#wall2)" opacity="0.75" transform="translate(0,9)">
    {emit(mk, "#FFFFFF")}
  </g>
  <g filter="url(#ao)" opacity="0.13" transform="translate(0,4)">
    {emit(mk, "#5C5849", "", widen=20)}
  </g>

  <g mask="url(#groovemask)">
    <rect width="1024" height="1024" fill="url(#groove)"/>
    <g filter="url(#wall2)" opacity="0.8" transform="translate(0,-9)">
      {emit(mk, "#131318")}
    </g>
  </g>
{core}
  <rect width="1024" height="1024" fill="url(#vign4)"/>
</svg>
"""


def skeleton(mk):
    """Naked geometry — no lighting, no palette. The letterform on its own."""
    seam = ""
    if mk["kind"] == "seam":
        seam = f"""
  <g mask="url(#sk)">{emit_seam(mk, "#FFFFFF")}</g>"""
    return f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs><mask id="sk"><rect width="1024" height="1024" fill="#000"/>
    {emit(mk, "#FFFFFF")}</mask></defs>
  <rect width="1024" height="1024" fill="#FFFFFF"/>
  {emit(mk, "#101014")}{seam}
</svg>
"""
