/**
 * Einladung per E-Mail mit Versandnachweis (Paket 4, Stufe 3)
 *
 * GET  /api/sitzungen/:id/einladung            – Geladene mit Adresse und letztem Versand, Protokoll
 * POST /api/sitzungen/:id/einladung/versenden  – an alle noch nicht erfolgreich Eingeladenen
 *                                                 oder an benutzerIds (erneut) senden (VORSITZ)
 *
 * Geladen ist, wer in der Anwesenheit "Kommt" (ANWESEND) oder "Als Ersatz geladen"
 * (ERSATZ_FUER) steht. Mails gehen an die Zweitadresse, sonst an die Hauptadresse.
 * JAV und SBV bekommen keine vertraulichen TOPs und kein PDF (das enthält alle TOPs).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fs from "node:fs/promises";
import { AnwesenheitsStatus, AuditAktion, Role, SitzungStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { sendeEinladung, MAIL_SIGNATUR } from "../lib/mailer.js";
import { istBetriebsversammlung } from "../lib/sitzungstypen.js";

const ROLLE_LABEL: Record<string, string> = {
  VORSITZ: "Vorsitz", STELLVERTRETER: "Stellv. Vorsitz", MITGLIED: "Mitglied",
  ERSATZMITGLIED: "Ersatzmitglied", JAV: "JAV", SBV: "SBV", ADMIN: "Admin",
};

async function geladene(sitzungId: string) {
  const eintraege = await prisma.anwesenheit.findMany({
    where: {
      sitzungId,
      status:   { in: [AnwesenheitsStatus.ANWESEND, AnwesenheitsStatus.ERSATZ_FUER] },
      benutzer: { aktiv: true, rolle: { not: Role.ADMIN } },
    },
    select: {
      status: true,
      vertretungFuer: { select: { name: true } },
      benutzer: { select: { id: true, name: true, email: true, einladungEmail: true, rolle: true } },
    },
  });
  return eintraege.map(e => ({
    benutzerId: e.benutzer.id,
    name:       e.benutzer.name,
    rolle:      e.benutzer.rolle,
    adresse:    e.benutzer.einladungEmail || e.benutzer.email,
    ersatzFuer: e.status === AnwesenheitsStatus.ERSATZ_FUER ? e.vertretungFuer?.name ?? null : null,
  })).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function einladungRouten(app: FastifyInstance): Promise<void> {

  // ── GET /:id/einladung ──────────────────────────────────────────
  app.get(
    "/:id/einladung",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true, sitzungstyp: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      const [empfaenger, protokoll] = await Promise.all([
        geladene(id),
        prisma.einladungVersand.findMany({ where: { sitzungId: id }, orderBy: { versendetAm: "desc" } }),
      ]);
      const letzter = new Map<string, (typeof protokoll)[number]>();
      for (const p of protokoll) if (p.benutzerId && !letzter.has(p.benutzerId)) letzter.set(p.benutzerId, p);

      return reply.send({
        empfaenger: empfaenger.map(e => {
          const l = letzter.get(e.benutzerId);
          return { ...e, letzterVersand: l ? { versendetAm: l.versendetAm, erfolgreich: l.erfolgreich, fehler: l.fehler, adresse: l.adresse } : null };
        }),
        protokoll,
        letzterZusatz: protokoll.find(p => p.zusatz)?.zusatz ?? "",   // Vorbelegung fürs nächste Mal
        smtpAktiv:    !!process.env.SMTP_HOST,
        kannVersenden: sitzung.status === SitzungStatus.TAGESORDNUNG_FIXIERT && !istBetriebsversammlung(sitzung.sitzungstyp),
      });
    }
  );

  // ── POST /:id/einladung/versenden ───────────────────────────────
  app.post<{ Params: { id: string }; Body: { benutzerIds?: string[]; zusatz?: string } }>(
    "/:id/einladung/versenden",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;
      if (!process.env.SMTP_HOST) {
        return reply.status(409).send({ fehler: "Es ist kein Mailserver eingerichtet (SMTP_HOST in der .env)" });
      }

      const sitzung = await prisma.sitzung.findUnique({
        where:  { id },
        select: {
          titel: true, sitzungsdatum: true, ort: true, status: true, sitzungstyp: true,
          tops: { orderBy: { nummer: "asc" }, select: { nummer: true, titel: true, vertraulich: true } },
          versionen: {
            where:   { typ: "TAGESORDNUNG_FIXIERT" },
            orderBy: { erstelltAm: "desc" },
            take:    1,
            select:  { id: true, pdfPfad: true, pdfDateiname: true, einladungVersendetAm: true },
          },
        },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      if (istBetriebsversammlung(sitzung.sitzungstyp)) {
        return reply.status(409).send({ fehler: "Zur Betriebsversammlung wird per Aushang eingeladen" });
      }
      if (sitzung.status !== SitzungStatus.TAGESORDNUNG_FIXIERT) {
        return reply.status(409).send({ fehler: "Einladungen gehen nur bei fixierter Tagesordnung raus" });
      }

      // Ohne Auswahl: alle, die noch keine erfolgreiche Einladung haben
      let empfaenger = await geladene(id);
      if (request.body?.benutzerIds?.length) {
        const gewaehlt = new Set(request.body.benutzerIds);
        empfaenger = empfaenger.filter(e => gewaehlt.has(e.benutzerId));
      } else {
        const schonEingeladen = new Set((await prisma.einladungVersand.findMany({
          where: { sitzungId: id, erfolgreich: true }, select: { benutzerId: true },
        })).map(e => e.benutzerId));
        empfaenger = empfaenger.filter(e => !schonEingeladen.has(e.benutzerId));
      }
      if (empfaenger.length === 0) return reply.send({ gesendet: 0, fehlgeschlagen: 0, ergebnisse: [] });

      const version = sitzung.versionen[0];
      const pdfDa = !!version?.pdfPfad && await fs.access(version.pdfPfad).then(() => true, () => false);
      const ich = await prisma.benutzer.findUnique({ where: { id: request.benutzer.sub }, select: { name: true, rolle: true } });
      const unterschrift = ich ? `${ich.name}, ${ROLLE_LABEL[ich.rolle] ?? ich.rolle}` : "Der Betriebsrat";
      const sitzungUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/sitzungen?id=${id}`;
      const zusatz   = request.body?.zusatz?.trim().slice(0, 4000) || null;
      const signatur = (await prisma.systemEinstellung.findUnique({ where: { schluessel: MAIL_SIGNATUR } }))?.wert.trim() || null;

      const ergebnisse: { benutzerId: string; name: string; adresse: string; erfolgreich: boolean; fehler: string | null }[] = [];
      for (const e of empfaenger) {
        const istEingeschraenkt = e.rolle === Role.JAV || e.rolle === Role.SBV;
        const anhang = pdfDa && !istEingeschraenkt ? { dateiname: `Tagesordnung – ${sitzung.titel}.pdf`, pfad: version!.pdfPfad! } : null;
        let fehler: string | null = null;
        try {
          await sendeEinladung({
            an:            e.adresse,
            name:          e.name,
            sitzungTitel:  sitzung.titel,
            sitzungsdatum: sitzung.sitzungsdatum,
            ort:           sitzung.ort,
            tops:          sitzung.tops.filter(t => !istEingeschraenkt || !t.vertraulich),
            ersatzFuer:    e.ersatzFuer,
            sitzungUrl,
            anhang,
            unterschrift,
            zusatz,
            signatur,
          });
        } catch (err) {
          fehler = err instanceof Error ? err.message : String(err);
        }
        await prisma.einladungVersand.create({
          data: {
            sitzungId: id, benutzerId: e.benutzerId, name: e.name, adresse: e.adresse,
            rolle: e.rolle, vertretungFuer: e.ersatzFuer, mitAnhang: !!anhang, zusatz,
            erfolgreich: !fehler, fehler,
            versendetVonId: request.benutzer.sub, versendetVon: ich?.name ?? "",
          },
        });
        ergebnisse.push({ benutzerId: e.benutzerId, name: e.name, adresse: e.adresse, erfolgreich: !fehler, fehler });
      }

      const gesendet = ergebnisse.filter(r => r.erfolgreich).length;
      if (gesendet > 0 && version && !version.einladungVersendetAm) {
        await prisma.sitzungVersion.update({ where: { id: version.id }, data: { einladungVersendetAm: new Date() } });
      }
      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          sitzungId:  id,
          aktion:     AuditAktion.NACHRICHT_GESENDET,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { einladungPerMail: true, gesendet, fehlgeschlagen: ergebnisse.length - gesendet },
        },
      }).catch(() => {});

      return reply.send({ gesendet, fehlgeschlagen: ergebnisse.length - gesendet, ergebnisse });
    }
  );
}
