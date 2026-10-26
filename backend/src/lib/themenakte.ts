/**
 * Themenakte (Roadmap, entschieden 24./26.10.2026)
 *
 * Ein Thema (z. B. „BV mobiles Arbeiten“) ist der rote Faden über Wochen und Monate:
 * Kopf mit Status, Zuständigen, nächstem Schritt und Termin, darunter der Verlauf.
 *
 * Verlauf = Beiträge (ThemaEintrag, nicht veränderbar – Korrektur nur als neuer Beitrag
 * mit Bezug) + automatische Einträge, die beim Lesen aus den verknüpften Objekten
 * entstehen (Dokumente samt Fristen, TOPs samt Beschlüssen, Aufgaben, Betriebsvereinbarungen).
 * So kann ein automatischer Eintrag nie vom verknüpften Objekt abweichen – und er zeigt
 * nur, was die lesende Person dort auch sehen darf.
 *
 * Wer sieht ein Thema?
 *   Vorsitz, Stellvertretung, Admin mit Inhaltszugriff: alle
 *   Beteiligte (Zuständige/Projektteam): immer
 *   sonst nach Vertraulichkeit: ALLE = Mitglieder und Ersatzmitglieder,
 *   BETRIEBSRAT = ordentliche Mitglieder, VORSITZ = niemand weiter
 *   JAV, SBV, Externe: (noch) gar nicht – middleware/auth.ts lässt sie nicht auf /api/themenakte
 *
 * Wer schreibt Beiträge? Wer das Thema sieht und mindestens Mitglied ist (Ersatzmitglied
 * nur in aktiver Vertretung) – bei „nur Projektteam“ nur Beteiligte und Vorsitz/Stellvertretung.
 *
 * Keine Abstimmung in der Akte: beschlossen wird nur in der Sitzung (§ 33, kein
 * Umlaufbeschluss) – dafür „Als TOP vormerken“ (POST /api/sitzungen/:id/tops mit themaId).
 */

import {
  AufgabeTyp, AuditAktion, DokumentStatus, FristStatus, KanbanStatus, Prisma, Role, SitzungStatus,
  ThemaStatus, ThemaVertraulichkeit, type Thema,
} from "@prisma/client";
import prisma from "./prisma.js";
import { hatMindestrolle } from "../middleware/rbac.js";
import { darfDokumentSehen, siehtAllesVertrauliche, topSichtbar } from "./vertraulich.js";
import { FRIST_TYP_LABEL } from "./fristen.js";

export type Leser = { sub: string; rolle: Role };

export const THEMEN_LOESCHFRIST_JAHRE = "themen.loeschfrist_jahre";
export const THEMEN_LOESCHFRIST_STANDARD = 3;

/** Vorsitz und Stellvertretung sind gleichgestellt und haben in jeder Akte alle Rechte */
export const istLeitung = (rolle: Role) => rolle === Role.VORSITZ || rolle === Role.STELLVERTRETER;

/** Prisma-where-Teil: Themen, die diese Person sehen darf */
export function themaSichtbarFilter(leser: Leser): Prisma.ThemaWhereInput {
  if (siehtAllesVertrauliche(leser.rolle)) return {};
  const beteiligt: Prisma.ThemaWhereInput = { beteiligte: { some: { benutzerId: leser.sub } } };
  const stufen: ThemaVertraulichkeit[] =
    leser.rolle === Role.MITGLIED       ? [ThemaVertraulichkeit.ALLE, ThemaVertraulichkeit.BETRIEBSRAT] :
    leser.rolle === Role.ERSATZMITGLIED ? [ThemaVertraulichkeit.ALLE] : [];
  return { OR: [beteiligt, { vertraulichkeit: { in: stufen } }] };
}

/** Thema laden, wenn sichtbar – sonst null (Routen antworten dann mit 404) */
export async function sichtbaresThema(id: string, leser: Leser) {
  return prisma.thema.findFirst({
    where:   { id, ...themaSichtbarFilter(leser) },
    include: { beteiligte: { select: { benutzerId: true } } },
  });
}

/** Darf diese Person Beiträge schreiben und den Kopf ändern? */
export async function darfSchreiben(
  thema: Pick<Thema, "nurTeam"> & { beteiligte: { benutzerId: string }[] },
  leser: Leser,
): Promise<boolean> {
  if (istLeitung(leser.rolle)) return true;
  const beteiligt = thema.beteiligte.some(b => b.benutzerId === leser.sub);
  if (thema.nurTeam) return beteiligt;
  return beteiligt || (await hatMindestrolle(leser, Role.MITGLIED));
}

// ── Verlauf ────────────────────────────────────────────────────

export interface AutoEintrag {
  automatisch: true;
  zeit:        Date;
  art:         "DOKUMENT" | "FRIST" | "TOP" | "BESCHLUSS" | "AUFGABE" | "BV";
  text:        string;
  link:        string | null;
}

const datum = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });

const BEHANDELT: SitzungStatus[] = [SitzungStatus.PROTOKOLL_FINAL, SitzungStatus.ABGESCHLOSSEN];

/** Automatische Einträge aus allen verknüpften Objekten, die die Person sehen darf */
export async function automatischeEintraege(themaId: string, leser: Leser): Promise<AutoEintrag[]> {
  const [dokumente, tops, aufgaben, bvs] = await Promise.all([
    prisma.dokument.findMany({
      where:  { themaId, status: { not: DokumentStatus.GELOESCHT } },
      select: {
        id: true, titel: true, alias: true, erstelltAm: true,
        vertraulich: true, vertraulichFuerMitglieder: true, hochgeladenVonId: true,
        fristen: { select: { typ: true, bezeichnung: true, faelligAm: true, status: true, erstelltAm: true, erledigtAm: true } },
      },
    }),
    prisma.tOP.findMany({
      where:  { themaId },
      select: {
        id: true, nummer: true, titel: true, ergebnis: true, vertraulich: true, externAusgeschlossen: true, erstelltAm: true,
        sitzung: { select: { id: true, titel: true, sitzungsdatum: true, status: true } },
        beschluesse: { where: { finalisiert: true }, select: { antragstext: true, ergebnis: true, finalisiertAm: true } },
      },
    }),
    prisma.aufgabe.findMany({
      where:  { themaId, OR: [{ sichtbarkeit: "OEFFENTLICH" }, { erstelltVonId: leser.sub }, { zugewiesenAnId: leser.sub }] },
      select: { id: true, titel: true, erstelltAm: true, erledigt: true, erledigtAm: true },
    }),
    prisma.betriebsvereinbarung.findMany({
      where:  { themaId },
      select: { id: true, titel: true, abschlussdatum: true, erstelltAm: true },
    }),
  ]);

  const e: AutoEintrag[] = [];
  const leserIstDokumentRolle = !([Role.JAV, Role.SBV, Role.EXTERN] as Role[]).includes(leser.rolle);

  for (const d of dokumente) {
    if (!leserIstDokumentRolle || !darfDokumentSehen(d, leser.rolle, leser.sub)) continue;
    const name = d.alias ?? d.titel;
    e.push({ automatisch: true, zeit: d.erstelltAm, art: "DOKUMENT", text: `Dokument abgelegt: ${name}`, link: `/dokumente?dokument=${d.id}` });
    for (const f of d.fristen) {
      const typ = f.bezeichnung ?? FRIST_TYP_LABEL[f.typ] ?? f.typ;
      e.push({ automatisch: true, zeit: f.erstelltAm, art: "FRIST", text: `Frist gesetzt: ${typ}, fällig am ${datum(f.faelligAm)} (${name})`, link: "/fristen" });
      if (f.status === FristStatus.ERLEDIGT && f.erledigtAm) {
        e.push({ automatisch: true, zeit: f.erledigtAm, art: "FRIST", text: `Frist erledigt: ${typ} (${name})`, link: "/fristen" });
      }
    }
  }

  for (const t of tops) {
    if (!topSichtbar(t, leser.rolle)) continue;
    const s = t.sitzung;
    const link = `/sitzungen?id=${s.id}`;
    if (s.status === SitzungStatus.ABGESAGT) continue;
    if (BEHANDELT.includes(s.status)) {
      const ergebnis = t.ergebnis?.trim() ? ` – Ergebnis: ${t.ergebnis.trim().slice(0, 300)}` : "";
      e.push({ automatisch: true, zeit: s.sitzungsdatum, art: "TOP", text: `Als TOP ${t.nummer} in „${s.titel}“ behandelt${ergebnis}`, link });
      for (const b of t.beschluesse) {
        const erg = b.ergebnis ? ` (${b.ergebnis.toLowerCase()})` : "";
        e.push({ automatisch: true, zeit: b.finalisiertAm ?? s.sitzungsdatum, art: "BESCHLUSS", text: `Beschluss${erg}: ${b.antragstext.slice(0, 300)}`, link });
      }
    } else {
      e.push({ automatisch: true, zeit: t.erstelltAm, art: "TOP", text: `Als TOP ${t.nummer} für „${s.titel}“ am ${datum(s.sitzungsdatum)} vorgemerkt`, link });
    }
  }

  for (const a of aufgaben) {
    const link = `/aufgaben?aufgabe=${a.id}`;
    e.push({ automatisch: true, zeit: a.erstelltAm, art: "AUFGABE", text: `Aufgabe angelegt: ${a.titel}`, link });
    if (a.erledigt && a.erledigtAm) e.push({ automatisch: true, zeit: a.erledigtAm, art: "AUFGABE", text: `Aufgabe erledigt: ${a.titel}`, link });
  }

  for (const b of bvs) {
    e.push({ automatisch: true, zeit: b.abschlussdatum, art: "BV", text: `Betriebsvereinbarung abgeschlossen: ${b.titel}`, link: "/betriebsvereinbarungen" });
  }

  return e;
}

// ── Übernahme des alten Themen-Backlogs ─────────────────────────

const STATUS_AUS_BACKLOG: Record<KanbanStatus, ThemaStatus> = {
  BACKLOG:        ThemaStatus.OFFEN,
  IN_BEARBEITUNG: ThemaStatus.IN_VERHANDLUNG,
  ERLEDIGT:       ThemaStatus.ABGESCHLOSSEN,
};

/**
 * Einmalig beim Start: Karten des alten Themen-Backlogs (Aufgaben mit kanbanStatus)
 * werden zu Themen. Beschreibung → erster Beitrag, Zuständige → Beteiligte,
 * verknüpfter TOP → TOP des Themas. Private Karten werden „nur Vorsitz“ mit der
 * anlegenden Person als Beteiligter. Danach ist die Karte gelöscht – ein zweiter
 * Lauf findet nichts mehr.
 */
export async function backlogUebernehmen(): Promise<number> {
  const karten = await prisma.aufgabe.findMany({
    where:  { kanbanStatus: { not: null }, typ: AufgabeTyp.AUFGABE },
    select: {
      id: true, titel: true, beschreibung: true, beschreibungJson: true, kanbanStatus: true, sichtbarkeit: true,
      erstelltVonId: true, zugewiesenAnId: true, topId: true, erstelltAm: true, erledigtAm: true,
    },
  });

  for (const k of karten) {
    await prisma.$transaction(async tx => {
      const status = STATUS_AUS_BACKLOG[k.kanbanStatus!];
      const privat = k.sichtbarkeit === "PRIVAT";
      const beteiligte = new Map<string, boolean>();
      if (privat) beteiligte.set(k.erstelltVonId, false);
      if (k.zugewiesenAnId) beteiligte.set(k.zugewiesenAnId, true);

      const thema = await tx.thema.create({
        data: {
          titel:           k.titel,
          status,
          vertraulichkeit: privat ? ThemaVertraulichkeit.VORSITZ : ThemaVertraulichkeit.ALLE,
          abgeschlossenAm: status === ThemaStatus.ABGESCHLOSSEN ? (k.erledigtAm ?? new Date()) : null,
          erstelltVonId:   k.erstelltVonId,
          erstelltAm:      k.erstelltAm,
          beteiligte:      { create: [...beteiligte].map(([benutzerId, zustaendig]) => ({ benutzerId, zustaendig })) },
        },
      });
      const text = k.beschreibung?.trim();
      if (text || k.beschreibungJson) {
        await tx.themaEintrag.create({
          data: {
            themaId: thema.id, art: "NOTIZ", autorId: k.erstelltVonId, erstelltAm: k.erstelltAm,
            inhalt: text ?? "", inhaltJson: k.beschreibungJson ?? undefined,
          },
        });
      }
      if (k.topId) await tx.tOP.update({ where: { id: k.topId }, data: { themaId: thema.id } });
      await tx.aufgabe.delete({ where: { id: k.id } });
    });
  }
  if (karten.length) console.log(`[Themenakte] ${karten.length} Karte(n) aus dem Themen-Backlog als Themen übernommen`);
  return karten.length;
}

// ── Löschfrist ─────────────────────────────────────────────────

/** Abgeschlossene Themen nach Ablauf der Löschfrist löschen (Aufruf aus dem Lösch-Worker) */
export async function abgelaufeneThemenLoeschen(jetzt = new Date()): Promise<number> {
  const e = await prisma.systemEinstellung.findUnique({ where: { schluessel: THEMEN_LOESCHFRIST_JAHRE } });
  const jahre = e ? Number(e.wert) : THEMEN_LOESCHFRIST_STANDARD;
  if (!Number.isFinite(jahre) || jahre <= 0) return 0;   // 0 = nie automatisch löschen
  const grenze = new Date(jetzt);
  grenze.setFullYear(grenze.getFullYear() - jahre);
  const alt = await prisma.thema.findMany({
    where:  { status: ThemaStatus.ABGESCHLOSSEN, abgeschlossenAm: { lt: grenze } },
    select: { id: true, titel: true },
  });
  for (const t of alt) {
    await prisma.thema.delete({ where: { id: t.id } });
    await prisma.auditLog.create({ data: { aktion: AuditAktion.THEMA_GELOESCHT, details: { titel: t.titel, grund: "Löschfrist" } } });
  }
  return alt.length;
}
