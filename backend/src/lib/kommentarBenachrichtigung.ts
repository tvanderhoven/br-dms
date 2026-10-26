/**
 * Benachrichtigungen zu Kommentaren (Roadmap Paket 2, lib/benachrichtigung.ts)
 *
 *  - Erwähnung: @Person im Kommentar (Tiptap-Knoten "personErwaehnung", siehe
 *    frontend/src/lib/PersonErwaehnungExtension.ts)
 *  - Antwort: neuer Kommentar dort, wo man selbst schon kommentiert hat
 *
 * Beide nur an Personen, die das kommentierte Objekt sehen dürfen – sonst verriete
 * schon der Betreff den Titel eines vertraulichen Dokuments oder TOPs.
 */

import { Role } from "@prisma/client";
import prisma from "./prisma.js";
import { darfDokumentSehen, topSichtbar } from "./vertraulich.js";
import { benachrichtigen, dokumentLink, sitzungLink } from "./benachrichtigung.js";
import { themaSichtbarFilter } from "./themenakte.js";

export type KommentarZiel = { sitzungId: string } | { topId: string } | { dokumentId: string } | { themaEintragId: string };

/** IDs aller erwähnten Personen im Tiptap-JSON */
export function erwaehntePersonen(json: unknown): string[] {
  const ids = new Set<string>();
  const besuchen = (knoten: unknown): void => {
    if (!knoten || typeof knoten !== "object") return;
    const k = knoten as { type?: unknown; attrs?: { benutzerId?: unknown }; content?: unknown };
    if (k.type === "personErwaehnung" && typeof k.attrs?.benutzerId === "string") ids.add(k.attrs.benutzerId);
    if (Array.isArray(k.content)) k.content.forEach(besuchen);
  };
  besuchen(json);
  return [...ids];
}

interface ZielInfo {
  titel:      string;
  link:       string;
  sitzungId:  string | null;
  /** Darf diese Person das Objekt sehen? */
  sichtbar:   (b: { id: string; rolle: Role }) => boolean | Promise<boolean>;
}

async function zielLaden(ziel: KommentarZiel): Promise<ZielInfo | null> {
  if ("sitzungId" in ziel) {
    const s = await prisma.sitzung.findUnique({ where: { id: ziel.sitzungId }, select: { id: true, titel: true } });
    if (!s) return null;
    return { titel: `Sitzung „${s.titel}“`, link: sitzungLink(s.id), sitzungId: s.id, sichtbar: b => b.rolle !== Role.EXTERN };
  }
  if ("topId" in ziel) {
    const t = await prisma.tOP.findUnique({
      where:  { id: ziel.topId },
      select: { nummer: true, titel: true, vertraulich: true, externAusgeschlossen: true, sitzungId: true },
    });
    if (!t) return null;
    return {
      titel: `TOP ${t.nummer} „${t.titel}“`, link: sitzungLink(t.sitzungId), sitzungId: t.sitzungId,
      sichtbar: b => b.rolle !== Role.EXTERN && topSichtbar(t, b.rolle),
    };
  }
  if ("themaEintragId" in ziel) {
    const e = await prisma.themaEintrag.findUnique({ where: { id: ziel.themaEintragId }, select: { thema: { select: { id: true, titel: true } } } });
    if (!e) return null;
    return {
      titel: `einem Beitrag zum Thema „${e.thema.titel}“`, link: `/themenakte/${e.thema.id}`, sitzungId: null,
      sichtbar: async b => !([Role.JAV, Role.SBV, Role.EXTERN] as Role[]).includes(b.rolle)
        && (await prisma.thema.count({ where: { id: e.thema.id, ...themaSichtbarFilter({ sub: b.id, rolle: b.rolle }) } })) > 0,
    };
  }
  const d = await prisma.dokument.findUnique({
    where:  { id: ziel.dokumentId },
    select: { id: true, titel: true, alias: true, vertraulich: true, vertraulichFuerMitglieder: true, hochgeladenVonId: true },
  });
  if (!d) return null;
  // JAV, SBV und Externe erreichen Dokumente nie (middleware/auth.ts)
  const ohneDokumente: Role[] = [Role.JAV, Role.SBV, Role.EXTERN];
  return {
    titel: `Dokument „${d.alias ?? d.titel}“`, link: dokumentLink(d.id), sitzungId: null,
    sichtbar: b => !ohneDokumente.includes(b.rolle) && darfDokumentSehen(d, b.rolle, b.id),
  };
}

/** Nach dem Speichern eines Kommentars aufrufen. Fehler landen nur im Log. */
export async function kommentarMelden(ziel: KommentarZiel, autorId: string, inhaltJson: unknown): Promise<void> {
  try {
    const info = await zielLaden(ziel);
    if (!info) return;

    const autor = await prisma.benutzer.findUnique({ where: { id: autorId }, select: { name: true } });
    const name = autor?.name ?? "Jemand";

    const erwaehnt = erwaehntePersonen(inhaltJson).filter(id => id !== autorId);
    const frueher = await prisma.kommentar.findMany({
      where:    { ...ziel, autorId: { not: autorId } },
      select:   { autorId: true },
      distinct: ["autorId"],
    });
    // Wer erwähnt ist, bekommt nur die Erwähnung, nicht zusätzlich die Antwort
    const antwort = frueher.map(k => k.autorId).filter(id => !erwaehnt.includes(id));

    const personen = await prisma.benutzer.findMany({
      where:  { id: { in: [...erwaehnt, ...antwort] }, aktiv: true },
      select: { id: true, rolle: true },
    });
    const sichtbar = new Set<string>();
    for (const p of personen) if (await info.sichtbar(p)) sichtbar.add(p.id);

    await benachrichtigen({
      art: "ERWAEHNUNG", empfaengerIds: erwaehnt.filter(id => sichtbar.has(id)), ausloeserId: autorId,
      link: info.link, sitzungId: info.sitzungId,
      betreff: `${name} hat dich erwähnt`,
      inhalt:  `${name} hat dich in einem Kommentar zu ${info.titel} erwähnt.`,
    });
    await benachrichtigen({
      art: "KOMMENTAR_ANTWORT", empfaengerIds: antwort.filter(id => sichtbar.has(id)), ausloeserId: autorId,
      link: info.link, sitzungId: info.sitzungId,
      betreff: `Neuer Kommentar: ${info.titel}`,
      inhalt:  `${name} hat ${info.titel} kommentiert, wo du mitdiskutierst.`,
    });
  } catch (err) {
    console.error("[Benachrichtigung] Kommentar:", err);
  }
}
