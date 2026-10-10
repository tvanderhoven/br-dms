-- Migration: Kostenübersicht nach § 40 BetrVG
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "qualifikationen" ADD COLUMN IF NOT EXISTS "br_schulung" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "KostenArt" AS ENUM ('SCHULUNG', 'SACHVERSTAENDIGER', 'RECHTSANWALT', 'EINIGUNGSSTELLE', 'SACHMITTEL', 'REISEKOSTEN', 'SONSTIGES');
CREATE TYPE "KostenStatus" AS ENUM ('BEANTRAGT', 'ZUGESAGT', 'BEZAHLT', 'ABGELEHNT');

CREATE TABLE "kostenposten" (
  "id" TEXT PRIMARY KEY,
  "datum" TIMESTAMP(3) NOT NULL,
  "art" "KostenArt" NOT NULL,
  "bezeichnung" TEXT NOT NULL,
  "empfaenger" TEXT,
  "betrag_cent" INTEGER NOT NULL,
  "status" "KostenStatus" NOT NULL DEFAULT 'BEANTRAGT',
  "bemerkung" TEXT,
  "beschluss_id" TEXT REFERENCES "beschluesse"("id") ON DELETE SET NULL,
  "dokument_id" TEXT REFERENCES "dokumente"("id") ON DELETE SET NULL,
  "schulungstermin_id" TEXT UNIQUE REFERENCES "schulungstermine"("id") ON DELETE CASCADE,
  "erstellt_von_id" TEXT,
  "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "kostenposten_datum_idx" ON "kostenposten"("datum");

ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'KOSTEN_ERSTELLT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'KOSTEN_GEAENDERT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'KOSTEN_GELOESCHT';
