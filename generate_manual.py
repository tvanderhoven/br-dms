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

    def bild(self, name, beschriftung, ausschnitt="inhalt", hoehe_anteil=1.0, vertikal=(0.12, 0.82)):
        """Screenshot einbetten. ausschnitt: "voll" (mit Sidebar) oder "inhalt"
        (nur Arbeitsbereich). hoehe_anteil < 1 schneidet unten ab."""
        breite = self.w - self.l_margin - self.r_margin
        if ausschnitt == "mitte":
            breite *= 0.55
        quelle = os.path.join(BILDER, f"{name}.png")
        self.abb_nr += 1
        if os.path.exists(quelle):
            os.makedirs(CACHE, exist_ok=True)
            ziel = os.path.join(CACHE, f"{name}-{ausschnitt}-{hoehe_anteil}-{vertikal[0]}-{vertikal[1]}.jpg")
            with Image.open(quelle) as im:
                im = im.convert("RGB")
                b, h = im.size
                if ausschnitt == "mitte":
                    # z.B. Login-Karte: mittleres Drittel, ohne leere Ränder
                    im = im.crop((int(b * 0.3), int(h * vertikal[0]), int(b * 0.7), int(h * vertikal[1])))
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
    pdf.insert_toc_placeholder(inhaltsverzeichnis, pages=2)
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

    pdf.h2("1.3  Die Oberfläche")
    pdf.body(
        "Links befindet sich die Seitenleiste mit allen Bereichen, thematisch gruppiert "
        "(Postfach, Sitzungen, Dokumente & Wissen, Planung, Personal, Verwaltung). Die Gruppen "
        "lassen sich auf- und zuklappen; das merkt sich der Browser. Oben in der Leiste stehen "
        "Ihr Name, die Schnellsuche und der Zugang zu den Einstellungen. Zahlen an den Einträgen "
        "zeigen Ungelesenes oder Offenes an."
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
            ["Admin", "Technische Betreuung", "Alle Rechte inkl. Module – aber kein Sitzungsmitglied; "
                      "auf Wunsch ohne Zugriff auf Inhalte (Kapitel 9.2)"],
        ],
        (26, 40, 104),
    )
    pdf.body("Die vollständige Berechtigungsmatrix steht in Kapitel 10.")

    # 2 ─────────────────────────────────────────────────────────────
    pdf.h1("2  Dashboard")
    pdf.body(
        "Das Dashboard ist die Startseite nach dem Login. Es fasst zusammen, was heute wichtig ist: "
        "Kennzahlen, ablaufende Fristen, offene Aufgaben und Dokumente, die bald automatisch gelöscht werden."
    )
    pdf.bild("dashboard", "Dashboard mit Kennzahlen, offenen Fristen und Aufgaben", ausschnitt="voll")
    pdf.bullets([
        "Kopfzeile – Ungelesene Dokumente im Eingang, Tage bis zur nächsten Sitzung, Zahl kritischer Fristen",
        "Kennzahlen – Dokumente gesamt, abgelaufene und kritische Fristen (≤ 3 Tage), offene Aufgaben",
        "Offene Fristen – Nach Fälligkeit sortiert, mit Resttagen farbig markiert (rot ≤ 3 Tage, gelb ≤ 7 Tage)",
        "Bald automatisch gelöscht – Dokumente, deren Aufbewahrungsfrist in den nächsten 30 Tagen endet",
        "Offene Aufgaben – Mit Fälligkeit und Priorität; „Alle anzeigen“ führt zur Aufgabenseite",
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
    ])
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
            ["Upload", "PDF, DOCX, DOCM, XLSX bis 50 MB; bei PDFs wird der Text für die Volltextsuche ausgelesen"],
            ["Kategorien", "Anhörung § 99, Kündigung § 102, Abmahnung, Bewerbung, Bewerbung (Alternativ), "
                           "Zeitmodell § 87, Betriebsvereinbarung, Information des Arbeitgebers, Arbeits- und "
                           "Gesundheitsschutz, Schriftverkehr, Protokoll, Sonstiges"],
            ["Metadaten", "Titel, Alias, Tags, Aktenzeichen, Beschreibung, Kennzeichen „vertraulich“"],
            ["Versionen", "Beliebig viele Fassungen mit Änderungsnotiz"],
            ["Kommentare", "Diskussion direkt am Dokument"],
            ["Löschung", "Nach Ablauf der Aufbewahrungsfrist Löschvormerkung, danach endgültige, sichere Löschung"],
            ["Löschdatum ändern", "Im Bearbeiten-Dialog; wechselt die Kategorie, wird das Datum nach deren "
                                  "Regel ab dem Hochladen neu vorgeschlagen. Nur Daten in der Zukunft"],
        ],
        (32, 138),
    )
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
                "Ergebnis protokolliert – das ist der Nachweis der Ladung. Die JAV erhält keine vertraulichen TOPs. "
                "Vor dem Senden öffnet sich ein Fenster für einen zusätzlichen Text, etwa den Link zu einem "
                "Online-Meeting; er wird beim nächsten Versand für dieselbe Sitzung vorgeschlagen.")
    pdf.bild("vorlagen", "Sitzungsvorlagen für wiederkehrende Tagesordnungen", hoehe_anteil=0.35)

    pdf.h2("4.3  Sitzung durchführen und protokollieren")
    pdf.body(
        "Mit „Protokoll starten“ wechselt die Sitzung in den Protokollmodus. Zu jedem TOP werden "
        "Ergebnis, Beschlüsse und Abstimmungen festgehalten. Die Anwesenheitsliste lässt sich als "
        "PDF zum Unterschreiben ausdrucken."
    )
    pdf.bild("sitzung-entwurf", "Sitzung im Protokollmodus mit Editor, Beschluss und Anwesenheitsliste")
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
        "zugeordnet (Kapitel 12.4)",
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
    pdf.h3("Fremdprotokoll")
    pdf.body(
        "Für Gremien, die der Betriebsrat nicht selbst im System führt, wird ein fertiges Protokoll als "
        "Fremdprotokoll abgelegt – eine hochgeladene Datei mit Gremium, Datum und Titel, ohne eigene "
        "Tagesordnungspunkte oder Anwesenheitsliste. Eine Markierung als vertraulich beschränkt Ansicht "
        "und Download auf Vorsitz und Admin, etwa für Wirtschaftsausschuss-Protokolle."
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
        "Die Themensammlung stellt TOPs zusammen, die im Protokoll als „öffentlich“ markiert wurden, "
        "und exportiert sie formatiert für Aushänge oder einen Newsletter an die Belegschaft."
    )
    pdf.h2("6.4  Globale Suche und Gesetzestexte")
    pdf.body(
        "Die Suche durchsucht alle Bereiche gleichzeitig – Dokumente samt PDF-Volltext, Sitzungen, TOPs "
        "und Beschlüsse, Aufgaben, Wissensarchiv, Ressourcen, Betriebsvereinbarungen, Schulungen, "
        "Mitarbeiter und Gesetzestexte – und gruppiert die Treffer nach Bereich."
    )
    pdf.bild("suche", "Suchergebnisse nach Bereichen gruppiert", hoehe_anteil=0.6)
    pdf.body(
        "Die Gesetzestexte (u. a. BetrVG, KSchG, ArbZG) werden monatlich automatisch aktualisiert und "
        "öffnen sich als Fenster direkt in der Anwendung."
    )

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
    pdf.h2("7.2  Eingruppierung")
    pdf.body(
        "Die Seite Eingruppierung führt die Eingruppierungs-Historie je Mitarbeiter – Tarifgruppe und Stufe "
        "oder ein individuelles AT-Gehalt, jeweils mit „gültig ab“ und Bemerkung. Einträge, die aus einem "
        "Sitzungsbeschluss stammen, sind mit der Sitzung verknüpft."
    )
    pdf.bild("gehaltstabelle-liste", "Eingruppierung mit Historie und Bemerkungen", hoehe_anteil=0.6)
    pdf.body(
        "Der Reiter Statistik zeigt die Verteilung nach Gruppe, Stufe, Zeitmodell und Standort sowie "
        "das durchschnittliche AT-Gehalt."
    )
    pdf.bild("gehaltstabelle-statistik", "Statistik: Verteilung nach Gruppe und Zeitmodell", hoehe_anteil=0.6)
    pdf.h2("7.3  Zeitmodelle und Überstunden")
    pdf.body(
        "Zeitmodell und Überstundenregelung haben je eine eigene Historie mit echtem Gültigkeitszeitraum – "
        "befristet oder unbefristet. Eine Warnliste zeigt Regelungen, die in den nächsten 30 Tagen auslaufen."
    )
    pdf.bild("gehaltstabelle-zeitmodell", "Zeitmodell-Historie mit Ablaufwarnung", hoehe_anteil=0.55)
    pdf.h2("7.4  Betriebsvereinbarungen")
    pdf.body(
        "Das Register führt alle Betriebsvereinbarungen mit Status (aktiv, gekündigt, abgelöst, befristet "
        "ausgelaufen), Geltungsbereich und Laufzeitende. Vor Ablauf erscheint ein Warnhinweis; das "
        "hinterlegte PDF ist verknüpft und im Volltext durchsuchbar."
    )
    pdf.bild("betriebsvereinbarungen", "Register der Betriebsvereinbarungen", hoehe_anteil=0.4)
    pdf.h2("7.5  Schulungen und Qualifikationsmatrix")
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
        "Die Einstellungen erreichen Sie über das Zahnrad oben in der Seitenleiste. Welche Reiter "
        "sichtbar sind, hängt von der Rolle ab."
    )
    pdf.tabelle(
        ["Reiter", "Inhalt"],
        [
            ["Fristen", "Aufbewahrungsfristen je Dokumentkategorie"],
            ["Protokoll-Layout", "Kopf- und Fußzeile, Farbe, Logo und Unterschriftszeilen der PDFs"],
            ["Benutzerverwaltung", "Benutzer, Rollen, Wahlrang, ständige Vertretung, Geschlechterquote, "
                                   "Zugriff des Admins"],
            ["Design", "Farbschema, Schriftgröße, Hell/Dunkel"],
            ["System", "Watch-Folder-Status, Backup-Übersicht, automatisches Abmelden"],
            ["Module", "Optionale Bereiche ein- und ausschalten (nur Admin)"],
            ["Gesetzestexte", "Stand der Gesetzesdatenbank, manuelles Aktualisieren"],
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

    pdf.h2("9.5  Aufbewahrung, Protokoll-Layout und System")
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
    pdf.bullets([
        "Protokoll-Layout – Logo hochladen, Kopf- und Fußzeile, Akzentfarbe, Unterschriftszeilen und der Ort vor dem Datum an den Unterschriften (leer = nur Datum)",
        "System – E-Mail-Absender (Name und Adresse für alle Mails; ohne Eintrag gilt SMTP_FROM) und Signatur unter den Einladungen, Status des Watch-Folders und Übersicht der Backups (Anzahl, Alter, Größe, Vollständigkeit)",
        "Automatisches Abmelden – Nach 0 bis 480 Minuten Inaktivität (0 = aus)",
    ])

    pdf.h2("9.6  Audit-Log")
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
        ["Berechtigung", "Vorsitz", "Stellv.", "Mitglied", "Ersatz", "JAV", "Admin"],
        [
            ["Dokumente lesen", j, j, j, j, n, j],
            ["Dokumente hochladen und bearbeiten", j, j, j, v, n, j],
            ["Vertrauliche Dokumente anderer", j, j, n, n, n, j],
            ["Eingang bearbeiten", j, j, n, n, n, j],
            ["Sitzungen und Protokolle lesen", j, j, j, j, j, j],
            ["Vertrauliche TOPs sehen", j, j, j, j, n, j],
            ["TOPs bearbeiten", j, j, j, v, n, j],
            ["Sitzung anlegen, fixieren, finalisieren", j, j, n, n, n, j],
            ["Beschlüsse erfassen und finalisieren", j, j, n, n, n, j],
            ["Eingruppierung bearbeiten", j, j, j, v, n, j],
            ["Betriebsvereinbarungen anlegen", j, j, n, n, n, j],
            ["Gremien, Mitglieder und Fremdprotokolle verwalten", j, j, n, n, n, j],
            ["Benutzer verwalten, Design ändern", j, j, n, n, n, j],
            ["Audit-Log einsehen", j, j, n, n, n, j],
            ["Module ein-/ausschalten", n, n, n, n, n, j],
        ],
        (64, 18, 17, 18, 17, 14, 17),
    )
    pdf.body(
        "„Vertr.“ = nur solange das Ersatzmitglied aktiv als Vertretung eingetragen ist, sonst lesend. "
        "Die JAV-Rolle darf ausschließlich Sitzungen und Protokolle lesen."
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
            ["proxy", "Nginx 1.25", "TLS-Terminierung, einziger Zugang (Port 8443, 8080 leitet um)"],
            ["frontend", "React 18, Vite, Tailwind CSS (über Nginx)", "Benutzeroberfläche im Browser"],
            ["backend", "Node.js 20, Fastify, Prisma", "REST-API, Geschäftslogik, PDF-Erzeugung, Hintergrundjobs"],
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
    pdf.tabelle(
        ["Mechanismus", "Umsetzung"],
        [
            ["Verschlüsselung", "AES-256-GCM je Dokument mit eigenem, per scrypt abgeleitetem Schlüssel; Prüfsumme SHA-256"],
            ["Transport", "Ausschließlich HTTPS über den Proxy"],
            ["Anmeldung", "JWT, 24 Stunden („eingeloggt bleiben“) bzw. 1 Stunde; Begrenzung von Anmeldeversuchen"],
            ["Passwörter", "scrypt-Hash mit Salt, mindestens 8 Zeichen"],
            ["Berechtigungen", "Rollenprüfung in jeder API-Route"],
            ["Protokolle", "Unveränderliche Versionen mit SHA-256-Zeitstempel"],
            ["Audit-Trail", "Über 30 Aktionstypen mit Zeitpunkt, Person, IP und Browser"],
            ["Löschung", "Dateien werden vor dem Löschen überschrieben"],
        ],
        (34, 136),
    )
    pdf.hinweis(
        "Der ENCRYPTION_KEY entschlüsselt alle Dokumente. Geht er verloren, sind die Dokumente auch mit "
        "vollständigem Backup nicht mehr lesbar. Bewahren Sie ihn getrennt und sicher auf, z. B. in einem "
        "Passwortmanager.", "wichtig", "Schlüssel sichern")

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
        ],
        (40, 70, 60),
    )
    pdf.h2("12.2  Schritt für Schritt")
    pdf.schritt(1, "Dateien bereitstellen", "Repository klonen oder Release entpacken.")
    pdf.schritt(2, "Assistent starten",
                "bash installation.sh fragt Datenpfad, Schlüssel, Admin-Zugang, SMTP und Watch-Folder "
                "ab und erzeugt die .env.")
    pdf.schritt(3, "Zertifikat erzeugen",
                "bash proxy/generate-selfsigned-cert.sh <DATA_PATH> <Hostname/IP> – oder ein eigenes "
                "Zertifikat (fullchain.pem, privkey.pem) nach <DATA_PATH>/certs/ legen.")
    pdf.schritt(4, "Starten",
                "docker compose up -d --build. Beim ersten Start legt das Backend alle Tabellen an.")
    pdf.schritt(5, "Anmelden",
                "https://<Host>:8443 öffnen. Der erste Admin wird automatisch aus ADMIN_EMAIL und "
                "ADMIN_PASSWORD angelegt – Passwort sofort ändern, dann das Gremium anlegen.")
    pdf.code(
        "bash installation.sh\n"
        "bash proxy/generate-selfsigned-cert.sh /volume1/docker/br-dms br-nas 192.168.1.100\n"
        "docker compose up -d --build"
    )
    pdf.h2("12.3  Umgebungsvariablen")
    pdf.body("Die .env liegt im Installationsverzeichnis und wird nie ins Repository übernommen.")
    pdf.tabelle(
        ["Variable", "Pflicht", "Bedeutung"],
        [
            ["DATA_PATH", "Ja", "Datenverzeichnis (Datenbank, Dokumente, Logs, Zertifikate)"],
            ["POSTGRES_USER / _PASSWORD / _DB", "Ja", "Zugang zur Datenbank"],
            ["JWT_SECRET", "Ja", "Signaturschlüssel für Anmeldungen (openssl rand -hex 32)"],
            ["ENCRYPTION_KEY", "Ja", "AES-256-Schlüssel, 64 Hex-Zeichen (openssl rand -hex 32)"],
            ["ADMIN_EMAIL / ADMIN_PASSWORD", "Ja", "Erster Admin-Zugang beim Erststart"],
            ["APP_URL", "Ja", "Öffentliche Adresse, z. B. https://br-nas:8443 (Links in E-Mails, CORS)"],
            ["PUID / PGID", "Nein", "Benutzer- und Gruppen-ID für Dateirechte"],
            ["SMTP_HOST / _PORT / _USER / _PASS / _FROM", "Nein", "E-Mail-Versand (Passwort-Reset, Erinnerungen)"],
            ["WATCH_FOLDER_ENABLED", "Nein", "Watch-Folder aktivieren (true/false)"],
            ["WATCH_INBOX_PATH", "Nein", "Eigener Pfad für den Eingangsordner"],
            ["SYSTEM_USER_ID", "Nein", "Benutzer, dem Watch-Folder-Importe zugeordnet werden"],
            ["PROXY_HTTPS_PORT / PROXY_HTTP_PORT", "Nein", "Ports des Proxys (Standard 8443 / 8080)"],
        ],
        (62, 16, 92),
    )
    pdf.h2("12.4  Watch-Folder")
    pdf.body(
        "Mit WATCH_FOLDER_ENABLED=true überwacht das Backend einen Ordner – etwa die Ablage eines "
        "Scanners – und importiert neue PDF-, DOCX-, DOCM- und XLSX-Dateien automatisch in den Eingang. "
        "Der Unterordner bestimmt die Kategorie: anhoerung_99, anhoerung_102 (ordentliche Kündigung), "
        "anhoerung_102_ausserordentlich, abmahnung, bewerbung, bewerbung_alternativ, zeitmodell_87, "
        "betriebsvereinbarung, arbeitgeber_info, arbeitsschutz, schriftverkehr, protokoll, sonstiges. "
        "Dateien aus unbekannten Ordnern landen unter „Sonstiges“. "
        "Jeder Import und jeder Fehler wird im Audit-Log protokolliert."
    )
    pdf.body(
        "Ein Unterordner fällt aus diesem Schema heraus: protokoll_scan ist für Scans der Anwesenheitsliste "
        "und der Unterschriftenseite (Kapitel 4.4) gedacht, nicht für normale Dokumente. Erlaubt sind PDF, "
        "JPG und PNG. Dateien landen dort nicht im Eingang als Dokument, sondern als „wartender Scan“, der "
        "sich per Klick einer Sitzung und einem oder beiden Nachweisen zuordnen lässt."
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
             "sudo /share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker compose up -d --build\n\n"
             "# Synology\n"
             "cd /volume1/docker/br-dms\n"
             "sudo /usr/local/bin/docker compose up -d --build\n\n"
             "# Linux-Server / VM\n"
             "cd <DATA_PATH>\n"
             "docker compose up -d --build")
    pdf.bullets([
        "Nur Backend neu – … compose build backend, danach … compose up -d",
        "Frontend ohne Cache – … compose build --no-cache frontend, danach … compose up -d (wenn Änderungen nicht ankommen)",
        "Log ansehen – sudo <docker-Programm> logs brdms_backend --tail 40 -f",
    ])
    pdf.hinweis(
        "Weicht der Pfad ab (andere Volume- oder Container-Station-Version), zeigt „which docker“ bzw. "
        "„ls /share/*/.qpkg/container-station/bin/docker“ per SSH auf der NAS den richtigen Ort. Ältere "
        "Synology-Versionen (Paket „Docker“ statt „Container Manager“) kennen nur docker-compose mit Bindestrich.",
        "info", "Pfad finden")

    pdf.h2("13.2  Backup und Wiederherstellung")
    pdf.body(
        "backup.sh sichert Datenbank und verschlüsselte Dokumente nach <DATA_PATH>/backups/; Sicherungen "
        "älter als 30 Tage werden entfernt. restore.sh führt interaktiv durch die Wiederherstellung und "
        "verlangt vor dem Überschreiben eine ausdrückliche Bestätigung."
    )
    pdf.code("sudo bash <DATA_PATH>/backup.sh     # Ergebnis: db_<Zeit>.sql.gz, storage_<Zeit>.tar.gz\n"
             "sudo bash <DATA_PATH>/restore.sh    # interaktiv")
    pdf.body(
        "Für tägliche Sicherungen den Aufgabenplaner der NAS (z. B. 02:00 Uhr, Benutzer root) bzw. cron "
        "verwenden. Den Zustand der Backups zeigt Einstellungen → System."
    )
    pdf.hinweis(
        "Bei einer Wiederherstellung auf einem anderen System muss der ENCRYPTION_KEY in der .env schon "
        "vorher exakt dem des Quellsystems entsprechen.", "achtung", "Wiederherstellung")

    pdf.h2("13.3  Demo-Instanz")
    pdf.body(
        "Für Vorführungen startet ein Befehl eine komplett getrennte Instanz mit erfundenen Daten: "
        "„Nordwerk Maschinenbau GmbH“ mit rund 250 Beschäftigten, 9er-Gremium, drei Ersatzmitgliedern und "
        "JAV, fünf Sitzungen, verschlüsselten Beispiel-PDFs, Fristen, Gehaltshistorie und mehr. Alle Daten "
        "werden relativ zum aktuellen Datum erzeugt. Die Abbildungen in diesem Handbuch stammen aus dieser Demo."
    )
    pdf.code("./demo/demo.sh start    # bauen, starten, befüllen -> https://localhost:8444\n"
             "./demo/demo.sh reset    # alles löschen und frisch einspielen\n"
             "./demo/demo.sh stop     # anhalten\n\n"
             "# Anmeldung: s.kroeger / Demo2026!  (Vorsitz)")
    pdf.hinweis(
        "Das Demo-Skript schreibt nur in eine leere Datenbank und bricht sonst ab – eine echte "
        "Installation kann es nicht verändern.", "tipp")
    pdf.body("Die Screenshots dieses Handbuchs werden aus der laufenden Demo neu erzeugt mit:")
    pdf.code("node tools/handbuch-screenshots/screenshots.mjs\n"
             "python3 generate_manual.py")

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
            ["Rolle", "VORSITZ, STELLVERTRETER, MITGLIED, ERSATZMITGLIED, JAV, ADMIN"],
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
