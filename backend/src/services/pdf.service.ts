/**
 * PDF-Service – Generiert Tagesordnungen und Protokolle als PDF
 *
 * Layout: DIN A4, Betriebsrat-Briefkopf, strukturierte TOPs
 * Engine: pdfkit (pure Node.js, kein Browser nötig → läuft auf Alpine)
 */

import PDFDocument from "pdfkit";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import prisma from "../lib/prisma.js";

// ── Typen (Subset aus Prisma) ─────────────────────────────────────
interface PdfBeschluss {
  antragstext:    string;
  rechtsgrundlage?: string;
  jaStimmen?:     number;
  neinStimmen?:   number;
  enthaltungen?:  number;
  anwesend?:      number;
  ergebnis:       string | null;
  finalisiert:    boolean;
}

interface PdfTop {
  nummer:       number;
  titel:        string;
  inhalt?:      string | null;
  inhaltsJson?: unknown;
  ergebnis?:    string | null;
  ergebnisJson?: unknown;
  status:       string;
  beschluesse?: PdfBeschluss[];
  dokumente: { dokument: { titel: string; kategorie: string; aktenzeichen?: string | null } }[];
  abstimmung?: {
    rechtsgrundlage: string;
    fragestellung:   string;
    jaStimmen:       number;
    neinStimmen:     number;
    enthaltungen:    number;
    anwesend:        number;
    ergebnis:        string | null;
    stimmen: { benutzer: { name: string }; stimme: string }[];
  } | null;
}

interface PdfAnwesenheit {
  status:  string;
  benutzer: { name: string; rolle: string };
  vertretungFuer?: { name: string } | null;
}

interface PdfSitzung {
  titel:        string;
  sitzungsdatum: Date;
  ort?:         string | null;
  sitzungstyp:  string;
  notizen?:     string | null;
  erstelltVon:  { name: string };
  anwesenheiten?: PdfAnwesenheit[];
  tops:         PdfTop[];
}

interface PdfVersion {
  versionNummer: string;
  typ:           string;
  erstelltAm:    Date;
  finalisiertAm?: Date | null;
}

// ── Feste Farben ──────────────────────────────────────────────────
const FARBE_GRAU   = "#6b7280";
const FARBE_HELL   = "#f3f4f6";
const FARBE_ERFOLG = "#15803d";
const FARBE_FEHLER = "#b91c1c";

// ── Protokoll-Layout (aus DB) ─────────────────────────────────────
interface ProtokollLayout {
  kopfzeile:            string;
  unterzeile:           string;
  farbe:                string;
  fusszeile:            string;
  unterschrift_vorsitz: string;
  unterschrift_zeuge:   string;
  kopfzeile_layout:     string; // "logo_links" | "logo_rechts" | "balken"
  fusszeile_layout:     string; // "text_links" | "text_rechts"
  logo_pfad:            string | null;
}

const LAYOUT_DEFAULTS: ProtokollLayout = {
  kopfzeile:            "Betriebsrat",
  unterzeile:           "Internes Dokumentenmanagementsystem",
  farbe:                "#1e40af",
  fusszeile:            "BR-DMS – Vertraulich",
  unterschrift_vorsitz: "Vorsitzende/r des Betriebsrats",
  unterschrift_zeuge:   "Betriebsratsmitglied (Protokollzeugin/-zeuge)",
  kopfzeile_layout:     "logo_links",
  fusszeile_layout:     "text_links",
  logo_pfad:            null,
};

async function layoutLaden(): Promise<ProtokollLayout> {
  const einstellungen = await prisma.systemEinstellung.findMany({
    where: { schluessel: { startsWith: "protokoll." } },
  });
  const m = new Map(einstellungen.map(e => [e.schluessel.replace("protokoll.", ""), e.wert]));
  return {
    kopfzeile:            m.get("kopfzeile")            ?? LAYOUT_DEFAULTS.kopfzeile,
    unterzeile:           m.get("unterzeile")           ?? LAYOUT_DEFAULTS.unterzeile,
    farbe:                m.get("farbe")                ?? LAYOUT_DEFAULTS.farbe,
    fusszeile:            m.get("fusszeile")            ?? LAYOUT_DEFAULTS.fusszeile,
    unterschrift_vorsitz: m.get("unterschrift_vorsitz") ?? LAYOUT_DEFAULTS.unterschrift_vorsitz,
    unterschrift_zeuge:   m.get("unterschrift_zeuge")   ?? LAYOUT_DEFAULTS.unterschrift_zeuge,
    kopfzeile_layout:     m.get("kopfzeile_layout")     ?? LAYOUT_DEFAULTS.kopfzeile_layout,
    fusszeile_layout:     m.get("fusszeile_layout")     ?? LAYOUT_DEFAULTS.fusszeile_layout,
    logo_pfad:            m.get("logo_pfad")            ?? null,
  };
}

const RAND_LINKS  = 60;
const RAND_RECHTS = 535;
const BREITE      = RAND_RECHTS - RAND_LINKS;

// ── Hilfsfunktionen ───────────────────────────────────────────────
function formatDatum(d: Date): string {
  return d.toLocaleDateString("de-DE", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function formatZeit(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function topStatusLabel(s: string): string {
  return { OFFEN: "Offen", BESCHLOSSEN: "Beschlossen", ABGELEHNT: "Abgelehnt",
           VERTAGT: "Vertagt", ZUR_KENNTNIS: "Zur Kenntnis" }[s] ?? s;
}

function kategorieLabel(k: string): string {
  return {
    ANHOERUNG_99:         "§ 99 BetrVG",
    ANHOERUNG_102:        "§ 102 BetrVG",
    BEWERBUNG_ALTERNATIV: "Alternative Bewerbung",
    PROTOKOLL:            "Sitzungsprotokoll",
    BETRIEBSVEREINBARUNG: "Betriebsvereinbarung",
    SONSTIGES:            "Sonstiges",
  }[k] ?? k;
}

// ── Kern-Generator ────────────────────────────────────────────────
export async function pdfGenerieren(
  sitzung:      PdfSitzung,
  version:      PdfVersion,
  mitProtokoll: boolean,
): Promise<{ buffer: Buffer; zeitstempel: string }> {

  const layout = await layoutLaden();
  const logoBuffer = layout.logo_pfad
    ? await fs.readFile(layout.logo_pfad).catch(() => null)
    : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 60, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data",  c  => chunks.push(c));
    doc.on("error", reject);
    doc.on("end",   () => {
      const buffer     = Buffer.concat(chunks);
      const zeitstempel = createHash("sha256")
        .update(buffer)
        .update(version.erstelltAm.toISOString())
        .digest("hex");
      resolve({ buffer, zeitstempel });
    });

    const istFinal = version.typ === "PROTOKOLL_FINAL";

    // ── Seite 1: Briefkopf ──────────────────────────────────────
    briefkopf(doc, sitzung, version, mitProtokoll, layout, logoBuffer);
    doc.moveDown(0.3);

    // ── Überschrift ──────────────────────────────────────────────
    const typUeberschrift = mitProtokoll ? "Protokoll" : "Tagesordnung";
    doc.fontSize(12).font("Helvetica-Bold").fillColor(layout.farbe)
       .text(`${typUeberschrift} (Version ${version.versionNummer})`, RAND_LINKS, doc.y);
    doc.moveDown(0.8);

    // ── TOPs ─────────────────────────────────────────────────────
    sitzung.tops.forEach((top, idx) => {
      topAbschnitt(doc, top, mitProtokoll, idx === sitzung.tops.length - 1, layout);
    });

    // ── Anwesenheit (nur Protokoll) ───────────────────────────────
    if (mitProtokoll && sitzung.anwesenheiten && sitzung.anwesenheiten.length > 0) {
      doc.moveDown(0.5);
      anwesenheitAbschnitt(doc, sitzung.anwesenheiten, layout);
    }

    // ── Notizen ──────────────────────────────────────────────────
    if (sitzung.notizen) {
      if (doc.y > 600) doc.addPage();
      doc.moveDown(0.5);
      abschnittUeberschrift(doc, "Anmerkungen", layout);
      doc.fontSize(10).fillColor("#374151").text(sitzung.notizen, RAND_LINKS, doc.y, { width: BREITE });
    }

    // ── Finaler Zeitstempel & Siegel ─────────────────────────────
    if (istFinal && version.finalisiertAm) {
      doc.moveDown(2);
      zeitstempelSiegel(doc, version.finalisiertAm);
    }

    // ── Unterschriften ────────────────────────────────────────────
    if (!mitProtokoll) {
      unterschriftenTagesordnung(doc, layout, sitzung.sitzungsdatum);
    } else if (istFinal) {
      unterschriftenProtokoll(doc, layout, sitzung.sitzungsdatum);
    }

    // ── Fußzeile auf allen Seiten ────────────────────────────────
    const seitenZahl = (doc as any).bufferedPageRange().count;
    for (let i = 0; i < seitenZahl; i++) {
      doc.switchToPage(i);
      fusszeile(doc, i + 1, seitenZahl, version.versionNummer, layout);
    }

    doc.end();
  });
}

// ── Briefkopf ────────────────────────────────────────────────────
function briefkopf(
  doc:          InstanceType<typeof PDFDocument>,
  s:            PdfSitzung,
  v:            PdfVersion,
  mitProtokoll: boolean,
  layout:       ProtokollLayout,
  logoBuffer:   Buffer | null,
) {
  const y = doc.y;
  const datumZeit = `${formatDatum(s.sitzungsdatum)}, ${formatZeit(s.sitzungsdatum)} Uhr`;

  const textBreite = logoBuffer ? 350 : BREITE;
  doc.fontSize(14).font("Helvetica-Bold").fillColor("#111827")
     .text(s.titel, RAND_LINKS, y, { width: textBreite });
  doc.fontSize(9).font("Helvetica").fillColor(FARBE_GRAU)
     .text(datumZeit, RAND_LINKS, y + 18, { width: textBreite });

  if (logoBuffer) {
    doc.image(logoBuffer, 463, y, { height: 38, fit: [72, 38] });
  }

  doc.y = y + 44;
  doc.moveTo(RAND_LINKS, doc.y).lineTo(RAND_RECHTS, doc.y).strokeColor(layout.farbe).lineWidth(1.5).stroke();
  doc.moveDown(0.8);
}

// ── Abschnitts-Überschrift ────────────────────────────────────────
function abschnittUeberschrift(doc: InstanceType<typeof PDFDocument>, text: string, layout: ProtokollLayout) {
  doc.moveDown(0.3);
  doc.fontSize(11).font("Helvetica-Bold").fillColor(layout.farbe)
     .text(text.toUpperCase(), RAND_LINKS, doc.y);
  doc.moveDown(0.2);
  doc.moveTo(RAND_LINKS, doc.y).lineTo(RAND_RECHTS, doc.y)
     .strokeColor(layout.farbe).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}

// ── TipTap JSON → pdfkit ─────────────────────────────────────────

interface TipTapNode {
  type:     string;
  text?:    string;
  marks?:   { type: string }[];
  attrs?:   Record<string, unknown>;
  content?: TipTapNode[];
}

function inlineText(nodes: TipTapNode[] = []): string {
  return nodes.flatMap(n => {
    if (n.type === "text")      return [n.text ?? ""];
    if (n.type === "hardBreak") return ["\n"];
    if (n.content)              return [inlineText(n.content)];
    return [];
  }).join("");
}

function renderInline(
  doc:    InstanceType<typeof PDFDocument>,
  nodes:  TipTapNode[],
  x:      number,
  breite: number,
  size:   number,
  color:  string,
) {
  const segs: { text: string; font: string }[] = [];
  const collect = (list: TipTapNode[]) => {
    for (const n of list) {
      if (n.type === "text" && n.text) {
        const bold   = n.marks?.some(m => m.type === "bold")   ?? false;
        const italic = n.marks?.some(m => m.type === "italic") ?? false;
        segs.push({
          text: n.text,
          font: bold && italic ? "Helvetica-BoldOblique"
              : bold           ? "Helvetica-Bold"
              : italic         ? "Helvetica-Oblique"
              :                  "Helvetica",
        });
      } else if (n.type === "hardBreak") {
        segs.push({ text: "\n", font: "Helvetica" });
      } else if (n.content) {
        collect(n.content);
      }
    }
  };
  collect(nodes);
  if (segs.length === 0) return;
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (i === 0) {
      doc.fontSize(size).font(seg.font).fillColor(color)
         .text(seg.text, x, doc.y, { continued: !last, width: breite });
    } else {
      doc.fontSize(size).font(seg.font).fillColor(color)
         .text(seg.text, { continued: !last });
    }
  });
}

function tiptapZuPdf(
  doc:    InstanceType<typeof PDFDocument>,
  json:   unknown,
  x:      number,
  breite: number,
  size    = 9,
  color   = "#374151",
) {
  const root = json as TipTapNode | null;
  if (!root?.content) return;

  const renderBlock = (node: TipTapNode) => {
    switch (node.type) {
      case "paragraph": {
        if (!node.content?.length) { doc.moveDown(0.3); break; }
        renderInline(doc, node.content, x, breite, size, color);
        doc.moveDown(0.3);
        break;
      }
      case "heading": {
        const level = (node.attrs?.level as number) ?? 1;
        const sz    = level === 1 ? 12 : level === 2 ? 11 : 10;
        const text  = inlineText(node.content);
        if (text.trim()) {
          doc.fontSize(sz).font("Helvetica-Bold").fillColor("#111827")
             .text(text, x, doc.y, { width: breite });
          doc.moveDown(0.3);
        }
        break;
      }
      case "bulletList": {
        node.content?.forEach(item => {
          const text = inlineText(item.content);
          if (text.trim()) {
            doc.fontSize(size).font("Helvetica").fillColor(color)
               .text(`•  ${text}`, x + 4, doc.y, { width: breite - 4 });
            doc.moveDown(0.2);
          }
        });
        doc.moveDown(0.1);
        break;
      }
      case "orderedList": {
        const start = (node.attrs?.start as number) ?? 1;
        node.content?.forEach((item, i) => {
          const text = inlineText(item.content);
          if (text.trim()) {
            doc.fontSize(size).font("Helvetica").fillColor(color)
               .text(`${start + i}.  ${text}`, x + 4, doc.y, { width: breite - 4 });
            doc.moveDown(0.2);
          }
        });
        doc.moveDown(0.1);
        break;
      }
      case "blockquote": {
        const text = inlineText(node.content);
        if (text.trim()) {
          doc.fontSize(size).font("Helvetica-Oblique").fillColor(FARBE_GRAU)
             .text(text, x + 8, doc.y, { width: breite - 8 });
          doc.moveDown(0.3);
        }
        break;
      }
      default:
        node.content?.forEach(child => renderBlock(child));
    }
  };

  root.content.forEach(renderBlock);
}

// ── TOP-Abschnitt ─────────────────────────────────────────────────
function topAbschnitt(
  doc: InstanceType<typeof PDFDocument>,
  top: PdfTop,
  mitProtokoll: boolean,
  letzter: boolean,
  layout: ProtokollLayout,
) {
  if (doc.y > 640) doc.addPage();

  const yStart = doc.y;

  // Nummer + Titel
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827");
  const titelText = `${top.nummer}.  ${top.titel}`;
  doc.text(titelText, RAND_LINKS, yStart, { width: BREITE - 80 });

  // Status-Badge (rechts) nur im Protokoll
  if (mitProtokoll) {
    const farbe = { BESCHLOSSEN: FARBE_ERFOLG, ABGELEHNT: FARBE_FEHLER,
                    VERTAGT: "#d97706", ZUR_KENNTNIS: layout.farbe }[top.status] ?? FARBE_GRAU;
    doc.fontSize(8).font("Helvetica-Bold").fillColor(farbe)
       .text(`[${topStatusLabel(top.status)}]`, 450, yStart, { width: 85, align: "right" });
  }

  doc.moveDown(0.3);

  // Inhalt / Sachverhalt
  if (top.inhaltsJson) {
    tiptapZuPdf(doc, top.inhaltsJson, RAND_LINKS + 16, BREITE - 16);
  } else if (top.inhalt) {
    doc.fontSize(9).font("Helvetica").fillColor("#374151")
       .text(top.inhalt, RAND_LINKS + 16, doc.y, { width: BREITE - 16 });
    doc.moveDown(0.3);
  }

  // Verknüpfte Dokumente
  if (top.dokumente.length > 0) {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(FARBE_GRAU)
       .text("Anlagen:", RAND_LINKS + 16, doc.y);
    top.dokumente.forEach(td => {
      doc.fontSize(8).font("Helvetica").fillColor(layout.farbe)
         .text(
           `  📎 ${td.dokument.titel} (${kategorieLabel(td.dokument.kategorie)}` +
           (td.dokument.aktenzeichen ? `, Az.: ${td.dokument.aktenzeichen}` : "") + ")",
           RAND_LINKS + 16, doc.y, { width: BREITE - 16 }
         );
    });
    doc.moveDown(0.3);
  }

  // Abstimmungsergebnis (nur Protokoll)
  if (mitProtokoll && top.abstimmung) {
    if (doc.y > 600) doc.addPage();
    const a = top.abstimmung;
    doc.moveDown(0.2);

    // Abstimmungs-Box
    const boxY = doc.y;
    doc.rect(RAND_LINKS + 16, boxY, BREITE - 16, 1).fill(FARBE_HELL);
    doc.y = boxY + 4;

    doc.fontSize(8).font("Helvetica-Bold").fillColor(FARBE_GRAU)
       .text("ABSTIMMUNG", RAND_LINKS + 20, doc.y);
    doc.moveDown(0.2);

    doc.fontSize(8).font("Helvetica").fillColor("#374151")
       .text(`Rechtsgrundlage: ${a.rechtsgrundlage}`, RAND_LINKS + 20, doc.y, { width: BREITE - 20 });
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#111827")
       .text(`„${a.fragestellung}"`, RAND_LINKS + 20, doc.y, { width: BREITE - 20 });
    doc.moveDown(0.3);

    // Ergebnis-Zeile
    const ergebnisText = a.ergebnis === "ANGENOMMEN"
      ? "✓  ANGENOMMEN"
      : a.ergebnis === "ABGELEHNT"
      ? "✗  ABGELEHNT"
      : "≈  UNENTSCHIEDEN";
    const ergebnisFarbe = a.ergebnis === "ANGENOMMEN" ? FARBE_ERFOLG
      : a.ergebnis === "ABGELEHNT" ? FARBE_FEHLER : FARBE_GRAU;

    doc.fontSize(10).font("Helvetica-Bold").fillColor(ergebnisFarbe)
       .text(ergebnisText, RAND_LINKS + 20, doc.y, { continued: true });
    doc.fontSize(8).font("Helvetica").fillColor(FARBE_GRAU)
       .text(
         `   (Ja: ${a.jaStimmen}  |  Nein: ${a.neinStimmen}  |  Enthaltungen: ${a.enthaltungen}  |  Anwesend: ${a.anwesend})`,
         { continued: false }
       );

    // Einzelstimmen wenn vorhanden
    if (a.stimmen.length > 0) {
      doc.moveDown(0.2);
      doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU);
      const stimmenText = a.stimmen
        .map(s => `${s.benutzer.name}: ${s.stimme === "JA" ? "Ja" : s.stimme === "NEIN" ? "Nein" : "Enthal."}`)
        .join("  ·  ");
      doc.text(stimmenText, RAND_LINKS + 20, doc.y, { width: BREITE - 20 });
    }
    doc.moveDown(0.4);
  }

  // Ergebnis/Beschluss-Text (Protokoll)
  if (mitProtokoll && (top.ergebnisJson || top.ergebnis)) {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(FARBE_GRAU)
       .text("Ergebnis:", RAND_LINKS + 16, doc.y, { width: BREITE - 16 });
    doc.moveDown(0.15);
    if (top.ergebnisJson) {
      tiptapZuPdf(doc, top.ergebnisJson, RAND_LINKS + 16, BREITE - 16, 9, "#374151");
    } else if (top.ergebnis) {
      doc.fontSize(9).font("Helvetica-Oblique").fillColor("#374151")
         .text(top.ergebnis, RAND_LINKS + 16, doc.y, { width: BREITE - 16 });
      doc.moveDown(0.3);
    }
  }

  // ── Beschlüsse (nur Protokoll) ──────────────────────────────────
  if (mitProtokoll && top.beschluesse && top.beschluesse.length > 0) {
    const finalisierte = top.beschluesse.filter(b => b.finalisiert);
    if (finalisierte.length > 0) {
      if (doc.y > 580) doc.addPage();
      doc.moveDown(0.3);

      finalisierte.forEach(b => {
        if (doc.y > 620) doc.addPage();

        const istBeschlossen = b.ergebnis === "BESCHLOSSEN";
        const akzentFarbe    = istBeschlossen ? FARBE_ERFOLG : FARBE_FEHLER;
        const ergebnisLabel  = istBeschlossen ? "Beschlossen"
          : b.ergebnis === "ABGELEHNT" ? "Abgelehnt"
          : (b.ergebnis ?? "—");

        const startY = doc.y;

        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(akzentFarbe)
           .text(`BESCHLUSS  ·  ${ergebnisLabel.toUpperCase()}`, RAND_LINKS + 22, doc.y, { width: BREITE - 22 });
        doc.moveDown(0.15);
        doc.fontSize(9).font("Helvetica").fillColor("#111827")
           .text(b.antragstext, RAND_LINKS + 22, doc.y, { width: BREITE - 30 });

        if (b.jaStimmen !== undefined) {
          doc.moveDown(0.2);
          doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU)
             .text(
               `Abstimmung:  Ja ${b.jaStimmen}  ·  Nein ${b.neinStimmen}  ·  Enthaltungen ${b.enthaltungen}  ·  Anwesend ${b.anwesend}`,
               RAND_LINKS + 22, doc.y, { width: BREITE - 30 }
             );
        }

        // Linker Akzent-Rand (nach dem Text, da wir nun die Höhe kennen)
        doc.moveTo(RAND_LINKS + 17, startY - 1)
           .lineTo(RAND_LINKS + 17, doc.y + 4)
           .strokeColor(akzentFarbe).lineWidth(2).stroke();

        doc.moveDown(0.5);
      });
    }
  }

  // Trennlinie zwischen TOPs (außer letztem)
  if (!letzter) {
    doc.moveDown(0.3);
    doc.moveTo(RAND_LINKS + 16, doc.y).lineTo(RAND_RECHTS, doc.y)
       .strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    doc.moveDown(0.5);
  }
}

// ── Finaler Zeitstempel-Siegel ────────────────────────────────────
function zeitstempelSiegel(doc: InstanceType<typeof PDFDocument>, finalisiertAm: Date) {
  if (doc.y > 640) doc.addPage();
  const y = doc.y;

  doc.rect(RAND_LINKS, y, BREITE, 64).fill("#f0fdf4");
  doc.rect(RAND_LINKS, y, 4, 64).fill(FARBE_ERFOLG);

  doc.fontSize(10).font("Helvetica-Bold").fillColor(FARBE_ERFOLG)
     .text("✓  Protokoll finalisiert & revisionssicher gespeichert", RAND_LINKS + 14, y + 8, { width: BREITE - 14 });

  doc.fontSize(8).font("Helvetica").fillColor(FARBE_GRAU)
     .text(
       `Zeitstempel: ${finalisiertAm.toLocaleString("de-DE", { dateStyle: "full", timeStyle: "medium" })}`,
       RAND_LINKS + 14, y + 26, { width: BREITE - 14 }
     );

  doc.fontSize(7).fillColor(FARBE_GRAU)
     .text(
       "Dieses Dokument wurde im BR-DMS revisionssicher archiviert. " +
       "Der Zeitstempel dient als Integritätsnachweis gemäß internen Dokumentationsrichtlinien.",
       RAND_LINKS + 14, y + 40, { width: BREITE - 14 }
     );

  doc.y = y + 72;
}

// ── Anwesenheits-Abschnitt im Protokoll ──────────────────────────
function anwesenheitAbschnitt(doc: InstanceType<typeof PDFDocument>, anwesenheiten: PdfAnwesenheit[], layout: ProtokollLayout) {
  if (doc.y > 580) doc.addPage();
  abschnittUeberschrift(doc, "Anwesenheit", layout);

  const anwesend = anwesenheiten.filter(a =>
    a.status === "ANWESEND" || a.status === "ERSATZ_FUER"
  );
  const entschuldigt = anwesenheiten.filter(a =>
    a.status === "ABWESEND_ENTSCHULDIGT" || a.status === "ABWESEND_UNENTSCHULDIGT"
  );

  const rolleLabel = (r: string) =>
    ({ VORSITZ: "Vorsitz", STELLVERTRETER: "Stellv. Vorsitz", MITGLIED: "Mitglied", ERSATZMITGLIED: "Ersatzmitglied", ADMIN: "" }[r] ?? r);

  if (anwesend.length > 0) {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(FARBE_GRAU)
       .text(`Anwesend (${anwesend.length}):`, RAND_LINKS, doc.y);
    doc.moveDown(0.2);
    const namen = anwesend.map(a => {
      let n = a.benutzer.name;
      if (a.status === "ERSATZ_FUER" && a.vertretungFuer) n += ` (Vtg. f. ${a.vertretungFuer.name})`;
      const rolle = rolleLabel(a.benutzer.rolle);
      return rolle ? `${n} (${rolle})` : n;
    });
    doc.fontSize(9).font("Helvetica").fillColor("#111827")
       .text(namen.join(", "), RAND_LINKS + 12, doc.y, { width: BREITE - 12 });
    doc.moveDown(0.4);
  }

  if (entschuldigt.length > 0) {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(FARBE_GRAU)
       .text("Entschuldigt / Abwesend:", RAND_LINKS, doc.y);
    doc.moveDown(0.2);
    const namen = entschuldigt.map(a => a.benutzer.name);
    doc.fontSize(9).font("Helvetica").fillColor(FARBE_GRAU)
       .text(namen.join(", "), RAND_LINKS + 12, doc.y, { width: BREITE - 12 });
    doc.moveDown(0.4);
  }
}

// ── Unterschriften Tagesordnung ───────────────────────────────────
function unterschriftenTagesordnung(doc: InstanceType<typeof PDFDocument>, layout: ProtokollLayout, sitzungsdatum: Date) {
  if (doc.y > 560) doc.addPage();
  doc.moveDown(2);

  abschnittUeberschrift(doc, "Unterschrift", layout);
  doc.moveDown(0.5);

  doc.fontSize(9).font("Helvetica").fillColor("#374151")
     .text(
       "Hiermit bestätige ich, dass die vorstehende Tagesordnung ordnungsgemäß aufgestellt und den Betriebsratsmitgliedern fristgerecht übermittelt wurde.",
       RAND_LINKS, doc.y, { width: BREITE }
     );
  doc.moveDown(2);

  const datum = sitzungsdatum.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  unterschriftsLinie(doc, RAND_LINKS, layout.unterschrift_vorsitz, `Oberhausen/Gladbeck, ${datum}`);
}

// ── Unterschriften Protokoll ──────────────────────────────────────
function unterschriftenProtokoll(doc: InstanceType<typeof PDFDocument>, layout: ProtokollLayout, sitzungsdatum: Date) {
  if (doc.y > 560) doc.addPage();
  doc.moveDown(2);

  abschnittUeberschrift(doc, "Unterschriften", layout);
  doc.moveDown(0.5);

  doc.fontSize(9).font("Helvetica").fillColor("#374151")
     .text(
       "Die Unterzeichnenden bestätigen, dass dieses Protokoll in der Betriebsratssitzung verlesen, genehmigt und für richtig befunden wurde.",
       RAND_LINKS, doc.y, { width: BREITE }
     );
  doc.moveDown(2.5);

  const datum = sitzungsdatum.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  const ortDatum = `Oberhausen/Gladbeck, ${datum}`;
  const mitte = RAND_LINKS + BREITE / 2 + 10;
  unterschriftsLinie(doc, RAND_LINKS, layout.unterschrift_vorsitz, ortDatum);
  const yNachErster = doc.y;
  doc.y = yNachErster - 40;
  unterschriftsLinie(doc, mitte, layout.unterschrift_zeuge, ortDatum);
  doc.y = yNachErster;
}

// ── Hilfsfunktion: eine Unterschriftslinie ────────────────────────
function unterschriftsLinie(
  doc:      InstanceType<typeof PDFDocument>,
  x:        number,
  label:    string,
  ortDatum: string,
) {
  const breite = 200;
  const y = doc.y;

  // Linie
  doc.moveTo(x, y).lineTo(x + breite, y)
     .strokeColor("#111827").lineWidth(0.8).stroke();

  // Ort / Datum darunter (links)
  doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU)
     .text(ortDatum, x, y + 4, { width: breite });

  // Label
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#374151")
     .text(label, x, y + 16, { width: breite });

  doc.moveDown(2);
}

// ── Fußzeile ──────────────────────────────────────────────────────
function fusszeile(
  doc:           InstanceType<typeof PDFDocument>,
  seite:         number,
  gesamtSeiten:  number,
  versionNummer: string,
  layout:        ProtokollLayout,
) {
  const y = 760;
  doc.moveTo(RAND_LINKS, y).lineTo(RAND_RECHTS, y)
     .strokeColor("#e5e7eb").lineWidth(0.5).stroke();

  const seitenText = `Seite ${seite} von ${gesamtSeiten}`;
  if (layout.fusszeile_layout === "text_rechts") {
    doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU)
       .text(`${seitenText}  ·  Version ${versionNummer}`, RAND_LINKS, y + 5, { continued: true })
       .text(`  ·  ${layout.fusszeile}`, { align: "right" });
  } else {
    doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU)
       .text(layout.fusszeile, RAND_LINKS, y + 5, { continued: true })
       .text(`  ·  Version ${versionNummer}`, { continued: true })
       .text(`  ·  ${seitenText}`, { align: "right" });
  }
}

// ── Anwesenheitsliste PDF ─────────────────────────────────────────
export interface AnwesenheitsMitglied {
  id:                  string;
  name:                string;
  rolle:               string;
  status?:             string | null;  // ANWESEND | ABWESEND_ENTSCHULDIGT | ABWESEND_UNENTSCHULDIGT | ERSATZ_FUER
  vertretungFuerName?: string | null;
}

export async function anwesenheitslistePdfGenerieren(
  sitzung:    { titel: string; sitzungsdatum: Date; ort?: string | null; sitzungstyp: string },
  mitglieder: AnwesenheitsMitglied[],
): Promise<Buffer> {
  const layout     = await layoutLaden();
  const logoBuffer = layout.logo_pfad
    ? await fs.readFile(layout.logo_pfad).catch(() => null)
    : null;

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margin: 60, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data",  c  => chunks.push(c));
    doc.on("error", reject);
    doc.on("end",   () => resolve(Buffer.concat(chunks)));

    const rolleLabel = (r: string) =>
      ({ VORSITZ: "Vorsitz", STELLVERTRETER: "Stellv. Vorsitz", MITGLIED: "Mitglied", ERSATZMITGLIED: "Ersatzmitglied", ADMIN: "" }[r] ?? r);

    // Briefkopf
    const y0 = doc.y;
    const datumZeit = `${formatDatum(sitzung.sitzungsdatum)}, ${formatZeit(sitzung.sitzungsdatum)} Uhr`;

    const textBreite = logoBuffer ? 350 : BREITE;
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#111827")
       .text(sitzung.titel, RAND_LINKS, y0, { width: textBreite });
    doc.fontSize(9).font("Helvetica").fillColor(FARBE_GRAU)
       .text(datumZeit, RAND_LINKS, y0 + 18, { width: textBreite });

    if (logoBuffer) {
      doc.image(logoBuffer, 463, y0, { height: 38, fit: [72, 38] });
    }

    doc.y = y0 + 44;
    doc.moveTo(RAND_LINKS, doc.y).lineTo(RAND_RECHTS, doc.y)
       .strokeColor(layout.farbe).lineWidth(1.5).stroke();
    doc.moveDown(0.8);

    // Überschrift
    doc.fontSize(12).font("Helvetica-Bold").fillColor(layout.farbe)
       .text("Anwesenheitsliste", RAND_LINKS, doc.y);
    doc.moveDown(0.8);

    // Anweisung
    doc.fontSize(9).font("Helvetica").fillColor("#374151")
       .text(
         "Bitte bestätigen Sie Ihre Anwesenheit durch Ihre Unterschrift. " +
         "Ersatzmitglieder bitte nur unterschreiben, wenn sie das verhinderte ordentliche Mitglied vertreten.",
         RAND_LINKS, doc.y, { width: BREITE }
       );
    doc.moveDown(1);

    // Spaltenüberschriften
    abschnittUeberschrift(doc, `Betriebsratsmitglieder (${mitglieder.length})`, layout);

    const COL_NR     = RAND_LINKS;
    const COL_NAME   = RAND_LINKS + 22;
    const COL_ROLLE  = RAND_LINKS + 200;
    const COL_STATUS = RAND_LINKS + 300;
    const COL_UNTER  = RAND_LINKS + 380;

    doc.fontSize(8).font("Helvetica-Bold").fillColor(FARBE_GRAU);
    doc.text("#",            COL_NR,     doc.y, { width: 18 });
    doc.text("Name",         COL_NAME,   doc.y - doc.currentLineHeight(), { width: 175 });
    doc.text("Funktion",     COL_ROLLE,  doc.y - doc.currentLineHeight(), { width: 95 });
    doc.text("Anw. / Entsch.", COL_STATUS, doc.y - doc.currentLineHeight(), { width: 75 });
    doc.text("Unterschrift", COL_UNTER,  doc.y - doc.currentLineHeight(), { width: 155 });
    doc.moveDown(0.3);
    doc.moveTo(RAND_LINKS, doc.y).lineTo(RAND_RECHTS, doc.y).strokeColor("#d1d5db").lineWidth(0.5).stroke();
    doc.moveDown(0.4);

    // Mitgliedsliste
    mitglieder.forEach((m, i) => {
      if (doc.y > 700) {
        doc.addPage();
        doc.y = 60;
      }
      const rowY = doc.y;

      // Zebra-Hintergrund
      if (i % 2 === 0) {
        doc.rect(RAND_LINKS, rowY - 2, BREITE, 26).fill("#f9fafb");
      }

      doc.fontSize(8).font("Helvetica").fillColor(FARBE_GRAU)
         .text(`${i + 1}.`, COL_NR, rowY + 4, { width: 18 });

      doc.fontSize(9).font("Helvetica-Bold").fillColor("#111827")
         .text(m.name, COL_NAME, rowY + 4, { width: 175 });

      // Rolle + ggf. "Vertretung für X"
      let rollenText = rolleLabel(m.rolle);
      if (m.status === "ERSATZ_FUER" && m.vertretungFuerName) {
        rollenText += ` (Vtg. f. ${m.vertretungFuerName})`;
      }
      doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU)
         .text(rollenText, COL_ROLLE, rowY + 4, { width: 95 });

      // Checkboxen – vorausgefüllt wenn digital erfasst
      const cbY = rowY + 4;
      const istAnwesend   = m.status === "ANWESEND" || m.status === "ERSATZ_FUER";
      const istEntschuldigt = m.status === "ABWESEND_ENTSCHULDIGT";

      // Checkbox Anwesend
      doc.rect(COL_STATUS, cbY, 9, 9).stroke();
      if (istAnwesend) {
        doc.fontSize(9).font("Helvetica-Bold").fillColor(FARBE_ERFOLG)
           .text("✓", COL_STATUS + 0.5, cbY - 0.5, { width: 9 });
      }
      doc.fontSize(7).font("Helvetica").fillColor("#374151")
         .text("Anw.", COL_STATUS + 12, cbY + 1, { width: 24 });

      // Checkbox Entschuldigt
      doc.rect(COL_STATUS + 40, cbY, 9, 9).stroke();
      if (istEntschuldigt) {
        doc.fontSize(9).font("Helvetica-Bold").fillColor(FARBE_GRAU)
           .text("✓", COL_STATUS + 40.5, cbY - 0.5, { width: 9 });
      }
      doc.fontSize(7).font("Helvetica").fillColor("#374151")
         .text("Entsch.", COL_STATUS + 52, cbY + 1, { width: 30 });

      // Unterschriftslinie
      doc.moveTo(COL_UNTER, rowY + 22).lineTo(COL_UNTER + 150, rowY + 22)
         .strokeColor("#9ca3af").lineWidth(0.5).stroke();

      doc.y = rowY + 30;
    });

    // Externe Gäste – neue Seite wenn < 210pt übrig (4 Zeilen + Unterschrift)
    if (doc.y > 530) { doc.addPage(); doc.y = 60; }

    doc.moveDown(0.8);
    doc.fontSize(8).font("Helvetica-Bold").fillColor(FARBE_GRAU)
       .text("Externe Gäste / Sonstige Anwesende:", RAND_LINKS, doc.y);
    doc.moveDown(0.4);

    for (let i = 0; i < 4; i++) {
      if (doc.y > 650) { doc.addPage(); doc.y = 60; }
      const rowY = doc.y;
      if (i % 2 === 0) doc.rect(RAND_LINKS, rowY - 2, BREITE, 26).fill("#f9fafb");

      doc.fontSize(8).font("Helvetica").fillColor(FARBE_GRAU)
         .text(`${mitglieder.length + i + 1}.`, COL_NR, rowY + 4, { width: 18 });

      // Leere Linie für Name
      doc.moveTo(COL_NAME, rowY + 20).lineTo(COL_NAME + 165, rowY + 20)
         .strokeColor("#9ca3af").lineWidth(0.5).stroke();
      doc.fontSize(7).fillColor(FARBE_GRAU)
         .text("Name, Funktion", COL_NAME, rowY + 22, { width: 165 });

      // Checkboxen (leer)
      const cbY = rowY + 4;
      doc.rect(COL_STATUS,      cbY, 9, 9).stroke();
      doc.rect(COL_STATUS + 40, cbY, 9, 9).stroke();
      doc.fontSize(7).font("Helvetica").fillColor("#374151")
         .text("Anw.", COL_STATUS + 12, cbY + 1, { width: 24 })
         .text("Entsch.", COL_STATUS + 52, cbY + 1, { width: 30 });

      // Unterschriftslinie
      doc.moveTo(COL_UNTER, rowY + 22).lineTo(COL_UNTER + 150, rowY + 22)
         .strokeColor("#9ca3af").lineWidth(0.5).stroke();

      doc.y = rowY + 30;
    }

    // Unterschrift – neue Seite wenn < 80pt bis Fußzeile (y=760)
    if (doc.y > 680) { doc.addPage(); doc.y = 60; }

    doc.moveDown(1);
    doc.moveTo(RAND_LINKS, doc.y).lineTo(RAND_RECHTS, doc.y)
       .strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    doc.moveDown(0.8);

    const anwDatum = sitzung.sitzungsdatum.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    doc.fontSize(8).font("Helvetica").fillColor(FARBE_GRAU)
       .text("Liste ausgegeben an:", RAND_LINKS, doc.y, { width: BREITE / 2 });
    doc.moveDown(2);
    doc.moveTo(RAND_LINKS, doc.y).lineTo(RAND_LINKS + 220, doc.y)
       .strokeColor("#111827").lineWidth(0.8).stroke();
    doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU)
       .text(`Oberhausen/Gladbeck, ${anwDatum}`, RAND_LINKS, doc.y + 4, { width: 220 });
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#374151")
       .text(layout.unterschrift_vorsitz, RAND_LINKS, doc.y + 12, { width: 220 });

    // Fußzeilen – y=760 statt 790, da A4+margin60 nur bis y≈782 reicht
    const seiten = (doc as any).bufferedPageRange().count;
    for (let i = 0; i < seiten; i++) {
      doc.switchToPage(i);
      const fy = 760;
      doc.moveTo(RAND_LINKS, fy).lineTo(RAND_RECHTS, fy).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
      const seitenText = `Seite ${i + 1} von ${seiten}`;
      if (layout.fusszeile_layout === "text_rechts") {
        doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU)
           .text(`${seitenText}  ·  Anwesenheitsliste`, RAND_LINKS, fy + 5, { continued: true })
           .text(`  ·  ${layout.fusszeile}`, { align: "right" });
      } else {
        doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU)
           .text(`${layout.fusszeile}  ·  Anwesenheitsliste`, RAND_LINKS, fy + 5, { continued: true })
           .text(`  ·  ${seitenText}`, { align: "right" });
      }
    }

    doc.end();
  });
}

// ── TOP-Auszug PDF (für Geschäftsführung etc.) ────────────────────
// Enthält: Briefkopf, Sitzungsinfo, TOP-Inhalt, Beschlüsse (nur Ergebnis, keine Stimmen)
export async function topAuszugPdfGenerieren(
  sitzung: { titel: string; sitzungsdatum: Date; ort?: string | null; sitzungstyp: string },
  top: {
    nummer:       number;
    titel:        string;
    inhalt?:      string | null;
    inhaltsJson?: unknown;
    ergebnis?:    string | null;
    ergebnisJson?: unknown;
    status:       string;
    beschluesse?: { antragstext: string; ergebnis: string | null; finalisiert: boolean }[];
  },
): Promise<Buffer> {
  const layout     = await layoutLaden();
  const logoBuffer = layout.logo_pfad
    ? await fs.readFile(layout.logo_pfad).catch(() => null)
    : null;

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margin: 60, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data",  c  => chunks.push(c));
    doc.on("error", reject);
    doc.on("end",   () => resolve(Buffer.concat(chunks)));

    // ── Briefkopf ─────────────────────────────────────────────────
    briefkopf(
      doc,
      { ...sitzung, notizen: null, erstelltVon: { name: "" }, anwesenheiten: [], tops: [] } as unknown as PdfSitzung,
      { versionNummer: "Auszug", typ: "AUSZUG", erstelltAm: new Date(), finalisiertAm: null },
      false,
      layout,
      logoBuffer,
    );
    doc.moveDown(0.5);

    // ── Auszug-Kennzeichnung ──────────────────────────────────────
    doc.fontSize(8).font("Helvetica-Bold").fillColor(FARBE_GRAU)
       .text("AUSZUG AUS DEM PROTOKOLL", RAND_LINKS, doc.y);
    doc.moveDown(0.8);

    // ── TOP-Titel ─────────────────────────────────────────────────
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#111827")
       .text(`${top.nummer}.  ${top.titel}`, RAND_LINKS, doc.y, { width: BREITE });
    doc.moveDown(0.5);

    // ── TOP-Inhalt ────────────────────────────────────────────────
    if (top.inhaltsJson) {
      tiptapZuPdf(doc, top.inhaltsJson, RAND_LINKS, BREITE);
    } else if (top.inhalt) {
      doc.fontSize(9).font("Helvetica").fillColor("#374151")
         .text(top.inhalt, RAND_LINKS, doc.y, { width: BREITE });
      doc.moveDown(0.3);
    }

    // ── Ergebnis ──────────────────────────────────────────────────
    if (top.ergebnisJson) {
      doc.moveDown(0.3);
      doc.fontSize(8).font("Helvetica-Bold").fillColor(FARBE_GRAU)
         .text("Ergebnis:", RAND_LINKS, doc.y);
      doc.moveDown(0.15);
      tiptapZuPdf(doc, top.ergebnisJson, RAND_LINKS, BREITE);
    } else if (top.ergebnis) {
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica-Oblique").fillColor("#374151")
         .text(`Ergebnis: ${top.ergebnis}`, RAND_LINKS, doc.y, { width: BREITE });
      doc.moveDown(0.3);
    }

    // ── Beschlüsse – nur Beschlossen/Abgelehnt, keine Stimmenanzahl
    const finalisierte = (top.beschluesse ?? []).filter(b => b.finalisiert);
    if (finalisierte.length > 0) {
      doc.moveDown(0.5);
      doc.moveTo(RAND_LINKS, doc.y).lineTo(RAND_RECHTS, doc.y)
         .strokeColor("#e5e7eb").lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      finalisierte.forEach(b => {
        if (doc.y > 660) doc.addPage();

        const istBeschlossen = b.ergebnis === "BESCHLOSSEN";
        const akzentFarbe   = istBeschlossen ? FARBE_ERFOLG : FARBE_FEHLER;
        const ergebnisLabel = istBeschlossen ? "Beschlossen"
          : b.ergebnis === "ABGELEHNT" ? "Abgelehnt"
          : (b.ergebnis ?? "—");

        const startY = doc.y;

        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(akzentFarbe)
           .text(`BESCHLUSS  ·  ${ergebnisLabel.toUpperCase()}`, RAND_LINKS + 10, doc.y, { width: BREITE - 10 });
        doc.moveDown(0.15);
        doc.fontSize(9).font("Helvetica").fillColor("#111827")
           .text(b.antragstext, RAND_LINKS + 10, doc.y, { width: BREITE - 18 });

        doc.moveTo(RAND_LINKS + 5, startY - 1)
           .lineTo(RAND_LINKS + 5, doc.y + 4)
           .strokeColor(akzentFarbe).lineWidth(2).stroke();

        doc.moveDown(0.5);
      });
    }

    // ── Fußzeile ──────────────────────────────────────────────────
    const seiten = (doc as any).bufferedPageRange().count;
    for (let i = 0; i < seiten; i++) {
      doc.switchToPage(i);
      const fy = 760;
      doc.moveTo(RAND_LINKS, fy).lineTo(RAND_RECHTS, fy)
         .strokeColor("#e5e7eb").lineWidth(0.5).stroke();
      doc.fontSize(7.5).font("Helvetica").fillColor(FARBE_GRAU)
         .text(`Auszug  ·  ${sitzung.titel}  ·  Seite ${i + 1} von ${seiten}`, RAND_LINKS, fy + 5, { width: BREITE });
    }

    doc.end();
  });
}
