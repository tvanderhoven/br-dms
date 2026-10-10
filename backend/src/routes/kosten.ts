/**
 * Kostenübersicht des Betriebsrats (§ 40 BetrVG)
 *
 * GET    /api/kosten?jahr=2026            – Posten eines Jahres + Summen + Jahre mit Daten
 * GET    /api/kosten/export.csv?jahr=     – Jahresübersicht als CSV (Excel)
 * GET    /api/kosten/export.pdf?jahr=     – Jahresübersicht als PDF
 * POST   /api/kosten                      – Posten anlegen
 * PUT    /api/kosten/:id                  – Posten ändern (aus Schulungen: nur Status, Beschluss, Rechnung, Bemerkung)
 * DELETE /api/kosten/:id                  – Posten löschen (nicht die aus Schulungen)
 * PATCH  /api/kosten/br-schulungen        – welche Qualifikationen als BR-Schulung zählen
 *
 * Lesen: Mitglieder und aktiv vertretende Ersatzmitglieder. Ändern: Vorsitz und Stellvertretung.
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import { AuditAktion, KostenArt, KostenStatus, Prisma, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { darfDokumentSehen } from "../lib/vertraulich.js";
import { euro, KOSTEN_ART_LABEL, KOSTEN_STATUS_LABEL, schulungskostenAbgleichen } from "../lib/kosten.js";
import { kostenuebersichtPdfGenerieren } from "../services/pdf.service.js";

const POSTEN_INCLUDE = {
  beschluss: {
    select: {
      id: true, antragstext: true,
      top: { select: { nummer: true, sitzung: { select: { titel: true, sitzungsdatum: true } } } },
    },
  },
  dokument: { select: { id: true, titel: true, vertraulich: true, hochgeladenVonId: true } },
} satisfies Prisma.KostenpostenInclude;

type PostenRoh = Prisma.KostenpostenGetPayload<{ include: typeof POSTEN_INCLUDE }>;

/** Für die Antwort aufbereiten – fremde vertrauliche Rechnungen nur ohne Titel */
function aufbereiten(p: PostenRoh, request: FastifyRequest) {
  const { dokument, beschluss, ...rest } = p;
  return {
    ...rest,
    ausSchulung: p.schulungsterminId !== null,
    beschluss: beschluss && {
      id:            beschluss.id,
      antragstext:   beschluss.antragstext,
      topNummer:     beschluss.top.nummer,
      sitzungTitel:  beschluss.top.sitzung.titel,
      sitzungsdatum: beschluss.top.sitzung.sitzungsdatum,
    },
    dokument: dokument && (darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)
      ? { id: dokument.id, titel: dokument.titel, sichtbar: true }
      : { id: dokument.id, titel: "Vertrauliches Dokument", sichtbar: false }),
  };
}

export function kostenSummen(posten: { art: KostenArt; status: KostenStatus; betragCent: number }[]) {
  const nachArt    = Object.fromEntries(Object.values(KostenArt).map(a => [a, 0])) as Record<KostenArt, number>;
  const nachStatus = Object.fromEntries(Object.values(KostenStatus).map(s => [s, 0])) as Record<KostenStatus, number>;
  let gesamt = 0;
  for (const p of posten) {
    nachStatus[p.status] += p.betragCent;
    if (p.status === KostenStatus.ABGELEHNT) continue; // abgelehnte Kosten zählen nicht zur Summe
    nachArt[p.art] += p.betragCent;
    gesamt += p.betragCent;
  }
  return { gesamt, nachArt, nachStatus };
}

function jahrAus(wert: string | undefined): number {
  const j = Number(wert);
  return Number.isInteger(j) && j >= 2000 && j <= 2100 ? j : new Date().getFullYear();
}

async function jahrLaden(jahr: number) {
  await schulungskostenAbgleichen();
  return prisma.kostenposten.findMany({
    where:   { datum: { gte: new Date(Date.UTC(jahr, 0, 1)), lt: new Date(Date.UTC(jahr + 1, 0, 1)) } },
    include: POSTEN_INCLUDE,
    orderBy: [{ datum: "asc" }, { erstelltAm: "asc" }],
  });
}

interface PostenEingabe {
  datum?:       string;
  art?:         KostenArt;
  bezeichnung?: string;
  empfaenger?:  string | null;
  betragCent?:  number;
  status?:      KostenStatus;
  bemerkung?:   string | null;
  beschlussId?: string | null;
  dokumentId?:  string | null;
}

const EINGABE_SCHEMA = {
  type: "object",
  properties: {
    datum:       { type: "string", format: "date" },
    art:         { type: "string", enum: Object.values(KostenArt).filter(a => a !== KostenArt.SCHULUNG) },
    bezeichnung: { type: "string", minLength: 1, maxLength: 300 },
    empfaenger:  { type: ["string", "null"], maxLength: 200 },
    betragCent:  { type: "integer", minimum: 0, maximum: 100_000_000 },
    status:      { type: "string", enum: Object.values(KostenStatus) },
    bemerkung:   { type: ["string", "null"], maxLength: 2000 },
    beschlussId: { type: ["string", "null"], format: "uuid" },
    dokumentId:  { type: ["string", "null"], format: "uuid" },
  },
  additionalProperties: false,
} as const;

export async function kostenRouten(app: FastifyInstance): Promise<void> {

  const lesen    = { preHandler: [authenticate, erfordert(Role.MITGLIED)] };
  const schreiben = [authenticate, erfordert(Role.VORSITZ)];

  /** Beschluss muss finalisiert sein, Dokument sichtbar – sonst Fehlertext */
  async function verknuepfungenPruefen(request: FastifyRequest, e: PostenEingabe): Promise<string | null> {
    if (e.beschlussId) {
      const b = await prisma.beschluss.findUnique({ where: { id: e.beschlussId }, select: { finalisiert: true } });
      if (!b?.finalisiert) return "Beschluss nicht gefunden oder noch nicht finalisiert";
    }
    if (e.dokumentId) {
      const d = await prisma.dokument.findUnique({ where: { id: e.dokumentId }, select: { vertraulich: true, hochgeladenVonId: true } });
      if (!d || !darfDokumentSehen(d, request.benutzer.rolle, request.benutzer.sub)) return "Dokument nicht gefunden";
    }
    return null;
  }

  const audit = (request: FastifyRequest, aktion: AuditAktion, details: Record<string, unknown>) =>
    prisma.auditLog.create({
      data: { benutzerId: request.benutzer.sub, aktion, ip: request.ip, details: JSON.parse(JSON.stringify(details)) },
    });

  // ── GET / ──────────────────────────────────────────────────────
  app.get<{ Querystring: { jahr?: string } }>("/", lesen, async (request, reply) => {
    const jahr   = jahrAus(request.query.jahr);
    const posten = await jahrLaden(jahr);
    const daten  = await prisma.kostenposten.findMany({ select: { datum: true } });
    const jahre  = [...new Set([...daten.map(d => d.datum.getUTCFullYear()), new Date().getFullYear(), jahr])].sort((a, b) => b - a);
    const brSchulungen = await prisma.qualifikation.findMany({
      select: { id: true, name: true, brSchulung: true }, orderBy: { name: "asc" },
    });
    return reply.send({
      jahr, jahre, brSchulungen,
      posten: posten.map(p => aufbereiten(p, request)),
      summen: kostenSummen(posten),
    });
  });

  // ── Export ─────────────────────────────────────────────────────
  app.get<{ Querystring: { jahr?: string } }>("/export.csv", lesen, async (request, reply) => {
    const jahr   = jahrAus(request.query.jahr);
    const posten = (await jahrLaden(jahr)).map(p => aufbereiten(p, request));
    // Semikolon und Komma als Dezimaltrennzeichen – so öffnet Excel (deutsch) die Datei direkt richtig
    const feld = (v: string) => /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    // Führende =, +, -, @ würde Excel als Formel ausführen
    const sicher = (v: string | null | undefined) => feld(/^[=+\-@]/.test(v ?? "") ? `'${v}` : (v ?? ""));
    const zeilen = [
      ["Datum", "Art", "Bezeichnung", "Empfänger", "Betrag (EUR)", "Status", "Beschluss", "Rechnung/Dokument", "Bemerkung"].join(";"),
      ...posten.map(p => [
        p.datum.toLocaleDateString("de-DE", { timeZone: "UTC" }),
        KOSTEN_ART_LABEL[p.art],
        sicher(p.bezeichnung),
        sicher(p.empfaenger),
        (p.betragCent / 100).toFixed(2).replace(".", ","),
        KOSTEN_STATUS_LABEL[p.status],
        sicher(p.beschluss ? `${p.beschluss.sitzungTitel}, TOP ${p.beschluss.topNummer}` : ""),
        sicher(p.dokument?.titel),
        sicher(p.bemerkung),
      ].join(";")),
    ];
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="BR-Kosten_${jahr}.csv"`)
      .send("﻿" + zeilen.join("\r\n") + "\r\n");
  });

  app.get<{ Querystring: { jahr?: string } }>("/export.pdf", lesen, async (request, reply) => {
    const jahr   = jahrAus(request.query.jahr);
    const roh    = await jahrLaden(jahr);
    const posten = roh.map(p => aufbereiten(p, request));
    const pdf = await kostenuebersichtPdfGenerieren(jahr, posten.map(p => ({
      datum:       p.datum,
      art:         KOSTEN_ART_LABEL[p.art],
      bezeichnung: p.bezeichnung,
      empfaenger:  p.empfaenger,
      betrag:      euro(p.betragCent),
      status:      KOSTEN_STATUS_LABEL[p.status],
      abgelehnt:   p.status === KostenStatus.ABGELEHNT,
      beschluss:   p.beschluss ? `${p.beschluss.sitzungTitel}, TOP ${p.beschluss.topNummer}` : null,
    })), (() => {
      const s = kostenSummen(roh);
      return {
        gesamt:  euro(s.gesamt),
        nachArt: Object.values(KostenArt).filter(a => s.nachArt[a] > 0).map(a => [KOSTEN_ART_LABEL[a], euro(s.nachArt[a])] as [string, string]),
        offen:   euro(s.nachStatus.BEANTRAGT + s.nachStatus.ZUGESAGT),
        bezahlt: euro(s.nachStatus.BEZAHLT),
        abgelehnt: euro(s.nachStatus.ABGELEHNT),
      };
    })());
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="BR-Kosten_${jahr}.pdf"`)
      .send(pdf);
  });

  // ── POST / ─────────────────────────────────────────────────────
  app.post<{ Body: PostenEingabe }>(
    "/",
    { preValidation: schreiben, schema: { body: { ...EINGABE_SCHEMA, required: ["datum", "art", "bezeichnung", "betragCent"] } } },
    async (request, reply) => {
      const e = request.body;
      const fehler = await verknuepfungenPruefen(request, e);
      if (fehler) return reply.status(400).send({ fehler });
      const p = await prisma.kostenposten.create({
        data: {
          datum: new Date(e.datum!), art: e.art!, bezeichnung: e.bezeichnung!.trim(),
          empfaenger: e.empfaenger?.trim() || null, betragCent: e.betragCent!, status: e.status ?? KostenStatus.BEANTRAGT,
          bemerkung: e.bemerkung?.trim() || null, beschlussId: e.beschlussId ?? null, dokumentId: e.dokumentId ?? null,
          erstelltVonId: request.benutzer.sub,
        },
        include: POSTEN_INCLUDE,
      });
      await audit(request, AuditAktion.KOSTEN_ERSTELLT, { id: p.id, bezeichnung: p.bezeichnung, betrag: euro(p.betragCent) });
      return reply.status(201).send(aufbereiten(p, request));
    }
  );

  // ── PATCH /br-schulungen ───────────────────────────────────────
  // Vor "/:id" registriert – statische Pfade haben ohnehin Vorrang, so bleibt es lesbar
  app.patch<{ Body: { qualifikationIds: string[] } }>(
    "/br-schulungen",
    {
      preValidation: schreiben,
      schema: {
        body: {
          type: "object", required: ["qualifikationIds"],
          properties: { qualifikationIds: { type: "array", items: { type: "string", format: "uuid" }, uniqueItems: true } },
        },
      },
    },
    async (request, reply) => {
      const ids = request.body.qualifikationIds;
      await prisma.$transaction([
        prisma.qualifikation.updateMany({ where: { id: { in: ids } },     data: { brSchulung: true } }),
        prisma.qualifikation.updateMany({ where: { id: { notIn: ids } }, data: { brSchulung: false } }),
      ]);
      await schulungskostenAbgleichen();
      await audit(request, AuditAktion.KOSTEN_GEAENDERT, { brSchulungen: ids });
      return reply.send({ ok: true });
    }
  );

  // ── PUT /:id ───────────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: PostenEingabe }>(
    "/:id",
    { preValidation: schreiben, schema: { body: EINGABE_SCHEMA } },
    async (request, reply) => {
      const alt = await prisma.kostenposten.findUnique({ where: { id: request.params.id } });
      if (!alt) return reply.status(404).send({ fehler: "Posten nicht gefunden" });
      const e = request.body;

      // Aus einer Schulung: Datum, Art, Bezeichnung, Empfänger und Betrag gehören der Schulung
      if (alt.schulungsterminId && (e.datum || e.art || e.bezeichnung || e.empfaenger !== undefined || e.betragCent !== undefined)) {
        return reply.status(400).send({ fehler: "Datum, Bezeichnung und Betrag kommen aus der Schulung – bitte dort ändern" });
      }
      const fehler = await verknuepfungenPruefen(request, e);
      if (fehler) return reply.status(400).send({ fehler });

      const p = await prisma.kostenposten.update({
        where: { id: alt.id },
        data: {
          ...(e.datum       ? { datum: new Date(e.datum) } : {}),
          ...(e.art         ? { art: e.art } : {}),
          ...(e.bezeichnung ? { bezeichnung: e.bezeichnung.trim() } : {}),
          ...(e.empfaenger  !== undefined ? { empfaenger: e.empfaenger?.trim() || null } : {}),
          ...(e.betragCent  !== undefined ? { betragCent: e.betragCent } : {}),
          ...(e.status      ? { status: e.status } : {}),
          ...(e.bemerkung   !== undefined ? { bemerkung: e.bemerkung?.trim() || null } : {}),
          ...(e.beschlussId !== undefined ? { beschlussId: e.beschlussId } : {}),
          ...(e.dokumentId  !== undefined ? { dokumentId: e.dokumentId } : {}),
        },
        include: POSTEN_INCLUDE,
      });
      await audit(request, AuditAktion.KOSTEN_GEAENDERT, {
        id: p.id, bezeichnung: p.bezeichnung,
        ...(alt.status !== p.status ? { status: `${KOSTEN_STATUS_LABEL[alt.status]} → ${KOSTEN_STATUS_LABEL[p.status]}` } : {}),
        ...(alt.betragCent !== p.betragCent ? { betrag: `${euro(alt.betragCent)} → ${euro(p.betragCent)}` } : {}),
      });
      return reply.send(aufbereiten(p, request));
    }
  );

  // ── DELETE /:id ────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>("/:id", { preHandler: schreiben }, async (request, reply) => {
    const p = await prisma.kostenposten.findUnique({ where: { id: request.params.id } });
    if (!p) return reply.status(404).send({ fehler: "Posten nicht gefunden" });
    if (p.schulungsterminId) {
      return reply.status(400).send({ fehler: "Kommt aus einer Schulung – dort die Kosten entfernen oder den Termin absagen" });
    }
    await prisma.kostenposten.delete({ where: { id: p.id } });
    await audit(request, AuditAktion.KOSTEN_GELOESCHT, { bezeichnung: p.bezeichnung, betrag: euro(p.betragCent) });
    return reply.send({ ok: true });
  });
}
