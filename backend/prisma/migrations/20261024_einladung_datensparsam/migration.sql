-- Migration: Einladungsmail datensparsam (Detailstufe, neutraler TOP-Titel, Abrufnachweis)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TYPE "EinladungDetail" AS ENUM ('VOLLSTAENDIG', 'NUR_TITEL', 'NUR_LINK');

ALTER TABLE "einladung_versand" ADD COLUMN "detail" "EinladungDetail" NOT NULL DEFAULT 'VOLLSTAENDIG';
ALTER TABLE "einladung_versand" ADD COLUMN "abgerufen_am" TIMESTAMP(3);

ALTER TABLE "tops" ADD COLUMN "einladung_titel" TEXT;
