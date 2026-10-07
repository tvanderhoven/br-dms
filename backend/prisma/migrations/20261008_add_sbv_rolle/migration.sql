-- Migration: Rolle SBV (Schwerbehindertenvertretung, § 178 SGB IX)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SBV';
