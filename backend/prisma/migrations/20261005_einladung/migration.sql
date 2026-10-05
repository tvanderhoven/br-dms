-- Migration: Zweitadresse für Einladungen (Paket 4, Stufe 2)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "benutzer" ADD COLUMN "einladung_email" TEXT;

-- Versandnachweis der Einladungen (Paket 4, Stufe 3)
CREATE TABLE "einladung_versand" (
  "id"               TEXT PRIMARY KEY,
  "sitzung_id"       TEXT NOT NULL REFERENCES "sitzungen"("id") ON DELETE CASCADE,
  "benutzer_id"      TEXT,
  "name"             TEXT NOT NULL,
  "adresse"          TEXT NOT NULL,
  "rolle"            TEXT NOT NULL,
  "vertretung_fuer"  TEXT,
  "mit_anhang"       BOOLEAN NOT NULL DEFAULT false,
  "erfolgreich"      BOOLEAN NOT NULL,
  "fehler"           TEXT,
  "versendet_am"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "versendet_von_id" TEXT NOT NULL,
  "versendet_von"    TEXT NOT NULL
);
CREATE INDEX "einladung_versand_sitzung_id_idx" ON "einladung_versand"("sitzung_id");
