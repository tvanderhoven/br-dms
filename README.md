# BR-DMS – Betriebsrats-Dokumentenmanagementsystem

![Self-hosted](https://img.shields.io/badge/Self--hosted-NAS%20%2F%20Docker-blue)
![DSGVO](https://img.shields.io/badge/DSGVO-konform-green)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)
![License](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue)

DSGVO-konformes Dokumentenmanagementsystem speziell für Betriebsräte. Läuft vollständig im Intranet auf jedem Docker-Host (NAS wie QNAP/Synology, eigener Server, Cloud-VM) – ohne Cloud-Verbindung, ohne externen Zugriff.

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
- **Sitzungsarten** – Ordentlich, außerordentlich, konstituierend (Standard-Tagesordnung nach § 29) und Betriebsversammlung (§§ 42–46: Standard-Tagesordnung nach § 43, Teilnehmerzahl statt Anwesenheitsliste, keine Beschlüsse, Anträge ins Themen-Backlog, Fragen aus dem Kummerkasten, PDF als Einladung zum Aushang und Niederschrift, Quartals-Frist nach § 43 Abs. 1)
- **Automatische Einladung** – Interne Nachricht an alle Mitglieder bei Fixierung der Tagesordnung
- **Cross-Modul-Aktionen aus TOPs** – Aufgabe erstellen, ins Wissensarchiv übernehmen, Gehaltsbeschluss direkt in die Gehaltstabelle übernehmen

### Aufgaben, Vorhaben & Themen
- **Aufgaben** – Drei Ansichten: Board (Neu/In Bearbeitung/Auf Hold/Erledigt), Liste gruppiert nach Vorhaben, Zeitplan als Gantt-Diagramm; Priorität, Fälligkeit, Zuweisung, Sichtbarkeit (privat/öffentlich), Verknüpfung zu TOP/Dokument, Doppelklick öffnet die Detailansicht
- **Vorhaben** – Klammer um mehrere Aufgaben mit Zeitraum (z. B. Wahl, Betriebsversammlung, Verhandlung), verschachtelbar, farblich gekennzeichnet, Filter je Vorhaben
- **Themen-Backlog** – Eigenes Kanban-Board für Themenideen, direkte Übernahme in einen Sitzungs-TOP
- **Wahlen (BR und JAV)** – Normales und vereinfachtes Verfahren: Fristen vom Wahlvorstand bis zur Anfechtung mit Rechtsgrundlage (nicht juristisch geprüft – gegenlesen lassen), Wählerliste zum Wahltag mit Wählbarkeit, Gremiumsgröße (§ 9 / § 62) und Mindestsitzen des Minderheitengeschlechts (§ 15), PDF zum Aushang ohne Geburtsdaten und CSV für den Wahlvorstand, Ergebnis übernehmen (Rollen, Wahlrang, konstituierende Sitzung) als Historie
- **Themensammlung** – Sammelt als "öffentlich" markierte TOPs aus Protokollen für Aushänge/Newsletter und exportiert sie formatiert

### Personalverwaltung *(abschaltbar)*
- **Mitarbeiter-Stammdaten** – Name, PNR, Abteilung, Ein-/Austritt, Standort, Beschäftigungsart (Mitarbeiter/Azubi/Student/dual Studierende/Zeitarbeiter), für Wahlen Geburtsdatum und Geschlecht; CSV-Import mit Vorschau/Dry-Run
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
- **Fristenkalender** – Monatsansicht aller Fristen (§87/§99/§102 BetrVG, Wahl- und Versammlungsfristen, individuelle Fristen ohne Dokument), Fristen bearbeiten und erledigen, Farbcodierung nach Dringlichkeit, automatische E-Mail-Erinnerung
- **Globale Suche** – Durchsucht Dokumente, Sitzungen/TOPs/Beschlüsse, Aufgaben, Wissensarchiv, Ressourcen, Betriebsvereinbarungen, Schulungen, Mitarbeiter und Gesetzestexte; Ergebnisse nach Bereich gruppiert, auch als Schnellsuche in der Kopfleiste verfügbar

### Benutzer, Rollen & Sicherheit
- **Rollenbasierte Zugriffskontrolle** – VORSITZ, STELLVERTRETER, MITGLIED, ERSATZMITGLIED, ADMIN sowie **JAV** (stark eingeschränkte Rolle für Jugend- und Auszubildendenvertretung: nur Lesezugriff, vertrauliche TOPs ausgeblendet)
- **Admin ohne Inhaltszugriff** (optional) – Vorsitz/Stellvertretung können den Admin auf die technische Verwaltung beschränken (Benutzer, Einstellungen, Module, Gesetzestexte); Sitzungen, Dokumente, Personaldaten und Audit-Log sind dann für ihn gesperrt. Neue Konten des Admins werden dem Vorsitz gemeldet
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
- **Links** – Normale Weblinks, interne Protokoll-Links anderer Programme (z.B. `lbo://`) sowie NAS-Datei-Links: ein eingefügter UNC-Pfad (`\\server\freigabe\...`) wird automatisch in einen `brdmsfile://`-Link umgewandelt, der über einen lokal installierten Protokoll-Handler geöffnet wird (umgeht die Browser-Sperre für `file://`-Netzwerkfreigaben)

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

- Ein Host mit Docker + Docker Compose – egal ob NAS (QNAP Container Station, Synology Container Manager), eigener Server, Cloud-VM oder lokaler Rechner
- Bei NAS-Betrieb zusätzlich: SSH-Zugriff zur NAS und ein Entwickler-PC mit `bash`/PowerShell + SSH-Client

### Installation – Option A: Installationsassistent (empfohlen)

Interaktives Skript, das alle benötigten Werte abfragt (Datenpfad, Datenbankpasswort,
JWT-/Verschlüsselungsschlüssel, Admin-Account, Ports, SMTP, WatchFolder) und daraus eine
fertige `.env` erzeugt:

```bash
bash installation.sh
# oder direkt: python3 setup_wizard.py
```

Im ersten Schritt wählst du das Zielsystem:
- **Generischer Docker-Host** – für jede beliebige Docker-Umgebung (lokal, eigener Server,
  Cloud-VM, oder auch ein NAS, wenn du direkt per SSH-Shell darauf arbeitest). Schreibt eine
  einzige `.env` ins Projektverzeichnis – danach direkt weiter mit Schritt 2 unten.
- **Synology / QNAP NAS** – zusätzlich zur `.env` wird eine `nas.env` erzeugt, die zum NAS
  kopiert wird, passend zu den SSH-Deploy-Skripten (`deploy_komplett.py` / `deploy_update.sh`).

**Danach (auf dem Zielhost):**
```bash
mkdir -p <DATA_PATH>/{storage,postgres,logs,watch_inbox,backups,certs}
bash proxy/generate-selfsigned-cert.sh <DATA_PATH> <Hostname> <Host-IP>   # Zertifikat MUSS vor dem ersten Start existieren
docker compose up -d --build   # legt beim ersten Start automatisch den Admin aus ADMIN_EMAIL/ADMIN_PASSWORD an
```

Browser öffnen: `https://<Host-IP>:8443` (Zertifikatswarnung beim ersten Aufruf ist normal, siehe [HTTPS aktivieren](#https-aktivieren) für Details/Alternativen). Frontend/Backend haben **keinen eigenen Host-Port** – der Proxy ist der einzige Zugriffsweg.

### Installation – Option B: Manuell

**1. `.env` anlegen** (im Projektverzeichnis, nicht committen):
```bash
cp .env.example .env
nano .env   # Alle Werte anpassen, siehe Tabelle unten
```

**2. Bei NAS-Betrieb zusätzlich `.env.deploy` anlegen** (steuert nur die Deploy-Skripte, keine Secrets):
```bash
cp .env.deploy.example .env.deploy   # NAS_USER, NAS_HOST, DATA_PATH eintragen
```
Die `.env` einmalig per SCP auf die NAS kopieren, den Quellstand danach mit den Deploy-Skripten
übertragen (siehe [Deployment-Skripte](#deployment-skripte)).

**3. Zertifikat erzeugen (muss vor dem ersten Start existieren, sonst startet der Proxy-Container nicht):**
```bash
cd <DATA_PATH>          # bei NAS: auf der NAS per SSH
bash proxy/generate-selfsigned-cert.sh <DATA_PATH> <Hostname> <Host-IP>
```

**4. Container starten:**
```bash
docker compose up -d --build
```
Beim ersten Start legt das Backend alle Tabellen und den ersten Admin-Account aus
`ADMIN_EMAIL`/`ADMIN_PASSWORD` an – Passwort nach dem ersten Login ändern.

**5. Browser öffnen:**
```
https://<Host-IP>:8443
```
(Zertifikatswarnung beim ersten Aufruf ist normal bei selbstsigniertem Zertifikat, siehe [HTTPS aktivieren](#https-aktivieren).)

---

## Umgebungsvariablen

Vollständige Vorlage: [`.env.example`](.env.example)

Pflichtfelder:

| Variable | Beschreibung | Generieren mit |
|---|---|---|
| `POSTGRES_PASSWORD` | Datenbankpasswort (32+ Zeichen) | `openssl rand -base64 32` |
| `JWT_SECRET` | Token-Signaturschlüssel | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256 Dokumentschlüssel | `openssl rand -hex 32` |
| `NAS_IP` | IP-Adresse bzw. Hostname des Docker-Hosts | `hostname -I` |
| `APP_URL` | URL für Passwort-Reset-Mails (muss die Proxy-HTTPS-Adresse sein, siehe unten) | `https://<Host-IP>:8443` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Login-Daten des ersten Admin-Accounts – wird beim ersten Start automatisch angelegt | frei wählbar |

> **Kritisch:** Der `ENCRYPTION_KEY` muss separat gesichert werden. Bei Verlust sind alle Dokumente dauerhaft unlesbar.
> `ADMIN_PASSWORD` nach dem ersten Login sofort in den Einstellungen ändern – wird nur beim Seed gelesen, danach nicht mehr automatisch synchronisiert.

### Watch-Folder (optional)

| Variable | Beschreibung | Standard |
|---|---|---|
| `WATCH_FOLDER_ENABLED` | Watch-Folder aktivieren | `false` |
| `SYSTEM_USER_ID` | UUID des Admin-Users für automatische Imports | – |
| `WATCH_INBOX_PATH` | Pfad des Eingangsordners auf dem Host (unabhängig vom Docker-Verzeichnis) | `DATA_PATH/watch_inbox` |

Eingangsordner auf einen separaten, eigenständig freigegebenen Pfad legen (empfohlen):
```bash
WATCH_INBOX_PATH=/share/kp                   # QNAP (SMB-Freigabe)
# WATCH_INBOX_PATH=/volume1/br-dms-eingang   # Synology (SMB-Freigabe)
# WATCH_INBOX_PATH=/srv/br-dms-eingang       # generischer Docker-Host
```
Auf NAS-Systemen erhalten einliefernde User dann per SMB nur Zugriff auf diesen Ordner – nie auf das restliche Docker-Verzeichnis. Auf einem generischen Host entsprechend über die dort übliche Freigabe-/Berechtigungslösung einschränken.

**Erwartete Unterordner im Watch-Folder:**
```
watch_inbox/
├── anhoerung_99/
├── anhoerung_102/
├── anhoerung_102_ausserordentlich/
├── abmahnung/
├── bewerbung/
├── bewerbung_alternativ/
├── zeitmodell_87/
├── betriebsvereinbarung/
├── arbeitgeber_info/
├── arbeitsschutz/
├── schriftverkehr/
├── protokoll/
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
| Abmahnung | 3 Jahre |
| Information des Arbeitgebers | 5 Jahre |
| Arbeits- und Gesundheitsschutz | 5 Jahre |
| Schriftverkehr | 5 Jahre |
| Sitzungsprotokoll | 4 Jahre |
| Betriebsvereinbarung | 10 Jahre |
| Sonstiges | 5 Jahre |

Alle Fristen sind in den Einstellungen (VORSITZ/ADMIN) individuell anpassbar. Das Löschdatum eines
einzelnen Dokuments lässt sich im Bearbeiten-Dialog ändern (z. B. nach falscher Kategorie).

---

## HTTPS aktivieren

Der Reverse-Proxy-Container (`proxy/`) ist **keine optionale Zusatzkomponente**, sondern der einzige Zugriffsweg: Frontend und Backend haben keinen eigenen Host-Port (siehe [Ports](#ports)), und der Proxy terminiert TLS und führt beide unter einer gemeinsamen HTTPS-Adresse zusammen. Ohne ein gültiges Zertifikat unter `<DATA_PATH>/certs/` startet der Proxy-Container gar nicht – das Zertifikat muss also schon vor dem allerersten `docker compose up` existieren (siehe Schritt 1 unten).

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
docker compose up -d --build
```
(auf NAS-Systemen ggf. mit `sudo` bzw. dem plattformeigenen Docker-Pfad, siehe Ausgabe des Installationsassistenten)

Danach erreichbar unter `https://<NAS-IP-oder-Hostname>:${PROXY_HTTPS_PORT:-8443}` (Standard-Ports 443/80 sind bewusst nicht Default, da viele NAS – v.a. QNAP – diese schon für die eigene Verwaltungsoberfläche belegen; in `.env` auf 443/80 änderbar, falls frei).

Frontend und Backend haben keine eigenen Host-Ports mehr (`ports:`-Blöcke wurden entfernt, sobald HTTPS über den Proxy bestätigt lief) – aller Zugriff läuft ausschließlich über den HTTPS-Proxy.

**Nicht vergessen:** `APP_URL` in `.env` auf die neue HTTPS-Adresse umstellen (z.B. `https://192.168.1.100:8443`, später `https://br-dms.example.de`). Der Wert steuert sowohl den Link in Passwort-Reset-E-Mails als auch die erlaubte CORS-Origin im Backend (`backend/src/index.ts`) – bei einer veralteten `APP_URL` blockiert das Backend sonst Anfragen von der neuen Adresse.

---

## Deployment-Skripte

| Skript | Plattform | Übertragung |
|---|---|---|
| `deploy_update.sh` | Linux / macOS | tar über SSH |
| `deploy_update.ps1` | Windows (OpenSSH + tar sind ab Windows 10 eingebaut) | tar über SSH |
| `deploy_komplett.py` | überall mit Python 3 (Host braucht python3 ≥ 3.8) | Python-Programm über SSH, ohne tar |

Alle drei übertragen dieselben Dateien aus **`deploy_dateien.txt`** und verhalten sich gleich:

- `backend/src`, `backend/prisma` und `frontend/src` werden auf dem Host **ersetzt** – gelöschte
  oder umbenannte Dateien bleiben dort nicht liegen. Übertragen wird zuerst in einen
  Zwischenordner; bricht die Verbindung ab, bleibt der alte Stand vollständig erhalten.
- `.env`, Datenbank, Dokumente, Zertifikate und Backups auf dem Host werden nie angefasst.
- Das docker-Programm wird am Pfad erkannt (QNAP `/share/…`, Synology `/volume…`) oder über
  `DOCKER_BIN` in `.env.deploy` festgelegt; die angezeigten Rebuild-Befehle passen dazu.

```bash
cp .env.deploy.example .env.deploy   # einmalig: NAS_USER, NAS_HOST, DATA_PATH
./deploy_update.sh --trocken         # Probelauf: zeigt nur, was übertragen würde
./deploy_update.sh                   # übertragen, danach Rebuild-Befehle anzeigen
./deploy_update.sh --bauen           # übertragen und direkt neu bauen/starten
```
Unter Windows entsprechend `.\deploy_update.ps1 -Trocken` bzw. `-Bauen`, mit Python
`python3 deploy_komplett.py --trocken` bzw. `--bauen`.

---

## Demo-Instanz

Für Vorführungen lässt sich eine komplett getrennte Instanz mit erfundenen Demodaten auf dem
lokalen PC starten (fiktive Firma mit ~250 Beschäftigten, 9er-Gremium, Sitzungen, Dokumente,
Gehaltshistorie usw.):

```bash
./demo/demo.sh start   # bauen, starten, Demodaten einspielen → https://localhost:8444
./demo/demo.sh reset   # alles löschen und frisch einspielen
./demo/demo.sh stop    # anhalten
```

Anmeldung z.B. mit `s.kroeger` / `Demo2026!` (Vorsitz). Das Demo-Skript schreibt nur in eine
leere Datenbank und kann eine echte Instanz daher nicht verändern.

---

## Backup & Restore

`backup.sh`/`restore.sh` lesen `DATA_PATH` aus der `.env` im selben Verzeichnis – beide Skripte
müssen also im `DATA_PATH`-Verzeichnis liegen (dort, wo auch `docker-compose.yml` und `.env`
liegen; wird beim Deploy automatisch mitkopiert):

```bash
# Backup erstellen (DB + Storage):
cd <DATA_PATH>
sudo bash backup.sh

# Backup wiederherstellen (interaktiv):
cd <DATA_PATH>
sudo bash restore.sh
```

Backups landen in `<DATA_PATH>/backups/` und werden nach 30 Tagen automatisch gelöscht.  
Empfehlung: Tägliche Ausführung via Aufgabenplaner (QNAP/Synology) bzw. `cron` auf einem
generischen Docker-Host.

> **Wichtig beim Restore auf einem anderen/neuen System:** Der `ENCRYPTION_KEY` in der `.env`
> muss schon *vor* dem Restore exakt dem Schlüssel des Quellsystems entsprechen – sonst lassen
> sich die wiederhergestellten Dokumente nicht mehr entschlüsseln (siehe
> [Umgebungsvariablen](#umgebungsvariablen)).

---

## Roadmap

Was als Nächstes kommt (Betriebsversammlung, BR-/JAV-Wahl) und was bewusst nicht geplant ist,
steht in der [`ROADMAP.md`](ROADMAP.md).

---

## Handbuch

Das vollständige Handbuch (41 Seiten, mit Screenshots aus der Demo) liegt als PDF im Repository:  
[`BR-DMS_Handbuch.pdf`](BR-DMS_Handbuch.pdf)

Aufbau: Teil I beschreibt alle Funktionen, Teil II die Administration, Teil III die Technik (Installation, Betrieb, Backup, Datenbank). Neu erzeugen: Demo starten, `node tools/handbuch-screenshots/screenshots.mjs`, dann `python3 generate_manual.py`.

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

## Autor & Lizenz

**BR-DMS** – entwickelt von **Tim van der Hoven** · Programmierung mit Unterstützung von
Claude (Anthropic)

Kontakt: [support@vanderhoven.eu](mailto:support@vanderhoven.eu)

Copyright © 2026 Tim van der Hoven. Veröffentlicht unter der
[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0): Nutzung, Änderung und
Weitergabe sind erlaubt, solange der Urheberhinweis erhalten bleibt und Änderungen – auch bei
Bereitstellung als gehosteter Dienst – unter derselben Lizenz offengelegt werden.

---

*Dieses System ist für den internen Betrieb im Intranet konzipiert und nicht für den Internetzugang ausgelegt.*
