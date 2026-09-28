# BR-DMS – Betriebsrats-Dokumentenmanagementsystem

![Self-hosted](https://img.shields.io/badge/Self--hosted-NAS%20%2F%20QNAP-blue)
![DSGVO](https://img.shields.io/badge/DSGVO-konform-green)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)
![License](https://img.shields.io/badge/Lizenz-Intern-lightgrey)

DSGVO-konformes Dokumentenmanagementsystem speziell für Betriebsräte. Läuft vollständig im Intranet auf einer NAS (QNAP, Synology o.ä.) – ohne Cloud-Verbindung, ohne externen Zugriff.

---

## Features

### Dokumente & Eingang
- **Vollverschlüsselte Dokumentenablage** – AES-256, Dokumente nur on-demand entschlüsselt, Prüfsumme, Volltextsuche im PDF-Inhalt
- **Kategorien, Vertraulich-Kennzeichnung, Alias, Tags, Aktenzeichen** – inkl. Inline-PDF-Vorschau und Filter
- **Dokumentenversionen** – Beliebig viele Versionen mit Änderungsnotiz
- **Eingang (Inbox)** – Triage neu eingegangener Dokumente: mit TOP verknüpfen (neu oder bestehend, inkl. automatischer Frist), ins Wissensarchiv übernehmen, Aufgabe erstellen, als neue Dokumentversion speichern, Wiedervorlage-Datum setzen, vorausgefülltes Widerspruchs-/Ablehnungsschreiben für §99/§102 generieren
- **Watch Folder** – Automatischer Import aus freigegebenem Netzwerkordner (Pfad unabhängig vom Docker-Verzeichnis konfigurierbar)
- **Konfigurierbare Aufbewahrungsfristen** – Je Kategorie, mit automatischer Löschvormerkung (DSGVO)

### Sitzungen & Protokoll
- **Vollständiger Lifecycle** – Entwurf → Tagesordnung fixiert → Protokoll-Entwurf → Finalisiert (mit digitalem Zeitstempel), inkl. Absage; jeder Übergang ist unumkehrbar und rollengebunden (VORSITZ)
- **TOPs** – Rich-Text-Inhalt/Ergebnis, Status, Spontan-TOPs, vertrauliche TOPs (vor der JAV-Rolle ausgeblendet)
- **Anwesenheitsliste** – Mit Vertretungslogik, automatisch vorbefüllt, eigener PDF-Export
- **Beschlussregister** – Mehrere Beschlüsse pro TOP mit Rechtsgrundlage und Stimmergebnis, zentrales, sitzungsübergreifendes Register
- **Abstimmungen** – Einfache Ja/Nein/Enthaltung-Abstimmung je TOP mit Rechtsgrundlage und automatischer Ergebnisberechnung
- **PDF-Generierung** – Automatisch bei Fixierung/Finalisierung, anpassbarer Briefkopf (Logo, Farben, Unterschriftszeilen mit Ort & Datum), TOP-Einzelauszug als PDF
- **Sitzungsvorlagen** – Wiederverwendbare TOP-Sets für neue Sitzungen
- **Automatische Einladung** – Interne Nachricht an alle Mitglieder bei Fixierung der Tagesordnung
- **Cross-Modul-Aktionen aus TOPs** – Aufgabe erstellen, ins Wissensarchiv übernehmen, Gehaltsbeschluss direkt in die Gehaltstabelle übernehmen

### Aufgaben, Zeiträume & Themen
- **Aufgaben** – Liste und Kanban-Board (Neu/In Bearbeitung/Auf Hold/Erledigt), Priorität, Fälligkeit, Zuweisung, Sichtbarkeit (privat/öffentlich), Verknüpfung zu TOP/Dokument, Doppelklick öffnet die Detailansicht
- **Zeiträume** – Gantt-Diagramm mit Hierarchie (Ober-/Unterprojekt), Farbcodierung, sowie Listenansicht
- **Themen-Backlog** – Eigenes Kanban-Board für Themenideen, direkte Übernahme in einen Sitzungs-TOP
- **Themensammlung** – Sammelt als "öffentlich" markierte TOPs aus Protokollen für Aushänge/Newsletter und exportiert sie formatiert

### Personalverwaltung *(abschaltbar)*
- **Mitarbeiter-Stammdaten** – Name, PNR, Abteilung, Ein-/Austritt, Standort, Beschäftigungsart (Mitarbeiter/Azubi/Student/Zeitarbeiter), CSV-Import mit Vorschau/Dry-Run
- **Gehaltstabelle** – Gehaltsstufen-Historie (Tarif-Gruppe/Stufe oder individuelles AT-Gehalt) je Mitarbeiter, CSV-Import/-Export, direkte Übernahme aus Sitzungsbeschlüssen, Statistik-Tab
- **Zeitmodell-Historie** – Echter Gültigkeitszeitraum je Mitarbeiter, Filter nach befristet/unbefristet, Warnliste für bald auslaufende Zeiträume
- **Überstunden-Regelungen** – Freitext-Historie nach demselben Muster wie das Zeitmodell (Zeitraum, befristet/unbefristet-Filter, Ablaufwarnung)

### Weitere Module *(teilweise abschaltbar)*
- **Betriebsvereinbarungs-Register** *(abschaltbar)* – Status (Aktiv/Gekündigt/Abgelöst/Befristet ausgelaufen), Laufzeitüberwachung mit Warnhinweis vor Ablauf, Verknüpfung zum hinterlegten PDF, Volltextsuche im Dokumenttext
- **Schulungsverwaltung & Qualifikationsmatrix** – Schulungstermine mit Teilnehmerverwaltung (Ort, Anbieter, Kosten, Status); Qualifikationsmatrix (Mitarbeiter × Qualifikation) wird automatisch aus den Terminen abgeleitet, inkl. Ablaufüberwachung bei zeitlich befristeten Qualifikationen (z.B. Ersthelfer)
- **Wissensarchiv** *(abschaltbar)* – Erfahrungen und Beschlüsse strukturiert ablegen, Sachverhalt UND Lösung als Rich-Text, Kategorien/Tags, Herkunft (manuell oder aus Protokoll übernommen)
- **Ressourcen** *(abschaltbar)* – Kuratierte Linksammlung (Gesetz/KI-Werkzeug/Behörde/Vorlage/Sonstiges) mit Tags und automatisch geladenem Favicon der Zielseite
- **Kummerkasten** – Öffentliches, anonymes Formular ohne Login (Rate-Limit, Honeypot gegen Bots) sowie interne Bearbeitungsansicht mit Status und nur intern sichtbarer Notiz
- **Gesetzestexte** – Monatlich automatisch aktualisierte Paragraphen-Datenbank (BetrVG, KSchG u.a.), durchsuchbar über die globale Suche und als Popup-Ansicht

### Fristen & Suche
- **Fristenkalender** – Monatsansicht aller Fristen (§87/§99/§102 BetrVG, individuelle Fristen), Farbcodierung nach Dringlichkeit, automatische E-Mail-Erinnerung
- **Globale Suche** – Durchsucht Dokumente, Sitzungen/TOPs/Beschlüsse, Aufgaben, Wissensarchiv, Ressourcen, Betriebsvereinbarungen, Schulungen, Mitarbeiter und Gesetzestexte; Ergebnisse nach Bereich gruppiert, auch als Schnellsuche in der Kopfleiste verfügbar

### Benutzer, Rollen & Sicherheit
- **Rollenbasierte Zugriffskontrolle** – VORSITZ, STELLVERTRETER, MITGLIED, ERSATZMITGLIED, ADMIN sowie **JAV** (stark eingeschränkte Rolle für Jugend- und Auszubildendenvertretung: nur Lesezugriff, vertrauliche TOPs ausgeblendet)
- **Login mit E-Mail oder Benutzername** – Anmeldung wahlweise mit der vollständigen E-Mail-Adresse oder nur dem Teil vor dem `@`
- **Passwort-Reset per E-Mail** und admin-/VORSITZ-ausgelöster Reset für andere Benutzer
- **Ständige Vertretung** – Verknüpfung Ersatzmitglied ↔ Mitglied, wirkt sich auf Anwesenheit und Abstimmungen aus
- **Konfigurierbares Sicherheits-Timeout** – Automatischer Logout nach Inaktivität (0–480 Minuten)
- **Lückenloser Audit-Trail** – 30+ protokollierte Aktionstypen mit IP, Zeitstempel, User-Agent, einsehbar für VORSITZ/ADMIN

### Internes Nachrichtensystem
- **Posteingang** – Nachrichten an einzelne Mitglieder, alle aktiven Mitglieder oder alle Teilnehmer einer Sitzung; System-Nachrichten (z.B. Einladung) mit PDF-Anhang; ohne externe Dienste

### Export
- **Amtsübergabe-PDF** – Ein Dokument mit aktiver Mitgliederliste, allen aktiven Dokumenten (nach Kategorie gruppiert, mit offenen Fristen) und dem vollständigen Beschlussregister
- **Widerspruchs-/Ablehnungsschreiben** – Automatisch vorausgefüllte PDF-Vorlagen für §99- bzw. §102-Fälle direkt aus dem Eingang

### Editor & Verknüpfungen
- **Einheitlicher Rich-Text-Editor** (Sitzungen, Aufgaben, Themen-Backlog, Wissensarchiv) – Formatierung (Fett/Kursiv/Unterstrichen, Überschriften, Listen, Markieren), Lesemodus für finalisierte Versionen
- **Dokument-Referenzen** – Direkt im Editor als anklickbare Chips einfügen, öffnen authentifiziert die Dokumentenvorschau
- **Links** – Normale Weblinks, interne `lbo://`/`lboffice://`-Links sowie NAS-Datei-Links: ein eingefügter UNC-Pfad (`\\server\freigabe\...`) wird automatisch in einen `brdmsfile://`-Link umgewandelt, der über einen lokal installierten Protokoll-Handler geöffnet wird (umgeht die Browser-Sperre für `file://`-Netzwerkfreigaben)

### System & Einstellungen
- **Einheitliches Vollbreiten-Layout** – Alle Seiten responsiv und konsistent; alle Textfelder vertikal skalierbar
- **Design-Einstellungen** – Sidebar-/Akzentfarbe, Schriftgröße, Hell/Dunkel/Automatisch
- **System-Tab** – Watch-Folder-Pfad/Status sowie eine Backup-Übersicht (Anzahl, Alter, Größe und Vollständigkeit der Backups, ohne den Verschlüsselungsschlüssel offenzulegen)
- **Abschaltbare Module** – Personalverwaltung (Gehaltstabelle/Mitarbeiterübersicht), Betriebsvereinbarungen, Wissensarchiv, Ressourcen und Themensammlung lassen sich im Admin-Bereich (Einstellungen → Module) pro Installation ein-/ausblenden – praktisch bei Installation für andere Betriebsräte mit abweichendem Funktionsumfang

---

## Tech-Stack

| Schicht    | Technologie              |
|------------|--------------------------|
| Backend    | Fastify + Prisma (TypeScript) |
| Datenbank  | PostgreSQL 16            |
| Frontend   | React 18 + Vite + Tailwind CSS |
| Webserver  | Nginx (im Container)     |
| Deployment | Docker Compose           |
| Verschlüsselung | AES-256 (Node.js crypto) |

---

## Schnellstart

### Voraussetzungen

- NAS mit Docker-Unterstützung (QNAP Container Station, Synology Container Manager o.ä.)
- SSH-Zugriff zur NAS
- Entwickler-PC mit `bash` oder PowerShell + SSH-Client

### Installation

**1. `.env.deploy` anlegen** (im Projektverzeichnis, nicht committen):
```
NAS_USER=<NAS-Benutzername>
NAS_HOST=<NAS-IP oder Hostname>
DATA_PATH=/share/Container/br-dms        # QNAP
# DATA_PATH=/volume1/docker/br-dms      # Synology
```

**2. `.env` auf der NAS anlegen:**
```bash
ssh <NAS-Benutzername>@<NAS-IP>
cp <DATA_PATH>/.env.example <DATA_PATH>/.env
nano <DATA_PATH>/.env   # Alle Werte anpassen
```

**3. Dateien deployen:**
```bash
# Windows:
python deploy_komplett.py

# Linux / macOS:
bash deploy_update.sh
```

**4. Container starten (auf der NAS per SSH):**
```bash
cd <DATA_PATH>
sudo /usr/local/bin/docker compose up -d --build
```

**5. Browser öffnen:**
```
http://<NAS-IP>:3000
```

---

## Umgebungsvariablen

Vollständige Vorlage: [`.env.example`](.env.example)

Pflichtfelder:

| Variable | Beschreibung | Generieren mit |
|---|---|---|
| `POSTGRES_PASSWORD` | Datenbankpasswort (32+ Zeichen) | `openssl rand -base64 32` |
| `JWT_SECRET` | Token-Signaturschlüssel | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256 Dokumentschlüssel | `openssl rand -hex 32` |
| `NAS_IP` | IP-Adresse der NAS | `hostname -I` |
| `APP_URL` | URL für Passwort-Reset-Mails | `http://<NAS-IP>:3000` |

> **Kritisch:** Der `ENCRYPTION_KEY` muss separat gesichert werden. Bei Verlust sind alle Dokumente dauerhaft unlesbar.

### Watch-Folder (optional)

| Variable | Beschreibung | Standard |
|---|---|---|
| `WATCH_FOLDER_ENABLED` | Watch-Folder aktivieren | `false` |
| `SYSTEM_USER_ID` | UUID des Admin-Users für automatische Imports | – |
| `WATCH_INBOX_PATH` | NAS-Pfad des Eingangsordners (unabhängig vom Docker-Verzeichnis) | `DATA_PATH/watch_inbox` |

Eingangsordner auf separate NAS-Freigabe legen (empfohlen):
```bash
WATCH_INBOX_PATH=/share/kp          # QNAP
# WATCH_INBOX_PATH=/volume1/br-dms-eingang   # Synology
```
Einliefernde User erhalten dann per SMB nur Zugriff auf diesen Ordner – nie auf das Docker-Verzeichnis.

**Erwartete Unterordner im Watch-Folder:**
```
watch_inbox/
├── anhoerung_99/
├── anhoerung_102/
├── bewerbung/
├── bewerbung_alternativ/
├── zeitmodell_87/
├── protokoll/
├── betriebsvereinbarung/
└── sonstiges/
```

### Aufbewahrungsfristen (Standardwerte)

| Kategorie | Frist |
|---|---|
| §99 BetrVG – Einstellung/Versetzung | 5 Jahre |
| §102 BetrVG – Kündigung | 5 Jahre |
| §87 BetrVG – Zeitmodelländerung | 5 Jahre |
| Bewerbung | 3 Monate |
| Alternative Bewerbung | 1 Monat |
| Sitzungsprotokoll | 4 Jahre |
| Betriebsvereinbarung | 10 Jahre |
| Sonstiges | 5 Jahre |

Alle Fristen sind in den Einstellungen (VORSITZ/ADMIN) individuell anpassbar.

---

## HTTPS aktivieren

Standardmäßig läuft BR-DMS über einfaches HTTP – für den produktiven Betrieb empfohlen: ein vorgeschalteter Reverse-Proxy-Container (`proxy/`), der TLS terminiert und Frontend + Backend unter einer gemeinsamen Adresse zusammenführt.

### Schritt 1: Zertifikat erzeugen

**Interimslösung (sofort einsatzbereit, selbstsigniert):**
```bash
bash proxy/generate-selfsigned-cert.sh <DATA_PATH> br-nas 192.168.1.100
```
Browser zeigen dabei eine Warnung ("Verbindung nicht privat" o.ä.), bis das Zertifikat einmalig pro PC als vertrauenswürdig markiert wird (Zertifikat aus `<DATA_PATH>/certs/fullchain.pem` in den Windows-Zertifikatspeicher "Vertrauenswürdige Stammzertifizierungsstellen" importieren).

**Zertifikat von der internen Firmen-CA (schnellste Lösung, falls vorhanden):** Falls eure IT bereits eine eigene interne Zertifizierungsstelle betreibt (z.B. via Active Directory Certificate Services – erkennbar daran, dass interne Seiten wie ein ERP-System HTTPS mit einem "Ausgestellt von"-Feld zeigen, das nicht auf eine bekannte öffentliche CA wie Let's Encrypt/DigiCert verweist, sondern auf einen firmeneigenen Namen), reicht eine Bitte an die IT: ein Zertifikat für `br-nas` ausstellen lassen, **mit `br-nas` als Subject Alternative Name (SAN)**, nicht nur als CN. Wird meist als `.pfx`-Datei (Zertifikat + privater Schlüssel gebündelt, passwortgeschützt) ausgeliefert – vor der Verwendung nach PEM konvertieren:
```bash
openssl pkcs12 -in zertifikat.pfx -clcerts -nokeys -out <DATA_PATH>/certs/fullchain.pem
openssl pkcs12 -in zertifikat.pfx -nocerts -nodes -out <DATA_PATH>/certs/privkey.pem
```
Wird nur von firmeneigenen, domain-verwalteten Geräten automatisch als vertrauenswürdig erkannt (private Geräte würden weiterhin warnen) – für den normalen Login/BR-DMS-Betrieb an Büro-PCs aber völlig ausreichend, und sofort verfügbar ohne auf die öffentliche DNS-Zone angewiesen zu sein.

**Echtes, überall vertrauenswürdiges Zertifikat (zusätzlich empfohlen, v.a. für öffentlich zugängliche Bereiche wie den Kummerkasten):** Per Let's-Encrypt-DNS-Challenge für eine echte Subdomain (z.B. `br-dms.example.de`) – dafür wird kein offener Port 80/443 ins Internet benötigt, nur die Möglichkeit, einmalig (und bei jeder Erneuerung, alle ~90 Tage) einen TXT-Eintrag in der **öffentlichen** DNS-Zone der Domain zu setzen (nicht zu verwechseln mit dem internen Windows-/Active-Directory-DNS – meist ein getrenntes System beim Domain-Registrar/Hoster). Wird von jedem Gerät weltweit automatisch vertraut, auch privaten Handys ohne Firmenverwaltung. Ergebnis (`fullchain.pem` + `privkey.pem`) einfach anstelle der bisherigen Dateien nach `<DATA_PATH>/certs/` legen und `docker compose restart proxy` – keine weiteren Änderungen nötig.

### Schritt 2: Container starten

```bash
cd <DATA_PATH>
sudo /usr/local/bin/docker compose up -d --build
```

Danach erreichbar unter `https://<NAS-IP-oder-Hostname>:${PROXY_HTTPS_PORT:-8443}` (Standard-Ports 443/80 sind bewusst nicht Default, da viele NAS – v.a. QNAP – diese schon für die eigene Verwaltungsoberfläche belegen; in `.env` auf 443/80 änderbar, falls frei).

Frontend und Backend haben keine eigenen Host-Ports mehr (`ports:`-Blöcke wurden entfernt, sobald HTTPS über den Proxy bestätigt lief) – aller Zugriff läuft ausschließlich über den HTTPS-Proxy.

**Nicht vergessen:** `APP_URL` in `.env` auf die neue HTTPS-Adresse umstellen (z.B. `https://192.168.1.100:8443`, später `https://br-dms.example.de`). Der Wert steuert sowohl den Link in Passwort-Reset-E-Mails als auch die erlaubte CORS-Origin im Backend (`backend/src/index.ts`) – bei einer veralteten `APP_URL` blockiert das Backend sonst Anfragen von der neuen Adresse.

---

## Deployment-Skripte

| Skript | Plattform | Beschreibung |
|---|---|---|
| `deploy_update.sh` | Linux / macOS | Überträgt Quelldateien per tar-SSH-Pipe |
| `deploy_komplett.py` | Plattformübergreifend | Vollständiger Deploy via Python + SSH |
| `deploy_update.ps1` | Windows | PowerShell-Variante |

Nach dem Transfer zeigt jedes Skript die Rebuild-Befehle für die NAS an.

---

## Backup & Restore

```bash
# Backup erstellen (DB + Storage):
sudo bash /volume1/docker/br-dms/backup.sh

# Backup wiederherstellen (interaktiv):
sudo bash /volume1/docker/br-dms/restore.sh
```

Backups landen in `<DATA_PATH>/backups/` und werden nach 30 Tagen automatisch gelöscht.  
Empfehlung: Tägliche Ausführung via NAS Task Scheduler (QNAP: Aufgabenplaner / Synology: Aufgabenplaner).

---

## Handbuch

Das vollständige Benutzer- und Administratorhandbuch (47 Seiten) liegt als PDF im Repository:  
[`BR-DMS_Handbuch.pdf`](BR-DMS_Handbuch.pdf)

Inhalt: Installation, Modulübersicht, Prozessabläufe, Rollenmatrix, Datenbankschema, Backup & Restore.

---

## Ports

| Dienst | Port | Erreichbar |
|---|---|---|
| Proxy (HTTPS) | 8443 | Intranet – einziger Zugriffsweg, siehe [HTTPS aktivieren](#https-aktivieren) |
| Proxy (HTTP → Redirect) | 8080 | Intranet |
| Frontend | – | Nur Docker-intern (kein eigener Host-Port) |
| Backend | – | Nur Docker-intern (kein eigener Host-Port) |
| PostgreSQL | – | Nur Docker-intern |

---

*Dieses System ist für den internen Betrieb im Intranet konzipiert und nicht für den Internetzugang ausgelegt.*
