/**
 * Ladung vollständig? – Prüfung vor einem Spontan-TOP (Roadmap, Notiz 18.10.2026)
 *
 * Ein Spontan-TOP heilt den Ladungsmangel nach § 29 Abs. 2 S. 3 BetrVG nur, wenn alle
 * Mitglieder einschließlich der Ersatzmitglieder rechtzeitig geladen waren und die
 * Anwesenden die Ergänzung einstimmig beschließen (Rechtsprechung). BR-DMS gleicht
 * dafür nur mit dem Versandnachweis ab:
 *   - jedes ordentliche Mitglied, das „Kommt“ steht, hat eine erfolgreiche Einladung,
 *   - für jedes verhinderte ordentliche Mitglied ist ein Ersatz geladen, und dieser
 *     hat eine erfolgreiche Einladung.
 * Ob die Einladung rechtzeitig war (oder auf anderem Weg, z. B. auf Papier, erfolgte),
 * beurteilt der Mensch – deshalb nur ein Hinweis, keine Sperre.
 */

import { AnwesenheitsStatus } from "@prisma/client";
import prisma from "./prisma.js";
import { ORDENTLICHE_ROLLEN } from "./verfuegbarkeit.js";

export interface LadungMangel {
  name:  string;
  grund: "OHNE_LADUNG" | "OHNE_EINLADUNG" | "OHNE_ERSATZ" | "ERSATZ_OHNE_EINLADUNG";
  text:  string;
}

export interface LadungPruefung {
  vollstaendig: boolean;
  maengel:      LadungMangel[];
  sitzungsdatum: Date;   // Beginn der Sitzung, zum Abgleich mit den Versandzeiten im Dialog
}

export async function ladungPruefen(sitzungId: string): Promise<LadungPruefung | null> {
  const sitzung = await prisma.sitzung.findUnique({ where: { id: sitzungId }, select: { sitzungsdatum: true } });
  if (!sitzung) return null;

  const [ordentliche, anwesenheiten, versand] = await Promise.all([
    prisma.benutzer.findMany({
      where:   { aktiv: true, rolle: { in: ORDENTLICHE_ROLLEN } },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.anwesenheit.findMany({
      where:  { sitzungId },
      select: { benutzerId: true, status: true, vertretungFuerId: true, benutzer: { select: { name: true } } },
    }),
    prisma.einladungVersand.findMany({
      where:  { sitzungId, erfolgreich: true },
      select: { benutzerId: true },
    }),
  ]);

  const eingeladen = new Set(versand.map(v => v.benutzerId));
  const ladung = new Map(anwesenheiten.map(a => [a.benutzerId, a]));
  const maengel: LadungMangel[] = [];

  for (const m of ordentliche) {
    const status = ladung.get(m.id)?.status;
    const verhindert = status === AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT || status === AnwesenheitsStatus.ABWESEND_UNENTSCHULDIGT;

    if (!status) {
      maengel.push({ name: m.name, grund: "OHNE_LADUNG", text: `${m.name} steht nicht in der Ladung` });
    } else if (!verhindert) {
      if (!eingeladen.has(m.id)) maengel.push({ name: m.name, grund: "OHNE_EINLADUNG", text: `${m.name}: keine erfolgreiche Einladung im Versandnachweis` });
    } else {
      const ersatz = anwesenheiten.find(a => a.status === AnwesenheitsStatus.ERSATZ_FUER && a.vertretungFuerId === m.id);
      if (!ersatz) {
        maengel.push({ name: m.name, grund: "OHNE_ERSATZ", text: `${m.name} ist verhindert, aber kein Ersatzmitglied geladen` });
      } else if (!eingeladen.has(ersatz.benutzerId)) {
        maengel.push({
          name: ersatz.benutzer.name, grund: "ERSATZ_OHNE_EINLADUNG",
          text: `${ersatz.benutzer.name} (Ersatz für ${m.name}): keine erfolgreiche Einladung im Versandnachweis`,
        });
      }
    }
  }

  return { vollstaendig: maengel.length === 0, maengel, sitzungsdatum: sitzung.sitzungsdatum };
}
