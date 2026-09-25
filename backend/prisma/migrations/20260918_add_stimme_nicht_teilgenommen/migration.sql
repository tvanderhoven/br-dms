-- Migration: Stimme – neuer Wert für Personen, die anwesend, aber nicht stimmberechtigt sind
-- (z.B. JAV im Raum, aber nicht stimmberechtigt bei Betriebsratsbeschlüssen)
-- Hinweis: läuft über "prisma db push" beim Container-Start, diese Datei ist nur Dokumentation.

ALTER TYPE "Stimme" ADD VALUE 'NICHT_TEILGENOMMEN';
