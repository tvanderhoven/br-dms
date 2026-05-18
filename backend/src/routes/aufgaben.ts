import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Prioritaet, Sichtbarkeit } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const BENUTZER_SELECT = { id: true, name: true, email: true };

export async function aufgabenRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – alle Aufgaben ─────────────────────────────────────
  app.get("/", { preHandler: [authenticate] }, async (req, reply) => {
    const aufgaben = await prisma.aufgabe.findMany({
      where: {
        OR: [
          { sichtbarkeit: "OEFFENTLICH" },
          { sichtbarkeit: "PRIVAT", erstelltVonId: req.benutzer.sub },
        ],
      },
      orderBy: [{ erledigt: "asc" }, { faelligAm: "asc" }, { erstelltAm: "desc" }],
      include: {
        erstelltVon:  { select: BENUTZER_SELECT },
        zugewiesenAn: { select: BENUTZER_SELECT },
      },
    });
    return reply.send(aufgaben);
  });

  // ── POST / – neue Aufgabe ─────────────────────────────────────
  app.post<{ Body: {
    titel: string;
    beschreibung?: string;
    prioritaet?: Prioritaet;
    faelligAm?: string;
    zugewiesenAnId?: string;
    sichtbarkeit?: Sichtbarkeit;
  } }>(
    "/",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          required: ["titel"],
          properties: {
            titel:          { type: "string", minLength: 1 },
            beschreibung:   { type: "string" },
            prioritaet:     { type: "string", enum: ["HOCH", "MITTEL", "NIEDRIG"] },
            faelligAm:      { type: "string" },
            zugewiesenAnId: { type: "string" },
            sichtbarkeit:   { type: "string", enum: ["PRIVAT", "OEFFENTLICH"] },
          },
        },
      },
    },
    async (req, reply) => {
      const { titel, beschreibung, prioritaet, faelligAm, zugewiesenAnId, sichtbarkeit } = req.body;
      const aufgabe = await prisma.aufgabe.create({
        data: {
          titel,
          beschreibung,
          prioritaet:    prioritaet ?? "MITTEL",
          sichtbarkeit:  sichtbarkeit ?? "OEFFENTLICH",
          faelligAm:     faelligAm ? new Date(faelligAm) : undefined,
          erstelltVonId: req.benutzer.sub,
          zugewiesenAnId: zugewiesenAnId || undefined,
        },
        include: {
          erstelltVon:  { select: BENUTZER_SELECT },
          zugewiesenAn: { select: BENUTZER_SELECT },
        },
      });
      return reply.status(201).send(aufgabe);
    }
  );

  // ── PATCH /:id – aktualisieren / abhaken ──────────────────────
  app.patch<{ Params: { id: string }; Body: {
    titel?: string;
    beschreibung?: string;
    prioritaet?: Prioritaet;
    faelligAm?: string | null;
    erledigt?: boolean;
    zugewiesenAnId?: string | null;
    sichtbarkeit?: Sichtbarkeit;
  } }>(
    "/:id",
    {
      preHandler: [authenticate],
      schema: {
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const { titel, beschreibung, prioritaet, faelligAm, erledigt, zugewiesenAnId, sichtbarkeit } = req.body;

      const data: Record<string, unknown> = {};
      if (titel         !== undefined) data.titel          = titel;
      if (beschreibung  !== undefined) data.beschreibung   = beschreibung;
      if (prioritaet    !== undefined) data.prioritaet     = prioritaet;
      if (sichtbarkeit  !== undefined) data.sichtbarkeit   = sichtbarkeit;
      if (faelligAm     !== undefined) data.faelligAm      = faelligAm ? new Date(faelligAm) : null;
      if (zugewiesenAnId !== undefined) data.zugewiesenAnId = zugewiesenAnId;
      if (erledigt      !== undefined) {
        data.erledigt   = erledigt;
        data.erledigtAm = erledigt ? new Date() : null;
      }

      const aufgabe = await prisma.aufgabe.update({
        where: { id },
        data,
        include: {
          erstelltVon:  { select: BENUTZER_SELECT },
          zugewiesenAn: { select: BENUTZER_SELECT },
        },
      });
      return reply.send(aufgabe);
    }
  );

  // ── DELETE /:id ───────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (req, reply) => {
      await prisma.aufgabe.delete({ where: { id: req.params.id } });
      return reply.send({ nachricht: "Aufgabe gelöscht" });
    }
  );
}
