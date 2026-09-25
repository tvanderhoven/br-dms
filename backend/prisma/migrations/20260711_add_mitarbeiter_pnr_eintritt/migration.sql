-- Migration: Mitarbeiter – Personalnummer (pnr) und Eintrittsdatum
-- Ergänzt Felder für den CSV-Import der Gehaltstabelle

ALTER TABLE "mitarbeiter"
  ADD COLUMN "pnr" TEXT,
  ADD COLUMN "eintritt" TIMESTAMP(3);

CREATE UNIQUE INDEX "mitarbeiter_pnr_key" ON "mitarbeiter"("pnr");
