import { FastifyInstance } from "fastify";
import { Prioritaet, Sichtbarkeit, AufgabeTyp } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const BENUTZER_SELECT = { id: true, name: true, email: true };

const AUFGABE_INCLUDE = {
  erstelltVon:  { select: BENUTZER_SELECT },
  zugewiesenAn: { select: BENUTZER_SELECT },
  oberProjekt:  { select: { id: true, titel: true, farbe: true } },
};

export async function aufgabenRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – alle Aufgaben (flach; Hierarchie baut das Frontend) ──
  app.get("/", { preHandler: [authenticate] }, async (req, reply) => {
    const aufgaben = await prisma.aufgabe.findMany({
      where: {
        OR: [
          { sichtbarkeit: "OEFFENTLICH" },
          { sichtbarkeit: "PRIVAT", erstelltVonId: req.benutzer.sub },
        ],
      },
      orderBy: [
        { typ: "asc" },           // AUFGABE kommt nach PROJEKT (alphabetisch)
        { erledigt: "asc" },
        { startDatum: "asc" },
        { faelligAm: "asc" },
        { erstelltAm: "desc" },
      ],
      include: AUFGABE_INCLUDE,
    });
    // Sortiere so dass PROJEKT vor AUFGABE steht
    const sortiert = [
      ...aufgaben.filter(a => a.typ === "PROJEKT"),
      ...aufgaben.filter(a => a.typ === "AUFGABE"),
    ];
    return reply.send(sortiert);
  });

  // ── POST / – neue Aufgabe oder Projekt ───────────────────────────
  app.post<{ Body: {
    titel: string;
    beschreibung?: string;
    typ?: AufgabeTyp;
    prioritaet?: Prioritaet;
    startDatum?: string;
    endDatum?: string;
    faelligAm?: string;
    farbe?: string;
    zugewiesenAnId?: string;
    sichtbarkeit?: Sichtbarkeit;
    oberProjektId?: string;
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
            typ:            { type: "string", enum: ["PROJEKT", "AUFGABE"] },
            prioritaet:     { type: "string", enum: ["HOCH", "MITTEL", "NIEDRIG"] },
            startDatum:     { type: "string" },
            endDatum:       { type: "string" },
            faelligAm:      { type: "string" },
            farbe:          { type: "string" },
            zugewiesenAnId: { type: "string" },
            sichtbarkeit:   { type: "string", enum: ["PRIVAT", "OEFFENTLICH"] },
            oberProjektId:  { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const {
        titel, beschreibung, typ, prioritaet,
        startDatum, endDatum, faelligAm, farbe,
        zugewiesenAnId, sichtbarkeit, oberProjektId,
      } = req.body;

      const aufgabe = await prisma.aufgabe.create({
        data: {
          titel,
          beschreibung,
          typ:           typ ?? "AUFGABE",
          prioritaet:    prioritaet ?? "MITTEL",
          sichtbarkeit:  sichtbarkeit ?? "OEFFENTLICH",
          startDatum:    startDatum ? new Date(startDatum) : undefined,
          endDatum:      endDatum   ? new Date(endDatum)   : undefined,
          faelligAm:     faelligAm  ? new Date(faelligAm)  : undefined,
          farbe:         farbe || undefined,
          erstelltVonId: req.benutzer.sub,
          zugewiesenAnId: zugewiesenAnId || undefined,
          oberProjektId:  oberProjektId  || undefined,
        },
        include: AUFGABE_INCLUDE,
      });
      return reply.status(201).send(aufgabe);
    }
  );

  // ── PATCH /:id – aktualisieren ───────────────────────────────────
  app.patch<{ Params: { id: string }; Body: {
    titel?: string;
    beschreibung?: string;
    typ?: AufgabeTyp;
    prioritaet?: Prioritaet;
    startDatum?: string | null;
    endDatum?: string | null;
    faelligAm?: string | null;
    farbe?: string | null;
    erledigt?: boolean;
    zugewiesenAnId?: string | null;
    sichtbarkeit?: Sichtbarkeit;
    oberProjektId?: string | null;
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
      const {
        titel, beschreibung, typ, prioritaet,
        startDatum, endDatum, faelligAm, farbe,
        erledigt, zugewiesenAnId, sichtbarkeit, oberProjektId,
      } = req.body;

      const data: Record<string, unknown> = {};
      if (titel           !== undefined) data.titel           = titel;
      if (beschreibung    !== undefined) data.beschreibung    = beschreibung;
      if (typ             !== undefined) data.typ             = typ;
      if (prioritaet      !== undefined) data.prioritaet      = prioritaet;
      if (sichtbarkeit    !== undefined) data.sichtbarkeit    = sichtbarkeit;
      if (startDatum      !== undefined) data.startDatum      = startDatum ? new Date(startDatum) : null;
      if (endDatum        !== undefined) data.endDatum        = endDatum   ? new Date(endDatum)   : null;
      if (faelligAm       !== undefined) data.faelligAm       = faelligAm  ? new Date(faelligAm)  : null;
      if (farbe           !== undefined) data.farbe           = farbe || null;
      if (zugewiesenAnId  !== undefined) data.zugewiesenAnId  = zugewiesenAnId || null;
      if (oberProjektId   !== undefined) data.oberProjektId   = oberProjektId  || null;
      if (erledigt        !== undefined) {
        data.erledigt   = erledigt;
        data.erledigtAm = erledigt ? new Date() : null;
      }

      const aufgabe = await prisma.aufgabe.update({
        where: { id },
        data,
        include: AUFGABE_INCLUDE,
      });
      return reply.send(aufgabe);
    }
  );

  // ── DELETE /:id ──────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (req, reply) => {
      // Kinder-Elemente vom Projekt lösen, dann Eintrag löschen
      await prisma.aufgabe.updateMany({
        where: { oberProjektId: req.params.id },
        data:  { oberProjektId: null },
      });
      await prisma.aufgabe.delete({ where: { id: req.params.id } });
      return reply.send({ nachricht: "Eintrag gelöscht" });
    }
  );
}
