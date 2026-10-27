-- Migration: Gäste je TOP (Roadmap Paket 5) und Sitzung per Video/Telefon (Roadmap Paket 6)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TYPE "SitzungForm" AS ENUM ('PRAESENZ', 'ZUSCHALTUNG', 'VIDEO');
CREATE TYPE "Teilnahmeart" AS ENUM ('VOR_ORT', 'VIDEO', 'TELEFON');
CREATE TYPE "GastFunktion" AS ENUM ('ARBEITGEBER', 'GEWERKSCHAFT', 'SACHVERSTAENDIGER', 'AUSKUNFTSPERSON', 'SONSTIGE');
ALTER TYPE "BenachrichtigungArt" ADD VALUE 'VIDEO_WIDERSPRUCH';
ALTER TYPE "BenachrichtigungArt" ADD VALUE 'TEILNAHME_BESTAETIGEN';

ALTER TABLE "sitzungen" ADD COLUMN "form" "SitzungForm" NOT NULL DEFAULT 'PRAESENZ';
ALTER TABLE "sitzungen" ADD COLUMN "einwahl_link" TEXT;
ALTER TABLE "sitzungen" ADD COLUMN "widerspruch_bis" TIMESTAMP(3);

ALTER TABLE "anwesenheiten" ADD COLUMN "teilnahmeart" "Teilnahmeart" NOT NULL DEFAULT 'VOR_ORT';
ALTER TABLE "anwesenheiten" ADD COLUMN "teilnahme_bestaetigt_am" TIMESTAMP(3);

ALTER TABLE "geschaeftsordnungen" ADD COLUMN "video_erlaubt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "geschaeftsordnungen" ADD COLUMN "video_nicht_vertraulich" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "geschaeftsordnungen" ADD COLUMN "video_bedingungen" TEXT;

CREATE TABLE "sitzung_widersprueche" (
  "id" TEXT PRIMARY KEY,
  "sitzung_id" TEXT NOT NULL REFERENCES "sitzungen"("id") ON DELETE CASCADE,
  "benutzer_id" TEXT NOT NULL REFERENCES "benutzer"("id") ON DELETE CASCADE,
  "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "sitzung_widersprueche_sitzung_id_benutzer_id_key" ON "sitzung_widersprueche"("sitzung_id", "benutzer_id");

CREATE TABLE "top_gaeste" (
  "id" TEXT PRIMARY KEY,
  "top_id" TEXT NOT NULL REFERENCES "tops"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "funktion" "GastFunktion" NOT NULL,
  "organisation" TEXT,
  "email" TEXT,
  "anwesend" BOOLEAN NOT NULL DEFAULT true,
  "eingeladen_am" TIMESTAMP(3),
  "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "top_gaeste_top_id_idx" ON "top_gaeste"("top_id");
