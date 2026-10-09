/**
 * Gesetzestexte – statischer Import von gesetze-im-internet.de
 *
 * Die Seite bietet für jedes Gesetz einen offiziellen strukturierten
 * XML-Export an (https://www.gesetze-im-internet.de/<slug>/xml.zip).
 * Wir laden diese ZIP-Datei, parsen die enthaltene XML-Datei und
 * speichern jeden Paragraphen (§) als eigenen Datensatz – dadurch ist
 * der Gesetzestext offline & volltextdurchsuchbar direkt im BR-DMS,
 * ohne bei jeder Suche die externe Seite anzufragen.
 *
 * Format ist bei allen Gesetzen auf gesetze-im-internet.de identisch,
 * daher reicht es, GESETZE_QUELLEN um weitere Einträge zu ergänzen.
 */

import AdmZip from "adm-zip";
import prisma from "../lib/prisma.js";

export interface GesetzQuelle {
  slug: string; // URL-Teil bei gesetze-im-internet.de, z.B. "betrvg"
  name: string; // Anzeigename, z.B. "BetrVG"
}

export const GESETZE_QUELLEN: GesetzQuelle[] = [
  { slug: "betrvg",      name: "BetrVG"  },
  { slug: "kschg",       name: "KSchG"   },
  { slug: "arbschg",     name: "ArbSchG" },
  { slug: "sgb_9_2018",  name: "SGB IX"  },
  { slug: "burlg",       name: "BUrlG"   },
  { slug: "arbzg",       name: "ArbZG"   },
];

// ── XML → Text-Hilfsfunktionen ────────────────────────────────────
// Alle Entitäten in einem Durchgang – sonst würde aus "&amp;lt;" erst "&lt;" und dann "<"
// (doppelt dekodiert). Ergebnis ist reiner Text; im Frontend wird er nie als HTML eingesetzt.
const BENANNTE_ENTITAETEN: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function entitiesDekodieren(s: string): string {
  return s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]+);/gi, (treffer, e: string) => {
    if (e[0] !== "#") return BENANNTE_ENTITAETEN[e.toLowerCase()] ?? treffer;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : treffer;
  });
}

function tagsEntfernen(s: string): string {
  // Wiederholen, bis nichts mehr übrig ist – auch verschachtelte Reste wie "<a<b>>"
  let vorher: string;
  do { vorher = s; s = s.replace(/<[^<>]*>/g, ""); } while (s !== vorher);
  return entitiesDekodieren(s).trim();
}

// Content-Block (Fließtext eines Paragraphen) in lesbaren Text umwandeln –
// Zeilenumbrüche an Absatz-/Aufzählungsenden erhalten, Rest strippen.
function contentZuText(xml: string): string {
  const mitUmbruechen = xml
    .replace(/<Br\s*\/?>/gi, "\n")
    .replace(/<\/(P|La|Li|Dt|Dd)>/gi, "\n");
  const text = tagsEntfernen(mitUmbruechen);
  return text
    .split("\n")
    .map(z => z.trim())
    .filter((z, i, arr) => z !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

interface GeparsterParagraph {
  paragraph: string;
  titel: string | null;
  text: string;
}

export function xmlNormsParsen(xml: string): GeparsterParagraph[] {
  const ergebnis: GeparsterParagraph[] = [];
  const normRegex = /<norm\b[^>]*>([\s\S]*?)<\/norm>/g;
  let match: RegExpExecArray | null;

  while ((match = normRegex.exec(xml)) !== null) {
    const block = match[1];

    const enbezMatch = block.match(/<enbez>([\s\S]*?)<\/enbez>/);
    if (!enbezMatch) continue; // Präambel/Inhaltsübersicht/Schlussteil ohne Einzelnorm – überspringen

    const paragraph = tagsEntfernen(enbezMatch[1]);
    if (!paragraph.startsWith("§")) continue; // nur echte Paragraphen, keine Anlagen/Artikel

    const titelMatch = block.match(/<titel>([\s\S]*?)<\/titel>/);
    const titel = titelMatch ? tagsEntfernen(titelMatch[1]) : null;

    const contentMatch = block.match(/<Content>([\s\S]*?)<\/Content>/);
    const text = contentMatch ? contentZuText(contentMatch[1]) : "";
    if (!text) continue;

    ergebnis.push({ paragraph, titel, text });
  }

  return ergebnis;
}

export interface GesetzAktualisierenErgebnis {
  slug: string;
  name: string;
  anzahl: number;         // Gesamtzahl Paragraphen nach dem Import
  neu: string[];           // neu hinzugekommene Paragraphen (z.B. durch Gesetzesänderung neu eingefügt)
  geaendert: string[];     // Paragraphen, deren Text sich gegenüber dem letzten Import unterscheidet
  istErstimport: boolean;  // true = Gesetz war vorher noch gar nicht importiert ("neu" ist dann keine echte Änderung)
  fehler?: string;
}

// ── Import einer einzelnen Quelle ─────────────────────────────────
export async function gesetzAktualisieren(quelle: GesetzQuelle): Promise<Omit<GesetzAktualisierenErgebnis, "fehler">> {
  const zipUrl = `https://www.gesetze-im-internet.de/${quelle.slug}/xml.zip`;
  const res = await fetch(zipUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BR-DMS/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`Download fehlgeschlagen (${res.status}): ${zipUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const zip = new AdmZip(buffer);
  const xmlEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith(".xml"));
  if (!xmlEntry) {
    throw new Error(`Keine XML-Datei im ZIP gefunden: ${quelle.slug}`);
  }
  const xml = xmlEntry.getData().toString("utf8");

  const paragraphen = xmlNormsParsen(xml);
  const quelleUrl = `https://www.gesetze-im-internet.de/${quelle.slug}/`;

  // Vorherigen Stand laden, um echte Änderungen zu erkennen (nicht nur "neu importiert")
  const bisherige = await prisma.gesetzParagraph.findMany({
    where: { gesetzSlug: quelle.slug },
    select: { paragraph: true, text: true, titel: true },
  });
  const bisherigeMap = new Map(bisherige.map(b => [b.paragraph, b]));
  const istErstimport = bisherige.length === 0;

  const neu: string[] = [];
  const geaendert: string[] = [];

  for (const p of paragraphen) {
    const vorher = bisherigeMap.get(p.paragraph);
    if (!vorher) {
      neu.push(p.paragraph);
    } else if (vorher.text !== p.text || vorher.titel !== p.titel) {
      geaendert.push(p.paragraph);
    }

    await prisma.gesetzParagraph.upsert({
      where: { gesetzSlug_paragraph: { gesetzSlug: quelle.slug, paragraph: p.paragraph } },
      update: { titel: p.titel, text: p.text, gesetz: quelle.name, quelleUrl },
      create: {
        gesetzSlug: quelle.slug,
        gesetz:     quelle.name,
        paragraph:  p.paragraph,
        titel:      p.titel,
        text:       p.text,
        quelleUrl,
      },
    });
  }

  return { slug: quelle.slug, name: quelle.name, anzahl: paragraphen.length, neu, geaendert, istErstimport };
}

export async function alleGesetzeAktualisieren(): Promise<GesetzAktualisierenErgebnis[]> {
  const ergebnisse: GesetzAktualisierenErgebnis[] = [];
  for (const quelle of GESETZE_QUELLEN) {
    try {
      ergebnisse.push(await gesetzAktualisieren(quelle));
    } catch (err) {
      ergebnisse.push({
        slug: quelle.slug,
        name: quelle.name,
        anzahl: 0,
        neu: [],
        geaendert: [],
        istErstimport: false,
        fehler: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
  return ergebnisse;
}
