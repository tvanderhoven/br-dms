import { FRIST_TYP_LABEL } from "./fristen.js";
import nodemailer from "nodemailer";
import prisma from "./prisma.js";

// "||" statt "??": Docker Compose ersetzt ${SMTP_FROM} durch einen LEEREN
// String (nicht "unset"), wenn die Variable in der .env fehlt – das führte
// schon mal zu einem komplett leeren From-Header, weil "??" einen leeren
// String nicht als "fehlt" erkennt.
const SMTP_FROM = process.env.SMTP_FROM || `"BR-DMS" <noreply@br-dms.lokal>`;

export const MAIL_ABSENDER_NAME    = "mail.absender_name";
export const MAIL_ABSENDER_ADRESSE = "mail.absender_adresse";

/**
 * Absender aller Mails: Einstellungen → System (z. B. "Betriebsrat" <betriebsrat@firma.de>),
 * sonst SMTP_FROM aus der .env. Viele Mailserver lassen nur Absender zu, für die das
 * SMTP-Konto berechtigt ist – das muss die IT einrichten.
 */
export async function absender(): Promise<string> {
  const e = await prisma.systemEinstellung.findMany({
    where: { schluessel: { in: [MAIL_ABSENDER_NAME, MAIL_ABSENDER_ADRESSE] } },
  }).catch(() => []);
  const wert = (k: string) => e.find(x => x.schluessel === k)?.wert.trim() ?? "";
  const adresse = wert(MAIL_ABSENDER_ADRESSE);
  if (!adresse) return SMTP_FROM;
  const name = wert(MAIL_ABSENDER_NAME).replace(/"/g, "");
  return name ? `"${name}" <${adresse}>` : adresse;
}


const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST!,
  port:   parseInt(process.env.SMTP_PORT ?? "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
  // TODO wieder entfernen, sobald die IT das abgelaufene TLS-Zertifikat des
  // Mailservers erneuert hat (Stand 2026-10-01: "certificate has expired").
  // Ohne das brechen alle ausgehenden Mails (Fristen/Ablauf-Erinnerung,
  // Passwort-Reset) beim TLS-Handshake ab. Nur vertretbar, weil der
  // Mailserver ausschließlich im internen, vertrauenswürdigen Netz liegt.
  tls: { rejectUnauthorized: false },
});

export async function sendePasswortReset(email: string, name: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link   = `${appUrl}/passwort-reset?token=${token}`;

  await transporter.sendMail({
    from:    await absender(),
    to:      email,
    subject: "BR-DMS – Passwort zurücksetzen",
    text: `Hallo ${name},\n\ndu hast eine Passwort-Zurücksetzen-Anfrage gestellt.\n\nLink (gültig 1 Stunde):\n${link}\n\nFalls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.\n\nDein BR-DMS`,
    html: `
      <p>Hallo <strong>${name}</strong>,</p>
      <p>du hast eine Passwort-Zurücksetzen-Anfrage gestellt.</p>
      <p>
        <a href="${link}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
          Passwort jetzt zurücksetzen
        </a>
      </p>
      <p style="color:#6b7280;font-size:12px">Link gültig für 1 Stunde. Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>
      <p style="color:#6b7280;font-size:12px">Dein BR-DMS</p>
    `,
  });
}

export interface AblaufEintrag {
  typ:             "ZEITMODELL" | "UEBERSTUNDEN";
  mitarbeiterName: string;
  abteilung:       string | null;
  detail:          string; // Zeitmodell-Buchstabe bzw. Überstunden-Regelung im Klartext
  gueltigBis:      Date;
}

export async function sendeAblaufZusammenfassung(
  email: string,
  name: string,
  eintraege: AblaufEintrag[]
): Promise<void> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const zeilen = eintraege.map(e => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${e.mitarbeiterName}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${e.abteilung ?? "–"}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${e.typ === "ZEITMODELL" ? "Zeitmodell" : "Überstunden"}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${e.detail}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#dc2626;font-weight:bold">${new Date(e.gueltigBis).toLocaleDateString("de-DE")}</td>
  </tr>`).join("");

  await transporter.sendMail({
    from:    await absender(),
    to:      email,
    subject: `BR-DMS – ${eintraege.length} Zeitmodell/Überstunden-Regelung(en) laufen diesen Monat aus`,
    text:    eintraege.map(e =>
      `${e.mitarbeiterName} (${e.abteilung ?? "–"}) – ${e.typ === "ZEITMODELL" ? "Zeitmodell" : "Überstunden"}: ${e.detail} – läuft aus am ${new Date(e.gueltigBis).toLocaleDateString("de-DE")}`
    ).join("\n"),
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto">
      <div style="background:#1e3a8a;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">BR-DMS – Zeitmodell & Überstunden laufen aus</h2>
      </div>
      <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <p>Hallo <strong>${name}</strong>,</p>
        <p>folgende <strong>${eintraege.length} Regelung(en)</strong> laufen diesen Monat aus:</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
          <thead>
            <tr style="background:#dbeafe">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Mitarbeiter</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Abteilung</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Typ</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Regelung</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Läuft aus am</th>
            </tr>
          </thead>
          <tbody>${zeilen}</tbody>
        </table>
        <p style="margin-top:20px">
          <a href="${appUrl}/gehaltstabelle" style="background:#1e40af;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">→ Zur Gehaltstabelle</a>
        </p>
        <p style="color:#9ca3af;font-size:11px;margin-top:20px">Automatische Nachricht von BR-DMS · Monatlich am 15. um 07:00 Uhr</p>
      </div>
    </div>`,
  });
}

export async function sendeFristenZusammenfassung(
  email: string,
  name: string,
  fristen: Array<{ titel: string; typ: string; faelligAm: Date; tageVerbleibend: number }>
): Promise<void> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const zeilen = fristen.map(f => {
    const farbe = f.tageVerbleibend <= 3 ? "#dc2626" : "#d97706";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${f.titel}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${FRIST_TYP_LABEL[f.typ] ?? f.typ}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${farbe};font-weight:bold">${f.tageVerbleibend} Tag(e)</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${new Date(f.faelligAm).toLocaleDateString("de-DE")}</td>
    </tr>`;
  }).join("");

  await transporter.sendMail({
    from:    await absender(),
    to:      email,
    subject: `BR-DMS – ${fristen.length} Frist(en) laufen in 7 Tagen ab`,
    text:    fristen.map(f =>
      `${f.titel} – ${FRIST_TYP_LABEL[f.typ] ?? f.typ} – fällig in ${f.tageVerbleibend} Tag(en) (${new Date(f.faelligAm).toLocaleDateString("de-DE")})`
    ).join("\n"),
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1e3a8a;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">BR-DMS – Fristenwarnung</h2>
      </div>
      <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <p>Hallo <strong>${name}</strong>,</p>
        <p>folgende <strong>${fristen.length} Frist(en)</strong> laufen in den nächsten 7 Tagen ab:</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
          <thead>
            <tr style="background:#dbeafe">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Frist</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Fristtyp</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Verbleibend</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Fällig am</th>
            </tr>
          </thead>
          <tbody>${zeilen}</tbody>
        </table>
        <p style="margin-top:20px">
          <a href="${appUrl}/dokumente" style="background:#1e40af;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">→ Zum Dokumentenarchiv</a>
        </p>
        <p style="color:#9ca3af;font-size:11px;margin-top:20px">Automatische Nachricht von BR-DMS · Täglich 07:00 Uhr</p>
      </div>
    </div>`,
  });
}

// ── Einladung zur Sitzung (Paket 4) ──────────────────────────────────

const html = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EinladungMail {
  an:              string;
  name:            string;
  sitzungTitel:    string;
  sitzungsdatum:   Date;
  ort:             string | null;
  tops:            { nummer: number; titel: string }[];
  ersatzFuer:      string | null;     // Name des verhinderten Mitglieds
  sitzungUrl:      string;
  anhang:          { dateiname: string; pfad: string } | null;
  unterschrift:    string;            // z. B. "Sabine Kröger, Vorsitzende"
}

/** Verschickt eine Einladung; wirft bei Fehlern (der Aufrufer protokolliert). */
export async function sendeEinladung(m: EinladungMail): Promise<void> {
  // Sitzungszeiten liegen "wie eingegeben" in UTC (09:00 Ortszeit = 09:00Z, siehe
  // datetime-local im Frontend) – daher wie in den PDFs in UTC formatieren
  const datum = m.sitzungsdatum.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  const zeit  = m.sitzungsdatum.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const ersatz = m.ersatzFuer
    ? `Du wirst als Ersatzmitglied für ${m.ersatzFuer} geladen, der/die an der Sitzung verhindert ist.`
    : null;

  const text = [
    `Hallo ${m.name},`,
    "",
    `hiermit lade ich dich zur Sitzung „${m.sitzungTitel}“ ein.`,
    "",
    `Termin: ${datum}, ${zeit} Uhr`,
    ...(m.ort ? [`Ort:    ${m.ort}`] : []),
    ...(ersatz ? ["", ersatz] : []),
    "",
    "Tagesordnung:",
    ...m.tops.map(t => `  ${t.nummer}. ${t.titel}`),
    "",
    ...(m.anhang ? ["Die Tagesordnung liegt als PDF bei."] : []),
    `In BR-DMS: ${m.sitzungUrl}`,
    "",
    "Solltest du verhindert sein, gib bitte unverzüglich Bescheid, damit ein Ersatzmitglied geladen werden kann.",
    "",
    "Viele Grüße",
    m.unterschrift,
  ].join("\n");

  const topsHtml = m.tops.map(t =>
    `<tr><td style="padding:4px 10px 4px 0;color:#6b7280;vertical-align:top">${t.nummer}.</td><td style="padding:4px 0">${html(t.titel)}</td></tr>`
  ).join("");

  await transporter.sendMail({
    from:    await absender(),
    to:      m.an,
    subject: `Einladung: ${m.sitzungTitel}`,
    text,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <p>Hallo ${html(m.name)},</p>
      <p>hiermit lade ich dich zur Sitzung <strong>„${html(m.sitzungTitel)}“</strong> ein.</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Termin</td><td><strong>${html(datum)}, ${zeit} Uhr</strong></td></tr>
        ${m.ort ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Ort</td><td>${html(m.ort)}</td></tr>` : ""}
      </table>
      ${ersatz ? `<p style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:8px 12px">${html(ersatz)}</p>` : ""}
      <p style="margin-bottom:4px"><strong>Tagesordnung</strong></p>
      <table style="border-collapse:collapse">${topsHtml}</table>
      <p>${m.anhang ? "Die Tagesordnung liegt als PDF bei. " : ""}<a href="${html(m.sitzungUrl)}">Sitzung in BR-DMS öffnen</a></p>
      <p style="color:#6b7280;font-size:13px">Solltest du verhindert sein, gib bitte unverzüglich Bescheid, damit ein Ersatzmitglied geladen werden kann.</p>
      <p>Viele Grüße<br>${html(m.unterschrift)}</p>
    </div>`,
    attachments: m.anhang ? [{ filename: m.anhang.dateiname, path: m.anhang.pfad }] : [],
  });
}
