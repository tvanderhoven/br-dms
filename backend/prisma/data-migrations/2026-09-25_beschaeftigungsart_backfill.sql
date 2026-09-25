-- Datenerhaltende Migration: ist_zeitarbeiter (Boolean) → beschaeftigungsart (Enum)
--
-- Wird vom Entrypoint VOR "prisma db push" ausgeführt, weil db push die alte
-- Spalte sonst einfach mit --accept-data-loss löschen würde (265 Mitarbeiter
-- hatten auf dem NAS bereits ist_zeitarbeiter=true gesetzt – das darf nicht
-- verloren gehen). Idempotent: läuft bei jedem Start, tut aber nach dem
-- ersten Mal nichts mehr, weil dann "beschaeftigungsart" schon existiert.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mitarbeiter' AND column_name = 'ist_zeitarbeiter'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mitarbeiter' AND column_name = 'beschaeftigungsart'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Beschaeftigungsart') THEN
      CREATE TYPE "Beschaeftigungsart" AS ENUM ('MITARBEITER', 'AZUBI', 'STUDENT', 'ZEITARBEITER');
    END IF;

    ALTER TABLE "mitarbeiter" ADD COLUMN "beschaeftigungsart" "Beschaeftigungsart" NOT NULL DEFAULT 'MITARBEITER';
    UPDATE "mitarbeiter" SET "beschaeftigungsart" = 'ZEITARBEITER' WHERE "ist_zeitarbeiter" = true;
    ALTER TABLE "mitarbeiter" DROP COLUMN "ist_zeitarbeiter";
  END IF;
END $$;
