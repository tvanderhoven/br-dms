/**
 * Automatischer, monatlicher Abgleich der Gesetzestexte (gesetze-im-internet.de).
 * Hält die lokale Kopie aktuell, ohne dass jemand manuell auf "Aktualisieren"
 * klicken muss – und benachrichtigt VORSITZ/STELLVERTRETER per Nachricht, wenn
 * sich an einem bereits importierten Paragraphen wirklich etwas geändert hat
 * (der allererste Import eines Gesetzes zählt nicht als "Änderung").
 */

import { PrismaClient, Role, NachrichtTyp } from "@prisma/client";
import cron from "node-cron";
import { alleGesetzeAktualisieren, GesetzAktualisierenErgebnis } from "../services/gesetze.service.js";

export interface GesetzeWorkerErgebnis {
  ergebnisse: GesetzAktualisierenErgebnis[];
  relevanteAenderungen: { gesetz: string; paragraphen: string[] }[];
  benachrichtigt: string[];
}

export class GesetzeWorker {
  private readonly prisma = new PrismaClient();

  async run(): Promise<GesetzeWorkerErgebnis> {
    console.log(`[GesetzeWorker] Start: ${new Date().toISOString()}`);
    try {
      const ergebnisse = await alleGesetzeAktualisieren();

      // Erstimport zählt nicht als "Änderung" – sonst würde die erste
      // Einrichtung sofort eine "Gesetz geändert"-Nachricht auslösen.
      const relevanteAenderungen = ergebnisse
        .filter(e => !e.fehler)
        .map(e => ({
          gesetz: e.name,
          paragraphen: [...e.geaendert, ...(e.istErstimport ? [] : e.neu)],
        }))
        .filter(e => e.paragraphen.length > 0);

      let benachrichtigt: string[] = [];

      if (relevanteAenderungen.length > 0) {
        const empfaenger = await this.prisma.benutzer.findMany({
          where: { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } },
          select: { id: true, email: true },
        });

        const betreff = `Gesetzestext-Update: ${relevanteAenderungen.map(a => a.gesetz).join(", ")}`;
        const inhalt = [
          "Beim automatischen Abgleich mit gesetze-im-internet.de wurden Änderungen festgestellt:",
          "",
          ...relevanteAenderungen.map(a => `${a.gesetz}: ${a.paragraphen.join(", ")}`),
          "",
          "Zu finden über die Suche im BR-DMS.",
        ].join("\n");

        await this.prisma.$transaction(
          empfaenger.map(e =>
            this.prisma.nachricht.create({
              data: {
                betreff,
                inhalt,
                typ: NachrichtTyp.SYSTEM,
                absenderId: null, // Systemnachricht
                empfaengerId: e.id,
              },
            })
          )
        ).catch(err => console.error("[GesetzeWorker] Nachrichten-Versand fehlgeschlagen:", err));

        benachrichtigt = empfaenger.map(e => e.email);
      }

      console.log(`[GesetzeWorker] Fertig. ${relevanteAenderungen.length} Gesetz(e) mit Änderungen, ${benachrichtigt.length} Empfänger benachrichtigt.`);
      return { ergebnisse, relevanteAenderungen, benachrichtigt };
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

export function startGesetzeWorker(): void {
  // Monatlich am 1. um 03:00 Uhr – Gesetzestexte ändern sich selten, häufiger
  // muss nicht geprüft werden. Läuft nachts, damit die Suche währenddessen nicht stört.
  cron.schedule(
    "0 3 1 * *",
    async () => {
      const w = new GesetzeWorker();
      await w.run().catch(err => console.error("[GesetzeWorker] Unbehandelter Fehler:", err));
    },
    { timezone: "Europe/Berlin" }
  );
  console.log("[GesetzeWorker] Registriert: monatlich am 1. um 03:00 Uhr (Europe/Berlin)");
}
