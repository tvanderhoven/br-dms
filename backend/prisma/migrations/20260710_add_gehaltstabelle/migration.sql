-- Migration: Gehaltstabelle-Modul
-- Fügt Abteilungen, Mitarbeiter und eine Gehaltsstufen-Historie hinzu

-- Abteilungen
CREATE TABLE "abteilungen" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "erstellt_am"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "abteilungen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "abteilungen_name_key" ON "abteilungen"("name");

-- Mitarbeiter
CREATE TABLE "mitarbeiter" (
  "id"              TEXT NOT NULL,
  "vorname"         TEXT NOT NULL,
  "nachname"        TEXT NOT NULL,
  "abteilung_id"    TEXT,
  "erstellt_am"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "mitarbeiter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mitarbeiter_nachname_vorname_idx" ON "mitarbeiter"("nachname", "vorname");

ALTER TABLE "mitarbeiter"
  ADD CONSTRAINT "mitarbeiter_abteilung_id_fkey"
  FOREIGN KEY ("abteilung_id") REFERENCES "abteilungen"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Gehaltsstufen-Historie
CREATE TABLE "gehaltsstufen_eintraege" (
  "id"              TEXT NOT NULL,
  "mitarbeiter_id"  TEXT NOT NULL,
  "stufe"           TEXT NOT NULL,
  "gueltig_ab"      TIMESTAMP(3) NOT NULL,
  "bemerkung"       TEXT,
  "sitzung_id"      TEXT,
  "erstellt_am"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aktualisiert_am" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "gehaltsstufen_eintraege_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gehaltsstufen_eintraege_mitarbeiter_id_gueltig_ab_idx"
  ON "gehaltsstufen_eintraege"("mitarbeiter_id", "gueltig_ab");

ALTER TABLE "gehaltsstufen_eintraege"
  ADD CONSTRAINT "gehaltsstufen_eintraege_mitarbeiter_id_fkey"
  FOREIGN KEY ("mitarbeiter_id") REFERENCES "mitarbeiter"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gehaltsstufen_eintraege"
  ADD CONSTRAINT "gehaltsstufen_eintraege_sitzung_id_fkey"
  FOREIGN KEY ("sitzung_id") REFERENCES "sitzungen"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
