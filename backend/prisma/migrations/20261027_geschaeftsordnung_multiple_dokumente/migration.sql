-- Migration: Geschäftsordnung mit mehreren Dokumenten
-- Ändert die Beziehung von 1-zu-1 (dokumentId) zu viele-zu-viele (über Junction-Tabelle)

-- Neue Junction-Tabelle für Many-to-Many-Beziehung
CREATE TABLE "geschaeftsordnung_dokumente" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "geschaeftsordnung_id" TEXT NOT NULL,
  "dokument_id" TEXT NOT NULL,
  "reihenfolge" INTEGER NOT NULL DEFAULT 0,
  "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "geschaeftsordnung_dokumente_geschaeftsordnung_id_dokument_id_key"
    UNIQUE("geschaeftsordnung_id", "dokument_id"),

  CONSTRAINT "geschaeftsordnung_dokumente_geschaeftsordnung_id_fkey"
    FOREIGN KEY ("geschaeftsordnung_id") REFERENCES "geschaeftsordnungen" ("id") ON DELETE CASCADE,

  CONSTRAINT "geschaeftsordnung_dokumente_dokument_id_fkey"
    FOREIGN KEY ("dokument_id") REFERENCES "dokumente" ("id") ON DELETE CASCADE
);

-- Index für schnelle Lookups
CREATE INDEX "geschaeftsordnung_dokumente_dokument_id_idx" ON "geschaeftsordnung_dokumente"("dokument_id");

-- Alte Daten migrieren (falls vorhanden)
INSERT INTO "geschaeftsordnung_dokumente" ("id", "geschaeftsordnung_id", "dokument_id", "reihenfolge", "erstellt_am")
SELECT
  gen_random_uuid(),
  "id",
  "dokument_id",
  0,
  "erstellt_am"
FROM "geschaeftsordnungen"
WHERE "dokument_id" IS NOT NULL;

-- Alte Spalten entfernen
ALTER TABLE "geschaeftsordnungen" DROP COLUMN "dokument_id";
