-- Migration: Unterschriftenseite + Scan-Upload (Paket 4, Stufe 4)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TYPE "SitzungScanTyp" AS ENUM ('ANWESENHEITSLISTE', 'PROTOKOLL_UNTERSCHRIFTEN');

CREATE TABLE "sitzung_scans" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "sitzung_id"        TEXT NOT NULL REFERENCES "sitzungen"("id") ON DELETE CASCADE,
  "typ"               "SitzungScanTyp" NOT NULL,
  "dateiname"         TEXT NOT NULL,
  "speicher_pfad"     TEXT NOT NULL,
  "verschl_pfad"      TEXT NOT NULL,
  "datei_groesse"     INTEGER NOT NULL,
  "mime_typ"          TEXT NOT NULL,
  "pruefsumme"        TEXT NOT NULL,
  "hochgeladen_am"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hochgeladen_von_id" TEXT NOT NULL REFERENCES "benutzer"("id")
);

CREATE UNIQUE INDEX "sitzung_scans_sitzung_id_typ_key" ON "sitzung_scans"("sitzung_id", "typ");

ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'SITZUNG_SCAN_HOCHGELADEN';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'SITZUNG_SCAN_GELOESCHT';
