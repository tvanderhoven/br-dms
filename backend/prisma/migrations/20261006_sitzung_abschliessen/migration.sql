-- Migration: Sitzungspaket + Sitzung abschließen (Paket 4, Stufe 5)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "SitzungStatus" ADD VALUE IF NOT EXISTS 'ABGESCHLOSSEN';

ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'SITZUNG_ABGESCHLOSSEN';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'SITZUNGSPAKET_HERUNTERGELADEN';
