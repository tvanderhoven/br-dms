import { PrismaClient, FristStatus, Role } from "@prisma/client";
import cron from "node-cron";
import { sendeFristenZusammenfassung } from "../lib/mailer.js";
import { fristTitel } from "../lib/fristen.js";
import { betriebsversammlungFristAbgleichen } from "../lib/betriebsversammlungFrist.js";
import prisma from "../lib/prisma.js";

/** Schalter in Einstellungen → System ("Jetzt testen" bleibt davon unberührt). */
async function erinnerungsmailAktiv(): Promise<boolean> {
  const einstellung = await prisma.systemEinstellung.findUnique({
    where: { schluessel: "fristen.erinnerungsmail_aktiv" },
  });
  return einstellung?.wert !== "false";
}

export interface FristenWorkerErgebnis {
  fristenAnzahl: number;
  empfaengerAnzahl: number;
  gesendetAn: string[];
  fehlgeschlagenAn: { email: string; fehler: string }[];
}

export class FristenWorker {
  private readonly prisma = new PrismaClient();

  async run(): Promise<FristenWorkerErgebnis> {
    console.log(`[FristenWorker] Start: ${new Date().toISOString()}`);
    try {
      await betriebsversammlungFristAbgleichen(this.prisma)
        .catch(err => console.error("[FristenWorker] Quartals-Frist § 43:", err));

      const jetzt = new Date();
      const in7Tagen = new Date(jetzt.getTime() + 7 * 86_400_000);

      const fristen = await this.prisma.frist.findMany({
        where: {
          status: FristStatus.OFFEN,
          faelligAm: { gte: jetzt, lte: in7Tagen },
          // Fristen gelöschter Dokumente nicht mehr melden; Fristen ohne Dokument schon
          OR: [{ dokumentId: null }, { dokument: { status: { not: "GELOESCHT" } } }],
        },
        include: {
          dokument: { select: { titel: true, alias: true } },
        },
        orderBy: { faelligAm: "asc" },
      });

      if (fristen.length === 0) {
        console.log("[FristenWorker] Keine ablaufenden Fristen.");
        return { fristenAnzahl: 0, empfaengerAnzahl: 0, gesendetAn: [], fehlgeschlagenAn: [] };
      }

      const empfaenger = await this.prisma.benutzer.findMany({
        where: { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } },
        select: { email: true, name: true },
      });

      if (empfaenger.length === 0) {
        console.log("[FristenWorker] Keine VORSITZ/STELLVERTRETER gefunden.");
        return { fristenAnzahl: fristen.length, empfaengerAnzahl: 0, gesendetAn: [], fehlgeschlagenAn: [] };
      }

      const payload = fristen.map(f => ({
        titel: fristTitel(f),
        typ: f.typ,
        faelligAm: f.faelligAm,
        tageVerbleibend: Math.max(0, Math.ceil((f.faelligAm.getTime() - jetzt.getTime()) / 86_400_000)),
      }));

      const gesendetAn: string[] = [];
      const fehlgeschlagenAn: { email: string; fehler: string }[] = [];

      for (const e of empfaenger) {
        try {
          await sendeFristenZusammenfassung(e.email, e.name, payload);
          gesendetAn.push(e.email);
        } catch (err) {
          console.error(`[FristenWorker] E-Mail an ${e.email} fehlgeschlagen:`, err);
          fehlgeschlagenAn.push({ email: e.email, fehler: err instanceof Error ? err.message : "Unbekannter Fehler" });
        }
      }

      console.log(`[FristenWorker] ${fristen.length} Frist(en) an ${gesendetAn.length}/${empfaenger.length} Empfänger gesendet.`);
      return { fristenAnzahl: fristen.length, empfaengerAnzahl: empfaenger.length, gesendetAn, fehlgeschlagenAn };
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

export function startFristenWorker(): void {
  // Beim Start einmal abgleichen, damit die Quartals-Frist nicht erst am nächsten Morgen erscheint
  betriebsversammlungFristAbgleichen()
    .catch(err => console.error("[FristenWorker] Quartals-Frist § 43:", err));
  cron.schedule(
    "0 7 * * *",
    async () => {
      if (!(await erinnerungsmailAktiv())) {
        console.log("[FristenWorker] Erinnerungsmail deaktiviert (Einstellungen → System) – überspringe.");
        return;
      }
      const w = new FristenWorker();
      await w.run().catch(err => console.error("[FristenWorker] Unbehandelter Fehler:", err));
    },
    { timezone: "Europe/Berlin" }
  );
  console.log("[FristenWorker] Registriert: täglich 07:00 Uhr (Europe/Berlin)");
}
