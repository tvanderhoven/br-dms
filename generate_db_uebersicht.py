#!/usr/bin/env python3
"""Generiert eine technische Datenbank-Übersicht als PDF: jede Tabelle mit ihren
tatsächlichen Spalten (Name und Typ, wie sie wirklich in PostgreSQL stehen) –
nicht Prisma-Beziehungsfelder, die keine eigene Spalte sind.

Quelle: backend/prisma/schema.prisma (einzige Wahrheit für das Datenbankschema).
Neu erzeugen, wenn sich das Schema ändert:
  python3 generate_db_uebersicht.py

Benötigt: fpdf2
"""
import json
import os
import re
from datetime import datetime

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace

BASIS   = os.path.dirname(os.path.abspath(__file__))
SCHEMA  = os.path.join(BASIS, "backend", "prisma", "schema.prisma")
OUT     = os.path.join(BASIS, "BR-DMS_Datenbank-Uebersicht.pdf")


def _font_path():
    linux_path = "/usr/share/fonts/truetype/liberation/"
    if os.path.isdir(linux_path):
        return linux_path, {
            "regular": "LiberationSans-Regular.ttf", "bold": "LiberationSans-Bold.ttf",
            "italic": "LiberationSans-Italic.ttf", "mono": "LiberationMono-Regular.ttf",
        }
    win_path = "C:/Windows/Fonts/"
    if os.path.isdir(win_path):
        return win_path, {
            "regular": "arial.ttf", "bold": "arialbd.ttf",
            "italic": "ariali.ttf", "mono": "cour.ttf",
        }
    raise FileNotFoundError(f"Keine Schriftarten gefunden (weder {linux_path} noch {win_path}).")


FONT_PATH, FONT_FILES = _font_path()

with open(os.path.join(BASIS, "backend", "package.json"), encoding="utf-8") as f:
    VERSION = json.load(f)["version"]

AUTOR = "Tim van der Hoven"
MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
          "August", "September", "Oktober", "November", "Dezember"]
HEUTE = datetime.now()
STAND = f"{HEUTE.day}. {MONATE[HEUTE.month - 1]} {HEUTE.year}"

C_INK      = (34, 35, 39)
C_INK_SOFT = (107, 109, 114)
C_RED      = (200, 16, 46)
C_LINE     = (225, 226, 228)
C_PAPER    = (248, 248, 249)
C_WHITE    = (255, 255, 255)

# Wie Prisma Skalartypen ohne eigenes @db.* standardmäßig auf PostgreSQL abbildet.
PG_TYP = {
    "String":   "text",
    "Int":      "integer",
    "Float":    "double precision",
    "Boolean":  "boolean",
    "DateTime": "timestamp(3)",
    "Json":     "jsonb",
    "Decimal":  "decimal(65,30)",
    "BigInt":   "bigint",
    "Bytes":    "bytea",
}

MODEL_RE   = re.compile(r"^model\s+(\w+)\s*\{")
ENUM_RE    = re.compile(r"^enum\s+(\w+)\s*\{")
FIELD_RE   = re.compile(r"^(\w+)\s+(\S+)(.*)$")
MAP_RE     = re.compile(r'@map\("([^"]+)"\)')
TABLE_RE   = re.compile(r'@@map\("([^"]+)"\)')


def _default_wert(rest):
    """Extrahiert den Inhalt von @default(...) mit korrekter Klammerzählung
    (z.B. @default(uuid()) hat eine verschachtelte Klammer)."""
    start = rest.find("@default(")
    if start == -1:
        return None
    i = start + len("@default(")
    tiefe = 1
    ende = i
    while ende < len(rest) and tiefe > 0:
        if rest[ende] == "(":
            tiefe += 1
        elif rest[ende] == ")":
            tiefe -= 1
        ende += 1
    return rest[i:ende - 1]


def schema_zeilen():
    with open(SCHEMA, encoding="utf-8") as f:
        for zeile in f:
            # Inline-Kommentar abschneiden, aber nicht bei reinen Kommentarzeilen stören
            ohne_kommentar = re.sub(r"//.*$", "", zeile).rstrip()
            yield ohne_kommentar


def parse_schema():
    """Liefert (modelle, enums). modelle: [{name, tabelle, spalten: [...]}, ...]
    Erst ein Durchlauf, um alle Modell-/Enum-Namen zu kennen (um Beziehungsfelder
    von echten Spalten zu unterscheiden), dann der eigentliche Parse-Durchlauf."""
    zeilen = list(schema_zeilen())

    modell_namen = set()
    enum_namen = set()
    for zeile in zeilen:
        m = MODEL_RE.match(zeile.strip())
        if m:
            modell_namen.add(m.group(1))
        e = ENUM_RE.match(zeile.strip())
        if e:
            enum_namen.add(e.group(1))

    modelle = []
    enums = []
    aktuelles_modell = None
    aktuelles_enum = None

    for roh in zeilen:
        zeile = roh.strip()
        if not zeile:
            continue

        m = MODEL_RE.match(zeile)
        if m:
            aktuelles_modell = {"name": m.group(1), "tabelle": m.group(1), "spalten": []}
            continue
        e = ENUM_RE.match(zeile)
        if e:
            aktuelles_enum = {"name": e.group(1), "werte": []}
            continue
        if zeile == "}":
            if aktuelles_modell:
                modelle.append(aktuelles_modell)
                aktuelles_modell = None
            if aktuelles_enum:
                enums.append(aktuelles_enum)
                aktuelles_enum = None
            continue

        if aktuelles_enum is not None:
            wert = zeile.split()[0].rstrip(",")
            if wert and not wert.startswith("@@"):
                aktuelles_enum["werte"].append(wert)
            continue

        if aktuelles_modell is None:
            continue

        if zeile.startswith("@@"):
            t = TABLE_RE.search(zeile)
            if t:
                aktuelles_modell["tabelle"] = t.group(1)
            continue

        f = FIELD_RE.match(zeile)
        if not f:
            continue
        feld_name, roh_typ, rest = f.group(1), f.group(2), f.group(3)

        ist_liste = roh_typ.endswith("[]")
        ist_optional = roh_typ.endswith("?")
        basis_typ = roh_typ.rstrip("[]?")

        if basis_typ in modell_namen:
            continue  # Beziehungsfeld – keine eigene Spalte in dieser Tabelle

        spalten_name = feld_name
        map_match = MAP_RE.search(rest)
        if map_match:
            spalten_name = map_match.group(1)

        if basis_typ in enum_namen:
            pg_typ = basis_typ
            ist_enum = True
        else:
            pg_typ = PG_TYP.get(basis_typ, basis_typ)
            ist_enum = False
        if ist_liste:
            pg_typ += "[]"

        attribute = []
        if "@id" in rest:
            attribute.append("PK")
        if "@unique" in rest:
            attribute.append("unique")
        if not ist_optional and not ist_liste:
            attribute.append("required")
        default_wert = _default_wert(rest)
        if default_wert is not None:
            attribute.append(f"default: {default_wert}" if default_wert else "default")
        if "@updatedAt" in rest:
            attribute.append("auto (updatedAt)")

        aktuelles_modell["spalten"].append({
            "spalte": spalten_name,
            "typ": pg_typ,
            "enum": ist_enum,
            "optional": ist_optional,
            "attribute": ", ".join(attribute),
        })

    return modelle, enums


class Uebersicht(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "A4")
        self.add_font("S", "", FONT_PATH + FONT_FILES["regular"])
        self.add_font("S", "B", FONT_PATH + FONT_FILES["bold"])
        self.add_font("S", "I", FONT_PATH + FONT_FILES["italic"])
        self.add_font("SM", "", FONT_PATH + FONT_FILES["mono"])
        self.set_auto_page_break(True, margin=18)
        self.set_margins(18, 22, 18)
        self.set_title("BR-DMS – Datenbank-Übersicht")
        self.set_author(AUTOR)
        self.ohne_kopf = True

    def header(self):
        if self.ohne_kopf:
            return
        self.set_y(10)
        self.set_font("S", "B", 8)
        self.set_text_color(*C_INK)
        self.cell(30, 6, "BR-DMS")
        self.set_font("S", "", 8)
        self.set_text_color(*C_INK_SOFT)
        self.cell(100, 6, "Datenbank-Übersicht (automatisch aus schema.prisma erzeugt)")
        self.cell(0, 6, f"Version {VERSION}", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*C_LINE)
        self.set_line_width(0.3)
        self.line(self.l_margin, self.get_y() + 1, self.w - self.r_margin, self.get_y() + 1)
        self.set_y(22)
        self.set_text_color(*C_INK)

    def footer(self):
        if self.ohne_kopf:
            return
        self.set_y(-13)
        self.set_font("S", "", 8)
        self.set_text_color(*C_INK_SOFT)
        self.cell(0, 6, f"Seite {self.page_no()}", align="R")

    def titelseite(self, anzahl_tabellen, anzahl_enums):
        self.add_page()
        self.set_fill_color(*C_INK)
        self.rect(0, 0, self.w, self.h, "F")
        self.set_fill_color(*C_RED)
        self.rect(18, 108, 14, 2.2, "F")
        self.set_xy(18, 86)
        self.set_font("S", "B", 11)
        self.set_text_color(165, 167, 170)
        self.cell(0, 8, "BR-DMS", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_xy(18, 114)
        self.set_font("S", "B", 28)
        self.set_text_color(*C_WHITE)
        self.multi_cell(170, 12, "Datenbank-Übersicht", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)
        self.set_x(18)
        self.set_font("S", "", 12)
        self.set_text_color(200, 201, 204)
        self.multi_cell(160, 6.5,
            f"{anzahl_tabellen} Tabellen, {anzahl_enums} Enum-Typen – automatisch erzeugt aus "
            "backend/prisma/schema.prisma, Stand: " + STAND,
            new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_y(self.h - 30)
        self.set_x(18)
        self.set_font("S", "", 9)
        self.set_text_color(150, 152, 155)
        self.multi_cell(170, 5,
            "Gezeigt werden nur echte Spalten (inkl. Fremdschlüssel-Spalten), nicht Prismas "
            "virtuelle Beziehungsfelder (z.B. die Rückseite einer 1:n-Relation) – die erzeugen "
            "keine eigene Spalte in PostgreSQL.",
            new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ohne_kopf = False

    def tabellen_titel(self, name, tabelle):
        if self.get_y() > self.h - 50:
            self.add_page()
        self.set_font("S", "B", 14)
        self.set_text_color(*C_RED)
        self.cell(0, 8, name, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("SM", "", 9)
        self.set_text_color(*C_INK_SOFT)
        self.cell(0, 5, f"Tabelle: {tabelle}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)

    def spalten_tabelle(self, spalten):
        kopf = ["Spalte", "Typ", "Attribute"]
        breiten = (60, 50, 64)
        with self.offset_rendering() as probe:
            probe.set_font("S", "", 9)
            probe._tabelle_zeichnen(kopf, [self._zeile(s) for s in spalten[:1]], breiten)
        if probe.page_break_triggered:
            self.add_page()
        self._tabelle_zeichnen(kopf, [self._zeile(s) for s in spalten], breiten)

    @staticmethod
    def _zeile(s):
        typ = s["typ"] + (" (Enum)" if s["enum"] else "")
        return [s["spalte"], typ, s["attribute"]]

    def _tabelle_zeichnen(self, kopf, zeilen, breiten):
        self.set_font("S", "", 9)
        self.set_text_color(*C_INK)
        self.set_draw_color(*C_LINE)
        self.set_line_width(0.2)
        self.set_fill_color(*C_PAPER)
        with self.table(
            col_widths=breiten,
            headings_style=FontFace(emphasis="BOLD", color=C_WHITE, fill_color=C_INK),
            line_height=5.2,
            text_align="LEFT",
            borders_layout="HORIZONTAL_LINES",
            cell_fill_color=C_PAPER,
            cell_fill_mode="ROWS",
            padding=1.6,
        ) as t:
            for zeile in [kopf] + zeilen:
                r = t.row()
                for zelle in zeile:
                    r.cell(str(zelle))
        self.ln(6)

    def enum_anhang(self, enums):
        self.add_page()
        self.start_section("Anhang: Enum-Typen", level=0)
        self.set_font("S", "B", 18)
        self.set_text_color(*C_INK)
        self.cell(0, 10, "Anhang: Enum-Typen", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("S", "", 10)
        self.set_text_color(*C_INK_SOFT)
        self.multi_cell(0, 5.5,
            "Zulässige Werte der Enum-Spalten aus den Tabellen oben (PostgreSQL-Typ gleichen Namens).",
            new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(3)
        for en in enums:
            if self.get_y() > self.h - 35:
                self.add_page()
            self.set_font("SM", "", 10)
            self.set_text_color(*C_RED)
            self.cell(0, 6.5, en["name"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_font("S", "", 9)
            self.set_text_color(*C_INK)
            self.multi_cell(0, 5, ", ".join(en["werte"]), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.ln(2)


def main():
    modelle, enums = parse_schema()
    modelle.sort(key=lambda m: m["name"])
    enums.sort(key=lambda e: e["name"])

    pdf = Uebersicht()
    pdf.titelseite(len(modelle), len(enums))
    for m in modelle:
        pdf.tabellen_titel(m["name"], m["tabelle"])
        if m["spalten"]:
            pdf.spalten_tabelle(m["spalten"])
        else:
            pdf.set_font("S", "I", 9)
            pdf.set_text_color(*C_INK_SOFT)
            pdf.cell(0, 6, "(keine eigenen Spalten – reine Verknüpfungstabelle)",
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(4)
    pdf.enum_anhang(enums)
    pdf.output(OUT)
    print(f"{len(modelle)} Tabellen, {len(enums)} Enums -> {OUT}")


if __name__ == "__main__":
    main()
