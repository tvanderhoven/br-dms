/**
 * Entgeltsystem der Eingruppierung (lib/entgelt.ts) – Stammdaten für
 * Einstellungen → System.
 *
 * GET    /api/entgelt              – Gruppen, Stufen, Vorlagen, belegte Nummern
 * POST   /api/entgelt/gruppen      – Gruppe anlegen (Nummer wird vergeben)
 * PUT    /api/entgelt/gruppen/:id  – Bezeichnung, Sortierung, aktiv, erlaubte Stufen
 * DELETE /api/entgelt/gruppen/:id  – nur wenn keine Eingruppierung darauf verweist
 * POST   /api/entgelt/stufen       – Stufe anlegen
 * PUT    /api/entgelt/stufen/:id   – Bezeichnung, Sortierung, aktiv
 * DELETE /api/entgelt/stufen/:id   – nur wenn unbenutzt; fällt auch aus den Gruppen-Listen
 * POST   /api/entgelt/vorlage      – Vorlage übernehmen (nur ohne bestehende Eingruppierungen)
 *
 * Lesen: alle Mitglieder (Auswahllisten). Ändern: Vorsitz/Stellvertretung –
 * eine geänderte Bezeichnung gilt rückwirkend für alle Einträge.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { EntgeltFehler, belegteNummern, ladeEntgeltsystem, vorlageUebernehmen } from "../lib/entgelt.js";
import { ENTGELT_VORLAGEN } from "../lib/entgeltVorlagen.js";

interface Eintrag {
  bezeichnung?: string;
  sortierung?:  number;
  aktiv?:       boolean;
  stufen?:      number[];
}

const doppelt = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function entgeltRouten(app: FastifyInstance): Promise<void> {
  const lesen    = { preHandler: [authenticate, erfordert(Role.MITGLIED)] };
  const schreiben = { preHandler: [authenticate, erfordert(Role.VORSITZ)] };

  app.get("/", lesen, async (_request: FastifyRequest, reply: FastifyReply) => {
    const [system, belegt] = await Promise.all([ladeEntgeltsystem(), belegteNummern()]);
    return reply.send({
      ...system,
      belegt,
      vorlagen: ENTGELT_VORLAGEN.map(({ schluessel, name, beschreibung, hinweis }) => ({ schluessel, name, beschreibung, hinweis: hinweis ?? null })),
    });
  });

  // ── Gruppen ────────────────────────────────────────────────────
  const stufenPruefen = async (stufen: unknown): Promise<string | null> => {
    if (stufen === undefined) return null;
    if (!Array.isArray(stufen) || !stufen.every(n => Number.isInteger(n))) return "stufen muss eine Liste von Stufen-Nummern sein";
    const vorhanden = new Set((await prisma.entgeltstufe.findMany({ select: { nummer: true } })).map(s => s.nummer));
    return stufen.every(n => vorhanden.has(n)) ? null : "Unbekannte Stufe in der Liste";
  };

  app.post<{ Body: Eintrag }>("/gruppen", schreiben, async (request, reply) => {
    const { bezeichnung, stufen } = request.body ?? {};
    if (!bezeichnung?.trim()) return reply.status(400).send({ fehler: "Bezeichnung ist Pflicht" });
    const fehler = await stufenPruefen(stufen);
    if (fehler) return reply.status(400).send({ fehler });
    await ladeEntgeltsystem();   // Standard anlegen, falls noch leer – sonst bekäme die neue Gruppe Nummer 1
    const max = await prisma.entgeltgruppe.aggregate({ _max: { nummer: true, sortierung: true } });
    try {
      const gruppe = await prisma.entgeltgruppe.create({
        data: {
          bezeichnung: bezeichnung.trim(),
          nummer:      (max._max.nummer ?? 0) + 1,
          sortierung:  (max._max.sortierung ?? -1) + 1,
          stufen:      [...new Set(stufen ?? [])].sort((a, b) => a - b),
        },
      });
      return reply.status(201).send(gruppe);
    } catch (e) {
      if (doppelt(e)) return reply.status(409).send({ fehler: "Diese Gruppe gibt es schon" });
      throw e;
    }
  });

  app.put<{ Params: { id: string }; Body: Eintrag }>("/gruppen/:id", schreiben, async (request, reply) => {
    const { bezeichnung, sortierung, aktiv, stufen } = request.body ?? {};
    if (bezeichnung !== undefined && !bezeichnung.trim()) return reply.status(400).send({ fehler: "Bezeichnung darf nicht leer sein" });
    const fehler = await stufenPruefen(stufen);
    if (fehler) return reply.status(400).send({ fehler });
    try {
      const gruppe = await prisma.entgeltgruppe.update({
        where: { id: request.params.id },
        data: {
          ...(bezeichnung !== undefined ? { bezeichnung: bezeichnung.trim() } : {}),
          ...(Number.isInteger(sortierung) ? { sortierung } : {}),
          ...(typeof aktiv === "boolean" ? { aktiv } : {}),
          ...(stufen !== undefined ? { stufen: [...new Set(stufen)].sort((a, b) => a - b) } : {}),
        },
      });
      return reply.send(gruppe);
    } catch (e) {
      if (doppelt(e)) return reply.status(409).send({ fehler: "Diese Gruppe gibt es schon" });
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return reply.status(404).send({ fehler: "Gruppe nicht gefunden" });
      throw e;
    }
  });

  app.delete<{ Params: { id: string } }>("/gruppen/:id", schreiben, async (request, reply) => {
    const gruppe = await prisma.entgeltgruppe.findUnique({ where: { id: request.params.id } });
    if (!gruppe) return reply.status(404).send({ fehler: "Gruppe nicht gefunden" });
    const benutzt = await prisma.gehaltsstufenEintrag.count({ where: { gruppe: gruppe.nummer } });
    if (benutzt > 0) return reply.status(409).send({ fehler: `${gruppe.bezeichnung} ist in ${benutzt} Eingruppierung(en) eingetragen – bitte deaktivieren statt löschen` });
    await prisma.entgeltgruppe.delete({ where: { id: gruppe.id } });
    return reply.send({ ok: true });
  });

  // ── Stufen ─────────────────────────────────────────────────────
  app.post<{ Body: Eintrag }>("/stufen", schreiben, async (request, reply) => {
    const { bezeichnung } = request.body ?? {};
    if (!bezeichnung?.trim()) return reply.status(400).send({ fehler: "Bezeichnung ist Pflicht" });
    await ladeEntgeltsystem();
    const max = await prisma.entgeltstufe.aggregate({ _max: { nummer: true, sortierung: true } });
    try {
      const stufe = await prisma.entgeltstufe.create({
        data: { bezeichnung: bezeichnung.trim(), nummer: (max._max.nummer ?? 0) + 1, sortierung: (max._max.sortierung ?? -1) + 1 },
      });
      return reply.status(201).send(stufe);
    } catch (e) {
      if (doppelt(e)) return reply.status(409).send({ fehler: "Diese Stufe gibt es schon" });
      throw e;
    }
  });

  app.put<{ Params: { id: string }; Body: Eintrag }>("/stufen/:id", schreiben, async (request, reply) => {
    const { bezeichnung, sortierung, aktiv } = request.body ?? {};
    if (bezeichnung !== undefined && !bezeichnung.trim()) return reply.status(400).send({ fehler: "Bezeichnung darf nicht leer sein" });
    try {
      const stufe = await prisma.entgeltstufe.update({
        where: { id: request.params.id },
        data: {
          ...(bezeichnung !== undefined ? { bezeichnung: bezeichnung.trim() } : {}),
          ...(Number.isInteger(sortierung) ? { sortierung } : {}),
          ...(typeof aktiv === "boolean" ? { aktiv } : {}),
        },
      });
      return reply.send(stufe);
    } catch (e) {
      if (doppelt(e)) return reply.status(409).send({ fehler: "Diese Stufe gibt es schon" });
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return reply.status(404).send({ fehler: "Stufe nicht gefunden" });
      throw e;
    }
  });

  app.delete<{ Params: { id: string } }>("/stufen/:id", schreiben, async (request, reply) => {
    const stufe = await prisma.entgeltstufe.findUnique({ where: { id: request.params.id } });
    if (!stufe) return reply.status(404).send({ fehler: "Stufe nicht gefunden" });
    const benutzt = await prisma.gehaltsstufenEintrag.count({ where: { stufe: stufe.nummer } });
    if (benutzt > 0) return reply.status(409).send({ fehler: `${stufe.bezeichnung} ist in ${benutzt} Eingruppierung(en) eingetragen – bitte deaktivieren statt löschen` });
    await prisma.$transaction(async tx => {
      // aus den "erlaubten Stufen" der Gruppen entfernen
      for (const g of await tx.entgeltgruppe.findMany({ where: { stufen: { has: stufe.nummer } } })) {
        await tx.entgeltgruppe.update({ where: { id: g.id }, data: { stufen: g.stufen.filter(n => n !== stufe.nummer) } });
      }
      await tx.entgeltstufe.delete({ where: { id: stufe.id } });
    });
    return reply.send({ ok: true });
  });

  // ── Vorlage übernehmen ─────────────────────────────────────────
  app.post<{ Body: { schluessel?: string } }>("/vorlage", schreiben, async (request, reply) => {
    try {
      return reply.send(await vorlageUebernehmen(request.body?.schluessel ?? ""));
    } catch (e) {
      if (e instanceof EntgeltFehler) return reply.status(409).send({ fehler: e.message });
      throw e;
    }
  });
}
