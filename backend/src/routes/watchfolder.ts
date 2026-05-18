import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";

export async function watchfolderRouten(app: FastifyInstance) {
  app.get("/log", { preHandler: authenticate }, async (_req, _reply) => {
    return prisma.auditLog.findMany({
      where: {
        aktion: { in: ["WATCHFOLDER_DATEI_EMPFANGEN", "WATCHFOLDER_FEHLER"] },
      },
      orderBy: { zeitpunkt: "desc" },
      take: 30,
      select: {
        id:        true,
        aktion:    true,
        details:   true,
        zeitpunkt: true,
      },
    });
  });
}
