/**
 * Einladung per E-Mail mit Versandnachweis (Paket 4, Stufe 3)
 *
 * GET  /api/sitzungen/:id/einladung            – Geladene mit Adresse und letztem Versand, Protokoll
 * POST /api/sitzungen/:id/einladung/versenden  – an alle noch nicht erfolgreich Eingeladenen
 *                                                 oder an benutzerIds (erneut) senden (VORSITZ),
 *                                                 Detailstufe je Versand (lib/einladungDetail.ts)
 * GET  /api/sitzungen/:id/ladung-pruefung      – vor einem Spontan-TOP: ist laut Versandnachweis
 *                                                 jedes Mitglied bzw. sein Ersatz geladen? (VORSITZ)
 *
 * Geladen ist, wer in der Anwesenheit "Kommt" (ANWESEND) oder "Als Ersatz geladen"
 * (ERSATZ_FUER) steht. Mails gehen an die Zweitadresse, sonst an die Hauptadresse.
 * JAV und SBV bekommen keine vertraulichen TOPs und kein PDF (das enthält alle TOPs).
 * Jede Einladung trägt den Termin als .ics-Datei (lib/kalender.ts).
 * Abrufnachweis: das erste Öffnen der Sitzung nach dem Versand hält routes/sitzungen.ts fest.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fs from "node:fs/promises";
import { AnwesenheitsStatus, AuditAktion, EinladungDetail, Role, SitzungStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { sendeEinladung, MAIL_SIGNATUR } from "../lib/mailer.js";
import { istBetriebsversammlung } from "../lib/sitzungstypen.js";
import { kalenderDatei } from "../lib/kalender.js";
import { einladungDetailStandard, einladungInhalt, istEinladungDetail } from "../lib/einladungDetail.js";
import { ladungPruefen } from "../lib/ladungPruefen.js";

const ROLLE_LABEL: Record<string, string> = {
  VORSITZ: "Vorsitz", STELLVERTRETER: "Stellv. Vorsitz", MITGLIED: "Mitglied",
  ERSATZMITGLIED: "Ersatzmitglied", JAV: "JAV", SBV: "SBV", ADMIN: "Admin",
};

async function geladene(sitzungId: string) {
  const eintraege = await prisma.anwesenheit.findMany({
    where: {
      sitzungId,
      status:   { in: [AnwesenheitsStatus.ANWESEND, AnwesenheitsStatus.ERSATZ_FUER] },
      benutzer: { aktiv: true, rolle: { notIn: [Role.ADMIN, Role.EXTERN] } },
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

      const [empfaenger, protokoll, detailStandard] = await Promise.all([
        geladene(id),
        prisma.einladungVersand.findMany({ where: { sitzungId: id }, orderBy: { versendetAm: "desc" } }),
        einladungDetailStandard(),
      ]);
      const letzter = new Map<string, (typeof protokoll)[number]>();
      for (const p of protokoll) if (p.benutzerId && !letzter.has(p.benutzerId)) letzter.set(p.benutzerId, p);

      return reply.send({
        empfaenger: empfaenger.map(e => {
          const l = letzter.get(e.benutzerId);
          return { ...e, letzterVersand: l ? {
            versendetAm: l.versendetAm, erfolgreich: l.erfolgreich, fehler: l.fehler, adresse: l.adresse,
            detail: l.detail, abgerufenAm: l.abgerufenAm,
          } : null };
        }),
        protokoll,
        detailStandard,
        letzterZusatz: protokoll.find(p => p.zusatz)?.zusatz ?? "",   // Vorbelegung fürs nächste Mal
        smtpAktiv:    !!process.env.SMTP_HOST,
        kannVersenden: sitzung.status === SitzungStatus.TAGESORDNUNG_FIXIERT && !istBetriebsversammlung(sitzung.sitzungstyp),
      });
    }
  );

  // ── POST /:id/einladung/versenden ───────────────────────────────
  app.post<{ Params: { id: string }; Body: { benutzerIds?: string[]; zusatz?: string; detail?: EinladungDetail } }>(
    "/:id/einladung/versenden",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;
      if (!process.env.SMTP_HOST) {
        return reply.status(409).send({ fehler: "Es ist kein Mailserver eingerichtet (SMTP_HOST in der .env)" });
      }
      if (request.body?.detail !== undefined && !istEinladungDetail(request.body.detail)) {
        return reply.status(400).send({ fehler: "Unbekannte Detailstufe" });
      }
      const detail = request.body?.detail ?? await einladungDetailStandard();

      const sitzung = await prisma.sitzung.findUnique({
        where:  { id },
        select: {
          titel: true, sitzungsdatum: true, ort: true, status: true, sitzungstyp: true,
          tops: { orderBy: { nummer: "asc" }, select: { nummer: true, titel: true, einladungTitel: true, vertraulich: true } },
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
      // Neue Fixierung (z. B. verschobener Termin) → höhere SEQUENCE, Kalender aktualisiert den Termin
      const sequenz  = await prisma.sitzungVersion.count({ where: { sitzungId: id, typ: "TAGESORDNUNG_FIXIERT" } });
      const signatur = (await prisma.systemEinstellung.findUnique({ where: { schluessel: MAIL_SIGNATUR } }))?.wert.trim() || null;

      const ergebnisse: { benutzerId: string; name: string; adresse: string; erfolgreich: boolean; fehler: string | null }[] = [];
      for (const e of empfaenger) {
        const istEingeschraenkt = e.rolle === Role.JAV || e.rolle === Role.SBV;
        // Das PDF enthält alle TOPs mit echtem Titel – nie für JAV/SBV, nur bei „Vollständig“
        const inhalt = einladungInhalt(detail, sitzung.tops.filter(t => !istEingeschraenkt || !t.vertraulich), pdfDa && !istEingeschraenkt);
        const anhang = inhalt.mitPdf ? { dateiname: `Tagesordnung – ${sitzung.titel}.pdf`, pfad: version!.pdfPfad! } : null;
        const tops   = inhalt.tops;
        const kalender = {
          dateiname: "Termin.ics",
          inhalt: kalenderDatei({
            uid:          `sitzung-${id}@br-dms`,
            sequenz,
            titel:        sitzung.titel,
            beginn:       sitzung.sitzungsdatum,
            ort:          sitzung.ort,
            beschreibung: [...(tops ? ["Tagesordnung:", ...tops.map(t => `${t.nummer}. ${t.titel}`), ""] : []), `In BR-DMS: ${sitzungUrl}`].join("\n"),
            url:          sitzungUrl,
          }),
        };
        let fehler: string | null = null;
        try {
          await sendeEinladung({
            an:            e.adresse,
            name:          e.name,
            sitzungTitel:  sitzung.titel,
            sitzungsdatum: sitzung.sitzungsdatum,
            ort:           sitzung.ort,
            tops,
            ersatzFuer:    e.ersatzFuer,
            sitzungUrl,
            anhang,
            kalender,
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
            rolle: e.rolle, vertretungFuer: e.ersatzFuer, mitAnhang: !!anhang, zusatz, detail,
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
          details:    { einladungPerMail: true, detail, gesendet, fehlgeschlagen: ergebnisse.length - gesendet },
        },
      }).catch(() => {});

      return reply.send({ gesendet, fehlgeschlagen: ergebnisse.length - gesendet, ergebnisse });
    }
  );

  // ── GET /:id/ladung-pruefung ────────────────────────────────────
  // Vor einem Spontan-TOP (§ 29 Abs. 2 S. 3): Die Ergänzung der Tagesordnung heilt den
  // Ladungsmangel nur, wenn alle rechtzeitig geladen waren – hier nur der Abgleich mit
  // dem Versandnachweis, ob „rechtzeitig“ reicht, beurteilt der Mensch.
  app.get(
    "/:id/ladung-pruefung",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const ergebnis = await ladungPruefen(id);
      if (!ergebnis) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      return reply.send(ergebnis);
    }
  );
}
