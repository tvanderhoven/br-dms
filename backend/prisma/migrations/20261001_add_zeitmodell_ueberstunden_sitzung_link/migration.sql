ALTER TABLE "zeitmodell_eintraege"   ADD COLUMN "sitzung_id" TEXT;
ALTER TABLE "ueberstunden_eintraege" ADD COLUMN "sitzung_id" TEXT;

ALTER TABLE "zeitmodell_eintraege"
  ADD CONSTRAINT "zeitmodell_eintraege_sitzung_id_fkey"
  FOREIGN KEY ("sitzung_id") REFERENCES "sitzungen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ueberstunden_eintraege"
  ADD CONSTRAINT "ueberstunden_eintraege_sitzung_id_fkey"
  FOREIGN KEY ("sitzung_id") REFERENCES "sitzungen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
