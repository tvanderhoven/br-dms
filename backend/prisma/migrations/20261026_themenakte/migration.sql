-- Migration: Themenakte mit Verlauf (Roadmap, lib/themenakte.ts)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.
-- Die Karten des alten Themen-Backlogs (aufgaben.kanban_status) übernimmt backlogUebernehmen() beim Start.

CREATE TYPE "ThemaStatus" AS ENUM ('OFFEN', 'IN_VERHANDLUNG', 'RUHT', 'ABGESCHLOSSEN');
CREATE TYPE "ThemaVertraulichkeit" AS ENUM ('ALLE', 'BETRIEBSRAT', 'VORSITZ');
CREATE TYPE "ThemaEintragArt" AS ENUM ('NOTIZ', 'GESPRAECHSVERMERK', 'IDEE_FRAGE', 'RECHERCHE');
ALTER TYPE "BenachrichtigungArt" ADD VALUE 'THEMA_BEITRAG';
ALTER TYPE "AuditAktion" ADD VALUE 'THEMA_ERSTELLT';
ALTER TYPE "AuditAktion" ADD VALUE 'THEMA_GEAENDERT';
ALTER TYPE "AuditAktion" ADD VALUE 'THEMA_GELOESCHT';

CREATE TABLE "themen" (
  "id" TEXT PRIMARY KEY, "titel" TEXT NOT NULL, "beschreibung" TEXT,
  "status" "ThemaStatus" NOT NULL DEFAULT 'OFFEN', "vertraulichkeit" "ThemaVertraulichkeit" NOT NULL DEFAULT 'ALLE',
  "nur_team" BOOLEAN NOT NULL DEFAULT false, "naechster_schritt" TEXT, "naechster_termin" TIMESTAMP(3),
  "abgeschlossen_am" TIMESTAMP(3), "erstellt_von_id" TEXT NOT NULL REFERENCES "benutzer"("id"),
  "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "aktualisiert_am" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "thema_beteiligte" (
  "thema_id" TEXT NOT NULL REFERENCES "themen"("id") ON DELETE CASCADE,
  "benutzer_id" TEXT NOT NULL REFERENCES "benutzer"("id") ON DELETE CASCADE,
  "zustaendig" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("thema_id", "benutzer_id")
);
CREATE TABLE "thema_eintraege" (
  "id" TEXT PRIMARY KEY, "thema_id" TEXT NOT NULL REFERENCES "themen"("id") ON DELETE CASCADE,
  "art" "ThemaEintragArt" NOT NULL DEFAULT 'NOTIZ', "inhalt" TEXT NOT NULL, "inhalt_json" JSONB,
  "angeheftet" BOOLEAN NOT NULL DEFAULT false, "bezug_id" TEXT REFERENCES "thema_eintraege"("id") ON DELETE SET NULL,
  "autor_id" TEXT NOT NULL REFERENCES "benutzer"("id"), "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "tops"                   ADD COLUMN "thema_id" TEXT REFERENCES "themen"("id") ON DELETE SET NULL;
ALTER TABLE "aufgaben"               ADD COLUMN "thema_id" TEXT REFERENCES "themen"("id") ON DELETE SET NULL;
ALTER TABLE "dokumente"              ADD COLUMN "thema_id" TEXT REFERENCES "themen"("id") ON DELETE SET NULL;
ALTER TABLE "betriebsvereinbarungen" ADD COLUMN "thema_id" TEXT REFERENCES "themen"("id") ON DELETE SET NULL;
ALTER TABLE "kommentare"             ADD COLUMN "thema_eintrag_id" TEXT REFERENCES "thema_eintraege"("id") ON DELETE CASCADE;
