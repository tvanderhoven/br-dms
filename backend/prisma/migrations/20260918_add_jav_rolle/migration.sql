-- Migration: JAV-Rolle (stark eingeschränkter Lesezugriff auf Sitzungen/Protokolle)
-- + TOP.vertraulich (blendet einzelne TOPs für diese Rolle aus)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "Role" ADD VALUE 'JAV';

ALTER TABLE "tops"
  ADD COLUMN "vertraulich" BOOLEAN NOT NULL DEFAULT false;
