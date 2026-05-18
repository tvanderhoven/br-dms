/**
 * JWT-Authentifizierungs-Hook für Fastify
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";

export interface JwtPayload {
  sub:   string;  // Benutzer-ID
  email: string;
  rolle: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    benutzer: JwtPayload;
  }
}

/** Hook: JWT verifizieren und Benutzer an Request anhängen */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const payload = await request.jwtVerify<JwtPayload>();

    // Benutzer noch aktiv?
    const benutzer = await prisma.benutzer.findUnique({
      where: { id: payload.sub },
      select: { id: true, aktiv: true, rolle: true, email: true },
    });

    if (!benutzer?.aktiv) {
      return reply.status(401).send({ fehler: "Konto deaktiviert" });
    }

    request.benutzer = { sub: benutzer.id, email: benutzer.email, rolle: benutzer.rolle };
  } catch {
    return reply.status(401).send({ fehler: "Nicht authentifiziert" });
  }
}
