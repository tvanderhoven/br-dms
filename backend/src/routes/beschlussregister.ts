import { FastifyInstance } from "fastify";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

export async function beschlussRegisterRouten(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { sitzungId?: string; von?: string; bis?: string } }>(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { sitzungId, von, bis } = request.query;

      const beschluesse = await prisma.beschluss.findMany({
        where: {
          finalisiert: true,
          ...(sitzungId ? { top: { sitzungId } } : {}),
          ...(von || bis ? {
            finalisiertAm: {
              ...(von ? { gte: new Date(von) } : {}),
              ...(bis ? { lte: new Date(new Date(bis).setHours(23, 59, 59, 999)) } : {}),
            },
          } : {}),
        },
        include: {
          top: {
            select: {
              nummer: true,
              titel:  true,
              sitzung: {
                select: { id: true, titel: true, sitzungsdatum: true },
              },
            },
          },
          finalisiertVon: { select: { name: true } },
        },
        orderBy: { finalisiertAm: "desc" },
      });

      return reply.send(beschluesse);
    }
  );
}
