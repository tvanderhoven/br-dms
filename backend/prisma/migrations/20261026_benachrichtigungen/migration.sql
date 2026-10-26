-- Migration: Benachrichtigungen im System, E-Mail als Rückfall (Roadmap Paket 2)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

CREATE TYPE "BenachrichtigungArt" AS ENUM (
  'AUFGABE_ZUGEWIESEN', 'AUFGABE_FAELLIG', 'ERSATZ_GELADEN', 'PROTOKOLL_UNTERSCHRIFT',
  'PROTOKOLLFUEHRUNG', 'ERWAEHNUNG', 'KOMMENTAR_ANTWORT', 'KUMMERKASTEN'
);

ALTER TABLE "benutzer" ADD COLUMN "zuletzt_aktiv" TIMESTAMP(3);
ALTER TABLE "benutzer" ADD COLUMN "benachrichtigungen" JSONB;

ALTER TABLE "nachrichten" ADD COLUMN "art" "BenachrichtigungArt";
ALTER TABLE "nachrichten" ADD COLUMN "link" TEXT;
ALTER TABLE "nachrichten" ADD COLUMN "mail_faellig_ab" TIMESTAMP(3);
ALTER TABLE "nachrichten" ADD COLUMN "mail_gesendet_am" TIMESTAMP(3);
CREATE INDEX "nachrichten_mail_faellig_ab_idx" ON "nachrichten"("mail_faellig_ab");
