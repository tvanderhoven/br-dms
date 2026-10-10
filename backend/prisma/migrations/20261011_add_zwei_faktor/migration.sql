-- Migration: Zwei-Faktor-Anmeldung (TOTP) und "Mein Konto"
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "benutzer" ADD COLUMN IF NOT EXISTS "zwei_faktor_geheimnis" TEXT;
ALTER TABLE "benutzer" ADD COLUMN IF NOT EXISTS "zwei_faktor_aktiv" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "benutzer" ADD COLUMN IF NOT EXISTS "zwei_faktor_letzter_schritt" INTEGER;
ALTER TABLE "benutzer" ADD COLUMN IF NOT EXISTS "zwei_faktor_wiederherstellung" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'EMAIL_GEAENDERT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'ZWEI_FAKTOR_EINGERICHTET';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'ZWEI_FAKTOR_DEAKTIVIERT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'ZWEI_FAKTOR_ZURUECKGESETZT';
