-- Ergänzt das Zeitmodell um ein "standard"-Flag (Vorauswahl beim Anlegen
-- eines neuen Zeitraums) – läuft nach 2026-10-14_zeitmodell_stammdaten.sql,
-- das die Tabelle "zeitmodelle" erst anlegt.
--
-- Idempotent: läuft bei jedem Start, tut aber nach dem ersten Mal nichts
-- mehr, weil die Spalte dann schon existiert.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'zeitmodelle'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'zeitmodelle' AND column_name = 'standard'
  ) THEN
    ALTER TABLE "zeitmodelle" ADD COLUMN "standard" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
