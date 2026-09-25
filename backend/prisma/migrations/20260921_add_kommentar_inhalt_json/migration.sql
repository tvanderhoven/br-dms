-- Migration: Kommentar bekommt Rich-Text-Feld (analog zu TOP.inhaltsJson)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "kommentare"
  ADD COLUMN "inhalt_json" JSONB;
