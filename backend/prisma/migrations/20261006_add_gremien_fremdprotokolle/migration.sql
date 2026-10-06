-- Migration: Gremien und Fremdprotokolle (Paket 5)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TABLE "gremien" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rechtsgrundlage" TEXT,
    "bemerkung" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiert_am" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gremien_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gremien_name_key" ON "gremien"("name");

CREATE TABLE "fremdprotokolle" (
    "id" TEXT NOT NULL,
    "gremium_id" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "titel" TEXT NOT NULL,
    "bemerkung" TEXT,
    "vertraulich" BOOLEAN NOT NULL DEFAULT false,
    "dateiname" TEXT NOT NULL,
    "speicher_pfad" TEXT NOT NULL,
    "verschl_pfad" TEXT NOT NULL,
    "datei_groesse" INTEGER NOT NULL,
    "mime_typ" TEXT NOT NULL,
    "pruefsumme" TEXT NOT NULL,
    "hochgeladen_von_id" TEXT NOT NULL,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiert_am" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fremdprotokolle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fremdprotokolle_gremium_id_datum_idx" ON "fremdprotokolle"("gremium_id", "datum");

ALTER TABLE "fremdprotokolle" ADD CONSTRAINT "fremdprotokolle_gremium_id_fkey"
    FOREIGN KEY ("gremium_id") REFERENCES "gremien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fremdprotokolle" ADD CONSTRAINT "fremdprotokolle_hochgeladen_von_id_fkey"
    FOREIGN KEY ("hochgeladen_von_id") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sitzung bekommt eine optionale Gremium-Zuordnung (NULL = Betriebsrat, Standardfall)
ALTER TABLE "sitzungen" ADD COLUMN "gremium_id" TEXT;

ALTER TABLE "sitzungen" ADD CONSTRAINT "sitzungen_gremium_id_fkey"
    FOREIGN KEY ("gremium_id") REFERENCES "gremien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'GREMIUM_ERSTELLT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'GREMIUM_AKTUALISIERT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'GREMIUM_GELOESCHT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'FREMDPROTOKOLL_ERSTELLT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'FREMDPROTOKOLL_AKTUALISIERT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'FREMDPROTOKOLL_GELOESCHT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'FREMDPROTOKOLL_HERUNTERGELADEN';
