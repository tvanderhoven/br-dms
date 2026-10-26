/**
 * Themenakte – Routen (Logik und Rechte: lib/themenakte.ts)
 *
 * GET    /api/themenakte                          – Übersicht (ehemals Themen-Backlog)
 * POST   /api/themenakte                          – Thema anlegen
 * GET    /api/themenakte/:id                      – Kopf, Beteiligte, Verknüpfungen, Rechte
 * PATCH  /api/themenakte/:id                      – Kopf ändern (Vertraulichkeit/Projektteam nur Vorsitz/Stv.)
 * DELETE /api/themenakte/:id                      – Thema löschen (nur Vorsitz/Stv.)
 * GET    /api/themenakte/:id/verlauf              – Beiträge + automatische Einträge
 * POST   /api/themenakte/:id/eintraege            – Beitrag schreiben (nicht veränderbar)
 * PATCH  /api/themenakte/:id/eintraege/:eid       – nur Anheften/Lösen
 * POST   /api/themenakte/:id/verknuepfungen       – Dokument/TOP/Aufgabe/BV verknüpfen
 * DELETE /api/themenakte/:id/verknuepfungen/:typ/:zielId – Verknüpfung lösen
 * GET    /api/themenakte/:id/chronik              – PDF-Chronik (auch für die Amtsübergabe)
 *
 * Wer ein Thema nicht sehen darf, bekommt 404 – nicht einmal der Titel soll durchsickern.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuditAktion, DokumentStatus, Prisma, Role, ThemaEintragArt, ThemaStatus, ThemaVertraulichkeit } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { istTechnikAdmin } from "../lib/adminZugriff.js";
import { darfDokumentSehen, topSichtbar } from "../lib/vertraulich.js";
import {
  automatischeEintraege, darfSchreiben, istLeitung, sichtbaresThema, themaSichtbarFilter, type Leser,
} from "../lib/themenakte.js";
import { benachrichtigen } from "../lib/benachrichtigung.js";
import { erwaehntePersonen } from "../lib/kommentarBenachrichtigung.js";
import { themenChronikPdfGenerieren } from "../services/pdf.service.js";

export const THEMA_STATUS_LABEL: Record<ThemaStatus, string> = {
  OFFEN: "Offen", IN_VERHANDLUNG: "In Verhandlung", RUHT: "Ruht", ABGESCHLOSSEN: "Abgeschlossen",
};
export const THEMA_VERTRAULICHKEIT_LABEL: Record<ThemaVertraulichkeit, string> = {
  ALLE: "Alle Mitglieder und Ersatzmitglieder", BETRIEBSRAT: "Nur ordentliche Mitglieder", VORSITZ: "Nur Vorsitz und Stellvertretung",
};
export const THEMA_EINTRAG_LABEL: Record<ThemaEintragArt, string> = {
  NOTIZ: "Notiz", GESPRAECHSVERMERK: "Gesprächsvermerk", IDEE_FRAGE: "Idee / Frage", RECHERCHE: "Recherche",
};

const themaLink = (id: string) => `/themenakte/${id}`;

const BENUTZER = { select: { id: true, name: true } } as const;

/** Wer kann beteiligt werden? Gremium – JAV/SBV/Externe erreichen die Themenakte (noch) nicht */
const BETEILIGBAR: Role[] = [Role.VORSITZ, Role.STELLVERTRETER, Role.MITGLIED, Role.ERSATZMITGLIED];

async function audit(request: FastifyRequest, aktion: AuditAktion, details: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { benutzerId: request.benutzer.sub, aktion, details } }).catch(() => {});
}

/** Lädt das Thema oder schickt 404; bei schreiben=true zusätzlich 403 ohne Schreibrecht */
async function themaOder404(request: FastifyRequest, reply: FastifyReply, id: string, schreiben = false) {
  const thema = await sichtbaresThema(id, request.benutzer);
  if (!thema) { reply.status(404).send({ fehler: "Thema nicht gefunden" }); return null; }
  if (schreiben && !(await darfSchreiben(thema, request.benutzer))) {
    reply.status(403).send({ fehler: thema.nurTeam ? "Nur das Projektteam schreibt in dieses Thema" : "Keine Schreibrechte" });
    return null;
  }
  return thema;
}

/** Beteiligte prüfen: aktiv, im Gremium, keine Dubletten */
async function beteiligtePruefen(liste: { benutzerId: string; zustaendig?: boolean }[]) {
  const ids = [...new Set(liste.map(b => b.benutzerId))];
  const gueltig = await prisma.benutzer.findMany({ where: { id: { in: ids }, aktiv: true, rolle: { in: BETEILIGBAR } }, select: { id: true } });
  if (gueltig.length !== ids.length) return null;
  return ids.map(id => ({ benutzerId: id, zustaendig: liste.some(b => b.benutzerId === id && b.zustaendig) }));
}

/** Wer von diesen Personen darf das Thema sehen? (für Benachrichtigungen) */
async function sehenDuerfen(themaId: string, ids: string[]): Promise<string[]> {
  const personen = await prisma.benutzer.findMany({ where: { id: { in: ids }, aktiv: true }, select: { id: true, rolle: true } });
  const ergebnis: string[] = [];
  for (const p of personen) {
    if (([Role.JAV, Role.SBV, Role.EXTERN] as Role[]).includes(p.rolle) || (await istTechnikAdmin(p.rolle))) continue;
    if (await prisma.thema.count({ where: { id: themaId, ...themaSichtbarFilter({ sub: p.id, rolle: p.rolle }) } })) ergebnis.push(p.id);
  }
  return ergebnis;
}

// Routen mit Body-Schema prüfen Anmeldung und Rolle in preValidation – sonst bekäme
// ein nicht angemeldeter Aufruf 400 vom Schema statt 401 (wie routes/konto.ts)
export async function themenakteRouten(app: FastifyInstance): Promise<void> {
  const lesen = { preHandler: [authenticate, erfordert(Role.ERSATZMITGLIED)] };

  // ── GET / – Übersicht ───────────────────────────────────────────
  app.get(
    "/",
    lesen,
    async (request, reply) => {
      const themen = await prisma.thema.findMany({
        where:   themaSichtbarFilter(request.benutzer),
        select: {
          id: true, titel: true, beschreibung: true, status: true, vertraulichkeit: true, nurTeam: true,
          naechsterSchritt: true, naechsterTermin: true, erstelltAm: true, aktualisiertAm: true,
          beteiligte: { select: { zustaendig: true, benutzer: BENUTZER } },
          _count:     { select: { eintraege: true } },
          eintraege:  { select: { erstelltAm: true }, orderBy: { erstelltAm: "desc" }, take: 1 },
        },
        orderBy: { aktualisiertAm: "desc" },
      });
      return reply.send(themen.map(({ eintraege, ...t }) => ({
        ...t,
        letzteAktivitaet: [t.aktualisiertAm, eintraege[0]?.erstelltAm].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0],
      })));
    }
  );

  // ── POST / – Thema anlegen ──────────────────────────────────────
  app.post<{ Body: { titel: string; beschreibung?: string; vertraulichkeit?: ThemaVertraulichkeit; status?: ThemaStatus } }>(
    "/",
    {
      preValidation: [authenticate, erfordert(Role.MITGLIED)],
      schema: {
        body: {
          type: "object", required: ["titel"],
          properties: {
            titel:           { type: "string", minLength: 1, maxLength: 300 },
            beschreibung:    { type: "string", maxLength: 5000 },
            vertraulichkeit: { type: "string", enum: Object.values(ThemaVertraulichkeit) },
            status:          { type: "string", enum: Object.values(ThemaStatus) },
          },
        },
      },
    },
    async (request, reply) => {
      const { titel, beschreibung, vertraulichkeit, status } = request.body;
      // Wer anlegt, ist zuständig – so sieht man das eigene Thema auch bei „nur Vorsitz“
      const thema = await prisma.thema.create({
        data: {
          titel: titel.trim(), beschreibung: beschreibung?.trim() || null,
          vertraulichkeit: vertraulichkeit ?? ThemaVertraulichkeit.ALLE,
          status: status ?? ThemaStatus.OFFEN,
          abgeschlossenAm: status === ThemaStatus.ABGESCHLOSSEN ? new Date() : null,
          erstelltVonId: request.benutzer.sub,
          beteiligte: { create: { benutzerId: request.benutzer.sub, zustaendig: true } },
        },
        select: { id: true, titel: true },
      });
      await audit(request, AuditAktion.THEMA_ERSTELLT, { themaId: thema.id, titel: thema.titel });
      return reply.status(201).send(thema);
    }
  );

  // ── GET /:id – Kopf und Verknüpfungen ───────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id",
    lesen,
    async (request, reply) => {
      const basis = await themaOder404(request, reply, request.params.id);
      if (!basis) return reply;
      const leser: Leser = request.benutzer;
      const t = await prisma.thema.findUnique({
        where: { id: basis.id },
        include: {
          erstelltVon: BENUTZER,
          beteiligte:  { select: { zustaendig: true, benutzer: BENUTZER }, orderBy: { benutzer: { name: "asc" } } },
          dokumente:   {
            where:  { status: { not: DokumentStatus.GELOESCHT } },
            select: { id: true, titel: true, alias: true, kategorie: true, vertraulich: true, vertraulichFuerMitglieder: true, hochgeladenVonId: true, erstelltAm: true },
          },
          tops: {
            select: {
              id: true, nummer: true, titel: true, vertraulich: true, externAusgeschlossen: true,
              sitzung: { select: { id: true, titel: true, sitzungsdatum: true, status: true } },
            },
          },
          aufgaben: {
            where:  { OR: [{ sichtbarkeit: "OEFFENTLICH" }, { erstelltVonId: leser.sub }, { zugewiesenAnId: leser.sub }] },
            select: { id: true, titel: true, erledigt: true, faelligAm: true, zugewiesenAn: BENUTZER },
          },
          betriebsvereinbarungen: { select: { id: true, titel: true, status: true, abschlussdatum: true } },
        },
      });
      if (!t) return reply.status(404).send({ fehler: "Thema nicht gefunden" });
      const { dokumente, tops, ...rest } = t;
      return reply.send({
        ...rest,
        dokumente: dokumente.filter(d => darfDokumentSehen(d, leser.rolle, leser.sub))
          .map(({ vertraulich, vertraulichFuerMitglieder, hochgeladenVonId, ...d }) => ({ ...d, vertraulich })),
        tops: tops.filter(x => topSichtbar(x, leser.rolle)).map(({ externAusgeschlossen, ...x }) => x),
        rechte: { schreiben: await darfSchreiben(basis, leser), verwalten: istLeitung(leser.rolle) },
      });
    }
  );

  // ── PATCH /:id – Kopf ändern ────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: {
    titel?: string; beschreibung?: string | null; status?: ThemaStatus;
    naechsterSchritt?: string | null; naechsterTermin?: string | null;
    beteiligte?: { benutzerId: string; zustaendig?: boolean }[];
    vertraulichkeit?: ThemaVertraulichkeit; nurTeam?: boolean;
  } }>(
    "/:id",
    {
      preValidation: [authenticate, erfordert(Role.ERSATZMITGLIED)],
      schema: {
        body: {
          type: "object",
          properties: {
            titel:            { type: "string", minLength: 1, maxLength: 300 },
            beschreibung:     { type: ["string", "null"], maxLength: 5000 },
            status:           { type: "string", enum: Object.values(ThemaStatus) },
            naechsterSchritt: { type: ["string", "null"], maxLength: 500 },
            naechsterTermin:  { type: ["string", "null"] },
            beteiligte: {
              type: "array", maxItems: 50,
              items: { type: "object", required: ["benutzerId"], properties: { benutzerId: { type: "string" }, zustaendig: { type: "boolean" } } },
            },
            vertraulichkeit:  { type: "string", enum: Object.values(ThemaVertraulichkeit) },
            nurTeam:          { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const thema = await themaOder404(request, reply, request.params.id, true);
      if (!thema) return reply;
      const b = request.body;
      if ((b.vertraulichkeit !== undefined || b.nurTeam !== undefined) && !istLeitung(request.benutzer.rolle)) {
        return reply.status(403).send({ fehler: "Vertraulichkeit und Projektteam legen Vorsitz oder Stellvertretung fest" });
      }
      let beteiligte: { benutzerId: string; zustaendig: boolean }[] | null = null;
      if (b.beteiligte) {
        beteiligte = await beteiligtePruefen(b.beteiligte);
        if (!beteiligte) return reply.status(400).send({ fehler: "Beteiligt sein können nur aktive Mitglieder des Gremiums" });
      }
      let termin: Date | null | undefined;
      if (b.naechsterTermin !== undefined) {
        termin = b.naechsterTermin ? new Date(b.naechsterTermin) : null;
        if (termin && Number.isNaN(termin.getTime())) return reply.status(400).send({ fehler: "Ungültiger Termin" });
      }

      await prisma.$transaction(async tx => {
        await tx.thema.update({
          where: { id: thema.id },
          data: {
            ...(b.titel            !== undefined && { titel: b.titel.trim() }),
            ...(b.beschreibung     !== undefined && { beschreibung: b.beschreibung?.trim() || null }),
            ...(b.naechsterSchritt !== undefined && { naechsterSchritt: b.naechsterSchritt?.trim() || null }),
            ...(termin             !== undefined && { naechsterTermin: termin }),
            ...(b.vertraulichkeit  !== undefined && { vertraulichkeit: b.vertraulichkeit }),
            ...(b.nurTeam          !== undefined && { nurTeam: b.nurTeam }),
            ...(b.status !== undefined && b.status !== thema.status && {
              status: b.status,
              abgeschlossenAm: b.status === ThemaStatus.ABGESCHLOSSEN ? new Date() : null,
            }),
          },
        });
        if (beteiligte) {
          await tx.themaBeteiligter.deleteMany({ where: { themaId: thema.id } });
          await tx.themaBeteiligter.createMany({ data: beteiligte.map(x => ({ ...x, themaId: thema.id })) });
        }
      });
      await audit(request, AuditAktion.THEMA_GEAENDERT, { themaId: thema.id, felder: Object.keys(b) });
      return reply.send({ ok: true });
    }
  );

  // ── DELETE /:id ─────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const thema = await themaOder404(request, reply, request.params.id);
      if (!thema) return reply;
      await prisma.thema.delete({ where: { id: thema.id } });
      await audit(request, AuditAktion.THEMA_GELOESCHT, { themaId: thema.id, titel: thema.titel });
      return reply.send({ ok: true });
    }
  );

  // ── GET /:id/verlauf ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id/verlauf",
    lesen,
    async (request, reply) => {
      const thema = await themaOder404(request, reply, request.params.id);
      if (!thema) return reply;
      const [beitraege, auto] = await Promise.all([
        prisma.themaEintrag.findMany({
          where:   { themaId: thema.id },
          select:  {
            id: true, art: true, inhalt: true, inhaltJson: true, angeheftet: true, erstelltAm: true,
            autor: BENUTZER, bezug: { select: { id: true, art: true, erstelltAm: true, autor: BENUTZER } },
            _count: { select: { kommentare: true } },
          },
          orderBy: { erstelltAm: "asc" },
        }),
        automatischeEintraege(thema.id, request.benutzer),
      ]);
      return reply.send({
        beitraege,
        automatisch: auto.sort((a, b) => a.zeit.getTime() - b.zeit.getTime()),
      });
    }
  );

  // ── POST /:id/eintraege – Beitrag ───────────────────────────────
  app.post<{ Params: { id: string }; Body: { art?: ThemaEintragArt; inhalt: string; inhaltJson?: object; bezugId?: string | null } }>(
    "/:id/eintraege",
    {
      preValidation: [authenticate, erfordert(Role.ERSATZMITGLIED)],
      schema: {
        body: {
          type: "object", required: ["inhalt"],
          properties: {
            art:        { type: "string", enum: Object.values(ThemaEintragArt) },
            inhalt:     { type: "string", minLength: 1, maxLength: 50000 },
            inhaltJson: { type: "object" },
            bezugId:    { type: ["string", "null"] },
          },
        },
      },
    },
    async (request, reply) => {
      const thema = await themaOder404(request, reply, request.params.id, true);
      if (!thema) return reply;
      const { art, inhalt, inhaltJson, bezugId } = request.body;
      if (!inhalt.trim()) return reply.status(400).send({ fehler: "Der Beitrag ist leer" });
      if (bezugId && !(await prisma.themaEintrag.count({ where: { id: bezugId, themaId: thema.id } }))) {
        return reply.status(400).send({ fehler: "Bezug gehört nicht zu diesem Thema" });
      }
      const eintrag = await prisma.themaEintrag.create({
        data: {
          themaId: thema.id, art: art ?? ThemaEintragArt.NOTIZ, inhalt: inhalt.trim(),
          inhaltJson: inhaltJson as Prisma.InputJsonValue | undefined, bezugId: bezugId || null, autorId: request.benutzer.sub,
        },
        select: { id: true },
      });
      await prisma.thema.update({ where: { id: thema.id }, data: { aktualisiertAm: new Date() } });

      // Benachrichtigungen: Erwähnte und Beteiligte – nur wer das Thema sehen darf
      const autor = await prisma.benutzer.findUnique({ where: { id: request.benutzer.sub }, select: { name: true } });
      const name = autor?.name ?? "Jemand";
      const erwaehnt = await sehenDuerfen(thema.id, erwaehntePersonen(inhaltJson).filter(id => id !== request.benutzer.sub));
      const beteiligte = await sehenDuerfen(thema.id, thema.beteiligte.map(x => x.benutzerId).filter(id => !erwaehnt.includes(id)));
      await benachrichtigen({
        art: "ERWAEHNUNG", empfaengerIds: erwaehnt, ausloeserId: request.benutzer.sub, link: themaLink(thema.id),
        betreff: `${name} hat dich erwähnt`, inhalt: `${name} hat dich in einem Beitrag zum Thema „${thema.titel}“ erwähnt.`,
      });
      await benachrichtigen({
        art: "THEMA_BEITRAG", empfaengerIds: beteiligte, ausloeserId: request.benutzer.sub, link: themaLink(thema.id),
        betreff: `Neuer Beitrag: ${thema.titel}`, inhalt: `${name} hat einen Beitrag zum Thema „${thema.titel}“ geschrieben.`,
      });
      return reply.status(201).send(eintrag);
    }
  );

  // ── PATCH /:id/eintraege/:eid – nur Anheften ────────────────────
  app.patch<{ Params: { id: string; eid: string }; Body: { angeheftet: boolean } }>(
    "/:id/eintraege/:eid",
    {
      preValidation: [authenticate, erfordert(Role.ERSATZMITGLIED)],
      schema: { body: { type: "object", required: ["angeheftet"], additionalProperties: false, properties: { angeheftet: { type: "boolean" } } } },
    },
    async (request, reply) => {
      const thema = await themaOder404(request, reply, request.params.id, true);
      if (!thema) return reply;
      const r = await prisma.themaEintrag.updateMany({ where: { id: request.params.eid, themaId: thema.id }, data: { angeheftet: request.body.angeheftet } });
      if (!r.count) return reply.status(404).send({ fehler: "Beitrag nicht gefunden" });
      return reply.send({ ok: true });
    }
  );

  // ── Verknüpfungen ───────────────────────────────────────────────
  type VerknuepfungTyp = "DOKUMENT" | "TOP" | "AUFGABE" | "BV";
  const TYPEN: VerknuepfungTyp[] = ["DOKUMENT", "TOP", "AUFGABE", "BV"];

  /** Prüft, ob die Person das Ziel sehen darf, und setzt bzw. löst themaId */
  async function verknuepfen(leser: Leser, typ: VerknuepfungTyp, zielId: string, themaId: string | null, nurWennVon?: string): Promise<boolean> {
    const bedingung = nurWennVon ? { themaId: nurWennVon } : {};
    switch (typ) {
      case "DOKUMENT": {
        const d = await prisma.dokument.findFirst({ where: { id: zielId, status: { not: DokumentStatus.GELOESCHT }, ...bedingung } });
        if (!d || !darfDokumentSehen(d, leser.rolle, leser.sub)) return false;
        await prisma.dokument.update({ where: { id: zielId }, data: { themaId } });
        return true;
      }
      case "TOP": {
        const t = await prisma.tOP.findFirst({ where: { id: zielId, ...bedingung } });
        if (!t || !topSichtbar(t, leser.rolle)) return false;
        await prisma.tOP.update({ where: { id: zielId }, data: { themaId } });
        return true;
      }
      case "AUFGABE": {
        const a = await prisma.aufgabe.findFirst({
          where: { id: zielId, ...bedingung, OR: [{ sichtbarkeit: "OEFFENTLICH" }, { erstelltVonId: leser.sub }, { zugewiesenAnId: leser.sub }] },
        });
        if (!a) return false;
        await prisma.aufgabe.update({ where: { id: zielId }, data: { themaId } });
        return true;
      }
      case "BV": {
        const b = await prisma.betriebsvereinbarung.findFirst({ where: { id: zielId, ...bedingung } });
        if (!b) return false;
        await prisma.betriebsvereinbarung.update({ where: { id: zielId }, data: { themaId } });
        return true;
      }
    }
  }

  app.post<{ Params: { id: string }; Body: { typ: VerknuepfungTyp; zielId: string } }>(
    "/:id/verknuepfungen",
    {
      preValidation: [authenticate, erfordert(Role.ERSATZMITGLIED)],
      schema: {
        body: {
          type: "object", required: ["typ", "zielId"],
          properties: { typ: { type: "string", enum: TYPEN }, zielId: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const thema = await themaOder404(request, reply, request.params.id, true);
      if (!thema) return reply;
      if (!(await verknuepfen(request.benutzer, request.body.typ, request.body.zielId, thema.id))) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      await prisma.thema.update({ where: { id: thema.id }, data: { aktualisiertAm: new Date() } });
      return reply.send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string; typ: string; zielId: string } }>(
    "/:id/verknuepfungen/:typ/:zielId",
    { preHandler: [authenticate, erfordert(Role.ERSATZMITGLIED)] },
    async (request, reply) => {
      const thema = await themaOder404(request, reply, request.params.id, true);
      if (!thema) return reply;
      const typ = request.params.typ as VerknuepfungTyp;
      if (!TYPEN.includes(typ)) return reply.status(400).send({ fehler: "Unbekannte Verknüpfung" });
      if (!(await verknuepfen(request.benutzer, typ, request.params.zielId, null, thema.id))) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      return reply.send({ ok: true });
    }
  );

  // ── GET /:id/chronik – PDF ──────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id/chronik",
    lesen,
    async (request, reply) => {
      const thema = await themaOder404(request, reply, request.params.id);
      if (!thema) return reply;
      const [kopf, beitraege, auto] = await Promise.all([
        prisma.thema.findUnique({
          where: { id: thema.id },
          select: { beteiligte: { select: { zustaendig: true, benutzer: BENUTZER }, orderBy: { benutzer: { name: "asc" } } } },
        }),
        prisma.themaEintrag.findMany({
          where: { themaId: thema.id }, orderBy: { erstelltAm: "asc" },
          select: { art: true, inhalt: true, erstelltAm: true, angeheftet: true, autor: BENUTZER, bezug: { select: { erstelltAm: true } } },
        }),
        automatischeEintraege(thema.id, request.benutzer),
      ]);
      const kurz = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
      const eintraege = [
        ...beitraege.map(b => ({
          zeit: b.erstelltAm, automatisch: false, text: b.inhalt,
          kopf: `${THEMA_EINTRAG_LABEL[b.art]} · ${b.autor.name}${b.bezug ? ` · Bezug auf den Beitrag vom ${kurz(b.bezug.erstelltAm)}` : ""}${b.angeheftet ? " · angeheftet" : ""}`,
        })),
        ...auto.map(a => ({ zeit: a.zeit, automatisch: true, kopf: a.text, text: "" })),
      ].sort((a, b) => a.zeit.getTime() - b.zeit.getTime());

      const pdf = await themenChronikPdfGenerieren({
        titel: thema.titel, status: THEMA_STATUS_LABEL[thema.status],
        vertraulichkeit: THEMA_VERTRAULICHKEIT_LABEL[thema.vertraulichkeit],
        beschreibung: thema.beschreibung,
        zustaendige: (kopf?.beteiligte ?? []).filter(b => b.zustaendig).map(b => b.benutzer.name),
        team:        (kopf?.beteiligte ?? []).filter(b => !b.zustaendig).map(b => b.benutzer.name),
        naechsterSchritt: thema.naechsterSchritt, naechsterTermin: thema.naechsterTermin,
        eintraege,
      });
      const dateiname = `Themenakte_${thema.titel.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60)}.pdf`;
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(dateiname)}`)
        .send(pdf);
    }
  );
}
