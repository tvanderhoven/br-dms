-- Migration: Geschäftsordnung-Register (§ 36 BetrVG)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "Kategorie" ADD VALUE IF NOT EXISTS 'GESCHAEFTSORDNUNG';

CREATE TABLE "geschaeftsordnungen" (
    "id" TEXT NOT NULL,
    "beschlossen_am" TIMESTAMP(3) NOT NULL,
    "bemerkung" TEXT,
    "dokument_id" TEXT,
    "erstellt_von_id" TEXT NOT NULL,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiert_am" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geschaeftsordnungen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "geschaeftsordnungen_beschlossen_am_idx" ON "geschaeftsordnungen"("beschlossen_am");

ALTER TABLE "geschaeftsordnungen" ADD CONSTRAINT "geschaeftsordnungen_dokument_id_fkey"
    FOREIGN KEY ("dokument_id") REFERENCES "dokumente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "geschaeftsordnungen" ADD CONSTRAINT "geschaeftsordnungen_erstellt_von_id_fkey"
    FOREIGN KEY ("erstellt_von_id") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'GESCHAEFTSORDNUNG_ERSTELLT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'GESCHAEFTSORDNUNG_AKTUALISIERT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'GESCHAEFTSORDNUNG_GELOESCHT';
