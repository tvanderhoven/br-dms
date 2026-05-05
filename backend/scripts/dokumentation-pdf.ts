/**
 * BR-DMS Projektdokumentation – PDF generieren
 * Nutzung: npx tsx scripts/dokumentation-pdf.ts
 */

import PDFDocument from "pdfkit";
import fs from "node:fs";

const LM = 60;
const RM = 535;
const W  = RM - LM;

const C_PRIMARY = "#1e40af";
const C_GRAY    = "#6b7280";
const C_DARK    = "#111827";

const doc = new PDFDocument({ size: "A4", margin: 60, bufferPages: true });
const out = fs.createWriteStream("/tmp/br-dms-dokumentation.pdf");
doc.pipe(out);

function seitenFooter(pageNum: number, gesamt: number) {
  const y = 770;
  doc.moveTo(LM, y).lineTo(RM, y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
  doc.fontSize(7).font("Helvetica").fillColor(C_GRAY)
     .text(`BR-DMS Projektdokumentation  ·  Seite ${pageNum} von ${gesamt}`, LM, y + 5, { width: W, align: "center" });
}

function neuesKapitel(text: string) {
  if (doc.y > LM + 40) doc.addPage();
  doc.y = Math.max(doc.y, LM + 10);
  doc.moveDown(2);
  doc.fontSize(18).font("Helvetica-Bold").fillColor(C_PRIMARY).text(text, LM, doc.y);
  doc.moveDown(0.3);
  doc.moveTo(LM, doc.y).lineTo(RM, doc.y).strokeColor(C_PRIMARY).lineWidth(1.5).stroke();
  doc.moveDown(1.2);
}

function h2(text: string) {
  doc.moveDown(0.8);
  doc.fontSize(13).font("Helvetica-Bold").fillColor(C_PRIMARY).text(text, LM, doc.y);
  doc.moveDown(0.4);
}

function p(text: string) {
  doc.fontSize(9.5).font("Helvetica").fillColor("#374151")
     .text(text, LM, doc.y, { width: W, lineGap: 3 });
  doc.moveDown(0.4);
}

function bullet(text: string) {
  const y = doc.y;
  doc.fontSize(9.5).font("Helvetica").fillColor(C_PRIMARY).text("•", LM, y, { width: 12 });
  doc.fontSize(9.5).font("Helvetica").fillColor("#374151")
     .text(text, LM + 12, y, { width: W - 12, lineGap: 2.5 });
}

function code(text: string) {
  const y0 = doc.y;
  doc.fontSize(7.5).font("Courier").fillColor("#374151");
  const h = doc.heightOfString(text, { width: W - 16 });
  if (y0 + h + 12 > 760) doc.addPage();
  const y = doc.y;
  doc.rect(LM, y, W, h + 12).fill("#f9fafb");
  doc.fillColor("#1f2937").text(text, LM + 8, y + 6, { width: W - 16, lineGap: 1 });
  doc.y = y + h + 14;
  doc.moveDown(0.4);
}

function tabelle(kopf: string[], zeilen: string[][], breiten: number[]) {
  const y0 = doc.y;
  const gesamtH = 16 + zeilen.length * 15 + 10;
  if (y0 + gesamtH > 760) doc.addPage();

  let x = LM;
  doc.rect(LM, doc.y, W, 16).fill(C_PRIMARY);
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor("white");
  for (let i = 0; i < kopf.length; i++) {
    doc.text(kopf[i], x + 4, doc.y + 3, { width: breiten[i] - 4 });
    x += breiten[i];
  }

  let yr = doc.y + 16;
  doc.fontSize(7.5).font("Helvetica").fillColor("#374151");
  for (let r = 0; r < zeilen.length; r++) {
    if (r % 2 === 0) doc.rect(LM, yr, W, 15).fill("#f9fafb");
    x = LM;
    for (let c = 0; c < zeilen[r].length; c++) {
      doc.fillColor("#374151").text(zeilen[r][c], x + 4, yr + 2, { width: breiten[c] - 4 });
      x += breiten[c];
    }
    yr += 15;
  }
  doc.moveTo(LM, yr).lineTo(RM, yr).strokeColor("#d1d5db").lineWidth(0.5).stroke();
  doc.y = yr + 10;
  doc.moveDown(0.3);
}

// ══════════════════════════════════════════════════════════════════
// TITELSEITE
// ══════════════════════════════════════════════════════════════════

doc.y = 200;
doc.fontSize(28).font("Helvetica-Bold").fillColor(C_PRIMARY)
   .text("BR-DMS", LM, doc.y, { width: W, align: "center" });
doc.moveDown(0.3);
doc.fontSize(13).font("Helvetica").fillColor(C_GRAY)
   .text("Betriebsrat-Dokumentenmanagementsystem", LM, doc.y, { width: W, align: "center" });
doc.moveDown(2);

doc.moveTo(LM + 80, doc.y).lineTo(RM - 80, doc.y).strokeColor(C_PRIMARY).lineWidth(1).stroke();
doc.moveDown(1);

doc.fontSize(11).font("Helvetica").fillColor(C_DARK)
   .text("Projektdokumentation", LM, doc.y, { width: W, align: "center" });
doc.fontSize(10).font("Helvetica").fillColor(C_GRAY)
   .text("Stand: Mai 2026", LM, doc.y + 18, { width: W, align: "center" });

doc.moveDown(4);
doc.fontSize(9).font("Helvetica").fillColor(C_GRAY)
   .text("Entwickelt für den Betriebsrat · DSGVO-konform · Open Source", LM, doc.y, { width: W, align: "center" });

doc.addPage();

// ══════════════════════════════════════════════════════════════════
// INHALTSVERZEICHNIS
// ══════════════════════════════════════════════════════════════════

neuesKapitel("Inhaltsverzeichnis");
const inhalte = [
  "1.  Projektübersicht",
  "2.  Feature-Übersicht",
  "3.  Technische Architektur",
  "4.  Datenbankstruktur",
  "5.  Modul-Aufbau – Backend",
  "6.  Modul-Aufbau – Frontend",
  "7.  Sicherheitskonzept",
  "8.  Deployment & Betrieb",
];
for (const i of inhalte) {
  doc.fontSize(10).font("Helvetica").fillColor(C_DARK).text(i, LM, doc.y, { lineGap: 6 });
}

// ══════════════════════════════════════════════════════════════════
// 1. PROJEKTÜBERSICHT
// ══════════════════════════════════════════════════════════════════

neuesKapitel("1. Projektübersicht");
p("BR-DMS ist ein DSGVO-konformes Dokumentenmanagementsystem speziell für Betriebsräte. " +
  "Es deckt den gesamten Workflow von Sitzungsplanung über Protokollführung bis zur revisionssicheren " +
  "Archivierung ab. Das System läuft als Docker-Stack auf einem Synology NAS im Intranet.");

h2("Zielgruppe");
p("Betriebsräte in Unternehmen, die ein sicheres, selbst-gehostetes System für die Verwaltung " +
  "von Betriebsratsdokumenten, Sitzungen und Beschlüssen benötigen.");

h2("Kernziele");
bullet("Vollständig DSGVO-konform (Verschlüsselung, Löschfristen, Audit-Log)");
bullet("Selbst-gehostet auf eigener Infrastruktur (Synology NAS)");
bullet("Keine Cloud-Abhängigkeit, keine externen Dienstleister");
bullet("Einfache Bedienung für BR-Mitglieder ohne IT-Vorkenntnisse");
bullet("Rechtssichere Dokumentation aller Beschlüsse und Abstimmungen");

// ══════════════════════════════════════════════════════════════════
// 2. FEATURE-ÜBERSICHT
// ══════════════════════════════════════════════════════════════════

neuesKapitel("2. Feature-Übersicht");

h2("2.1 Sitzungsmanagement");
bullet("Sitzungen anlegen, bearbeiten und verwalten");
bullet("Tagesordnungspunkte (TOPs) mit Rich-Text-Editor (TipTap)");
bullet("Status-Workflow: Entwurf → Tagesordnung fixiert → Protokoll-Entwurf → Protokoll final");
bullet("Automatische PDF-Generierung (Tagesordnung + Protokoll)");
bullet("PDF-Download mit Versionierung (v1.0, v1.1, v2.0, v2.1)");

h2("2.2 PDF-Generierung");
bullet("Professionelles DIN-A4-Layout mit Logo, Titel, Datum/Uhrzeit");
bullet("Drei PDF-Typen: Tagesordnung, Protokoll, Anwesenheitsliste, TOP-Auszug");
bullet("Rechtssicheres Zeitstempel-Siegel bei finalen Protokollen");
bullet("Unterschriftsfelder für Vorsitz und Protokollzeuge");

h2("2.3 Anwesenheitsliste");
bullet("Digitale Anwesenheitserfassung pro Sitzung");
bullet("Status: Anwesend, Entschuldigt, Unentschuldigt, Ersatz-Vertretung");
bullet("Stellvertreter-Regelung (§ 25 BetrVG)");
bullet("PDF-Export mit Unterschriftsfeldern");

h2("2.4 Beschlussfassung");
bullet("Mehrere Beschlüsse pro TOP mit Antragstext");
bullet("Stimmenzählung: Ja, Nein, Enthaltungen");
bullet("Finalisierung mit Zeitstempel (revisionssicher)");
bullet("PDF-Auszug einzelner TOPs zur Weitergabe");

h2("2.5 Abstimmungen");
bullet("Abstimmungs-Panel mit Live-Stimmenzählung");
bullet("Einzelstimmen-Erfassung (Ja/Nein/Enthaltung pro Mitglied)");
bullet("Ergebnisberechnung: Angenommen/Abgelehnt");

h2("2.6 Aufgabenverwaltung");
bullet("Aufgaben erstellen, zuweisen und abhaken");
bullet("Prioritäten: Hoch, Mittel, Niedrig");
bullet("Sichtbarkeit: Öffentlich (für alle) oder Privat (nur Ersteller)");
bullet("Fälligkeitsdatum mit Farbcodierung (überfällig rot, Frist nah amber)");
bullet("Filter: Alle, Offen, Erledigt");

h2("2.7 Dokumentenverwaltung");
bullet("Dokumente hochladen, verschlüsselt speichern (AES-256)");
bullet("Kategorien: § 99, § 102 BetrVG, Bewerbungen, Protokolle, BV, Sonstiges");
bullet("Volltextsuche über Dokumentinhalte");
bullet("Versionierung mit Änderungshistorie");
bullet("Alias-Namen und Tags für bessere Auffindbarkeit");

h2("2.8 Fristenmanagement");
bullet("Automatische Fristen bei Anhörungen (§ 99: 1 Woche, § 102 ordentlich: 1 Woche)");
bullet("Frist-Countdown und Farbcodierung");
bullet("Status: Offen, Erledigt, Abgelaufen");

h2("2.9 Wissensdatenbank");
bullet("BR-Wissen strukturiert ablegen");
bullet("Verknüpfung mit Protokollen (automatische Extraktion)");
bullet("Kategorisierung und Suchfunktion");
bullet("Lösungsbeschreibungen für wiederkehrende Themen");

h2("2.10 Benutzerverwaltung");
bullet("Rollen: Vorsitz, Stellvertreter, Mitglied, Ersatzmitglied, Admin");
bullet("JWT-basierte Authentifizierung");
bullet("Passwort-Reset per E-Mail");
bullet("Aktiv/Inaktiv-Status (kein Löschen wg. Audit-Trail)");

h2("2.11 Suche");
bullet("Globale Volltextsuche über Dokumente, Sitzungen, Aufgaben, Wissen");
bullet("Inkrementelle Ergebnisanzeige");

h2("2.12 Weitere Features");
bullet("Sitzungsvorlagen für wiederkehrende TOP-Strukturen");
bullet("Interne Nachrichten zwischen Mitgliedern");
bullet("Watch-Folder: Automatische Übernahme von Dateien aus Netzwerkordner");
bullet("System-Einstellungen mit anpassbarem PDF-Layout (Farben, Logo, Texte)");
bullet("Dashboard mit Übersicht (offene Aufgaben, Fristen, aktuelle Dokumente)");

// ══════════════════════════════════════════════════════════════════
// 3. TECHNISCHE ARCHITEKTUR
// ══════════════════════════════════════════════════════════════════

neuesKapitel("3. Technische Architektur");

h2("3.1 Programmiersprachen & Frameworks");
tabelle(
  ["Komponente", "Technologie", "Version"],
  [
    ["Backend",          "TypeScript + Node.js",     "20 (LTS)"],
    ["Backend-Framework","Fastify",                  "5.x"],
    ["Frontend",         "TypeScript + React",       "18.x"],
    ["Frontend-Build",   "Vite",                     "5.x"],
    ["Datenbank",        "PostgreSQL",               "16"],
    ["ORM",              "Prisma",                   "5.x"],
    ["PDF-Engine",       "pdfkit",                   "0.15.x"],
    ["Rich-Text-Editor", "TipTap (ProseMirror)",     "2.x"],
    ["CSS",              "Tailwind CSS",             "3.x"],
    ["Container",        "Docker + Docker Compose",  "—"],
  ],
  [200, 180, 95],
);

doc.moveDown(0.3);
h2("3.2 Architektur-Diagramm");
code(
`┌──────────────────────────────────────────────────────┐
│                 Intranet (LAN)                        │
│                                                       │
│  Browser ──► Port 3000 ──► Frontend (React/Nginx)    │
│                               │                       │
│  Browser ──► Port 4000 ──► Backend (Fastify/Node)    │
│                               │                       │
│                               ├──► PostgreSQL 16      │
│                               ├──► /data/storage      │
│                               └──► /data/watch_inbox  │
│                                                       │
│  Alle Komponenten im Docker-Netzwerk "brdms_net"      │
└──────────────────────────────────────────────────────┘`);

doc.moveDown(0.2);
h2("3.3 Docker-Container");
tabelle(
  ["Container", "Image", "Port", "Funktion"],
  [
    ["brdms_postgres", "postgres:16-alpine",      "intern", "Datenbank"],
    ["brdms_backend",  "node:20-alpine (Custom)",  "4000",   "REST API, PDF, Auth"],
    ["brdms_frontend", "nginx:alpine (Custom)",    "3000",   "React SPA"],
  ],
  [120, 160, 60, 135],
);

h2("3.4 Kommunikation");
bullet("Frontend ↔ Backend: REST/JSON über HTTP (Port 4000)");
bullet("Backend ↔ PostgreSQL: Prisma ORM über TCP (internes Docker-Netz)");
bullet("Dateisystem: Volume-Mounts für Storage, Logs, Watch-Folder");
bullet("Authentifizierung: JWT (Access Token), Bcrypt (Passwort-Hashing)");

// ══════════════════════════════════════════════════════════════════
// 4. DATENBANKSTRUKTUR
// ══════════════════════════════════════════════════════════════════

neuesKapitel("4. Datenbankstruktur");

h2("4.1 Entity-Relationship-Übersicht");
p("PostgreSQL 16 mit Prisma ORM. Alle Tabellen in deutscher Sprache. " +
  "UUIDs als Primärschlüssel. Automatische created_at/updated_at Timestamps.");

tabelle(
  ["Tabelle", "Beschreibung", "Wichtige Felder"],
  [
    ["benutzer",              "BR-Mitglieder & Admins",       "email, name, rolle, passwort_hash, aktiv"],
    ["sitzungen",             "BR-Sitzungen",                 "titel, sitzungsdatum, ort, status"],
    ["sitzung_versionen",     "Versionen einer Sitzung",      "version_nummer, typ, inhalts_json, pdf_pfad, zeitstempel"],
    ["tops",                  "Tagesordnungspunkte",          "nummer, titel, inhalts_json, status, spontan"],
    ["anwesenheiten",         "Anwesenheit pro Sitzung",      "status, vertretung_fuer_id"],
    ["beschluesse",           "Beschlüsse pro TOP",           "antragstext, ja_stimmen, nein_stimmen, finalisiert"],
    ["abstimmungen",          "Abstimmungen pro TOP",         "fragestellung, ja_stimmen, ergebnis"],
    ["dokumente",             "BR-Dokumente",                 "titel, kategorie, speicher_pfad, verschl_pfad, vertraulich"],
    ["dokument_versionen",    "Versionen von Dokumenten",     "version, speicherpfad, aenderungsnotiz"],
    ["fristen",               "Fristen für Anhörungen",       "typ, status, faellig_am"],
    ["aufgaben",              "Aufgaben",                     "titel, prioritaet, sichtbarkeit, erledigt"],
    ["wissen",                "Wissensdatenbank",             "titel, inhalt, kategorien, herkunft, loesung"],
    ["nachrichten",           "Interne Nachrichten",          "betreff, inhalt, typ, gelesen"],
    ["kommentare",            "Kommentare",                   "inhalt (sitzung/top/dokument)"],
    ["audit_logs",            "Revisions-Log (unveränderlich)","aktion, benutzer, dokument, sitzung, details"],
    ["system_einstellungen",  "Key-Value-Einstellungen",      "schluessel, wert"],
    ["sitzungs_vorlagen",     "Sitzungsvorlagen",             "name, beschreibung"],
  ],
  [140, 170, 165],
);

h2("4.2 Wichtige Enums");
tabelle(
  ["Enum", "Werte"],
  [
    ["Role",            "VORSITZ, STELLVERTRETER, MITGLIED, ERSATZMITGLIED, ADMIN"],
    ["SitzungStatus",   "ENTWURF, TAGESORDNUNG_FIXIERT, PROTOKOLL_ENTWURF, PROTOKOLL_FINAL, ABGESAGT"],
    ["TopStatus",       "OFFEN, BESCHLOSSEN, ABGELEHNT, VERTAGT, ZUR_KENNTNIS"],
    ["Prioritaet",      "HOCH, MITTEL, NIEDRIG"],
    ["Sichtbarkeit",    "PRIVAT, OEFFENTLICH"],
    ["DokumentStatus",  "AKTIV, ARCHIVIERT, LOESCHVORMERKUNG, GELOESCHT"],
  ],
  [140, 335],
);

// ══════════════════════════════════════════════════════════════════
// 5. MODUL-AUFBAU – BACKEND
// ══════════════════════════════════════════════════════════════════

neuesKapitel("5. Modul-Aufbau – Backend");

h2("5.1 Verzeichnisstruktur");
code(
`backend/
├── src/
│   ├── index.ts                  # Fastify-Server, Plugin-Registrierung
│   ├── lib/
│   │   ├── prisma.ts             # Prisma-Client Singleton
│   │   ├── encryption.ts         # AES-256-GCM Ver-/Entschlüsselung
│   │   ├── password.ts           # Bcrypt + Passwort-Reset Tokens
│   │   └── mailer.ts             # Nodemailer SMTP-Versand
│   ├── middleware/
│   │   ├── auth.ts               # JWT-Verifikation (HTTP-Only)
│   │   └── rbac.ts               # Rollen-basierte Zugriffskontrolle
│   ├── routes/ (17 Dateien)
│   │   ├── auth.ts               # Login, Logout
│   │   ├── benutzer.ts           # Benutzerverwaltung (CRUD)
│   │   ├── sitzungen.ts          # Sitzungen + Workflow (fixieren/finalisieren)
│   │   ├── themen.ts             # Tagesordnungspunkte
│   │   ├── anwesenheit.ts        # Anwesenheitserfassung
│   │   ├── beschluesse.ts        # Rechtssichere Beschlüsse
│   │   ├── abstimmungen.ts       # Abstimmungen (Voting)
│   │   ├── dokumente.ts          # Upload, Versionierung, Aktionen
│   │   ├── aufgaben.ts           # Aufgaben-CRUD + Sichtbarkeit
│   │   ├── pdf.ts                # PDF-Generierung & Download
│   │   ├── protocol.ts           # Protocol-Blocks (Meeting-Minutes)
│   │   ├── kommentare.ts         # Kommentar-Threads
│   │   ├── nachrichten.ts        # Interne BR-Nachrichten
│   │   ├── suche.ts              # Globale Volltextsuche
│   │   ├── wissen.ts             # Wissensdatenbank
│   │   ├── vorlagen.ts           # Sitzungsvorlagen
│   │   ├── einstellungen.ts      # System-Einstellungen + Logo
│   │   └── watchfolder.ts        # Watch-Folder Status
│   ├── services/
│   │   ├── pdf.service.ts        # PDF-Layout (Briefkopf, TOPs, Footer)
│   │   ├── watchfolder.service.ts # Ordner-Überwachung (chokidar)
│   │   └── dokument-pipeline.service.ts  # Upload → Verschlüsseln → Index
│   └── workers/
│       └── deletion.worker.ts    # Cron-Job: Löschung nach Fristen
├── prisma/
│   ├── schema.prisma             # Datenmodell (18 Modelle, 12 Enums)
│   └── seed.ts                   # Testdaten-Generator
├── scripts/
│   ├── reset-beta.sql            # Beta-Reset SQL
│   └── dokumentation-pdf.ts      # Diese Dokumentation
└── Dockerfile                    # Multi-Stage Build (Alpine)`);

h2("5.2 REST-API Endpunkte (Auswahl)");
tabelle(
  ["Methode", "Pfad", "Funktion"],
  [
    ["POST", "/api/auth/login",                    "Login → JWT (24h)"],
    ["GET",  "/api/sitzungen",                     "Alle Sitzungen"],
    ["POST", "/api/sitzungen/:id/fixieren",         "Status → TAGESORDNUNG_FIXIERT + PDF"],
    ["POST", "/api/sitzungen/:id/finalisieren",     "Status → PROTOKOLL_FINAL + Siegel"],
    ["GET",  "/api/sitzungen/:id/pdf/:vn",         "PDF-Download (v1.0–v2.1)"],
    ["GET",  "/api/sitzungen/:id/anwesenheitsliste","Anwesenheitsliste PDF"],
    ["POST", "/api/dokumente/upload",               "Dokument hochladen (AES-256)"],
    ["GET",  "/api/aufgaben",                       "Aufgaben (Sichtbarkeits-Filter)"],
    ["PATCH","/api/aufgaben/:id",                   "Aufgabe aktualisieren/abhaken"],
    ["POST", "/api/beschluesse/:id/finalisieren",   "Beschluss revisionssicher finalisieren"],
    ["GET",  "/api/suche?q=...",                    "Globale Volltextsuche"],
  ],
  [55, 200, 220],
);

// ══════════════════════════════════════════════════════════════════
// 6. MODUL-AUFBAU – FRONTEND
// ══════════════════════════════════════════════════════════════════

neuesKapitel("6. Modul-Aufbau – Frontend");

h2("6.1 Verzeichnisstruktur");
code(
`frontend/
├── src/
│   ├── main.tsx                   # React Root
│   ├── App.tsx                    # Router (15 Routen)
│   ├── lib/
│   │   ├── api.ts                 # API-Client + Typen (fetch-Wrapper)
│   │   ├── useDesign.ts           # Accent-Farben (anpassbar)
│   │   ├── TOPSMentionExtension.ts       # TipTap: TOP-Referenzen
│   │   └── DokumentReferenzExtension.ts  # TipTap: Dokument-Links
│   ├── components/
│   │   ├── Layout.tsx             # Sidebar + Navigation + User-Menü
│   │   ├── SitzungsEditor.tsx     # TipTap Rich-Text (TOPs + Protokoll)
│   │   ├── BeschlussBlock.tsx     # Beschluss-Formular + Antragstext
│   │   ├── AbstimmungsPanel.tsx   # Live-Voting Widget
│   │   ├── AnwesenheitsListe.tsx  # Anwesenheits-Checkboxen
│   │   ├── KommentarBlock.tsx     # Kommentar-Thread + → Aufgabe
│   │   └── TOPMentionPicker.tsx   # TOP-Referenz-Autovervollständigung
│   └── pages/ (15 Seiten)
│       ├── Dashboard.tsx          # Startseite (Aufgaben, Fristen, Dokumente)
│       ├── Login.tsx / PasswortReset.tsx / PasswortVergessen.tsx
│       ├── Sitzungen.tsx          # Liste + Detail + PDF-Download
│       ├── Dokumente.tsx / Eingang.tsx
│       ├── Aufgaben.tsx           # Filter: Alle/Offen/Erledigt + Modal
│       ├── Posteingang.tsx        # Nachrichten
│       ├── Suche.tsx              # Globale Suche
│       ├── Themensammlung.tsx     # TOP-Themen
│       ├── Wissensarchiv.tsx      # Wissen (Extrakt + Manuell)
│       ├── Vorlagen.tsx           # Sitzungsvorlagen
│       ├── Benutzer.tsx           # Benutzerverwaltung
│       └── Einstellungen.tsx      # PDF-Layout, Logo, Farben
└── Dockerfile                     # Multi-Stage: Vite Build → Nginx`);

h2("6.2 Technologien im Frontend");
bullet("React 18 mit Hooks und Functional Components");
bullet("React Router v6 für clientseitiges Routing");
bullet("Tailwind CSS 3 für Utility-First-Styling mit CSS-Variablen");
bullet("TipTap 2 (ProseMirror) als Rich-Text-Editor mit eigenen Extensions");
bullet("Lucide React für konsistente Icons");
bullet("Fetch-API für Backend-Kommunikation (JSON)");
bullet("Nginx als Static-File-Server im Produktionsbetrieb");

// ══════════════════════════════════════════════════════════════════
// 7. SICHERHEITSKONZEPT
// ══════════════════════════════════════════════════════════════════

neuesKapitel("7. Sicherheitskonzept");

h2("7.1 Authentifizierung");
bullet("JWT-basierte Authentifizierung (Access Token, 24h Gültigkeit)");
bullet("Passwörter mit Bcrypt (Salt Rounds: 12) gehasht");
bullet("Passwort-Reset via zeitlich begrenztem Token (1h) + E-Mail");

h2("7.2 Autorisierung (RBAC)");
bullet("VORSITZ: Alle Rechte inkl. Finalisierung, Benutzerverwaltung");
bullet("STELLVERTRETER: Vertretung bei Abwesenheit, fast alle Vorsitz-Rechte");
bullet("MITGLIED: Dokumente hochladen, kommentieren, abstimmen");
bullet("ERSATZMITGLIED: Lesend, nur aktiv wenn ordentliches Mitglied verhindert");
bullet("ADMIN: Technische Verwaltung, Systemeinstellungen");

h2("7.3 Verschlüsselung");
bullet("Dokumente werden AES-256-GCM verschlüsselt auf Platte gespeichert");
bullet("Verschlüsselungsschlüssel (ENCRYPTION_KEY) extern via Umgebungsvariable");
bullet("Entschlüsselung nur im RAM während Download/Anzeige");
bullet("PDF-Dateien ebenfalls verschlüsselt abgelegt");

h2("7.4 Datenschutz & DSGVO");
bullet("Automatische Löschfristen pro Dokumentkategorie (konfigurierbar)");
bullet("Löschvormerkung → 30 Tage Frist → Endgültige Löschung durch Deletion-Worker");
bullet("Vollständiges Audit-Log aller Aktionen (unveränderlich, revisionssicher)");
bullet("Keine personenbezogenen Daten in Logs");
bullet("Intranet-Betrieb: PostgreSQL nur intern erreichbar, kein Port-Mapping nach außen");
bullet("Keine externen Tracking-/Analyse-Dienste, keine Cloud-Abhängigkeit");

h2("7.5 Revisionssicherheit");
bullet("SHA-256-Zeitstempel bei finalen Protokollen (Integritätsnachweis)");
bullet("Alle Beschlüsse mit finalisiertAm + finalisiertVonId unveränderbar gespeichert");
bullet("PDF-Integritätsprüfung via Hash bei jedem Download");
bullet("Audit-Log für alle sicherheitsrelevanten Aktionen");

// ══════════════════════════════════════════════════════════════════
// 8. DEPLOYMENT & BETRIEB
// ══════════════════════════════════════════════════════════════════

neuesKapitel("8. Deployment & Betrieb");

h2("8.1 Infrastruktur");
bullet("Host: Synology NAS (Container Manager)");
bullet("Orchestrierung: Docker Compose (3 Container)");
bullet("Deployment: Python-Deploy-Skripte via SSH (base64-Transfer)");
bullet("Persistenz: Volume-Mounts für PostgreSQL, Storage, Logs, Watch-Folder");

h2("8.2 Deploy-Workflow");
code(
`1.  python3 deploy_<feature>.py       # Dateien per SSH übertragen
2.  docker compose build backend       # Backend neu bauen
3.  docker compose up -d backend       # Backend starten
4.  docker exec brdms_backend \
      npx prisma db push               # DB-Schema migrieren
5.  docker compose build --no-cache frontend  # Frontend neu bauen
6.  docker compose up -d frontend      # Frontend starten`);

h2("8.3 Wichtige Pfade (Synology)");
tabelle(
  ["Pfad", "Zweck"],
  [
    ["/volume1/docker/br-dms/",              "Projektverzeichnis"],
    ["/volume1/docker/br-dms/storage/",      "Verschlüsselte Dokumente"],
    ["/volume1/docker/br-dms/storage/logo/", "BR-Logo (bleibt bei Reset)"],
    ["/volume1/docker/br-dms/storage/pdfs/", "Generierte PDFs"],
    ["/volume1/docker/br-dms/postgres/",     "PostgreSQL-Daten"],
    ["/volume1/docker/br-dms/logs/",         "Backend-Logs"],
    ["/volume1/docker/br-dms/watch_inbox/",  "Watch-Folder Eingang"],
  ],
  [270, 205],
);

h2("8.4 Beta-Reset");
p("Für Tests kann das System zurückgesetzt werden. " +
  "Alle Inhalte (Sitzungen, Dokumente, Aufgaben, Wissen) werden gelöscht – " +
  "Benutzer und Systemeinstellungen bleiben erhalten:");
code(
`python3 deploy_reset_beta.py
# Dann die drei ausgegebenen Befehle auf der Synology ausführen.`);

// ── Abschluss ────────────────────────────────────────────────────
doc.moveDown(2);
doc.moveTo(LM, doc.y).lineTo(RM, doc.y).strokeColor(C_PRIMARY).lineWidth(1).stroke();
doc.moveDown(0.8);
doc.fontSize(10).font("Helvetica-Oblique").fillColor(C_GRAY)
   .text("BR-DMS – Entwickelt für Betriebsräte, von Betriebsräten. DSGVO-konform, Open Source.",
         LM, doc.y, { width: W, align: "center" });

// ── Seitenzahlen auf allen Seiten ────────────────────────────────
const seitenZahl = (doc as any).bufferedPageRange().count;
for (let i = 0; i < seitenZahl; i++) {
  doc.switchToPage(i);
  seitenFooter(i + 1, seitenZahl);
}

doc.end();
console.log(`PDF erstellt: /tmp/br-dms-dokumentation.pdf (${seitenZahl} Seiten)`);
