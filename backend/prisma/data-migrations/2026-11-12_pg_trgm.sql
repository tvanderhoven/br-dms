-- pg_trgm für die Trigram-Indizes der globalen Suche (schema.prisma, model Dokument).
-- Muss vor "prisma db push" laufen, sonst schlägt das Anlegen der GIN-Indizes fehl.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
