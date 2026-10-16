-- Migration: Abwesenheitskalender (Ladung erkennt verhinderte Mitglieder)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TYPE "AbwesenheitsGrund" AS ENUM ('URLAUB', 'KRANKHEIT', 'SCHULUNG', 'DIENSTREISE', 'SONSTIGES');

CREATE TABLE "abwesenheiten" (
  "id" TEXT PRIMARY KEY,
  "benutzer_id" TEXT NOT NULL REFERENCES "benutzer"("id") ON DELETE CASCADE,
  "von" DATE NOT NULL,
  "bis" DATE NOT NULL,
  "grund" "AbwesenheitsGrund" NOT NULL,
  "erfasst_von_id" TEXT,
  "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "abwesenheiten_von_bis_idx" ON "abwesenheiten"("von", "bis");
CREATE INDEX "abwesenheiten_benutzer_id_idx" ON "abwesenheiten"("benutzer_id");
