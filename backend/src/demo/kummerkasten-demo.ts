/**
 * BR-DMS – Demodaten für den Kummerkasten-Rückkanal (Ticket-Codes mit Gesprächsverlauf)
 *
 * Wird von demo-daten.ts beim frischen Einspielen der Demo aufgerufen und lässt sich
 * auch einzeln gegen eine schon laufende Demo ausführen, ohne sie zurückzusetzen:
 *
 *   docker exec -u "$(id -u):$(id -g)" brdms_demo_backend node dist/demo/kummerkasten-demo.js
 *
 * Idempotent: Einträge, deren Ticket-Code es schon gibt, werden übersprungen.
 * Die festen Codes stehen im Handbuch-Screenshot-Werkzeug (tools/handbuch-screenshots).
 */

import { pathToFileURL } from "node:url";
import { KummerkastenAbsender, KummerkastenStatus, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { ticketHash } from "../lib/kummerkastenTicket.js";

/** Anliegen mit offener Rückfrage des Einreichers (der BR ist am Zug) */
export const DEMO_TICKET_MIT_RUECKFRAGE = "K7F3XH";
/** Anliegen, auf das der BR geantwortet hat */
export const DEMO_TICKET_BEANTWORTET = "M4P9RT";

const vor = (tage: number) => new Date(Date.now() - tage * 86_400_000);

/** Legt die Rückkanal-Beispiele an und liefert, wie viele neu entstanden sind. */
export async function kummerkastenRueckkanalDemo(): Promise<number> {
  const stv = await prisma.benutzer.findFirst({ where: { rolle: Role.STELLVERTRETER, aktiv: true }, select: { id: true } });
  const vorsitz = await prisma.benutzer.findFirst({ where: { rolle: Role.VORSITZ, aktiv: true }, select: { id: true } });

  const beispiele = [
    {
      code: DEMO_TICKET_MIT_RUECKFRAGE,
      nachricht: "Die Schichtpläne für Dezember hängen wieder nicht aus. Gibt es dazu eine Regel?",
      status: KummerkastenStatus.IN_BEARBEITUNG,
      erstellt: vor(6),
      bearbeiter: stv?.id ?? null,
      verlauf: [
        { absender: KummerkastenAbsender.BETRIEBSRAT, vonId: stv?.id ?? null, erstellt: vor(4),
          text: "Danke für den Hinweis! Schichtpläne sind mitbestimmungspflichtig (§ 87 Abs. 1 Nr. 2 BetrVG). Wir nehmen das Thema in die nächste Sitzung mit und sprechen es mit der Werksleitung an." },
        { absender: KummerkastenAbsender.EINREICHER, vonId: null, erstellt: vor(1),
          text: "Super, danke! Wisst ihr schon, wann das besprochen wird?" },
      ],
    },
    {
      code: DEMO_TICKET_BEANTWORTET,
      nachricht: "Im Pausenraum von Halle 2 gibt es nur eine Kaffeemaschine für über 60 Leute. Könnte da eine zweite hin?",
      status: KummerkastenStatus.IN_BEARBEITUNG,
      erstellt: vor(9),
      bearbeiter: vorsitz?.id ?? null,
      verlauf: [
        { absender: KummerkastenAbsender.BETRIEBSRAT, vonId: vorsitz?.id ?? null, erstellt: vor(7),
          text: "Gute Idee! Wir haben das an die Werksleitung weitergegeben und melden uns hier, sobald es eine Rückmeldung gibt." },
      ],
    },
  ];

  let neu = 0;
  for (const b of beispiele) {
    const hash = ticketHash(b.code);
    if (await prisma.kummerkastenEintrag.findUnique({ where: { ticketCodeHash: hash }, select: { id: true } })) continue;
    await prisma.kummerkastenEintrag.create({
      data: {
        nachricht: b.nachricht,
        status: b.status,
        ticketCodeHash: hash,
        bearbeitetVonId: b.bearbeiter,
        bearbeitetAm: b.verlauf.at(-1)?.erstellt ?? null,
        erstelltAm: b.erstellt,
        nachrichten: {
          create: b.verlauf.map(n => ({ absender: n.absender, text: n.text, bearbeitetVonId: n.vonId, erstelltAm: n.erstellt })),
        },
      },
    });
    neu++;
  }
  return neu;
}

// Direkter Aufruf (node dist/demo/kummerkasten-demo.js) – beim Import aus demo-daten.ts passiert nichts
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  kummerkastenRueckkanalDemo()
    .then(neu => console.log(`[Demo] Kummerkasten-Rückkanal: ${neu} neue Beispiele (Codes ${DEMO_TICKET_MIT_RUECKFRAGE} und ${DEMO_TICKET_BEANTWORTET})`))
    .catch(err => { console.error("[Demo] Fehler:", err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
