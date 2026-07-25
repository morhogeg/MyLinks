"""Generate Machina AI app-icon concepts as 1024x1024 SVGs."""
import math, os

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- geometry
# Shared M skeleton. Lifted 12px above true centre so the core's bloom — which
# adds visual mass low — settles the mark on the optical centre.
SW = 56
AP, FT = 306, 694
LX, RX = 296, 728
VX, VY = 512, 528
M_PATH = f"M{LX} {FT} L{LX} {AP} L{VX} {VY} L{RX} {AP} L{RX} {FT}"


# ================================================================ CONCEPT 1
# "LUMEN" — the current mark rebuilt achromatic. Light originates AT the core
# and travels outward, so the two stems carry identical value (the current
# icon's top-left→bottom-right gradient makes them mismatch).
CONCEPT_1 = f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
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
    <radialGradient id="aura" gradientUnits="userSpaceOnUse" cx="{VX}" cy="{VY}" r="380">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="42%"  stop-color="#CBD2E2" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#CBD2E2" stop-opacity="0"/>
    </radialGradient>
    <!-- High floor on the falloff: the tips must still read as LIGHT, not as
         a letterform fading into the tile. -->
    <radialGradient id="lumen" gradientUnits="userSpaceOnUse" cx="{VX}" cy="{VY}" r="340">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="24%"  stop-color="#FBFCFE"/>
      <stop offset="60%"  stop-color="#E6EAF2"/>
      <stop offset="100%" stop-color="#C4CBDA"/>
    </radialGradient>
    <radialGradient id="coreBloom" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="30%"  stop-color="#FFFFFF" stop-opacity="0.88"/>
      <stop offset="64%"  stop-color="#DFE4EF" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#CBD2E2" stop-opacity="0"/>
    </radialGradient>
    <!-- two-stage bloom: a tight crisp halo plus a wide soft one -->
    <filter id="haloWide" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="34"/>
    </filter>
    <filter id="haloTight" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <filter id="coreglow" x="-220%" y="-220%" width="540%" height="540%">
      <feGaussianBlur stdDeviation="11" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#vign)"/>
  <circle cx="{VX}" cy="{VY}" r="380" fill="url(#aura)"/>

  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="{M_PATH}" stroke="#E8ECF5" stroke-width="{SW + 16}"
          filter="url(#haloWide)" opacity="0.30"/>
    <path d="{M_PATH}" stroke="#F2F5FA" stroke-width="{SW + 4}"
          filter="url(#haloTight)" opacity="0.42"/>
    <path d="{M_PATH}" stroke="url(#lumen)" stroke-width="{SW}"/>
  </g>

  <g filter="url(#coreglow)">
    <circle cx="{VX}" cy="{VY}" r="56" fill="url(#coreBloom)"/>
    <circle cx="{VX}" cy="{VY}" r="15" fill="#FFFFFF"/>
  </g>
</svg>
"""


# ================================================================ CONCEPT 2
# "THRESHOLD" — the M is not drawn, it is CUT. A machined graphite plate with
# an M-shaped slot; warm light behind it spills onto the surface. The cut reads
# because you can see the plate's THICKNESS on the far wall.
CONCEPT_2 = f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="plate" x1="6%" y1="0%" x2="24%" y2="100%">
      <stop offset="0%"   stop-color="#232329"/>
      <stop offset="50%"  stop-color="#16161B"/>
      <stop offset="100%" stop-color="#0A0A0D"/>
    </linearGradient>
    <filter id="grain" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer>
    </filter>
    <linearGradient id="light" gradientUnits="userSpaceOnUse"
                    x1="0" y1="{AP - SW}" x2="0" y2="{FT + SW}">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="30%"  stop-color="#FFF7EA"/>
      <stop offset="70%"  stop-color="#FBE7C4"/>
      <stop offset="100%" stop-color="#EDCB98"/>
    </linearGradient>
    <radialGradient id="spillPool" gradientUnits="userSpaceOnUse" cx="{VX}" cy="{VY}" r="440">
      <stop offset="0%"   stop-color="#FFE3B8" stop-opacity="0.17"/>
      <stop offset="50%"  stop-color="#FFD79E" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#FFD79E" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vign2" cx="50%" cy="44%" r="72%">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
      <stop offset="62%"  stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.66"/>
    </radialGradient>
    <filter id="spillFar" x="-45%" y="-45%" width="190%" height="190%">
      <feGaussianBlur stdDeviation="38"/>
    </filter>
    <filter id="spillNear" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
    <filter id="wallBlur" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="2.2"/>
    </filter>
    <mask id="cut">
      <rect width="1024" height="1024" fill="#000000"/>
      <path d="{M_PATH}" fill="none" stroke="#FFFFFF" stroke-width="{SW}"
            stroke-linecap="round" stroke-linejoin="round"/>
    </mask>
  </defs>

  <rect width="1024" height="1024" fill="url(#plate)"/>
  <rect width="1024" height="1024" filter="url(#grain)" fill="#FFFFFF" opacity="0.5"/>
  <rect width="1024" height="1024" fill="url(#spillPool)"/>

  <!-- light spilling out of the slot and onto the plate -->
  <g filter="url(#spillFar)" opacity="0.50">
    <path d="{M_PATH}" fill="none" stroke="#FFD9A0" stroke-width="{SW + 30}"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g filter="url(#spillNear)" opacity="0.60">
    <path d="{M_PATH}" fill="none" stroke="#FFEFD4" stroke-width="{SW + 3}"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <g mask="url(#cut)">
    <rect width="1024" height="1024" fill="url(#light)"/>
    <!-- the far wall of the cut: the plate has thickness, and you see it -->
    <g filter="url(#wallBlur)" opacity="0.48">
      <path d="{M_PATH}" transform="translate(9,11)" fill="none" stroke="#1A1206"
            stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <!-- and the sliver of raw light surviving past it -->
    <g filter="url(#wallBlur)" opacity="0.55">
      <path d="{M_PATH}" transform="translate(-3,-3)" fill="none" stroke="#FFFDF7"
            stroke-width="{SW - 34}" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>

  <rect width="1024" height="1024" fill="url(#vign2)"/>
</svg>
"""


# =============================================================== CONCEPT 3a
# "CONVERGENCE" — no letter. Captured fragments drawn down into one white-hot
# point: the Recall Engine, literally. Built from MASS, not threads, so it
# survives 38px.
def concept_3a():
    cx, cy = 512.0, 610.0
    specs = [(-158, 292, 26, 0.40), (-124, 316, 34, 0.66), (-90, 330, 40, 1.00),
             (-56, 316, 34, 0.66), (-22, 292, 26, 0.40)]
    arms, nodes = [], []
    for ang, L, w, br in specs:
        a = math.radians(ang)
        nx, ny = cx + L * math.cos(a), cy + L * math.sin(a)
        arms.append(
            f'<path d="M{nx:.1f} {ny:.1f} L{cx:.1f} {cy:.1f}" stroke="url(#arm)" '
            f'stroke-width="{w}" stroke-linecap="round" opacity="{br:.2f}"/>'
        )
        nodes.append(
            f'<circle cx="{nx:.1f}" cy="{ny:.1f}" r="{w * 0.72:.1f}" '
            f'fill="url(#node)" opacity="{min(1.0, br + 0.22):.2f}"/>'
        )
    return f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg3" cx="50%" cy="30%" r="86%">
      <stop offset="0%"   stop-color="#2E1758"/>
      <stop offset="44%"  stop-color="#170B31"/>
      <stop offset="100%" stop-color="#07040F"/>
    </radialGradient>
    <radialGradient id="vign3" cx="50%" cy="50%" r="72%">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
      <stop offset="66%"  stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.60"/>
    </radialGradient>
    <radialGradient id="aura3" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{cy}" r="360">
      <stop offset="0%"   stop-color="#EFA4FF" stop-opacity="0.42"/>
      <stop offset="46%"  stop-color="#8B4CF6" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#8B4CF6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="arm" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{cy}" r="340">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="42%"  stop-color="#EFDCFF"/>
      <stop offset="100%" stop-color="#A971F5"/>
    </radialGradient>
    <radialGradient id="node" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="52%"  stop-color="#F0DEFF"/>
      <stop offset="100%" stop-color="#B888FF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="core3" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="30%"  stop-color="#FFFFFF" stop-opacity="0.92"/>
      <stop offset="64%"  stop-color="#E7B6FF" stop-opacity="0.36"/>
      <stop offset="100%" stop-color="#C77DFF" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft3" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
    <filter id="coreglow3" x="-220%" y="-220%" width="540%" height="540%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="1024" height="1024" fill="url(#bg3)"/>
  <rect width="1024" height="1024" fill="url(#vign3)"/>
  <circle cx="{cx}" cy="{cy}" r="360" fill="url(#aura3)"/>

  <g fill="none" filter="url(#soft3)" opacity="0.5">
    {chr(10).join('    ' + a for a in arms)}
  </g>
  <g fill="none">
    {chr(10).join('    ' + a for a in arms)}
  </g>
  <g>
    {chr(10).join('    ' + n for n in nodes)}
  </g>

  <g filter="url(#coreglow3)">
    <circle cx="{cx}" cy="{cy}" r="66" fill="url(#core3)"/>
    <circle cx="{cx}" cy="{cy}" r="19" fill="#FFFFFF"/>
  </g>
</svg>
"""


# =============================================================== CONCEPT 3b
# "MONOLITH" — same letter, opposite register. A porcelain plate with the M
# cut into it as deep graphite. No glow anywhere. Two payoffs: the contrast is
# the highest of any concept (so it is the most legible at 29pt), and on a home
# screen of uniformly dark AI apps it is the only pale tile on the page.
CONCEPT_3B = f"""<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
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
    <!-- the cut: neutral graphite, never olive. Darkest at the top wall where
         the light cannot reach, opening up slightly toward the bottom. -->
    <linearGradient id="groove" gradientUnits="userSpaceOnUse"
                    x1="0" y1="{AP - SW / 2}" x2="0" y2="{FT + SW / 2}">
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
      <feGaussianBlur stdDeviation="10"/>
    </filter>
    <filter id="wall2" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3.5"/>
    </filter>
    <mask id="groovemask">
      <rect width="1024" height="1024" fill="#000000"/>
      <path d="{M_PATH}" fill="none" stroke="#FFFFFF" stroke-width="{SW}"
            stroke-linecap="round" stroke-linejoin="round"/>
    </mask>
  </defs>

  <rect width="1024" height="1024" fill="url(#stone)"/>
  <rect width="1024" height="1024" fill="url(#lift)"/>
  <rect width="1024" height="1024" filter="url(#grain2)" fill="#8B877C" opacity="0.30"/>

  <!-- the lower lip of the cut, raised into the light -->
  <g filter="url(#wall2)" opacity="0.75">
    <path d="{M_PATH}" transform="translate(0,9)" fill="none" stroke="#FFFFFF"
          stroke-width="{SW - 9}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <!-- ambient occlusion hugging the opening -->
  <g filter="url(#ao)" opacity="0.13">
    <path d="{M_PATH}" transform="translate(0,4)" fill="none" stroke="#5C5849"
          stroke-width="{SW + 20}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <g mask="url(#groovemask)">
    <rect width="1024" height="1024" fill="url(#groove)"/>
    <g filter="url(#wall2)" opacity="0.8">
      <path d="{M_PATH}" transform="translate(0,-9)" fill="none" stroke="#131318"
            stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>

  <!-- the core, kept as a struck point of light so the family stays a family -->
  <circle cx="{VX}" cy="{VY}" r="13" fill="#F7F5EF"/>
  <circle cx="{VX}" cy="{VY}" r="13" fill="none" stroke="#1B1B20" stroke-width="1.5" opacity="0.35"/>

  <rect width="1024" height="1024" fill="url(#vign4)"/>
</svg>
"""


for name, svg in [("concept1_lumen", CONCEPT_1),
                  ("concept2_threshold", CONCEPT_2),
                  ("concept3_convergence", concept_3a()),
                  ("concept3b_monolith", CONCEPT_3B)]:
    with open(os.path.join(OUT, name + ".svg"), "w") as f:
        f.write(svg)
    print("wrote", name + ".svg")
