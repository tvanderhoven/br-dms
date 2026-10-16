/**
 * Abwesenheitskalender und Verfügbarkeit zur Sitzung
 *
 * GET    /api/abwesenheiten?von=&bis=              – Abwesenheiten im Zeitraum (+ Sitzungen darin)
 * POST   /api/abwesenheiten                        – eintragen (eigene; für andere nur Vorsitz/Stellv.)
 * PUT    /api/abwesenheiten/:id                    – ändern (dito)
 * DELETE /api/abwesenheiten/:id                    – löschen (dito)
 * GET    /api/sitzungen/:id/verfuegbarkeit         – wer ist am Sitzungstag da, Ersatz, Beschlussfähigkeit
 * POST   /api/sitzungen/:id/verfuegbarkeit/uebernehmen – Kalender in „Ladung & Verhinderung“ übernehmen
 *
 * Datenschutz: Den Grund (Krankheit = Gesundheitsdatum) sehen nur die Person selbst
 * sowie Vorsitz und Stellvertretung; alle anderen sehen nur „abwesend“.
 * Ersatzmitglieder ohne aktive Vertretung sehen nur ihre eigenen Einträge.
 * JAV und SBV erreichen /api/abwesenheiten nicht (middleware/auth.ts) – für sie trägt
 * der Vorsitz ein. Gelöscht wird hart: alte Abwesenheiten braucht niemand.
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import { AbwesenheitsGrund, Role, SitzungStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { darfGrundSehen, kalenderUebernehmen, tagAusText, verfuegbarkeitErmitteln } from "../lib/verfuegbarkeit.js";

const GRUENDE = Object.values(AbwesenheitsGrund) as string[];
const MAX_TAGE = 400;   // länger ist eher ein Tippfehler als ein Urlaub

const istVorsitz = (rolle: Role) => rolle === Role.VORSITZ || rolle === Role.STELLVERTRETER;

/** Ersatzmitglied ohne aktive Vertretung → nur eigene Einträge */
async function nurEigene(request: FastifyRequest): Promise<boolean> {
  const b = request.benutzer!;
  if (b.rolle !== Role.ERSATZMITGLIED) return false;
  const v = await prisma.benutzer.findUnique({ where: { id: b.sub }, select: { istVertretungFuer: true } });
  return !v?.istVertretungFuer;
}

type Eingabe = { benutzerId?: string; von?: string; bis?: string; grund?: string };

function pruefen(body: Eingabe): { von: Date; bis: Date; grund: AbwesenheitsGrund } | string {
  const von = tagAusText(body.von);
  const bis = tagAusText(body.bis ?? body.von);
  if (!von || !bis) return "Von und bis als Datum (JJJJ-MM-TT) angeben";
  if (bis < von) return "Das Ende liegt vor dem Beginn";
  if ((bis.getTime() - von.getTime()) / 86_400_000 > MAX_TAGE) return `Höchstens ${MAX_TAGE} Tage am Stück`;
  if (!body.grund || !GRUENDE.includes(body.grund)) return "Bitte einen Grund wählen";
  return { von, bis, grund: body.grund as AbwesenheitsGrund };
}

export async function abwesenheitRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Kalender ────────────────────────────────────────────
  app.get("/", { preHandler: [authenticate] }, async (request, reply) => {
    const q = request.query as { von?: string; bis?: string };
    const von = tagAusText(q.von);
    const bis = tagAusText(q.bis);
    if (!von || !bis || bis < von) return reply.status(400).send({ fehler: "Zeitraum von/bis (JJJJ-MM-TT) angeben" });

    const b = request.benutzer!;
    const eigeneOnly = await nurEigene(request);
    const [eintraege, sitzungen] = await Promise.all([
      prisma.abwesenheit.findMany({
        where:   { von: { lte: bis }, bis: { gte: von }, ...(eigeneOnly ? { benutzerId: b.sub } : {}) },
        orderBy: [{ von: "asc" }, { benutzer: { name: "asc" } }],
        select:  { id: true, von: true, bis: true, grund: true, benutzer: { select: { id: true, name: true, rolle: true } } },
      }),
      prisma.sitzung.findMany({
        // bis + 1 Tag: Sitzungen am letzten Tag liegen nach 00:00
        where:   { sitzungsdatum: { gte: von, lt: new Date(bis.getTime() + 86_400_000) }, status: { not: SitzungStatus.ABGESAGT } },
        orderBy: { sitzungsdatum: "asc" },
        select:  { id: true, titel: true, sitzungsdatum: true, status: true },
      }),
    ]);

    return reply.send({
      eintraege: eintraege.map(e => ({
        ...e,
        grund: darfGrundSehen(b, e.benutzer.id) ? e.grund : null,
        darfBearbeiten: e.benutzer.id === b.sub || istVorsitz(b.rolle),
      })),
      sitzungen,
      darfFuerAndere: istVorsitz(b.rolle),
    });
  });

  // ── POST / ──────────────────────────────────────────────────────
  app.post("/", { preHandler: [authenticate] }, async (request, reply) => {
    const body = (request.body ?? {}) as Eingabe;
    const b = request.benutzer!;
    const benutzerId = body.benutzerId || b.sub;
    if (benutzerId !== b.sub && !istVorsitz(b.rolle)) {
      return reply.status(403).send({ fehler: "Abwesenheiten anderer tragen nur Vorsitz und Stellvertretung ein" });
    }
    const werte = pruefen(body);
    if (typeof werte === "string") return reply.status(400).send({ fehler: werte });

    const person = await prisma.benutzer.findUnique({ where: { id: benutzerId }, select: { aktiv: true, rolle: true } });
    if (!person?.aktiv || person.rolle === Role.ADMIN) return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });

    const neu = await prisma.abwesenheit.create({
      data:   { benutzerId, ...werte, erfasstVonId: b.sub },
      select: { id: true, von: true, bis: true, grund: true },
    });
    return reply.status(201).send(neu);
  });

  // ── PUT /:id ────────────────────────────────────────────────────
  app.put("/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = request.benutzer!;
    const alt = await prisma.abwesenheit.findUnique({ where: { id }, select: { benutzerId: true } });
    if (!alt) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });
    if (alt.benutzerId !== b.sub && !istVorsitz(b.rolle)) return reply.status(403).send({ fehler: "Keine Berechtigung" });

    const werte = pruefen((request.body ?? {}) as Eingabe);
    if (typeof werte === "string") return reply.status(400).send({ fehler: werte });
    const neu = await prisma.abwesenheit.update({
      where:  { id },
      data:   werte,
      select: { id: true, von: true, bis: true, grund: true },
    });
    return reply.send(neu);
  });

  // ── DELETE /:id ─────────────────────────────────────────────────
  app.delete("/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = request.benutzer!;
    const alt = await prisma.abwesenheit.findUnique({ where: { id }, select: { benutzerId: true } });
    if (!alt) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });
    if (alt.benutzerId !== b.sub && !istVorsitz(b.rolle)) return reply.status(403).send({ fehler: "Keine Berechtigung" });
    await prisma.abwesenheit.delete({ where: { id } });
    return reply.send({ nachricht: "Abwesenheit gelöscht" });
  });
}

export async function verfuegbarkeitRouten(app: FastifyInstance): Promise<void> {

  app.get("/:id/verfuegbarkeit", { preHandler: [authenticate, erfordert(Role.MITGLIED)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const stand = await verfuegbarkeitErmitteln(id, request.benutzer!);
    if (!stand) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
    return reply.send(stand);
  });

  app.post("/:id/verfuegbarkeit/uebernehmen", { preHandler: [authenticate, erfordert(Role.MITGLIED)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
    if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
    if (sitzung.status !== SitzungStatus.ENTWURF && sitzung.status !== SitzungStatus.TAGESORDNUNG_FIXIERT) {
      return reply.status(409).send({ fehler: "Die Ladung lässt sich nur vor der Sitzung aus dem Kalender übernehmen" });
    }
    return reply.send(await kalenderUebernehmen(id, request.benutzer!));
  });
}
