/**
 * Gemeinsame CSV-Import-Hilfsfunktionen (genutzt von routes/gehaltstabelle.ts
 * und routes/mitarbeiter.ts)
 */

// Excel exportiert CSVs unter Windows standardmäßig als ANSI/Windows-1252, nicht UTF-8.
// Ohne BOM lässt sich das nicht zuverlässig erkennen – deshalb: UTF-8 versuchen, und bei
// ungültigen Sequenzen (Replacement-Zeichen "�") auf Latin-1 zurückfallen. Windows-1252 und
// ISO-8859-1 sind im für Umlaute relevanten Bereich (ä/ö/ü/Ä/Ö/Ü/ß) identisch, Latin-1
// deckt das also ab, ohne eine zusätzliche Abhängigkeit (iconv-lite) zu benötigen.
export function decodeCsvBuffer(buffer: Buffer): string {
  const hatUtf8Bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  if (hatUtf8Bom) return buffer.toString("utf-8");

  const alsUtf8 = buffer.toString("utf-8");
  if (!alsUtf8.includes("�")) return alsUtf8; // gültiges UTF-8, keine Ersatzzeichen

  return buffer.toString("latin1");
}

// ── einfacher CSV-Parser (Semikolon oder Komma, unterstützt Anführungszeichen) ──
export function parseCsv(text: string): string[][] {
  const bereinigt = text.replace(/^﻿/, "");
  const ersteZeile = bereinigt.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = ersteZeile.split(";").length >= ersteZeile.split(",").length ? ";" : ",";

  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let feld = "";
  let inAnfuehrungszeichen = false;

  for (let i = 0; i < bereinigt.length; i++) {
    const zeichen = bereinigt[i];
    if (inAnfuehrungszeichen) {
      if (zeichen === '"') {
        if (bereinigt[i + 1] === '"') { feld += '"'; i++; }
        else inAnfuehrungszeichen = false;
      } else {
        feld += zeichen;
      }
    } else if (zeichen === '"') {
      inAnfuehrungszeichen = true;
    } else if (zeichen === delimiter) {
      zeile.push(feld); feld = "";
    } else if (zeichen === "\r") {
      // ignorieren, \n beendet die Zeile
    } else if (zeichen === "\n") {
      zeile.push(feld); zeilen.push(zeile); zeile = []; feld = "";
    } else {
      feld += zeichen;
    }
  }
  if (feld.length > 0 || zeile.length > 0) { zeile.push(feld); zeilen.push(zeile); }

  return zeilen.filter(z => z.some(f => f.trim() !== ""));
}

// unterstützt YYYY-MM-DD und DD.MM.YYYY
export function parseImportDatum(wert: string): Date | null {
  const s = wert.trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return gueltigesUtcDatum(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return gueltigesUtcDatum(+m[3], +m[2], +m[1]);

  return null;
}

// Date.UTC rechnet Unsinn wie den 31.13. stillschweigend in den Folgemonat um –
// deshalb prüfen, ob Tag und Monat nach dem Erzeugen noch stimmen.
function gueltigesUtcDatum(jahr: number, monat: number, tag: number): Date | null {
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  return d.getUTCFullYear() === jahr && d.getUTCMonth() === monat - 1 && d.getUTCDate() === tag ? d : null;
}
