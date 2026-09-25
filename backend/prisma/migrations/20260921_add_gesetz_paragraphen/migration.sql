-- Migration: Gesetzestexte (statischer Import von gesetze-im-internet.de)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TABLE "gesetz_paragraphen" (
    "id"              TEXT NOT NULL,
    "gesetz_slug"     TEXT NOT NULL,
    "gesetz"          TEXT NOT NULL,
    "paragraph"       TEXT NOT NULL,
    "titel"           TEXT,
    "text"            TEXT NOT NULL,
    "quelle_url"      TEXT NOT NULL,
    "aktualisiert_am" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gesetz_paragraphen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gesetz_paragraphen_gesetz_slug_paragraph_key" ON "gesetz_paragraphen"("gesetz_slug", "paragraph");
CREATE INDEX "gesetz_paragraphen_gesetz_slug_idx" ON "gesetz_paragraphen"("gesetz_slug");
