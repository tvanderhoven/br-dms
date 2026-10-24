import { FastifyInstance, FastifyReply } from "fastify";
import { Prisma, Prioritaet, Role, Sichtbarkeit, AufgabeTyp, KanbanStatus, AufgabenStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate, JwtPayload } from "../middleware/auth.js";
import { hatMindestrolle } from "../middleware/rbac.js";

const BENUTZER_SELECT = { id: true, name: true, email: true };

const AUFGABE_INCLUDE = {
  erstelltVon:  { select: BENUTZER_SELECT },
  zugewiesenAn: { select: BENUTZER_SELECT },
  // sichtbarkeit/erstelltVonId nur für ohneFremdesPrivatesProjekt(), gehen nicht raus
  oberProjekt:  { select: { id: true, titel: true, farbe: true, sichtbarkeit: true, erstelltVonId: true } },
  top: {
    select: {
      id: true, nummer: true, titel: true,
      sitzung: { select: { id: true, titel: true } },
    },
  },
};

/** Private Aufgaben sieht nur, wer sie angelegt hat */
const sichtbarFuer = (benutzerId: string): Prisma.AufgabeWhereInput => ({
  OR: [
    { sichtbarkeit: "OEFFENTLICH" },
    { sichtbarkeit: "PRIVAT", erstelltVonId: benutzerId },
  ],
});

type MitOberProjekt = {
  oberProjektId: string | null;
  oberProjekt: { id: string; titel: string; farbe: string | null; sichtbarkeit: Sichtbarkeit; erstelltVonId: string } | null;
};

/** Hängt eine Aufgabe an einem fremden privaten Projekt, verrät die Antwort weder dessen ID noch Titel */
function ohneFremdesPrivatesProjekt<T extends MitOberProjekt>(aufgabe: T, benutzerId: string) {
  const p = aufgabe.oberProjekt;
  if (p && p.sichtbarkeit === "PRIVAT" && p.erstelltVonId !== benutzerId) {
    return { ...aufgabe, oberProjektId: null, oberProjekt: null };
  }
  return { ...aufgabe, oberProjekt: p && { id: p.id, titel: p.titel, farbe: p.farbe } };
}

/**
 * Aufgabe laden, die der Benutzer sehen und bearbeiten darf – sonst 404 bzw. 403.
 * Bearbeiten: wer sie angelegt hat oder wem sie zugewiesen ist, sonst ab Mitglied
 * (Ersatzmitglieder ohne aktive Vertretung lesen nur).
 */
async function bearbeitbareAufgabe(id: string, benutzer: JwtPayload, reply: FastifyReply) {
  const aufgabe = await prisma.aufgabe.findFirst({
    where:  { id, ...sichtbarFuer(benutzer.sub) },
    select: {
      id: true, erstelltVonId: true, zugewiesenAnId: true, sichtbarkeit: true,
      oberProjekt: { select: { sichtbarkeit: true, erstelltVonId: true } },
    },
  });
  if (!aufgabe) {
    reply.status(404).send({ fehler: "Aufgabe nicht gefunden" });
    return null;
  }
  const beteiligt = aufgabe.erstelltVonId === benutzer.sub || aufgabe.zugewiesenAnId === benutzer.sub;
  if (!beteiligt && !(await hatMindestrolle(benutzer, Role.MITGLIED))) {
    reply.status(403).send({ fehler: "Nur lesender Zugriff ohne aktive Vertretung" });
    return null;
  }
  return aufgabe;
}

export async function aufgabenRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – alle Aufgaben (flach; Hierarchie baut das Frontend) ──
  app.get("/", { preHandler: [authenticate] }, async (req, reply) => {
    const aufgaben = await prisma.aufgabe.findMany({
      where: sichtbarFuer(req.benutzer.sub),
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
    ].map(a => ohneFremdesPrivatesProjekt(a, req.benutzer.sub));
    return reply.send(sortiert);
  });

  // ── POST / – neue Aufgabe oder Projekt ───────────────────────────
  app.post<{ Body: {
    titel: string;
    beschreibung?: string;
    beschreibungJson?: object;
    typ?: AufgabeTyp;
    prioritaet?: Prioritaet;
    startDatum?: string;
    endDatum?: string;
    faelligAm?: string;
    farbe?: string;
    zugewiesenAnId?: string;
    sichtbarkeit?: Sichtbarkeit;
    oberProjektId?: string;
    kanbanStatus?: KanbanStatus;
    aufgabenStatus?: AufgabenStatus;
    topId?: string;
  } }>(
    "/",
    {
      preValidation: [authenticate], // vor der Schema-Prüfung: Unangemeldete bekommen 401, nicht 400
      schema: {
        body: {
          type: "object",
          required: ["titel"],
          properties: {
            titel:            { type: "string", minLength: 1 },
            beschreibung:     { type: "string" },
            beschreibungJson: {},
            typ:            { type: "string", enum: ["PROJEKT", "AUFGABE"] },
            prioritaet:     { type: "string", enum: ["HOCH", "MITTEL", "NIEDRIG"] },
            startDatum:     { type: "string" },
            endDatum:       { type: "string" },
            faelligAm:      { type: "string" },
            farbe:          { type: "string" },
            zugewiesenAnId: { type: "string" },
            sichtbarkeit:   { type: "string", enum: ["PRIVAT", "OEFFENTLICH"] },
            oberProjektId:  { type: "string" },
            kanbanStatus:   { type: "string", enum: ["BACKLOG", "IN_BEARBEITUNG", "ERLEDIGT"] },
            aufgabenStatus: { type: "string", enum: ["NEU", "IN_BEARBEITUNG", "AUF_HOLD", "ERLEDIGT"] },
            topId:          { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const {
        titel, beschreibung, beschreibungJson, typ, prioritaet,
        startDatum, endDatum, faelligAm, farbe,
        zugewiesenAnId, sichtbarkeit, oberProjektId,
        kanbanStatus, aufgabenStatus, topId,
      } = req.body;

      if (oberProjektId && !(await prisma.aufgabe.findFirst({ where: { id: oberProjektId, ...sichtbarFuer(req.benutzer.sub) }, select: { id: true } }))) {
        return reply.status(400).send({ fehler: "Projekt nicht gefunden" });
      }

      const aufgabe = await prisma.aufgabe.create({
        data: {
          titel,
          beschreibung,
          beschreibungJson: beschreibungJson != null ? (beschreibungJson as Prisma.InputJsonValue) : undefined,
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
          kanbanStatus:   kanbanStatus   ?? undefined,
          aufgabenStatus: aufgabenStatus ?? undefined,
          topId:          topId          || undefined,
        },
        include: AUFGABE_INCLUDE,
      });
      return reply.status(201).send(ohneFremdesPrivatesProjekt(aufgabe, req.benutzer.sub));
    }
  );

  // ── PATCH /:id – aktualisieren ───────────────────────────────────
  app.patch<{ Params: { id: string }; Body: {
    titel?: string;
    beschreibung?: string;
    beschreibungJson?: object | null;
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
    kanbanStatus?: KanbanStatus | null;
    aufgabenStatus?: AufgabenStatus;
    topId?: string | null;
  } }>(
    "/:id",
    {
      preValidation: [authenticate], // vor der Schema-Prüfung: Unangemeldete bekommen 401, nicht 400
      schema: {
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const {
        titel, beschreibung, beschreibungJson, typ, prioritaet,
        startDatum, endDatum, faelligAm, farbe,
        erledigt, zugewiesenAnId, sichtbarkeit, oberProjektId,
        kanbanStatus, aufgabenStatus, topId,
      } = req.body;

      const vorhanden = await bearbeitbareAufgabe(id, req.benutzer, reply);
      if (!vorhanden) return reply;
      // Sichtbarkeit legt nur fest, wer die Aufgabe angelegt hat – sonst ließe sich eine
      // fremde Aufgabe privat schalten und damit allen anderen entziehen. Das Formular
      // schickt den Wert immer mit, abgewiesen wird nur eine echte Änderung.
      if (sichtbarkeit !== undefined && sichtbarkeit !== vorhanden.sichtbarkeit && vorhanden.erstelltVonId !== req.benutzer.sub) {
        return reply.status(403).send({ fehler: "Die Sichtbarkeit kann nur ändern, wer die Aufgabe angelegt hat" });
      }
      if (oberProjektId && !(await prisma.aufgabe.findFirst({ where: { id: oberProjektId, ...sichtbarFuer(req.benutzer.sub) }, select: { id: true } }))) {
        return reply.status(400).send({ fehler: "Projekt nicht gefunden" });
      }

      const data: Record<string, unknown> = {};
      if (titel           !== undefined) data.titel           = titel;
      if (beschreibung    !== undefined) data.beschreibung    = beschreibung;
      if (beschreibungJson !== undefined) data.beschreibungJson = beschreibungJson != null ? (beschreibungJson as Prisma.InputJsonValue) : Prisma.DbNull;
      if (typ             !== undefined) data.typ             = typ;
      if (prioritaet      !== undefined) data.prioritaet      = prioritaet;
      if (sichtbarkeit    !== undefined) data.sichtbarkeit    = sichtbarkeit;
      if (startDatum      !== undefined) data.startDatum      = startDatum ? new Date(startDatum) : null;
      if (endDatum        !== undefined) data.endDatum        = endDatum   ? new Date(endDatum)   : null;
      if (faelligAm       !== undefined) data.faelligAm       = faelligAm  ? new Date(faelligAm)  : null;
      if (farbe           !== undefined) data.farbe           = farbe || null;
      if (zugewiesenAnId  !== undefined) data.zugewiesenAnId  = zugewiesenAnId || null;
      // Ein fremdes privates Projekt kommt im Formular als „kein Projekt“ an (siehe
      // ohneFremdesPrivatesProjekt) – dann nicht still daraus lösen
      const fremdesPrivatesProjekt = vorhanden.oberProjekt?.sichtbarkeit === "PRIVAT" && vorhanden.oberProjekt.erstelltVonId !== req.benutzer.sub;
      if (oberProjektId   !== undefined && !(fremdesPrivatesProjekt && !oberProjektId)) data.oberProjektId = oberProjektId || null;
      if (topId           !== undefined) data.topId           = topId || null;
      if (erledigt        !== undefined) {
        data.erledigt   = erledigt;
        data.erledigtAm = erledigt ? new Date() : null;
        // Häkchen in der Listenansicht hält auch das Aufgaben-Kanban-Board synchron
        // (nur relevant für eigenständige ToDos, bei anderen Typen einfach ungenutzt)
        if (aufgabenStatus === undefined) {
          data.aufgabenStatus = erledigt ? "ERLEDIGT" : "NEU";
        }
      }
      // Kanban-Status ändern hält "erledigt" synchron, damit Liste/Gantt weiterhin
      // konsistent bleiben (die kennen nur das Häkchen, nicht die Kanban-Spalte)
      if (kanbanStatus    !== undefined) {
        data.kanbanStatus = kanbanStatus;
        if (kanbanStatus === "ERLEDIGT") {
          data.erledigt   = true;
          data.erledigtAm = new Date();
        } else if (kanbanStatus !== null) {
          data.erledigt   = false;
          data.erledigtAm = null;
        }
      }
      // Aufgaben-Kanban-Status ändern hält ebenfalls "erledigt" synchron (gleiche
      // Logik wie oben bei kanbanStatus, nur für das Board auf der Aufgaben-Seite)
      if (aufgabenStatus  !== undefined) {
        data.aufgabenStatus = aufgabenStatus;
        data.erledigt       = aufgabenStatus === "ERLEDIGT";
        data.erledigtAm     = aufgabenStatus === "ERLEDIGT" ? new Date() : null;
      }

      const aufgabe = await prisma.aufgabe.update({
        where: { id },
        data,
        include: AUFGABE_INCLUDE,
      });
      return reply.send(ohneFremdesPrivatesProjekt(aufgabe, req.benutzer.sub));
    }
  );

  // ── DELETE /:id ──────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!(await bearbeitbareAufgabe(req.params.id, req.benutzer, reply))) return reply;
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
