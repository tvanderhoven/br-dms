/**
 * Gemeinsame Logik für Zeitmodell-Zeiträume – genutzt vom CSV-Import
 * (gehaltstabelle.ts) und den Zeitmodell-Routen (zeitmodell.ts).
 */

import { Prisma, Zeitmodell, ZeitmodellEintrag } from "@prisma/client";

export const GEHALTSSTUFE_REGEX = /^([A-Da-d]):([1-6])\.([1-4])$/;
export const AT_REGEX = /^AT:(.+)$/i;

export type GeparsteGehaltsstufe =
  | { art: "eingruppierung"; zeitmodell: Zeitmodell; gruppe: number; stufe: number }
  | { art: "at"; gehalt: number };

// Erkennt deutsches ("4.200,50") und einfaches ("4200.50" / "4200") Zahlenformat.
function parseGehaltBetrag(wert: string): number | null {
  let s = wert.trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(","))               s = s.replace(",", ".");
  const zahl = Number(s);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : null;
}

// Parst den kombinierten Code aus der Quelle – entweder eine tarifliche
// Eingruppierung ("B:3.2") oder AT/außer Tarif mit realem Gehalt statt Gruppe
// ("AT:4200"). Gibt null zurück, wenn keines der beiden Formate passt.
export function parseGehaltsstufe(code: string): GeparsteGehaltsstufe | null {
  const wert = code.trim();

  const atTreffer = wert.match(AT_REGEX);
  if (atTreffer) {
    const gehalt = parseGehaltBetrag(atTreffer[1]);
    return gehalt !== null ? { art: "at", gehalt } : null;
  }

  const treffer = wert.match(GEHALTSSTUFE_REGEX);
  if (!treffer) return null;
  return {
    art:        "eingruppierung",
    zeitmodell: treffer[1].toUpperCase() as Zeitmodell,
    gruppe:     Number(treffer[2]),
    stufe:      Number(treffer[3]),
  };
}

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
): Promise<ZeitmodellEintrag | null> {
  const zeitraeume = await client.zeitmodellEintrag.findMany({
    where: { mitarbeiterId, ...(ausgenommenId ? { id: { not: ausgenommenId } } : {}) },
  });
  return zeitraeume.find(z => {
    const zBis = z.gueltigBis ?? new Date("9999-12-31");
    const neuBis = bis ?? new Date("9999-12-31");
    return von <= zBis && z.gueltigVon <= neuBis;
  }) ?? null;
}

export type ZeitmodellUpsertErgebnis =
  | { art: "angelegt" | "unveraendert"; eintrag: ZeitmodellEintrag }
  | { art: "aktualisiert"; eintrag: ZeitmodellEintrag; vorherigesZeitmodell: Zeitmodell }
  | { art: "konflikt"; grund: string };

// Legt einen neuen Zeitmodell-Zeitraum an.
//
// Zwei grundverschiedene Fälle:
// - Mit explizitem gueltigBis (fester Zeitraum, z.B. nachgetragene Historie
//   oder ein künftig schon geplanter Zeitraum): komplett unabhängig von einem
//   eventuell offenen Zeitraum – nur normale Überlappungsprüfung gegen ALLE
//   bestehenden Zeiträume. Ein offener Zeitraum in der Zukunft blockiert das
//   Nachtragen eines abgeschlossenen Zeitraums in der Vergangenheit nicht.
// - Ohne gueltigBis (das ist der neue aktuelle/laufende Zustand, z.B. aus dem
//   CSV-Import): schließt automatisch einen bestehenden OFFENEN Zeitraum
//   (gueltigBis = null) desselben Mitarbeiters, der vor dem neuen Zeitraum
//   beginnt – das entspricht dem "neuester Eintrag löst den vorherigen ab"-
//   Verhalten, das die Eingruppierung schon immer hatte.
export async function zeitmodellPeriodeAnlegen(
  client: Prisma.TransactionClient,
  params: { mitarbeiterId: string; zeitmodell: Zeitmodell; gueltigVon: Date; gueltigBis?: Date | null; bemerkung?: string | null; sitzungId?: string | null },
): Promise<ZeitmodellUpsertErgebnis> {
  const { mitarbeiterId, zeitmodell, gueltigVon, gueltigBis, bemerkung, sitzungId } = params;

  if (gueltigBis) {
    const ueberlappung = await findeUeberlappung(client, mitarbeiterId, gueltigVon, gueltigBis);
    if (ueberlappung) {
      return {
        art: "konflikt",
        grund: `Überschneidet sich mit bestehendem Zeitraum ${ueberlappung.gueltigVon.toLocaleDateString("de-DE")} – ${ueberlappung.gueltigBis?.toLocaleDateString("de-DE") ?? "unbefristet"}`,
      };
    }
    const neu = await client.zeitmodellEintrag.create({
      data: { mitarbeiterId, zeitmodell, gueltigVon, gueltigBis, bemerkung: bemerkung ?? null, sitzungId: sitzungId ?? null },
    });
    return { art: "angelegt", eintrag: neu };
  }

  const bestehende = await client.zeitmodellEintrag.findMany({ where: { mitarbeiterId } });
  const offener = bestehende.find(z => z.gueltigBis === null);

  if (offener) {
    if (offener.gueltigVon.getTime() === gueltigVon.getTime() && offener.zeitmodell === zeitmodell) {
      return { art: "unveraendert", eintrag: offener };
    }
    if (offener.gueltigVon >= gueltigVon) {
      return {
        art: "konflikt",
        grund: `Neuer Zeitraum (ab ${gueltigVon.toLocaleDateString("de-DE")}) liegt vor oder gleichzeitig mit dem bereits offenen Zeitraum (ab ${offener.gueltigVon.toLocaleDateString("de-DE")}) – bitte manuell prüfen`,
      };
    }
    if (offener.zeitmodell === zeitmodell) {
      // gleicher Buchstabe, nur ein neuerer Startpunkt – nichts zu tun
      return { art: "unveraendert", eintrag: offener };
    }

    const konfliktMitAbgeschlossenem = await findeUeberlappung(client, mitarbeiterId, gueltigVon, null, offener.id);
    if (konfliktMitAbgeschlossenem) {
      return {
        art: "konflikt",
        grund: `Überschneidet sich mit bestehendem Zeitraum ${konfliktMitAbgeschlossenem.gueltigVon.toLocaleDateString("de-DE")} – ${konfliktMitAbgeschlossenem.gueltigBis?.toLocaleDateString("de-DE") ?? "unbefristet"}`,
      };
    }

    await client.zeitmodellEintrag.update({
      where: { id: offener.id },
      data: { gueltigBis: tagVorher(gueltigVon) },
    });

    const neu = await client.zeitmodellEintrag.create({
      data: { mitarbeiterId, zeitmodell, gueltigVon, bemerkung: bemerkung ?? null, sitzungId: sitzungId ?? null },
    });
    return { art: "aktualisiert", eintrag: neu, vorherigesZeitmodell: offener.zeitmodell };
  }

  const ueberlappung = await findeUeberlappung(client, mitarbeiterId, gueltigVon, null);
  if (ueberlappung) {
    return {
      art: "konflikt",
      grund: `Überschneidet sich mit bestehendem Zeitraum ${ueberlappung.gueltigVon.toLocaleDateString("de-DE")} – ${ueberlappung.gueltigBis?.toLocaleDateString("de-DE") ?? "unbefristet"}`,
    };
  }

  const neu = await client.zeitmodellEintrag.create({
    data: { mitarbeiterId, zeitmodell, gueltigVon, bemerkung: bemerkung ?? null, sitzungId: sitzungId ?? null },
  });
  return { art: "angelegt", eintrag: neu };
}
