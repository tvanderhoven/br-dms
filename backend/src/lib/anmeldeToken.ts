/**
 * Anmelde-Tokens ausstellen – an einer Stelle, damit "tv" (Token-Version,
 * siehe middleware/auth.ts) nirgends vergessen wird.
 */

import { FastifyReply, FastifyRequest } from "fastify";
import { Role } from "@prisma/client";

interface TokenBenutzer { id: string; email: string; rolle: Role; tokenVersion: number }

export const STANDARD_LAUFZEIT = () => process.env.JWT_EXPIRES_IN ?? "24h";

export function anmeldeToken(reply: FastifyReply, b: TokenBenutzer, laufzeit: string): Promise<string> {
  return reply.jwtSign({ sub: b.id, email: b.email, rolle: b.rolle, tv: b.tokenVersion }, { expiresIn: laufzeit });
}

/** Neuer Token mit derselben Restlaufzeit wie der aktuelle (nach Passwortwechsel u. ä.) */
export async function anmeldeTokenErneuern(request: FastifyRequest, reply: FastifyReply, b: TokenBenutzer): Promise<string> {
  const { exp } = await request.jwtVerify<{ exp: number }>();
  const restSekunden = Math.max(60, exp - Math.floor(Date.now() / 1000));
  return anmeldeToken(reply, b, `${restSekunden}s`);
}

/**
 * Kurzlebiger Zwischen-Token nach richtigem Passwort, solange der zweite Faktor
 * fehlt. Trägt "zweck" – authenticate() weist solche Tokens ab, sie öffnen nur
 * die Login-Schritte für den Code bzw. das Einrichten.
 */
export type Zweck = "zweiter-faktor" | "einrichten";

export function zwischenToken(reply: FastifyReply, b: TokenBenutzer, zweck: Zweck, eingeloggtBleiben: boolean): Promise<string> {
  return reply.jwtSign(
    { sub: b.id, email: b.email, rolle: b.rolle, tv: b.tokenVersion, zweck, bleiben: eingeloggtBleiben },
    { expiresIn: "10m" },
  );
}
