import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Prisma, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

const VORLAGE_SELECT = {
  id:            true,
  name:          true,
  beschreibung:  true,
  erstelltAm:    true,
  aktualisiertAm: true,
  tops: {
    orderBy: { reihenfolge: "asc" as const },
    select: { id: true, titel: true, inhalt: true, inhaltsJson: true, reihenfolge: true },
  },
} as const;

export async function vorlagenRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Alle Vorlagen (nur VORSITZ/STELLVERTRETER – die einzigen,
  //           die Sitzungen anlegen und damit Vorlagen überhaupt nutzen können) ──
  app.get("/", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await prisma.sitzungsVorlage.findMany({
        select: VORLAGE_SELECT,
        orderBy: { name: "asc" },
      }));
    }
  );

  // ── POST / – Neue Vorlage ──────────────────────────────────────
  app.post("/", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name, beschreibung } = request.body as { name: string; beschreibung?: string };
      if (!name?.trim()) return reply.status(400).send({ fehler: "name ist Pflichtfeld" });
      const vorlage = await prisma.sitzungsVorlage.create({
        data: { name: name.trim(), beschreibung: beschreibung ?? null },
        select: VORLAGE_SELECT,
      });
      return reply.status(201).send(vorlage);
    }
  );

  // ── PATCH /:id – Vorlage umbenennen ───────────────────────────
  app.patch("/:id", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { name, beschreibung } = request.body as { name?: string; beschreibung?: string };
      const vorlage = await prisma.sitzungsVorlage.findUnique({ where: { id } });
      if (!vorlage) return reply.status(404).send({ fehler: "Vorlage nicht gefunden" });
      return reply.send(await prisma.sitzungsVorlage.update({
        where: { id },
        data: {
          ...(name ? { name: name.trim() } : {}),
          ...("beschreibung" in (request.body as object) ? { beschreibung: beschreibung ?? null } : {}),
        },
        select: VORLAGE_SELECT,
      }));
    }
  );

  // ── DELETE /:id – Vorlage löschen ─────────────────────────────
  app.delete("/:id", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const vorlage = await prisma.sitzungsVorlage.findUnique({ where: { id } });
      if (!vorlage) return reply.status(404).send({ fehler: "Vorlage nicht gefunden" });
      await prisma.sitzungsVorlage.delete({ where: { id } });
      return reply.send({ ok: true });
    }
  );

  // ── POST /:id/tops – TOP hinzufügen ───────────────────────────
  app.post("/:id/tops", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { titel, inhalt, inhaltsJson } = request.body as { titel: string; inhalt?: string; inhaltsJson?: object };
      if (!titel?.trim()) return reply.status(400).send({ fehler: "titel ist Pflichtfeld" });
      const vorlage = await prisma.sitzungsVorlage.findUnique({ where: { id } });
      if (!vorlage) return reply.status(404).send({ fehler: "Vorlage nicht gefunden" });
      const letzter = await prisma.vorlageTOP.findFirst({
        where: { vorlageId: id }, orderBy: { reihenfolge: "desc" },
      });
      const top = await prisma.vorlageTOP.create({
        data: { vorlageId: id, titel: titel.trim(), inhalt: inhalt ?? null, inhaltsJson: inhaltsJson != null ? (inhaltsJson as Prisma.InputJsonValue) : Prisma.DbNull, reihenfolge: (letzter?.reihenfolge ?? -1) + 1 },
        select: { id: true, titel: true, inhalt: true, inhaltsJson: true, reihenfolge: true },
      });
      return reply.status(201).send(top);
    }
  );

  // ── PATCH /:id/tops/:topId – TOP bearbeiten ───────────────────
  app.patch("/:id/tops/:topId", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { topId } = request.params as { id: string; topId: string };
      const { titel, inhalt, inhaltsJson, reihenfolge } = request.body as { titel?: string; inhalt?: string; inhaltsJson?: object | null; reihenfolge?: number };
      const top = await prisma.vorlageTOP.findUnique({ where: { id: topId } });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });
      return reply.send(await prisma.vorlageTOP.update({
        where: { id: topId },
        data: {
          ...(titel !== undefined ? { titel: titel.trim() } : {}),
          ...("inhalt" in (request.body as object) ? { inhalt: inhalt ?? null } : {}),
          ...("inhaltsJson" in (request.body as object) ? { inhaltsJson: inhaltsJson != null ? (inhaltsJson as Prisma.InputJsonValue) : Prisma.DbNull } : {}),
          ...(reihenfolge !== undefined ? { reihenfolge } : {}),
        },
        select: { id: true, titel: true, inhalt: true, inhaltsJson: true, reihenfolge: true },
      }));
    }
  );

  // ── DELETE /:id/tops/:topId – TOP entfernen ───────────────────
  app.delete("/:id/tops/:topId", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { topId } = request.params as { id: string; topId: string };
      const top = await prisma.vorlageTOP.findUnique({ where: { id: topId } });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });
      await prisma.vorlageTOP.delete({ where: { id: topId } });
      return reply.send({ ok: true });
    }
  );
}
