import { PrismaClient, Kategorie, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@br-dms.lokal";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

async function main() {
  // ── Aufbewahrungsregeln ────────────────────────────────────────
  const regeln = [
    { kategorie: Kategorie.ANHOERUNG_99,         tage: 1825, rechtsgrundlage: "§ 99 BetrVG",      beschreibung: "Einstellung, Versetzung, Umgruppierung" },
    { kategorie: Kategorie.ANHOERUNG_102,        tage: 1825, rechtsgrundlage: "§ 102 BetrVG",     beschreibung: "Kündigung" },
    { kategorie: Kategorie.BEWERBUNG_ALTERNATIV, tage: 180,  rechtsgrundlage: "Art. 17 DSGVO",    beschreibung: "Alternative Bewerbungen" },
    { kategorie: Kategorie.PROTOKOLL,            tage: 1460, rechtsgrundlage: "§ 34 BetrVG",      beschreibung: "Sitzungsprotokolle" },
    { kategorie: Kategorie.BETRIEBSVEREINBARUNG, tage: 3650, rechtsgrundlage: "§ 77 BetrVG",      beschreibung: "Betriebsvereinbarungen" },
    { kategorie: Kategorie.SONSTIGES,            tage: 1825, rechtsgrundlage: "Interne Richtlinie", beschreibung: "Sonstige Dokumente" },
  ];

  for (const r of regeln) {
    await prisma.aufbewahrungsregel.upsert({ where: { kategorie: r.kategorie }, update: r, create: r });
  }
  console.log(`✓ ${regeln.length} Aufbewahrungsregeln`);

  // ── Admin ──────────────────────────────────────────────────────
  await prisma.benutzer.upsert({
    where:  { email: ADMIN_EMAIL },
    update: {},
    create: {
      email:        ADMIN_EMAIL,
      name:         "Administrator",
      passwortHash: hashPassword(ADMIN_PASSWORD),
      rolle:        Role.ADMIN,
      aktiv:        true,
    },
  });
  console.log(`✓ Admin: ${ADMIN_EMAIL}`);
  if (ADMIN_PASSWORD === "ChangeMe123!") {
    console.log("⚠️  Standard-Passwort aktiv – sofort in den Einstellungen ändern!");
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
