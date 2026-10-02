/**
 * Gemeinsame Logik für Überstunden-Zeiträume – strukturell identisch zu
 * lib/zeitmodell.ts, nur ohne festes Enum (Regelung ist Freitext).
 */

import { Prisma, UeberstundenEintrag } from "@prisma/client";

function tagVorher(datum: Date): Date {
  const d = new Date(datum);
  d.setDate(d.getDate() - 1);
  return d;
}

// Prüft, ob sich [von, bis] mit einem bestehenden Zeitraum desselben
// Mitarbeiters überschneidet (bis=null heißt "läuft weiter, offen").
export async function findeUeberlappung(
  client: Prisma.TransactionClient,
  mitarbeiterId: string,
  von: Date,
  bis: Date | null,
  ausgenommenId?: string,
): Promise<UeberstundenEintrag | null> {
  const zeitraeume = await client.ueberstundenEintrag.findMany({
    where: { mitarbeiterId, ...(ausgenommenId ? { id: { not: ausgenommenId } } : {}) },
  });
  return zeitraeume.find(z => {
    const zBis = z.gueltigBis ?? new Date("9999-12-31");
    const neuBis = bis ?? new Date("9999-12-31");
    return von <= zBis && z.gueltigVon <= neuBis;
  }) ?? null;
}

export type UeberstundenUpsertErgebnis =
  | { art: "angelegt" | "unveraendert"; eintrag: UeberstundenEintrag }
  | { art: "aktualisiert"; eintrag: UeberstundenEintrag; vorherigeRegelung: string }
  | { art: "konflikt"; grund: string };

// Legt einen neuen Überstunden-Zeitraum an.
//
// Zwei grundverschiedene Fälle:
// - Mit explizitem gueltigBis (fester Zeitraum, z.B. nachgetragene Historie
//   oder ein künftig schon geplanter Zeitraum): komplett unabhängig von einem
//   eventuell offenen Zeitraum – nur normale Überlappungsprüfung gegen ALLE
//   bestehenden Zeiträume. Ein offener Zeitraum in der Zukunft blockiert das
//   Nachtragen eines abgeschlossenen Zeitraums in der Vergangenheit nicht.
// - Ohne gueltigBis (neuer aktueller/laufender Zustand): schließt automatisch
//   einen bestehenden OFFENEN Zeitraum (gueltigBis = null) desselben
//   Mitarbeiters, der vor dem neuen Zeitraum beginnt.
export async function ueberstundenPeriodeAnlegen(
  client: Prisma.TransactionClient,
  params: { mitarbeiterId: string; regelung: string; gueltigVon: Date; gueltigBis?: Date | null; bemerkung?: string | null; sitzungId?: string | null },
): Promise<UeberstundenUpsertErgebnis> {
  const { mitarbeiterId, regelung, gueltigVon, gueltigBis, bemerkung, sitzungId } = params;

  if (gueltigBis) {
    const ueberlappung = await findeUeberlappung(client, mitarbeiterId, gueltigVon, gueltigBis);
    if (ueberlappung) {
      return {
        art: "konflikt",
        grund: `Überschneidet sich mit bestehendem Zeitraum ${ueberlappung.gueltigVon.toLocaleDateString("de-DE")} – ${ueberlappung.gueltigBis?.toLocaleDateString("de-DE") ?? "unbefristet"}`,
      };
    }
    const neu = await client.ueberstundenEintrag.create({
      data: { mitarbeiterId, regelung, gueltigVon, gueltigBis, bemerkung: bemerkung ?? null, sitzungId: sitzungId ?? null },
    });
    return { art: "angelegt", eintrag: neu };
  }

  const bestehende = await client.ueberstundenEintrag.findMany({ where: { mitarbeiterId } });
  const offener = bestehende.find(z => z.gueltigBis === null);

  if (offener) {
    if (offener.gueltigVon.getTime() === gueltigVon.getTime() && offener.regelung === regelung) {
      return { art: "unveraendert", eintrag: offener };
    }
    if (offener.gueltigVon >= gueltigVon) {
      return {
        art: "konflikt",
        grund: `Neuer Zeitraum (ab ${gueltigVon.toLocaleDateString("de-DE")}) liegt vor oder gleichzeitig mit dem bereits offenen Zeitraum (ab ${offener.gueltigVon.toLocaleDateString("de-DE")}) – bitte manuell prüfen`,
      };
    }
    if (offener.regelung === regelung) {
      return { art: "unveraendert", eintrag: offener };
    }

    const konfliktMitAbgeschlossenem = await findeUeberlappung(client, mitarbeiterId, gueltigVon, null, offener.id);
    if (konfliktMitAbgeschlossenem) {
      return {
        art: "konflikt",
        grund: `Überschneidet sich mit bestehendem Zeitraum ${konfliktMitAbgeschlossenem.gueltigVon.toLocaleDateString("de-DE")} – ${konfliktMitAbgeschlossenem.gueltigBis?.toLocaleDateString("de-DE") ?? "unbefristet"}`,
      };
    }

    await client.ueberstundenEintrag.update({
      where: { id: offener.id },
      data: { gueltigBis: tagVorher(gueltigVon) },
    });

    const neu = await client.ueberstundenEintrag.create({
      data: { mitarbeiterId, regelung, gueltigVon, bemerkung: bemerkung ?? null, sitzungId: sitzungId ?? null },
    });
    return { art: "aktualisiert", eintrag: neu, vorherigeRegelung: offener.regelung };
  }

  const ueberlappung = await findeUeberlappung(client, mitarbeiterId, gueltigVon, null);
  if (ueberlappung) {
    return {
      art: "konflikt",
      grund: `Überschneidet sich mit bestehendem Zeitraum ${ueberlappung.gueltigVon.toLocaleDateString("de-DE")} – ${ueberlappung.gueltigBis?.toLocaleDateString("de-DE") ?? "unbefristet"}`,
    };
  }

  const neu = await client.ueberstundenEintrag.create({
    data: { mitarbeiterId, regelung, gueltigVon, bemerkung: bemerkung ?? null, sitzungId: sitzungId ?? null },
  });
  return { art: "angelegt", eintrag: neu };
}
