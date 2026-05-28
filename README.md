# BR-DMS – Betriebsrats-Dokumentenmanagementsystem

![Self-hosted](https://img.shields.io/badge/Self--hosted-NAS%20%2F%20QNAP-blue)
![DSGVO](https://img.shields.io/badge/DSGVO-konform-green)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)
![License](https://img.shields.io/badge/Lizenz-Intern-lightgrey)

DSGVO-konformes Dokumentenmanagementsystem speziell für Betriebsräte. Läuft vollständig im Intranet auf einer NAS (QNAP, Synology o.ä.) – ohne Cloud-Verbindung, ohne externen Zugriff.

---

## Features

- **Vollverschlüsselte Dokumentenablage** – AES-256, Dokumente nur on-demand entschlüsselt
- **Rollenbasierte Zugriffskontrolle** – VORSITZ, STELLVERTRETER, MITGLIED, ERSATZMITGLIED, ADMIN
- **Sitzungsverwaltung mit Protokoll** – Vollständiger Lifecycle: Entwurf → Einladung → Protokoll → Finalisierung
- **Automatische Fristüberwachung** – §87, §99, §102 BetrVG mit konfigurierbaren Aufbewahrungsfristen
- **Zeiträume & Aufgabenverwaltung** – Aufgaben und Zeiträume (z.B. Überstundenvereinbarungen) mit Hierarchie (Ober-/Unterzeitraum), Gantt-Diagramm und Listenansicht; Zuweisung, Farbcodierung, Prioritäten und Datumsbereich; Aufgaben und Zeiträume direkt aus Tagesordnungspunkten erstellen
- **Live-Benachrichtigungen** – Badge-Counts aktualisieren sich automatisch, Browser- und In-App-Benachrichtigung bei neuen Dokumenten/Aufgaben
- **Lückenloser Audit-Trail** – 40+ Aktionen mit IP, Zeitstempel, User-Agent
- **Dokumentenversionen** – Beliebig viele Versionen mit Änderungsnotiz
- **Watch Folder** – Automatischer Import aus freigegebenem Netzwerkordner (Pfad unabhängig vom Docker-Verzeichnis konfigurierbar)
- **PDF-Unterschriften mit Ort & Datum** – Tagesordnung, Protokoll und Anwesenheitsliste drucken Ort (Oberhausen/Gladbeck) und Sitzungsdatum direkt auf die Unterschriftszeile
- **Kommentare im Protokoll-PDF** – TOP-Kommentare erscheinen im PDF-Ausdruck mit Autor und Zeitstempel
- **Formatierte TOP-Inhalte** – Aufzählungen, Fettschrift und weitere Formatierungen bleiben in der Tagesordnungsansicht und im Protokoll erhalten (TipTap Rich-Text)
- **System-Tab in Einstellungen** – Zeigt Watch-Folder Pfad und Aktivierungsstatus im Browser an
- **Wissensarchiv** – Erfahrungen und Beschlüsse strukturiert ablegen
- **Internes Nachrichtensystem** – Ohne externe Dienste
- **DMS-Protokoll-Links** – Links mit `lbo://`, `lboffice://` und `lbofficem://` direkt im Protokoll-Editor verankern (internes DMS-System)
- **Einheitliches Vollbreiten-Layout** – Alle Seiten responsiv und konsistent; alle Textfelder vertikal skalierbar

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
| Frontend | 3000 | Intranet |
| Backend | 4000 | Intranet |
| PostgreSQL | – | Nur Docker-intern |

---

*Dieses System ist für den internen Betrieb im Intranet konzipiert und nicht für den Internetzugang ausgelegt.*
