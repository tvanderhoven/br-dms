#!/usr/bin/env python3
"""Generiert das BR-DMS Handbuch als PDF.

Aufbau: erst die Funktionen (mit Screenshots aus der Demo-Instanz), dann die
Administration, ganz zum Schluss die Technik.

Screenshots: tools/handbuch-screenshots/bilder/*.png – neu erzeugen mit
  ./demo/demo.sh start
  node tools/handbuch-screenshots/screenshots.mjs
Fehlt ein Bild, wird an seiner Stelle ein Platzhalter gezeichnet.

Benötigt: fpdf2, Pillow
"""
import json
import os
import tempfile
from datetime import datetime

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace
from PIL import Image


def _font_path():
    """Liberation-Schriften bevorzugt (Linux/Docker); auf Windows-Dev-PCs ohne
    Liberation-Fonts wird automatisch auf die metrisch kompatiblen Windows-Fonts
    (Arial/Courier New) zurueckgefallen, damit das Skript ueberall laeuft."""
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
    raise FileNotFoundError(
        "Keine passenden Schriftarten gefunden (weder Liberation unter "
        f"{linux_path} noch Windows-Fonts unter {win_path})."
    )


BASIS     = os.path.dirname(os.path.abspath(__file__))
FONT_PATH, FONT_FILES = _font_path()
OUT       = os.path.join(BASIS, "BR-DMS_Handbuch.pdf")
BILDER    = os.path.join(BASIS, "tools", "handbuch-screenshots", "bilder")
CACHE     = os.path.join(tempfile.gettempdir(), "brdms-handbuch-bilder")

with open(os.path.join(BASIS, "frontend", "package.json"), encoding="utf-8") as f:
    VERSION = json.load(f)["version"]

AUTOR   = "Tim van der Hoven"
SUPPORT = "support@vanderhoven.eu"

# Farben – "Board"-Design der App
C_INK      = (34, 35, 39)
C_INK_SOFT = (107, 109, 114)
C_RED      = (200, 16, 46)
C_RED_SOFT = (251, 234, 237)
C_GREY     = (134, 136, 138)
C_LINE     = (225, 226, 228)
C_PAPER    = (243, 243, 244)
C_WHITE    = (255, 255, 255)
C_GREEN    = (31, 122, 77)
C_GREEN_SOFT = (229, 244, 236)
C_AMBER    = (176, 100, 0)
C_AMBER_SOFT = (253, 243, 224)

MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
          "August", "September", "Oktober", "November", "Dezember"]
HEUTE  = datetime.now()
STAND  = f"{MONATE[HEUTE.month - 1]} {HEUTE.year}"


class Manual(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "A4")
        self.add_font("S",  "",  FONT_PATH + FONT_FILES["regular"])
        self.add_font("S",  "B", FONT_PATH + FONT_FILES["bold"])
        self.add_font("S",  "I", FONT_PATH + FONT_FILES["italic"])
        self.add_font("SM", "",  FONT_PATH + FONT_FILES["mono"])
        self.set_auto_page_break(True, margin=22)
        self.set_margins(20, 24, 20)
        self.set_title("BR-DMS – Handbuch")
        self.set_author(AUTOR)
        self.abb_nr = 0
        self.ohne_kopf = True  # Titelseite + Inhaltsverzeichnis
        self.seite_frisch = False

    def inhalt_platzhalter(self, render, seiten):
        """Inhaltsverzeichnis reservieren. fpdf bricht danach selbst auf eine neue Seite um –
        das nächste add_page() (Teil-Trenner) nutzt diese, statt eine leere Seite zu hinterlassen."""
        self.insert_toc_placeholder(render, pages=seiten)
        self.seite_frisch = True

    def add_page(self, *args, **kwargs):
        if self.seite_frisch:
            self.seite_frisch = False
            return
        super().add_page(*args, **kwargs)

    # ── Kopf- und Fußzeile ───────────────────────────────────────────
    def header(self):
        if self.ohne_kopf:
            return
        self.set_y(11)
        self.set_font("S", "B", 8)
        self.set_text_color(*C_INK)
        self.cell(12, 6, "BR-DMS")
        self.set_font("S", "", 8)
        self.set_text_color(*C_INK_SOFT)
        self.cell(100, 6, "Handbuch")
        self.cell(0, 6, f"Version {VERSION}  ·  {STAND}", align="R",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*C_LINE)
        self.set_line_width(0.3)
        self.line(self.l_margin, self.get_y() + 1, self.w - self.r_margin, self.get_y() + 1)
        self.set_y(24)
        self.set_text_color(*C_INK)

    def footer(self):
        if self.ohne_kopf:
            return
        self.set_y(-14)
        self.set_font("S", "", 8)
        self.set_text_color(*C_INK_SOFT)
        self.cell(0, 6, f"Seite {self.page_no()}", align="R")

    # ── Gliederung ───────────────────────────────────────────────────
    def teil(self, nummer, titel, untertitel):
        """Ganzseitiger Trenner für Teil I / II / III."""
        self.add_page()
        self.start_section(f"Teil {nummer} – {titel}", level=0)
        self.set_fill_color(*C_INK)
        self.rect(0, 0, self.w, self.h, "F")
        self.set_fill_color(*C_RED)
        self.rect(20, 118, 14, 2.2, "F")
        self.set_xy(20, 96)
        self.set_font("S", "B", 11)
        self.set_text_color(*C_GREY)
        self.cell(0, 8, f"TEIL {nummer}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_xy(20, 124)
        self.set_font("S", "B", 30)
        self.set_text_color(*C_WHITE)
        self.multi_cell(170, 13, titel, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(3)
        self.set_x(20)
        self.set_font("S", "", 12)
        self.set_text_color(200, 201, 204)
        self.multi_cell(150, 6.5, untertitel, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(*C_INK)

    def h1(self, text):
        self.add_page()
        self.start_section(text, level=1)
        nr, _, titel = text.partition("  ")
        self.set_font("S", "B", 11)
        self.set_text_color(*C_RED)
        self.cell(0, 6, f"KAPITEL {nr}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("S", "B", 22)
        self.set_text_color(*C_INK)
        self.multi_cell(0, 10, titel, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_fill_color(*C_RED)
        self.rect(self.l_margin, self.get_y() + 2, 12, 1.4, "F")
        self.ln(8)

    def h2(self, text):
        if self.get_y() > self.h - 60:
            self.add_page()
        self.ln(4)
        self.start_section(text, level=2)
        self.set_font("S", "B", 13.5)
        self.set_text_color(*C_INK)
        self.multi_cell(0, 7.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1.5)

    def h3(self, text):
        if self.get_y() > self.h - 45:
            self.add_page()
        self.ln(1.5)
        self.set_font("S", "B", 10.5)
        self.set_text_color(*C_INK)
        self.multi_cell(0, 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.5)

    # ── Textbausteine ────────────────────────────────────────────────
    def body(self, text):
        self.set_font("S", "", 10)
        self.set_text_color(*C_INK)
        self.multi_cell(0, 5.4, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1.8)

    def bullets(self, items, indent=2):
        self.set_font("S", "", 10)
        self.set_text_color(*C_INK)
        for item in items:
            self.set_x(self.l_margin + indent)
            self.set_text_color(*C_RED)
            self.cell(5, 5.4, "•")
            self.set_text_color(*C_INK)
            fett, _, rest = item.partition(" – ") if " – " in item else ("", "", item)
            # Fett-Teil und Rest getrennt schreiben statt per Markdown – sonst würde
            # z.B. "--no-cache" als Unterstreichung interpretiert. Der linke Rand wird
            # dafür kurz auf den Einzug gesetzt, damit Folgezeilen bündig umbrechen.
            rand = self.l_margin
            self.set_left_margin(rand + indent + 5)
            if fett:
                self.set_font("S", "B", 10)
                self.write(5.4, fett)
                self.set_font("S", "", 10)
                self.write(5.4, " – " + rest)
            else:
                self.write(5.4, item)
            self.ln(5.4)
            self.set_left_margin(rand)
        self.ln(1.8)

    def hinweis(self, text, art="info", titel=""):
        farben = {
            "info":    (C_PAPER, C_INK),
            "tipp":    (C_GREEN_SOFT, C_GREEN),
            "achtung": (C_AMBER_SOFT, C_AMBER),
            "wichtig": (C_RED_SOFT, C_RED),
        }
        hg, akzent = farben[art]
        self.ln(1)
        breite = self.w - self.l_margin - self.r_margin
        y0, seite0 = self.get_y(), self.page_no()
        # Erst messen, dann zeichnen (Box + Akzentbalken links)
        self.set_font("S", "", 9.5)
        zeilen = len(self.multi_cell(breite - 10, 5.2, text, dry_run=True, output="LINES"))
        hoehe = zeilen * 5.2 + (6 if titel else 0) + 6
        if y0 + hoehe > self.h - self.b_margin:
            self.add_page()
            y0 = self.get_y()
        self.set_fill_color(*hg)
        self.rect(self.l_margin, y0, breite, hoehe, "F")
        self.set_fill_color(*akzent)
        self.rect(self.l_margin, y0, 1.2, hoehe, "F")
        self.set_xy(self.l_margin + 6, y0 + 3)
        if titel:
            self.set_font("S", "B", 9.5)
            self.set_text_color(*akzent)
            self.cell(0, 6, titel, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_x(self.l_margin + 6)
        self.set_font("S", "", 9.5)
        self.set_text_color(*C_INK)
        self.multi_cell(breite - 10, 5.2, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_y(y0 + hoehe + 3)

    def code(self, text):
        self.set_font("SM", "", 8.5)
        # Befehle müssen in eine Zeile passen: ein optischer Umbruch landet beim
        # Kopieren aus dem PDF als echter Zeilenumbruch im Terminal.
        platz = self.w - self.l_margin - self.r_margin - 8
        for zeile in text.split("\n"):
            if self.get_string_width(zeile) > platz:
                raise ValueError(f"Code-Zeile zu lang für die Seite ({len(zeile)} Zeichen): {zeile}")
        self.set_fill_color(*C_INK)
        self.set_text_color(235, 235, 237)
        breite = self.w - self.l_margin - self.r_margin
        zeilen = text.count("\n") + 1
        if self.get_y() + zeilen * 4.8 + 8 > self.h - self.b_margin:
            self.add_page()
        y0 = self.get_y()
        self.rect(self.l_margin, y0, breite, zeilen * 4.8 + 6, "F")
        self.set_xy(self.l_margin + 4, y0 + 3)
        self.multi_cell(breite - 8, 4.8, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_y(y0 + zeilen * 4.8 + 9)
        self.set_text_color(*C_INK)

    def tabelle(self, kopf, zeilen, breiten=None, ueberschrift=None):
        """ueberschrift: h2 direkt vor der Tabelle – beide wandern zusammen auf die
        nächste Seite, wenn die Tabelle sonst umbrechen würde."""
        if ueberschrift:
            with self.offset_rendering() as probe:
                probe.h2(ueberschrift)
                probe._tabelle_zeichnen(kopf, zeilen, breiten)
            if probe.page_break_triggered:
                self.add_page()
            self.h2(ueberschrift)
        self._tabelle_zeichnen(kopf, zeilen, breiten)

    def _tabelle_zeichnen(self, kopf, zeilen, breiten):
        self.set_font("S", "", 9)
        self.set_text_color(*C_INK)
        self.set_draw_color(*C_LINE)
        self.set_line_width(0.2)
        # Zebra-Zeilen nutzen die aktuelle Füllfarbe – vorher war ggf. noch Rot/Schwarz gesetzt
        self.set_fill_color(248, 248, 249)
        with self.table(
            col_widths=breiten,
            headings_style=FontFace(emphasis="BOLD", color=C_WHITE, fill_color=C_INK),
            line_height=5,
            text_align="LEFT",
            borders_layout="HORIZONTAL_LINES",
            cell_fill_color=(248, 248, 249),
            cell_fill_mode="ROWS",
            padding=1.6,
        ) as t:
            for zeile in [kopf] + zeilen:
                r = t.row()
                for zelle in zeile:
                    r.cell(str(zelle))
        self.ln(4)

    def schritt(self, nummer, titel, text):
        if self.get_y() > self.h - 40:
            self.add_page()
        y0 = self.get_y()
        self.set_fill_color(*C_INK)
        self.ellipse(self.l_margin, y0 + 0.5, 7, 7, "F")
        self.set_xy(self.l_margin, y0 + 0.5)
        self.set_font("S", "B", 9)
        self.set_text_color(*C_WHITE)
        self.cell(7, 7, str(nummer), align="C")
        self.set_xy(self.l_margin + 11, y0 + 1)
        self.set_font("S", "B", 10.5)
        self.set_text_color(*C_INK)
        self.multi_cell(0, 6, titel, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if text:
            self.set_x(self.l_margin + 11)
            self.set_font("S", "", 9.5)
            self.set_text_color(*C_INK_SOFT)
            self.multi_cell(0, 5.1, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(*C_INK)
        self.ln(2.5)

    def bild(self, name, beschriftung, ausschnitt="inhalt", hoehe_anteil=1.0, vertikal=(0.12, 0.82), waagerecht=(0.3, 0.7)):
        """Screenshot einbetten. ausschnitt: "voll" (mit Sidebar) oder "inhalt"
        (nur Arbeitsbereich). hoehe_anteil < 1 schneidet unten ab."""
        breite = self.w - self.l_margin - self.r_margin
        if ausschnitt == "mitte":
            breite *= 0.55
        quelle = os.path.join(BILDER, f"{name}.png")
        self.abb_nr += 1
        if os.path.exists(quelle):
            os.makedirs(CACHE, exist_ok=True)
            ziel = os.path.join(CACHE, f"{name}-{ausschnitt}-{hoehe_anteil}-{vertikal[0]}-{vertikal[1]}-{waagerecht[0]}-{waagerecht[1]}.jpg")
            with Image.open(quelle) as im:
                im = im.convert("RGB")
                b, h = im.size
                if ausschnitt == "mitte":
                    # z.B. Login-Karte: mittleres Drittel, ohne leere Ränder
                    im = im.crop((int(b * waagerecht[0]), int(h * vertikal[0]), int(b * waagerecht[1]), int(h * vertikal[1])))
                else:
                    links = int(b * 0.156) if ausschnitt == "inhalt" else 0
                    im = im.crop((links, 0, b, int(h * hoehe_anteil)))
                im.thumbnail((1800, 1800))
                im.save(ziel, "JPEG", quality=86, optimize=True)
                bw, bh = im.size
            hoehe = breite * bh / bw
            if self.get_y() + hoehe + 10 > self.h - self.b_margin:
                self.add_page()
            y0 = self.get_y() + 1
            self.image(ziel, x=self.l_margin, y=y0, w=breite)
            self.set_draw_color(*C_LINE)
            self.set_line_width(0.3)
            self.rect(self.l_margin, y0, breite, hoehe)
        else:
            hoehe = breite * 0.5
            if self.get_y() + hoehe + 10 > self.h - self.b_margin:
                self.add_page()
            y0 = self.get_y() + 1
            self.set_fill_color(*C_PAPER)
            self.rect(self.l_margin, y0, breite, hoehe, "F")
            self.set_xy(self.l_margin, y0 + hoehe / 2 - 3)
            self.set_font("S", "I", 9)
            self.set_text_color(*C_INK_SOFT)
            self.cell(breite, 6, f"[Screenshot fehlt: {name}.png]", align="C")
        self.set_y(y0 + hoehe + 1.5)
        self.set_font("S", "I", 8.5)
        self.set_text_color(*C_INK_SOFT)
        self.multi_cell(0, 4.5, f"Abb. {self.abb_nr}: {beschriftung}",
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(*C_INK)
        self.ln(3)


def inhaltsverzeichnis(pdf, outline):
    pdf.set_xy(pdf.l_margin, pdf.t_margin)
    pdf.set_font("S", "B", 22)
    pdf.set_text_color(*C_INK)
    pdf.cell(0, 12, "Inhalt", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_fill_color(*C_RED)
    pdf.rect(pdf.l_margin, pdf.get_y() + 1, 12, 1.4, "F")
    pdf.ln(7)
    breite = pdf.w - pdf.l_margin - pdf.r_margin
    for eintrag in outline:
        if eintrag.level == 0:
            pdf.ln(3)
            pdf.set_font("S", "B", 10)
            pdf.set_text_color(*C_RED)
            pdf.cell(breite, 7, eintrag.name.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            continue
        einzug = 0 if eintrag.level == 1 else 8
        pdf.set_font("S", "B" if eintrag.level == 1 else "", 10 if eintrag.level == 1 else 9.2)
        pdf.set_text_color(*(C_INK if eintrag.level == 1 else C_INK_SOFT))
        pdf.set_x(pdf.l_margin + einzug)
        hoehe = 6.2 if eintrag.level == 1 else 5.2
        link = pdf.add_link(page=eintrag.page_number)
        pdf.cell(breite - einzug - 12, hoehe, eintrag.name, link=link)
        pdf.cell(12, hoehe, str(eintrag.page_number), align="R", link=link,
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*C_INK)


# ════════════════════════════════════════════════════════════════════
def build():
    pdf = Manual()

    # ── Titelseite ───────────────────────────────────────────────────
    pdf.add_page()
    pdf.set_fill_color(*C_INK)
    pdf.rect(0, 0, pdf.w, pdf.h, "F")
    pdf.set_xy(20, 70)
    pdf.set_font("S", "B", 12)
    pdf.set_text_color(*C_GREY)
    pdf.cell(0, 8, "HANDBUCH", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    # Logo (helle Fassung für den dunklen Grund) – Quelle: branding/logo.py
    pdf.image(os.path.join(BASIS, "branding", "logo-hell.svg"), x=20, y=84, w=92)
    pdf.set_y(124)
    pdf.set_x(20)
    pdf.set_font("S", "", 16)
    pdf.set_text_color(210, 211, 214)
    pdf.multi_cell(150, 8, "Dokumentenmanagement für Betriebsräte –\nBedienung, Administration und Technik",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_xy(20, 236)
    pdf.set_font("S", "", 10)
    pdf.set_text_color(*C_GREY)
    for k, v in [("Version", VERSION), ("Stand", STAND), ("Autor", AUTOR),
                 ("Kontakt", SUPPORT), ("Lizenz", "Open Source · GNU AGPL v3.0")]:
        pdf.set_x(20)
        pdf.cell(24, 6.2, k)
        pdf.set_text_color(230, 230, 232)
        pdf.cell(0, 6.2, v, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(*C_GREY)

    # ── Inhaltsverzeichnis ───────────────────────────────────────────
    pdf.add_page()
    pdf.inhalt_platzhalter(inhaltsverzeichnis, 2)
    pdf.ohne_kopf = False

    # ════════════════════════════════════════════════════════════════
    #  TEIL I – ARBEITEN MIT BR-DMS
    # ════════════════════════════════════════════════════════════════
    pdf.teil("I", "Arbeiten mit BR-DMS",
             "Alle Funktionen aus Sicht der Betriebsratsmitglieder – vom Dokumenteingang "
             "über Sitzungen und Beschlüsse bis zur Personalverwaltung. Die Abbildungen "
             "zeigen die Demo-Instanz mit erfundenen Beispieldaten.")

    # 1 ─────────────────────────────────────────────────────────────
    pdf.h1("1  Einführung")
    pdf.h2("1.1  Was ist BR-DMS?")
    pdf.body(
        "BR-DMS ist ein Dokumentenmanagementsystem speziell für Betriebsräte. Es bündelt "
        "Sitzungen, Protokolle, Beschlüsse, Fristen und vertrauliche Dokumente in einem "
        "System, das vollständig im eigenen Intranet läuft – auf einer NAS, einem eigenen "
        "Server oder einer virtuellen Maschine. Eine Cloud-Verbindung ist nicht nötig."
    )
    pdf.body(
        "Das System begleitet ein Betriebsratsdokument über seinen ganzen Lebenszyklus: "
        "vom Eingang über Kategorisierung und Fristüberwachung, die Behandlung in der Sitzung "
        "bis zum rechtssicheren Protokoll – und am Ende die geregelte Löschung nach Ablauf "
        "der Aufbewahrungsfrist."
    )
    pdf.bullets([
        "Sicher – Alle Dokumente AES-256-verschlüsselt, Zugriff nach Rollen, lückenloser Audit-Trail",
        "Rechtssicher – Fristen nach § 87, § 99 und § 102 BetrVG, unveränderliche Protokolle mit Zeitstempel",
        "Vollständig – Sitzungen, Beschlussregister, Aufgaben, Wissensarchiv, Personal- und Schulungsverwaltung",
        "Anpassbar – Optionale Module ein- und ausschaltbar, eigenes Logo, eigene Farben",
        "Unabhängig – 100 % self-hosted, keine externen Dienste, Open Source",
    ])

    pdf.h2("1.2  Anmelden")
    pdf.body(
        "BR-DMS wird im Browser geöffnet, z. B. unter https://<Server>:8443. Angemeldet wird "
        "mit E-Mail-Adresse oder nur dem Teil vor dem @ als Benutzername, dazu das Passwort. "
        "„Eingeloggt bleiben“ hält die Anmeldung 24 Stunden, ohne Haken eine Stunde. Nach "
        "längerer Inaktivität meldet das System automatisch ab (einstellbar)."
    )
    pdf.bild("login", "Anmeldeseite", ausschnitt="mitte", vertikal=(0.27, 0.68))
    pdf.hinweis(
        "Wer sein Passwort vergessen hat, kann über „Passwort vergessen?“ einen Link per E-Mail "
        "anfordern. Alternativ setzen Vorsitz oder Admin das Passwort in der Benutzerverwaltung zurück. "
        "Das eigene Passwort ändern Sie jederzeit per Klick auf Ihren Namen oben in der Seitenleiste.",
        "tipp", "Passwort vergessen?")
    pdf.bild("passwort-aendern", "Eigenes Passwort ändern (Klick auf den Namen)", ausschnitt="mitte", vertikal=(0.28, 0.72), waagerecht=(0.35, 0.65))

    pdf.h2("1.3  Die Oberfläche")
    pdf.body(
        "Links befindet sich die Seitenleiste mit allen Bereichen, thematisch gruppiert "
        "(Postfach, Sitzungen, Dokumente & Wissen, Planung, Personal, Verwaltung). Jede Gruppe hat "
        "zur schnelleren Orientierung einen eigenen farbigen Rand; die Gruppen lassen sich auf- und "
        "zuklappen, das merkt sich der Browser. Oben in der Leiste steht Ihr Name. Der Kopfbalken "
        "über dem Inhalt enthält die Schnellsuche, das Zahnrad für die Einstellungen und rechts "
        "daneben „Abmelden“. Zahlen an den Einträgen zeigen Ungelesenes oder Offenes an."
    )
    pdf.bullets([
        "Schnellsuche – Ab zwei Zeichen erscheinen Treffer aus allen Bereichen; Enter öffnet die ausführliche Suche",
        "Benachrichtigungen – Neue Dokumente, Nachrichten und Aufgaben werden als Hinweis eingeblendet",
        "Über BR-DMS – Ganz unten in der Seitenleiste: Version, Lizenz und Support-Kontakt",
    ])

    pdf.h2("1.4  Rollen auf einen Blick")
    pdf.tabelle(
        ["Rolle", "Für wen", "Kurz gesagt"],
        [
            ["Vorsitz", "Vorsitzende/r", "Alles – inkl. Sitzungen fixieren und finalisieren, Benutzer verwalten"],
            ["Stellvertretung", "Stellv. Vorsitzende/r", "Wie Vorsitz im Tagesgeschäft"],
            ["Mitglied", "Ordentliche Mitglieder", "Dokumente, TOPs, Aufgaben, Personal; keine vertraulichen Dokumente anderer"],
            ["Ersatzmitglied", "Nachrückende", "Lesend; bei aktiver Vertretung wie ein Mitglied"],
            ["JAV", "Jugend- und Auszubildendenvertretung", "Nur Lesezugriff auf Sitzungen, vertrauliche TOPs ausgeblendet"],
            ["SBV", "Schwerbehindertenvertretung (§ 178 SGB IX)", "Wie JAV: nur Sitzungen und Protokolle lesen, ohne vertrauliche TOPs"],
            ["Admin", "Technische Betreuung", "Alle Rechte inkl. Module – aber kein Sitzungsmitglied; "
                      "auf Wunsch ohne Zugriff auf Inhalte (Kapitel 9.2)"],
        ],
        (26, 40, 104),
    )
    pdf.body("Die vollständige Berechtigungsmatrix steht in Kapitel 10.")

    # 2 ─────────────────────────────────────────────────────────────
    pdf.h1("2  Dashboard")
    pdf.body(
        "Das Dashboard ist die Startseite nach dem Login und zeigt nur, was im Alltag zählt: "
        "die wichtigsten Punkte auf einen Blick, die eigenen und die übrigen Aufgaben und die nahen Fristen."
    )
    pdf.bild("dashboard", "Dashboard: Auf einen Blick, Aufgaben und Fristen", ausschnitt="voll")
    pdf.bullets([
        "Kopfzeile – Begrüßung und die Zahl ungelesener Dokumente im Eingang",
        "Auf einen Blick – Vier Karten mit farbigem Rand (grün = in Ordnung, gelb = Handlungsbedarf): nächste "
        "Sitzung mit Uhrzeit, Ort und Zahl der TOPs; Betriebsvereinbarungen, die in den nächsten 90 Tagen "
        "auslaufen oder gekündigt sind; Qualifikationen, die abgelaufen sind oder in 90 Tagen ablaufen, samt "
        "nächstem Schulungstermin; Geschlechterquote nach § 15 Abs. 2 BetrVG (Sitze des Minderheitengeschlechts "
        "gegen die Mindestsitze aus der Benutzerverwaltung). Ein Klick führt zur jeweiligen Seite; Karten "
        "abgeschalteter Module und eine nicht eingetragene Quote werden ausgeblendet",
        "Aufgaben – Oben „Für mich“: alle Ihnen zugewiesenen Aufgaben, nach Fälligkeit sortiert, mit dem Kreis "
        "links direkt abhaken. Darunter „Alle anderen“: die Aufgaben der übrigen Mitglieder mit Namen davor; "
        "Aufgaben ohne Zuständigkeit stehen dort als „nicht zugewiesen“",
        "Fristen – Kompakt eine Zeile je Frist: überfällige und die der nächsten 14 Tage (höchstens sechs), "
        "Resttage farbig (rot ≤ 3 Tage, gelb ≤ 7 Tage); das Häkchen erledigt eine Frist, der Link führt in den Fristenkalender",
        "Hinweise – Erscheinen nur bei Bedarf: Dokumente, die in den nächsten 30 Tagen automatisch gelöscht werden, "
        "und fehlerhafte Watch-Folder-Dateien der letzten 7 Tage. Das vollständige Importprotokoll des "
        "Watch-Folders steht unter Einstellungen → System",
    ])

    # 3 ─────────────────────────────────────────────────────────────
    pdf.h1("3  Dokumente & Fristen")
    pdf.h2("3.1  Eingang")
    pdf.body(
        "Neu eingegangene Dokumente landen zuerst im Eingang – egal ob per Upload oder automatisch "
        "über den Watch-Folder (Scanner- oder Netzwerkordner). Hier entscheidet der Vorsitz, was mit "
        "jedem Dokument passiert. Ungelesene Einträge sind hervorgehoben."
    )
    pdf.bild("eingang", "Eingang mit ungelesenen Anhörungen und Quelle (Watch-Folder / Upload)", hoehe_anteil=0.55)
    pdf.h3("Aktionen im Eingang")
    pdf.bullets([
        "Mit Sitzung verknüpfen – Einem bestehenden TOP zuordnen oder direkt einen neuen TOP anlegen, auf Wunsch mit Frist",
        "Aufgabe erstellen – Bearbeitung an ein Mitglied übergeben, das Dokument bleibt verknüpft",
        "Ins Wissensarchiv – Inhalt als Wissenseintrag übernehmen",
        "Neue Version – Als neue Fassung eines vorhandenen Dokuments speichern",
        "Wiedervorlage – Datum setzen, an dem das Dokument erneut im Eingang auftaucht",
        "Widerspruch/Ablehnung – Vorausgefülltes Schreiben für § 99 bzw. § 102 als PDF erzeugen",
        "Download – Die Originaldatei herunterladen",
        "Erledigt – Das Dokument verlässt den Eingang und liegt nur noch im Dokumentenarchiv",
    ])
    pdf.body(
        "Ein Klick auf einen Eintrag klappt ihn auf: oben die Aktionen als Knopfleiste, darunter die "
        "PDF-Vorschau. Jede Aktion öffnet ein kleines Formular direkt unter der Leiste."
    )
    pdf.bild("eingang-aktionen", "Aufgeklappter Eintrag mit Aktionsleiste und Vorschau", hoehe_anteil=0.55)
    pdf.body("Der Eingang ist Vorsitz, Stellvertretung und Admin vorbehalten.")

    pdf.h2("3.2  Dokumentenarchiv")
    pdf.body(
        "Das Archiv enthält alle Dokumente. Über der Liste stehen die Kategorien mit der Zahl ihrer "
        "Dokumente – ein Klick filtert. Unter dem Titel steht, in welcher Sitzung und unter welchem TOP "
        "das Dokument behandelt wurde; die Vorschau rechts listet alle Sitzungen mit Link. PDFs werden "
        "direkt im Browser angezeigt. Jedes Dokument wird beim Speichern verschlüsselt und nur beim "
        "Öffnen kurz entschlüsselt."
    )
    pdf.bild("dokumente", "Dokumentenarchiv mit Kategorie, Fristen und Löschdatum", hoehe_anteil=0.62)
    pdf.tabelle(
        ["Funktion", "Beschreibung"],
        [
            ["Upload", "PDF, DOCX, DOCM, XLSX und E-Mails (EML, MSG) bis 50 MB, per Klick oder Hineinziehen; bei PDFs "
                       "und E-Mails wird der Text für die Volltextsuche ausgelesen"],
            ["Kategorien", "Anhörung § 99, Kündigung § 102, Abmahnung, Bewerbung, Bewerbung (Alternativ), "
                           "Zeitmodell § 87, Betriebsvereinbarung, Information des Arbeitgebers, Arbeits- und "
                           "Gesundheitsschutz, Schriftverkehr, Protokoll, Sonstiges"],
            ["Metadaten", "Titel, Alias, Tags, Aktenzeichen, Beschreibung, Kennzeichen „vertraulich“"],
            ["Versionen", "Beliebig viele Fassungen mit Änderungsnotiz"],
            ["Kommentare", "Diskussion direkt am Dokument"],
            ["Löschung", "Nach Ablauf der Aufbewahrungsfrist Löschvormerkung, danach endgültige, sichere Löschung"],
            ["Löschdatum ändern", "Im Bearbeiten-Dialog; wechselt die Kategorie, wird das Datum nach deren "
                                  "Regel ab dem Hochladen neu vorgeschlagen. Nur Daten in der Zukunft"],
            ["Spalten", "Grenze zwischen zwei Spalten im Kopf ziehen (feine Linie) – wie in einer Tabellenkalkulation; Reihenfolge durch Ziehen am "
                        "Spaltennamen ändern, über das Spalten-Symbol rechts ein- und ausblenden. Der Titel nimmt "
                        "immer den restlichen Platz; reicht er nicht (z. B. bei offener Vorschau), blendet die Liste "
                        "die unwichtigsten Spalten vorübergehend selbst aus. Alles wird im Browser gemerkt"],
        ],
        (32, 138),
    )
    pdf.h3("Ordner")
    pdf.body(
        "Links neben der Liste steht die Ablage: ein Ordnerbaum wie im Datei-Explorer, z. B. "
        "„Schriftverkehr › Geschäftsführung“ oder „Muster › Arbeitsverträge“. Ordner ergänzen die Kategorien, "
        "sie ersetzen sie nicht: Die Kategorie sagt, was ein Dokument ist, und steuert Fristen, "
        "Aufbewahrung und Abläufe wie die Anhörung. Der Ordner sagt nur, wo es liegt. Jedes Dokument liegt "
        "in höchstens einem Ordner."
    )
    pdf.bild("dokumente-ordner", "Ablage mit Ordnerbaum, Pfad und Unterordnern", hoehe_anteil=0.62)
    pdf.tabelle(
        ["Aktion", "So geht es"],
        [
            ["Ordner anlegen", "Ordner-Plus neben „Ablage“ (oberste Ebene) oder beim Überfahren eines Ordners "
                               "(Unterordner); Name eingeben, Enter"],
            ["Umbenennen, löschen", "Stift bzw. Papierkorb beim Überfahren. Gelöscht werden nur leere Ordner"],
            ["Dokument einsortieren", "Zeile aus der Liste auf einen Ordner im Baum ziehen – oder im "
                                      "Bearbeiten-Dialog den Ordner wählen. Beim Hochladen ist der gerade "
                                      "geöffnete Ordner vorbelegt"],
            ["Ordner verschieben", "Ordner im Baum auf einen anderen ziehen; auf „Ohne Ordner“ gezogen, "
                                   "kommt er auf die oberste Ebene"],
            ["Alle Dokumente", "Zeigt wie bisher alles, unabhängig vom Ordner; unter dem Dateinamen steht, "
                               "in welchem Ordner ein Dokument liegt"],
            ["Ohne Ordner", "Alles, was noch nicht einsortiert ist – etwa neue Dokumente aus dem Watch-Folder"],
            ["Baum einklappen", "« neben „Ablage“ klappt den Baum zu einer schmalen Leiste zusammen (mehr Platz für die "
                                "Liste); die Ordnerwahl steht dann als Auswahlliste neben der Suche, » klappt ihn wieder auf"],
        ],
        (40, 130),
    )
    pdf.body(
        "Die Suche über der Liste sucht im geöffneten Ordner; ein Klick auf „in allen Dokumenten suchen“ "
        "wechselt zu allen. Ordnernamen sehen alle, vertrauliche Dokumente darin nur, wer sie sehen darf. "
        "Auf dem Handy ersetzt eine Auswahlliste über der Tabelle den Baum."
    )

    pdf.h3("E-Mails")
    pdf.body(
        "E-Mails von außen werden wie jedes andere Dokument abgelegt – als Datei aus dem Mailprogramm: aus "
        "Outlook als .msg (Mail auf den Desktop ziehen oder „Speichern unter“), aus Thunderbird und den meisten "
        "Webmailern als .eml. Der Titel darf leer bleiben, dann gilt der Betreff. Absender, Empfänger, Text und "
        "die Namen der Anhänge sind über die Suche auffindbar."
    )
    pdf.bild("dokument-email", "E-Mail in der Vorschau mit Kopf, Anhängen und Inhalt", hoehe_anteil=0.62)
    pdf.tabelle(
        ["Was", "So funktioniert es"],
        [
            ["In der Liste", "Briefumschlag vor dem Titel, darunter Absender, Datum und Zahl der Anhänge"],
            ["Vorschau", "Von, An, Cc, Datum und Betreff, darunter die Anhänge und der Inhalt – formatiert oder "
                         "mit „Nur Text“. Bilder und Inhalte von fremden Servern werden nicht geladen, Skripte nicht "
                         "ausgeführt: So erfährt der Absender nicht, dass und wann die Mail geöffnet wurde"],
            ["Anhänge", "Jeder Anhang lässt sich herunterladen. PDF, Word, Excel und weitergeleitete Mails lassen "
                        "sich zusätzlich als eigenes Dokument ablegen – beim Hochladen gleich für alle (Haken ist "
                        "gesetzt) oder später einzeln in der Vorschau"],
            ["Abgelegte Anhänge", "Übernehmen Kategorie, Ordner, Vertraulichkeit und Aktenzeichen der E-Mail und "
                                  "zeigen „Anhang aus: …“ mit Link zur E-Mail. Sie bekommen keine eigenen Fristen "
                                  "und erscheinen nicht einzeln im Eingang – das gilt für die E-Mail selbst"],
            ["Original", "„Herunterladen“ liefert die unveränderte .eml bzw. .msg, die sich wieder im "
                         "Mailprogramm öffnen lässt"],
        ],
        (34, 136),
    )

    pdf.h3("Vorschau, Bearbeiten und Kommentare")
    pdf.body(
        "Ein Klick auf eine Zeile öffnet rechts die Vorschau mit dem PDF, den Sitzungen, in denen das Dokument "
        "behandelt wurde, und den Versionen. Darüber stehen „Neues Fenster“, „Herunterladen“ und „Bearbeiten“; "
        "ein Doppelklick auf die Zeile öffnet das Dokument direkt in einem neuen Fenster."
    )
    pdf.bild("dokument-vorschau", "Vorschau mit „Behandelt in“ und PDF-Ansicht", hoehe_anteil=0.6)
    pdf.body(
        "„Bearbeiten“ ändert Kategorie, Ordner, Titel, Alias, Aktenzeichen, Beschreibung, Löschdatum und die "
        "Vertraulichkeit. Unten im selben Fenster steht die Diskussion zum Dokument: Kommentare mit "
        "Formatierung, Links und Dokumentverweisen. Der Knopf „Aufgabe“ an einem Kommentar macht daraus "
        "direkt eine Aufgabe – mit Titel, Zuständigkeit, Priorität und Fälligkeit."
    )
    pdf.bild("dokument-bearbeiten", "Bearbeiten-Dialog mit Kommentaren und „Aufgabe“-Knopf")
    pdf.hinweis(
        "Vertrauliche Dokumente sehen Mitglieder und Ersatzmitglieder nur, wenn sie sie selbst "
        "hochgeladen haben. Vorsitz, Stellvertretung und Admin sehen alle.", "info", "Vertraulichkeit")

    pdf.h2("3.3  Fristen & Fristenkalender")
    pdf.body(
        "Für Anhörungen legt BR-DMS die gesetzlichen Fristen automatisch an, sobald ein Dokument der "
        "passenden Kategorie eingeht. Zusätzlich können eigene Fristen angelegt werden. Der "
        "Fristenkalender zeigt alle Fristen in der Monatsansicht, farbig nach Dringlichkeit; "
        "vor Ablauf verschickt das System eine Erinnerung per E-Mail."
    )
    pdf.bild("fristenkalender", "Fristenkalender in der Monatsansicht", hoehe_anteil=0.62)
    pdf.bullets([
        "Erledigen – Häkchen an der Frist (im Kalender oder auf dem Dashboard); Name und Datum werden festgehalten, der Pfeil öffnet sie wieder",
        "Neue Frist – Für Termine ohne Dokument, z. B. Wahl, Betriebsversammlung oder eine Erinnerung, mit Bezeichnung und Notiz",
        "Bearbeiten – Stift an der Frist: Bezeichnung, Datum und Notiz ändern; bei Fristen zu einem Dokument nur Datum und Notiz",
        "Betriebsversammlung – Ist im laufenden Quartal noch keine angelegt, erscheint automatisch eine Frist zum Quartalsende (§ 43 Abs. 1 BetrVG); sie erledigt sich mit der ersten Versammlung",
        "Überfällig – Offene Fristen nach ihrem Fälligkeitstag; sie bleiben offen, bis jemand sie erledigt",
    ])
    pdf.tabelle(
        ["Fristtyp", "Dauer", "Rechtsgrundlage"],
        [
            ["Anhörung § 99 (Einstellung, Versetzung, Eingruppierung)", "1 Woche", "§ 99 Abs. 3 BetrVG"],
            ["Anhörung § 102, ordentliche Kündigung", "1 Woche", "§ 102 Abs. 2 BetrVG"],
            ["Anhörung § 102, außerordentliche Kündigung", "3 Tage", "§ 102 Abs. 2 BetrVG"],
            ["Mitbestimmung § 87 (z. B. Mehrarbeit)", "1 Woche", "§ 87 BetrVG"],
            ["Widerspruch", "1 Woche", "§ 99 / § 102 BetrVG"],
            ["Betriebsversammlung im Quartal", "bis Quartalsende", "§ 43 Abs. 1 BetrVG"],
            ["Individuelle Frist", "frei wählbar", "–"],
        ],
        (92, 28, 50),
    )

    # 4 ─────────────────────────────────────────────────────────────
    pdf.h1("4  Sitzungen")
    pdf.h2("4.1  Der Lebenszyklus einer Sitzung")
    pdf.body(
        "Jede Sitzung durchläuft feste Stufen. Jeder Übergang erzeugt eine neue, schreibgeschützte "
        "Version – so lässt sich später genau nachvollziehen, was eingeladen und was beschlossen wurde. "
        "Die Übergänge lösen Vorsitz oder Stellvertretung aus; sie sind nicht umkehrbar."
    )
    pdf.tabelle(
        ["Version", "Status", "Was passiert"],
        [
            ["1.0", "Entwurf", "TOPs anlegen, sortieren, Dokumente verknüpfen"],
            ["1.1", "Tagesordnung fixiert", "PDF der Tagesordnung entsteht, Einladung geht automatisch an alle Mitglieder"],
            ["2.0", "Protokoll in Bearbeitung", "Anwesenheit, Ergebnisse, Beschlüsse und Abstimmungen erfassen"],
            ["2.1", "Protokoll final", "Unveränderliches Protokoll-PDF mit Zeitstempel (SHA-256)"],
            ["–", "Abgesagt", "Sitzung entfällt, bleibt aber dokumentiert"],
        ],
        (18, 45, 107),
    )
    pdf.bild("sitzungen", "Sitzungsliste mit allen Stufen des Lebenszyklus", hoehe_anteil=0.42)
    pdf.body(
        "Die Liste trennt kommende Sitzungen (die nächste zuerst, die heutige zählt dazu) von vergangenen "
        "(die jüngste zuerst). Neben der Zahl der TOPs steht, wie viele Dokumente mit der Sitzung verknüpft sind."
    )

    pdf.h2("4.2  Sitzung vorbereiten")
    pdf.schritt(1, "Sitzung anlegen",
                "Sitzungen → „Neue Sitzung“: Titel, Datum, Ort und Art angeben (ordentlich, außerordentlich, "
                "konstituierend oder Betriebsversammlung). Mit einer Vorlage werden Standard-TOPs gleich mit angelegt; "
                "alle aktiven Mitglieder stehen bereits auf der Anwesenheitsliste.")
    pdf.schritt(2, "Tagesordnung aufbauen",
                "TOPs hinzufügen, per Rich-Text beschreiben, Dokumente anhängen. Die Reihenfolge ändern Sie, indem "
                "Sie einen TOP am Punkte-Griff links an die neue Stelle ziehen; die Pfeile rechts verschieben um eine "
                "Position. Themen aus dem Themen-Backlog lassen sich direkt als TOP übernehmen. TOPs können als "
                "vertraulich markiert werden.")
    pdf.schritt(3, "Ladung und Verhinderung",
                "Vor der Sitzung heißt die Anwesenheit „Ladung & Verhinderung“. Meldet sich ein Mitglied ab, wird es auf "
                "„Verhindert“ gestellt; BR-DMS schlägt das nächste Ersatzmitglied laut Wahlrang vor. Auf der "
                "Anwesenheitsliste steht der Ersatz dann mit „für …“ in einem eigenen Abschnitt.")
    pdf.schritt(4, "Tagesordnung fixieren",
                "Vorsitz oder Stellvertretung fixieren die Tagesordnung: Version 1.1 und ihr PDF entstehen, alle Mitglieder "
                "erhalten eine Nachricht. Danach sind nur noch Spontan-TOPs möglich.")
    pdf.schritt(5, "Einladung per E-Mail",
                "In der Karte „Einladung per E-Mail“ verschickt der Vorsitz die Einladung mit der Tagesordnung als PDF an "
                "alle Geladenen – an deren Adresse für Einladungen (z. B. br-…), sonst an die Hauptadresse. Wer später "
                "nachgeladen wird, bekommt sie mit „An Neue senden“. Jeder Versand wird mit Zeitpunkt, Adresse und "
                "Ergebnis protokolliert – das ist der Nachweis der Ladung. JAV und SBV erhalten keine vertraulichen TOPs. "
                "Vor dem Senden öffnet sich ein Fenster für einen zusätzlichen Text, etwa den Link zu einem "
                "Online-Meeting; er wird beim nächsten Versand für dieselbe Sitzung vorgeschlagen. Jede Einladung "
                "bringt den Termin als Datei „Termin.ics“ mit: ein Klick darauf in Outlook oder Thunderbird trägt die "
                "Sitzung in den eigenen Kalender ein (zwei Stunden, Erinnerung 15 Minuten vorher). Wird die Einladung "
                "nach einer Änderung erneut verschickt, aktualisiert die neue Datei den vorhandenen Termin.")
    pdf.bild("sitzung-einladung", "Karte „Einladung per E-Mail“ mit Versandstatus je Geladenem", hoehe_anteil=0.6)
    pdf.body(
        "Ohne eingerichteten Mailserver weist die Karte darauf hin und der Versand bleibt gesperrt "
        "(Kapitel 9.7). Neben jedem Namen steht, ob und wann die Einladung zugestellt wurde."
    )
    pdf.bild("vorlagen", "Sitzungsvorlagen für wiederkehrende Tagesordnungen", hoehe_anteil=0.35)

    pdf.h2("4.3  Sitzung durchführen und protokollieren")
    pdf.body(
        "Mit „Protokoll starten“ wechselt die Sitzung in den Protokollmodus. Zu jedem TOP werden "
        "Ergebnis, Beschlüsse und Abstimmungen festgehalten. Die Anwesenheitsliste lässt sich als "
        "PDF zum Unterschreiben ausdrucken."
    )
    pdf.bild("sitzung-entwurf", "Sitzung im Protokollmodus mit Editor, Beschluss und Anwesenheitsliste")
    pdf.h3("Der Editor")
    pdf.body(
        "Beschreibung und Ergebnis eines TOPs werden in einem Editor mit Werkzeugleiste geschrieben. "
        "Alles, was hier formatiert ist, erscheint genauso im PDF."
    )
    pdf.bullets([
        "Fett, kursiv, unterstrichen – auch per Strg+B, Strg+I, Strg+U",
        "Überschriften – zwei Ebenen zum Gliedern längerer TOPs",
        "Aufzählung und nummerierte Liste",
        "Markieren – Textmarker, etwa um den Beschlusstext hervorzuheben",
        "Link – Weblink setzen oder entfernen",
        "Dokument – Ein Dokument aus dem Archiv suchen und als Verweis einfügen; ein Klick darauf öffnet es",
    ])
    pdf.body(
        "Jeder TOP hat außerdem eigene Kommentare für Rückfragen im Gremium; wie beim Dokument wird "
        "ein Kommentar per „Aufgabe“ zur Aufgabe. Über das Menü „…“ am TOP sind weitere Aktionen erreichbar."
    )
    pdf.h3("Anwesenheit und Ersatzmitglieder")
    pdf.body(
        "Für jedes Mitglied wird der Status gesetzt: anwesend, entschuldigt oder unentschuldigt abwesend. "
        "Fehlt ein Mitglied, schlägt BR-DMS das richtige Ersatzmitglied nach dem Wahlrang vor (§ 25 BetrVG) "
        "und warnt, wenn dadurch die Mindestsitze des Minderheitengeschlechts unterschritten würden."
    )
    pdf.h3("Beschlüsse")
    pdf.body(
        "Pro TOP können mehrere Beschlüsse erfasst werden – jeweils mit Antragstext, Rechtsgrundlage "
        "und Stimmen (Ja, Nein, Enthaltung, nicht teilgenommen). Das Ergebnis berechnet das System. "
        "Finalisierte Beschlüsse sind gesperrt und erscheinen im Beschlussregister."
    )
    pdf.h3("Direkt aus dem TOP heraus")
    pdf.bullets([
        "Aufgabe erstellen – Folgeaufgabe mit Bezug zum TOP",
        "Ins Wissensarchiv – Ergebnis als Wissenseintrag festhalten",
        "In die Eingruppierung – Beschlossene Ein- oder Umgruppierung direkt beim Mitarbeiter eintragen",
        "Einzelauszug – Einen TOP als eigenes PDF erzeugen",
    ])

    pdf.h2("4.4  Protokoll finalisieren")
    pdf.body(
        "Ist das Protokoll vollständig, wird es finalisiert (Vorsitz oder Stellvertretung). Version 2.1 wird schreibgeschützt, "
        "erhält einen digitalen Zeitstempel und ein PDF mit Briefkopf, Unterschriftszeilen und allen "
        "Abstimmungsergebnissen. Alle Mitglieder werden benachrichtigt."
    )
    pdf.bild("sitzung-protokoll", "Finales Protokoll mit Versionshistorie und Abstimmungsergebnis")
    pdf.hinweis(
        "Nach der Finalisierung lässt sich das Protokoll nicht mehr ändern. Der Zeitstempel "
        "(SHA-256 über Inhalt und Zeitpunkt) belegt, dass es seitdem unverändert ist.",
        "tipp", "Rechtssicherheit")
    pdf.body(
        "In der Versionsliste der Sitzung steht neben jedem PDF ein Knopf „PDF neu generieren“ (Vorsitz, "
        "Stellvertretung, Admin). Er erzeugt "
        "das PDF einer Version mit dem aktuellen Protokoll-Layout neu – etwa nachdem ein neues Logo "
        "hinterlegt wurde (Kapitel 9.6). Der Inhalt der Version ändert sich dabei nicht, nur ihr Aussehen; "
        "die gespeicherte PDF-Datei wird ersetzt."
    )

    pdf.h3("Unterschreiben und Scan hochladen")
    pdf.body(
        "Zum Unterschreiben reicht eine eigene Unterschriftenseite statt des ganzen Protokolls – sie trägt "
        "Version und SHA-256-Prüfsumme, damit sie eindeutig dem finalisierten Stand zugeordnet ist. Die "
        "unterschriebene Anwesenheitsliste (geht zu Sitzungsbeginn rum) und die unterschriebene "
        "Unterschriftenseite (nach der Finalisierung) werden als Scan zur Sitzung hochgeladen – eine "
        "kombinierte Datei darf beide Nachweise auf einmal füllen."
    )
    pdf.bullets([
        "Direkt hochladen – PDF, JPG oder PNG über die Sitzungsseite auswählen",
        "Über den Watch-Folder – Scan in den Unterordner protokoll_scan legen (z. B. Scanner-Ablage); die "
        "Datei erscheint im Eingang als „wartender Scan“ und wird dort per Klick der richtigen Sitzung "
        "zugeordnet (Kapitel 12.6)",
    ])

    pdf.h3("Sitzungspaket und Sitzung abschließen")
    pdf.body(
        "Sobald das Protokoll final ist, lässt sich das Sitzungspaket als ZIP herunterladen: Tagesordnung "
        "bzw. Einladung als PDF, Versandnachweis als CSV, Protokoll bzw. Niederschrift als PDF und – sobald "
        "vorhanden – beide Scans. Jede Datei bleibt dabei im Original, nichts wird in ein Sammel-PDF "
        "umgewandelt; fehlt ein Teil (z. B. ein Scan steht noch aus), wird er einfach ausgelassen."
    )
    pdf.body(
        "Liegen beide Scans vor, lässt sich die Sitzung endgültig abschließen. Eine Checkliste zeigt, was "
        "noch fehlt – „Sitzung abschließen“ ist erst aktiv, wenn Anwesenheitsliste- und "
        "Protokoll-Unterschriften-Scan hochgeladen sind. Danach wechselt der Status auf „Abgeschlossen“: "
        "die Sitzung ist vollständig unveränderlich, auch die Scans lassen sich nicht mehr ersetzen. "
        "Downloads (Protokoll, Scans, Sitzungspaket) funktionieren weiterhin."
    )

    pdf.h2("4.5  Beschlussregister")
    pdf.body(
        "Das Beschlussregister sammelt alle Beschlüsse sitzungsübergreifend – filterbar nach Zeitraum, "
        "Sitzung, Rechtsgrundlage und Ergebnis. So ist auch Jahre später schnell zu finden, wann der "
        "Betriebsrat was entschieden hat."
    )
    pdf.bild("beschluesse", "Beschlussregister über alle Sitzungen", hoehe_anteil=0.55)

    pdf.h2("4.6  Konstituierende Sitzung und Betriebsversammlung")
    pdf.body(
        "Beide Arten nutzen denselben Ablauf von der Tagesordnung bis zum PDF. Wird beim Anlegen keine "
        "Vorlage gewählt, bringen sie eine passende Standard-Tagesordnung mit, die sich wie gewohnt "
        "anpassen lässt."
    )
    pdf.h3("Konstituierende Sitzung (§ 29 BetrVG)")
    pdf.body(
        "Die erste Sitzung nach der Wahl. Die Standard-Tagesordnung enthält Eröffnung durch den "
        "Wahlvorstand, Wahl einer Wahlleitung, Wahl von Vorsitz und Stellvertretung (§ 26) und die "
        "Bildung des Betriebsausschusses (§ 27). Anwesenheit und Beschlüsse funktionieren wie bei jeder BR-Sitzung."
    )
    pdf.h3("Betriebsversammlung (§§ 42–46 BetrVG)")
    pdf.body(
        "Die Standard-Tagesordnung enthält Tätigkeitsbericht des Betriebsrats, Bericht des Arbeitgebers, "
        "Fragen aus der Belegschaft und Anträge an den Betriebsrat. Gegenüber einer BR-Sitzung ändert sich:"
    )
    pdf.tabelle(
        ["", "BR-Sitzung", "Betriebsversammlung"],
        [
            ["Anwesenheit", "Anwesenheitsliste mit Ersatz-Nachrücken", "Nur die Teilnehmerzahl"],
            ["Beschlüsse", "Mit Abstimmung", "Keine – Anträge an den BR (§ 45) gehen ins Themen-Backlog"],
            ["Tagesordnungs-PDF", "Tagesordnung", "Einladung zum Aushang (nicht öffentlich, Teilnahme gilt als Arbeitszeit)"],
            ["Protokoll-PDF", "Protokoll", "Niederschrift mit Teilnehmerzahl"],
        ],
        (34, 58, 78),
    )
    pdf.bullets([
        "Fragen aus dem Kummerkasten – Im Entwurf übernimmt der Knopf über der Tagesordnung ausgewählte Nachrichten ohne Absendernamen als Liste in einen TOP",
        "Antrag – Im Protokollmodus legt der Knopf am TOP einen Antrag der Versammlung als Thema im Backlog an",
        "Quartals-Erinnerung – Ohne Versammlung im laufenden Quartal erscheint eine Frist zum Quartalsende (Kapitel 3.3)",
    ])
    pdf.bild("sitzung-betriebsversammlung", "Betriebsversammlung mit Teilnehmerzahl statt Anwesenheitsliste")
    pdf.hinweis(
        "Eine Betriebsversammlung lässt sich nicht nachträglich in eine BR-Sitzung umwandeln (und umgekehrt), "
        "weil Anwesenheitsliste und Beschlüsse sonst verwaist zurückblieben. Im Zweifel neu anlegen.",
        "info")

    pdf.h2("4.7  Gremien und Fremdprotokolle")
    pdf.body(
        "Die Seite Gremien verwaltet die anderen Gremien, die der Betriebsrat begleitet – etwa "
        "Arbeitsschutzausschuss (§ 11 ASiG), Wirtschaftsausschuss (§§ 106–110), Gesamtbetriebsrat oder JAV/SBV. "
        "Der Betriebsrat selbst taucht hier bewusst nicht auf und bleibt wie gewohnt auf der Seite Sitzungen."
    )
    pdf.bild("gremien", "Gremien-Übersicht mit Fremdprotokollen und Sitzungen", hoehe_anteil=0.6)
    pdf.body(
        "Ein Klick auf eine Karte öffnet das Gremium: oben Rechtsgrundlage und Beschreibung (Stift zum "
        "Bearbeiten), darunter die Mitglieder und eine gemeinsame Zeitleiste aus Fremdprotokollen und "
        "eigenen Sitzungen des Gremiums, neueste zuerst. Ein Doppelklick öffnet ein Fremdprotokoll in "
        "einem neuen Fenster (PDF und Bilder; DOCX wird heruntergeladen). Daneben lässt es sich "
        "herunterladen, bearbeiten und löschen; ein Schloss kennzeichnet vertrauliche."
    )
    pdf.bild("gremium-detail", "Gremium mit Mitgliedern und Fremdprotokollen", hoehe_anteil=0.55)
    pdf.h3("Fremdprotokoll")
    pdf.body(
        "Für Gremien, die der Betriebsrat nicht selbst im System führt, wird ein fertiges Protokoll als "
        "Fremdprotokoll abgelegt – eine hochgeladene Datei mit Gremium, Datum und Titel, ohne eigene "
        "Tagesordnungspunkte oder Anwesenheitsliste. Eine Markierung als vertraulich beschränkt Ansicht "
        "und Download auf Vorsitz, Stellvertretung, Admin und die Mitglieder dieses Gremiums – etwa für "
        "Wirtschaftsausschuss-Protokolle, die nur dessen Mitglieder sehen sollen. Hochgeladen wird über "
        "„Fremdprotokoll hochladen“ – PDF, JPG, PNG oder DOCX, mit Datum, Titel und optionaler Bemerkung."
    )
    pdf.h3("Mitglieder")
    pdf.body(
        "Je Gremium lässt sich hinterlegen, wer dazugehört. Führt der Betriebsrat eine Sitzung dieses "
        "Gremiums doch im System (Tagesordnung, Protokoll, PDF wie gewohnt – über das Gremium-Feld beim "
        "Anlegen einer Sitzung), füllt BR-DMS die Anwesenheit automatisch mit diesen Mitgliedern statt mit "
        "allen Betriebsratsmitgliedern vor."
    )
    pdf.hinweis(
        "Ohne hinterlegte Mitglieder bleibt die Anwesenheitsliste einer Gremium-Sitzung leer und wird von "
        "Hand gepflegt – BR-DMS füllt dann nicht ersatzweise die Betriebsratsmitglieder ein.",
        "info")
    pdf.body(
        "Sowohl die Sitzungsliste als auch das Dokumentenarchiv lassen sich nach Gremium filtern; bei "
        "Dokumenten, die über einen TOP mit einer Gremium-Sitzung verknüpft sind, erscheint der Gremium-Name "
        "zusätzlich direkt bei „Behandelt in“."
    )

    # 5 ─────────────────────────────────────────────────────────────
    pdf.h1("5  Planung & Zusammenarbeit")
    pdf.h2("5.1  Aufgaben und Vorhaben")
    pdf.body(
        "Aufgaben haben Priorität, Fälligkeit, eine verantwortliche Person und können privat oder für "
        "alle sichtbar sein. Größere Vorhaben – etwa eine Wahl, eine Betriebsversammlung oder eine "
        "Verhandlungsphase – fassen mehrere Aufgaben über einen Zeitraum zusammen. Vorhaben lassen sich "
        "verschachteln und farblich kennzeichnen. Über den Filter oben zeigt die Seite alle Aufgaben, "
        "nur die ohne Vorhaben oder die eines bestimmten Vorhabens."
    )
    pdf.tabelle(
        ["Ansicht", "Wofür"],
        [
            ["Board", "Alle Aufgaben als Kanban (Neu, In Bearbeitung, Auf Hold, Erledigt), per Ziehen verschieben; das Vorhaben steht klein an der Karte"],
            ["Liste", "Aufgaben gruppiert nach Vorhaben, dazu die Aufgaben ohne Vorhaben; mit „+“ direkt eine Aufgabe im Vorhaben anlegen"],
            ["Zeitplan", "Vorhaben und ihre Aufgaben als Gantt-Diagramm über die Zeit"],
        ],
        (28, 142),
    )
    pdf.bild("aufgaben", "Board mit Aufgaben aus verschiedenen Vorhaben", hoehe_anteil=0.55)
    pdf.bild("aufgaben-liste", "Liste, gruppiert nach Vorhaben", hoehe_anteil=0.55)
    pdf.bild("aufgaben-zeitplan", "Zeitplan der Vorhaben", hoehe_anteil=0.55)
    pdf.hinweis(
        "Wird ein Vorhaben gelöscht, bleiben seine Aufgaben erhalten und stehen danach ohne Vorhaben da.",
        "info")
    pdf.h2("5.2  Themen-Backlog")
    pdf.body(
        "Im Themen-Backlog sammelt der Betriebsrat Ideen und Anliegen, bevor sie in eine Sitzung "
        "kommen. Ein Klick übernimmt ein Thema als TOP in die nächste Sitzung. Auch Anträge aus der "
        "Betriebsversammlung landen hier (Kapitel 4.6)."
    )
    pdf.bild("themen-backlog", "Themen-Backlog als Kanban-Board", hoehe_anteil=0.5)
    pdf.h2("5.3  Nachrichten")
    pdf.body(
        "Das interne Postfach verbindet die Mitglieder ohne externe Dienste. Nachrichten gehen an "
        "einzelne Mitglieder, an alle oder an die Teilnehmer einer Sitzung. Einladungen und Protokolle "
        "verschickt das System automatisch, auf Wunsch mit PDF-Anhang."
    )
    pdf.bild("posteingang", "Postfach mit Systemnachrichten und persönlichen Nachrichten", hoehe_anteil=0.45)
    pdf.h2("5.4  Kummerkasten")
    pdf.body(
        "Der Kummerkasten ist eine öffentliche Seite ohne Anmeldung, über die Beschäftigte dem "
        "Betriebsrat Anliegen, Kritik oder Ideen schicken – anonym oder mit Namen. Intern werden die "
        "Einträge mit Status und einer nur für den Betriebsrat sichtbaren Notiz bearbeitet. Für die "
        "Betriebsversammlung lassen sich Einträge als Fragen in die Tagesordnung übernehmen (Kapitel 4.6)."
    )
    pdf.bild("kummerkasten-oeffentlich", "Öffentliches Formular (ohne Login erreichbar)", ausschnitt="mitte")
    pdf.bild("kummerkasten-verwaltung", "Interne Bearbeitung der Kummerkasten-Einträge", hoehe_anteil=0.55)
    pdf.hinweis(
        "Das Formular speichert keine IP-Adresse und keinen Benutzerbezug. Gegen automatisierte "
        "Einsendungen schützen eine Mengenbegrenzung und ein unsichtbares Prüffeld.", "info", "Anonymität")

    pdf.h2("5.5  Wahlen (Betriebsrat und JAV)")
    pdf.body(
        "Unter Planung → Wahlen begleitet der Betriebsrat BR- und JAV-Wahlen. Den Ablauf verantwortet der "
        "Wahlvorstand; BR-DMS hilft, die Fristen im Blick zu behalten, die Wählerliste vorzubereiten und das "
        "Ergebnis zu übernehmen. Der Wahlvorstand braucht keinen eigenen Zugang."
    )
    pdf.hinweis(
        "Fristen, Altersgrenzen und Sitzzahlen sind aus BetrVG und Wahlordnung abgeleitet, aber nicht juristisch "
        "geprüft. Jede Frist nennt ihre Rechtsgrundlage; Empfehlungen ohne gesetzliche Frist sind gelb markiert. "
        "Vor dem Einsatz gegenlesen lassen (Gewerkschaft, Schulung des Wahlvorstands).", "achtung", "Gegenlesen")
    pdf.h3("Wahl anlegen und Fristen")
    pdf.body(
        "„Neue Wahl“: Art (BR oder JAV), Verfahren (normal oder vereinfacht), Tag der Stimmabgabe bzw. der "
        "Wahlversammlung, Ende der Amtszeit und – sobald bekannt – das Datum des Wahlausschreibens. Daraus "
        "berechnet BR-DMS die Fristen; sie erscheinen auf der Seite und im Fristenkalender und lassen sich dort "
        "abhaken. Ändern sich die Daten, werden die Fristen neu berechnet; Erledigt-Haken bleiben stehen. "
        "Optional entsteht ein Vorhaben im Zeitplan für eigene Aufgaben rund um die Wahl."
    )
    pdf.tabelle(
        ["Schritt", "Normales Verfahren", "Vereinfachtes Verfahren"],
        [
            ["Wahlvorstand bestellen", "BR 10, JAV 8 Wochen vor Amtszeitende", "4 Wochen vor Amtszeitende"],
            ["Wahlausschreiben", "spätestens 6 Wochen vor der Stimmabgabe", "Empfehlung: 3 Wochen vor der Versammlung"],
            ["Einspruch Wählerliste", "2 Wochen nach dem Ausschreiben", "3 Tage nach dem Ausschreiben"],
            ["Wahlvorschläge", "2 Wochen nach dem Ausschreiben", "1 Woche vor der Versammlung"],
            ["Konstituierende Sitzung (BR)", "binnen 1 Woche nach der Wahl", "binnen 1 Woche nach der Wahl"],
            ["Anfechtung", "2 Wochen ab Bekanntgabe", "2 Wochen ab Bekanntgabe"],
        ],
        (46, 62, 62),
    )
    pdf.bild("wahlen", "Wahl mit berechneten Fristen und Rechtsgrundlagen", hoehe_anteil=0.6)
    pdf.h3("Wählerliste und Gremiumsgröße")
    pdf.body(
        "Der Bereich „Wählerliste & Gremiumsgröße“ ermittelt aus den Mitarbeiterdaten zum Wahltag, wer "
        "wahlberechtigt und wählbar ist, wie groß das Gremium wird und wie viele Sitze dem Geschlecht in der "
        "Minderheit mindestens zustehen. Er schlägt auch das Verfahren vor. Dafür braucht es Geburtsdatum und "
        "Geschlecht der Beschäftigten – am einfachsten per CSV-Import aus der Liste der Personalabteilung (Kapitel 7.1)."
    )
    pdf.tabelle(
        ["", "BR-Wahl", "JAV-Wahl"],
        [
            ["Wahlberechtigt", "ab 16 (§ 7), Zeitarbeit nach mehr als 3 Monaten", "unter 18 oder Auszubildende unter 25 (§ 60)"],
            ["Wählbar", "ab 18, 6 Monate im Betrieb (§ 8)", "unter 25 (§ 61), keine BR-Mitglieder"],
            ["Größe", "§ 9", "§ 62"],
            ["Minderheitengeschlecht", "§ 15 – ab 3 Sitzen, Höchstzahlverfahren", "§ 62 Abs. 3 – ab 3 Sitzen"],
        ],
        (40, 65, 65),
    )
    pdf.bullets([
        "Dual Studierende – Schalter je JAV-Wahl, ob sie als Auszubildende zählen; ob das zutrifft, hängt vom Vertrag ab",
        "Ausschließen – Personen von Hand aus der Liste nehmen, z. B. leitende Angestellte",
        "Bitte prüfen – Fehlt ein Geburtsdatum, steht die Person in einer Prüfliste statt in der Wählerliste",
        "PDF zum Aushang – Getrennt nach Geschlechtern, alphabetisch, ohne Geburtsdaten",
        "CSV für den Wahlvorstand – Vollständige Liste mit Geburtsdaten",
    ])
    pdf.bild("wahlen-waehlerliste", "Wählerliste mit Gremiumsgröße und Verfahrensvorschlag", hoehe_anteil=0.6)
    pdf.h3("Ergebnis übernehmen")
    pdf.body(
        "Nach der Wahl überträgt „Ergebnis übernehmen“ das Protokoll des Wahlvorstands: die Gewählten in ihrer "
        "Rangfolge, erst die Mitglieder, dann die Ersatzmitglieder. Die Position ist der Wahlrang für das "
        "Nachrücken (Kapitel 4.3). Die Vorschau zeigt vor dem Speichern, was sich ändert, und warnt etwa, wenn "
        "die Mindestsitze unterschritten sind oder danach niemand Vorsitz ist."
    )
    pdf.bullets([
        "Konten – Bestehende Konten werden über den Namen erkannt; für neue Personen eine E-Mail-Adresse angeben. Das neue Konto hat ein Zufallspasswort, das der Vorsitz in der Benutzerverwaltung neu setzt",
        "Rollen – Mitglieder werden Mitglied, Ersatzmitglieder Ersatzmitglied; Vorsitz und Stellvertretung behalten ihre Rolle bis zur konstituierenden Sitzung. Bei der JAV-Wahl erhalten die Gewählten die Rolle JAV",
        "Nicht wiedergewählt – Auf Wunsch deaktivieren; sonst verlieren sie nur ihren Wahlrang",
        "Quote – Minderheitengeschlecht und Mindestsitze landen in den Einstellungen und gelten für das Nachrücken",
        "Konstituierende Sitzung – Wird mit der Standard-Tagesordnung angelegt (Kapitel 4.6)",
    ])
    pdf.bild("wahlen-ergebnis-uebernehmen", "Ergebnis übernehmen – Rangfolge, Stimmen und Geschlecht", hoehe_anteil=0.6)
    pdf.body("Das übernommene Ergebnis bleibt an der Wahl stehen – so sind frühere Wahlen jederzeit nachschlagbar.")

    # 6 ─────────────────────────────────────────────────────────────
    pdf.h1("6  Wissen & Recherche")
    pdf.h2("6.1  Wissensarchiv")
    pdf.body(
        "Das Wissensarchiv hält Erfahrungen und Lösungen für wiederkehrende Fragen fest – jeweils mit "
        "Sachverhalt und Lösung, Schlagworten und der Herkunft (manuell oder aus einem Protokoll übernommen). "
        "So geht Wissen auch bei einem Wechsel im Gremium nicht verloren."
    )
    pdf.bild("wissen", "Wissensarchiv mit Schlagworten", hoehe_anteil=0.5)
    pdf.h2("6.2  Ressourcen")
    pdf.body(
        "Eine gepflegte Linksammlung zu Gesetzen, Behörden, Vorlagen und Werkzeugen, mit Kategorien "
        "und Schlagworten. Das Symbol der Zielseite wird automatisch geladen."
    )
    pdf.bild("ressourcen", "Ressourcen nach Kategorien", hoehe_anteil=0.45)
    pdf.h2("6.3  Themensammlung")
    pdf.body(
        "Die Themensammlung bereitet Sitzungsergebnisse für die Belegschaft auf – für einen Aushang oder "
        "einen Newsletter. Sie sammelt alle TOPs aus protokollierten Sitzungen eines Zeitraums, deren Titel "
        "ein Stichwort enthält (Standard: „öffentlich“), und zeigt deren Ergebnis-Text. Am einfachsten "
        "bekommt jede Sitzung einen TOP wie „Öffentlichkeitsarbeit – Aushang an die Belegschaft“, in dessen "
        "Ergebnis der Text für die Belegschaft steht – ohne Namen und Vertrauliches."
    )
    pdf.bild("themensammlung", "Themensammlung mit zwei Aushangtexten", hoehe_anteil=0.5)
    pdf.bullets([
        "Zeitraum und Stichwort wählen, dann „Themen laden“",
        "Drucken – Die Zusammenstellung direkt ausdrucken, z. B. fürs Schwarze Brett",
        "HTML herunterladen – Fertig formatierte Datei, etwa zum Einfügen in einen Newsletter oder ins Intranet",
    ])
    pdf.h2("6.4  Globale Suche und Gesetzestexte")
    pdf.body(
        "Die Suche durchsucht alle Bereiche gleichzeitig – Dokumente samt PDF-Volltext, Sitzungen, TOPs "
        "und Beschlüsse, Aufgaben, Wissensarchiv, Ressourcen, Betriebsvereinbarungen, Schulungen, "
        "Mitarbeiter und Gesetzestexte – und gruppiert die Treffer nach Bereich."
    )
    pdf.bild("suche", "Suchergebnisse nach Bereichen gruppiert", hoehe_anteil=0.6)
    pdf.body(
        "Die Gesetzestexte (BetrVG, KSchG, ArbSchG, SGB IX, BUrlG, ArbZG) werden monatlich automatisch "
        "aktualisiert (Kapitel 9.8). Ein Klick auf einen Paragraphen – in der Suche oder in der Schnellsuche "
        "oben links – öffnet den Volltext als Fenster direkt in der Anwendung, ohne Internetverbindung."
    )
    pdf.bild("gesetz-popup", "Paragraph als Fenster: § 87 BetrVG aus der Suche nach „Pausen“", hoehe_anteil=0.6)

    # 7 ─────────────────────────────────────────────────────────────
    pdf.h1("7  Personal")
    pdf.body(
        "Die Personalverwaltung bildet die gesamte Belegschaft ab – unabhängig davon, wer einen Zugang "
        "zu BR-DMS hat. Sie ist ein optionales Modul und lässt sich abschalten (Kapitel 9.4)."
    )
    pdf.h2("7.1  Mitarbeiter")
    pdf.body(
        "Stammdaten mit Personalnummer, Abteilung, Standort, Ein- und Austritt sowie Beschäftigungsart "
        "(Mitarbeiter, Azubi, Student, dual Studierende, Zeitarbeit). Für Wahlen kommen Geburtsdatum und "
        "Geschlecht hinzu (Kapitel 5.5). Die Übersicht zeigt Kennzahlen und die Verteilung nach Standort."
    )
    pdf.h3("CSV-Import")
    pdf.body(
        "Der Import liest eine CSV-Datei (Semikolon oder Komma) mit Kopfzeile und zeigt vor dem Speichern eine "
        "Vorschau. Pflicht sind nur Nachname und Vorname, die Reihenfolge der Spalten ist egal: PNR, Nachname, "
        "Vorname, Abteilung, Eintritt, Austritt, Standort, Geburtsdatum, Geschlecht (oder Anrede). Vorhandene "
        "Mitarbeiter werden über die PNR erkannt und ergänzt; Geburtsdatum und Geschlecht aus der Liste der "
        "Personalabteilung ersetzen abweichende Werte, die Vorschau meldet jede Korrektur. Ungültige Daten "
        "werden mit Zeilennummer abgelehnt."
    )
    pdf.bild("mitarbeiter", "Mitarbeiterübersicht mit Kennzahlen", hoehe_anteil=0.6)
    pdf.h3("Filtern, bearbeiten und Standort für viele setzen")
    pdf.body(
        "Die Liste lässt sich nach Name oder Personalnummer, Abteilung, Standort und Beschäftigungsart "
        "filtern; „Nur aktive“ blendet Ausgetretene aus. Der Stift am Ende einer Zeile öffnet die "
        "Stammdaten zum Bearbeiten. Über die Kästchen vor den Namen werden mehrere Mitarbeiter markiert – "
        "das Kästchen im Tabellenkopf wählt alle gefilterten. Dann erscheint eine Leiste, in der ein "
        "Standort eingetragen und mit „Standort übernehmen“ für alle Markierten gesetzt wird."
    )
    pdf.bild("mitarbeiter-auswahl", "Drei markierte Mitarbeiter, Leiste zum Setzen des Standorts", hoehe_anteil=0.8)
    pdf.h2("7.2  Eingruppierung")
    pdf.body(
        "Die Seite Eingruppierung führt die Eingruppierungs-Historie je Mitarbeiter – Tarifgruppe und Stufe "
        "oder ein individuelles AT-Gehalt, jeweils mit „gültig ab“ und Bemerkung. Einträge, die aus einem "
        "Sitzungsbeschluss stammen, sind mit der Sitzung verknüpft."
    )
    pdf.bild("gehaltstabelle-liste", "Eingruppierung mit Historie und Bemerkungen", hoehe_anteil=0.6)
    pdf.body(
        "Die Seite hat vier Reiter: Überstunden und Zeitmodell (Kapitel 7.3), Liste und Statistik. In der "
        "Liste wird nach Abteilung, Mitarbeiter, Zeitraum und Beschäftigungsart gefiltert; „Neuer Eintrag“ "
        "erfasst eine Gehaltsstufe mit „gültig ab“. Das Personen-Symbol neben einem Namen öffnet dessen Stammdaten."
    )
    pdf.h3("CSV-Import")
    pdf.body(
        "„Vorlage (CSV)“ lädt eine leere Datei mit den richtigen Spalten herunter: PNR, Nachname, Vorname, "
        "Abteilung, Eintritt, Austritt, Gehaltsstufe, Gültig ab, Bemerkung. Ausgefüllt wird sie über "
        "„Import (CSV)“ eingelesen; eine Vorschau zeigt neue Mitarbeiter, neue Abteilungen und alle Einträge, "
        "bevor gespeichert wird. Einen Export der Gehaltsdaten gibt es bewusst nicht."
    )
    pdf.h3("Sichtschutz")
    pdf.body(
        "Sobald das Browserfenster den Fokus verliert – Wechsel in ein anderes Programm oder einen anderen "
        "Tab –, wird die Gehaltsliste unscharf geschaltet. Erst ein bewusster Klick auf „Ausgeblendet – "
        "klicken zum Anzeigen“ deckt sie wieder auf. So sieht niemand die Zahlen, der kurz ins Zimmer kommt "
        "oder über die Schulter schaut, wenn man gerade in ein anderes Fenster gewechselt ist."
    )
    pdf.bild("sichtschutz", "Sichtschutz: Liste nach einem Fensterwechsel verdeckt", hoehe_anteil=0.9)
    pdf.body(
        "Der Reiter Statistik zeigt Kennzahlen (Mitarbeiter mit Gehaltseintrag, Zahl je Beschäftigungsart, "
        "AT-Fälle mit Durchschnittsgehalt) und Kreuztabellen: Gruppe × Stufe, Gruppe × Zeitmodell, "
        "Standort × Gruppe, Mitarbeiter je Werk sowie je Abteilung eine Matrix aus Gruppe und Stufe."
    )
    pdf.bild("gehaltstabelle-statistik", "Statistik: Verteilung nach Gruppe und Zeitmodell", hoehe_anteil=0.6)
    pdf.h2("7.3  Zeitmodelle und Überstunden")
    pdf.body(
        "Zeitmodell und Überstundenregelung haben je eine eigene Historie mit echtem Gültigkeitszeitraum – "
        "von, bis oder unbefristet. Beide Reiter sind gleich aufgebaut: Filter nach Mitarbeiter, Abteilung "
        "und Beschäftigungsart, „Nur aktive“, und die Umschaltung zwischen Tabelle und Gantt. Die "
        "Gantt-Ansicht zeigt je Mitarbeiter einen Balken pro Zeitraum, gruppiert nach Abteilung; ein "
        "Doppelklick auf einen Balken öffnet ihn zum Bearbeiten. Eine Warnliste oben nennt Zeiträume, die in "
        "den nächsten 30 Tagen auslaufen."
    )
    pdf.h3("Überstunden")
    pdf.body(
        "Der erste Reiter der Eingruppierung. Mit „Neuer Zeitraum“ wird für einen Mitarbeiter festgehalten, "
        "welche Überstundenregelung ab wann gilt – als freier Text, z. B. „Gleitzeitkonto, Kappung bei 60 h“ "
        "oder „Mit AT-Gehalt pauschal abgegolten“, dazu eine Bemerkung."
    )
    pdf.bild("ueberstunden", "Überstundenregelungen je Mitarbeiter in der Tabellenansicht", hoehe_anteil=0.55)
    pdf.h3("Zeitmodell")
    pdf.body(
        "Hier wird das Arbeitszeitmodell (A, B, C oder D – was sich dahinter verbirgt, regelt die "
        "betriebliche Vereinbarung) mit Zeitraum geführt. "
        "Läuft ein Zeitmodell oder eine Überstundenregelung im laufenden Monat aus, erhalten Vorsitz und "
        "Stellvertretung am 15. eine Erinnerung (Kapitel 9.5)."
    )
    pdf.bild("gehaltstabelle-zeitmodell", "Zeitmodell-Historie mit Ablaufwarnung", hoehe_anteil=0.55)
    pdf.h2("7.4  Betriebsvereinbarungen")
    pdf.body(
        "Das Register führt alle Betriebsvereinbarungen mit Status (aktiv, gekündigt, abgelöst, befristet "
        "ausgelaufen), Geltungsbereich und Laufzeitende. Vor Ablauf erscheint ein Warnhinweis; das "
        "hinterlegte PDF ist verknüpft und im Volltext durchsuchbar."
    )
    pdf.bild("betriebsvereinbarungen", "Register der Betriebsvereinbarungen", hoehe_anteil=0.4)
    pdf.h2("7.5  Geschäftsordnung")
    pdf.body(
        "Nach § 36 BetrVG gibt sich der Betriebsrat eine schriftliche Geschäftsordnung – meist zu Beginn "
        "der Amtszeit, mit Regeln zu Einladungsfrist, Sitzungsrhythmus, Video-Teilnahme oder Protokoll. "
        "Unter Dokumente & Wissen → Geschäftsordnung liegen alle Fassungen mit Beschlussdatum, Bemerkung "
        "und verknüpftem PDF. Die Fassung mit dem jüngsten Beschlussdatum ist als „Aktuell gültig“ "
        "markiert, ältere bleiben als Nachweis erhalten."
    )
    pdf.schritt(1, "Neue Fassung erfassen",
                "Das PDF der beschlossenen Geschäftsordnung zuerst unter Dokumente hochladen (Kategorie "
                "„Geschäftsordnung“, 10 Jahre Aufbewahrung).")
    pdf.schritt(2, "Im Register eintragen",
                "„Neue Fassung“: Beschlussdatum, kurze Bemerkung (z. B. was sich geändert hat) und das "
                "Dokument auswählen. Die bisherige Fassung rückt automatisch nach unten.")
    pdf.body(
        "Lesen dürfen alle Mitglieder; anlegen, ändern und löschen nur Vorsitz und Stellvertretung. "
        "Ob der Beschluss wirksam zustande kam (Mehrheit der Mitglieder, § 36 BetrVG), prüft BR-DMS "
        "nicht – das Register ist reine Ablage."
    )
    pdf.bild("geschaeftsordnung", "Geschäftsordnung mit aktueller und abgelöster Fassung", hoehe_anteil=0.4)
    pdf.h2("7.6  Schulungen und Qualifikationsmatrix")
    pdf.body(
        "Schulungstermine werden mit Datum, Ort, Anbieter, Kosten, Status und Teilnehmenden erfasst. "
        "Daraus berechnet BR-DMS laufend die Qualifikationsmatrix – wer welche Qualifikation hat und wann "
        "sie abläuft (z. B. Ersthelfer alle 24 Monate)."
    )
    pdf.bild("schulungen", "Schulungstermine mit Status und Kosten", hoehe_anteil=0.5)

    # 8 ─────────────────────────────────────────────────────────────
    pdf.h1("8  Abläufe in der Praxis")
    pdf.h2("8.1  Vom Dokument zum Protokoll")
    pdf.body("Der typische Weg einer Anhörung nach § 99 durch das System:")
    pdf.schritt(1, "Dokument geht ein",
                "Per Upload oder automatisch über den Watch-Folder. Das System liest den Text aus, "
                "verschlüsselt die Datei, legt die Frist an und zeigt das Dokument im Eingang.")
    pdf.schritt(2, "Sichten und zuordnen",
                "Der Vorsitz prüft Kategorie und Frist, vergibt bei Bedarf ein Aktenzeichen und verknüpft "
                "das Dokument mit einem TOP der nächsten Sitzung.")
    pdf.schritt(3, "Vorbereiten",
                "Ein Mitglied erhält die Aufgabe, eine Stellungnahme vorzubereiten. Unterlagen hängen am TOP.")
    pdf.schritt(4, "Einladen",
                "Die Tagesordnung wird fixiert; alle Mitglieder erhalten Einladung und PDF.")
    pdf.schritt(5, "Beraten und beschließen",
                "In der Sitzung werden Anwesenheit, Beratungsergebnis und Beschluss mit Abstimmung erfasst.")
    pdf.schritt(6, "Abschließen",
                "Frist erledigen, Ein- oder Umgruppierung in die Eingruppierung übernehmen, Protokoll "
                "finalisieren. Bei Bedarf Widerspruchsschreiben aus dem Eingang erzeugen.")
    pdf.schritt(7, "Aufbewahren und löschen",
                "Das Dokument bleibt für die Dauer der Aufbewahrungsfrist erhalten und wird danach "
                "automatisch zur Löschung vorgemerkt und sicher gelöscht.")

    pdf.tabelle(
        ["Aufgabe", "Wer", "Wo im System"],
        [
            ["Eingang sichten", "Vorsitz / Stellvertretung", "Eingang"],
            ["Fristen im Blick behalten", "Vorsitz / Stellvertretung", "Dashboard, Fristenkalender"],
            ["Eigene Aufgaben bearbeiten", "Alle", "Aufgaben"],
            ["Nachrichten lesen", "Alle", "Nachrichten"],
            ["Kummerkasten bearbeiten", "Zuständige Mitglieder", "Kummerkasten"],
            ["Ablaufende BVs und Zeitmodelle prüfen", "Vorsitz", "Betriebsvereinbarungen, Eingruppierung"],
            ["Audit-Log prüfen", "Vorsitz / Admin", "Audit-Log"],
            ["Backups kontrollieren", "Admin", "Einstellungen → System"],
        ],
        (68, 50, 52),
        ueberschrift="8.2  Daily Business",
    )

    # ════════════════════════════════════════════════════════════════
    #  TEIL II – ADMINISTRATION
    # ════════════════════════════════════════════════════════════════
    pdf.teil("II", "Administration",
             "Einstellungen, Benutzer, Design und Module – für Vorsitz und Admin. "
             "Dazu die vollständige Übersicht der Rollen und Berechtigungen.")

    # 9 ─────────────────────────────────────────────────────────────
    pdf.h1("9  Einstellungen")
    pdf.body(
        "Die Einstellungen erreichen Sie über das Zahnrad oben rechts im Kopfbalken. Welche Reiter "
        "sichtbar sind, hängt von der Rolle ab."
    )
    pdf.tabelle(
        ["Reiter", "Inhalt"],
        [
            ["Löschfristen", "Aufbewahrungsfristen je Dokumentkategorie, Test der Erinnerungsmails"],
            ["Protokoll-Layout", "Kopf- und Fußzeile, Farbe, Logo und Unterschriftszeilen der PDFs"],
            ["Benutzerverwaltung", "Benutzer, Rollen, Wahlrang, ständige Vertretung, Geschlechterquote, "
                                   "Zugriff des Admins"],
            ["Design", "Farbschema, Schriftgröße, Hell/Dunkel"],
            ["System", "E-Mail-Absender, Watch-Folder, Backup-Übersicht, automatisches Abmelden, "
                       "Gefahrenzone (Admin)"],
            ["Module", "Optionale Bereiche ein- und ausschalten (nur Admin)"],
            ["Gesetzestexte", "Stand der Gesetzesdatenbank, manuelles Aktualisieren (nur Admin)"],
            ["Amtsübergabe", "PDF mit Mitgliederliste, aktiven Dokumenten und Beschlussregister"],
        ],
        (40, 130),
    )

    pdf.h2("9.1  Benutzer und Gremium")
    pdf.body(
        "Hier werden die Zugänge angelegt. Für die Nachrück-Logik werden zusätzlich Geschlecht und Wahlrang "
        "aus dem Wahlprotokoll hinterlegt sowie Minderheitengeschlecht und Mindestsitze nach § 15 Abs. 2 BetrVG. "
        "Ein Ersatzmitglied kann einem Mitglied als ständige Vertretung zugeordnet werden."
    )
    pdf.bild("benutzer", "Benutzerverwaltung mit Geschlechterquote und Wahlrang", hoehe_anteil=0.6)
    pdf.bullets([
        "Anlegen – Name, E-Mail, Rolle; das Passwort wird beim ersten Login geändert",
        "Deaktivieren – Zugang sperren, ohne Historie zu verlieren",
        "Passwort zurücksetzen – Durch Vorsitz oder Admin, alternativ per E-Mail-Link durch die Person selbst",
        "Adresse für Einladungen – Zweitadresse unter der E-Mail (z. B. br-name@…); leer = Hauptadresse. Angemeldet wird immer mit der Hauptadresse",
    ])

    pdf.h2("9.2  Zugriff des Admins auf Inhalte")
    pdf.body(
        "Standardmäßig darf der Admin alles, was auch der Vorsitz darf. Betreut jemand außerhalb des Gremiums "
        "die Technik – etwa die IT-Abteilung –, stellen Vorsitz oder Stellvertretung unter Benutzerverwaltung "
        "auf „Nur technische Verwaltung“ um. Der Admin selbst kann diese Einstellung nicht ändern; jede "
        "Änderung steht im Audit-Log."
    )
    pdf.tabelle(
        ["Der Admin …", "Nur technische Verwaltung"],
        [
            ["verwaltet Benutzer, Einstellungen, Design, Module", "Ja"],
            ["aktualisiert Gesetzestexte, sieht Backups", "Ja"],
            ["liest und schreibt eigene Nachrichten", "Ja"],
            ["sieht Sitzungen, Dokumente, Fristen, Aufgaben, Wahlen", "Nein"],
            ["sieht Mitarbeiter, Eingruppierung, Betriebsvereinbarungen", "Nein"],
            ["sieht Audit-Log, Suche, Amtsübergabe", "Nein"],
            ["setzt Passwörter anderer zurück, ändert die eigene Rolle", "Nein"],
        ],
        (120, 50),
    )
    pdf.bild("admin-ohne-inhalt", "Ansicht des Admins ohne Inhaltszugriff", hoehe_anteil=0.6)
    pdf.hinweis(
        "Neue Benutzerkonten darf der Admin weiter anlegen – sonst könnte er seine Aufgabe nicht erfüllen. "
        "Damit er sich nicht unbemerkt ein Zweitkonto mit Gremiumsrolle anlegt, erhalten Vorsitz und "
        "Stellvertretung bei jedem neuen Konto eine Nachricht. Wer Zugriff auf Server oder Datenbank hat, "
        "kann technisch immer an die Daten – die Einstellung regelt den Zugang über die Anwendung.",
        "achtung", "Grenzen")

    pdf.h2("9.3  Design")
    pdf.body(
        "Ein Klick auf ein Farbschema setzt alle Farben auf einmal; „Board“ ist der Standard, „Board Rot“ "
        "nutzt die rote Akzentfarbe. Einzelne Farben, Schriftgröße und Hell-/Dunkelmodus lassen sich "
        "anpassen. Das Design gilt für alle Benutzer und auch auf der Anmeldeseite und im Kummerkasten."
    )
    pdf.bild("einstellungen-design", "Design-Einstellungen mit Farbschemata", hoehe_anteil=0.75)

    pdf.h2("9.4  Module")
    pdf.body(
        "Nicht jeder Betriebsrat braucht alles. Diese Bereiche lassen sich abschalten; sie verschwinden "
        "dann aus der Seitenleiste, Direktaufrufe führen zum Dashboard. Die Daten bleiben erhalten."
    )
    pdf.tabelle(
        ["Modul", "Umfasst"],
        [
            ["Personalverwaltung", "Mitarbeiter, Eingruppierung, Zeitmodelle, Überstunden, Schulungen"],
            ["Betriebsvereinbarungen", "Das BV-Register"],
            ["Gremien", "Andere Gremien, Mitglieder, Fremdprotokolle"],
            ["Wissensarchiv", "Wissenseinträge"],
            ["Ressourcen", "Linksammlung"],
            ["Themensammlung", "Export öffentlicher TOPs"],
        ],
        (50, 120),
    )
    pdf.bild("einstellungen-module", "Module ein- und ausschalten (Admin)", hoehe_anteil=0.55)

    pdf.h2("9.5  Löschfristen und Erinnerungsmails")
    pdf.body(
        "Der Reiter legt je Dokumentkategorie fest, nach wie vielen Tagen ein Dokument zur Löschung "
        "vorgemerkt wird; „Bearbeiten“ in der Zeile ändert die Frist, „Angepasst“ zeigt Abweichungen vom "
        "Standard. Änderungen gelten nur für neu hochgeladene Dokumente – bestehende behalten ihr Löschdatum, "
        "das sich je Dokument im Bearbeiten-Dialog ändern lässt."
    )
    pdf.bild("einstellungen-fristen", "Aufbewahrungsfristen je Dokumentkategorie", hoehe_anteil=0.5)
    pdf.tabelle(
        ["Kategorie", "Standard-Aufbewahrung"],
        [
            ["Anhörung § 99 / § 102", "5 Jahre"],
            ["Abmahnung", "3 Jahre"],
            ["Bewerbung", "90 Tage"],
            ["Bewerbung (Alternativ)", "30 Tage"],
            ["Zeitmodell § 87", "5 Jahre"],
            ["Information des Arbeitgebers, Arbeitsschutz, Schriftverkehr", "5 Jahre"],
            ["Protokoll", "4 Jahre"],
            ["Betriebsvereinbarung", "10 Jahre"],
            ["Sonstiges", "5 Jahre"],
        ],
        (100, 70),
    )
    pdf.body(
        "Darunter stehen zwei Erinnerungsmails, die das System selbst verschickt. Mit „Jetzt testen“ lässt "
        "sich jede sofort auslösen, statt auf den nächsten Termin zu warten:"
    )
    pdf.bullets([
        "Fristen-Erinnerung – Täglich um 7:00 Uhr an Vorsitz und Stellvertretung, aber nur, wenn in den nächsten 7 Tagen Fristen fällig werden",
        "Zeitmodell-/Überstunden-Ablauf – Monatlich am 15. um 7:00 Uhr, wenn im laufenden Monat Zeiträume auslaufen",
    ])
    pdf.body(
        "Die tägliche Fristen-Erinnerung lässt sich mit dem Schalter „Automatischer Versand“ pausieren, "
        "etwa während der Betriebsferien. „Jetzt testen“ funktioniert auch im pausierten Zustand."
    )

    pdf.h2("9.6  Protokoll-Layout")
    pdf.body(
        "Hier wird das Aussehen der Sitzungs-PDFs festgelegt – Tagesordnungen, Einladungen, Protokolle "
        "und Niederschriften. Bestehende PDFs behalten ihr Aussehen, bis sie in der Sitzung "
        "neu generiert werden (Kapitel 4.4)."
    )
    pdf.bild("einstellungen-protokoll", "Logo und Anordnung von Kopf- und Fußzeile", hoehe_anteil=0.5)
    pdf.bullets([
        "Logo – PNG oder JPG bis 2 MB; ohne Logo erscheint ein farbiger Balken",
        "Layout – Logo links, rechts oder kein Logo; in der Fußzeile Bezeichnung links und Seitenzahl rechts oder umgekehrt",
        "Kopfzeile & Farbe – Kopfzeile groß (z. B. „Betriebsrat“), Unterzeile klein (z. B. die Firma) und die Akzentfarbe",
        "Fußzeile & Unterschriften – Fußzeilentext, Bezeichnung der Unterschriftszeilen für Vorsitz und Zeuge/Zeugin sowie der Ort vor dem Datum (leer = nur Datum)",
    ])

    pdf.h2("9.7  System")
    pdf.bild("einstellungen-system", "E-Mail-Absender und Watch-Folder", hoehe_anteil=0.6)
    pdf.bullets([
        "E-Mail-Absender – Name und Adresse für alle Mails (ohne Eintrag gilt SMTP_FROM) und die Signatur unter Einladungen. Ein Hinweis erscheint, solange kein Mailserver eingerichtet ist",
        "Watch-Folder – Ob die Ordnerüberwachung läuft, der Basispfad, welcher Unterordner zu welcher Kategorie gehört (Kapitel 12.6) und die letzten Importe mit Fehlermeldung",
        "Backup & Restore – Anzahl, Alter, Größe und Vollständigkeit der Backups; dazu die Hinweise zum Schlüssel und zur Wiederherstellung (Kapitel 13.2)",
        "Sicherheit – Automatisches Abmelden nach 0 bis 480 Minuten Inaktivität (0 = aus)",
    ])
    pdf.h3("Gefahrenzone – Eingruppierung")
    pdf.body(
        "Nur für den Admin. „Nur Gehaltsstufen-Einträge löschen“ entfernt alle Gehaltsstufen, Mitarbeiter und "
        "Abteilungen bleiben – gedacht für einen fehlerhaften Import. „Eingruppierung komplett löschen“ "
        "entfernt zusätzlich alle Mitarbeiter und Abteilungen, etwa für einen Neustart nach Testdaten. Beide "
        "Knöpfe werden erst aktiv, wenn „LÖSCHEN“ eingetippt ist, und sind nicht umkehrbar."
    )
    pdf.bild("einstellungen-gefahrenzone", "Gefahrenzone mit Bestätigung durch Eintippen")
    pdf.hinweis(
        "Vor dem Löschen ein Datenbank-Backup ziehen (./backup.sh, Kapitel 13.2) – aus der App heraus "
        "gibt es bewusst keinen Export der Gehaltsdaten.", "achtung", "Vorher sichern")

    pdf.h2("9.8  Gesetzestexte")
    pdf.body(
        "Nur für den Admin. Die Tabelle zeigt je Gesetz die Zahl der Paragraphen und den Stand des letzten "
        "Imports von gesetze-im-internet.de. Der Import läuft automatisch am 1. jedes Monats um 3:00 Uhr; "
        "„Jetzt aktualisieren“ startet ihn sofort. „Automatischen Ablauf testen“ führt genau den nächtlichen "
        "Ablauf aus – einschließlich der Nachricht an Vorsitz und Stellvertretung, falls sich an einem bereits "
        "bekannten Paragraphen wirklich etwas geändert hat."
    )
    pdf.bild("einstellungen-gesetze", "Stand der Gesetzestexte", hoehe_anteil=0.5)

    pdf.h2("9.9  Amtsübergabe")
    pdf.body(
        "Für Vorsitz, Stellvertretung und Admin. „PDF öffnen“ erzeugt eine lesbare Übersicht als Grundlage "
        "für das Übergabegespräch an eine neue Vorsitzende oder einen neuen Vorsitzenden – kein "
        "vollständiger Datenexport."
    )
    pdf.bild("einstellungen-amtsuebergabe", "Amtsübergabe: Inhalt des PDFs und Ablauf", hoehe_anteil=0.6)
    pdf.tabelle(
        ["Im PDF enthalten", "Bleibt im System"],
        [
            ["Aktive BR-Mitglieder mit E-Mail und Rolle", "Dokument-Dateien selbst (nur Titel und Metadaten im PDF)"],
            ["Aktive Dokumente nach Kategorie mit Aktenzeichen, offenen Fristen und Status", "Protokolle im Volltext"],
            ["Beschlussregister mit Sitzung/TOP, Antrag, Ergebnis und Rechtsgrundlage", "Aufgaben, Themen-Backlog, Eingruppierung, Schulungen, BVs, Wissen, Audit-Log"],
        ],
        (85, 85),
    )
    pdf.schritt(1, "Neue Zugänge anlegen", "Neue/n Vorsitzende/n bzw. Stellvertretung in der Benutzerverwaltung mit passender Rolle anlegen.")
    pdf.schritt(2, "Übergabe besprechen", "Dieses PDF exportieren und im Übergabegespräch gemeinsam durchgehen.")
    pdf.schritt(3, "Alte Zugänge deaktivieren", "Ausscheidende deaktivieren, nicht löschen – die Historie bleibt nachvollziehbar.")
    pdf.schritt(4, "Technik separat übergeben", "NAS-Zugang, Docker und Datenbank-Zugangsdaten liegen außerhalb der App und werden sicher getrennt weitergegeben.")
    pdf.schritt(5, "Sichern", "Für eine vollständige technische Sicherung ein Datenbank-Backup erstellen (Kapitel 13.2).")

    pdf.h2("9.10  Audit-Log")
    pdf.body(
        "Das Audit-Log protokolliert unveränderlich alle sicherheitsrelevanten Vorgänge – Anmeldungen, "
        "Dokumentzugriffe, Änderungen an Sitzungen, Benutzern und Einstellungen – mit Zeitpunkt, Person, "
        "IP-Adresse und Browser. Einsehbar für Vorsitz, Stellvertretung und Admin, filterbar nach Person, Aktion und Zeitraum."
    )
    pdf.bild("audit", "Audit-Log mit Filtern", hoehe_anteil=0.55)

    # 10 ────────────────────────────────────────────────────────────
    pdf.h1("10  Rollen & Berechtigungen")
    pdf.body(
        "Jede Aktion wird im Backend gegen die Rolle geprüft – auch wenn jemand versucht, eine Seite direkt "
        "aufzurufen. Die Tabelle zeigt die wichtigsten Rechte."
    )
    j, n, v = "Ja", "–", "Vertr."
    pdf.tabelle(
        ["Berechtigung", "Vorsitz", "Stellv.", "Mitglied", "Ersatz", "JAV", "SBV", "Admin"],
        [
            ["Dokumente lesen", j, j, j, j, n, n, j],
            ["Dokumente hochladen und bearbeiten", j, j, j, v, n, n, j],
            ["Vertrauliche Dokumente anderer", j, j, n, n, n, n, j],
            ["Eingang bearbeiten", j, j, n, n, n, n, j],
            ["Sitzungen und Protokolle lesen", j, j, j, j, j, j, j],
            ["Vertrauliche TOPs sehen", j, j, j, j, n, n, j],
            ["TOPs bearbeiten", j, j, j, v, n, n, j],
            ["Sitzung anlegen, fixieren, finalisieren", j, j, n, n, n, n, j],
            ["Beschlüsse erfassen und finalisieren", j, j, n, n, n, n, j],
            ["Eingruppierung bearbeiten", j, j, j, v, n, n, j],
            ["Mitarbeiter- und Wählerliste einsehen, Mitarbeiter anlegen", j, j, j, v, n, n, j],
            ["Mitarbeiter-Stammdaten ändern, importieren, löschen", j, j, n, n, n, n, j],
            ["Kummerkasten lesen und bearbeiten", j, j, j, j, n, n, j],
            ["Betriebsvereinbarungen anlegen", j, j, n, n, n, n, j],
            ["Geschäftsordnung pflegen", j, j, n, n, n, n, j],
            ["Gremien, Mitglieder und Fremdprotokolle verwalten", j, j, n, n, n, n, j],
            ["Benutzer verwalten, Design ändern", j, j, n, n, n, n, j],
            ["Audit-Log einsehen", j, j, n, n, n, n, j],
            ["Module ein-/ausschalten", n, n, n, n, n, n, j],
        ],
        (57, 17, 16, 17, 16, 13, 13, 16),
    )
    pdf.body(
        "„Vertr.“ = nur solange das Ersatzmitglied aktiv als Vertretung eingetragen ist, sonst lesend – "
        "Mitarbeiter- und Wählerliste mit ihren Personaldaten sieht es ohne aktive Vertretung gar nicht. "
        "Die Rollen JAV und SBV dürfen ausschließlich Sitzungen und Protokolle lesen. Beide nehmen an "
        "Sitzungen beratend teil (§ 67 BetrVG, § 178 Abs. 4 SGB IX), werden automatisch geladen, in "
        "Einladung, Unterschriftenliste und Sitzungspaket als eigene Gruppe geführt und sehen in der "
        "Sidebar nur „Sitzungen“. Vertrauliche TOPs bleiben für sie überall verborgen – auch Beschlüsse, "
        "Abstimmung und TOP-Auszug dazu. Das vollständige Protokoll-PDF und das Sitzungspaket erhalten sie nur "
        "für Sitzungen ohne vertrauliche TOPs."
    )
    pdf.hinweis(
        "Admin gehört nicht zum Gremium: Er taucht nicht auf Anwesenheitslisten auf und nimmt nicht an "
        "Abstimmungen teil. Die Spalte zeigt den Standard – haben Vorsitz oder Stellvertretung den Admin "
        "auf die technische Verwaltung beschränkt, gilt für ihn bei allen Inhalten „–“ (Kapitel 9.2).", "info")

    # ════════════════════════════════════════════════════════════════
    #  TEIL III – TECHNIK
    # ════════════════════════════════════════════════════════════════
    pdf.teil("III", "Technik",
             "Architektur, Sicherheit, Installation, Betrieb und Datenbank – für die "
             "technische Betreuung der Installation.")

    # 11 ────────────────────────────────────────────────────────────
    pdf.h1("11  Architektur & Sicherheit")
    pdf.h2("11.1  Aufbau")
    pdf.body(
        "BR-DMS besteht aus vier Docker-Containern in einem eigenen Netz. Von außen erreichbar ist "
        "ausschließlich der HTTPS-Proxy; Frontend, Backend und Datenbank haben keine eigenen Ports."
    )
    pdf.tabelle(
        ["Container", "Technologie", "Aufgabe"],
        [
            ["proxy", "Nginx 1.30", "TLS-Terminierung, einziger Zugang (Port 8443, 8080 leitet um)"],
            ["frontend", "React 18, Vite, Tailwind CSS (über Nginx)", "Benutzeroberfläche im Browser"],
            ["backend", "Node.js 24, Fastify 5, Prisma", "REST-API, Geschäftslogik, PDF-Erzeugung, Hintergrundjobs"],
            ["postgres", "PostgreSQL 16", "Datenhaltung, nur im internen Docker-Netz"],
        ],
        (26, 62, 82),
    )
    pdf.body(
        "Hintergrundjobs im Backend erinnern an Fristen, legen Wiedervorlagen zurück in den Eingang, "
        "warnen vor ablaufenden Regelungen, aktualisieren monatlich die Gesetzestexte und löschen "
        "Dokumente nach Ablauf der Aufbewahrungsfrist."
    )
    pdf.h2("11.2  Sicherheit")
    pdf.body(
        "BR-DMS schützt die Daten in mehreren Schichten: Netz und Container, Anmeldung und Rechte in der "
        "Anwendung, Verschlüsselung der Daten und verschlüsselte Backups. Dazu kommt, was organisatorisch "
        "geregelt sein muss – denn wer den Server selbst verwaltet, steht technisch über jeder Anwendung."
    )

    pdf.h3("Netz und Container")
    pdf.tabelle(
        ["Mechanismus", "Umsetzung"],
        [
            ["Ein einziger Zugang", "Nur der Proxy (Nginx) hat Ports zum Host: HTTPS (Standard 8443) und HTTP, das "
             "ausschließlich auf HTTPS umleitet. Frontend, Backend und Datenbank haben keine eigenen Ports"],
            ["Datenbank abgeschottet", "PostgreSQL ist nur im internen Docker-Netz von BR-DMS erreichbar, "
             "nicht vom NAS oder aus dem Firmennetz"],
            ["Transport", "TLS 1.2 und 1.3; eigenes Zertifikat (selbstsigniert oder von der Firmen-CA, Kapitel 12.4)"],
            ["Intranet-Betrieb", "Gedacht für das interne Netz; eine Freigabe ins Internet ist nicht vorgesehen"],
            ["Ohne Root-Rechte", "Das Backend läuft als eigener, nicht privilegierter Benutzer (PUID/PGID)"],
            ["Nur lesend eingebunden", "Zertifikate, Proxy-Konfiguration und Backup-Ordner sind im Container "
             "schreibgeschützt eingebunden"],
        ],
        (40, 130),
    )

    pdf.h3("Anmeldung und Rechte")
    pdf.tabelle(
        ["Mechanismus", "Umsetzung"],
        [
            ["Passwörter", "scrypt-Hash mit Salt, mindestens 8 Zeichen; Vergleich in konstanter Zeit"],
            ["Anmeldeversuche", "Höchstens 10 Versuche in 10 Minuten, danach gesperrt"],
            ["Sitzungsdauer", "Token 24 Stunden („eingeloggt bleiben“) bzw. 1 Stunde; automatisches Abmelden "
             "nach Inaktivität einstellbar (Kapitel 9.7)"],
            ["Herkunft", "Die Schnittstelle nimmt Anfragen nur von der eigenen Adresse (APP_URL) an"],
            ["Rollen", "Jede Schnittstelle prüft die Rolle auf dem Server, nicht nur die Oberfläche (Kapitel 10)"],
            ["Vertrauliches", "Eine zentrale Regel: Vorsitz, Stellvertretung und Admin sehen alles Vertrauliche, "
             "andere nur eigene Uploads bzw. Fremdprotokolle ihres Gremiums"],
            ["JAV und SBV", "Nur Sitzungen und Protokolle, vertrauliche TOPs ausgeblendet – zentral gesperrt"],
            ["Admin ohne Inhalte", "Betreut die IT die Technik, kann der Vorsitz den Admin auf die Verwaltung "
             "beschränken (Kapitel 9.2)"],
            ["Sichtschutz", "Personal- und Gehaltslisten werden beim Fensterwechsel verdeckt (Kapitel 7)"],
            ["Audit-Log", "Über 50 Aktionstypen mit Zeitpunkt, Person, IP-Adresse und Browser (Kapitel 9.10)"],
            ["Rollentests", "Automatische Tests prüfen alle Schnittstellen je Rolle gegen eine leere Test-Datenbank – "
             "vor jedem Update (deploy_update.sh) und bei jeder Änderung auf GitHub; ein Stand mit falschen "
             "Rechten wird nicht eingespielt"],
        ],
        (40, 130),
    )

    pdf.h3("Daten")
    pdf.tabelle(
        ["Mechanismus", "Umsetzung"],
        [
            ["Dokumente", "Jede Datei einzeln mit AES-256-GCM verschlüsselt, mit eigenem, per scrypt aus dem "
             "ENCRYPTION_KEY abgeleiteten Schlüssel; GCM erkennt Manipulationen, dazu eine SHA-256-Prüfsumme"],
            ["Fremdprotokolle, Scans", "Ebenso verschlüsselt wie Dokumente"],
            ["Protokolle", "Finalisierte Versionen sind unveränderlich und tragen eine SHA-256-Prüfsumme"],
            ["Löschen", "Aufbewahrungsfristen je Kategorie löschen automatisch; Dateien werden vor dem "
             "Löschen überschrieben"],
            ["Datenbank", "Metadaten, Protokolltexte, Personaldaten und der Suchtext der Dokumente liegen "
             "in der Datenbank unverschlüsselt – geschützt durch das abgeschottete Netz und die Rechte auf "
             "dem NAS; zusätzlich ist die Volume-Verschlüsselung des NAS möglich"],
        ],
        (40, 130),
    )

    pdf.h3("Backups")
    pdf.tabelle(
        ["Mechanismus", "Umsetzung"],
        [
            ["Verschlüsselt", "Mit BACKUP_KEY verschlüsselt backup.sh Datenbank-Dump und Dokumenten-Archiv "
             "komplett mit AES-256 (256-Bit-Schlüssel), ohne Klartext-Zwischendatei (Kapitel 13.2)"],
            ["Schlüssel", "Der BACKUP_KEY ist ein 256-Bit-Zufallswert; der eigentliche Schlüssel wird per "
             "PBKDF2 (HMAC-SHA256, 600.000 Durchläufe, eigener Zufalls-Salt je Datei) daraus abgeleitet – "
             "das macht systematisches Durchprobieren praktisch aussichtslos"],
            ["Kopie bei Dritten", "So verschlüsselt kann eine Kopie z. B. bei der IT liegen, ohne dass sie "
             "lesbar ist – den Schlüssel hat nur der Betriebsrat"],
            ["Prüfung", "restore.sh prüft den Schlüssel, bevor etwas überschrieben wird; Einstellungen → "
             "System warnt bei unverschlüsselten Backups"],
            ["Aufbewahrung", "30 Tage rollierend auf dem NAS"],
        ],
        (40, 130),
    )
    pdf.bullets([
        "RAID ist kein Backup – RAID 1 schützt nur gegen den Ausfall einer Platte. Löschen, Verschlüsselungstrojaner, "
        "ein Defekt des NAS oder ein Brand treffen beide Platten. Deshalb: Snapshots auf dem NAS und eine "
        "verschlüsselte Kopie an einem anderen Ort",
        "Wiederherstellung üben – Ein Backup gilt erst als Backup, wenn es einmal auf einem anderen System "
        "eingespielt wurde",
    ])

    pdf.h3("Organisatorisch")
    pdf.bullets([
        "Schlüssel – ENCRYPTION_KEY und BACKUP_KEY ausdrucken und außerhalb des NAS verschlossen aufbewahren. "
        "Ohne sie sind Dokumente bzw. Backups nicht wiederherstellbar",
        "Server-Administration – Die Schlüssel stehen in der .env auf dem NAS. Wer Administrator des NAS ist, "
        "kommt technisch an alle Daten. Deshalb nur Vorsitz und Stellvertretung als Admins (Kapitel 11.3); "
        "hilft die IT, dann nur gemeinsam mit einem Admin (Vier-Augen-Prinzip)",
        "Freigaben auf dem NAS – Den Datenordner von BR-DMS nicht als Netzwerkfreigabe anbieten. Freigaben "
        "für die Mitglieder (Arbeitsfreigabe, Watch-Folder) liegen getrennt davon (Kapitel 11.3)",
        "Updates – Neue Stände zuerst in der Demo prüfen, dann einspielen (Kapitel 13.1)",
    ])
    pdf.hinweis(
        "In Prüfung: Anmeldung mit zweitem Faktor (Einmalcode per Authenticator-App) – BR-DMS läuft nur im "
        "Intranet, ob er dort nötig ist, ist noch offen. Geplant: Abmelden und Passwortwechsel machen bereits "
        "ausgestellte Anmelde-Tokens sofort ungültig (bisher gelten sie bis zum Ablauf, höchstens 24 Stunden).",
        "info", "Geplant")

    pdf.h2("11.3  Den Server (NAS) absichern")
    pdf.body(
        "BR-DMS ist nur so sicher wie der Server, auf dem es läuft. Wer das NAS administriert, kommt an "
        "alles: die .env mit ENCRYPTION_KEY und BACKUP_KEY, die Datenbank und die Backups. Keine Anwendung "
        "kann davor schützen. Deshalb gilt: so wenige Admins wie möglich – und nur aus dem Betriebsrat. "
        "Gemeint sind hier die Konten des NAS, nicht die Rollen in BR-DMS (Kapitel 10)."
    )

    pdf.h3("Wer darf was auf dem NAS?")
    pdf.tabelle(
        ["Wer", "Rechte auf dem NAS"],
        [
            ["Vorsitz und Stellvertretung", "Im Alltag ein normales Konto ohne Admin-Rechte wie die Mitglieder. "
             "Für die Verwaltung (Container, Updates, Einstellungen) ein getrenntes Admin-Konto mit zweitem "
             "Faktor, das nur dafür benutzt wird. Sonst hat niemand Admin-Rechte"],
            ["Mitglieder", "Normales Konto ohne Admin-Rechte, nur für die Arbeitsfreigabe (Zeitschriften, "
             "Tabellen, Arbeitsdokumente, auch für die Datei-Links aus Kapitel 12.8) und ggf. den "
             "Watch-Folder. Kein Zugriff auf den Datenordner von BR-DMS, die Backups oder die Container"],
            ["IT", "Kein Konto. Sie erhält nur die verschlüsselte Backup-Kopie; Hilfe am NAS nur gemeinsam "
             "mit einem Admin (Vier-Augen-Prinzip)"],
        ],
        (44, 126),
    )
    pdf.hinweis(
        "Wer Container starten darf, kann jeden Ordner des NAS in einen Container einbinden und damit alles "
        "lesen. Zugriff auf Docker bzw. die Container Station ist deshalb gleichbedeutend mit Admin-Rechten "
        "und gehört nur in die Hände der Admins.", "achtung", "Docker = Admin")

    pdf.h3("Checkliste")
    pdf.tabelle(
        ["Maßnahme", "Warum"],
        [
            ["Standardkonto „admin“ deaktivieren, getrenntes Verwaltungskonto mit eigenem Namen anlegen",
             "„admin“ ist das Erste, was Angreifer ausprobieren"],
            ["Im Alltag ohne Admin-Rechte arbeiten, das Verwaltungskonto nur zum Verwalten benutzen",
             "Ein Trojaner auf dem Arbeits-PC bekommt dann höchstens die Rechte eines normalen Kontos"],
            ["Lange Passphrase (ab etwa 20 Zeichen) und zweiter Faktor (Authenticator-App) für das "
             "Verwaltungskonto",
             "Ein erratenes oder abgefangenes Passwort allein reicht dann nicht. Nutzen zwei Personen das "
             "Konto, den QR-Code bei der Einrichtung auf beiden Handys scannen"],
            ["Kein Zugang aus dem Internet: Cloud-Dienst des Herstellers (z. B. myQNAPcloud, QuickConnect), "
             "UPnP und Portfreigaben im Router aus",
             "Erpressungstrojaner gegen NAS-Geräte kamen fast immer über aus dem Internet erreichbare Geräte"],
            ["Firmware und Apps zeitnah aktualisieren",
             "Die bekannten Angriffe nutzten Lücken, für die es längst Updates gab"],
            ["Optional: Verwaltungsoberfläche per Firewall nur von den Rechnern der Admins erreichbar",
             "Sinnvoll in großen Firmennetzen; sonst kann jeder im Netz den Login ausprobieren"],
            ["Automatische Sperre nach Fehlversuchen einschalten",
             "Bremst das Durchprobieren von Passwörtern"],
            ["Den Dateien von BR-DMS das Verwaltungskonto als Besitzer geben (PUID) und eine Gruppe nur "
             "für Admins (PGID), nicht „users“ bzw. „everyone“; die .env nur für den Besitzer lesbar "
             "(chmod 600). Der Installationsassistent schlägt beides vor",
             "In „users“ bzw. „everyone“ sind alle Konten des NAS – auch die der Mitglieder"],
            ["Arbeitsfreigabe und Datenordner von BR-DMS strikt trennen; den Datenordner (DATA_PATH) und "
             "die Backups nie als Freigabe anbieten",
             "Was in BR-DMS liegt, schützen Rollen und Verschlüsselung – eine Freigabe würde beides umgehen"],
            ["Freigaben nur über SMB 3, SMB 1 abschalten",
             "SMB 1 ist veraltet und war Einfallstor für Trojaner wie WannaCry"],
            ["SSH nur bei Bedarf einschalten, am besten nur mit Schlüssel",
             "Weniger Angriffsfläche im Alltag"],
            ["Snapshots einrichten",
             "Schreibgeschützte Stände helfen gegen Löschen und Verschlüsselungstrojaner (Kapitel 13.2)"],
            ["Sicherheitsprüfung des NAS regelmäßig laufen lassen (QNAP: Security Counselor, "
             "Synology: Sicherheitsberater)",
             "Findet unsichere Einstellungen, die sich mit der Zeit eingeschlichen haben"],
            ["Zugangsdaten des Verwaltungskontos versiegelt zu den Schlüsseln legen (Kapitel 13.2)",
             "Fallen beide Admins aus, ist das Gremium sonst ausgesperrt"],
            ["Bei einem Amtswechsel Passphrase und zweiten Faktor am selben Tag neu setzen",
             "Wer aus dem Amt scheidet, behält sonst den Zugang"],
        ],
        (80, 90),
    )

    # 12 ────────────────────────────────────────────────────────────
    pdf.h1("12  Installation")
    pdf.h2("12.1  Voraussetzungen")
    pdf.tabelle(
        ["Komponente", "Mindestens", "Empfohlen"],
        [
            ["Host", "Docker-fähiges System (NAS, Linux-Server, VM)", "aktuelle Version"],
            ["Docker / Compose", "Docker 20.10, Compose V2", "Docker 24+, Compose 2.20+"],
            ["Arbeitsspeicher", "2 GB", "4 GB"],
            ["Speicher", "20 GB", "100 GB+"],
            ["Werkzeuge auf dem Host", "bash, python3, openssl", "–"],
        ],
        (40, 70, 60),
    )
    pdf.body("Bevor es losgeht, sollten diese Angaben bereitliegen:")
    pdf.bullets([
        "Adresse des Servers – IP-Adresse und/oder Rechnername, unter dem BR-DMS im Netz aufgerufen wird (z. B. 192.168.1.100 und br-nas)",
        "Datenverzeichnis – wo Datenbank und Dokumente liegen sollen; auf dem NAS ein eigener Ordner, z. B. /volume1/docker/br-dms",
        "Admin-Zugang – E-Mail-Adresse und ein Passwort mit mindestens 8 Zeichen für das erste Konto",
        "Optional E-Mail – SMTP-Server, Port, Benutzer und Passwort eines Postfachs (stehen in dessen Einstellungen)",
        "Optional Scanner-Ordner – falls Dokumente automatisch importiert werden sollen (Kapitel 12.6)",
    ])

    pdf.h2("12.2  Schritt für Schritt")
    pdf.body("Alle Befehle werden auf dem Server im Projektordner ausgeführt (bei einem NAS per SSH).")
    pdf.schritt(1, "Dateien bereitstellen", "Repository klonen oder Release entpacken und in den Ordner wechseln.")
    pdf.schritt(2, "Assistent starten",
                "bash installation.sh – fragt alles Nötige ab, erzeugt die Schlüssel selbst und schreibt die .env "
                "(Kapitel 12.3). Am Ende zeigt er die folgenden Befehle fertig ausgefüllt an.")
    pdf.schritt(3, "Verzeichnisse anlegen",
                "Unterordner für Datenbank, Dokumente, Logs, Eingang, Backups und Zertifikat.")
    pdf.schritt(4, "Zertifikat erzeugen",
                "Ohne Zertifikat startet der HTTPS-Proxy nicht – es muss vor dem ersten Start da sein (Kapitel 12.4).")
    pdf.schritt(5, "Starten",
                "docker compose up -d --build. Der erste Start dauert einige Minuten; das Backend legt alle "
                "Tabellen und das erste Admin-Konto an.")
    pdf.schritt(6, "Anmelden",
                "https://<Adresse>:8443 öffnen, mit ADMIN_EMAIL und ADMIN_PASSWORD anmelden, Passwort ändern "
                "(Klick auf den Namen) und unter Einstellungen → Benutzerverwaltung das Gremium anlegen.")
    pdf.code(
        "bash installation.sh\n"
        "mkdir -p /srv/br-dms/{storage,postgres,logs,watch_inbox,backups,certs}\n"
        "bash proxy/generate-selfsigned-cert.sh /srv/br-dms br-nas 192.168.1.100\n"
        "docker compose up -d --build\n"
        "docker compose logs -f backend      # Start beobachten, Ende mit Strg+C"
    )
    pdf.hinweis(
        "Jetzt den ENCRYPTION_KEY aus der .env in einen Passwort-Manager kopieren. Ohne ihn lassen sich die "
        "Dokumente auch aus einem Backup nicht mehr öffnen.", "achtung", "Sofort sichern")

    pdf.h2("12.3  Der Installationsassistent – Frage für Frage")
    pdf.body(
        "Werte in [eckigen Klammern] sind Vorschläge: Enter übernimmt sie. Felder ohne Vorschlag – etwa "
        "Passwörter – müssen ausgefüllt werden, sonst fragt der Assistent erneut. Bei Ja/Nein-Fragen gilt "
        "mit Enter der Großbuchstabe: [J/n] heißt Ja, [j/N] heißt Nein. Vor dem Schreiben zeigt der "
        "Assistent eine Zusammenfassung; erst nach Bestätigung entsteht die .env."
    )
    pdf.tabelle(
        ["Frage", "Was eintragen", "Nur Enter"],
        [
            ["Zielsystem", "1 = Linux-Server/VM oder NAS mit SSH-Shell, 2 = Synology, 3 = QNAP (2/3 nutzen die Deploy-Skripte)", "1"],
            ["Erreichbar unter", "IP-Adresse oder Name des Servers", "localhost (NAS: 192.168.1.100)"],
            ["Datenverzeichnis", "Ordner für Datenbank und Dokumente", "./data bzw. NAS-Standardpfad"],
            ["SSH-Benutzer (nur 2/3)", "Das Verwaltungskonto aus Kapitel 11.3 – nicht „admin“", "Pflicht"],
            ["PUID / PGID", "Wird erkannt (bei NAS per SSH mit dem Verwaltungskonto) – bestätigen. Beim NAS "
             "schlägt der Assistent statt der Gruppe aller Konten die Gruppe administrators vor", "erkannter Wert"],
            ["JWT_SECRET, ENCRYPTION_KEY", "Nichts – nur bei einem Umzug den alten Schlüssel eingeben", "neu erzeugt"],
            ["Datenbankpasswort", "Nichts", "neu erzeugt"],
            ["Admin-E-Mail", "Login des ersten Kontos", "admin@br-dms.lokal"],
            ["Admin-Passwort", "Mindestens 8 Zeichen, zweimal", "Pflicht"],
            ["HTTPS-Port / HTTP-Port", "Nur ändern, wenn belegt oder 443/80 gewünscht", "8443 / 8080"],
            ["Weitere Namen fürs Zertifikat", "Alle weiteren Adressen, unter denen BR-DMS aufgerufen wird", "Rechnername"],
            ["E-Mail konfigurieren?", "Server, Port, Benutzer, Passwort, Absender", "Nein"],
            ["Watch-Folder aktivieren?", "Ja, wenn ein Scanner-Ordner importiert werden soll", "Nein"],
        ],
        (44, 84, 42),
    )
    pdf.body(
        "Der Assistent darf jederzeit erneut laufen, etwa um E-Mail nachzutragen. Eine vorhandene .env lädt er "
        "als Vorschlag; bei den Schlüsseln fragt er, ob sie bleiben sollen – hier immer Ja wählen, sonst sind "
        "bestehende Dokumente und Anmeldungen ungültig. APP_URL setzt er selbst aus Adresse und HTTPS-Port zusammen. "
        "Die .env ist danach nur für ihren Besitzer lesbar (chmod 600) – sie enthält die Schlüssel."
    )

    pdf.h2("12.4  HTTPS-Zertifikat")
    pdf.body(
        "BR-DMS ist nur über HTTPS erreichbar. Der Proxy erwartet zwei Dateien in <DATA_PATH>/certs/: "
        "fullchain.pem (Zertifikat) und privkey.pem (privater Schlüssel). Das Zertifikat gilt nur für die "
        "Adressen, die darin stehen – wer BR-DMS per IP und per Name aufruft, nimmt beide auf. Es gibt drei Wege:"
    )
    pdf.tabelle(
        ["Weg", "Aufwand", "Browser-Warnung"],
        [
            ["Selbstsigniert mit dem mitgelieferten Skript", "eine Minute", "bis es einmal je PC importiert ist"],
            ["Von der internen Firmen-CA (IT fragen)", "gering, wenn es eine CA gibt", "keine auf Firmen-PCs"],
            ["Let's Encrypt per DNS-Challenge (eigene Domain)", "mittel, Erneuerung alle 90 Tage", "keine"],
        ],
        (70, 50, 50),
    )
    pdf.h3("Selbstsigniert")
    pdf.body("Erster Parameter ist das Datenverzeichnis, danach alle Namen und IP-Adressen. Gültig 825 Tage; "
             "danach den Befehl erneut ausführen und das neue Zertifikat wieder importieren.")
    pdf.code("bash proxy/generate-selfsigned-cert.sh /srv/br-dms br-nas 192.168.1.100\n"
             "docker compose restart proxy        # nur nötig, wenn BR-DMS schon läuft")
    pdf.body(
        "Damit der Browser nicht mehr warnt, wird das Zertifikat einmal pro PC als vertrauenswürdig importiert. "
        "Dazu fullchain.pem auf den PC kopieren und in br-dms.crt umbenennen:"
    )
    pdf.bullets([
        "Windows (Edge, Chrome) – Doppelklick auf br-dms.crt → Zertifikat installieren → Lokaler Computer → „Alle Zertifikate in folgendem Speicher speichern“ → Vertrauenswürdige Stammzertifizierungsstellen → Fertig stellen; Browser neu starten",
        "macOS (Safari, Chrome) – Doppelklick öffnet die Schlüsselbundverwaltung, Schlüsselbund „System“ wählen; danach das Zertifikat öffnen → Vertrauen → „Immer vertrauen“",
        "Firefox – Einstellungen → Datenschutz & Sicherheit → Zertifikate anzeigen → Zertifizierungsstellen → Importieren → „Dieser CA vertrauen, um Websites zu identifizieren“",
        "Auf vielen PCs auf einmal – die IT verteilt das Zertifikat per Gruppenrichtlinie",
    ])
    pdf.h3("Eigenes Zertifikat (Firmen-CA oder Let's Encrypt)")
    pdf.body(
        "Bei der IT ein Zertifikat für den Rechnernamen anfragen – wichtig: der Name muss als „Subject "
        "Alternative Name“ (SAN) eingetragen sein. Kommt es als .pfx-Datei, wird es so umgewandelt; danach "
        "beide Dateien nach <DATA_PATH>/certs/ legen und den Proxy neu starten. Ein Let's-Encrypt-Zertifikat "
        "per DNS-Challenge braucht keinen offenen Port ins Internet, nur einen TXT-Eintrag in der öffentlichen "
        "DNS-Zone der Domain; Ergebnis ebenso als fullchain.pem und privkey.pem ablegen."
    )
    pdf.code("openssl pkcs12 -in zertifikat.pfx -clcerts -nokeys -out /srv/br-dms/certs/fullchain.pem\n"
             "openssl pkcs12 -in zertifikat.pfx -nocerts -nodes -out /srv/br-dms/certs/privkey.pem\n"
             "docker compose restart proxy")
    pdf.body("Ändert sich dadurch die Adresse (z. B. https://br-dms.firma.de), auch APP_URL in der .env anpassen "
             "und docker compose up -d ausführen.")

    pdf.h2("12.5  Die .env von Hand")
    pdf.body(
        "Wer den Assistenten nicht nutzt, kopiert .env.example nach .env und ersetzt jedes BITTE_AENDERN. "
        "Die Schlüssel erzeugt openssl rand -hex 32 (je einmal für JWT_SECRET und ENCRYPTION_KEY). "
        "Danach chmod 600 .env, damit nur der Besitzer die Schlüssel lesen kann. "
        "Die Tabelle zeigt, was passiert, wenn ein Wert leer bleibt:"
    )
    pdf.tabelle(
        ["Variable", "Bedeutung", "Wenn leer"],
        [
            ["DATA_PATH", "Datenverzeichnis auf dem Host", "Pflicht – sonst landen die Daten unter / des Hosts"],
            ["POSTGRES_PASSWORD", "Datenbank; nur Buchstaben, Ziffern, - und _", "Backend startet nicht"],
            ["JWT_SECRET", "Signiert Anmeldungen (openssl rand -hex 32)", "Backend startet nicht"],
            ["ENCRYPTION_KEY", "Verschlüsselt Dokumente, genau 64 Hex-Zeichen", "Backend startet nicht"],
            ["ADMIN_EMAIL", "Login des ersten Kontos", "admin@br-dms.lokal"],
            ["ADMIN_PASSWORD", "Passwort des ersten Kontos, mind. 8 Zeichen", "Erste Installation startet nicht"],
            ["APP_URL", "Adresse wie im Browser, z. B. https://br-nas:8443", "Links in E-Mails führen ins Leere"],
            ["PUID / PGID", "Besitzer der Dateien auf dem Host (NAS: Verwaltungskonto, Gruppe nur für Admins)", "1000 / 100"],
            ["SMTP_HOST, _PORT, _USER, _PASS, _FROM", "E-Mail-Versand", "keine E-Mails, sonst alles normal"],
            ["WATCH_FOLDER_ENABLED", "Scanner-Ordner importieren", "aus"],
            ["WATCH_INBOX_PATH", "Eigener Eingangsordner", "<DATA_PATH>/watch_inbox"],
            ["SYSTEM_USER_ID", "Konto für Importe", "erstes Admin-Konto"],
            ["PROXY_HTTPS_PORT / _HTTP_PORT", "Ports des Proxys", "8443 / 8080"],
        ],
        (50, 70, 50),
    )
    pdf.body(
        "Fehlen Schlüssel oder steht noch ein Platzhalter darin, startet das Backend bewusst nicht und nennt "
        "den Grund im Log (docker compose logs backend, Zeilen mit [Konfiguration]). ADMIN_EMAIL und "
        "ADMIN_PASSWORD werden nur beim allerersten Start gelesen – spätere Änderungen in der .env wirken "
        "nicht mehr; das Passwort wird dann in der App geändert. Nach jeder anderen Änderung an der .env: "
        "docker compose up -d."
    )

    pdf.h2("12.6  Watch-Folder")
    pdf.body(
        "Mit WATCH_FOLDER_ENABLED=true überwacht das Backend einen Ordner – etwa die Ablage eines "
        "Scanners – und importiert neue PDF-, DOCX-, DOCM- und XLSX-Dateien sowie E-Mails (EML, MSG) automatisch "
        "in den Eingang; PDF- und Office-Anhänge von E-Mails werden dabei gleich als eigene Dokumente abgelegt. "
        "Der Unterordner bestimmt die Kategorie: anhoerung_99, anhoerung_102 (ordentliche Kündigung), "
        "anhoerung_102_ausserordentlich, abmahnung, bewerbung, bewerbung_alternativ, zeitmodell_87, "
        "betriebsvereinbarung, arbeitgeber_info, arbeitsschutz, schriftverkehr, protokoll, sonstiges. "
        "Dateien aus unbekannten Ordnern landen unter „Sonstiges“. "
        "Jeder Import und jeder Fehler wird im Audit-Log protokolliert."
    )
    pdf.body(
        "Importe werden dem ersten Admin-Konto zugeordnet. Soll es ein anderes Konto sein, dessen ID als "
        "SYSTEM_USER_ID eintragen – sie steht in der Benutzerverwaltung als graue Zeile unter dem Namen, "
        "ein Klick kopiert sie. Empfohlen ist ein eigener, separat freigegebener Ordner (WATCH_INBOX_PATH): "
        "Wer einliefert, sieht dann nur diesen Ordner, nicht das restliche Datenverzeichnis."
    )
    pdf.body(
        "Ein Unterordner fällt aus diesem Schema heraus: protokoll_scan ist für Scans der Anwesenheitsliste "
        "und der Unterschriftenseite (Kapitel 4.4) gedacht, nicht für normale Dokumente. Erlaubt sind PDF, "
        "JPG und PNG. Dateien landen dort nicht im Eingang als Dokument, sondern als „wartender Scan“, der "
        "sich per Klick einer Sitzung und einem oder beiden Nachweisen zuordnen lässt."
    )

    pdf.h2("12.7  Wenn etwas nicht klappt")
    pdf.tabelle(
        ["Problem", "Ursache und Lösung"],
        [
            ["Seite lädt nicht, Proxy startet nicht", "Zertifikat fehlt in <DATA_PATH>/certs – Skript ausführen (12.4), dann docker compose up -d"],
            ["Backend startet immer wieder neu", "docker compose logs backend: Zeilen mit [Konfiguration] nennen den fehlenden Wert in der .env"],
            ["„Verbindung nicht privat“", "Selbstsigniertes Zertifikat: einmal importieren (12.4); oder die Adresse fehlt im Zertifikat – mit allen Namen neu erzeugen"],
            ["Links in E-Mails funktionieren nicht", "APP_URL entspricht nicht der Adresse im Browser (https, Name, Port) – anpassen, docker compose up -d"],
            ["Port bereits belegt", "PROXY_HTTPS_PORT / PROXY_HTTP_PORT in der .env ändern"],
            ["Keine E-Mails", "SMTP-Werte prüfen; bei Einladungen zeigt die Einladungskarte den Fehler je Empfänger, sonst steht er im Backend-Log"],
            ["„Permission denied“ im Log", "PUID/PGID passen nicht zum Besitzer des Datenverzeichnisses (id auf dem Host)"],
            ["Dokumente nach Umzug nicht lesbar", "ENCRYPTION_KEY stimmt nicht mit dem alten System überein – alten Schlüssel eintragen"],
        ],
        (55, 115),
    )

    pdf.h2("12.8  Datei-Links im Editor (Windows)")
    pdf.body(
        "Ein UNC-Pfad (\\\\server\\freigabe\\...), der im Editor einer Sitzung, Aufgabe oder im "
        "Wissensarchiv eingefügt wird, wird automatisch in einen brdmsfile://-Link umgewandelt. "
        "Browser blockieren file://-Links auf Netzwerkfreigaben aus Sicherheitsgründen – der Link "
        "öffnet die Datei stattdessen über einen kleinen, lokal installierten Protokoll-Handler mit "
        "der Standard-App (Word, Explorer, …), genau wie ein Doppelklick im Explorer."
    )
    pdf.body(
        "Jeder Windows-PC, auf dem jemand solche Links anklicken will, richtet den Handler einmalig "
        "selbst ein – keine Admin-Rechte nötig, es wird nur in HKEY_CURRENT_USER geschrieben:"
    )
    pdf.schritt(1, "Ordner kopieren",
                "tools/brdmsfile-protokoll aus dem Projekt auf den PC kopieren (Netzlaufwerk oder USB-Stick).")
    pdf.schritt(2, "Installieren.ps1 ausführen",
                "Rechtsklick → „Mit PowerShell ausführen“. Das Skript kompiliert einen kleinen Helfer "
                "(BrdmsFileOpener.exe) mit dem in jedem Windows 10/11 enthaltenen C#-Compiler und "
                "registriert ihn für das brdmsfile://-Protokoll.")
    pdf.schritt(3, "Einmal bestätigen",
                "Beim ersten Klick auf einen Link fragt der Browser, ob er „BR-DMS Datei-Link“ öffnen "
                "darf – bestätigen.")
    pdf.hinweis(
        "Wurde brdmsfile:// auf einem PC schon vor dieser .exe-Variante eingerichtet, ruft die Registry "
        "dort noch die ältere, rein skriptbasierte Lösung auf: powershell.exe -WindowStyle Hidden "
        "-ExecutionPolicy Bypass -File OpenBrdmsFile.ps1 \"<Link>\". Genau diese Kombination "
        "(Hidden + Bypass, aus dem Browser heraus gestartet) schlägt bei praktisch jedem Virenscanner "
        "oder EDR an – unabhängig vom Inhalt des Skripts. Abhilfe: Installieren.ps1 auf diesem PC "
        "erneut ausführen; das überschreibt die Registry-Verknüpfung und zeigt danach direkt auf die "
        "kompilierte .exe, ganz ohne PowerShell-Aufruf.",
        "achtung", "Virenscanner-Meldung bei einer älteren Einrichtung")
    pdf.hinweis(
        "Auch die .exe-Variante kann vereinzelt auffallen, weil sie lokal frisch kompiliert, unsigniert "
        "ist und einen URL-Protokoll-Handler registriert – ein Muster, das auch Schadsoftware nutzt. "
        "Der Quellcode (tools/brdmsfile-protokoll/BrdmsFileOpener.cs) ist kurz und für die IT einsehbar: "
        "Das Programm liest nur die übergebene Adresse, baut daraus einen Pfad und öffnet ihn mit der "
        "Standard-App – ohne Internetzugriff oder Datenversand. Bei einer Meldung trotzdem: "
        "%LOCALAPPDATA%\\BR-DMS\\BrdmsFileOpener.exe von der Prüfung ausnehmen oder firmenintern signieren.",
        "info")
    pdf.body(
        "Öffnet ein Link trotzdem nichts, steht die Fehlermeldung in %LOCALAPPDATA%\\BR-DMS\\log.txt."
    )

    # 13 ────────────────────────────────────────────────────────────
    pdf.h1("13  Betrieb")
    pdf.h2("13.1  Updates einspielen")
    pdf.body(
        "Die Deploy-Skripte übertragen den aktuellen Quellstand per SSH auf den Host. Ziel-Host, "
        "Benutzer und Pfad stehen in .env.deploy (Vorlage: .env.deploy.example). Alle drei Skripte "
        "übertragen dieselben Dateien aus deploy_dateien.txt und verhalten sich gleich – sie "
        "unterscheiden sich nur darin, auf welchem Rechner sie laufen."
    )
    pdf.tabelle(
        ["Skript", "Läuft auf", "Übertragung"],
        [
            ["deploy_update.sh", "Linux / macOS", "tar über SSH"],
            ["deploy_update.ps1", "Windows 10/11 (OpenSSH und tar eingebaut)", "tar über SSH"],
            ["deploy_komplett.py", "überall mit Python 3", "Python über SSH (Host braucht python3 ≥ 3.8)"],
        ],
        (40, 66, 64),
    )
    pdf.bullets([
        "Sauberer Stand – backend/src, backend/prisma und frontend/src werden auf dem Host ersetzt; gelöschte oder umbenannte Dateien bleiben nicht liegen",
        "Abbruchsicher – Übertragen wird erst in einen Zwischenordner; bricht die Verbindung ab, bleibt der alte Stand erhalten",
        "Daten bleiben – .env, Datenbank, Dokumente, Zertifikate und Backups auf dem Host werden nie angefasst",
        "Passende Befehle – Das docker-Programm wird am Pfad erkannt (QNAP /share/…, Synology /volume…) oder über DOCKER_BIN festgelegt",
        "Sicherheitsprüfung – Vor dem Übertragen prüft npm audit Backend und Frontend auf bekannte Lücken (hoch/kritisch) "
        "und fragt bei Funden nach, ob trotzdem übertragen werden soll",
        "Frische Basis-Images – Beim Bauen werden node, nginx und postgres neu geladen; sonst blieben auf dem Host die "
        "einmal geladenen Images mit ihren alten Sicherheitslücken liegen",
    ])
    pdf.code("cp .env.deploy.example .env.deploy   # einmalig: NAS_USER, NAS_HOST, DATA_PATH\n"
             "./deploy_update.sh --trocken         # Probelauf: zeigt nur, was übertragen würde\n"
             "./deploy_update.sh                   # übertragen, danach Befehle anzeigen\n"
             "./deploy_update.sh --bauen           # übertragen und direkt neu bauen/starten\n\n"
             "# Windows:  .\\deploy_update.ps1 -Trocken | -Bauen\n"
             "# Python:   python3 deploy_komplett.py --trocken | --bauen")
    pdf.h3("Neu bauen und starten auf dem Host")
    pdf.body(
        "Ohne --bauen werden die Container danach per SSH auf dem Host neu gebaut. Auf NAS-Systemen "
        "liegt das docker-Programm nicht im Standardpfad, deshalb mit vollem Pfad und sudo:"
    )
    pdf.tabelle(
        ["System", "Datenverzeichnis", "docker-Programm"],
        [
            ["QNAP (Container Station)", "/share/Container/br-dms", "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"],
            ["Synology (Container Manager, DSM 7.2+)", "/volume1/docker/br-dms", "/usr/local/bin/docker"],
            ["Linux-Server / VM", "frei wählbar", "docker"],
        ],
        (52, 46, 72),
    )
    pdf.body(
        "Jede Zeile ist ein vollständiger Befehl und kann einzeln kopiert werden – erst ins "
        "Datenverzeichnis wechseln, dann bauen und starten:"
    )
    pdf.code("# QNAP\n"
             "cd /share/Container/br-dms\n"
             "sudo /share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker compose pull postgres proxy\n"
             "sudo /share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker compose build --pull\n"
             "sudo /share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker compose up -d\n\n"
             "# Synology\n"
             "cd /volume1/docker/br-dms\n"
             "sudo /usr/local/bin/docker compose pull postgres proxy\n"
             "sudo /usr/local/bin/docker compose build --pull\n"
             "sudo /usr/local/bin/docker compose up -d\n\n"
             "# Linux-Server / VM\n"
             "cd <DATA_PATH>\n"
             "docker compose pull postgres proxy && docker compose build --pull && docker compose up -d")
    pdf.bullets([
        "Nur Backend neu – … compose build --pull backend, danach … compose up -d",
        "Frontend ohne Cache – … compose build --pull --no-cache frontend, danach … compose up -d (wenn Änderungen nicht ankommen)",
        "Log ansehen – sudo <docker-Programm> logs brdms_backend --tail 40 -f",
    ])
    pdf.hinweis(
        "Weicht der Pfad ab (andere Volume- oder Container-Station-Version), zeigt „which docker“ bzw. "
        "„ls /share/*/.qpkg/container-station/bin/docker“ per SSH auf der NAS den richtigen Ort. Ältere "
        "Synology-Versionen (Paket „Docker“ statt „Container Manager“) kennen nur docker-compose mit Bindestrich.",
        "info", "Pfad finden")

    pdf.h3("Sicherheitslücken rechtzeitig erkennen")
    pdf.body(
        "Neue Lücken werden laufend in Programmbibliotheken, Node.js, nginx und PostgreSQL gefunden. "
        "Damit sie nicht unbemerkt bleiben, prüfen mehrere Stellen automatisch:"
    )
    pdf.tabelle(
        ["Wer prüft", "Was", "Wie erfahre ich davon?"],
        [
            ["Dependabot (GitHub)", "Bekannte Lücken in allen Paketen und Docker-Images; schlägt Updates "
             "wöchentlich als Pull Request vor, Sicherheitsupdates sofort", "E-Mail von GitHub; Repository → Security"],
            ["CodeQL (GitHub)", "Eigener Code bei jedem Push: ungeprüfte Eingaben in HTML (XSS), "
             "Pfadmanipulation u. Ä.", "Repository → Security → Code scanning"],
            ["Update-Skript", "npm audit vor jeder Übertragung; frische Basis-Images beim Bauen",
             "Warnung im Terminal, Rückfrage"],
            ["NAS-Hersteller", "Firmware und Container Station / Container Manager",
             "Sicherheitsprüfung des NAS (Kapitel 11.3)"],
        ],
        (34, 86, 50),
    )
    pdf.body(
        "Laufzeiten im Blick behalten: Node.js 24 wird bis April 2028 gepflegt, PostgreSQL 16 bis November 2028, "
        "nginx im stabilen Zweig jeweils etwa ein Jahr. Rechtzeitig vorher schlägt Dependabot den Wechsel vor."
    )

    pdf.h2("13.2  Backup und Wiederherstellung")
    pdf.body(
        "backup.sh sichert Datenbank und verschlüsselte Dokumente nach <DATA_PATH>/backups/; Sicherungen "
        "älter als 30 Tage werden entfernt. restore.sh führt interaktiv durch die Wiederherstellung und "
        "verlangt vor dem Überschreiben eine ausdrückliche Bestätigung."
    )
    pdf.code("sudo bash <DATA_PATH>/backup.sh     # db_<Zeit>.sql.gz.enc, storage_<Zeit>.tar.gz.enc\n"
             "sudo bash <DATA_PATH>/restore.sh    # interaktiv\n\n"
             "# ohne Rückfragen, z. B. mit einer Datei außerhalb von backups/:\n"
             "sudo bash <DATA_PATH>/restore.sh /pfad/db_<Zeit>.sql.gz.enc --mit-storage --ja")
    pdf.body(
        "restore.sh spielt die Datenbank in einem einzigen Schritt ein: Tritt ein Fehler auf, bricht es ab und "
        "die Datenbank bleibt auf dem Stand vor dem Restore – es bleibt nie etwas halb eingespielt zurück. "
        "Das Skript muss nicht aus dem Datenverzeichnis gestartet werden; es findet die .env neben sich selbst."
    )
    pdf.body(
        "Für tägliche Sicherungen den Aufgabenplaner der NAS (z. B. 02:00 Uhr, Benutzer root) bzw. cron "
        "verwenden. Den Zustand der Backups zeigt Einstellungen → System."
    )
    pdf.hinweis(
        "Bei einer Wiederherstellung auf einem anderen System muss der ENCRYPTION_KEY in der .env schon "
        "vorher exakt dem des Quellsystems entsprechen, bei verschlüsselten Backups zusätzlich der BACKUP_KEY.",
        "achtung", "Wiederherstellung")
    pdf.hinweis(
        "Das Sicherungskonzept zum Erklären im Gremium, das Einrichten der nächtlichen Sicherung auf QNAP "
        "und Synology, die Wiederherstellung für jeden Schadensfall sowie Vordrucke für Schlüsselblatt und "
        "Testprotokoll stehen in der eigenen Anleitung BR-DMS_Backup-Anleitung.pdf.", "tipp",
        "Ausführliche Anleitung")
    pdf.h3("Verschlüsselte Backups")
    pdf.body(
        "Steht ein BACKUP_KEY in der .env (der Einrichtungsassistent erzeugt ihn, sonst openssl rand -hex 32), "
        "verschlüsselt backup.sh Datenbank-Dump und Dokumenten-Archiv komplett – ohne unverschlüsselte "
        "Zwischendatei. Verfahren: AES-256-CBC mit 256-Bit-Schlüssel (OpenSSL); der Schlüssel wird per PBKDF2 "
        "(HMAC-SHA256, 600.000 Durchläufe, eigener Zufalls-Salt je Datei) aus dem BACKUP_KEY abgeleitet, der "
        "selbst ein 256-Bit-Zufallswert ist. Das ist wichtig, weil der Datenbank-Dump sonst Protokolle, "
        "Beschlüsse, Personal- und Gehaltsdaten und den Suchtext der Dokumente im Klartext enthält. Nur so "
        "verschlüsselt sollte eine Kopie das NAS verlassen, etwa zur Sicherung bei der IT: Sie kann die "
        "Dateien aufbewahren, aber nicht lesen. Ohne BACKUP_KEY sichert das Skript weiter unverschlüsselt "
        "und warnt; Einstellungen → System zeigt das ebenfalls an."
    )
    pdf.bullets([
        "Schlüssel sichern – ENCRYPTION_KEY und BACKUP_KEY ausdrucken und außerhalb des NAS verschlossen aufbewahren",
        "Wiederherstellen – restore.sh erkennt die Endung .enc und prüft den Schlüssel, bevor etwas überschrieben wird",
        "Kopie außer Haus – RAID schützt nur gegen den Ausfall einer Platte, nicht gegen Löschen, Verschlüsselungstrojaner, "
        "Defekt oder Brand des NAS; deshalb zusätzlich eine Kopie an einem anderen Ort und Snapshots auf dem NAS",
    ])
    pdf.code("# Notfall: von Hand entschlüsseln (ohne restore.sh)\n"
             "openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass pass:<BACKUP_KEY> \\\n"
             "  -in db_<Zeit>.sql.gz.enc | gunzip > db.sql")

    pdf.h2("13.3  Demo-Instanz")
    pdf.body(
        "Für Vorführungen startet ein Befehl eine komplett getrennte Instanz mit erfundenen Daten: "
        "„Nordwerk Maschinenbau GmbH“ mit rund 250 Beschäftigten, 9er-Gremium, drei Ersatzmitgliedern, "
        "JAV und SBV, acht Sitzungen, vier weiteren Gremien mit Fremdprotokollen, verschlüsselten Beispiel-PDFs, "
        "Fristen, Gehaltshistorie und mehr. Mit Internetverbindung werden auch die Gesetzestexte geladen. "
        "Alle Daten werden relativ zum aktuellen Datum erzeugt. Die Abbildungen in diesem Handbuch stammen "
        "aus dieser Demo."
    )
    pdf.code("./demo/demo.sh start      # bauen, starten, befüllen -> https://localhost:8444\n"
             "./demo/demo.sh stop       # anhalten, Daten bleiben\n"
             "./demo/demo.sh reset      # alles löschen und frisch einspielen\n"
             "./demo/demo.sh logs       # Backend-Log verfolgen\n"
             "./demo/demo.sh entfernen  # Demo komplett löschen (fragt nach)\n\n"
             "# Anmeldung: s.kroeger / Demo2026!  (Vorsitz) – weitere Konten zeigt start")
    pdf.body(
        "Die Demo läuft neben einer echten Installation auf demselben Rechner: eigene Container "
        "(brdms_demo_…), eigene Docker-Volumes statt des Datenverzeichnisses, eigener Port 8444 und eigene, "
        "beim ersten Start erzeugte Schlüssel in demo/.env.demo. „entfernen“ löscht Container, Volumes, die "
        "gebauten Demo-Images, Schlüssel und Zertifikat der Demo – nur dieses Projekt, eine echte "
        "Installation bleibt unberührt."
    )
    pdf.hinweis(
        "Demodaten lassen sich nicht über echte Daten spielen: Das Demo-Skript schreibt nur in eine leere "
        "Datenbank und bricht sonst ab. Soll das Gremium die Demo auf dem NAS ausprobieren, übernimmt "
        "demo_modus.sh das Sichern, Umschalten und Zurückholen (Kapitel 13.4).",
        "tipp")
    pdf.body("Die Screenshots dieses Handbuchs werden aus der laufenden Demo neu erzeugt (braucht Node.js ab "
             "Version 22 und Chrome oder Chromium; ein anderer Browser über CHROME=/pfad/zum/browser):")
    pdf.code("node tools/handbuch-screenshots/screenshots.mjs\n"
             "python3 generate_manual.py")

    pdf.h2("13.4  Demo auf dem Server – das Gremium ausprobieren lassen")
    pdf.body(
        "Bevor BR-DMS mit echten Daten genutzt wird, soll das Gremium oft erst einmal „herumspielen“ – auf dem "
        "NAS, damit alle von ihrem Arbeitsplatz aus mitmachen können. demo_modus.sh schaltet die Installation "
        "dafür vorübergehend auf die Demodaten aus Kapitel 13.3 um und danach zurück auf die echten Daten. "
        "Das Skript liegt im Datenverzeichnis neben backup.sh und restore.sh (die Deploy-Skripte übertragen es) "
        "und läuft auf QNAP, Synology und Linux gleich – das docker-Programm sucht es selbst."
    )
    pdf.tabelle(
        ["Aufruf", "Was passiert"],
        [
            ["sudo bash demo_modus.sh status", "Zeigt, ob echte oder Demodaten laufen und welche Sicherungen es gibt"],
            ["sudo bash demo_modus.sh demo", "Backup der echten Daten, Kopie mit .env nach sicherung_vor_demo/<Zeit>/; "
             "E-Mail-Versand und Watch-Folder aus; Datenbank und Dokumente leeren; Demodaten einspielen"],
            ["sudo bash demo_modus.sh neu", "Demo von vorn beginnen – alles, was das Gremium angelegt hat, ist weg; "
             "die Sicherung der echten Daten bleibt unberührt"],
            ["sudo bash demo_modus.sh echt", "Ursprüngliche .env zurück, Demodaten löschen, echte Daten aus der "
             "Sicherung einspielen"],
        ],
        (56, 114),
    )
    pdf.bullets([
        "Sicher vor dem Aufräumen – Die Sicherung liegt außerhalb von backups/, wo backup.sh nach 30 Tagen löscht; "
        "die Demo darf also beliebig lange laufen",
        "Keine Mails an erfundene Adressen – Während der Demo sind E-Mail-Versand und Watch-Folder aus; „echt“ "
        "holt die ursprüngliche .env samt allen Einstellungen zurück",
        "Nichts aus Versehen – Jeder Schritt, der Daten löscht, verlangt ein eingetipptes Wort (DEMO, NEU, ECHT); "
        "„demo“ verweigert, wenn schon Demodaten laufen, damit sie nicht als „echte Daten“ gesichert werden",
        "Voraussetzung – In der .env muss ADMIN_PASSWORD stehen (mind. 8 Zeichen); damit startet die geleerte "
        "Installation. ENCRYPTION_KEY und BACKUP_KEY während der Demo nicht ändern",
    ])
    pdf.hinweis(
        "Anmelden in der Demo: Alle Konten haben das Passwort Demo2026!, z. B. s.kroeger@nordwerk-demo.lokal "
        "(Vorsitz), t.brandt@… (Stellvertretung), m.yilmaz@… (Mitglied), m.engel@… (Ersatzmitglied). Das "
        "Skript zeigt die Liste am Ende an. Die beiden Backup-Dateien aus sicherung_vor_demo/ zusätzlich auf "
        "einen PC kopieren.", "tipp", "Demo-Konten")

    pdf.h3("Von Hand, Befehl für Befehl")
    pdf.body(
        "Dasselbe ohne Skript, etwa zum Nachvollziehen. Erst die Zeile mit D= für das eigene System ausführen, "
        "dann die übrigen Befehle der Reihe nach. <Zeit> ist der Zeitstempel des Backups, PUID und PGID stehen "
        "in der .env."
    )
    pdf.code("# QNAP\n"
             "D=/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker\n"
             "cd /share/Container/br-dms\n\n"
             "# Synology\n"
             "D=/usr/local/bin/docker\n"
             "cd /volume1/docker/br-dms")
    pdf.body("Umschalten auf Demodaten:")
    pdf.code("# 1. echte Daten sichern, <Zeit> des neuesten Backups ablesen\n"
             "sudo bash backup.sh\n"
             "ls -lh backups/\n"
             "sudo mkdir -p sicherung_vor_demo/<Zeit>\n"
             "sudo cp -a backups/*<Zeit>* .env sicherung_vor_demo/<Zeit>/\n"
             "# 2. E-Mail-Versand und Watch-Folder aus\n"
             "sudo sed -i 's/^SMTP_/#SMTP_/' .env\n"
             "sudo sed -i 's/^WATCH_FOLDER_ENABLED=.*/WATCH_FOLDER_ENABLED=false/' .env\n"
             "# 3. stoppen, Datenbank und Dokumente leeren, leer starten\n"
             "sudo $D compose down\n"
             "sudo rm -rf postgres storage && sudo mkdir postgres storage\n"
             "sudo $D compose up -d\n"
             "# 4. warten, bis „healthy“ erscheint, dann Demodaten einspielen\n"
             "sudo $D inspect -f '{{.State.Health.Status}}' brdms_backend\n"
             "sudo $D exec -u <PUID>:<PGID> brdms_backend node dist/demo/demo-daten.js")
    pdf.body("Zurück zu den echten Daten:")
    pdf.code("sudo $D compose down\n"
             "# ursprüngliche .env zurück\n"
             "sudo cp -a sicherung_vor_demo/<Zeit>/.env .env\n"
             "sudo rm -rf postgres storage && sudo mkdir postgres storage\n"
             "# leer starten und warten, bis „healthy“ erscheint\n"
             "sudo $D compose up -d\n"
             "sudo bash restore.sh \\\n"
             "  sicherung_vor_demo/<Zeit>/db_<Zeit>.sql.gz.enc --mit-storage --ja")
    pdf.hinweis(
        "Beim Umschalten werden Datenbank und Dokumente gelöscht. Vorher prüfen, dass in sicherung_vor_demo/<Zeit>/ "
        "beide Backup-Dateien (db_… und storage_…) und die .env liegen – das Skript prüft das selbst und bricht "
        "sonst ab, bevor etwas gelöscht wird.", "achtung", "Erst sichern, dann löschen")

    # 14 ────────────────────────────────────────────────────────────
    pdf.h1("14  Datenbank")
    pdf.body(
        "Das Schema wird mit Prisma verwaltet (backend/prisma/schema.prisma) und beim Start automatisch "
        "angeglichen. Die wichtigsten Tabellen:"
    )
    pdf.tabelle(
        ["Bereich", "Tabellen"],
        [
            ["Benutzer", "Benutzer, PasswortReset, AuditLog"],
            ["Dokumente", "Dokument, DokumentVersion, Frist, Kommentar"],
            ["Sitzungen", "Sitzung, SitzungVersion, TOP, TopDokument, Anwesenheit, Beschluss, Abstimmung, ProtocolBlock, SitzungsVorlage"],
            ["Zusammenarbeit", "Aufgabe (inkl. Vorhaben und Themen-Backlog), Nachricht, KummerkastenEintrag"],
            ["Wissen", "WissensEintrag, Ressource, GesetzParagraph"],
            ["Personal", "Mitarbeiter, Abteilung, GehaltsstufenEintrag, ZeitmodellEintrag, UeberstundenEintrag"],
            ["Weitere", "Betriebsvereinbarung, Qualifikation, Schulungstermin, SchulungsTeilnahme, "
                        "Gremium, GremiumMitglied, Fremdprotokoll"],
            ["System", "SystemEinstellung, Aufbewahrungsregel"],
        ],
        (32, 138),
    )
    pdf.h2("14.1  Wichtige Statuswerte")
    pdf.tabelle(
        ["Feld", "Werte"],
        [
            ["Rolle", "VORSITZ, STELLVERTRETER, MITGLIED, ERSATZMITGLIED, JAV, SBV, ADMIN"],
            ["Sitzungsstatus", "ENTWURF, TAGESORDNUNG_FIXIERT, PROTOKOLL_ENTWURF, PROTOKOLL_FINAL, ABGESAGT"],
            ["TOP-Status", "OFFEN, BESCHLOSSEN, ABGELEHNT, VERTAGT, ZUR_KENNTNIS"],
            ["Dokumentstatus", "AKTIV, ARCHIVIERT, LOESCHVORMERKUNG, GELOESCHT"],
            ["Fristtyp", "ANHOERUNG_99_WOCHE, ANHOERUNG_102_ORDENTLICH, ANHOERUNG_102_AUSSERORDENTLICH, ZEITMODELL_87_WOCHE, WIDERSPRUCH, BENUTZERDEFINIERT"],
            ["Anwesenheit", "ANWESEND, ABWESEND_ENTSCHULDIGT, ABWESEND_UNENTSCHULDIGT, ERSATZ_FUER"],
            ["BV-Status", "AKTIV, GEKUENDIGT, ABGELOEST, BEFRISTET_AUSGELAUFEN"],
            ["Beschäftigungsart", "MITARBEITER, AZUBI, STUDENT, DUALER_STUDENT, ZEITARBEITER"],
        ],
        (36, 134),
    )

    # ── Anhang ──────────────────────────────────────────────────────
    pdf.add_page()
    pdf.start_section("Autor, Lizenz & Support", level=0)
    pdf.set_font("S", "B", 22)
    pdf.cell(0, 12, "Autor, Lizenz & Support", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_fill_color(*C_RED)
    pdf.rect(pdf.l_margin, pdf.get_y() + 1, 12, 1.4, "F")
    pdf.ln(9)
    pdf.h3("Entwicklung")
    pdf.body(f"BR-DMS wurde entwickelt von {AUTOR} – Programmierung mit Unterstützung von Claude (Anthropic).")
    pdf.h3("Support")
    pdf.body(
        f"Fragen, Fehlermeldungen und Wünsche bitte per E-Mail an {SUPPORT}. Hilfreich sind die "
        "Versionsnummer (in der App unter „Über BR-DMS“) und eine kurze Beschreibung, was passiert ist."
    )
    pdf.h3("Lizenz")
    pdf.body(
        f"Copyright © {HEUTE.year} {AUTOR}. BR-DMS ist Open Source und steht unter der GNU Affero General "
        "Public License v3.0 (AGPL-3.0). Nutzung, Änderung und Weitergabe sind erlaubt, solange der "
        "Urheberhinweis erhalten bleibt und Änderungen – auch beim Betrieb als gehosteter Dienst – unter "
        "derselben Lizenz offengelegt werden. Der vollständige Lizenztext liegt als Datei LICENSE bei."
    )

    pdf.output(OUT)
    print(f"PDF erstellt: {OUT}  ({pdf.pages_count} Seiten)")


if __name__ == "__main__":
    build()
