-- Migration: Audit-Aktion für geänderte Systemeinstellungen (Inhaltszugriff des Admins)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "AuditAktion" ADD VALUE 'EINSTELLUNG_GEAENDERT';
