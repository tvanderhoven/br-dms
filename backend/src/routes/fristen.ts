import { FastifyInstance } from "fastify";
import { FristStatus, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { FristenWorker } from "../workers/fristen.worker.js";

export async function fristenRouten(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { von?: string; bis?: string; status?: string } }>(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { von, bis, status } = request.query;
      const { rolle, sub } = request.benutzer;
      const isEingeschraenkt = rolle === Role.MITGLIED || rolle === Role.ERSATZMITGLIED;

      const fristen = await prisma.frist.findMany({
        where: {
          ...(status ? { status: status as FristStatus } : {}),
          ...(von || bis ? {
            faelligAm: {
              ...(von ? { gte: new Date(von) } : {}),
              ...(bis ? { lte: new Date(new Date(bis).setHours(23, 59, 59, 999)) } : {}),
            },
          } : {}),
          dokument: {
            status: { not: "GELOESCHT" },
            ...(isEingeschraenkt
              ? { OR: [{ vertraulich: false }, { hochgeladenVonId: sub }] }
              : {}),
          },
        },
        include: {
          dokument: {
            select: { id: true, titel: true, alias: true, kategorie: true, aktenzeichen: true },
          },
          erledigtVon: { select: { name: true } },
        },
        orderBy: { faelligAm: "asc" },
      });

      return reply.send(fristen);
    }
  );

  // ── DELETE /:id – einzelne Frist löschen (z.B. versehentlich falsche
  //                 Kündigungsart beim Upload gewählt) ─────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const frist = await prisma.frist.findUnique({ where: { id: request.params.id } });
      if (!frist) return reply.status(404).send({ fehler: "Frist nicht gefunden" });
      await prisma.frist.delete({ where: { id: request.params.id } });
      return reply.send({ ok: true });
    }
  );

  // ── POST /erinnerung-testen – Fristen-E-Mail sofort auslösen (Diagnose) ──
  app.post(
    "/erinnerung-testen",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request, reply) => {
      const ergebnis = await new FristenWorker().run();
      return reply.send(ergebnis);
    }
  );
}
