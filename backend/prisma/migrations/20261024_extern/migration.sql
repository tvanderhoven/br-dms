-- Migration: Rolle „Extern“ (externe Protokollführung, Roadmap Paket 4)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'EXTERN';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'EXTERN_ZUGRIFF';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'VERSCHWIEGENHEIT_HINTERLEGT';

ALTER TABLE "benutzer" ADD COLUMN "verschwiegenheit_bestaetigt_am" TIMESTAMP(3);
ALTER TABLE "benutzer" ADD COLUMN "verschwiegenheit_pfad" TEXT;
ALTER TABLE "benutzer" ADD COLUMN "verschwiegenheit_dateiname" TEXT;
ALTER TABLE "benutzer" ADD COLUMN "verschwiegenheit_mime_typ" TEXT;

ALTER TABLE "tops" ADD COLUMN "extern_ausgeschlossen" BOOLEAN NOT NULL DEFAULT false;
