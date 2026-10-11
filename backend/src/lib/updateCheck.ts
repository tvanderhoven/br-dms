/**
 * Update-Check gegen die GitHub-Releases von tvanderhoven/br-dms.
 *
 * Fragt höchstens einmal am Tag das neueste veröffentlichte Release ab (Entwürfe und
 * Vorabversionen liefert /releases/latest nicht) und merkt sich das Ergebnis in
 * system_einstellungen – auch über Neustarts hinweg. Ein Hinweis entsteht nur bei
 * höherem Major oder Minor; reine Patch-Releases lösen keinen Banner aus.
 *
 * Fehler (kein Internet, Rate-Limit, noch kein Release, kaputte Antwort) bleiben still:
 * es gilt dann der letzte bekannte Stand, die Oberfläche merkt davon nichts.
 *
 * Abschalten: UPDATE_CHECK_ENABLED=false in der .env – dann geht keine Anfrage nach außen.
 */

import { readFileSync } from "node:fs";
import prisma from "./prisma.js";

export const UPDATE_CHECK_SCHLUESSEL = "update_check";
const RELEASES_URL = "https://api.github.com/repos/tvanderhoven/br-dms/releases/latest";
const CACHE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

export interface Semver { major: number; minor: number; patch: number }

interface Cache {
  geprueftAm: string;            // ISO-Zeitpunkt der letzten Anfrage (auch bei 304)
  etag?: string;                 // für If-None-Match – 304-Antworten zählen nicht gegen das Rate-Limit
  version?: string;              // tag_name des neuesten Releases, z. B. "v1.3.0"
  name?: string;
  url?: string;                  // html_url der Release-Seite
  veroeffentlichtAm?: string;
}

export interface UpdateHinweis {
  version: string;
  name: string | null;
  url: string;
  veroeffentlichtAm: string | null;
}

export function updateCheckAktiv(): boolean {
  const wert = (process.env.UPDATE_CHECK_ENABLED ?? "true").trim().toLowerCase();
  return !["false", "0", "nein", "aus", "off", "no"].includes(wert);
}

/** "v1.2.3", "1.2", "1.2.3-beta.1" → { major, minor, patch }; alles andere → null */
export function semverLesen(text: string | undefined | null): Semver | null {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/.exec((text ?? "").trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3] ?? 0) };
}

/** true, wenn `neu` ein höheres Major oder (bei gleichem Major) ein höheres Minor hat */
export function istFunktionsUpdate(installiert: Semver, neu: Semver): boolean {
  if (neu.major !== installiert.major) return neu.major > installiert.major;
  return neu.minor > installiert.minor;
}

let installiertCache: string | null | undefined;
/** Version aus der package.json des Backends (liegt im Image unter /app/package.json) */
export function installierteVersion(): string | null {
  if (installiertCache !== undefined) return installiertCache;
  let version: string | null = null;
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    if (typeof pkg.version === "string") version = pkg.version;
  } catch { /* bleibt null */ }
  installiertCache = version;
  return version;
}

async function cacheLesen(): Promise<Cache | null> {
  try {
    const e = await prisma.systemEinstellung.findUnique({ where: { schluessel: UPDATE_CHECK_SCHLUESSEL } });
    return e ? (JSON.parse(e.wert) as Cache) : null;
  } catch {
    return null;
  }
}

async function cacheSchreiben(c: Cache): Promise<void> {
  const wert = JSON.stringify(c);
  await prisma.systemEinstellung.upsert({
    where:  { schluessel: UPDATE_CHECK_SCHLUESSEL },
    create: { schluessel: UPDATE_CHECK_SCHLUESSEL, wert },
    update: { wert },
  });
}

/**
 * Fragt GitHub ab, sofern der Cache älter als 24 Stunden ist (oder `erzwingen`).
 * Wirft nie – Fehler werden einmal ins Log geschrieben, der alte Cache bleibt gültig.
 */
export async function updatePruefen(erzwingen = false): Promise<void> {
  if (!updateCheckAktiv()) return;
  try {
    const alt = await cacheLesen();
    if (!erzwingen && alt && Date.now() - new Date(alt.geprueftAm).getTime() < CACHE_MS) return;

    const headers: Record<string, string> = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": `BR-DMS/${installierteVersion() ?? "unbekannt"} (Update-Check)`,
    };
    if (alt?.etag) headers["If-None-Match"] = alt.etag;

    const antwort = await fetch(RELEASES_URL, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const jetzt = new Date().toISOString();

    if (antwort.status === 304 && alt) {
      await cacheSchreiben({ ...alt, geprueftAm: jetzt });
      return;
    }
    if (antwort.status === 404) {
      // Noch kein veröffentlichtes Release – kein Fehler, nur nichts anzuzeigen
      await cacheSchreiben({ geprueftAm: jetzt });
      return;
    }
    if (!antwort.ok) throw new Error(`GitHub antwortet mit HTTP ${antwort.status}`);

    const r = await antwort.json() as { tag_name?: unknown; name?: unknown; html_url?: unknown; published_at?: unknown };
    if (typeof r.tag_name !== "string" || typeof r.html_url !== "string") throw new Error("unerwartete Antwort");

    await cacheSchreiben({
      geprueftAm: jetzt,
      etag: antwort.headers.get("etag") ?? undefined,
      version: r.tag_name,
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : undefined,
      url: r.html_url,
      veroeffentlichtAm: typeof r.published_at === "string" ? r.published_at : undefined,
    });
  } catch (err) {
    console.warn(`[UpdateCheck] Prüfung übersprungen: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Hinweis aus dem Cache – null, wenn abgeschaltet, unbekannt oder kein Major/Minor-Sprung */
export async function updateHinweis(): Promise<UpdateHinweis | null> {
  if (!updateCheckAktiv()) return null;
  const c = await cacheLesen();
  const installiert = semverLesen(installierteVersion());
  const neu = semverLesen(c?.version);
  if (!c?.version || !c.url || !installiert || !neu || !istFunktionsUpdate(installiert, neu)) return null;
  return { version: c.version, name: c.name ?? null, url: c.url, veroeffentlichtAm: c.veroeffentlichtAm ?? null };
}
