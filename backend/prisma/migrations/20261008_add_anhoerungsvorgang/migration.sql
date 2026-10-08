-- Migration: Anhörung als Vorgang (§ 99 / § 102 BetrVG)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TYPE "AnhoerungStatus" AS ENUM ('EINGEGANGEN', 'BERATEN', 'BESCHLOSSEN', 'BEANTWORTET');
CREATE TYPE "AnhoerungArt" AS ENUM ('ZUSTIMMUNG', 'ZUSTIMMUNGSVERWEIGERUNG', 'WIDERSPRUCH');

CREATE TABLE "anhoerungsvorgaenge" (
    "id" TEXT NOT NULL,
    "dokument_id" TEXT NOT NULL,
    "kuendigungs_art" TEXT,
    "status" "AnhoerungStatus" NOT NULL DEFAULT 'EINGEGANGEN',
    "beschluss_id" TEXT,
    "stellungnahme_art" "AnhoerungArt",
    "stellungnahme_gruende" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "stellungnahme_text" TEXT,
    "versendet_am" TIMESTAMP(3),
    "versendet_von_id" TEXT,
    "versand_dokument_id" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiert_am" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anhoerungsvorgaenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "anhoerungsvorgaenge_dokument_id_key" ON "anhoerungsvorgaenge"("dokument_id");
CREATE UNIQUE INDEX "anhoerungsvorgaenge_beschluss_id_key" ON "anhoerungsvorgaenge"("beschluss_id");

ALTER TABLE "anhoerungsvorgaenge" ADD CONSTRAINT "anhoerungsvorgaenge_dokument_id_fkey"
    FOREIGN KEY ("dokument_id") REFERENCES "dokumente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "anhoerungsvorgaenge" ADD CONSTRAINT "anhoerungsvorgaenge_beschluss_id_fkey"
    FOREIGN KEY ("beschluss_id") REFERENCES "beschluesse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "anhoerungsvorgaenge" ADD CONSTRAINT "anhoerungsvorgaenge_versendet_von_id_fkey"
    FOREIGN KEY ("versendet_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'ANHOERUNG_STATUS_GEAENDERT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'ANHOERUNG_STELLUNGNAHME_GESPEICHERT';
ALTER TYPE "AuditAktion" ADD VALUE IF NOT EXISTS 'ANHOERUNG_VERSENDET';
