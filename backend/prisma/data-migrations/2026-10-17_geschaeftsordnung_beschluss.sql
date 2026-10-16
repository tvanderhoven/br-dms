-- Legt Geschaeftsordnung.beschlussId (1.7.7) selbst an, bevor "prisma db push"
-- läuft. Sonst bricht db push auf bestehenden Installationen ab: Für die neue
-- eindeutige Spalte auf einer vorhandenen Tabelle verlangt Prisma
-- --accept-data-loss, obwohl die Spalte noch leer ist (NULL ist in Postgres
-- nie ein Duplikat). Namen wie von Prisma erzeugt, damit db push danach
-- keinen Unterschied mehr sieht.
--
-- Idempotent: läuft bei jedem Start; bei Neuinstallationen (Tabelle fehlt
-- noch) und nach dem ersten Mal tut es nichts.
DO $$
BEGIN
  IF to_regclass('public.geschaeftsordnungen') IS NOT NULL AND to_regclass('public.beschluesse') IS NOT NULL THEN
    ALTER TABLE "geschaeftsordnungen" ADD COLUMN IF NOT EXISTS "beschluss_id" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "geschaeftsordnungen_beschluss_id_key" ON "geschaeftsordnungen"("beschluss_id");
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geschaeftsordnungen_beschluss_id_fkey') THEN
      ALTER TABLE "geschaeftsordnungen" ADD CONSTRAINT "geschaeftsordnungen_beschluss_id_fkey"
        FOREIGN KEY ("beschluss_id") REFERENCES "beschluesse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
