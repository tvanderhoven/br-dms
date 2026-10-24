/**
 * Protokollführung (Roadmap Paket 3)
 *
 * Haken „Protokollführung“ am Benutzer = darf protokollieren (z. B. die ständige Schriftführung
 * laut Geschäftsordnung). Wer eine Sitzung konkret protokolliert, steht an der Sitzung
 * (protokollfuehrerId): bei neuen Sitzungen mit der Person mit Haken vorbelegt, änderbar.
 * Gremiumsmitglieder dürfen auch ohne Haken eingetragen werden (Urlaub, Vertretung) – sie
 * bearbeiten das Protokoll ohnehin schon (routes/protocol.ts, Mindestrolle MITGLIED).
 */

import { Prisma, PrismaClient, Role } from "@prisma/client";
import defaultPrisma from "./prisma.js";

const GREMIUMS_ROLLEN: Role[] = [Role.VORSITZ, Role.STELLVERTRETER, Role.MITGLIED, Role.ERSATZMITGLIED];

export function darfProtokollieren(b: { aktiv: boolean; rolle: Role; protokollfuehrung: boolean }): boolean {
  return b.aktiv && (b.protokollfuehrung || GREMIUMS_ROLLEN.includes(b.rolle));
}

/** Vorbelegung für neue Sitzungen: die (erste) aktive Person mit Haken, sonst niemand */
export async function standardProtokollfuehrer(
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<string | null> {
  const b = await client.benutzer.findFirst({
    where:   { aktiv: true, protokollfuehrung: true },
    orderBy: { name: "asc" },
    select:  { id: true },
  });
  return b?.id ?? null;
}
