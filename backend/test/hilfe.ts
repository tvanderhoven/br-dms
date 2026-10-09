/**
 * Gemeinsame Helfer für die Rollentests.
 *
 * Die Tests laufen gegen eine eigene, leere Wegwerf-Datenbank (scripts/rollentests.sh
 * startet sie per Docker) und leeren sie vor jedem Testlauf komplett. Damit das nie
 * versehentlich eine echte Installation trifft, starten sie nur mit BRDMS_TESTDB=1.
 */

import type { FastifyInstance, RouteOptions } from "fastify";
import { Role } from "@prisma/client";
import { baueApp } from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { ADMIN_INHALTSZUGRIFF } from "../src/lib/adminZugriff.js";

if (process.env.BRDMS_TESTDB !== "1") {
  console.error("Rollentests leeren die Datenbank – bitte über scripts/rollentests.sh starten (setzt BRDMS_TESTDB=1).");
  process.exit(1);
}

export { prisma };

/** Testkonten: jede Rolle einmal, das Ersatzmitglied zusätzlich mit aktiver Vertretung */
export const KONTEN = [
  "VORSITZ", "STELLVERTRETER", "MITGLIED", "ERSATZMITGLIED", "ERSATZ_VERTRETUNG", "JAV", "SBV", "ADMIN",
] as const;
export type Konto = typeof KONTEN[number];

export interface Route {
  methode: string;
  pfad:    string;            // z. B. /api/dokumente/:id
  /** Mindestrolle aus erfordert(), null = nur angemeldet bzw. öffentlich */
  mindestRolle: Role | null;
  /** authenticate in einem der Hooks? */
  mitLogin: boolean;
}

export interface TestUmgebung {
  app:    FastifyInstance;
  routen: Route[];
  ids:    Record<Konto, string>;
  token:  Record<Konto, string>;
}

function alsListe<T>(x: T | T[] | undefined): T[] {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}

export async function datenbankLeeren(): Promise<void> {
  const tabellen = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (tabellen.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tabellen.map(t => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function starteTestumgebung(): Promise<TestUmgebung> {
  await datenbankLeeren();

  const routen: Route[] = [];
  const app = await baueApp({
    logger: false,
    beiRoute: (r: RouteOptions) => {
      const hooks = [...alsListe(r.onRequest), ...alsListe(r.preValidation), ...alsListe(r.preHandler)] as unknown[];
      const rbac  = hooks.find(h => typeof h === "function" && "mindestRolle" in h) as { mindestRolle: Role } | undefined;
      for (const methode of alsListe(r.method)) {
        if (methode === "HEAD" || methode === "OPTIONS") continue;
        routen.push({
          methode,
          pfad: r.url,
          mindestRolle: rbac?.mindestRolle ?? null,
          mitLogin: hooks.some(h => typeof h === "function" && h.name === "authenticate"),
        });
      }
    },
  });
  await app.ready();

  const ids   = {} as Record<Konto, string>;
  const token = {} as Record<Konto, string>;
  for (const konto of KONTEN) {
    const rolle = konto === "ERSATZ_VERTRETUNG" ? Role.ERSATZMITGLIED : konto as Role;
    const b = await prisma.benutzer.create({
      data: {
        email:        `${konto.toLowerCase()}@test.lokal`,
        name:         `Test ${konto}`,
        passwortHash: "x",          // Login wird hier nicht getestet, Tokens werden direkt signiert
        rolle,
      },
    });
    ids[konto]   = b.id;
    token[konto] = app.jwt.sign({ sub: b.id, email: b.email, rolle });
  }
  // Aktive Vertretung: Ersatzmitglied vertritt das ordentliche Mitglied
  await prisma.benutzer.update({ where: { id: ids.ERSATZ_VERTRETUNG }, data: { istVertretungFuer: ids.MITGLIED } });

  return { app, routen, ids, token };
}

export async function adminInhaltszugriff(erlaubt: boolean): Promise<void> {
  await prisma.systemEinstellung.upsert({
    where:  { schluessel: ADMIN_INHALTSZUGRIFF },
    create: { schluessel: ADMIN_INHALTSZUGRIFF, wert: String(erlaubt) },
    update: { wert: String(erlaubt) },
  });
}

/** Platzhalter für :parameter – eine gültige, aber nicht vorhandene UUID */
export const UNBEKANNT = "00000000-0000-4000-8000-000000000000";

export function pfadFuellen(pfad: string): string {
  return pfad.replace(/:[A-Za-z]+/g, UNBEKANNT);
}

export async function anfrage(
  env: TestUmgebung,
  konto: Konto | null,
  methode: string,
  url: string,
  body?: unknown,
) {
  return env.app.inject({
    method: methode as "GET",
    url,
    headers: konto ? { authorization: `Bearer ${env.token[konto]}` } : {},
    ...(body !== undefined ? { payload: body as object } : {}),
  });
}
