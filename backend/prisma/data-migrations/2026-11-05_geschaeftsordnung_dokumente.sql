-- Geschaeftsordnung.dokumentId (bis 1.8.x) wird zur Tabelle geschaeftsordnung_dokumente
-- (mehrere Dokumente als Paket, seit 1.9.1). Legt die Tabelle selbst an und übernimmt die
-- Zuordnungen, bevor "prisma db push" läuft. Sonst bricht db push auf bestehenden
-- Installationen ab, weil die alte Spalte noch Werte enthält. Namen wie von Prisma erzeugt,
-- damit db push danach keinen Unterschied mehr sieht.
--
-- Idempotent: läuft bei jedem Start; bei Neuinstallationen (Tabelle fehlt noch) und nach
-- dem ersten Mal (alte Spalte fehlt) tut es nichts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'geschaeftsordnungen' AND column_name = 'dokument_id') THEN
    CREATE TABLE IF NOT EXISTS "geschaeftsordnung_dokumente" (
      "id" TEXT NOT NULL,
      "geschaeftsordnung_id" TEXT NOT NULL,
      "dokument_id" TEXT NOT NULL,
      "reihenfolge" INTEGER NOT NULL DEFAULT 0,
      "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "geschaeftsordnung_dokumente_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "geschaeftsordnung_dokumente_dokument_id_idx" ON "geschaeftsordnung_dokumente"("dokument_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "geschaeftsordnung_dokumente_geschaeftsordnung_id_dokument_i_key"
      ON "geschaeftsordnung_dokumente"("geschaeftsordnung_id", "dokument_id");
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geschaeftsordnung_dokumente_geschaeftsordnung_id_fkey') THEN
      ALTER TABLE "geschaeftsordnung_dokumente" ADD CONSTRAINT "geschaeftsordnung_dokumente_geschaeftsordnung_id_fkey"
        FOREIGN KEY ("geschaeftsordnung_id") REFERENCES "geschaeftsordnungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geschaeftsordnung_dokumente_dokument_id_fkey') THEN
      ALTER TABLE "geschaeftsordnung_dokumente" ADD CONSTRAINT "geschaeftsordnung_dokumente_dokument_id_fkey"
        FOREIGN KEY ("dokument_id") REFERENCES "dokumente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    INSERT INTO "geschaeftsordnung_dokumente" ("id", "geschaeftsordnung_id", "dokument_id")
      SELECT gen_random_uuid()::text, "id", "dokument_id" FROM "geschaeftsordnungen" WHERE "dokument_id" IS NOT NULL
      ON CONFLICT DO NOTHING;
    ALTER TABLE "geschaeftsordnungen" DROP COLUMN "dokument_id";
  END IF;
END $$;
