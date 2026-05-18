import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

const BENUTZER_SELECT = { id: true, name: true, email: true };

export async function ressourcenRouten(app: FastifyInstance): Promise<void> {

  // GET /api/ressourcen
  app.get("/", { preHandler: [authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await prisma.ressource.findMany({
        orderBy: { erstelltAm: "desc" },
        include: { erstelltVon: { select: BENUTZER_SELECT } },
      }));
    }
  );

  // POST /api/ressourcen
  app.post("/", { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { titel, url, beschreibung, kategorie, tags } = request.body as {
        titel: string;
        url: string;
        beschreibung?: string;
        kategorie?: string;
        tags?: string[];
      };

      if (!titel?.trim()) return reply.status(400).send({ fehler: "titel ist ein Pflichtfeld" });
      if (!url?.trim())   return reply.status(400).send({ fehler: "url ist ein Pflichtfeld" });

      const ressource = await prisma.ressource.create({
        data: {
          titel:        titel.trim(),
          url:          url.trim(),
          beschreibung: beschreibung?.trim() ?? null,
          kategorie:    kategorie ?? "SONSTIGES",
          tags:         tags ?? [],
          erstelltVonId: request.benutzer.sub,
        },
        include: { erstelltVon: { select: BENUTZER_SELECT } },
      });

      return reply.status(201).send(ressource);
    }
  );

  // PATCH /api/ressourcen/:id
  app.patch<{ Params: { id: string } }>(
    "/:id", { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const { titel, url, beschreibung, kategorie, tags } = request.body as {
        titel?: string; url?: string; beschreibung?: string;
        kategorie?: string; tags?: string[];
      };

      const vorhandene = await prisma.ressource.findUnique({ where: { id } });
      if (!vorhandene) return reply.status(404).send({ fehler: "Ressource nicht gefunden" });

      const data: Record<string, unknown> = {};
      if (titel        !== undefined) data.titel        = titel.trim();
      if (url          !== undefined) data.url          = url.trim();
      if (beschreibung !== undefined) data.beschreibung = beschreibung?.trim() ?? null;
      if (kategorie    !== undefined) data.kategorie    = kategorie;
      if (tags         !== undefined) data.tags         = tags;

      const aktualisiert = await prisma.ressource.update({
        where: { id }, data,
        include: { erstelltVon: { select: BENUTZER_SELECT } },
      });

      return reply.send(aktualisiert);
    }
  );

  // DELETE /api/ressourcen/:id  (nur VORSITZ+)
  app.delete<{ Params: { id: string } }>(
    "/:id", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;
      const vorhandene = await prisma.ressource.findUnique({ where: { id } });
      if (!vorhandene) return reply.status(404).send({ fehler: "Ressource nicht gefunden" });

      await prisma.ressource.delete({ where: { id } });
      return reply.send({ ok: true });
    }
  );
}
