-- Migration: Scan-Eingang aus dem Watch-Folder-Unterordner "protokoll_scan"
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TABLE "scan_eingang" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "dateiname"      TEXT NOT NULL,
  "speicher_pfad"  TEXT NOT NULL,
  "verschl_pfad"   TEXT NOT NULL,
  "datei_groesse"  INTEGER NOT NULL,
  "mime_typ"       TEXT NOT NULL,
  "pruefsumme"     TEXT NOT NULL,
  "erkannt_am"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
