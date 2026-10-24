/**
 * Verfügbarkeit zur Sitzung aus dem Abwesenheitskalender
 *
 * Beim Laden einer Sitzung erkennt BR-DMS, wer am Sitzungstag laut Kalender
 * abwesend ist, schlägt für verhinderte ordentliche Mitglieder das nächste
 * verfügbare Ersatzmitglied laut Wahlrang vor (§ 25 Abs. 1 Satz 2 BetrVG) und
 * zeigt, ob die Sitzung voraussichtlich beschlussfähig ist (§ 33 Abs. 2).
 * Übernommen wird nur auf Knopfdruck (routes/abwesenheiten.ts) – der Kalender
 * ist ein Hinweis, die Ladung bleibt Sache des Vorsitzes.
 *
 * Sitzungszeiten liegen "wie eingegeben" in UTC-Feldern (siehe lib/kalender.ts),
 * Abwesenheiten als reines Datum – verglichen wird deshalb der Kalendertag.
 */

import { AbwesenheitsGrund, AnwesenheitsStatus, Role } from "@prisma/client";
import prisma from "./prisma.js";
import { istBeschlussfaehig, sollStaerkeErmitteln } from "./beschlussfaehigkeit.js";
import { vergleicheNachMitgliederSortierung } from "./mitgliederSortierung.js";

export const ORDENTLICHE_ROLLEN: Role[] = [Role.VORSITZ, Role.STELLVERTRETER, Role.MITGLIED];

export const GRUND_LABEL: Record<AbwesenheitsGrund, string> = {
  URLAUB:      "Urlaub",
  KRANKHEIT:   "Krankheit",
  SCHULUNG:    "Schulung",
  DIENSTREISE: "Dienstreise",
  SONSTIGES:   "Sonstiges",
};

/** "2026-10-20" → Date um 00:00Z, wie Prisma @db.Date liefert; null bei ungültiger Eingabe */
export function tagAusText(text: unknown): Date | null {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T00:00:00Z`);
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? null : d;
}

/** Kalendertag einer Sitzung (Ortszeit steckt in den UTC-Feldern) */
export const sitzungsTag = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);

/** Darf der Betrachter den Grund dieser Abwesenheit sehen? Nur eigene oder als Vorsitz/Stellvertretung. */
export function darfGrundSehen(betrachter: { sub: string; rolle: Role }, benutzerId: string): boolean {
  return betrachter.sub === benutzerId
    || betrachter.rolle === Role.VORSITZ
    || betrachter.rolle === Role.STELLVERTRETER;
}

/** Wer ist am Tag abwesend? benutzerId → erste passende Abwesenheit */
export async function abwesendeAmTag(tag: Date) {
  const eintraege = await prisma.abwesenheit.findMany({
    where:   { von: { lte: tag }, bis: { gte: tag } },
    orderBy: { von: "asc" },
    select:  { id: true, benutzerId: true, grund: true, von: true, bis: true },
  });
  const map = new Map<string, (typeof eintraege)[number]>();
  for (const e of eintraege) if (!map.has(e.benutzerId)) map.set(e.benutzerId, e);
  return map;
}

export interface VerfuegbarkeitMitglied {
  benutzerId: string;
  name:       string;
  rolle:      Role;
  abwesend:   boolean;
  grund:      AbwesenheitsGrund | null;   // null = nicht abwesend oder nicht sichtbar
  bis:        Date | null;
  ladung:     AnwesenheitsStatus | null;  // aktueller Eintrag in „Ladung & Verhinderung“
}

export interface ErsatzPlan {
  fuer:   { id: string; name: string };
  ersatz: { id: string; name: string } | null;  // null = kein verfügbares Ersatzmitglied mehr
}

export interface Verfuegbarkeit {
  tag:        string;
  mitglieder: VerfuegbarkeitMitglied[];
  /** Laut Kalender abwesende ordentliche Mitglieder ohne geladenen Ersatz → Vorschlag */
  ersatzPlan: ErsatzPlan[];
  /** Geladene Personen („Kommt“/„Als Ersatz geladen“), die laut Kalender abwesend sind */
  konflikte:  Array<{ id: string; name: string }>;
  /** Noch etwas zu übernehmen? (Abwesende nicht verhindert, Verfügbare ohne Ladung, Ersatz fehlt) */
  offeneAenderungen: number;
  prognose: {
    sollStaerke: number;
    mindestens:  number;
    /** Ordentliche Mitglieder, die kommen können, plus schon geladene Ersatzmitglieder */
    ohneNeuenErsatz: number;
    /** zusätzlich mit den vorgeschlagenen Ersatzmitgliedern */
    mitErsatz:   number;
    beschlussfaehig: boolean;
  };
}

/**
 * Stand der Verfügbarkeit für eine Sitzung. Ersatzmitglieder werden der Reihe
 * nach (Wahlrang) vergeben und dabei übersprungen, wenn sie selbst abwesend,
 * schon für jemand anderen geladen oder ausdrücklich verhindert sind.
 */
export async function verfuegbarkeitErmitteln(
  sitzungId: string,
  betrachter: { sub: string; rolle: Role },
): Promise<Verfuegbarkeit | null> {
  const sitzung = await prisma.sitzung.findUnique({ where: { id: sitzungId }, select: { sitzungsdatum: true } });
  if (!sitzung) return null;
  const tag = sitzungsTag(sitzung.sitzungsdatum);

  const [benutzer, anwesenheiten, abwesende, sollStaerke] = await Promise.all([
    prisma.benutzer.findMany({
      where:  { aktiv: true, rolle: { notIn: [Role.ADMIN, Role.EXTERN] } },
      select: { id: true, name: true, rolle: true, wahlReihenfolge: true },
    }),
    prisma.anwesenheit.findMany({
      where:  { sitzungId },
      select: { benutzerId: true, status: true, vertretungFuerId: true },
    }),
    abwesendeAmTag(tag),
    sollStaerkeErmitteln(),
  ]);
  benutzer.sort(vergleicheNachMitgliederSortierung);
  const ladung = new Map(anwesenheiten.map(a => [a.benutzerId, a]));

  const mitglieder: VerfuegbarkeitMitglied[] = benutzer.map(b => {
    const a = abwesende.get(b.id);
    return {
      benutzerId: b.id, name: b.name, rolle: b.rolle,
      abwesend: !!a,
      grund:    a && darfGrundSehen(betrachter, b.id) ? a.grund : null,
      bis:      a?.bis ?? null,
      ladung:   ladung.get(b.id)?.status ?? null,
    };
  });

  const verhindert = (id: string) => {
    const s = ladung.get(id)?.status;
    return abwesende.has(id)
      || s === AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT
      || s === AnwesenheitsStatus.ABWESEND_UNENTSCHULDIGT;
  };

  const ordentliche = benutzer.filter(b => ORDENTLICHE_ROLLEN.includes(b.rolle));
  const vertreteneIds = new Set(anwesenheiten.filter(a => a.status === AnwesenheitsStatus.ERSATZ_FUER).map(a => a.vertretungFuerId));
  const geladeneErsatz = anwesenheiten.filter(a => a.status === AnwesenheitsStatus.ERSATZ_FUER && !abwesende.has(a.benutzerId));

  // Freie Ersatzmitglieder in Wahlrang-Reihenfolge
  const pool = benutzer
    .filter(b => b.rolle === Role.ERSATZMITGLIED && !ladung.has(b.id) && !abwesende.has(b.id))
    .sort((a, b) => (a.wahlReihenfolge ?? Infinity) - (b.wahlReihenfolge ?? Infinity));

  const ersatzPlan: ErsatzPlan[] = ordentliche
    .filter(b => verhindert(b.id) && !vertreteneIds.has(b.id))
    .map(b => {
      const e = pool.shift();
      return { fuer: { id: b.id, name: b.name }, ersatz: e ? { id: e.id, name: e.name } : null };
    });

  const konflikte = benutzer
    .filter(b => abwesende.has(b.id) && (
      ladung.get(b.id)?.status === AnwesenheitsStatus.ANWESEND || ladung.get(b.id)?.status === AnwesenheitsStatus.ERSATZ_FUER))
    .map(b => ({ id: b.id, name: b.name }));

  // Was „Alle übernehmen“ ändern würde – Ersatzmitglieder ohne Ladung bleiben außen vor
  const offeneAenderungen = benutzer.filter(b => {
    if (b.rolle === Role.ERSATZMITGLIED) return false;
    const s = ladung.get(b.id)?.status;
    return abwesende.has(b.id) ? s !== AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT && s !== AnwesenheitsStatus.ABWESEND_UNENTSCHULDIGT : !s;
  }).length + ersatzPlan.filter(p => p.ersatz).length;

  const ohneNeuenErsatz = ordentliche.filter(b => !verhindert(b.id)).length + geladeneErsatz.length;
  const mitErsatz = ohneNeuenErsatz + ersatzPlan.filter(p => p.ersatz).length;

  return {
    tag: tag.toISOString().slice(0, 10),
    mitglieder,
    ersatzPlan,
    konflikte,
    offeneAenderungen,
    prognose: {
      sollStaerke,
      mindestens: Math.ceil(sollStaerke / 2),
      ohneNeuenErsatz,
      mitErsatz,
      beschlussfaehig: istBeschlussfaehig(mitErsatz, sollStaerke),
    },
  };
}

/**
 * Kalender in die Ladung übernehmen: Abwesende → „Verhindert“, alle übrigen
 * Mitglieder/JAV/SBV ohne Eintrag → „Kommt“, Ersatzmitglieder laut Plan laden.
 * Bereits gesetzte Einträge verfügbarer Personen bleiben unangetastet.
 */
export async function kalenderUebernehmen(sitzungId: string, betrachter: { sub: string; rolle: Role }) {
  const stand = await verfuegbarkeitErmitteln(sitzungId, betrachter);
  if (!stand) return null;

  let verhindert = 0, kommt = 0, ersatz = 0;
  await prisma.$transaction(async tx => {
    for (const m of stand.mitglieder) {
      if (m.rolle === Role.ERSATZMITGLIED) continue;
      if (m.abwesend) {
        if (m.ladung === AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT || m.ladung === AnwesenheitsStatus.ABWESEND_UNENTSCHULDIGT) continue;
        await tx.anwesenheit.upsert({
          where:  { sitzungId_benutzerId: { sitzungId, benutzerId: m.benutzerId } },
          update: { status: AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT, vertretungFuerId: null },
          create: { sitzungId, benutzerId: m.benutzerId, status: AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT },
        });
        verhindert++;
      } else if (!m.ladung) {
        await tx.anwesenheit.create({ data: { sitzungId, benutzerId: m.benutzerId, status: AnwesenheitsStatus.ANWESEND } });
        kommt++;
      }
    }
    for (const p of stand.ersatzPlan) {
      if (!p.ersatz) continue;
      await tx.anwesenheit.create({
        data: { sitzungId, benutzerId: p.ersatz.id, status: AnwesenheitsStatus.ERSATZ_FUER, vertretungFuerId: p.fuer.id },
      });
      ersatz++;
    }
  });

  return { verhindert, kommt, ersatz, ohneErsatz: stand.ersatzPlan.filter(p => !p.ersatz).map(p => p.fuer.name) };
}
