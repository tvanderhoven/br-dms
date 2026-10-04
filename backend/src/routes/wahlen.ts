/**
 * Wahlen (BR / JAV) – Werkzeug des Betriebsrats: Wahl anlegen, Fristen überwachen.
 * Die Fristen entstehen automatisch (lib/wahlFristen.ts) und erscheinen im
 * Fristenkalender; dazu optional ein Vorhaben im Zeitplan.
 *
 * GET    /api/wahlen        – alle Wahlen (neueste zuerst)
 * GET    /api/wahlen/:id    – eine Wahl mit Fristen
 * POST   /api/wahlen        – Wahl anlegen (VORSITZ/STELLVERTRETER)
 * PATCH  /api/wahlen/:id    – Eckdaten ändern, Fristen werden nachgezogen
 * DELETE /api/wahlen/:id    – Wahl samt Fristen löschen (Vorhaben bleibt)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AufgabeTyp, Role, WahlArt, WahlVerfahren } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { wahlFristenAbgleichen } from "../lib/wahlFristen.js";

interface WahlEingabe {
  titel?:          string;
  art?:            WahlArt;
  verfahren?:      WahlVerfahren;
  stimmabgabeAm?:  string;
  amtszeitEnde?:   string | null;
  ausschreibenAm?: string | null;
  notiz?:          string | null;
  mitVorhaben?:    boolean;
}

const WAHL_INCLUDE = {
  fristen: {
    orderBy: { faelligAm: "asc" as const },
    include: { erledigtVon: { select: { name: true } } },
  },
};

/** "2026-11-12" → 12.11.2026 00:00 UTC; ungültig → "ungueltig" */
function datum(wert: string | null | undefined): Date | null | undefined | "ungueltig" {
  if (wert === undefined) return undefined;
  if (wert === null || wert === "") return null;
  const d = new Date(wert.length === 10 ? `${wert}T00:00:00.000Z` : wert);
  return isNaN(d.getTime()) ? "ungueltig" : d;
}

export async function wahlRouten(app: FastifyInstance): Promise<void> {

  app.get("/", { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const wahlen = await prisma.wahl.findMany({ include: WAHL_INCLUDE, orderBy: { stimmabgabeAm: "desc" } });
      return reply.send(wahlen);
    });

  app.get<{ Params: { id: string } }>("/:id", { preHandler: [authenticate] },
    async (request, reply) => {
      const wahl = await prisma.wahl.findUnique({ where: { id: request.params.id }, include: WAHL_INCLUDE });
      if (!wahl) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });
      return reply.send(wahl);
    });

  app.post<{ Body: WahlEingabe }>("/", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const b = request.body ?? {};
      if (!b.art || !Object.values(WahlArt).includes(b.art)) return reply.status(400).send({ fehler: "Art der Wahl fehlt (BR oder JAV)" });
      if (!b.verfahren || !Object.values(WahlVerfahren).includes(b.verfahren)) return reply.status(400).send({ fehler: "Verfahren fehlt (normal oder vereinfacht)" });

      const stimmabgabeAm  = datum(b.stimmabgabeAm);
      const amtszeitEnde   = datum(b.amtszeitEnde);
      const ausschreibenAm = datum(b.ausschreibenAm);
      if (!stimmabgabeAm || stimmabgabeAm === "ungueltig") return reply.status(400).send({ fehler: "Tag der Stimmabgabe fehlt oder ist ungültig" });
      if (amtszeitEnde === "ungueltig" || ausschreibenAm === "ungueltig") return reply.status(400).send({ fehler: "Ungültiges Datum" });

      const titel = b.titel?.trim() || `${b.art === WahlArt.BR ? "Betriebsratswahl" : "JAV-Wahl"} ${stimmabgabeAm.getUTCFullYear()}`;

      const wahl = await prisma.$transaction(async tx => {
        const vorhaben = b.mitVorhaben === false ? null : await tx.aufgabe.create({
          data: {
            titel, typ: AufgabeTyp.PROJEKT, erstelltVonId: request.benutzer.sub,
            beschreibung: "Begleitung der Wahl durch den Betriebsrat. Die Fristen stehen im Fristenkalender und auf der Seite „Wahlen“.",
          },
        });
        const neu = await tx.wahl.create({
          data: {
            titel, art: b.art!, verfahren: b.verfahren!, stimmabgabeAm,
            amtszeitEnde: amtszeitEnde ?? null, ausschreibenAm: ausschreibenAm ?? null,
            notiz: b.notiz?.trim() || null, vorhabenId: vorhaben?.id ?? null,
            erstelltVonId: request.benutzer.sub,
          },
        });
        await wahlFristenAbgleichen(neu.id, tx);
        return tx.wahl.findUnique({ where: { id: neu.id }, include: WAHL_INCLUDE });
      });
      return reply.status(201).send(wahl);
    });

  app.patch<{ Params: { id: string }; Body: WahlEingabe }>("/:id", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const alt = await prisma.wahl.findUnique({ where: { id: request.params.id } });
      if (!alt) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });

      const b = request.body ?? {};
      if (b.art !== undefined && !Object.values(WahlArt).includes(b.art)) return reply.status(400).send({ fehler: "Ungültige Art" });
      if (b.verfahren !== undefined && !Object.values(WahlVerfahren).includes(b.verfahren)) return reply.status(400).send({ fehler: "Ungültiges Verfahren" });
      const stimmabgabeAm  = datum(b.stimmabgabeAm);
      const amtszeitEnde   = datum(b.amtszeitEnde);
      const ausschreibenAm = datum(b.ausschreibenAm);
      if (stimmabgabeAm === null) return reply.status(400).send({ fehler: "Tag der Stimmabgabe darf nicht leer sein" });
      if ([stimmabgabeAm, amtszeitEnde, ausschreibenAm].includes("ungueltig")) return reply.status(400).send({ fehler: "Ungültiges Datum" });
      if (b.titel !== undefined && !b.titel.trim()) return reply.status(400).send({ fehler: "Titel darf nicht leer sein" });

      const wahl = await prisma.$transaction(async tx => {
        await tx.wahl.update({
          where: { id: alt.id },
          data: {
            ...(b.titel !== undefined && { titel: b.titel.trim() }),
            ...(b.art !== undefined && { art: b.art }),
            ...(b.verfahren !== undefined && { verfahren: b.verfahren }),
            ...(stimmabgabeAm instanceof Date && { stimmabgabeAm }),
            ...(amtszeitEnde !== undefined && { amtszeitEnde: amtszeitEnde as Date | null }),
            ...(ausschreibenAm !== undefined && { ausschreibenAm: ausschreibenAm as Date | null }),
            ...(b.notiz !== undefined && { notiz: b.notiz?.trim() || null }),
          },
        });
        await wahlFristenAbgleichen(alt.id, tx);
        return tx.wahl.findUnique({ where: { id: alt.id }, include: WAHL_INCLUDE });
      });
      return reply.send(wahl);
    });

  app.delete<{ Params: { id: string } }>("/:id", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const wahl = await prisma.wahl.findUnique({ where: { id: request.params.id } });
      if (!wahl) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });
      // Fristen hängen per onDelete: Cascade an der Wahl; das Vorhaben bleibt mit seinen Aufgaben stehen
      await prisma.wahl.delete({ where: { id: wahl.id } });
      return reply.send({ ok: true });
    });
}
