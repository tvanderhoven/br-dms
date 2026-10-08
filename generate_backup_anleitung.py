#!/usr/bin/env python3
"""Erzeugt die Anleitung „Sicherung und Wiederherstellung“ als eigenes PDF.

Teil I erklärt das Konzept für das Gremium (ohne Technik), Teil II und III sind die
Schritt-für-Schritt-Anleitungen zum Einrichten der Sicherung und zum Wiederherstellen,
Teil IV enthält die Vordrucke (Schlüsselblatt, Protokoll des Wiederherstellungstests).

Nutzt Layout, Schriften und Farben des Handbuchs (generate_manual.py).
Aufruf: python3 generate_backup_anleitung.py  → BR-DMS_Backup-Anleitung.pdf
"""
import os

from fpdf.enums import XPos, YPos

from generate_manual import (
    Manual, inhaltsverzeichnis, BASIS, VERSION, STAND, AUTOR, SUPPORT,
    C_INK, C_INK_SOFT, C_RED, C_GREY, C_LINE, C_PAPER, C_WHITE, C_GREEN, C_GREEN_SOFT,
    C_AMBER, C_AMBER_SOFT,
)

OUT = os.path.join(BASIS, "BR-DMS_Backup-Anleitung.pdf")
TITEL = "Sicherung und Wiederherstellung"


class Anleitung(Manual):
    def __init__(self):
        super().__init__()
        self.set_title(f"BR-DMS – {TITEL}")

    def header(self):
        if self.ohne_kopf:
            return
        self.set_y(11)
        self.set_font("S", "B", 8)
        self.set_text_color(*C_INK)
        self.cell(12, 6, "BR-DMS")
        self.set_font("S", "", 8)
        self.set_text_color(*C_INK_SOFT)
        self.cell(100, 6, TITEL)
        self.cell(0, 6, f"Version {VERSION}  ·  {STAND}", align="R",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*C_LINE)
        self.set_line_width(0.3)
        self.line(self.l_margin, self.get_y() + 1, self.w - self.r_margin, self.get_y() + 1)
        self.set_y(24)
        self.set_text_color(*C_INK)

    # ── Kästen für die Übersichtsgrafik ──────────────────────────────
    def kasten(self, x, y, b, h, titel, text, hg=C_PAPER, akzent=C_INK):
        self.set_fill_color(*hg)
        self.rect(x, y, b, h, "F")
        self.set_fill_color(*akzent)
        self.rect(x, y, b, 1.4, "F")
        self.set_xy(x + 3, y + 4)
        self.set_font("S", "B", 9.5)
        self.set_text_color(*C_INK)
        self.multi_cell(b - 6, 5, titel, align="L", new_x=XPos.LEFT, new_y=YPos.NEXT)
        self.set_x(x + 3)
        self.set_font("S", "", 8.5)
        self.set_text_color(*C_INK_SOFT)
        self.multi_cell(b - 6, 4.4, text, align="L", new_x=XPos.LEFT, new_y=YPos.NEXT)
        self.set_text_color(*C_INK)

    def pfeil(self, x1, y, x2, beschriftung):
        self.set_draw_color(*C_RED)
        self.set_line_width(0.6)
        self.line(x1, y, x2 - 2, y)
        self.set_fill_color(*C_RED)
        self.polygon([(x2, y), (x2 - 3, y - 1.8), (x2 - 3, y + 1.8)], style="F")
        self.set_font("S", "B", 7.5)
        self.set_text_color(*C_RED)
        zeilen = beschriftung.count("\n") + 1
        self.set_xy(x1, y - 2 - zeilen * 3.4)
        self.multi_cell(x2 - x1, 3.4, beschriftung, align="C")
        self.set_text_color(*C_INK)
        self.set_line_width(0.3)

    # ── Vordruck: beschriftete Linie zum Ausfüllen ───────────────────
    def feld(self, label, breite_label=48, hoehe=9):
        y = self.get_y()
        self.set_font("S", "", 9.5)
        self.set_text_color(*C_INK_SOFT)
        self.cell(breite_label, hoehe, label)
        self.set_draw_color(*C_GREY)
        self.line(self.l_margin + breite_label, y + hoehe - 1.5, self.w - self.r_margin, y + hoehe - 1.5)
        self.set_text_color(*C_INK)
        self.set_y(y + hoehe + 1)

    def schluesselzeile(self, name):
        """Vier Blöcke à 16 Kästchen für einen 64-stelligen Schlüssel."""
        self.set_font("S", "B", 10)
        self.cell(0, 7, name, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        kaestchen, abstand = 4.6, 3.2
        self.set_draw_color(*C_GREY)
        for zeile in range(2):
            y = self.get_y()
            x = self.l_margin
            for block in range(2):
                for _ in range(16):
                    self.rect(x, y, kaestchen, 6.2)
                    x += kaestchen
                x += abstand
                if block == 0:
                    self.set_font("S", "", 7)
                    self.set_text_color(*C_GREY)
            self.set_font("S", "", 7)
            self.set_text_color(*C_GREY)
            self.set_xy(x + 1, y + 1)
            self.cell(0, 4.5, f"Zeichen {zeile * 32 + 1}–{zeile * 32 + 32}")
            self.set_text_color(*C_INK)
            self.set_y(y + 8.5)
        self.ln(2)


def build():
    pdf = Anleitung()

    # ── Titelseite ───────────────────────────────────────────────────
    pdf.add_page()
    pdf.set_fill_color(*C_INK)
    pdf.rect(0, 0, pdf.w, pdf.h, "F")
    pdf.set_xy(20, 70)
    pdf.set_font("S", "B", 12)
    pdf.set_text_color(*C_GREY)
    pdf.cell(0, 8, "ANLEITUNG", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.image(os.path.join(BASIS, "branding", "logo-hell.svg"), x=20, y=84, w=92)
    pdf.set_xy(20, 124)
    pdf.set_font("S", "B", 22)
    pdf.set_text_color(*C_WHITE)
    pdf.multi_cell(160, 10, TITEL, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)
    pdf.set_x(20)
    pdf.set_font("S", "", 13)
    pdf.set_text_color(210, 211, 214)
    pdf.multi_cell(150, 7, "Das Konzept für das Gremium, das Einrichten der Sicherung\n"
                           "und die Wiederherstellung im Ernstfall",
                   new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_xy(20, 236)
    pdf.set_font("S", "", 10)
    pdf.set_text_color(*C_GREY)
    for k, v in [("Version", VERSION), ("Stand", STAND), ("Autor", AUTOR), ("Kontakt", SUPPORT)]:
        pdf.set_x(20)
        pdf.cell(24, 6.2, k)
        pdf.set_text_color(230, 230, 232)
        pdf.cell(0, 6.2, v, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(*C_GREY)

    pdf.add_page()
    pdf.inhalt_platzhalter(inhaltsverzeichnis, 1)
    pdf.ohne_kopf = False

    # ════════════════════════════════════════════════════════════════
    #  TEIL I – DAS KONZEPT
    # ════════════════════════════════════════════════════════════════
    pdf.teil("I", "Das Konzept",
             "Für das Gremium: was gesichert wird, wogegen die Sicherung schützt, wer was lesen "
             "kann und warum die Schlüssel so wichtig sind. Ohne Technik.")

    pdf.h1("1  Auf einen Blick")
    pdf.body(
        "BR-DMS enthält alles, was der Betriebsrat schriftlich festhält: Sitzungen, Protokolle, "
        "Beschlüsse, Anhörungen, Personal- und Gehaltsdaten. Geht das verloren, ist die Arbeit von "
        "Jahren weg – und mit ihr der Nachweis, dass Fristen eingehalten und Beschlüsse ordnungsgemäß "
        "gefasst wurden. Die Sicherung ist deshalb in drei Stufen aufgebaut, und sie ist so verschlüsselt, "
        "dass eine Kopie außer Haus liegen kann, ohne dass jemand anderes sie lesen kann."
    )

    # Übersichtsgrafik
    pdf.ln(2)
    y = pdf.get_y()
    pdf.kasten(20, y, 44, 40, "BR-DMS auf dem NAS",
               "Im Serverraum. Zwei gespiegelte Platten (RAID 1) und Snapshots.")
    pdf.pfeil(65, y + 20, 85, "jede Nacht\nverschlüsselt")
    pdf.kasten(85, y, 42, 40, "Sicherung auf dem NAS",
               "30 Tage, als verschlüsselte Dateien.", C_GREEN_SOFT, C_GREEN)
    pdf.pfeil(128, y + 20, 146, "Kopie")
    pdf.kasten(146, y, 44, 40, "Kopie bei der IT",
               "Getrennter Ort. Die IT kann die Dateien aufbewahren, aber nicht lesen.",
               C_GREEN_SOFT, C_GREEN)
    pdf.kasten(85, y + 46, 105, 24, "Die zwei Schlüssel",
               "Ausgedruckt und verschlossen beim Betriebsrat – nicht auf dem NAS, nicht bei der IT. "
               "Nur mit ihnen lässt sich eine Sicherung wieder lesen.", C_AMBER_SOFT, C_AMBER)
    pdf.set_y(y + 76)

    pdf.h2("1.1  Was gesichert wird")
    pdf.tabelle(
        ["Teil", "Inhalt", "Gesichert"],
        [
            ["Datenbank", "Sitzungen, Protokolle, Beschlüsse, Fristen, Aufgaben, Benutzer, Personal- und "
             "Gehaltsdaten, Audit-Log, Suchtext der Dokumente", "jede Nacht"],
            ["Dokumente", "Alle hochgeladenen Dateien, Scans und Fremdprotokolle (schon einzeln verschlüsselt)",
             "jede Nacht"],
            ["Schlüssel", "ENCRYPTION_KEY (Dokumente) und BACKUP_KEY (Sicherung)",
             "einmal, auf Papier"],
            ["Zertifikat, Einstellungen des Servers", "Lassen sich bei einer Neuinstallation neu erzeugen",
             "nicht nötig"],
        ],
        (34, 104, 32),
    )

    pdf.h2("1.2  Wogegen was schützt")
    pdf.body(
        "Keine Maßnahme allein reicht. Erst zusammen decken sie die üblichen Schadensfälle ab:"
    )
    j, n = "ja", "–"
    pdf.tabelle(
        ["Schadensfall", "RAID 1", "Snapshots", "Kopie bei der IT"],
        [
            ["Eine Festplatte fällt aus", j, n, j],
            ["Versehentlich gelöscht oder überschrieben", n, j, j],
            ["Verschlüsselungstrojaner auf dem NAS", n, "ja¹", j],
            ["NAS defekt, gestohlen, Brand, Wasser", n, n, j],
            ["Fehler nach einem Update", n, j, j],
        ],
        (76, 28, 30, 36),
    )
    pdf.body(
        "¹ Snapshots sind schreibgeschützt; ein Trojaner, der nur die Dateien verschlüsselt, kann sie "
        "nicht verändern. Wer aber die Verwaltung des NAS übernimmt, kann auch Snapshots löschen – "
        "deshalb zusätzlich die Kopie außer Haus."
    )
    pdf.hinweis(
        "RAID 1 spiegelt jede Änderung sofort auf die zweite Platte – auch ein versehentliches Löschen "
        "oder eine Verschlüsselung durch einen Trojaner. RAID schützt nur gegen den Ausfall einer Platte "
        "und ersetzt keine Sicherung.", "wichtig", "RAID ist kein Backup")
    pdf.hinweis(
        "Die Sicherung wird mit AES-256 verschlüsselt (AES-256-CBC, OpenSSL) – dem Standard, den auch "
        "Behörden und Banken einsetzen. Der BACKUP_KEY ist ein 256-Bit-Zufallswert; der eigentliche "
        "Schlüssel wird per PBKDF2 (HMAC-SHA256, 600.000 Durchläufe, eigener Zufalls-Salt je Datei) daraus "
        "abgeleitet. Ohne den Schlüssel lassen sich die Dateien nach heutigem Stand der Technik nicht "
        "lesen. Die Schwachstelle ist nicht die Mathematik, sondern der Ort, an dem der Ausdruck des "
        "Schlüssels liegt (Kapitel 2.1).", "tipp", "Wie stark ist die Verschlüsselung?")

    pdf.h1("2  Wer kann was lesen?")
    pdf.body(
        "Die häufigste Sorge im Gremium: Liegt eine Kopie bei der IT, kann dann die IT – oder der "
        "Arbeitgeber – unsere Daten lesen? Die Antwort hängt an den Schlüsseln."
    )
    pdf.tabelle(
        ["Wer", "Hat", "Kann lesen?"],
        [
            ["IT mit der Sicherungskopie", "verschlüsselte Dateien, keinen Schlüssel",
             "Nein – ohne BACKUP_KEY sind die Dateien wertlos"],
            ["Jemand mit einer Platte aus dem NAS", "Dokumente verschlüsselt, Datenbank offen",
             "Dokumente nein; Datenbank ja, falls das NAS-Volume nicht verschlüsselt ist"],
            ["Wer das NAS verwaltet (Admin)", "Zugriff auf alles auf dem NAS, auch die Schlüssel in der .env",
             "Technisch ja – deshalb muss geregelt sein, wer das ist"],
            ["Mitglieder in BR-DMS", "Anmeldung mit eigener Rolle",
             "Nur, was ihre Rolle erlaubt (Handbuch Kapitel 10)"],
        ],
        (44, 62, 64),
    )
    pdf.hinweis(
        "Die Verschlüsselung schützt Kopien, die das NAS verlassen. Gegen jemanden, der das NAS selbst "
        "verwaltet, hilft keine Technik – nur eine klare Regelung: wer Administrator ist, dass Zugriffe nur "
        "mit Wissen des Betriebsrats erfolgen, und am besten ein Vier-Augen-Prinzip. Das gehört schriftlich "
        "in eine Vereinbarung mit der IT. Empfehlung: Admins des NAS sind nur Vorsitz und Stellvertretung; "
        "die Checkliste zum Absichern des NAS steht im Handbuch, Kapitel 11.3.", "achtung", "Der Administrator des NAS")

    pdf.h2("2.1  Die zwei Schlüssel")
    pdf.tabelle(
        ["Schlüssel", "Wofür", "Wenn er verloren geht"],
        [
            ["ENCRYPTION_KEY", "Ver- und entschlüsselt jedes Dokument in BR-DMS",
             "Alle Dokumente sind dauerhaft unlesbar – auch mit Sicherung"],
            ["BACKUP_KEY", "Ver- und entschlüsselt die nächtliche Sicherung",
             "Die Sicherungen lassen sich nicht mehr einspielen"],
        ],
        (34, 70, 66),
    )
    pdf.bullets([
        "Aufbewahrung – Beide Schlüssel ausdrucken (Vordruck in Teil IV), in einen Umschlag, versiegeln, "
        "in den Tresor bzw. einen verschlossenen Schrank des Betriebsrats",
        "Nicht dort – Nicht auf dem NAS (dort liegen sie schon), nicht bei der IT, nicht als Foto auf dem Handy, "
        "nicht per E-Mail",
        "Zugang – Vorsitz und Stellvertretung wissen, wo der Umschlag liegt; eine Zweitschrift an einem "
        "zweiten Ort (z. B. beim Rechtsanwalt des Betriebsrats) ist sinnvoll",
        "Wechsel – Die Schlüssel ändern sich im Betrieb nicht. Neue Schlüssel gibt es nur bei einer "
        "Neuinstallation – dann den Ausdruck ersetzen",
    ])

    pdf.h1("3  Regeln für den Betrieb")
    pdf.tabelle(
        ["Was", "Wie oft", "Wer"],
        [
            ["Sicherung läuft automatisch", "jede Nacht, 02:00 Uhr", "NAS (Aufgabenplaner)"],
            ["Sicherung prüfen (Einstellungen → System)", "monatlich", "Vorsitz oder Stellvertretung"],
            ["Kopie zur IT", "täglich bzw. wöchentlich, wie mit der IT vereinbart", "IT"],
            ["Wiederherstellung testen", "halbjährlich und nach größeren Updates", "Vorsitz mit IT"],
            ["Schlüssel-Umschlag prüfen", "jährlich (noch da, versiegelt?)", "Vorsitz"],
        ],
        (74, 56, 40),
    )
    pdf.body(
        "Auf dem NAS bleiben die Sicherungen 30 Tage, danach werden sie automatisch gelöscht. Wie lange "
        "die IT ihre Kopien aufbewahrt, wird mit ihr vereinbart – mindestens ebenso lange ist sinnvoll."
    )
    pdf.hinweis(
        "Eine Sicherung ist erst dann eine Sicherung, wenn sie einmal auf einem anderen Gerät wiederhergestellt "
        "wurde. Das Ergebnis jedes Tests wird im Vordruck in Teil IV festgehalten.",
        "tipp", "Wiederherstellung üben")

    # ════════════════════════════════════════════════════════════════
    #  TEIL II – SICHERUNG EINRICHTEN
    # ════════════════════════════════════════════════════════════════
    pdf.teil("II", "Sicherung einrichten",
             "Einmalig auf dem NAS: Backup-Schlüssel anlegen, Schlüssel sichern, nächtliche Sicherung "
             "planen, Snapshots einschalten und die Kopie zur IT einrichten.")

    pdf.h1("4  Schritt für Schritt")
    pdf.body(
        "Alle Befehle werden per SSH auf dem NAS ausgeführt, im Installationsordner von BR-DMS – dem "
        "Ordner mit docker-compose.yml und .env. Er heißt im Folgenden <DATA_PATH>, z. B. "
        "/share/Container/br-dms (QNAP) oder /volume1/docker/br-dms (Synology)."
    )

    pdf.h2("4.1  Backup-Schlüssel anlegen")
    pdf.body(
        "Neue Installationen bekommen den BACKUP_KEY vom Installationsassistenten. Bei einer bestehenden "
        "Installation einmal einen erzeugen und in die .env schreiben:"
    )
    pdf.code("cd <DATA_PATH>\n"
             "grep -q '^BACKUP_KEY=.' .env || echo \"BACKUP_KEY=$(openssl rand -hex 32)\" >> .env\n"
             "grep -E '^(ENCRYPTION_KEY|BACKUP_KEY)=' .env      # beide Schlüssel anzeigen")
    pdf.body(
        "Die erste Zeile legt den Schlüssel nur an, wenn noch keiner da ist – ein vorhandener wird nie "
        "überschrieben. Ein Neustart von BR-DMS ist nicht nötig: Nur das Sicherungsskript liest den Schlüssel."
    )

    pdf.h2("4.2  Schlüssel auf Papier sichern")
    pdf.schritt(1, "Anzeigen", "Mit dem letzten Befehl aus 4.1 beide Schlüssel anzeigen lassen.")
    pdf.schritt(2, "Übertragen", "In den Vordruck „Schlüsselblatt“ (Teil IV) eintragen oder die beiden Zeilen "
                "direkt ausdrucken. Jeder Schlüssel hat genau 64 Zeichen aus 0–9 und a–f.")
    pdf.schritt(3, "Gegenlesen", "Eine zweite Person liest die Abschrift Zeichen für Zeichen gegen die Anzeige.")
    pdf.schritt(4, "Verschließen", "Umschlag versiegeln, mit Datum und Unterschrift versehen, wegschließen.")

    pdf.h2("4.3  Nächtliche Sicherung planen")
    pdf.h3("QNAP")
    pdf.body("QNAP plant Aufgaben über die Datei /etc/config/crontab. Per SSH als admin eine Zeile anhängen "
             "und den Zeitplan neu laden:")
    pdf.code("echo '0 2 * * * bash <DATA_PATH>/backup.sh > /tmp/brdms-backup.log 2>&1' \\\n"
             "  >> /etc/config/crontab\n"
             "crontab /etc/config/crontab && /etc/init.d/crond.sh restart")
    pdf.h3("Synology")
    pdf.body("Systemsteuerung → Aufgabenplaner → Erstellen → Geplante Aufgabe → Benutzerdefiniertes Skript. "
             "Benutzer: root, Zeitplan: täglich 02:00, Befehl:")
    pdf.code("bash /volume1/docker/br-dms/backup.sh")
    pdf.h3("Erste Sicherung von Hand")
    pdf.code("sudo bash <DATA_PATH>/backup.sh\n"
             "ls -lh <DATA_PATH>/backups/      # db_<Zeit>.sql.gz.enc, storage_<Zeit>.tar.gz.enc")
    pdf.body(
        "Enden die beiden neuen Dateien auf .enc, ist die Sicherung verschlüsselt. Meldet das Skript "
        "„Kein BACKUP_KEY in der .env“, fehlt Schritt 4.1. In BR-DMS zeigt Einstellungen → System das "
        "letzte Backup mit dem Zusatz „verschlüsselt“ – sonst erscheint dort eine Warnung."
    )

    pdf.h2("4.4  Snapshots einschalten (QNAP)")
    pdf.body(
        "Speicher & Snapshots → das Volume mit dem BR-DMS-Ordner → Snapshot → Snapshot-Zeitplan: "
        "täglich, Aufbewahrung z. B. 14 Tage. Snapshots brauchen ein Thick- oder Thin-Volume; auf einem "
        "statischen Volume steht die Funktion nicht zur Verfügung. Ein Snapshot belegt nur den Platz der "
        "seitdem geänderten Daten."
    )

    pdf.h2("4.5  Kopie zur IT")
    pdf.body(
        "Die IT holt bzw. bekommt regelmäßig den Inhalt von <DATA_PATH>/backups – etwa per Hybrid Backup "
        "Sync (QNAP), Hyper Backup (Synology) oder über ihre eigene Sicherungssoftware mit Lesezugriff "
        "nur auf diesen Ordner. Dabei gilt:"
    )
    pdf.bullets([
        "Nur .enc-Dateien – In den Ordner gehören nur verschlüsselte Sicherungen; vorher prüfen (4.3)",
        "Nie die .env – Sie enthält die Schlüssel. Die IT bekommt sie nicht, auch nicht „zur Sicherheit“",
        "Nur lesend – Die IT braucht keinen Schreibzugriff auf das NAS",
        "Aufbewahrung – Wie lange die IT Kopien hält, schriftlich vereinbaren",
    ])

    # ════════════════════════════════════════════════════════════════
    #  TEIL III – WIEDERHERSTELLEN
    # ════════════════════════════════════════════════════════════════
    pdf.teil("III", "Wiederherstellen",
             "Was im Ernstfall zu tun ist – vom versehentlich gelöschten Eintrag bis zum kompletten "
             "Verlust des NAS – und wie man prüft, ob alles wieder da ist.")

    pdf.h1("5  Welcher Fall liegt vor?")
    pdf.tabelle(
        ["Fall", "Weg", "Kapitel"],
        [
            ["Einzelnes versehentlich gelöscht oder geändert", "Snapshot von gestern oder Sicherung in "
             "einer Testinstanz öffnen und das Benötigte heraussuchen", "5.1"],
            ["BR-DMS kaputt, z. B. nach einem Update", "Letzte Sicherung auf demselben NAS einspielen", "6"],
            ["NAS defekt, gestohlen, verbrannt", "Neues Gerät einrichten, Kopie der IT einspielen", "7"],
        ],
        (60, 92, 18),
    )
    pdf.hinweis(
        "Eine Wiederherstellung setzt das ganze System auf den Stand der Sicherung zurück. Alles, was "
        "danach eingegeben wurde, ist weg. Deshalb bei einzelnen Verlusten nicht das laufende System "
        "zurücksetzen, sondern wie in 5.1 vorgehen.", "achtung", "Zurücksetzen betrifft alles")

    pdf.h2("5.1  Einzelnes zurückholen")
    pdf.body(
        "Auf einem zweiten Gerät oder in einer Testinstanz (z. B. wie die Demo-Instanz aus Handbuch "
        "Kapitel 13.3, aber mit den echten Schlüsseln) die Sicherung von vor dem Verlust einspielen, das "
        "Benötigte dort heraussuchen – Dokument herunterladen, Text kopieren – und im laufenden System "
        "neu anlegen. Danach die Testinstanz wieder löschen."
    )

    pdf.h1("6  Auf demselben NAS wiederherstellen")
    pdf.schritt(1, "Anmelden", "Per SSH auf das NAS, in den Installationsordner wechseln.")
    pdf.schritt(2, "Starten", "restore.sh starten. Es listet alle Sicherungen auf, verschlüsselte erkennt es an .enc.")
    pdf.code("cd <DATA_PATH>\n"
             "sudo bash restore.sh")
    pdf.schritt(3, "Auswählen", "Nummer der Sicherung eingeben und „j“ für die zugehörigen Dokumente.")
    pdf.schritt(4, "Bestätigen", "Mit „ja“ bestätigen. Das Skript prüft zuerst den BACKUP_KEY – passt er nicht, "
                "bricht es ab, bevor etwas überschrieben wird.")
    pdf.schritt(5, "Warten", "Das Skript hält BR-DMS an, spielt Datenbank und Dokumente ein und startet neu.")
    pdf.schritt(6, "Prüfen", "Wie in Kapitel 8 beschrieben.")

    pdf.h1("7  Auf einem neuen Gerät wiederherstellen")
    pdf.body(
        "Für den Totalverlust: Das neue Gerät kann ein anderes NAS sein, auch eines anderen Herstellers – "
        "ein Umzug von QNAP auf Synology wurde bereits erfolgreich getestet. Benötigt werden: das neue "
        "Gerät mit Docker, die Kopie der Sicherung von der IT und der Schlüssel-Umschlag."
    )
    pdf.schritt(1, "BR-DMS installieren", "Wie im Handbuch Kapitel 12 beschrieben. Im Installationsassistenten "
                "bei ENCRYPTION_KEY und BACKUP_KEY jeweils „Eigenen … eingeben“ wählen und die Schlüssel vom "
                "Ausdruck eintragen – nicht neu erzeugen lassen.")
    pdf.schritt(2, "Starten", "BR-DMS einmal starten, damit Datenbank und Ordner angelegt werden.")
    pdf.schritt(3, "Sicherung ablegen", "Die beiden .enc-Dateien einer Nacht (gleiche Zeit im Namen) von der IT "
                "nach <DATA_PATH>/backups kopieren.")
    pdf.schritt(4, "Einspielen", "restore.sh wie in Kapitel 6 ausführen.")
    pdf.schritt(5, "Anmelden", "Es gelten wieder die Benutzer und Passwörter des alten Systems – nicht das "
                "Admin-Konto aus dem Installationsassistenten.")
    pdf.schritt(6, "Nacharbeiten", "Zertifikat einrichten bzw. importieren (Handbuch 12.4), nächtliche Sicherung "
                "und Snapshots wieder einplanen (Kapitel 4), Kopie zur IT wieder einrichten.")
    pdf.hinweis(
        "Ist das Skript nicht greifbar, lässt sich eine Sicherung auch von Hand mit openssl entschlüsseln. "
        "Das Ergebnis ist der Datenbank-Dump bzw. das Dokumenten-Archiv – dafür braucht es danach "
        "fachkundige Hilfe.", "info", "Notfall ohne restore.sh")
    pdf.code("openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass pass:<BACKUP_KEY> \\\n"
             "  -in db_<Zeit>.sql.gz.enc | gunzip > db.sql\n"
             "openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass pass:<BACKUP_KEY> \\\n"
             "  -in storage_<Zeit>.tar.gz.enc | tar -xzf -")

    pdf.h1("8  Nach der Wiederherstellung prüfen")
    pdf.tabelle(
        ["Prüfung", "Zeigt, dass …"],
        [
            ["Anmeldung mit einem eigenen Konto", "die Datenbank (Benutzer) zurück ist"],
            ["Letzte Sitzung öffnen, Protokoll ansehen", "Sitzungen und Protokolle vollständig sind"],
            ["Ein beliebiges Dokument öffnen (Vorschau)", "Dokumente zurück sind und der ENCRYPTION_KEY stimmt"],
            ["Ein vertrauliches Dokument öffnen", "auch die Rechte stimmen"],
            ["Einstellungen → System", "die Sicherungen wieder sichtbar sind"],
            ["Audit-Log: letzter Eintrag", "bis zu welchem Zeitpunkt die Daten reichen"],
        ],
        (80, 90),
    )
    pdf.body(
        "Lässt sich kein Dokument öffnen, obwohl die Anmeldung klappt, stimmt der ENCRYPTION_KEY nicht mit "
        "dem des alten Systems überein: Schlüssel in der .env mit dem Ausdruck vergleichen, korrigieren und "
        "BR-DMS neu starten – eine erneute Wiederherstellung ist dafür nicht nötig."
    )

    # ════════════════════════════════════════════════════════════════
    #  TEIL IV – VORDRUCKE
    # ════════════════════════════════════════════════════════════════
    pdf.teil("IV", "Vordrucke",
             "Schlüsselblatt für den versiegelten Umschlag und Protokoll für die Wiederherstellungstests.")

    pdf.h1("9  Schlüsselblatt")
    pdf.hinweis(
        "Dieses Blatt nach dem Ausfüllen nicht kopieren, scannen oder fotografieren. Es gehört versiegelt "
        "in den Tresor des Betriebsrats.", "wichtig", "Streng vertraulich")
    pdf.feld("Installation / Gerät")
    pdf.feld("Adresse von BR-DMS")
    pdf.ln(3)
    pdf.schluesselzeile("ENCRYPTION_KEY – entschlüsselt die Dokumente")
    pdf.schluesselzeile("BACKUP_KEY – entschlüsselt die Sicherungen")
    pdf.feld("Erstellt am / von")
    pdf.feld("Gegengelesen von")
    pdf.feld("Aufbewahrungsort")
    pdf.feld("Zweitschrift bei")

    pdf.h1("10  Protokoll der Wiederherstellungstests")
    pdf.body("Ein Eintrag je Test. Ziel: einmal im Halbjahr und nach größeren Updates.")
    kopf = ["Datum", "Sicherung vom", "Zielgerät", "Anmeldung", "Dokument", "Durchgeführt von"]
    pdf.tabelle(kopf, [[""] * 6 for _ in range(12)], (22, 28, 34, 22, 22, 42))

    pdf.output(OUT)
    print(f"PDF erstellt: {OUT}  ({pdf.pages_count} Seiten)")


if __name__ == "__main__":
    build()
