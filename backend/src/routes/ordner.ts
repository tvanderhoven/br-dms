/**
 * Ordnerbaum für die Dokumentablage
 *
 * Ordner ergänzen die Kategorien: die Kategorie sagt, was ein Dokument ist
 * (und steuert Fristen, Aufbewahrung, Abläufe), der Ordner nur, wo es liegt.
 * Ordnernamen sind für alle sichtbar – vertrauliche Dokumente bleiben über
 * den Filter der Dokumentliste geschützt.
 *
 * GET    /api/ordner        – alle Ordner (flach, mit elternId)
 * POST   /api/ordner        – Ordner anlegen
 * PATCH  /api/ordner/:id    – umbenennen und/oder verschieben
 * DELETE /api/ordner/:id    – löschen, nur wenn leer
 */

import { FastifyInstance } from "fastify";
import { AuditAktion, DokumentStatus, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

const MAX_NAME = 100;

function nameBereinigen(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.trim().replace(/\s+/g, " ");
  if (!n || n.length > MAX_NAME || /[\/\\]/.test(n)) return null;
  return n;
}

/** Gibt es im selben Elternordner schon einen Ordner dieses Namens? */
async function nameVergeben(name: string, elternId: string | null, ausserId?: string): Promise<boolean> {
  const vorhanden = await prisma.ordner.findFirst({
    where: {
      elternId,
      name: { equals: name, mode: "insensitive" },
      ...(ausserId ? { id: { not: ausserId } } : {}),
    },
    select: { id: true },
  });
  return !!vorhanden;
}

/** Liegt `kandidatId` im Teilbaum von `ordnerId` (oder ist es selbst)? */
async function liegtUnter(kandidatId: string, ordnerId: string): Promise<boolean> {
  let aktuell: string | null = kandidatId;
  for (let tiefe = 0; aktuell && tiefe < 100; tiefe++) {
    if (aktuell === ordnerId) return true;
    const o: { elternId: string | null } | null =
      await prisma.ordner.findUnique({ where: { id: aktuell }, select: { elternId: true } });
    aktuell = o?.elternId ?? null;
  }
  return false;
}

export async function ordnerRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – alle Ordner ─────────────────────────────────────────
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (_request, reply) => {
      const ordner = await prisma.ordner.findMany({
        select: { id: true, name: true, elternId: true },
        orderBy: { name: "asc" },
      });
      return reply.send(ordner);
    }
  );

  // ── POST / – Ordner anlegen ─────────────────────────────────────
  app.post<{ Body: { name?: string; elternId?: string | null } }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const name = nameBereinigen(request.body?.name);
      if (!name) return reply.status(400).send({ fehler: `Name fehlt, ist länger als ${MAX_NAME} Zeichen oder enthält / bzw. \\` });

      const elternId = request.body?.elternId || null;
      if (elternId && !(await prisma.ordner.findUnique({ where: { id: elternId }, select: { id: true } }))) {
        return reply.status(404).send({ fehler: "Übergeordneter Ordner nicht gefunden" });
      }
      if (await nameVergeben(name, elternId)) {
        return reply.status(409).send({ fehler: `Hier gibt es schon einen Ordner „${name}“` });
      }

      const ordner = await prisma.ordner.create({
        data: { name, elternId, erstelltVonId: request.benutzer.sub },
        select: { id: true, name: true, elternId: true },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.ORDNER_ERSTELLT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: ordner.id, name, elternId },
        },
      });

      return reply.status(201).send(ordner);
    }
  );

  // ── PATCH /:id – umbenennen / verschieben ───────────────────────
  app.patch<{ Params: { id: string }; Body: { name?: string; elternId?: string | null } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const ordner = await prisma.ordner.findUnique({ where: { id: request.params.id } });
      if (!ordner) return reply.status(404).send({ fehler: "Ordner nicht gefunden" });

      const body = request.body ?? {};
      const name = "name" in body ? nameBereinigen(body.name) : ordner.name;
      if (!name) return reply.status(400).send({ fehler: `Name fehlt, ist länger als ${MAX_NAME} Zeichen oder enthält / bzw. \\` });

      const elternId = "elternId" in body ? (body.elternId || null) : ordner.elternId;
      if (elternId) {
        if (!(await prisma.ordner.findUnique({ where: { id: elternId }, select: { id: true } }))) {
          return reply.status(404).send({ fehler: "Zielordner nicht gefunden" });
        }
        if (await liegtUnter(elternId, ordner.id)) {
          return reply.status(400).send({ fehler: "Ein Ordner kann nicht in sich selbst oder einen seiner Unterordner verschoben werden" });
        }
      }
      if (await nameVergeben(name, elternId, ordner.id)) {
        return reply.status(409).send({ fehler: `Im Zielordner gibt es schon einen Ordner „${name}“` });
      }

      const aktualisiert = await prisma.ordner.update({
        where:  { id: ordner.id },
        data:   { name, elternId },
        select: { id: true, name: true, elternId: true },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.ORDNER_GEAENDERT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    {
            id: ordner.id,
            vorher:  { name: ordner.name, elternId: ordner.elternId },
            nachher: { name, elternId },
          },
        },
      });

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – nur leere Ordner ──────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const ordner = await prisma.ordner.findUnique({ where: { id: request.params.id } });
      if (!ordner) return reply.status(404).send({ fehler: "Ordner nicht gefunden" });

      // Endgültig gelöschte Dokumente zählen nicht – auch keine vertraulichen,
      // die der Benutzer nicht sieht: sonst verschwänden sie still aus dem Ordner
      const [unterordner, dokumente] = await Promise.all([
        prisma.ordner.count({ where: { elternId: ordner.id } }),
        prisma.dokument.count({ where: { ordnerId: ordner.id, status: { not: DokumentStatus.GELOESCHT } } }),
      ]);
      if (unterordner > 0 || dokumente > 0) {
        return reply.status(409).send({ fehler: "Nur leere Ordner können gelöscht werden – vorher Unterordner und Dokumente verschieben" });
      }

      await prisma.ordner.delete({ where: { id: ordner.id } });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.ORDNER_GELOESCHT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: ordner.id, name: ordner.name, elternId: ordner.elternId },
        },
      });

      return reply.send({ nachricht: "Ordner gelöscht" });
    }
  );
}
