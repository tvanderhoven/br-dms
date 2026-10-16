-- Migration: Einberufung auf Antrag (§ 29 Abs. 2 BetrVG)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "FristTyp" ADD VALUE IF NOT EXISTS 'EINBERUFUNG_29';

ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'EINBERUFUNGSANTRAG_ERSTELLT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'EINBERUFUNGSANTRAG_UNTERZEICHNET';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'EINBERUFUNGSANTRAG_AKTIV';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'EINBERUFUNGSANTRAG_ERLEDIGT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'EINBERUFUNGSANTRAG_GELOESCHT';

CREATE TABLE "einberufungsantraege" (
  "id" TEXT PRIMARY KEY,
  "antragsteller_typ" TEXT NOT NULL,
  "grund" TEXT NOT NULL,
  "erfasst_von_id" TEXT NOT NULL REFERENCES "benutzer"("id"),
  "zugang_am" TIMESTAMP(3),
  "sitzung_id" TEXT REFERENCES "sitzungen"("id") ON DELETE SET NULL,
  "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "einberufungsantrag_unterzeichner" (
  "id" TEXT PRIMARY KEY,
  "antrag_id" TEXT NOT NULL REFERENCES "einberufungsantraege"("id") ON DELETE CASCADE,
  "benutzer_id" TEXT NOT NULL REFERENCES "benutzer"("id") ON DELETE CASCADE,
  "unterzeichnet_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("antrag_id", "benutzer_id")
);

ALTER TABLE "fristen" ADD COLUMN IF NOT EXISTS "einberufungsantrag_id" TEXT
  REFERENCES "einberufungsantraege"("id") ON DELETE CASCADE;
