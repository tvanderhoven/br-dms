-- Migration: Ersatzmitglieder-Nachrücklogik mit Quoten-Warnung
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TYPE "Geschlecht" AS ENUM ('MAENNLICH', 'WEIBLICH');

ALTER TABLE "benutzer"
  ADD COLUMN "geschlecht" "Geschlecht",
  ADD COLUMN "wahl_reihenfolge" INTEGER;
