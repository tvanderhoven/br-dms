import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Prisma, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { AuditAktion } from "@prisma/client";

const BENUTZER_SELECT = { id: true, name: true, email: true };

async function auditLog(
  benutzerId: string,
  aktion: AuditAktion,
  wissensEintragId: string,
  req: FastifyRequest
) {
  await prisma.auditLog.create({
    data: {
      benutzerId,
      aktion,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      wissensEintragId,
    },
  }).catch(() => {});
}

export async function wissenRouten(app: FastifyInstance): Promise<void> {

  app.get("/", { preHandler: [authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await prisma.wissensEintrag.findMany({
        orderBy: { erstelltAm: "desc" },
        include: { erstelltVon: { select: BENUTZER_SELECT } },
      }));
    }
  );

  app.get<{ Querystring: { q?: string } }>(
    "/suche",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { q } = request.query as { q?: string };
      if (!q || q.trim().length < 2) {
        return reply.send(await prisma.wissensEintrag.findMany({
          orderBy: { erstelltAm: "desc" },
          include: { erstelltVon: { select: BENUTZER_SELECT } },
          take: 20,
        }));
      }
      const such = q.trim();
      return reply.send(await prisma.wissensEintrag.findMany({
        where: {
          OR: [
            { titel:       { contains: such, mode: "insensitive" } },
            { inhalt:      { contains: such, mode: "insensitive" } },
            { kategorien:  { has: such } },
            { loesung:     { contains: such, mode: "insensitive" } },
          ],
        },
        orderBy: { erstelltAm: "desc" },
        include: { erstelltVon: { select: BENUTZER_SELECT } },
      }));
    }
  );

  app.post("/", { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { titel, inhalt, inhaltJson, kategorien, loesung, loesungJson, herkunft, quelle } = request.body as {
        titel: string;
        inhalt: string;
        inhaltJson?: object;
        kategorien?: string[];
        loesung?: string;
        loesungJson?: object;
        herkunft?: string;
        quelle?: object;
      };

      if (!titel?.trim() || !inhalt?.trim()) {
        return reply.status(400).send({ fehler: "titel und inhalt sind Pflichtfelder" });
      }

      const eintrag = await prisma.wissensEintrag.create({
        data: {
          titel: titel.trim(),
          inhalt: inhalt.trim(),
          inhaltJson: inhaltJson != null ? (inhaltJson as Prisma.InputJsonValue) : undefined,
          kategorien: kategorien ?? [],
          loesung: loesung ?? null,
          loesungJson: loesungJson != null ? (loesungJson as Prisma.InputJsonValue) : undefined,
          herkunft: herkunft ?? "MANUELL",
          quelle: quelle ?? undefined,
          erstelltVonId: request.benutzer.sub,
        },
        include: { erstelltVon: { select: BENUTZER_SELECT } },
      });

      await auditLog(request.benutzer.sub, AuditAktion.WISSEN_ERSTELLT, eintrag.id, request);
      return reply.status(201).send(eintrag);
    }
  );

  app.patch<{ Params: { id: string }; Body: {
    titel?: string;
    inhalt?: string;
    inhaltJson?: object | null;
    kategorien?: string[];
    loesung?: string;
    loesungJson?: object | null;
  } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const { titel, inhalt, inhaltJson, kategorien, loesung, loesungJson } = request.body;

      const eintrag = await prisma.wissensEintrag.findUnique({ where: { id } });
      if (!eintrag) return reply.status(404).send({ fehler: "Wissenseintrag nicht gefunden" });

      const data: Record<string, unknown> = {};
      if (titel       !== undefined) data.titel       = titel.trim();
      if (inhalt      !== undefined) data.inhalt      = inhalt.trim();
      if (inhaltJson  !== undefined) data.inhaltJson  = inhaltJson != null ? (inhaltJson as Prisma.InputJsonValue) : Prisma.DbNull;
      if (kategorien  !== undefined) data.kategorien  = kategorien;
      if (loesung     !== undefined) data.loesung     = loesung ?? null;
      if (loesungJson !== undefined) data.loesungJson = loesungJson != null ? (loesungJson as Prisma.InputJsonValue) : Prisma.DbNull;

      const aktualisiert = await prisma.wissensEintrag.update({
        where: { id },
        data,
        include: { erstelltVon: { select: BENUTZER_SELECT } },
      });

      await auditLog(request.benutzer.sub, AuditAktion.WISSEN_AKTUALISIERT, id, request);
      return reply.send(aktualisiert);
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;
      const eintrag = await prisma.wissensEintrag.findUnique({ where: { id } });
      if (!eintrag) return reply.status(404).send({ fehler: "Wissenseintrag nicht gefunden" });

      await auditLog(request.benutzer.sub, AuditAktion.WISSEN_GELOESCHT, id, request);
      await prisma.wissensEintrag.delete({ where: { id } });
      return reply.send({ ok: true });
    }
  );
}
