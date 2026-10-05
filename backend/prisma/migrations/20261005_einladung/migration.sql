-- Migration: Zweitadresse für Einladungen (Paket 4, Stufe 2)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "benutzer" ADD COLUMN "einladung_email" TEXT;
