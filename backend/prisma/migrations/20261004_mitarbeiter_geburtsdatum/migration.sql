-- Migration: Geburtsdatum für Mitarbeiter (Wahlberechtigung BR/JAV)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "mitarbeiter" ADD COLUMN "geburtsdatum" TIMESTAMP(3);

-- Geschlecht für Mitarbeiter (Wählerliste getrennt nach Geschlechtern, § 15 BetrVG)
ALTER TABLE "mitarbeiter" ADD COLUMN "geschlecht" "Geschlecht";
