#!/usr/bin/env python3
"""
Erzeugt das BR-DMS-Logo: Schriftzug „BR-DMS“ mit rotem Punkt und rotem Unterstrich.
Die Buchstaben werden aus Noto Sans ExtraBold in Pfade umgewandelt – das SVG sieht
dadurch überall gleich aus, unabhängig von installierten Schriften.

Aufruf: python3 branding/logo.py
Ergebnis:
  branding/logo.svg        dunkle Schrift, für helle Hintergründe (Website, Flyer)
  branding/logo-hell.svg   weiße Schrift, für dunkle Hintergründe (Deckblatt Handbuch)
  frontend/src/components/BrDmsLogo.tsx   React-Komponente für die App (Schrift in currentColor)
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HIER = os.path.dirname(os.path.abspath(__file__))
SCHRIFT = "/usr/share/fonts/truetype/noto/NotoSans-ExtraBold.ttf"
ROT, TINTE, WEISS = "#c5112a", "#12151c", "#ffffff"

font = TTFont(SCHRIFT)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
em = font["head"].unitsPerEm


def zeichen(text, x0):
    """Pfade der Zeichen ab x0 (Grundlinie y=0, y wächst nach unten); liefert (pfade, x_ende, grenzen)."""
    pfade, x = [], x0
    bp = BoundsPen(glyphs)
    for z in text:
        name = cmap[ord(z)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        glyphs[name].draw(TransformPen(bp, (1, 0, 0, -1, x, 0)))
        pfade.append(pen.getCommands())
        x += glyphs[name].width - (40 if z == "." else 0)  # Punkt etwas näher an das S
    return pfade, x, bp.bounds


# Schriftzug und Punkt
wort, x_ende, (x_min, y_min, x_max, y_max) = zeichen("BR-DMS", 0)
punkt, x_punkt_ende, punkt_grenzen = zeichen(".", x_ende - 25)

# Unterstrich wie im Flyer: rund, rot, linksbündig unter dem B
# (Breite und Abstand im Verhältnis zur Schriftgröße – im Flyer 14 mm bei 13 mm Schrift)
balken_b, balken_h = round(em * 1.08), round(em * 0.123)
balken_y = round(em * 0.36)          # Abstand Grundlinie → Oberkante Unterstrich
links = x_min
rand = round(em * 0.02)

breite = round(punkt_grenzen[2] - links + 2 * rand)
oben = y_min - rand
hoehe = round(balken_y + balken_h - oben + rand)


def svg(schriftfarbe):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{round(links - rand)} {round(oben)} {breite} {hoehe}" role="img" aria-label="BR-DMS">
  <title>BR-DMS</title>
  <path fill="{schriftfarbe}" d="{' '.join(wort)}"/>
  <path fill="{ROT}" d="{' '.join(punkt)}"/>
  <rect fill="{ROT}" x="{round(links)}" y="{balken_y}" width="{balken_b}" height="{balken_h}" rx="{balken_h / 2}"/>
</svg>
"""


for datei, farbe in [("logo.svg", TINTE), ("logo-hell.svg", WEISS)]:
    with open(os.path.join(HIER, datei), "w") as f:
        f.write(svg(farbe))
    print("geschrieben:", os.path.join(HIER, datei))

# React-Komponente: Schriftzug in der Textfarbe der Umgebung (passt zu jedem Farbschema der Seitenleiste)
tsx = f"""// AUTOMATISCH ERZEUGT von branding/logo.py – nicht von Hand bearbeiten.
// BR-DMS-Logo: Schriftzug in currentColor, Punkt und Unterstrich in Rot.

export default function BrDmsLogo({{ height = 32, className = "" }}: {{ height?: number; className?: string }}) {{
  return (
    <svg viewBox="{round(links - rand)} {round(oben)} {breite} {hoehe}" height={{height}} className={{className}}
         role="img" aria-label="BR-DMS" style={{{{ display: "block", width: "auto" }}}}>
      <path fill="currentColor" d="{' '.join(wort)}" />
      <path fill="{ROT}" d="{' '.join(punkt)}" />
      <rect fill="{ROT}" x="{round(links)}" y="{balken_y}" width="{balken_b}" height="{balken_h}" rx="{balken_h / 2}" />
    </svg>
  );
}}
"""
ziel = os.path.join(HIER, "..", "frontend", "src", "components", "BrDmsLogo.tsx")
with open(ziel, "w") as f:
    f.write(tsx)
print("geschrieben:", os.path.normpath(ziel))
