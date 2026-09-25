import { PrismaClient, FristStatus, Role } from "@prisma/client";
import cron from "node-cron";
import { sendeFristenZusammenfassung } from "../lib/mailer.js";

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
      const jetzt = new Date();
      const in7Tagen = new Date(jetzt.getTime() + 7 * 86_400_000);

      const fristen = await this.prisma.frist.findMany({
        where: {
          status: FristStatus.OFFEN,
          faelligAm: { gte: jetzt, lte: in7Tagen },
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
        dokumentTitel: f.dokument.alias ?? f.dokument.titel,
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
  cron.schedule(
    "0 7 * * *",
    async () => {
      const w = new FristenWorker();
      await w.run().catch(err => console.error("[FristenWorker] Unbehandelter Fehler:", err));
    },
    { timezone: "Europe/Berlin" }
  );
  console.log("[FristenWorker] Registriert: täglich 07:00 Uhr (Europe/Berlin)");
}
