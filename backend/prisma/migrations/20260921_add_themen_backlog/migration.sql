-- Migration: Themen-Backlog (Kanban-Board) auf Basis der bestehenden Aufgaben
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TYPE "KanbanStatus" AS ENUM ('BACKLOG', 'IN_BEARBEITUNG', 'ERLEDIGT');

ALTER TABLE "aufgaben"
  ADD COLUMN "kanban_status" "KanbanStatus",
  ADD COLUMN "top_id" TEXT;

ALTER TABLE "aufgaben" ADD CONSTRAINT "aufgaben_top_id_fkey"
  FOREIGN KEY ("top_id") REFERENCES "tops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
