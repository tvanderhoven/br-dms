/**
 * Monatliche Erinnerung: Zeitmodell- und Überstunden-Zeiträume, die im
 * laufenden Kalendermonat auslaufen (1. bis letzter Tag – auch bereits
 * verstrichene Tage zu Monatsbeginn zählen mit, sonst würde ein Zeitraum,
 * der z.B. am 5. auslief, bei der Prüfung am 15. nie gemeldet), damit sie
 * rechtzeitig verlängert oder neu verhandelt werden können. Läuft am 15.
 * jeden Monats.
 */

import { PrismaClient, Role } from "@prisma/client";
import cron from "node-cron";
import { sendeAblaufZusammenfassung, AblaufEintrag } from "../lib/mailer.js";

export interface AblaufWorkerErgebnis {
  eintraegeAnzahl:  number;
  empfaengerAnzahl: number;
  gesendetAn:       string[];
  fehlgeschlagenAn: { email: string; fehler: string }[];
}

const MITARBEITER_INCLUDE = {
  mitarbeiter: { include: { abteilung: { select: { name: true } } } },
};

export class AblaufWorker {
  private readonly prisma = new PrismaClient();

  async run(): Promise<AblaufWorkerErgebnis> {
    console.log(`[AblaufWorker] Start: ${new Date().toISOString()}`);
    try {
      const jetzt = new Date();
      // Gesamter laufender Monat (1. bis letzter Tag), nicht "ab heute" – der
      // Job läuft nur einmal am 15., ein "gte: jetzt" würde alles verpassen,
      // das schon zwischen dem 1. und 14. ausgelaufen ist.
      const monatsanfang = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1, 0, 0, 0, 0);
      const monatsende   = new Date(jetzt.getFullYear(), jetzt.getMonth() + 1, 0, 23, 59, 59, 999);

      const [zeitmodelle, ueberstunden] = await Promise.all([
        this.prisma.zeitmodellEintrag.findMany({
          where:   { gueltigBis: { gte: monatsanfang, lte: monatsende } },
          include: MITARBEITER_INCLUDE,
          orderBy: { gueltigBis: "asc" },
        }),
        this.prisma.ueberstundenEintrag.findMany({
          where:   { gueltigBis: { gte: monatsanfang, lte: monatsende } },
          include: MITARBEITER_INCLUDE,
          orderBy: { gueltigBis: "asc" },
        }),
      ]);

      const eintraege: AblaufEintrag[] = [
        ...zeitmodelle.map(z => ({
          typ:             "ZEITMODELL" as const,
          mitarbeiterName: `${z.mitarbeiter.nachname}, ${z.mitarbeiter.vorname}`,
          abteilung:       z.mitarbeiter.abteilung?.name ?? null,
          detail:          `Zeitmodell ${z.zeitmodell}`,
          gueltigBis:      z.gueltigBis!,
        })),
        ...ueberstunden.map(u => ({
          typ:             "UEBERSTUNDEN" as const,
          mitarbeiterName: `${u.mitarbeiter.nachname}, ${u.mitarbeiter.vorname}`,
          abteilung:       u.mitarbeiter.abteilung?.name ?? null,
          detail:          u.regelung || "Überstunden (ohne Regelungstext)",
          gueltigBis:      u.gueltigBis!,
        })),
      ].sort((a, b) => a.gueltigBis.getTime() - b.gueltigBis.getTime());

      if (eintraege.length === 0) {
        console.log("[AblaufWorker] Keine in diesem Monat auslaufenden Zeiträume.");
        return { eintraegeAnzahl: 0, empfaengerAnzahl: 0, gesendetAn: [], fehlgeschlagenAn: [] };
      }

      const empfaenger = await this.prisma.benutzer.findMany({
        where:  { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } },
        select: { email: true, name: true },
      });

      if (empfaenger.length === 0) {
        console.log("[AblaufWorker] Keine VORSITZ/STELLVERTRETER gefunden.");
        return { eintraegeAnzahl: eintraege.length, empfaengerAnzahl: 0, gesendetAn: [], fehlgeschlagenAn: [] };
      }

      const gesendetAn: string[] = [];
      const fehlgeschlagenAn: { email: string; fehler: string }[] = [];

      for (const e of empfaenger) {
        try {
          await sendeAblaufZusammenfassung(e.email, e.name, eintraege);
          gesendetAn.push(e.email);
        } catch (err) {
          console.error(`[AblaufWorker] E-Mail an ${e.email} fehlgeschlagen:`, err);
          fehlgeschlagenAn.push({ email: e.email, fehler: err instanceof Error ? err.message : "Unbekannter Fehler" });
        }
      }

      console.log(`[AblaufWorker] ${eintraege.length} Eintrag/Einträge an ${gesendetAn.length}/${empfaenger.length} Empfänger gesendet.`);
      return { eintraegeAnzahl: eintraege.length, empfaengerAnzahl: empfaenger.length, gesendetAn, fehlgeschlagenAn };
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

export function startAblaufWorker(): void {
  // Am 15. jeden Monats um 07:00 Uhr – lässt nach Versand noch genug Zeit bis
  // zum Monatsende, um eine auslaufende Regelung zu verlängern oder neu zu verhandeln.
  cron.schedule(
    "0 7 15 * *",
    async () => {
      const w = new AblaufWorker();
      await w.run().catch(err => console.error("[AblaufWorker] Unbehandelter Fehler:", err));
    },
    { timezone: "Europe/Berlin" }
  );
  console.log("[AblaufWorker] Registriert: monatlich am 15. um 07:00 Uhr (Europe/Berlin)");
}
