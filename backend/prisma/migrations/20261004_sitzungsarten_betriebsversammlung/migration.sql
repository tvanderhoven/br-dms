-- Migration: Sitzungsarten (konstituierend, Betriebsversammlung) und Quartals-Frist § 43
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "FristTyp" ADD VALUE IF NOT EXISTS 'BETRIEBSVERSAMMLUNG_43';

ALTER TABLE "sitzungen" ADD COLUMN "teilnehmerzahl" INTEGER;
