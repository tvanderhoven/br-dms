-- Migration: Beschlussfähigkeit § 33 Abs. 2 BetrVG am Beschluss einfrieren
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "beschluesse" ADD COLUMN IF NOT EXISTS "soll_staerke" INTEGER;
ALTER TABLE "beschluesse" ADD COLUMN IF NOT EXISTS "beschlussfaehig" BOOLEAN;
