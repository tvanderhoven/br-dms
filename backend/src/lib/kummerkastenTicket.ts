/**
 * Kummerkasten-Ticket-Codes: der anonyme Rückkanal.
 *
 * Wer ein Anliegen einreicht, bekommt einmalig einen 6-stelligen Code und kann
 * damit – ohne Login, ohne E-Mail – Status und Antwort des BR abrufen. Der Code
 * ist das einzige Zugangsmerkmal, deshalb:
 *
 *  - Alphabet ohne 0/O, 1/I/L – die Codes werden notiert und abgetippt.
 *  - Gespeichert wird nur ein HMAC mit ENCRYPTION_KEY als Schlüssel. Ein reiner
 *    SHA-256 wäre bei nur ~900 Mio. möglichen Codes in Sekunden offline durch-
 *    probierbar, sobald jemand die Datenbank oder ein Backup in die Finger
 *    bekommt; ohne den Schlüssel aus der Umgebung geht das nicht.
 *  - Online-Raten fängt das Rate-Limit der Abruf-Route ab (routes/kummerkasten.ts).
 */

import { createHmac, randomInt } from "node:crypto";

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LAENGE = 6;

export function neuerTicketCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LAENGE; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Tolerant gegen Abtippen: Kleinschreibung, Bindestriche und Leerzeichen sind egal. */
export function codeNormalisieren(eingabe: string): string {
  return eingabe.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function ticketHash(code: string): string {
  return createHmac("sha256", process.env.ENCRYPTION_KEY ?? "")
    .update(codeNormalisieren(code))
    .digest("hex");
}

/** Anzeigeform mit Trenner: "K7F3XH" → "K7F-3XH" (gespeichert wird ohne). */
export function codeAnzeige(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
