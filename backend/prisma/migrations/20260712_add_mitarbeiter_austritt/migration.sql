-- Migration: Mitarbeiter – Austrittsdatum
-- Ergänzt Feld für den CSV-Import der Gehaltstabelle

ALTER TABLE "mitarbeiter"
  ADD COLUMN "austritt" TIMESTAMP(3);
