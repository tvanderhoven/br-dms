-- Migration: Token-Widerruf – Abmelden und Passwortwechsel machen ausgestellte Tokens ungültig
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "benutzer" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;
