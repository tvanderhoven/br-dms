/**
 * Kalendertermin (.ics, RFC 5545) für die Einladungsmail
 *
 * Kein Abo-Link: BR-DMS läuft im Intranet, die Datei reist mit der Mail und wird in
 * Outlook/Thunderbird per Klick in den Kalender übernommen.
 *
 * Sitzungszeiten liegen "wie eingegeben" in UTC (09:00 Ortszeit = 09:00Z, siehe
 * mailer.ts) – die UTC-Felder sind also die Ortszeit und gehen mit TZID=Europe/Berlin raus.
 * Dieselbe UID je Sitzung: eine erneut versendete Einladung (höhere SEQUENCE)
 * aktualisiert den Termin, statt einen zweiten anzulegen.
 */

/** Sitzungen haben keine Endzeit – Kalendertermin mit dieser Dauer */
export const SITZUNG_DAUER_STUNDEN = 2;

export interface KalenderTermin {
  uid:          string;
  sequenz:      number;
  titel:        string;
  beginn:       Date;           // Ortszeit in den UTC-Feldern
  ort:          string | null;
  beschreibung: string;
  url:          string;
}

const ZEITZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const zwei = (n: number) => String(n).padStart(2, "0");

/** 20261014T090000 – ohne "Z", die Zeitzone kommt über TZID */
function ortszeit(d: Date): string {
  return `${d.getUTCFullYear()}${zwei(d.getUTCMonth() + 1)}${zwei(d.getUTCDate())}T${zwei(d.getUTCHours())}${zwei(d.getUTCMinutes())}00`;
}

function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Sonderzeichen in TEXT-Werten maskieren (RFC 5545, 3.3.11) */
function text(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Zeilen über 75 Byte falten, ohne UTF-8-Zeichen zu zerschneiden */
function falten(zeile: string): string {
  const teile: string[] = [];
  let aktuell = "";
  let bytes = 0;
  for (const z of zeile) {
    const b = Buffer.byteLength(z);
    if (bytes + b > (teile.length ? 74 : 75)) {
      teile.push(aktuell);
      aktuell = "";
      bytes = 0;
    }
    aktuell += z;
    bytes += b;
  }
  teile.push(aktuell);
  return teile.join("\r\n ");
}

export function kalenderDatei(t: KalenderTermin): string {
  const ende = new Date(t.beginn.getTime() + SITZUNG_DAUER_STUNDEN * 3600_000);
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BR-DMS//Einladung//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...ZEITZONE,
    "BEGIN:VEVENT",
    `UID:${t.uid}`,
    `SEQUENCE:${t.sequenz}`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART;TZID=Europe/Berlin:${ortszeit(t.beginn)}`,
    `DTEND;TZID=Europe/Berlin:${ortszeit(ende)}`,
    `SUMMARY:${text(t.titel)}`,
    ...(t.ort ? [`LOCATION:${text(t.ort)}`] : []),
    `DESCRIPTION:${text(t.beschreibung)}`,
    `URL:${t.url}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Erinnerung",
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return zeilen.map(falten).join("\r\n") + "\r\n";
}
