-- Migration: Geschaeftsordnung mit Beschluss verknuepfen (§ 36 Abs. 1 Satz 2 BetrVG)
-- Hinweis: laeuft ueber "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "geschaeftsordnungen" ADD COLUMN IF NOT EXISTS "beschluss_id" TEXT UNIQUE
  REFERENCES "beschluesse"("id") ON DELETE SET NULL;
