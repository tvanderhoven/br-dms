-- Datenerhaltende Migration: GehaltsstufenEintrag.stufe (String, z.B. "B:3.2")
-- aufteilen in structured gruppe/stufe (Int) + eigene Zeitmodell-Historie mit
-- echtem Gültigkeitszeitraum.
--
-- Idempotent: läuft bei jedem Start, tut aber nach dem ersten Mal nichts mehr,
-- weil dann die Spalte "gruppe" schon existiert (Guard-Bedingung unten).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gehaltsstufen_eintraege' AND column_name = 'gruppe'
  ) THEN

    -- 1) Neue Spalten anlegen, aus dem alten String-Feld befüllen (nur wo das
    --    Format "Buchstabe:Gruppe.Stufe" passt – Rest bleibt NULL, siehe unten)
    ALTER TABLE "gehaltsstufen_eintraege" ADD COLUMN "gruppe" INTEGER;
    ALTER TABLE "gehaltsstufen_eintraege" ADD COLUMN "stufe_neu" INTEGER;

    UPDATE "gehaltsstufen_eintraege"
    SET
      "gruppe"    = substring("stufe" from '^[A-Da-d]:([1-6])\.[1-4]$')::int,
      "stufe_neu" = substring("stufe" from '^[A-Da-d]:[1-6]\.([1-4])$')::int
    WHERE "stufe" ~ '^[A-Da-d]:[1-6]\.[1-4]$';

    -- 2) Zeitmodell-Enum + Tabelle anlegen
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Zeitmodell') THEN
      CREATE TYPE "Zeitmodell" AS ENUM ('A', 'B', 'C', 'D');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zeitmodell_eintraege') THEN
      CREATE TABLE "zeitmodell_eintraege" (
        "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "mitarbeiter_id"  TEXT NOT NULL,
        "zeitmodell"      "Zeitmodell" NOT NULL,
        "gueltig_von"     TIMESTAMP(3) NOT NULL,
        "gueltig_bis"     TIMESTAMP(3),
        "bemerkung"       TEXT,
        "erstellt_am"     TIMESTAMP(3) NOT NULL DEFAULT now(),
        "aktualisiert_am" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "zeitmodell_eintraege_pkey" PRIMARY KEY ("id")
      );
      CREATE INDEX "zeitmodell_eintraege_mitarbeiter_id_gueltig_von_idx"
        ON "zeitmodell_eintraege"("mitarbeiter_id", "gueltig_von");
      ALTER TABLE "zeitmodell_eintraege"
        ADD CONSTRAINT "zeitmodell_eintraege_mitarbeiter_id_fkey"
        FOREIGN KEY ("mitarbeiter_id") REFERENCES "mitarbeiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- 3) Zeitmodell-Zeiträume aus der bisherigen Historie rekonstruieren:
    --    aufeinanderfolgende Einträge mit gleichem Zeitmodell-Buchstaben pro
    --    Mitarbeiter zu einem Zeitraum zusammenfassen; "bis" = Start des
    --    nächsten abweichenden Zeitraums minus 1 Tag, beim letzten (aktuellen)
    --    Zeitraum bleibt "bis" NULL (unbefristet).
    INSERT INTO "zeitmodell_eintraege" ("mitarbeiter_id", "zeitmodell", "gueltig_von", "gueltig_bis")
    WITH geparst AS (
      SELECT
        mitarbeiter_id,
        gueltig_ab,
        upper(substring(stufe from '^([A-Da-d]):[1-6]\.[1-4]$')) AS zeitmodell
      FROM "gehaltsstufen_eintraege"
      WHERE stufe ~ '^[A-Da-d]:[1-6]\.[1-4]$'
    ),
    mit_vorherigem AS (
      SELECT
        *,
        LAG(zeitmodell) OVER (PARTITION BY mitarbeiter_id ORDER BY gueltig_ab) AS zeitmodell_vorher
      FROM geparst
    ),
    mit_gruppe AS (
      SELECT
        *,
        SUM(CASE WHEN zeitmodell IS DISTINCT FROM zeitmodell_vorher THEN 1 ELSE 0 END)
          OVER (PARTITION BY mitarbeiter_id ORDER BY gueltig_ab) AS gruppen_nr
      FROM mit_vorherigem
    ),
    zeitraeume AS (
      SELECT mitarbeiter_id, zeitmodell, gruppen_nr, MIN(gueltig_ab) AS von
      FROM mit_gruppe
      GROUP BY mitarbeiter_id, zeitmodell, gruppen_nr
    )
    SELECT
      mitarbeiter_id,
      zeitmodell::"Zeitmodell",
      von,
      LEAD(von) OVER (PARTITION BY mitarbeiter_id ORDER BY von) - INTERVAL '1 day' AS bis
    FROM zeitraeume;

    -- 4) Alte String-Spalte erst jetzt loswerden, nachdem alles daraus
    --    ausgelesen wurde
    ALTER TABLE "gehaltsstufen_eintraege" DROP COLUMN "stufe";
    ALTER TABLE "gehaltsstufen_eintraege" RENAME COLUMN "stufe_neu" TO "stufe";

  END IF;
END $$;
