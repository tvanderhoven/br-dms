-- Migration: Protokollführung (Roadmap Paket 3)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TABLE "benutzer" ADD COLUMN "protokollfuehrung" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sitzungen" ADD COLUMN "protokollfuehrer_id" TEXT
  REFERENCES "benutzer"("id") ON DELETE SET NULL;
