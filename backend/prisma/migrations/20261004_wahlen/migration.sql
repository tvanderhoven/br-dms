-- Migration: Wahlen (BR/JAV) mit automatisch berechneten Fristen
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "FristTyp" ADD VALUE IF NOT EXISTS 'WAHL';
CREATE TYPE "WahlArt" AS ENUM ('BR', 'JAV');
CREATE TYPE "WahlVerfahren" AS ENUM ('NORMAL', 'VEREINFACHT');

CREATE TABLE "wahlen" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "titel"           TEXT NOT NULL,
  "art"             "WahlArt" NOT NULL,
  "verfahren"       "WahlVerfahren" NOT NULL,
  "stimmabgabe_am"  TIMESTAMP(3) NOT NULL,
  "amtszeit_ende"   TIMESTAMP(3),
  "ausschreiben_am" TIMESTAMP(3),
  "notiz"           TEXT,
  "vorhaben_id"     TEXT,
  "erstellt_von_id" TEXT NOT NULL,
  "erstellt_am"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "fristen" ADD COLUMN "wahl_id" TEXT, ADD COLUMN "wahl_schritt" TEXT;
ALTER TABLE "fristen" ADD CONSTRAINT "fristen_wahl_id_fkey"
  FOREIGN KEY ("wahl_id") REFERENCES "wahlen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stufe 2: Wählerliste
ALTER TABLE "wahlen"
  ADD COLUMN "dual_studierende_als_azubis" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ausgeschlossen" TEXT[] DEFAULT ARRAY[]::TEXT[];
