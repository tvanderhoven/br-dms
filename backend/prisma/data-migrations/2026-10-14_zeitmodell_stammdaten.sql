-- Datenerhaltende Migration: Zeitmodell von einem festen 4-Werte-Enum
-- (A/B/C/D) auf eine frei konfigurierbare Stammdaten-Tabelle umstellen, damit
-- jede Installation ihre eigenen Zeitmodell-Bezeichnungen (und optional eine
-- Wochenstunden-Zahl) pflegen kann, statt im Code festzustehen.
--
-- Idempotent: läuft bei jedem Start, tut aber nach dem ersten Mal nichts mehr,
-- weil dann die Spalte "zeitmodell_id" schon existiert (Guard-Bedingung unten).
-- Existiert die Tabelle "zeitmodell_eintraege" noch gar nicht (Neuinstallation),
-- gibt es nichts zu migrieren – "prisma db push" legt die neue Tabelle
-- "zeitmodelle" leer an, der Betrieb pflegt seine eigenen Bezeichnungen selbst.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'zeitmodell_eintraege'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'zeitmodell_eintraege' AND column_name = 'zeitmodell_id'
  ) THEN

    -- 1) Neue Stammdaten-Tabelle anlegen (falls noch nicht vorhanden)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zeitmodelle') THEN
      CREATE TABLE "zeitmodelle" (
        "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "bezeichnung"     TEXT NOT NULL,
        "wochenstunden"   DECIMAL(4,1),
        "sortierung"      INTEGER NOT NULL DEFAULT 0,
        "aktiv"           BOOLEAN NOT NULL DEFAULT true,
        "erstellt_am"     TIMESTAMP(3) NOT NULL DEFAULT now(),
        "aktualisiert_am" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "zeitmodelle_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX "zeitmodelle_bezeichnung_key" ON "zeitmodelle"("bezeichnung");
    END IF;

    -- 2) Seed: die bisherigen vier Enum-Werte 1:1 als Zeilen anlegen, damit sich
    --    an der Bedeutung der bestehenden Historie nichts ändert. Die
    --    Bezeichnungen können danach in den Einstellungen frei umbenannt werden.
    INSERT INTO "zeitmodelle" ("bezeichnung", "sortierung")
    SELECT t.buchstabe, t.reihe
    FROM (VALUES ('A', 0), ('B', 1), ('C', 2), ('D', 3)) AS t(buchstabe, reihe)
    WHERE NOT EXISTS (SELECT 1 FROM "zeitmodelle" WHERE "bezeichnung" = t.buchstabe);

    -- 3) Neue FK-Spalte anlegen, aus dem alten Enum-Wert befüllen
    ALTER TABLE "zeitmodell_eintraege" ADD COLUMN "zeitmodell_id" TEXT;

    UPDATE "zeitmodell_eintraege" e
    SET "zeitmodell_id" = z."id"
    FROM "zeitmodelle" z
    WHERE z."bezeichnung" = e."zeitmodell"::text;

    ALTER TABLE "zeitmodell_eintraege" ALTER COLUMN "zeitmodell_id" SET NOT NULL;
    ALTER TABLE "zeitmodell_eintraege"
      ADD CONSTRAINT "zeitmodell_eintraege_zeitmodell_id_fkey"
      FOREIGN KEY ("zeitmodell_id") REFERENCES "zeitmodelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    CREATE INDEX "zeitmodell_eintraege_zeitmodell_id_idx" ON "zeitmodell_eintraege"("zeitmodell_id");

    -- 4) Alte Enum-Spalte + Enum-Typ erst jetzt loswerden, nachdem alles daraus
    --    ausgelesen wurde
    ALTER TABLE "zeitmodell_eintraege" DROP COLUMN "zeitmodell";
    DROP TYPE IF EXISTS "Zeitmodell";

  END IF;
END $$;
