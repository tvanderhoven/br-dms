-- Migration: WissensEintrag bekommt Rich-Text-Felder fuer Sachverhalt und Loesung
-- (analog zu Kommentar.inhaltJson) - der Plaintext (inhalt/loesung) bleibt fuer
-- Suche/Vorschau erhalten, Alt-Datensaetze werden beim Bearbeiten im Frontend
-- automatisch in TipTap-JSON umgewandelt (siehe textZuTiptap in frontend/src/lib/tiptap.ts).
-- Hinweis: laeuft ueber "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "wissen"
  ADD COLUMN "inhalt_json" JSONB,
  ADD COLUMN "loesung_json" JSONB;
