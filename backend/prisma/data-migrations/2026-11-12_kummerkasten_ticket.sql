-- Kummerkasten-Rückkanal: Spalten und Unique-Index vorab anlegen.
--
-- Wird vom Entrypoint VOR "prisma db push" ausgeführt. Ohne das verweigert db push
-- den Unique-Index auf ticket_code_hash bei einer Kummerkasten-Tabelle mit Einträgen
-- ("There might be data loss" – Prisma kann nicht wissen, dass lauter NULL-Werte
-- keine Duplikate sind) und das Backend startet nicht. Der Entrypoint nutzt bewusst
-- kein --accept-data-loss.
--
-- Idempotent, und auf einer Neuinstallation (Tabelle fehlt noch) ohne Wirkung –
-- dann legt "prisma db push" alles selbst an. Namen und Typen entsprechen exakt
-- dem, was Prisma für schema.prisma erzeugt, damit db push danach nichts mehr ändert.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kummerkasten_eintraege'
  ) THEN
    ALTER TABLE "kummerkasten_eintraege" ADD COLUMN IF NOT EXISTS "ticket_code_hash" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "kummerkasten_eintraege_ticket_code_hash_key"
      ON "kummerkasten_eintraege"("ticket_code_hash");
  END IF;
END $$;
