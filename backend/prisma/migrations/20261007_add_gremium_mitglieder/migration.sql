-- Migration: Gremien-Mitglieder (Paket 5, Nachschärfung)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TABLE "gremium_mitglieder" (
    "id" TEXT NOT NULL,
    "gremium_id" TEXT NOT NULL,
    "benutzer_id" TEXT NOT NULL,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gremium_mitglieder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gremium_mitglieder_gremium_id_benutzer_id_key" ON "gremium_mitglieder"("gremium_id", "benutzer_id");

ALTER TABLE "gremium_mitglieder" ADD CONSTRAINT "gremium_mitglieder_gremium_id_fkey"
    FOREIGN KEY ("gremium_id") REFERENCES "gremien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gremium_mitglieder" ADD CONSTRAINT "gremium_mitglieder_benutzer_id_fkey"
    FOREIGN KEY ("benutzer_id") REFERENCES "benutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'GREMIUM_MITGLIED_HINZUGEFUEGT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'GREMIUM_MITGLIED_ENTFERNT';
