import { PrismaClient, DokumentStatus } from "@prisma/client";
import cron from "node-cron";

export class WiedervorlageWorker {
  private readonly prisma = new PrismaClient();

  async run(): Promise<void> {
    const bisEndeHeute = new Date();
    bisEndeHeute.setHours(23, 59, 59, 999);

    const docs = await this.prisma.dokument.findMany({
      where: {
        wiedervorlageAm: { lte: bisEndeHeute },
        status: { not: DokumentStatus.GELOESCHT },
      },
      select: { id: true, titel: true },
    });

    if (docs.length === 0) return;

    for (const doc of docs) {
      await this.prisma.dokument.update({
        where: { id: doc.id },
        data: {
          inboxGelesen:    false,
          inboxGelesenAm:  null,
          inboxQuelle:     "WIEDERVORLAGE",
          wiedervorlageAm: null,
        },
      });
      console.log(`[WiedervorlageWorker] Wiedervorgelegt: ${doc.titel}`);
    }

    await this.prisma.$disconnect();
    console.log(`[WiedervorlageWorker] ${docs.length} Dokument(e) wiedervorgelegt.`);
  }
}

export function startWiedervorlageWorker(): void {
  cron.schedule(
    "0 6 * * *",
    async () => {
      const w = new WiedervorlageWorker();
      await w.run().catch(err => console.error("[WiedervorlageWorker] Fehler:", err));
    },
    { timezone: "Europe/Berlin" }
  );
  console.log("[WiedervorlageWorker] Registriert: täglich 06:00 Uhr (Europe/Berlin)");
}
