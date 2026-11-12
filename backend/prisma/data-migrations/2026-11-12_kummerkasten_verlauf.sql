-- Kummerkasten: aus dem einzelnen Antwortfeld wird ein Gesprächsverlauf.
--
-- Die Spalten kummerkasten_eintraege.antwort / antwort_am (kurz im Einsatz) werden durch
-- die Tabelle kummerkasten_nachrichten ersetzt. Eine bereits geschriebene Antwort wandert
-- als erste Betriebsrats-Blase in den Verlauf, erst danach fallen die Spalten weg – sonst
-- würde "prisma db push" sie mit Datenverlust-Warnung verweigern oder die Antwort vernichten.
--
-- Wird vom Entrypoint VOR "prisma db push" ausgeführt. Die Tabelle wird hier mit genau den
-- Namen und Typen angelegt, die Prisma für schema.prisma erzeugt (db push findet danach nichts
-- mehr zu ändern). Idempotent: greift nur, solange die Spalte "antwort" noch existiert; auf
-- Neuinstallationen ohne Wirkung, dort legt db push alles selbst an.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kummerkasten_eintraege' AND column_name = 'antwort'
  ) THEN

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KummerkastenAbsender') THEN
      CREATE TYPE "KummerkastenAbsender" AS ENUM ('EINREICHER', 'BETRIEBSRAT');
    END IF;

    CREATE TABLE IF NOT EXISTS "kummerkasten_nachrichten" (
      "id" TEXT NOT NULL,
      "eintrag_id" TEXT NOT NULL,
      "absender" "KummerkastenAbsender" NOT NULL,
      "text" TEXT NOT NULL,
      "bearbeitet_von_id" TEXT,
      "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "kummerkasten_nachrichten_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX IF NOT EXISTS "kummerkasten_nachrichten_eintrag_id_erstellt_am_idx"
      ON "kummerkasten_nachrichten"("eintrag_id", "erstellt_am");

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kummerkasten_nachrichten_eintrag_id_fkey') THEN
      ALTER TABLE "kummerkasten_nachrichten" ADD CONSTRAINT "kummerkasten_nachrichten_eintrag_id_fkey"
        FOREIGN KEY ("eintrag_id") REFERENCES "kummerkasten_eintraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kummerkasten_nachrichten_bearbeitet_von_id_fkey') THEN
      ALTER TABLE "kummerkasten_nachrichten" ADD CONSTRAINT "kummerkasten_nachrichten_bearbeitet_von_id_fkey"
        FOREIGN KEY ("bearbeitet_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    INSERT INTO "kummerkasten_nachrichten" ("id", "eintrag_id", "absender", "text", "bearbeitet_von_id", "erstellt_am")
    SELECT gen_random_uuid()::text, e."id", 'BETRIEBSRAT', e."antwort", e."bearbeitet_von_id",
           COALESCE(e."antwort_am", e."bearbeitet_am", e."erstellt_am")
    FROM "kummerkasten_eintraege" e
    WHERE e."antwort" IS NOT NULL AND btrim(e."antwort") <> '';

    ALTER TABLE "kummerkasten_eintraege" DROP COLUMN "antwort";
    ALTER TABLE "kummerkasten_eintraege" DROP COLUMN IF EXISTS "antwort_am";
  END IF;
END $$;
