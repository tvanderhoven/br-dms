-- Migration: Betriebsvereinbarungs-Register + Schulungsverwaltung/Qualifikationsmatrix
-- Hinweis: Der Backend-Container synct das Schema beim Start über "prisma db push"
-- (siehe backend/docker-entrypoint.sh), diese Datei dient nur der Dokumentation.

-- AuditAktion: neue Werte für BV-Register
ALTER TYPE "AuditAktion" ADD VALUE 'BV_ERSTELLT';
ALTER TYPE "AuditAktion" ADD VALUE 'BV_AKTUALISIERT';
ALTER TYPE "AuditAktion" ADD VALUE 'BV_GELOESCHT';

-- ── Betriebsvereinbarungen ─────────────────────────────────────────
CREATE TYPE "BVStatus" AS ENUM ('AKTIV', 'GEKUENDIGT', 'ABGELOEST', 'BEFRISTET_AUSGELAUFEN');

CREATE TABLE "betriebsvereinbarungen" (
  "id"              TEXT NOT NULL,
  "titel"           TEXT NOT NULL,
  "abschlussdatum"  TIMESTAMP(3) NOT NULL,
  "geltungsbereich" TEXT,
  "status"          "BVStatus" NOT NULL DEFAULT 'AKTIV',
  "laufzeit_ende"   TIMESTAMP(3),
  "bemerkung"       TEXT,
  "dokument_id"     TEXT,
  "erstellt_von_id" TEXT NOT NULL,
  "erstellt_am"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "betriebsvereinbarungen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "betriebsvereinbarungen_status_idx"       ON "betriebsvereinbarungen"("status");
CREATE INDEX "betriebsvereinbarungen_laufzeit_ende_idx" ON "betriebsvereinbarungen"("laufzeit_ende");

ALTER TABLE "betriebsvereinbarungen" ADD CONSTRAINT "betriebsvereinbarungen_dokument_id_fkey"
  FOREIGN KEY ("dokument_id") REFERENCES "dokumente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "betriebsvereinbarungen" ADD CONSTRAINT "betriebsvereinbarungen_erstellt_von_id_fkey"
  FOREIGN KEY ("erstellt_von_id") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Schulungsverwaltung / Qualifikationsmatrix ──────────────────────
CREATE TYPE "SchulungsStatus" AS ENUM ('GEPLANT', 'ABSOLVIERT', 'ABGESAGT');

CREATE TABLE "qualifikationen" (
  "id"                       TEXT NOT NULL,
  "name"                     TEXT NOT NULL,
  "beschreibung"             TEXT,
  "gueltigkeitsdauer_monate" INTEGER,
  "erstellt_am"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "qualifikationen_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "qualifikationen_name_key" ON "qualifikationen"("name");

CREATE TABLE "schulungstermine" (
  "id"               TEXT NOT NULL,
  "qualifikation_id" TEXT NOT NULL,
  "titel"            TEXT,
  "datum"            TIMESTAMP(3) NOT NULL,
  "ort"              TEXT,
  "anbieter"         TEXT,
  "kosten"           DOUBLE PRECISION,
  "status"           "SchulungsStatus" NOT NULL DEFAULT 'GEPLANT',
  "bemerkung"        TEXT,
  "erstellt_von_id"  TEXT NOT NULL,
  "erstellt_am"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "schulungstermine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "schulungstermine_datum_idx"           ON "schulungstermine"("datum");
CREATE INDEX "schulungstermine_qualifikation_id_idx" ON "schulungstermine"("qualifikation_id");

ALTER TABLE "schulungstermine" ADD CONSTRAINT "schulungstermine_qualifikation_id_fkey"
  FOREIGN KEY ("qualifikation_id") REFERENCES "qualifikationen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schulungstermine" ADD CONSTRAINT "schulungstermine_erstellt_von_id_fkey"
  FOREIGN KEY ("erstellt_von_id") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "schulungs_teilnahmen" (
  "id"                  TEXT NOT NULL,
  "schulungstermin_id"  TEXT NOT NULL,
  "mitarbeiter_id"      TEXT NOT NULL,
  "teilgenommen"        BOOLEAN NOT NULL DEFAULT true,
  "erstellt_am"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schulungs_teilnahmen_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "schulungs_teilnahmen_schulungstermin_id_mitarbeiter_id_key"
  ON "schulungs_teilnahmen"("schulungstermin_id", "mitarbeiter_id");

ALTER TABLE "schulungs_teilnahmen" ADD CONSTRAINT "schulungs_teilnahmen_schulungstermin_id_fkey"
  FOREIGN KEY ("schulungstermin_id") REFERENCES "schulungstermine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schulungs_teilnahmen" ADD CONSTRAINT "schulungs_teilnahmen_mitarbeiter_id_fkey"
  FOREIGN KEY ("mitarbeiter_id") REFERENCES "mitarbeiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
