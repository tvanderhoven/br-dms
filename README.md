# BR-DMS – Betriebsrats-Dokumentenmanagementsystem

![Self-hosted](https://img.shields.io/badge/Self--hosted-Synology%20NAS-blue)
![DSGVO](https://img.shields.io/badge/DSGVO-konform-green)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)
![License](https://img.shields.io/badge/Lizenz-Intern-lightgrey)

DSGVO-konformes Dokumentenmanagementsystem speziell für Betriebsräte. Läuft vollständig im Intranet auf einer Synology NAS – ohne Cloud-Verbindung, ohne externen Zugriff.

---

## Features

- **Vollverschlüsselte Dokumentenablage** – AES-256, Dokumente nur on-demand entschlüsselt
- **Rollenbasierte Zugriffskontrolle** – VORSITZ, STELLVERTRETER, MITGLIED, ERSATZMITGLIED, ADMIN
- **Sitzungsverwaltung mit Protokoll** – Vollständiger Lifecycle: Entwurf → Einladung → Protokoll → Finalisierung
- **Automatische Fristüberwachung** – §99, §102 BetrVG mit konfigurierbaren Aufbewahrungsfristen
- **Lückenloser Audit-Trail** – 40+ Aktionen mit IP, Zeitstempel, User-Agent
- **Dokumentenversionen** – Beliebig viele Versionen mit Änderungsnotiz
- **Watch Folder** – Automatischer Import aus freigegebenem Netzwerkordner
- **Wissensarchiv** – Erfahrungen und Beschlüsse strukturiert ablegen
- **Internes Nachrichtensystem** – Ohne externe Dienste

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

- Synology NAS mit DSM 7.0+ und Container Manager (Docker)
- SSH-Zugriff zur NAS
- Entwickler-PC mit `bash` oder PowerShell + SSH-Client

### Installation

**1. `.env.deploy` anlegen** (im Projektverzeichnis, nicht committen):
```
NAS_USER=<NAS-Benutzername>
NAS_HOST=<NAS-IP oder Hostname>
DATA_PATH=/volume1/docker/br-dms
```

**2. `.env` auf der NAS anlegen:**
```bash
ssh <NAS-Benutzername>@<NAS-IP>
cp /volume1/docker/br-dms/.env.example /volume1/docker/br-dms/.env
nano /volume1/docker/br-dms/.env   # Alle Werte anpassen
```

**3. Dateien deployen:**
```bash
bash deploy_update.sh
```

**4. Container starten (auf der NAS per SSH):**
```bash
cd /volume1/docker/br-dms
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

Backups landen in `/volume1/docker/br-dms/backups/` und werden nach 30 Tagen automatisch gelöscht.  
Empfehlung: Tägliche Ausführung via Synology Task Scheduler.

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
