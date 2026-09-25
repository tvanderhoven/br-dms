/**
 * Sitzungs-Routen – Sitzungsmanagement mit Versions-State-Machine
 *
 * GET    /api/sitzungen              – Liste
 * POST   /api/sitzungen              – Neue Sitzung anlegen (VORSITZ)
 * GET    /api/sitzungen/:id          – Detail mit Versionen & TOPs
 * PATCH  /api/sitzungen/:id          – Metadaten aktualisieren (VORSITZ)
 * DELETE /api/sitzungen/:id          – Löschen / Absagen (VORSITZ)
 *
 * State-Machine:
 * POST   /api/sitzungen/:id/fixieren          – ENTWURF → TAGESORDNUNG_FIXIERT
 * POST   /api/sitzungen/:id/protokoll         – TAGESORDNUNG_FIXIERT → PROTOKOLL_ENTWURF
 * POST   /api/sitzungen/:id/finalisieren      – PROTOKOLL_ENTWURF → PROTOKOLL_FINAL
 * POST   /api/sitzungen/:id/einladung         – Einladung als versendet markieren
 *
 * TOPs:
 * POST   /api/sitzungen/:id/tops              – TOP hinzufügen
 * PATCH  /api/sitzungen/:id/tops/:topId       – TOP aktualisieren
 * DELETE /api/sitzungen/:id/tops/:topId       – TOP löschen
 *
 * Dokument-Verknüpfung:
 * POST   /api/sitzungen/:id/tops/:topId/dokumente            – verknüpfen
 * DELETE /api/sitzungen/:id/tops/:topId/dokumente/:dokumentId – trennen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SitzungStatus, TopStatus, AuditAktion, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { pdfAutomatischGenerieren } from "./pdf.js";

const TOP_SELECT = {
  id:          true,
  nummer:      true,
  titel:       true,
  inhalt:      true,
  inhaltsJson: true,
  ergebnis:    true,
  ergebnisJson: true,
  status:      true,
  spontan:     true,
  vertraulich: true,
  erstelltAm:    true,
  aktualisiertAm: true,
  _count: { select: { kommentare: true } },
  dokumente: {
    select: {
      id: true,
      hinweis: true,
      dokument: {
        select: {
          id:           true,
          titel:        true,
          alias:        true,
          kategorie:    true,
          dateiname:    true,
          aktenzeichen: true,
        },
      },
    },
  },
} as const;

const SITZUNG_SELECT = {
  id:           true,
  titel:        true,
  sitzungsdatum: true,
  ort:          true,
  sitzungstyp:  true,
  status:       true,
  notizen:      true,
  erstelltAm:   true,
  aktualisiertAm: true,
  erstelltVon:  { select: { id: true, name: true } },
  versionen: {
    orderBy: { erstelltAm: "asc" as const },
    select: {
      id:           true,
      versionNummer: true,
      typ:          true,
      readonly:     true,
      einladungVersendetAm: true,
      finalisiertAm: true,
      erstelltAm:   true,
    },
  },
  tops: {
    orderBy: { nummer: "asc" as const },
    select: TOP_SELECT,
  },
} as const;

async function audit(
  sitzungId: string,
  benutzerId: string,
  aktion: AuditAktion,
  request: FastifyRequest,
  details?: object
) {
  await prisma.auditLog.create({
    data: {
      sitzungId,
      benutzerId,
      aktion,
      ip:        request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      details:   details ? JSON.parse(JSON.stringify(details)) : null,
    },
  }).catch(() => {});
}

export async function sitzungRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Liste ──────────────────────────────────────────────
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sitzungen = await prisma.sitzung.findMany({
        where: { status: { not: SitzungStatus.ABGESAGT } },
        select: {
          id:           true,
          titel:        true,
          sitzungsdatum: true,
          ort:          true,
          sitzungstyp:  true,
          status:       true,
          erstelltAm:   true,
          erstelltVon:  { select: { name: true } },
          _count:       { select: { tops: true } },
          versionen: {
            orderBy: { erstelltAm: "desc" },
            take:    1,
            select:  { versionNummer: true, typ: true },
          },
        },
        orderBy: { sitzungsdatum: "desc" },
      });
      return reply.send(sitzungen);
    }
  );

  // ── POST / – Neue Sitzung ──────────────────────────────────────
  app.post(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { titel, sitzungsdatum, ort, sitzungstyp, notizen, vorlageId } =
        request.body as {
          titel: string;
          sitzungsdatum: string;
          ort?: string;
          sitzungstyp?: string;
          notizen?: string;
          vorlageId?: string;
        };

      if (!titel || !sitzungsdatum) {
        return reply.status(400).send({ fehler: "titel und sitzungsdatum sind Pflichtfelder" });
      }

      const sitzung = await prisma.sitzung.create({
        data: {
          titel,
          sitzungsdatum: new Date(sitzungsdatum),
          ort:           ort ?? null,
          sitzungstyp:   sitzungstyp ?? "ORDENTLICH",
          notizen:       notizen ?? null,
          status:        SitzungStatus.ENTWURF,
          erstelltVonId: request.benutzer.sub,
          versionen: {
            create: {
              versionNummer: "1.0",
              typ:           "TAGESORDNUNG_ENTWURF",
              readonly:      false,
              erstelltVonId: request.benutzer.sub,
            },
          },
        },
        select: SITZUNG_SELECT,
      });

      if (vorlageId) {
        const vorlage = await prisma.sitzungsVorlage.findUnique({
          where: { id: vorlageId },
          include: { tops: { orderBy: { reihenfolge: "asc" } } },
        });
        if (vorlage && vorlage.tops.length > 0) {
          await prisma.tOP.createMany({
            data: vorlage.tops.map((t, i) => ({
              sitzungId:   sitzung.id,
              nummer:      i + 1,
              titel:       t.titel,
              inhalt:      t.inhalt ?? null,
              inhaltsJson: t.inhaltsJson ?? undefined,
            })),
          });
        }
      }

      // Alle aktiven Mitglieder als "Anwesend" vorausfüllen
      const aktive = await prisma.benutzer.findMany({
        where: { aktiv: true },
        select: { id: true },
      });
      if (aktive.length > 0) {
        await prisma.anwesenheit.createMany({
          data: aktive.map(b => ({
            sitzungId: sitzung.id,
            benutzerId: b.id,
            status: "ANWESEND",
          })),
        });
      }

      await audit(sitzung.id, request.benutzer.sub, AuditAktion.SITZUNG_ERSTELLT, request, { titel, vorlageId });
      const sitzungMitTops = await prisma.sitzung.findUnique({ where: { id: sitzung.id }, select: SITZUNG_SELECT });
      return reply.status(201).send(sitzungMitTops);
    }
  );

  // ── GET /:id – Detail ──────────────────────────────────────────
  app.get(
    "/:id",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: SITZUNG_SELECT });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      // JAV sieht als vertraulich markierte TOPs nicht
      if (request.benutzer.rolle === Role.JAV) {
        return reply.send({ ...sitzung, tops: sitzung.tops.filter(t => !t.vertraulich) });
      }

      return reply.send(sitzung);
    }
  );

  // ── PATCH /:id – Metadaten aktualisieren ───────────────────────
  app.patch(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status === SitzungStatus.PROTOKOLL_FINAL || sitzung.status === SitzungStatus.ABGESAGT) {
        return reply.status(409).send({ fehler: "Finalisierte Sitzungen können nicht bearbeitet werden" });
      }

      const { titel, sitzungsdatum, ort, sitzungstyp, notizen } =
        request.body as Partial<{
          titel: string; sitzungsdatum: string; ort: string; sitzungstyp: string; notizen: string;
        }>;

      const aktualisiert = await prisma.sitzung.update({
        where:  { id },
        data: {
          ...(titel        !== undefined && { titel }),
          ...(sitzungsdatum !== undefined && { sitzungsdatum: new Date(sitzungsdatum) }),
          ...(ort          !== undefined && { ort }),
          ...(sitzungstyp  !== undefined && { sitzungstyp }),
          ...(notizen      !== undefined && { notizen }),
        },
        select: SITZUNG_SELECT,
      });

      await audit(id, request.benutzer.sub, AuditAktion.SITZUNG_AKTUALISIERT, request);
      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – Absagen ──────────────────────────────────────
  app.delete(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true, titel: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status === SitzungStatus.PROTOKOLL_FINAL) {
        return reply.status(409).send({ fehler: "Finalisierte Protokolle können nicht gelöscht werden" });
      }

      if (sitzung.status === SitzungStatus.ENTWURF) {
        await prisma.sitzung.delete({ where: { id } });
        return reply.send({ nachricht: "Sitzung gelöscht" });
      }

      await prisma.sitzung.update({
        where: { id },
        data:  { status: SitzungStatus.ABGESAGT },
      });

      await audit(id, request.benutzer.sub, AuditAktion.SITZUNG_GELOESCHT, request, { titel: sitzung.titel });
      return reply.send({ nachricht: "Sitzung abgesagt" });
    }
  );

  // ── POST /:id/fixieren – V1.0 → V1.1 ──────────────────────────
  app.post(
    "/:id/fixieren",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({
        where:  { id },
        select: { status: true, tops: { select: { id: true } }, titel: true },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status !== SitzungStatus.ENTWURF) {
        return reply.status(409).send({ fehler: "Nur Sitzungen im Status ENTWURF können fixiert werden" });
      }
      if (sitzung.tops.length === 0) {
        return reply.status(422).send({ fehler: "Mindestens ein Tagesordnungspunkt ist erforderlich" });
      }

      const aktualisiert = await prisma.$transaction(async (tx) => {
        // V1.0 einfrieren
        await tx.sitzungVersion.updateMany({
          where: { sitzungId: id, typ: "TAGESORDNUNG_ENTWURF" },
          data:  { readonly: true },
        });
        // V1.1 anlegen
        await tx.sitzungVersion.create({
          data: {
            sitzungId:     id,
            versionNummer: "1.1",
            typ:           "TAGESORDNUNG_FIXIERT",
            readonly:      true,
            erstelltVonId: request.benutzer.sub,
          },
        });
        // Sitzungsstatus setzen
        return tx.sitzung.update({
          where:  { id },
          data:   { status: SitzungStatus.TAGESORDNUNG_FIXIERT },
          select: SITZUNG_SELECT,
        });
      });

      await audit(id, request.benutzer.sub, AuditAktion.SITZUNG_FIXIERT, request);

      // PDF automatisch im Hintergrund generieren (blockiert nicht die Antwort)
      const v11 = aktualisiert.versionen.find(v => v.versionNummer === "1.1");
      if (v11) {
        pdfAutomatischGenerieren(id, v11.id, "1.1", "TAGESORDNUNG_FIXIERT", v11.erstelltAm, null)
          .catch(() => {});
      }

      // Tagesordnung automatisch an alle BR-Mitglieder senden
      const brMitglieder = await prisma.benutzer.findMany({
        where: { aktiv: true },
        select: { id: true },
      });
      await prisma.$transaction(
        brMitglieder.map(m =>
          prisma.nachricht.create({
            data: {
              betreff: `Tagesordnung fixiert: ${sitzung.titel}`,
              inhalt: `Die Tagesordnung zur Sitzung "${sitzung.titel}" wurde fixiert.`,
              typ: "TAGESORDNUNG",
              absenderId: request.benutzer.sub,
              empfaengerId: m.id,
              sitzungId: id,
            },
          })
        )
      ).catch(() => {});

      return reply.send(aktualisiert);
    }
  );

  // ── POST /:id/einladung – als versendet markieren ──────────────
  app.post(
    "/:id/einladung",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status !== SitzungStatus.TAGESORDNUNG_FIXIERT) {
        return reply.status(409).send({ fehler: "Nur fixierte Tagesordnungen können als versendet markiert werden" });
      }

      const version = await prisma.sitzungVersion.updateMany({
        where: { sitzungId: id, typ: "TAGESORDNUNG_FIXIERT" },
        data:  { einladungVersendetAm: new Date() },
      });

      return reply.send({ nachricht: "Einladung als versendet markiert", anzahl: version.count });
    }
  );

  // ── POST /:id/protokoll – V1.1 → V2.0 ─────────────────────────
  app.post(
    "/:id/protokoll",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status !== SitzungStatus.TAGESORDNUNG_FIXIERT) {
        return reply.status(409).send({ fehler: "Nur fixierte Sitzungen können in den Protokoll-Modus versetzt werden" });
      }

      const aktualisiert = await prisma.$transaction(async (tx) => {
        await tx.sitzungVersion.create({
          data: {
            sitzungId:     id,
            versionNummer: "2.0",
            typ:           "PROTOKOLL_ENTWURF",
            readonly:      false,
            erstelltVonId: request.benutzer.sub,
          },
        });
        return tx.sitzung.update({
          where:  { id },
          data:   { status: SitzungStatus.PROTOKOLL_ENTWURF },
          select: SITZUNG_SELECT,
        });
      });

      await audit(id, request.benutzer.sub, AuditAktion.SITZUNG_PROTOKOLL_GESTARTET, request);
      return reply.send(aktualisiert);
    }
  );

  // ── POST /:id/finalisieren – V2.0 → PROTOKOLL_FINAL ───────────
  app.post(
    "/:id/finalisieren",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status !== SitzungStatus.PROTOKOLL_ENTWURF) {
        return reply.status(409).send({ fehler: "Nur Protokoll-Entwürfe können finalisiert werden" });
      }

      const jetzt = new Date();
      const aktualisiert = await prisma.$transaction(async (tx) => {
        await tx.sitzungVersion.updateMany({
          where: { sitzungId: id, typ: "PROTOKOLL_ENTWURF" },
          data:  { readonly: true, finalisiertAm: jetzt, finalisiertVonId: request.benutzer.sub },
        });
        await tx.sitzungVersion.create({
          data: {
            sitzungId:       id,
            versionNummer:   "2.1",
            typ:             "PROTOKOLL_FINAL",
            readonly:        true,
            finalisiertAm:   jetzt,
            finalisiertVonId: request.benutzer.sub,
            erstelltVonId:   request.benutzer.sub,
          },
        });
        return tx.sitzung.update({
          where:  { id },
          data:   { status: SitzungStatus.PROTOKOLL_FINAL },
          select: SITZUNG_SELECT,
        });
      });

      await audit(id, request.benutzer.sub, AuditAktion.SITZUNG_FINALISIERT, request);

      // Finales Protokoll-PDF automatisch generieren
      const v21 = aktualisiert.versionen.find(v => v.versionNummer === "2.1");
      if (v21) {
        pdfAutomatischGenerieren(id, v21.id, "2.1", "PROTOKOLL_FINAL", v21.erstelltAm, jetzt)
          .catch(() => {});
      }

      return reply.send(aktualisiert);
    }
  );

  // ── POST /:id/tops – TOP hinzufügen ───────────────────────────
  app.post(
    "/:id/tops",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const sitzung = await prisma.sitzung.findUnique({
        where:  { id },
        select: { status: true, tops: { select: { nummer: true }, orderBy: { nummer: "desc" }, take: 1 } },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status !== SitzungStatus.ENTWURF) {
        return reply.status(409).send({ fehler: "TOPs können nur in Sitzungen im Status ENTWURF hinzugefügt werden" });
      }

      const { titel, inhalt, inhaltsJson, vertraulich } =
        request.body as { titel: string; inhalt?: string; inhaltsJson?: object; vertraulich?: boolean };
      if (!titel) return reply.status(400).send({ fehler: "titel ist ein Pflichtfeld" });

      const naechsteNummer = (sitzung.tops[0]?.nummer ?? 0) + 1;

      const top = await prisma.tOP.create({
        data: {
          sitzungId:   id,
          nummer:      naechsteNummer,
          titel,
          inhalt:      inhalt ?? null,
          inhaltsJson: inhaltsJson ?? undefined,
          status:      TopStatus.OFFEN,
          vertraulich: vertraulich ?? false,
        },
        select: TOP_SELECT,
      });

      return reply.status(201).send(top);
    }
  );

  // ── POST /:id/spontan-top – Spontan-TOP beantragen ────────────
  app.post(
    "/:id/spontan-top",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { titel } = request.body as { titel: string };

      if (!titel?.trim()) return reply.status(400).send({ fehler: "titel ist erforderlich" });

      const sitzung = await prisma.sitzung.findUnique({
        where: { id },
        select: {
          status: true,
          tops: { select: { nummer: true }, orderBy: { nummer: "desc" }, take: 1 },
        },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      if (sitzung.status !== SitzungStatus.PROTOKOLL_ENTWURF) {
        return reply.status(409).send({ fehler: "Spontan-TOPs nur im Status PROTOKOLL_ENTWURF möglich" });
      }

      const naechsteNummer = (sitzung.tops[0]?.nummer ?? 0) + 1;

      const top = await prisma.$transaction(async (tx) => {
        const neuerTop = await tx.tOP.create({
          data: {
            sitzungId: id,
            nummer:    naechsteNummer,
            titel:     titel.trim(),
            status:    TopStatus.OFFEN,
            spontan:   true,
          },
          select: TOP_SELECT,
        });

        await tx.beschluss.create({
          data: {
            topId:          neuerTop.id,
            antragstext:    `Aufnahme des Antrags „${titel.trim()}" in die Tagesordnung`,
            rechtsgrundlage: "Sonstige Beschlussfassung",
            reihenfolge:    0,
            erstelltVonId:  request.benutzer.sub,
          },
        });

        return neuerTop;
      });

      await prisma.auditLog.create({
        data: {
          sitzungId:  id,
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.SITZUNG_AKTUALISIERT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    JSON.parse(JSON.stringify({ spontanTop: titel.trim() })),
        },
      }).catch(() => {});

      return reply.status(201).send(top);
    }
  );

  // ── PUT /:id/tops/reihenfolge – TOPs neu sortieren ────────────
  app.put<{ Params: { id: string }; Body: { topIds: string[] } }>(
    "/:id/tops/reihenfolge",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;
      const { topIds } = request.body;

      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      if (sitzung.status !== SitzungStatus.ENTWURF) {
        return reply.status(409).send({ fehler: "Reihenfolge nur im Entwurf änderbar" });
      }

      await prisma.$transaction(async tx => {
        // Phase 1: temporäre Nummern (1000+) um Unique-Verletzung zu vermeiden
        for (let i = 0; i < topIds.length; i++) {
          await tx.tOP.update({ where: { id: topIds[i] }, data: { nummer: 1000 + i } });
        }
        // Phase 2: finale Nummern
        for (let i = 0; i < topIds.length; i++) {
          await tx.tOP.update({ where: { id: topIds[i] }, data: { nummer: i + 1 } });
        }
      });

      return reply.send({ ok: true });
    }
  );

  // ── PATCH /:id/tops/:topId – TOP aktualisieren ─────────────────
  app.patch(
    "/:id/tops/:topId",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, topId } = request.params as { id: string; topId: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      const top = await prisma.tOP.findFirst({ where: { id: topId, sitzungId: id }, select: { id: true } });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });

      const status = sitzung.status;
      const { titel, inhalt, inhaltsJson, ergebnis, ergebnisJson, topStatus, vertraulich } =
        request.body as Partial<{ titel: string; inhalt: string; inhaltsJson: object; ergebnis: string; ergebnisJson: object; topStatus: TopStatus; vertraulich: boolean }>;

      // Titel nur in ENTWURF editierbar
      if (titel !== undefined && status !== SitzungStatus.ENTWURF) {
        return reply.status(409).send({ fehler: "Der Titel kann nur im Status ENTWURF bearbeitet werden" });
      }
      // Inhalt (Beschreibung/Aufzählung) auch in PROTOKOLL_ENTWURF editierbar
      if ((inhalt !== undefined || inhaltsJson !== undefined) &&
          status !== SitzungStatus.ENTWURF && status !== SitzungStatus.PROTOKOLL_ENTWURF) {
        return reply.status(409).send({ fehler: "Inhalt kann nur im Status ENTWURF oder Protokoll-Entwurf bearbeitet werden" });
      }

      // Ergebnis-Felder nur in PROTOKOLL_ENTWURF editierbar
      if ((ergebnis !== undefined || ergebnisJson !== undefined || topStatus !== undefined) &&
          status !== SitzungStatus.PROTOKOLL_ENTWURF) {
        return reply.status(409).send({ fehler: "Ergebnis und Status können nur im Status PROTOKOLL_ENTWURF bearbeitet werden" });
      }

      if (status === SitzungStatus.PROTOKOLL_FINAL || status === SitzungStatus.ABGESAGT) {
        return reply.status(409).send({ fehler: "Finalisierte Sitzungen sind unveränderlich" });
      }

      const aktualisiert = await prisma.tOP.update({
        where: { id: topId },
        data: {
          ...(titel        !== undefined && { titel }),
          ...(inhalt       !== undefined && { inhalt }),
          ...(inhaltsJson  !== undefined && { inhaltsJson }),
          ...(ergebnis     !== undefined && { ergebnis }),
          ...(ergebnisJson !== undefined && { ergebnisJson }),
          ...(topStatus    !== undefined && { status: topStatus }),
          ...(vertraulich  !== undefined && { vertraulich }),
        },
        select: TOP_SELECT,
      });

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id/tops/:topId – TOP löschen ─────────────────────
  app.delete(
    "/:id/tops/:topId",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, topId } = request.params as { id: string; topId: string };
      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status !== SitzungStatus.ENTWURF) {
        return reply.status(409).send({ fehler: "TOPs können nur im Status ENTWURF gelöscht werden" });
      }

      const top = await prisma.tOP.findFirst({ where: { id: topId, sitzungId: id }, select: { nummer: true } });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });

      await prisma.$transaction(async (tx) => {
        await tx.tOP.delete({ where: { id: topId } });
        // Nummern neu vergeben
        const restTops = await tx.tOP.findMany({
          where:   { sitzungId: id },
          orderBy: { nummer: "asc" },
          select:  { id: true },
        });
        for (let i = 0; i < restTops.length; i++) {
          await tx.tOP.update({ where: { id: restTops[i].id }, data: { nummer: i + 1 } });
        }
      });

      return reply.send({ nachricht: "TOP gelöscht" });
    }
  );

  // ── POST /:id/tops/:topId/dokumente – verknüpfen ───────────────
  app.post(
    "/:id/tops/:topId/dokumente",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, topId } = request.params as { id: string; topId: string };
      const { dokumentId, hinweis } = request.body as { dokumentId: string; hinweis?: string };

      if (!dokumentId) return reply.status(400).send({ fehler: "dokumentId ist erforderlich" });

      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status === SitzungStatus.PROTOKOLL_FINAL || sitzung.status === SitzungStatus.ABGESAGT) {
        return reply.status(409).send({ fehler: "Finalisierte Sitzungen sind unveränderlich" });
      }

      const top = await prisma.tOP.findFirst({ where: { id: topId, sitzungId: id }, select: { id: true, spontan: true } });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });

      // Nach der Fixierung dürfen nur noch Spontan-TOPs (die eh erst während
      // des Protokolls entstehen) neue Dokumente bekommen – reguläre TOPs
      // sind mit der fixierten Tagesordnung eingefroren.
      if (sitzung.status !== SitzungStatus.ENTWURF && !top.spontan) {
        return reply.status(409).send({ fehler: "Die Tagesordnung ist fixiert – Dokumente können nur noch bei Spontan-TOPs verknüpft werden" });
      }

      const dokument = await prisma.dokument.findUnique({ where: { id: dokumentId }, select: { id: true } });
      if (!dokument) return reply.status(404).send({ fehler: "Dokument nicht gefunden" });

      const vorhanden = await prisma.topDokument.findUnique({ where: { topId_dokumentId: { topId, dokumentId } } });
      if (vorhanden) return reply.status(409).send({ fehler: "Dokument ist bereits verknüpft" });

      const verknuepfung = await prisma.topDokument.create({
        data: {
          topId,
          dokumentId,
          hinweis:         hinweis ?? null,
          verknuepftVonId: request.benutzer.sub,
        },
        select: {
          id:      true,
          hinweis: true,
          dokument: {
            select: { id: true, titel: true, kategorie: true, dateiname: true, aktenzeichen: true },
          },
        },
      });

      return reply.status(201).send(verknuepfung);
    }
  );

  // ── DELETE /:id/tops/:topId/dokumente/:dokumentId – trennen ────
  app.delete(
    "/:id/tops/:topId/dokumente/:dokumentId",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, topId, dokumentId } = request.params as { id: string; topId: string; dokumentId: string };

      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status === SitzungStatus.PROTOKOLL_FINAL || sitzung.status === SitzungStatus.ABGESAGT) {
        return reply.status(409).send({ fehler: "Finalisierte Sitzungen sind unveränderlich" });
      }

      const top = await prisma.tOP.findFirst({ where: { id: topId, sitzungId: id }, select: { spontan: true } });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });

      if (sitzung.status !== SitzungStatus.ENTWURF && !top.spontan) {
        return reply.status(409).send({ fehler: "Die Tagesordnung ist fixiert – Verknüpfungen können nur noch bei Spontan-TOPs gelöst werden" });
      }

      await prisma.topDokument.delete({
        where: { topId_dokumentId: { topId, dokumentId } },
      }).catch(() => {});

      return reply.send({ nachricht: "Verknüpfung entfernt" });
    }
  );
}
