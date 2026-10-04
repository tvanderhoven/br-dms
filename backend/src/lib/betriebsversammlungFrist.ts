/**
 * § 43 Abs. 1 BetrVG: Der Betriebsrat hat einmal in jedem Kalendervierteljahr
 * eine Betriebsversammlung einzuberufen.
 *
 * Hält dafür eine Frist ohne Dokument aktuell: Ist im laufenden Quartal noch
 * keine Betriebsversammlung angelegt, gibt es eine offene Frist zum
 * Quartalsende. Sobald eine angelegt ist, wird sie automatisch erledigt (und
 * wieder geöffnet, falls die Versammlung gelöscht oder abgesagt wird). Hat
 * jemand die Frist von Hand erledigt (bewusst keine Versammlung in diesem
 * Quartal), bleibt sie erledigt.
 *
 * Aufgerufen beim Start, täglich durch den Fristen-Worker und nach jeder
 * Änderung an einer Betriebsversammlung.
 */

import { FristStatus, FristTyp, PrismaClient, SitzungStatus } from "@prisma/client";
import defaultPrisma from "./prisma.js";

function quartal(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return {
    nummer: q + 1,
    beginn: new Date(d.getFullYear(), q * 3, 1, 0, 0, 0, 0),
    ende:   new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999),
  };
}

export async function betriebsversammlungFristAbgleichen(
  prisma: PrismaClient = defaultPrisma,
  stichtag: Date = new Date(),
): Promise<void> {
  const q = quartal(stichtag);

  const [versammlungen, frist] = await Promise.all([
    prisma.sitzung.count({
      where: {
        sitzungstyp:   "BETRIEBSVERSAMMLUNG",
        status:        { not: SitzungStatus.ABGESAGT },
        sitzungsdatum: { gte: q.beginn, lte: q.ende },
      },
    }),
    prisma.frist.findFirst({
      where: { typ: FristTyp.BETRIEBSVERSAMMLUNG_43, faelligAm: { gte: q.beginn, lte: q.ende } },
    }),
  ]);

  if (versammlungen > 0) {
    if (frist && frist.status !== FristStatus.ERLEDIGT) {
      await prisma.frist.update({
        where: { id: frist.id },
        data:  { status: FristStatus.ERLEDIGT, erledigtAm: new Date(), erledigtVonId: null },
      });
    }
    return;
  }

  if (!frist) {
    await prisma.frist.create({
      data: {
        typ:         FristTyp.BETRIEBSVERSAMMLUNG_43,
        faelligAm:   q.ende,
        bezeichnung: `Betriebsversammlung Q${q.nummer}/${q.beginn.getFullYear()} (§ 43 Abs. 1 BetrVG)`,
        notiz:       "Automatisch angelegt: In diesem Kalendervierteljahr ist noch keine Betriebsversammlung geplant. " +
                     "Erledigt sich, sobald eine Betriebsversammlung angelegt ist – oder von Hand erledigen.",
      },
    });
  } else if (frist.status === FristStatus.ERLEDIGT && !frist.erledigtVonId) {
    // Automatisch erledigt, die Versammlung gibt es aber nicht mehr
    await prisma.frist.update({
      where: { id: frist.id },
      data:  { status: FristStatus.OFFEN, erledigtAm: null },
    });
  }
}
