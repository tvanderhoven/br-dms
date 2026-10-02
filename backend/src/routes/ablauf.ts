import { FastifyInstance } from "fastify";
import { Role } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { AblaufWorker } from "../workers/ablauf.worker.js";

export async function ablaufRouten(app: FastifyInstance): Promise<void> {
  // ── POST /testen – Zeitmodell/Überstunden-Ablaufmail sofort auslösen (Diagnose) ──
  app.post(
    "/testen",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request, reply) => {
      const ergebnis = await new AblaufWorker().run();
      return reply.send(ergebnis);
    }
  );
}
