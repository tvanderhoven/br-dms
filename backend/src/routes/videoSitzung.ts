/**
 * Sitzung per Video/Telefon (§ 30 Abs. 2 BetrVG, Roadmap Paket 6) – Regeln in lib/videoSitzung.ts
 *
 * GET    /api/sitzungen/:id/video                – Form, Regeln der Geschäftsordnung, Widerspruchsstand,
 *                                                  eigene Teilnahme und (Vorsitz) die Bestätigungen
 * POST   /api/sitzungen/:id/widerspruch          – der Zuschaltung widersprechen (Mitglieder, geladene Ersatzmitglieder)
 * DELETE /api/sitzungen/:id/widerspruch          – eigenen Widerspruch zurücknehmen (bis Fristende)
 * POST   /api/sitzungen/:id/teilnahme-bestaetigen – eigene Teilnahme per Video/Telefon bestätigen (§ 34 Abs. 1)
 *
 * Form, Einwahllink und Widerspruchsfrist setzt der Vorsitz über PATCH /api/sitzungen/:id.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AnwesenheitsStatus, AuditAktion, Role, SitzungForm, SitzungStatus, Teilnahmeart } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { benachrichtigen, sitzungLink } from "../lib/benachrichtigung.js";
import {
  darfWidersprechen, istZugeschaltet, ortszeitJetzt, videoRegeln, widerspruchStand,
} from "../lib/videoSitzung.js";

const VOR_DER_SITZUNG: SitzungStatus[] = [SitzungStatus.ENTWURF, SitzungStatus.TAGESORDNUNG_FIXIERT];

async function audit(request: FastifyRequest, sitzungId: string, details: object) {
  await prisma.auditLog.create({
    data: {
      benutzerId: request.benutzer.sub,
      sitzungId,
      aktion:     AuditAktion.SITZUNG_AKTUALISIERT,
      ip:         request.ip,
      userAgent:  request.headers["user-agent"] ?? null,
      details:    JSON.parse(JSON.stringify(details)),
    },
  }).catch(() => {});
}

/** Widerspruch noch möglich? null = ja, sonst der Grund */
function widerspruchGeschlossen(s: { form: SitzungForm; status: SitzungStatus; widerspruchBis: Date | null }): string | null {
  if (s.form === SitzungForm.PRAESENZ) return "Die Sitzung ist als Präsenzsitzung angesetzt";
  if (!VOR_DER_SITZUNG.includes(s.status)) return "Die Sitzung hat bereits stattgefunden";
  if (s.widerspruchBis && ortszeitJetzt() > s.widerspruchBis) return "Die Widerspruchsfrist ist abgelaufen";
  return null;
}

export async function videoSitzungRouten(app: FastifyInstance): Promise<void> {

  // ── GET /:id/video ───────────────────────────────────────────────
  app.get(
    "/:id/video",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({
        where:  { id },
        select: { form: true, einwahlLink: true, widerspruchBis: true, status: true },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      const { sub, rolle } = request.benutzer;
      const vorsitz = rolle === Role.VORSITZ || rolle === Role.STELLVERTRETER;
      const [regeln, stand, eigener, meine, widersprueche, zugeschaltete, darf] = await Promise.all([
        videoRegeln(),
        widerspruchStand(id),
        prisma.sitzungWiderspruch.findUnique({ where: { sitzungId_benutzerId: { sitzungId: id, benutzerId: sub } }, select: { erstelltAm: true } }),
        prisma.anwesenheit.findUnique({
          where:  { sitzungId_benutzerId: { sitzungId: id, benutzerId: sub } },
          select: { status: true, teilnahmeart: true, teilnahmeBestaetigtAm: true },
        }),
        // Wer widersprochen hat, sieht nur der Vorsitz – der Widerspruch geht „gegenüber dem Vorsitzenden“
        vorsitz
          ? prisma.sitzungWiderspruch.findMany({ where: { sitzungId: id }, orderBy: { erstelltAm: "asc" }, select: { erstelltAm: true, benutzer: { select: { name: true } } } })
          : Promise.resolve([]),
        vorsitz
          ? prisma.anwesenheit.findMany({
              where:   { sitzungId: id, teilnahmeart: { not: Teilnahmeart.VOR_ORT }, status: { in: [AnwesenheitsStatus.ANWESEND, AnwesenheitsStatus.ERSATZ_FUER] } },
              orderBy: { benutzer: { name: "asc" } },
              select:  { teilnahmeart: true, teilnahmeBestaetigtAm: true, benutzer: { select: { name: true } } },
            })
          : Promise.resolve([]),
        darfWidersprechen(id, request.benutzer),
      ]);

      const anwesend = meine && (meine.status === AnwesenheitsStatus.ANWESEND || meine.status === AnwesenheitsStatus.ERSATZ_FUER);
      return reply.send({
        form:           sitzung.form,
        einwahlLink:    sitzung.einwahlLink,
        widerspruchBis: sitzung.widerspruchBis,
        regeln,
        widerspruch: {
          ...stand,
          offen:        widerspruchGeschlossen(sitzung) === null,
          darf,
          eigenerAm:    eigener?.erstelltAm ?? null,
          namen:        widersprueche.map(w => ({ name: w.benutzer.name, am: w.erstelltAm })),
        },
        meineTeilnahme: anwesend && istZugeschaltet(meine.teilnahmeart)
          ? { teilnahmeart: meine.teilnahmeart, bestaetigtAm: meine.teilnahmeBestaetigtAm }
          : null,
        bestaetigungen: zugeschaltete.map(z => ({ name: z.benutzer.name, teilnahmeart: z.teilnahmeart, bestaetigtAm: z.teilnahmeBestaetigtAm })),
      });
    }
  );

  // ── POST /:id/widerspruch ────────────────────────────────────────
  app.post(
    "/:id/widerspruch",
    { preHandler: [authenticate, erfordert(Role.ERSATZMITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({
        where:  { id },
        select: { titel: true, form: true, status: true, widerspruchBis: true },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      if (!(await darfWidersprechen(id, request.benutzer))) {
        return reply.status(403).send({ fehler: "Widersprechen können nur Mitglieder des Betriebsrats und geladene Ersatzmitglieder" });
      }
      const grund = widerspruchGeschlossen(sitzung);
      if (grund) return reply.status(409).send({ fehler: grund });

      const vorher = await widerspruchStand(id);
      await prisma.sitzungWiderspruch.upsert({
        where:  { sitzungId_benutzerId: { sitzungId: id, benutzerId: request.benutzer.sub } },
        update: {},
        create: { sitzungId: id, benutzerId: request.benutzer.sub },
      });
      const stand = await widerspruchStand(id);
      await audit(request, id, { videoWiderspruch: true, anzahl: stand.anzahl, schwelle: stand.schwelle });

      const vorsitzIds = (await prisma.benutzer.findMany({
        where: { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } }, select: { id: true },
      })).map(b => b.id);
      const ich = await prisma.benutzer.findUnique({ where: { id: request.benutzer.sub }, select: { name: true } });

      if (stand.gesperrt && !vorher.gesperrt) {
        // Viertel erreicht: niemand bleibt als zugeschaltet stehen, alle Geladenen erfahren es
        await prisma.anwesenheit.updateMany({
          where: { sitzungId: id, teilnahmeart: { not: Teilnahmeart.VOR_ORT } },
          data:  { teilnahmeart: Teilnahmeart.VOR_ORT, teilnahmeBestaetigtAm: null },
        });
        const geladene = (await prisma.anwesenheit.findMany({
          where:  { sitzungId: id, status: { in: [AnwesenheitsStatus.ANWESEND, AnwesenheitsStatus.ERSATZ_FUER] } },
          select: { benutzerId: true },
        })).map(a => a.benutzerId);
        await benachrichtigen({
          art: "VIDEO_WIDERSPRUCH", empfaengerIds: [...vorsitzIds, ...geladene], ausloeserId: request.benutzer.sub,
          sitzungId: id, link: sitzungLink(id),
          betreff: `Keine Zuschaltung: ${sitzung.titel}`,
          inhalt:  `Mindestens ein Viertel der Mitglieder hat der Zuschaltung per Video/Telefon widersprochen. `
            + `Die Sitzung „${sitzung.titel}“ findet nur vor Ort statt (§ 30 Abs. 2 Nr. 2 BetrVG).`,
        });
      } else {
        await benachrichtigen({
          art: "VIDEO_WIDERSPRUCH", empfaengerIds: vorsitzIds, ausloeserId: request.benutzer.sub,
          sitzungId: id, link: sitzungLink(id),
          betreff: `Widerspruch gegen Zuschaltung: ${sitzung.titel}`,
          inhalt:  `${ich?.name ?? "Ein Mitglied"} widerspricht der Zuschaltung per Video/Telefon zur Sitzung „${sitzung.titel}“ `
            + `(${stand.anzahl} von ${stand.schwelle} nötigen Widersprüchen).`,
        });
      }
      return reply.status(201).send(stand);
    }
  );

  // ── DELETE /:id/widerspruch ──────────────────────────────────────
  app.delete(
    "/:id/widerspruch",
    { preHandler: [authenticate, erfordert(Role.ERSATZMITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { form: true, status: true, widerspruchBis: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      const grund = widerspruchGeschlossen(sitzung);
      if (grund) return reply.status(409).send({ fehler: grund });

      await prisma.sitzungWiderspruch.deleteMany({ where: { sitzungId: id, benutzerId: request.benutzer.sub } });
      const stand = await widerspruchStand(id);
      await audit(request, id, { videoWiderspruchZurueck: true, anzahl: stand.anzahl });
      return reply.send(stand);
    }
  );

  // ── POST /:id/teilnahme-bestaetigen ──────────────────────────────
  // § 34 Abs. 1 S. 4: Wer per Video/Telefon teilgenommen hat, bestätigt das in Textform gegenüber dem Vorsitz
  app.post(
    "/:id/teilnahme-bestaetigen",
    { preHandler: [authenticate, erfordert(Role.ERSATZMITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true, sitzungsdatum: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      const sitzungstag = sitzung.sitzungsdatum.toISOString().slice(0, 10);   // Ortszeit in den UTC-Feldern
      const begonnen = sitzung.status === SitzungStatus.PROTOKOLL_ENTWURF
        || (sitzung.status === SitzungStatus.TAGESORDNUNG_FIXIERT && ortszeitJetzt().toISOString().slice(0, 10) >= sitzungstag);
      if (!begonnen) return reply.status(409).send({ fehler: "Bestätigen lässt sich die Teilnahme ab dem Sitzungstag bis zum Abschluss des Protokolls" });

      const eintrag = await prisma.anwesenheit.findUnique({
        where:  { sitzungId_benutzerId: { sitzungId: id, benutzerId: request.benutzer.sub } },
        select: { id: true, status: true, teilnahmeart: true, teilnahmeBestaetigtAm: true },
      });
      const anwesend = eintrag && (eintrag.status === AnwesenheitsStatus.ANWESEND || eintrag.status === AnwesenheitsStatus.ERSATZ_FUER);
      if (!anwesend || !istZugeschaltet(eintrag.teilnahmeart)) {
        return reply.status(409).send({ fehler: "Du bist in dieser Sitzung nicht als zugeschaltet eingetragen" });
      }
      if (eintrag.teilnahmeBestaetigtAm) return reply.send({ bestaetigtAm: eintrag.teilnahmeBestaetigtAm });

      const jetzt = new Date();
      await prisma.anwesenheit.update({ where: { id: eintrag.id }, data: { teilnahmeBestaetigtAm: jetzt } });
      await audit(request, id, { teilnahmeBestaetigt: true, teilnahmeart: eintrag.teilnahmeart });
      return reply.status(201).send({ bestaetigtAm: jetzt });
    }
  );
}
