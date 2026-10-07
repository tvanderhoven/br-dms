import { FastifyInstance, FastifyRequest } from "fastify";
import { AuditAktion, FristStatus, FristTyp, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { dokumentVertraulichFilter } from "../lib/vertraulich.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { FristenWorker } from "../workers/fristen.worker.js";

const FRIST_INCLUDE = {
  dokument: {
    select: { id: true, titel: true, alias: true, kategorie: true, aktenzeichen: true },
  },
  erledigtVon: { select: { name: true } },
} as const;

async function audit(request: FastifyRequest, aktion: AuditAktion, fristId: string, dokumentId: string | null, details: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      benutzerId: request.benutzer.sub,
      dokumentId,
      aktion,
      ip:         request.ip,
      userAgent:  request.headers["user-agent"] ?? null,
      details:    JSON.parse(JSON.stringify({ fristId, ...details })),
    },
  });
}

function gueltigesDatum(wert: unknown): Date | null {
  if (typeof wert !== "string" || !wert) return null;
  const d = new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fristenRouten(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { von?: string; bis?: string; status?: string } }>(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { von, bis, status } = request.query;
      const { rolle, sub } = request.benutzer;

      const fristen = await prisma.frist.findMany({
        where: {
          ...(status ? { status: status as FristStatus } : {}),
          ...(von || bis ? {
            faelligAm: {
              ...(von ? { gte: new Date(von) } : {}),
              ...(bis ? { lte: new Date(new Date(bis).setHours(23, 59, 59, 999)) } : {}),
            },
          } : {}),
          // Fristen ohne Dokument sieht jeder; bei Dokument-Fristen gelten die
          // Sichtbarkeitsregeln des Dokuments (gelöscht/vertraulich).
          OR: [
            { dokumentId: null },
            {
              dokument: {
                status: { not: "GELOESCHT" },
                ...dokumentVertraulichFilter(rolle, sub),
              },
            },
          ],
        },
        include: FRIST_INCLUDE,
        orderBy: { faelligAm: "asc" },
      });

      return reply.send(fristen);
    }
  );

  // ── POST / – Frist anlegen (mit oder ohne Dokument) ───────────────
  app.post<{ Body: { bezeichnung?: string; faelligAm?: string; typ?: FristTyp; dokumentId?: string; notiz?: string } }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const { bezeichnung, faelligAm, typ, dokumentId, notiz } = request.body ?? {};
      const datum = gueltigesDatum(faelligAm);
      if (!datum) return reply.status(400).send({ fehler: "faelligAm ist ein Pflichtfeld (Datum)" });
      if (!dokumentId && !bezeichnung?.trim()) {
        return reply.status(400).send({ fehler: "Fristen ohne Dokument brauchen eine Bezeichnung" });
      }
      if (typ && !Object.values(FristTyp).includes(typ)) {
        return reply.status(400).send({ fehler: "Unbekannter Fristtyp" });
      }
      if (dokumentId && !(await prisma.dokument.findUnique({ where: { id: dokumentId }, select: { id: true } }))) {
        return reply.status(404).send({ fehler: "Dokument nicht gefunden" });
      }

      const frist = await prisma.frist.create({
        data: {
          dokumentId:    dokumentId ?? null,
          typ:           typ ?? FristTyp.BENUTZERDEFINIERT,
          faelligAm:     datum,
          bezeichnung:   bezeichnung?.trim() || null,
          notiz:         notiz?.trim() || null,
          erstelltVonId: request.benutzer.sub,
        },
        include: FRIST_INCLUDE,
      });
      await audit(request, AuditAktion.FRIST_ERSTELLT, frist.id, frist.dokumentId, {
        bezeichnung: frist.bezeichnung, faelligAm: frist.faelligAm, typ: frist.typ,
      });
      return reply.status(201).send(frist);
    }
  );

  // ── PATCH /:id – bearbeiten bzw. erledigen / wieder öffnen ─────────
  app.patch<{ Params: { id: string }; Body: { bezeichnung?: string; faelligAm?: string; notiz?: string; erledigt?: boolean } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const alt = await prisma.frist.findUnique({ where: { id: request.params.id } });
      if (!alt) return reply.status(404).send({ fehler: "Frist nicht gefunden" });

      const { bezeichnung, faelligAm, notiz, erledigt } = request.body ?? {};
      let datum: Date | undefined;
      if (faelligAm !== undefined) {
        const d = gueltigesDatum(faelligAm);
        if (!d) return reply.status(400).send({ fehler: "Ungültiges Datum" });
        datum = d;
      }
      if (bezeichnung !== undefined && !bezeichnung.trim() && !alt.dokumentId) {
        return reply.status(400).send({ fehler: "Fristen ohne Dokument brauchen eine Bezeichnung" });
      }

      const frist = await prisma.frist.update({
        where: { id: alt.id },
        data: {
          ...(bezeichnung !== undefined && { bezeichnung: bezeichnung.trim() || null }),
          ...(notiz !== undefined && { notiz: notiz.trim() || null }),
          ...(datum && { faelligAm: datum }),
          ...(erledigt === true && {
            status: FristStatus.ERLEDIGT, erledigtAm: new Date(), erledigtVonId: request.benutzer.sub,
          }),
          ...(erledigt === false && {
            status: FristStatus.OFFEN, erledigtAm: null, erledigtVonId: null,
          }),
        },
        include: FRIST_INCLUDE,
      });

      if (erledigt === true && alt.status !== FristStatus.ERLEDIGT) {
        await audit(request, AuditAktion.FRIST_ERLEDIGT, frist.id, frist.dokumentId, { titel: frist.bezeichnung });
      }
      return reply.send(frist);
    }
  );

  // ── DELETE /:id – einzelne Frist löschen (z.B. versehentlich falsche
  //                 Kündigungsart beim Upload gewählt) ─────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const frist = await prisma.frist.findUnique({ where: { id: request.params.id } });
      if (!frist) return reply.status(404).send({ fehler: "Frist nicht gefunden" });
      await prisma.frist.delete({ where: { id: request.params.id } });
      return reply.send({ ok: true });
    }
  );

  // ── POST /erinnerung-testen – Fristen-E-Mail sofort auslösen (Diagnose) ──
  app.post(
    "/erinnerung-testen",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request, reply) => {
      const ergebnis = await new FristenWorker().run();
      return reply.send(ergebnis);
    }
  );
}
