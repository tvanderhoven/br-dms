/**
 * Gäste je TOP ohne Konto (Roadmap Paket 5): Arbeitgeber (§ 29 Abs. 4), Gewerkschaft (§ 31),
 * Sachverständige (§ 80 Abs. 3), Auskunftspersonen (§ 80 Abs. 2 S. 4)
 *
 * POST   /api/sitzungen/:id/tops/:topId/gaeste               – Gast eintragen (VORSITZ)
 * PATCH  /api/sitzungen/:id/tops/:topId/gaeste/:gid          – ändern, im Protokoll „erschienen“ (MITGLIED)
 * DELETE /api/sitzungen/:id/tops/:topId/gaeste/:gid          – entfernen (VORSITZ)
 * POST   /api/sitzungen/:id/tops/:topId/gaeste/:gid/einladen – Mail mit Termin und nur diesem TOP (VORSITZ)
 *
 * Gäste bekommen kein Login. Sie hängen am TOP: Wer den TOP nicht sieht (JAV/SBV bei vertraulichen
 * TOPs, Externe bei „Externe verlässt den Raum“), sieht auch seine Gäste nicht (routes/sitzungen.ts).
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuditAktion, GastFunktion, Role, SitzungStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { istEmailAdresse } from "../lib/emailAdresse.js";
import { topZugriffPruefen } from "../lib/vertraulich.js";
import { kalenderDatei } from "../lib/kalender.js";
import { titelInEinladung } from "../lib/einladungDetail.js";
import { sendeGastEinladung } from "../lib/mailer.js";
import { signaturText } from "../lib/signaturen.js";

const ABGESCHLOSSEN: SitzungStatus[] = [SitzungStatus.PROTOKOLL_FINAL, SitzungStatus.ABGESCHLOSSEN, SitzungStatus.ABGESAGT];

const GAST_SELECT = { id: true, name: true, funktion: true, organisation: true, email: true, anwesend: true, eingeladenAm: true } as const;

const ROLLE_LABEL: Record<string, string> = { VORSITZ: "Vorsitz", STELLVERTRETER: "Stellv. Vorsitz" };

interface GastEingabe {
  name?:         string;
  funktion?:     GastFunktion;
  organisation?: string | null;
  email?:        string | null;
  anwesend?:     boolean;
}

const istFunktion = (w: unknown): w is GastFunktion =>
  typeof w === "string" && (Object.values(GastFunktion) as string[]).includes(w);

/** Eingaben prüfen und bereinigen – Fehlertext oder die Daten fürs Speichern */
function gastDaten(b: GastEingabe, neu: boolean): string | GastEingabe {
  const d: GastEingabe = {};
  if (neu || b.name !== undefined) {
    const name = b.name?.trim();
    if (!name) return "Name ist ein Pflichtfeld";
    d.name = name.slice(0, 200);
  }
  if (neu || b.funktion !== undefined) {
    if (!istFunktion(b.funktion)) return "Unbekannte Funktion";
    d.funktion = b.funktion;
  }
  if (b.organisation !== undefined) d.organisation = b.organisation?.trim().slice(0, 200) || null;
  if (b.email !== undefined) {
    const email = b.email?.trim() || null;
    if (email && !istEmailAdresse(email)) return "Ungültige E-Mail-Adresse";
    d.email = email;
  }
  if (b.anwesend !== undefined) d.anwesend = !!b.anwesend;
  return d;
}

/** TOP gehört zur Sitzung, Sitzung noch offen? Sonst Antwort gesendet und null */
async function topPruefen(sitzungId: string, topId: string, reply: FastifyReply) {
  const top = await prisma.tOP.findFirst({
    where:  { id: topId, sitzungId },
    select: {
      nummer: true, titel: true, einladungTitel: true,
      sitzung: { select: { titel: true, sitzungsdatum: true, ort: true, status: true } },
    },
  });
  if (!top) { reply.status(404).send({ fehler: "TOP nicht gefunden" }); return null; }
  if (ABGESCHLOSSEN.includes(top.sitzung.status)) {
    reply.status(409).send({ fehler: "Das Protokoll ist abgeschlossen – Gäste lassen sich nicht mehr ändern" });
    return null;
  }
  return top;
}

async function audit(request: FastifyRequest, sitzungId: string, aktion: AuditAktion, details: object) {
  await prisma.auditLog.create({
    data: {
      benutzerId: request.benutzer.sub, sitzungId, aktion,
      ip: request.ip, userAgent: request.headers["user-agent"] ?? null,
      details: JSON.parse(JSON.stringify(details)),
    },
  }).catch(() => {});
}

type Params = { id: string; topId: string; gid: string };

export async function gaesteRouten(app: FastifyInstance): Promise<void> {

  // ── POST /:id/tops/:topId/gaeste ─────────────────────────────────
  app.post<{ Params: Omit<Params, "gid">; Body: GastEingabe }>(
    "/:id/tops/:topId/gaeste",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id, topId } = request.params;
      if (!(await topPruefen(id, topId, reply))) return;
      const daten = gastDaten(request.body ?? {}, true);
      if (typeof daten === "string") return reply.status(400).send({ fehler: daten });

      const gast = await prisma.topGast.create({
        data:   { ...daten, name: daten.name!, funktion: daten.funktion!, topId },
        select: GAST_SELECT,
      });
      await audit(request, id, AuditAktion.SITZUNG_AKTUALISIERT, { gastEingetragen: gast.id, topId, funktion: gast.funktion });
      return reply.status(201).send(gast);
    }
  );

  // ── PATCH /:id/tops/:topId/gaeste/:gid ───────────────────────────
  app.patch<{ Params: Params; Body: GastEingabe }>(
    "/:id/tops/:topId/gaeste/:gid",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const { id, topId, gid } = request.params;
      if (!(await topPruefen(id, topId, reply))) return;
      // Externe Protokollführung: nur TOPs, die sie sehen darf (middleware/auth.ts lässt PATCH durch)
      if (!(await topZugriffPruefen(topId, request.benutzer.rolle, reply))) return;
      const vorhanden = await prisma.topGast.findFirst({ where: { id: gid, topId }, select: { id: true } });
      if (!vorhanden) return reply.status(404).send({ fehler: "Gast nicht gefunden" });
      const daten = gastDaten(request.body ?? {}, false);
      if (typeof daten === "string") return reply.status(400).send({ fehler: daten });

      const gast = await prisma.topGast.update({ where: { id: gid }, data: daten, select: GAST_SELECT });
      await audit(request, id, AuditAktion.SITZUNG_AKTUALISIERT, { gastGeaendert: gid, topId });
      return reply.send(gast);
    }
  );

  // ── DELETE /:id/tops/:topId/gaeste/:gid ──────────────────────────
  app.delete<{ Params: Params }>(
    "/:id/tops/:topId/gaeste/:gid",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id, topId, gid } = request.params;
      if (!(await topPruefen(id, topId, reply))) return;
      const { count } = await prisma.topGast.deleteMany({ where: { id: gid, topId } });
      if (count === 0) return reply.status(404).send({ fehler: "Gast nicht gefunden" });
      await audit(request, id, AuditAktion.SITZUNG_AKTUALISIERT, { gastEntfernt: gid, topId });
      return reply.send({ nachricht: "Gast entfernt" });
    }
  );

  // ── POST /:id/tops/:topId/gaeste/:gid/einladen ───────────────────
  app.post<{ Params: Params; Body: { zusatz?: string; signaturId?: string } }>(
    "/:id/tops/:topId/gaeste/:gid/einladen",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id, topId, gid } = request.params;
      if (!process.env.SMTP_HOST) {
        return reply.status(409).send({ fehler: "Es ist kein Mailserver eingerichtet (SMTP_HOST in der .env)" });
      }
      const top = await topPruefen(id, topId, reply);
      if (!top) return;
      if (top.sitzung.status !== SitzungStatus.ENTWURF && top.sitzung.status !== SitzungStatus.TAGESORDNUNG_FIXIERT) {
        return reply.status(409).send({ fehler: "Die Sitzung hat bereits stattgefunden" });
      }
      const gast = await prisma.topGast.findFirst({ where: { id: gid, topId }, select: { name: true, email: true } });
      if (!gast) return reply.status(404).send({ fehler: "Gast nicht gefunden" });
      if (!gast.email) return reply.status(400).send({ fehler: "Für diesen Gast ist keine E-Mail-Adresse eingetragen" });

      const ich = await prisma.benutzer.findUnique({ where: { id: request.benutzer.sub }, select: { name: true, rolle: true } });
      const unterschrift = ich ? `${ich.name}, ${ROLLE_LABEL[ich.rolle] ?? "Betriebsrat"}` : "Der Betriebsrat";
      const signatur = await signaturText("gast", request.body?.signaturId);
      // Neutraler Titel, falls gesetzt – die Mail geht an ein fremdes Postfach
      const topTitel = titelInEinladung(top);

      try {
        await sendeGastEinladung({
          an:            gast.email,
          name:          gast.name,
          sitzungTitel:  top.sitzung.titel,
          sitzungsdatum: top.sitzung.sitzungsdatum,
          ort:           top.sitzung.ort,
          top:           { nummer: top.nummer, titel: topTitel },
          kalender: {
            dateiname: "Termin.ics",
            inhalt: kalenderDatei({
              uid:          `gast-${gid}@br-dms`,
              sequenz:      0,
              titel:        `Betriebsrat – TOP ${top.nummer}: ${topTitel}`,
              beginn:       top.sitzung.sitzungsdatum,
              ort:          top.sitzung.ort,
              beschreibung: `TOP ${top.nummer}: ${topTitel}`,
            }),
          },
          unterschrift,
          zusatz:   request.body?.zusatz?.trim().slice(0, 4000) || null,
          signatur,
        });
      } catch (err) {
        return reply.status(502).send({ fehler: `Mail konnte nicht gesendet werden: ${err instanceof Error ? err.message : String(err)}` });
      }

      const aktualisiert = await prisma.topGast.update({ where: { id: gid }, data: { eingeladenAm: new Date() }, select: GAST_SELECT });
      await audit(request, id, AuditAktion.NACHRICHT_GESENDET, { gastEingeladen: gid, topId });
      return reply.send(aktualisiert);
    }
  );
}
