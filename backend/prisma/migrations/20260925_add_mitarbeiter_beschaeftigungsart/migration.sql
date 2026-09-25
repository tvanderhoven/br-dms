-- Migration: Mitarbeiter – Beschäftigungsart (Mitarbeiter/Azubi/Student/Zeitarbeiter)
-- Ersetzt das noch nicht ausgelieferte "ist_zeitarbeiter"-Flag durch ein Enum,
-- da mehrere sich gegenseitig ausschließende Kategorien gebraucht werden.

CREATE TYPE "Beschaeftigungsart" AS ENUM ('MITARBEITER', 'AZUBI', 'STUDENT', 'ZEITARBEITER');

ALTER TABLE "mitarbeiter"
  ADD COLUMN "beschaeftigungsart" "Beschaeftigungsart" NOT NULL DEFAULT 'MITARBEITER';
