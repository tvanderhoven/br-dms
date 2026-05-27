-- Migration: Projektplanung-Modul
-- Erweitert Aufgaben um Hierarchie, Zeiträume und Projekttyp

-- Enum für Aufgaben-Typ
CREATE TYPE "AufgabeTyp" AS ENUM ('PROJEKT', 'AUFGABE');

-- Neue Spalten zur aufgaben-Tabelle hinzufügen
ALTER TABLE "aufgaben"
  ADD COLUMN "typ"             "AufgabeTyp"   NOT NULL DEFAULT 'AUFGABE',
  ADD COLUMN "start_datum"     TIMESTAMP(3),
  ADD COLUMN "end_datum"       TIMESTAMP(3),
  ADD COLUMN "farbe"           TEXT,
  ADD COLUMN "ober_projekt_id" TEXT;

-- Fremdschlüssel für Hierarchie
ALTER TABLE "aufgaben"
  ADD CONSTRAINT "aufgaben_ober_projekt_id_fkey"
  FOREIGN KEY ("ober_projekt_id")
  REFERENCES "aufgaben"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Index für schnelle Kinder-Abfragen
CREATE INDEX "aufgaben_ober_projekt_id_idx" ON "aufgaben"("ober_projekt_id");
