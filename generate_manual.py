#!/usr/bin/env python3
"""Generiert das BR-DMS Handbuch als PDF."""
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from datetime import datetime
import os

FONT_PATH = "/usr/share/fonts/truetype/liberation/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "BR-DMS_Handbuch.pdf")

# Farben
C_BLUE_DARK  = (31,  78, 121)
C_BLUE_MID   = (68, 114, 196)
C_BLUE_LIGHT = (189, 215, 238)
C_GRAY_ROW   = (245, 245, 245)
C_GRAY_TEXT  = (100, 100, 100)
C_BLACK      = (0,   0,   0)
C_WHITE      = (255, 255, 255)
C_GREEN      = (68, 140,  68)
C_ORANGE     = (200, 120,  0)


class Manual(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "A4")
        self.add_font("S",  "",  FONT_PATH + "LiberationSans-Regular.ttf")
        self.add_font("S",  "B", FONT_PATH + "LiberationSans-Bold.ttf")
        self.add_font("S",  "I", FONT_PATH + "LiberationSans-Italic.ttf")
        self.add_font("SM", "",  FONT_PATH + "LiberationMono-Regular.ttf")
        self.set_auto_page_break(True, margin=22)
        self.set_margins(20, 25, 20)

    # ── Header / Footer ──────────────────────────────────────────────
    def header(self):
        if self.page_no() <= 2:
            return
        self.set_font("S", "B", 8)
        self.set_text_color(*C_GRAY_TEXT)
        self.cell(120, 7, "BR-DMS – Benutzer- und Administratorhandbuch", align="L")
        self.cell(0,   7, f"Version 1.0  |  {datetime.now().strftime('%B %Y')}", align="R",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*C_BLUE_MID)
        self.set_line_width(0.4)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(3)
        self.set_text_color(*C_BLACK)

    def footer(self):
        if self.page_no() <= 2:
            return
        self.set_y(-16)
        self.set_draw_color(*C_BLUE_MID)
        self.set_line_width(0.4)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(2)
        self.set_font("S", "", 8)
        self.set_text_color(*C_GRAY_TEXT)
        self.cell(0, 6, f"Seite {self.page_no()}", align="C")
        self.set_text_color(*C_BLACK)

    # ── Typografie-Helfer ────────────────────────────────────────────
    def h1(self, text, newpage=True):
        if newpage:
            self.add_page()
        self.set_font("S", "B", 18)
        self.set_text_color(*C_BLUE_DARK)
        self.set_fill_color(*C_BLUE_LIGHT)
        self.set_draw_color(*C_BLUE_MID)
        self.set_line_width(0.6)
        self.cell(0, 12, text, fill=True, border="B",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(4)
        self.set_text_color(*C_BLACK)

    def h2(self, text):
        self.ln(3)
        self.set_font("S", "B", 13)
        self.set_text_color(*C_BLUE_DARK)
        self.set_draw_color(*C_BLUE_MID)
        self.set_line_width(0.4)
        self.multi_cell(0, 8, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.line(self.l_margin, self.get_y(), self.l_margin + 60, self.get_y())
        self.ln(3)
        self.set_text_color(*C_BLACK)

    def h3(self, text):
        self.ln(2)
        self.set_font("S", "B", 10)
        self.set_text_color(*C_BLUE_MID)
        self.multi_cell(0, 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)
        self.set_text_color(*C_BLACK)

    def body(self, text, indent=0):
        self.set_font("S", "", 9.5)
        self.set_text_color(*C_BLACK)
        x0 = self.get_x()
        if indent:
            self.set_x(self.l_margin + indent)
        self.multi_cell(0, 5.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)
        if indent:
            self.set_x(x0)

    def bullets(self, items, indent=5):
        self.set_font("S", "", 9.5)
        w = self.w - self.l_margin - self.r_margin - indent - 5
        for item in items:
            self.set_x(self.l_margin + indent)
            self.cell(5, 5.5, "•")
            self.multi_cell(w, 5.5, item, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def info_box(self, text, color=None, label=""):
        color = color or C_BLUE_LIGHT
        self.set_fill_color(*color)
        self.set_draw_color(*C_BLUE_MID)
        self.set_line_width(0.3)
        self.set_font("S", "B", 9) if label else self.set_font("S", "I", 9)
        pad = 3
        self.set_x(self.l_margin + 2)
        if label:
            self.set_font("S", "B", 9)
            self.multi_cell(0, 5.5, label, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_font("S", "", 9)
        self.set_x(self.l_margin + 2)
        self.set_fill_color(*color)
        self.multi_cell(0, 5.5, text, fill=True, border=1,
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)

    def code(self, text):
        self.set_font("SM", "", 8.5)
        self.set_fill_color(240, 240, 240)
        self.set_draw_color(180, 180, 180)
        self.set_x(self.l_margin + 2)
        self.multi_cell(0, 5, text, fill=True, border=1,
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)
        self.set_font("S", "", 9.5)

    def table(self, headers, rows, col_widths=None, alt_rows=True):
        total = self.w - self.l_margin - self.r_margin
        n = len(headers)
        if col_widths is None:
            col_widths = [total / n] * n
        # Header
        self.set_font("S", "B", 9)
        self.set_fill_color(*C_BLUE_DARK)
        self.set_text_color(*C_WHITE)
        self.set_draw_color(*C_BLUE_DARK)
        for i, (h, w) in enumerate(zip(headers, col_widths)):
            border = "LTB" if i == 0 else ("RTB" if i == n-1 else "TB")
            self.cell(w, 7, h, border=border, fill=True)
        self.ln()
        # Rows
        self.set_font("S", "", 8.5)
        self.set_text_color(*C_BLACK)
        self.set_draw_color(180, 180, 180)
        for ri, row in enumerate(rows):
            if alt_rows and ri % 2 == 1:
                self.set_fill_color(*C_GRAY_ROW)
                fill = True
            else:
                self.set_fill_color(*C_WHITE)
                fill = True
            # Calculate row height from tallest cell
            max_h = 6
            for ci, (cell_text, w) in enumerate(zip(row, col_widths)):
                # Estimate lines
                chars_per_line = max(1, int(w / 2.1))
                lines = max(1, (len(str(cell_text)) // chars_per_line) + 1)
                max_h = max(max_h, lines * 5)
            y0 = self.get_y()
            x0 = self.l_margin
            for ci, (cell_text, w) in enumerate(zip(row, col_widths)):
                self.set_xy(x0, y0)
                border = "LB" if ci == 0 else ("RB" if ci == n-1 else "B")
                self.multi_cell(w, 5, str(cell_text), border=border,
                                fill=fill, new_x=XPos.RIGHT, new_y=YPos.TOP)
                x0 += w
            self.set_y(y0 + max_h)
        self.ln(3)

    def step_box(self, number, title, text):
        self.set_fill_color(*C_BLUE_MID)
        self.set_text_color(*C_WHITE)
        self.set_font("S", "B", 10)
        self.cell(10, 8, str(number), fill=True, align="C")
        self.set_fill_color(*C_BLUE_LIGHT)
        self.set_text_color(*C_BLACK)
        self.cell(0, 8, f"  {title}", fill=True,
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if text:
            self.set_font("S", "", 9)
            self.set_x(self.l_margin + 10)
            self.multi_cell(0, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)


# ════════════════════════════════════════════════════════════════════
def build():
    pdf = Manual()

    # ────────────────────────────────────────────────────────────────
    # TITELSEITE
    # ────────────────────────────────────────────────────────────────
    pdf.add_page()
    pdf.set_fill_color(*C_BLUE_DARK)
    pdf.rect(0, 0, 210, 80, "F")
    pdf.set_y(22)
    pdf.set_font("S", "B", 28)
    pdf.set_text_color(*C_WHITE)
    pdf.cell(0, 14, "BR-DMS", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("S", "", 14)
    pdf.cell(0, 9, "Dokumentenmanagementsystem fur Betriebsrate", align="C",
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)
    pdf.set_font("S", "I", 11)
    pdf.set_text_color(189, 215, 238)
    pdf.cell(0, 7, "Benutzer- und Administratorhandbuch", align="C",
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_y(100)
    pdf.set_text_color(*C_BLACK)
    pdf.set_font("S", "", 10)
    meta = [
        ("Version",  "1.0"),
        ("Stand",    datetime.now().strftime("%d. %B %Y")),
        ("Betrieb",  "Intranet (Synology NAS)"),
        ("Lizenz",   "Intern / Vertraulich"),
    ]
    for k, v in meta:
        pdf.set_font("S", "B", 10)
        pdf.cell(40, 7, k + ":", align="R")
        pdf.set_font("S", "", 10)
        pdf.cell(0, 7, "  " + v, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_y(240)
    pdf.set_fill_color(*C_BLUE_DARK)
    pdf.set_text_color(*C_WHITE)
    pdf.set_font("S", "", 9)
    pdf.cell(0, 12, "DSGVO-konform  ·  Self-hosted  ·  Vollverschlusselt",
             fill=True, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ────────────────────────────────────────────────────────────────
    # INHALTSVERZEICHNIS
    # ────────────────────────────────────────────────────────────────
    pdf.add_page()
    pdf.set_font("S", "B", 18)
    pdf.set_text_color(*C_BLUE_DARK)
    pdf.cell(0, 12, "Inhaltsverzeichnis", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_draw_color(*C_BLUE_MID)
    pdf.set_line_width(0.5)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(5)

    toc = [
        ("1", "Einfuhrung", ""),
        ("",  "1.1  Uber BR-DMS", ""),
        ("",  "1.2  DSGVO-Konformitat", ""),
        ("2", "Technologiebeschreibung", ""),
        ("",  "2.1  Stack-Ubersicht", ""),
        ("",  "2.2  Sicherheitsarchitektur", ""),
        ("3", "Installation", ""),
        ("",  "3.1  Voraussetzungen", ""),
        ("",  "3.2  Schritt-fur-Schritt", ""),
        ("",  "3.3  Umgebungsvariablen", ""),
        ("",  "3.4  Erststart & Admin-Konto", ""),
        ("4", "Modulubersicht", ""),
        ("",  "4.1  Dashboard", ""),
        ("",  "4.2  Dokumenteneingang (Inbox)", ""),
        ("",  "4.3  Dokumentenarchiv", ""),
        ("",  "4.4  Sitzungsverwaltung", ""),
        ("",  "4.5  Aufgaben", ""),
        ("",  "4.6  Posteingang (Nachrichten)", ""),
        ("",  "4.7  Wissensarchiv", ""),
        ("",  "4.8  Ressourcen", ""),
        ("",  "4.9  Themensammlung", ""),
        ("",  "4.10 Benutzerverwaltung", ""),
        ("",  "4.11 Audit-Log", ""),
        ("",  "4.12 Einstellungen", ""),
        ("5", "Prozess: Dokument bis Protokoll", ""),
        ("",  "5.1  Dokument hochladen", ""),
        ("",  "5.2  Kategorisierung & Fristen", ""),
        ("",  "5.3  TOP-Verknupfung", ""),
        ("",  "5.4  Sitzungsvorbereitung", ""),
        ("",  "5.5  Sitzungsdurchfuhrung", ""),
        ("",  "5.6  Protokoll erstellen & finalisieren", ""),
        ("6", "Daily Business", ""),
        ("",  "6.1  Tagliche Aufgaben", ""),
        ("",  "6.2  Watch Folder", ""),
        ("7", "Rollen & Berechtigungen", ""),
        ("8", "Datenbankubersicht", ""),
        ("",  "8.1  Haupttabellen", ""),
        ("",  "8.2  Enumerationen", ""),
        ("9", "Backup & Restore", ""),
        ("",  "9.1  Backup erstellen", ""),
        ("",  "9.2  Wiederherstellung", ""),
        ("",  "9.3  Automatisierung", ""),
    ]
    for num, title, _ in toc:
        pdf.set_font("S", "B" if num else "", 9.5)
        indent = 0 if num else 8
        pdf.set_x(pdf.l_margin + indent)
        if num:
            pdf.set_text_color(*C_BLUE_DARK)
            pdf.cell(12, 6, num + ".", align="L")
        else:
            pdf.cell(12, 6, "", align="L")
        pdf.set_text_color(*C_BLACK)
        pdf.cell(0, 6, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*C_BLACK)

    # ════════════════════════════════════════════════════════════════
    # 1. EINFUHRUNG
    # ════════════════════════════════════════════════════════════════
    pdf.h1("1  Einfuhrung")

    pdf.h2("1.1  Uber BR-DMS")
    pdf.body(
        "BR-DMS (Betriebsrats-Dokumentenmanagementsystem) ist eine speziell fur "
        "Betriebsrate entwickelte Software zur sicheren, DSGVO-konformen Verwaltung "
        "von Betriebsratsdokumenten. Das System lauft vollstandig im Intranet auf "
        "einer Synology NAS und benotigt keine Cloud-Verbindung."
    )
    pdf.body(
        "Das System unterstuzt den gesamten Lebenszyklus eines Betriebsratsdokuments: "
        "vom Eingang uber Kategorisierung, Fristuberwachung und Sitzungsanbindung bis "
        "hin zum rechtssicheren Protokoll und der geregelten Loschung nach Ablauf der "
        "gesetzlichen Aufbewahrungsfristen."
    )
    pdf.bullets([
        "Vollverschlusselte Dokumentenablage (AES-256)",
        "Rollenbasierte Zugriffskontrolle (RBAC)",
        "Lukenloser Audit-Trail aller Aktionen",
        "Integrierte Sitzungs- und Protokollverwaltung",
        "Automatische Fristuberwachung (§ 99, § 102 BetrVG)",
        "Wissensarchiv und Themensammlung",
        "Kein Internet erforderlich – 100 % Self-hosted",
    ])

    pdf.h2("1.2  DSGVO-Konformitat")
    pdf.body(
        "BR-DMS ist so konzipiert, dass es die Anforderungen der DSGVO erfullt. "
        "Alle Dokumente werden verschlusselt gespeichert. Es existiert kein externer "
        "Zugriff auf die Datenbank oder den Speicher. Der Audit-Log zeichnet jede "
        "Aktion mit Zeitstempel, Benutzer-ID, IP-Adresse und User-Agent auf."
    )
    pdf.info_box(
        "Der ENCRYPTION_KEY verschlusselt alle gespeicherten Dokumente mit AES-256. "
        "Bei Verlust dieses Schlusselswaren alle Dokumente dauerhaft unlesbar. "
        "Sichern Sie diesen Schlussel separat und sicher!",
        C_ORANGE, "Wichtig:"
    )

    # ════════════════════════════════════════════════════════════════
    # 2. TECHNOLOGIE
    # ════════════════════════════════════════════════════════════════
    pdf.h1("2  Technologiebeschreibung")

    pdf.h2("2.1  Stack-Ubersicht")
    pdf.table(
        ["Schicht", "Technologie", "Version", "Zweck"],
        [
            ["Backend",    "Fastify (Node.js)",      "4.x",  "REST-API, Geschaftslogik"],
            ["ORM",        "Prisma",                 "5.x",  "Datenbankzugriff, Schema-Migration"],
            ["Datenbank",  "PostgreSQL",             "16",   "Relationale Datenhaltung"],
            ["Frontend",   "React + Vite",           "18/5", "Benutzeroberflache (SPA)"],
            ["Styling",    "Tailwind CSS",           "3.x",  "UI-Design"],
            ["Webserver",  "Nginx (im Container)",   "1.25", "Frontend-Auslieferung"],
            ["Container",  "Docker + Compose",       "-",    "Deployment & Isolation"],
            ["Editor",     "TipTap",                 "2.x",  "Rich-Text (Sitzungseditor)"],
            ["PDF",        "pdftotext (Poppler)",    "-",    "Volltextextraktion aus PDFs"],
        ],
        [32, 52, 22, 64],
    )

    pdf.h2("2.2  Sicherheitsarchitektur")
    pdf.body(
        "Alle sicherheitskritischen Komponenten sind voneinander isoliert. Die "
        "Datenbank hat kein Port-Mapping und ist nur uber das interne Docker-Netz "
        "'brdms_net' erreichbar. Dokumente werden beim Speichern sofort verschlusselt "
        "und erst beim Download entschlusselt."
    )
    pdf.table(
        ["Mechanismus", "Details"],
        [
            ["AES-256-Verschlusselung", "Alle Dokumente im Storage-Ordner (.enc)"],
            ["JWT-Authentifizierung",   "8-Stunden-Token; signiertmit JWT_SECRET"],
            ["Passworter",             "Bcrypt-Hash; Minimum 8 Zeichen"],
            ["RBAC",                   "5 Rollen; jede Route pruft Berechtigung"],
            ["Audit-Trail",            "40+ Aktionen; unveranderlich gespeichert"],
            ["Passwort-Reset",         "Email-Token mit 1-Stunde Gultigkeitsdauer"],
        ],
        [70, 100],
    )

    pdf.h3("Netzwerk-Ports")
    pdf.table(
        ["Dienst", "Port", "Erreichbar von"],
        [
            ["Frontend (Nginx)", "3000", "Intranet"],
            ["Backend (Fastify)", "4000", "Intranet"],
            ["PostgreSQL", "intern", "Nur Docker-intern (kein Port-Mapping)"],
        ],
        [50, 30, 90],
    )

    # ════════════════════════════════════════════════════════════════
    # 3. INSTALLATION
    # ════════════════════════════════════════════════════════════════
    pdf.h1("3  Installation")

    pdf.h2("3.1  Voraussetzungen")
    pdf.table(
        ["Komponente", "Mindestanforderung", "Empfehlung"],
        [
            ["Synology NAS",     "DSM 7.0+",          "DSM 7.2+"],
            ["Docker",          "20.10+",             "24.x"],
            ["Docker Compose",  "V2 (Plugin)",        "V2.20+"],
            ["RAM",             "2 GB",               "4 GB"],
            ["Speicher",        "20 GB",              "100 GB+"],
            ["Netzwerk",        "100 Mbit/s LAN",     "Gigabit LAN"],
        ],
        [55, 50, 65],
    )
    pdf.body("Auf dem Entwickler-PC fur das Deployment:")
    pdf.bullets([
        "SSH-Zugriff zur NAS (Key-basiert empfohlen)",
        "Python 3.8+ (fur deploy_komplett.py)",
        "bash (fur deploy_update.sh) bzw. PowerShell (Windows)",
    ])

    pdf.h2("3.2  Schritt-fur-Schritt")
    pdf.step_box(1, "Repository vorbereiten",
        "Das Release-Verzeichnis enthalt alle benotigten Dateien (backend/, frontend/, "
        "docker-compose.yml, deploy-Skripte). Klonen Sie das Repository oder entpacken "
        "Sie das Release-Archiv in ein lokales Verzeichnis.")
    pdf.step_box(2, ".env.deploy anlegen",
        "Erstellen Sie eine Datei .env.deploy im Release-Verzeichnis mit folgendem Inhalt:\n"
        "NAS_USER=nasuser\n"
        "NAS_HOST=192.168.1.100\n"
        "DATA_PATH=/volume1/docker/br-dms")
    pdf.step_box(3, ".env auf der NAS anlegen",
        "Verbinden Sie sich per SSH mit der NAS und legen Sie die Hauptkonfiguration an:\n"
        "ssh nasuser@192.168.1.100\n"
        "nano /volume1/docker/br-dms/.env\n\n"
        "Fullen Sie alle Pflichtfelder aus (siehe Abschnitt 3.3).")
    pdf.step_box(4, "Deployment ausfuhren",
        "Fuhren Sie auf dem Entwickler-PC aus:\n"
        "bash deploy_update.sh\n\n"
        "Alternativ fur vollstandige Neuinstallation:\n"
        "python3 deploy_komplett.py")
    pdf.step_box(5, "Container starten",
        "Auf der NAS per SSH:\n"
        "cd /volume1/docker/br-dms\n"
        "sudo /usr/local/bin/docker compose up -d --build\n\n"
        "Beim ersten Start lauft prisma db push automatisch und legt alle "
        "Tabellen an.")
    pdf.step_box(6, "Erstes Login",
        "Offnen Sie http://<NAS-IP>:3000 im Browser. Erstellen Sie den ersten "
        "Admin-Benutzer uber die Benutzerverwaltung oder nutzen Sie das Setup-Wizard-Skript.")

    pdf.h2("3.3  Umgebungsvariablen")
    pdf.body("Die .env-Datei liegt NUR auf der NAS unter /volume1/docker/br-dms/.env")
    pdf.table(
        ["Variable", "Pflicht", "Beschreibung", "Beispielwert"],
        [
            ["POSTGRES_USER",     "Ja",  "Datenbankbenutzer",              "brdms"],
            ["POSTGRES_PASSWORD", "Ja",  "Datenbankpasswort (32+ Zeichen)","xyz123..."],
            ["POSTGRES_DB",       "Ja",  "Datenbankname",                  "brdms"],
            ["JWT_SECRET",        "Ja",  "Token-Signaturschlussel (32 Hex)","openssl rand -hex 32"],
            ["ENCRYPTION_KEY",    "Ja",  "AES-256 Dokumentschlussel (64 Hex)","openssl rand -hex 64"],
            ["NODE_ENV",          "Ja",  "Betriebsmodus",                  "production"],
            ["BACKEND_PORT",      "Nein","Backend-Port",                   "4000"],
            ["FRONTEND_PORT",     "Nein","Frontend-Port",                  "3000"],
            ["NAS_IP",            "Ja",  "IP-Adresse der NAS",             "192.168.1.100"],
            ["APP_URL",           "Ja",  "URL fur Passwort-Reset-Emails",  "http://192.168.1.100:3000"],
            ["SMTP_HOST",         "Nein","SMTP-Server fur E-Mails",        "smtp.ionos.de"],
            ["SMTP_PORT",         "Nein","SMTP-Port",                      "587"],
            ["SMTP_USER",         "Nein","SMTP-Benutzername",              "user@domain.de"],
            ["SMTP_PASS",         "Nein","SMTP-Passwort",                  "..."],
            ["SMTP_FROM",         "Nein","Absenderadresse",                "BR-DMS <br@domain.de>"],
            ["WATCH_FOLDER_ENABLED","Nein","Watch Folder aktivieren",      "false"],
            ["SYSTEM_USER_ID",    "Nein","User-ID fur Watch Folder",       "<UUID>"],
            ["PUID",              "Nein","Benutzer-ID fur Dateirechte",    "1000"],
            ["PGID",              "Nein","Gruppen-ID fur Dateirechte",     "100"],
        ],
        [45, 14, 60, 51],
    )

    pdf.h2("3.4  Erststart & Admin-Konto")
    pdf.body(
        "Beim ersten Start existieren noch keine Benutzer. Erstellen Sie den ersten "
        "Administrator uber das mitgelieferte Skript:"
    )
    pdf.code(
        "# Auf der NAS ausfuhren:\n"
        "cd /volume1/docker/br-dms\n"
        "sudo /usr/local/bin/docker exec brdms_backend \\\n"
        "  node -e \"require('./dist/scripts/create-admin').run()\""
    )
    pdf.body(
        "Alternativ kann uber den setup_wizard.py auf dem Entwickler-PC ein "
        "initialer Benutzer angelegt werden. Nach dem ersten Login sollte sofort "
        "das Passwort geandert werden."
    )

    # ════════════════════════════════════════════════════════════════
    # 4. MODULUBERSICHT
    # ════════════════════════════════════════════════════════════════
    pdf.h1("4  Modulubersicht")

    pdf.h2("4.1  Dashboard")
    pdf.body(
        "Das Dashboard ist die Startseite nach dem Login. Es zeigt eine "
        "Ubersicht uber aktuelle Aktivitaten, offene Fristen, ungelesene "
        "Dokumente im Eingang sowie anstehende Aufgaben."
    )
    pdf.bullets([
        "Schnellzugriff auf ungelesene Dokumente",
        "Ubersicht offener und abgelaufener Fristen",
        "Offene Aufgaben (eigene und offentliche)",
        "Letzte Sitzungsaktivitaten",
    ])

    pdf.h2("4.2  Dokumenteneingang (Inbox)")
    pdf.body(
        "Der Eingang zeigt alle neu eingegangenen Dokumente, die noch nicht als "
        "gelesen markiert wurden. Dokumente konnen hier initial bearbeitet, "
        "kategorisiert und weiterverarbeitet werden."
    )
    pdf.bullets([
        "Ungelesene Dokumente werden hervorgehoben",
        "Eingang-Quelle wird angezeigt (Upload / Watch Folder)",
        "Direkte Aktionen: Als gelesen markieren, Frist setzen, TOP verknupfen",
        "Vertrauliche Dokumente nur fur VORSITZ und ADMIN sichtbar",
    ])

    pdf.h2("4.3  Dokumentenarchiv")
    pdf.body(
        "Das Archiv enthalt alle Dokumente des Systems. Uber Filter und Volltextsuche "
        "konnen Dokumente schnell gefunden werden."
    )
    pdf.table(
        ["Funktion", "Beschreibung"],
        [
            ["Upload",         "PDF, DOCX, DOCM, XLSX; max. 50 MB"],
            ["Kategorien",     "§ 99, § 102, Bewerbung alternativ, Protokoll, BV, Sonstiges"],
            ["Metadaten",      "Titel, Alias, Tags, Aktenzeichen, Beschreibung, Vertraulich"],
            ["Versionen",      "Beliebig viele Versionen mit Anderungsnotiz"],
            ["Suche",          "Volltext (Titel, Alias, Textinhalt, Aktenzeichen)"],
            ["Fristen",        "Automatisch oder manuell; farbcodiert nach Status"],
            ["Loschung",       "Weiche Loschung → Aufbewahrungsfrist → endgultige Loschung"],
        ],
        [45, 125],
    )

    pdf.h2("4.4  Sitzungsverwaltung")
    pdf.body(
        "Die Sitzungsverwaltung deckt den vollstandigen Lebenszyklus einer "
        "Betriebsratssitzung ab – von der Planung bis zum rechtssicheren Protokoll."
    )
    pdf.table(
        ["Phase", "Status", "Mogliche Aktionen"],
        [
            ["Vorbereitung",       "ENTWURF",               "TOPs anlegen, bearbeiten, sortieren; Dokumente verknupfen"],
            ["Einladung",          "TAGESORDNUNG_FIXIERT",  "PDF autom. erzeugt; Einladung an alle Mitglieder versendet"],
            ["Protokollentwurf",   "PROTOKOLL_ENTWURF",     "Abstimmungen erfassen; Beschlusse; Anwesenheit; Kommentare"],
            ["Abschluss",          "PROTOKOLL_FINAL",       "Unveranderliches PDF mit Zeitstempel; digitale Signatur"],
        ],
        [35, 55, 80],
    )
    pdf.body(
        "Semantische Versionierung: 1.0 (Entwurf) → 1.1 (fixiert) → "
        "2.0 (Protokollentwurf) → 2.1 (Final). Jede Version wird als separates "
        "PDF gespeichert."
    )

    pdf.h2("4.5  Aufgaben")
    pdf.body(
        "Aufgaben konnen Dokumenten zugeordnet, Benutzern zugewiesen und mit "
        "Fristen und Prioritaten versehen werden."
    )
    pdf.bullets([
        "Prioritaten: HOCH / MITTEL / NIEDRIG",
        "Sichtbarkeit: Privat oder Offentlich",
        "Zuweisung an andere Betriebsratsmitglieder",
        "Verknupfung mit Dokumenten",
        "Erledigungsdatum wird gespeichert",
    ])

    pdf.h2("4.6  Posteingang (Nachrichten)")
    pdf.body(
        "Das interne Nachrichtensystem ermoglicht die Kommunikation zwischen "
        "Betriebsratsmitgliedern ohne externe Dienste."
    )
    pdf.bullets([
        "Einzelnachrichten an einen Benutzer",
        "Rundschreiben an alle aktiven Mitglieder",
        "Sitzungskontext: Tagesordnung / Protokoll als Anhang",
        "Lesestatus-Tracking",
    ])

    pdf.h2("4.7  Wissensarchiv")
    pdf.body(
        "Das Wissensarchiv speichert Erfahrungen, Entscheidungen und Losungen fur "
        "wiederkehrende Themen. Eintrage konnen manuell erstellt oder aus "
        "Protokollblocken extrahiert werden."
    )
    pdf.bullets([
        "Kategorien und freie Suche",
        "Herkunft: Manuell oder Protokoll-Extrakt",
        "Verlinkung zu Sitzung / TOP / Protokollblock",
        "Losungsfeld fur dokumentierte Vorgehensweisen",
    ])

    pdf.h2("4.8  Ressourcen")
    pdf.body(
        "Sammlung externer Links und Dokumente (Gesetze, Behorden, Vorlagen, "
        "KI-Werkzeuge). Kategorisiert und durchsuchbar."
    )

    pdf.h2("4.9  Themensammlung")
    pdf.body(
        "Themen und Anliegen konnen gesammelt und verwaltet werden, bevor sie "
        "in Tagesordnungspunkte ubernommen werden."
    )

    pdf.h2("4.10  Benutzerverwaltung")
    pdf.body(
        "Nur fur VORSITZ und ADMIN zuganglich. Benutzer konnen angelegt, "
        "deaktiviert und mit Rollen versehen werden."
    )
    pdf.table(
        ["Rolle", "Kurzbezeichnung", "Hauptrechte"],
        [
            ["VORSITZ",       "Vorsitzende/r",     "Vollzugriff; Benutzerverwaltung; Sitzung fixieren/finalisieren"],
            ["STELLVERTRETER","Stellvertreter/in",  "Wie VORSITZ, aber kein ADMIN erstellen"],
            ["MITGLIED",      "Mitglied",          "Dokumente hochladen/lesen; Abstimmungen; Protokollentwurf"],
            ["ERSATZMITGLIED","Ersatzmitglied",    "Wie MITGLIED; keine vertraulichen Dokumente"],
            ["ADMIN",         "Administrator",     "Technische Administration; Audit-Log; Einstellungen"],
        ],
        [32, 38, 100],
    )

    pdf.h2("4.11  Audit-Log")
    pdf.body(
        "Der Audit-Log ist schreibgeschutzt und unveranderlich. Er zeichnet alle "
        "sicherheitsrelevanten und inhaltlichen Aktionen auf. Zugriff nur fur "
        "VORSITZ und ADMIN."
    )
    pdf.bullets([
        "Login / Logout mit IP und Browser",
        "Alle Dokumentenaktionen (Upload, Download, Loschen, Metadaten)",
        "Alle Sitzungsaktionen (Erstellen, Fixieren, Finalisieren)",
        "Benutzerverwaltung (Erstellen, Deaktivieren, Passwort-Reset)",
        "Watch Folder Ereignisse",
        "Wissensarchiv-Anderungen",
        "Filterbar nach Benutzer, Aktion, Zeitraum",
    ])

    pdf.h2("4.12  Einstellungen")
    pdf.body(
        "Systemweite Konfiguration durch ADMIN. Enthalt Aufbewahrungsfristen pro "
        "Dokumentkategorie, Protokoll-Layout (Kopfzeile, Farbe, Unterschriften) "
        "und Logo-Upload."
    )
    pdf.table(
        ["Kategorie", "Standard-Aufbewahrung", "Rechtsgrundlage"],
        [
            ["ANHOERUNG_99 (§ 99)",           "1825 Tage (5 Jahre)",  "§ 99 BetrVG"],
            ["ANHOERUNG_102 (§ 102)",          "1825 Tage (5 Jahre)",  "§ 102 BetrVG"],
            ["BEWERBUNG_ALTERNATIV",           "180 Tage (6 Monate)",  "§ 99 BetrVG"],
            ["PROTOKOLL",                      "1460 Tage (4 Jahre)",  "§ 34 BetrVG"],
            ["BETRIEBSVEREINBARUNG",           "3650 Tage (10 Jahre)", "§ 77 BetrVG"],
            ["SONSTIGES",                      "1095 Tage (3 Jahre)",  "Individuell"],
        ],
        [60, 45, 65],
    )

    # ════════════════════════════════════════════════════════════════
    # 5. PROZESS
    # ════════════════════════════════════════════════════════════════
    pdf.h1("5  Prozess: Dokument bis Protokoll")
    pdf.body(
        "Dieser Abschnitt beschreibt den typischen Workflow eines Betriebsrats-"
        "dokuments von der Ankunft bis zum rechtssicheren Protokolleintrag."
    )

    pdf.h2("5.1  Dokument hochladen")
    pdf.step_box(1, "Dokument empfangen",
        "Das Dokument trifft ein – per E-Mail, Fax-Scan, direkter Upload oder "
        "automatisch uber den Watch Folder.")
    pdf.step_box(2, "Upload im System",
        "Klicken Sie im Bereich 'Dokumente' auf '+ Neues Dokument'. Wahlen Sie "
        "die Datei aus (PDF, DOCX, DOCM, XLSX; max. 50 MB) und vergeben Sie Titel "
        "und Kategorie.")
    pdf.step_box(3, "Automatische Verarbeitung",
        "Das System extrahiert den Volltext (bei PDFs), verschlusselt die Datei "
        "mit AES-256 und speichert alle Metadaten in der Datenbank. Ein Audit-"
        "Eintrag wird erzeugt.")
    pdf.step_box(4, "Inbox",
        "Das Dokument erscheint im Eingang aller berechtigten Benutzer als 'ungelesen'.")

    pdf.h2("5.2  Kategorisierung & Fristen")
    pdf.step_box(5, "Kategorie und Metadaten setzen",
        "Offnen Sie das Dokument und setzen Sie Kategorie, Aktenzeichen, Alias "
        "und ggf. Tags. Vertrauliche Dokumente nur fur VORSITZ/ADMIN sichtbar.")
    pdf.step_box(6, "Frist prufen/setzen",
        "Bei § 99- und § 102-Dokumenten werden Fristen automatisch vorgeschlagen. "
        "Uberprufen Sie die Frist und bestatigen oder passen Sie sie an.")
    pdf.table(
        ["Fristtyp", "Dauer", "Rechtsgrundlage"],
        [
            ["§ 99 Anhorung",              "1 Woche",        "§ 99 Abs. 3 BetrVG"],
            ["§ 102 ordentliche Kundigung","1 Woche",        "§ 102 Abs. 2 BetrVG"],
            ["§ 102 a.o. Kundigung",       "3 Tage",         "§ 102 Abs. 2 BetrVG"],
            ["Widerspruch",                "nach Ermessen",  "§ 102 Abs. 3 BetrVG"],
            ["Benutzerdefiniert",          "frei wahlbar",   "-"],
        ],
        [65, 35, 70],
    )

    pdf.h2("5.3  TOP-Verknupfung")
    pdf.step_box(7, "Tagesordnungspunkt erstellen oder verknupfen",
        "Uber 'Aktionen → Sitzung / TOP' kann das Dokument einem bestehenden "
        "TOP einer Sitzung zugeordnet oder direkt ein neuer TOP erstellt werden. "
        "Optional kann dabei automatisch eine Frist angelegt werden.")

    pdf.h2("5.4  Sitzungsvorbereitung")
    pdf.step_box(8, "Sitzung anlegen",
        "Im Bereich 'Sitzungen' → '+ Neue Sitzung'. Titel, Datum, Ort und "
        "Sitzungstyp angeben. Optional eine Vorlage verwenden.")
    pdf.step_box(9, "TOPs strukturieren",
        "TOPs hinzufugen, sortieren und mit Dokumenten verknupfen. "
        "Beschreibungen im Rich-Text-Editor (TipTap) formulieren.")
    pdf.step_box(10, "Tagesordnung fixieren",
        "VORSITZ klickt 'Fixieren': Version 1.1 wird erzeugt, ein PDF erstellt "
        "und automatisch eine Einladungsnachricht an alle Mitglieder versendet. "
        "Die Tagesordnung ist ab jetzt unveranderlich.")

    pdf.h2("5.5  Sitzungsdurchfuhrung")
    pdf.step_box(11, "Protokollentwurf starten",
        "VORSITZ klickt 'Protokoll starten': Status wechselt zu PROTOKOLL_ENTWURF. "
        "Version 2.0 wird erstellt.")
    pdf.step_box(12, "Anwesenheit erfassen",
        "Fur jeden Teilnehmer Anwesenheitsstatus setzen: ANWESEND, "
        "ABWESEND_ENTSCHULDIGT, ABWESEND_UNENTSCHULDIGT oder ERSATZ_FUER.")
    pdf.step_box(13, "Abstimmungen & Beschlusse",
        "Pro TOP konnen Abstimmungen mit Rechtsgrundlage, Fragestellung und "
        "Einzelstimmen (JA/NEIN/ENTHALTUNG) erfasst werden. "
        "Beschlusse werden separat dokumentiert.")
    pdf.step_box(14, "Protokolltext schreiben",
        "Im Rich-Text-Editor wird das Protokoll formuliert. Protokollblocke "
        "(Text, Abstimmung, Anwesenheit, TOP-Verweis) werden strukturiert.")

    pdf.h2("5.6  Protokoll finalisieren")
    pdf.step_box(15, "Finalisieren",
        "VORSITZ klickt 'Finalisieren': Version 2.1 wird erstellt. Das Protokoll "
        "wird READ-ONLY und erhalt einen digitalen Zeitstempel. Ein unveranderliches "
        "PDF wird gespeichert.")
    pdf.step_box(16, "Protokoll versenden",
        "Das fertige Protokoll kann als Nachricht an alle Mitglieder versendet "
        "werden. Optional: Extrakt in das Wissensarchiv ubernehmen.")
    pdf.info_box(
        "Nach der Finalisierung ist das Protokoll vollstandig unveranderlich. "
        "Zeitstempel und digitale Signatur gewahrleisten die Integritat.",
        C_GREEN, "Rechtssicherheit:"
    )

    # ════════════════════════════════════════════════════════════════
    # 6. DAILY BUSINESS
    # ════════════════════════════════════════════════════════════════
    pdf.h1("6  Daily Business")

    pdf.h2("6.1  Tagliche Aufgaben")
    pdf.table(
        ["Aufgabe", "Wer", "Wo im System"],
        [
            ["Eingang prufen",                "Alle Mitglieder",  "Eingang"],
            ["Fristen uberwachen",            "VORSITZ / STVERTR","Dashboard / Dokumente"],
            ["Aufgaben bearbeiten",           "Zugewiesene",      "Aufgaben"],
            ["Nachrichten lesen",             "Alle Mitglieder",  "Posteingang"],
            ["Audit-Log prufen",              "VORSITZ / ADMIN",  "Audit-Log"],
            ["Backup prufen",                 "ADMIN",            "NAS / backups/"],
            ["Ablaufende Dokumente verwalten","VORSITZ / ADMIN",  "Dokumente → Filter: Loschvormerkung"],
        ],
        [70, 40, 60],
    )

    pdf.h2("6.2  Watch Folder")
    pdf.body(
        "Der Watch Folder ermoglicht die automatische Aufnahme von Dokumenten "
        "ohne manuellen Upload. Dokumente werden in einem freigegebenen Netzwerkpfad "
        "abgelegt und vom System automatisch importiert."
    )
    pdf.table(
        ["Einstellung", "Wert"],
        [
            ["Aktivierung",          "WATCH_FOLDER_ENABLED=true in .env"],
            ["Uberwachter Ordner",   "/data/watch_inbox (im Container)"],
            ["NAS-Pfad",             "/volume1/docker/br-dms/watch_inbox"],
            ["Importbenutzer",       "SYSTEM_USER_ID=<UUID des Admin-Users>"],
            ["Unterstuzte Formate",  "PDF, DOCX, DOCM, XLSX"],
            ["Protokollierung",      "Audit-Log: WATCHFOLDER_DATEI_EMPFANGEN / WATCHFOLDER_FEHLER"],
            ["Log einsehen",         "Admin → Watchfolder-Log"],
        ],
        [55, 115],
    )
    pdf.info_box(
        "Dateien im Watch-Folder-Ordner erscheinen nach dem Import im Eingang des "
        "SYSTEM_USER. Dieser sollte ein dedizierter Systembenutzer (nicht VORSITZ) sein.",
        C_BLUE_LIGHT
    )

    # ════════════════════════════════════════════════════════════════
    # 7. ROLLEN
    # ════════════════════════════════════════════════════════════════
    pdf.h1("7  Rollen & Berechtigungen")
    pdf.body(
        "BR-DMS verwendet ein rollenbasiertes Zugriffsmodell (RBAC) mit 5 Rollen. "
        "Jede Route im Backend pruft die Rolle des eingeloggten Benutzers."
    )
    pdf.table(
        ["Berechtigung", "VORSITZ", "STELLVERTR.", "MITGLIED", "ERSATZ", "ADMIN"],
        [
            ["Dokumente hochladen",         "Ja", "Ja",  "Ja",  "Ja",   "Ja"],
            ["Dokumente lesen",             "Ja", "Ja",  "Ja",  "Ja",   "Ja"],
            ["Vertrauliche Dokumente",       "Ja", "Ja",  "Nein","Nein", "Ja"],
            ["Dokumente loschen",           "Ja", "Ja",  "Nein","Nein", "Ja"],
            ["Sitzung erstellen",           "Ja", "Ja",  "Ja",  "Nein", "Nein"],
            ["Sitzung fixieren",            "Ja", "Ja",  "Nein","Nein", "Nein"],
            ["Sitzung finalisieren",        "Ja", "Ja",  "Nein","Nein", "Nein"],
            ["Protokoll schreiben",         "Ja", "Ja",  "Ja",  "Nein", "Nein"],
            ["Benutzer anlegen",            "Ja", "Ja",  "Nein","Nein", "Ja"],
            ["ADMIN anlegen",               "Nein","Nein","Nein","Nein", "Ja"],
            ["Audit-Log einsehen",          "Ja", "Ja",  "Nein","Nein", "Ja"],
            ["Einstellungen andern",        "Nein","Nein","Nein","Nein", "Ja"],
            ["Aufbewahrungsfristen setzen", "Nein","Nein","Nein","Nein", "Ja"],
            ["Abstimmung erfassen",         "Ja", "Ja",  "Ja",  "Nein", "Nein"],
            ["Wissensarchiv bearbeiten",    "Ja", "Ja",  "Ja",  "Ja",   "Nein"],
        ],
        [70, 18, 22, 18, 16, 16],
    )

    # ════════════════════════════════════════════════════════════════
    # 8. DATENBANK
    # ════════════════════════════════════════════════════════════════
    pdf.h1("8  Datenbankubersicht")

    pdf.h2("8.1  Haupttabellen")
    pdf.table(
        ["Tabelle", "Beschreibung", "Wichtige Felder"],
        [
            ["Benutzer",        "Benutzerkonten",
             "id, email, name, rolle, aktiv, letzterLogin"],
            ["Dokument",        "Dokumente (Metadaten)",
             "id, titel, kategorie, status, verschlPfad, vertraulich, deleteAt"],
            ["DokumentVersion", "Dokumentversionen",
             "id, dokumentId, version, dateiname, aenderungsnotiz"],
            ["Sitzung",         "Betriebsratssitzungen",
             "id, titel, sitzungsdatum, status, sitzungstyp"],
            ["SitzungVersion",  "Sitzungsversionen (inkl. PDF)",
             "id, sitzungId, versionNummer, readonly, pdfPfad, zeitstempel"],
            ["TOP",             "Tagesordnungspunkte",
             "id, sitzungId, nummer, titel, status, spontan"],
            ["Abstimmung",      "Abstimmungen je TOP",
             "id, topId, fragestellung, jaStimmen, neinStimmen, enthaltungen"],
            ["Beschluss",       "Beschlusse je TOP",
             "id, topId, antragstext, rechtsgrundlage, ergebnis, finalisiert"],
            ["Anwesenheit",     "Anwesenheit je Sitzung",
             "id, sitzungId, benutzerId, status, vertretungFuerId"],
            ["Frist",           "Rechtliche Fristen",
             "id, dokumentId, typ, status, faelligAm, bezeichnung"],
            ["Aufgabe",         "Aufgaben/Tasks",
             "id, titel, prioritaet, faelligAm, erledigt, sichtbarkeit"],
            ["Nachricht",       "Interne Nachrichten",
             "id, betreff, inhalt, typ, absenderId, empfaengerId, gelesen"],
            ["AuditLog",        "Unveranderlicher Audit-Trail",
             "id, benutzerId, aktion, ip, userAgent, details, zeitpunkt"],
            ["WissensEintrag",  "Wissensarchiv",
             "id, titel, inhalt, herkunft, kategorien, loesung"],
            ["Ressource",       "Externe Ressourcen/Links",
             "id, titel, url, kategorie, tags"],
            ["Aufbewahrungsregel","Aufbewahrungsfristen",
             "kategorie, tage, rechtsgrundlage"],
        ],
        [38, 40, 92],
    )

    pdf.h2("8.2  Enumerationen")
    pdf.table(
        ["Enum", "Werte"],
        [
            ["Role",             "VORSITZ | STELLVERTRETER | MITGLIED | ERSATZMITGLIED | ADMIN"],
            ["Kategorie",        "ANHOERUNG_99 | ANHOERUNG_102 | BEWERBUNG_ALTERNATIV | PROTOKOLL | BETRIEBSVEREINBARUNG | SONSTIGES"],
            ["DokumentStatus",   "AKTIV | ARCHIVIERT | LOESCHVORMERKUNG | GELOESCHT"],
            ["SitzungStatus",    "ENTWURF | TAGESORDNUNG_FIXIERT | PROTOKOLL_ENTWURF | PROTOKOLL_FINAL | ABGESAGT"],
            ["TopStatus",        "OFFEN | BESCHLOSSEN | ABGELEHNT | VERTAGT | ZUR_KENNTNIS"],
            ["FristTyp",         "ANHOERUNG_99_WOCHE | ANHOERUNG_102_ORDENTLICH | ANHOERUNG_102_AUSSERORDENTLICH | WIDERSPRUCH | BENUTZERDEFINIERT"],
            ["FristStatus",      "OFFEN | ERLEDIGT | ABGELAUFEN"],
            ["Prioritaet",       "HOCH | MITTEL | NIEDRIG"],
            ["Stimme",           "JA | NEIN | ENTHALTUNG"],
            ["NachrichtTyp",     "NORMAL | TAGESORDNUNG | PROTOKOLL | SYSTEM"],
            ["AnwesenheitsStatus","ANWESEND | ABWESEND_ENTSCHULDIGT | ABWESEND_UNENTSCHULDIGT | ERSATZ_FUER"],
        ],
        [45, 125],
    )

    # ════════════════════════════════════════════════════════════════
    # 9. BACKUP & RESTORE
    # ════════════════════════════════════════════════════════════════
    pdf.h1("9  Backup & Restore")

    pdf.h2("9.1  Backup erstellen")
    pdf.body(
        "Ein vollstandiges Backup besteht aus zwei Teilen: dem PostgreSQL-Datenbankdump "
        "und dem Storage-Archiv mit den verschlusselten Dokumenten. Das mitgelieferte "
        "Skript backup.sh erledigt beides automatisch."
    )
    pdf.code(
        "# Manuelles Backup auf der NAS:\n"
        "sudo bash /volume1/docker/br-dms/backup.sh\n\n"
        "# Ergebnis in /volume1/docker/br-dms/backups/:\n"
        "#   db_20260509_143000.sql.gz       (Datenbankdump)\n"
        "#   storage_20260509_143000.tar.gz  (Dokumente)"
    )
    pdf.body("Backups altern als 30 Tage werden automatisch geloscht.")

    pdf.h2("9.2  Wiederherstellung")
    pdf.body(
        "Das Skript restore.sh fuhrt interaktiv durch den Wiederherstellungsprozess. "
        "Es stoppt zunachst den Backend-Container, spielt DB und Storage ein und "
        "startet den Container wieder."
    )
    pdf.code(
        "# Interaktive Wiederherstellung:\n"
        "sudo bash /volume1/docker/br-dms/restore.sh\n\n"
        "# Das Skript:\n"
        "# 1. Listet verfugbare Backups zur Auswahl\n"
        "# 2. Fragt ob Storage-Backup auch eingespielt werden soll\n"
        "# 3. Verlangt Bestatigung ('ja') vor dem Uberschreiben\n"
        "# 4. Stoppt Backend, stellt DB her, startet Backend neu"
    )
    pdf.info_box(
        "Die aktuelle Datenbank wird beim Restore uberschrieben. Stellen Sie sicher, "
        "dass Sie das richtige Backup ausgewahlt haben. "
        "Die Bestatigung 'ja' muss explizit eingegeben werden.",
        C_ORANGE, "Achtung:"
    )

    pdf.h2("9.3  Automatisierung (Synology Task Scheduler)")
    pdf.body(
        "Fur tagliche automatische Backups den Synology Task Scheduler einrichten:"
    )
    pdf.table(
        ["Einstellung", "Wert"],
        [
            ["Aufgabentyp",    "Geplante Aufgabe → Benutzerdefiniertes Skript"],
            ["Benutzer",       "root"],
            ["Zeitplan",       "Taglich, z. B. 02:00 Uhr"],
            ["Skript",         "bash /volume1/docker/br-dms/backup.sh"],
            ["Benachrichtigung","E-Mail bei Fehler (optional)"],
        ],
        [40, 130],
    )
    pdf.body(
        "Der Synology Task Scheduler findet sich unter: Systemsteuerung → "
        "Aufgabenplaner."
    )
    pdf.info_box(
        "Sichern Sie den ENCRYPTION_KEY zusatzlich extern (z. B. Passwortmanager, "
        "verschlusselt auf einem anderen Medium). Ohne diesen Schlussel sind alle "
        "gespeicherten Dokumente dauerhaft unlesbar – auch mit vollstandigem Backup.",
        C_ORANGE, "Kritisch: ENCRYPTION_KEY"
    )

    # ── Speichern ────────────────────────────────────────────────────
    pdf.output(OUT)
    print(f"PDF erstellt: {OUT}")


if __name__ == "__main__":
    build()
