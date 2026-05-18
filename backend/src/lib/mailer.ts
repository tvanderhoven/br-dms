import nodemailer from "nodemailer";

const FRIST_TYP_LABEL: Record<string, string> = {
  ANHOERUNG_99_WOCHE:            "§ 99 Anhörung (1 Woche)",
  ANHOERUNG_102_ORDENTLICH:      "§ 102 ordentl. Kündigung",
  ANHOERUNG_102_AUSSERORDENTLICH:"§ 102 außerordentl. Kündigung",
  WIDERSPRUCH:                   "Widerspruch",
  BENUTZERDEFINIERT:             "Benutzerdefiniert",
};

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST!,
  port:   parseInt(process.env.SMTP_PORT ?? "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
});

export async function sendePasswortReset(email: string, name: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link   = `${appUrl}/passwort-reset?token=${token}`;

  await transporter.sendMail({
    from:    process.env.SMTP_FROM ?? `"BR-DMS" <noreply@br-dms.lokal>`,
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

export async function sendeFristenZusammenfassung(
  email: string,
  name: string,
  fristen: Array<{ dokumentTitel: string; typ: string; faelligAm: Date; tageVerbleibend: number }>
): Promise<void> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const zeilen = fristen.map(f => {
    const farbe = f.tageVerbleibend <= 3 ? "#dc2626" : "#d97706";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${f.dokumentTitel}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${FRIST_TYP_LABEL[f.typ] ?? f.typ}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${farbe};font-weight:bold">${f.tageVerbleibend} Tag(e)</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${new Date(f.faelligAm).toLocaleDateString("de-DE")}</td>
    </tr>`;
  }).join("");

  await transporter.sendMail({
    from:    process.env.SMTP_FROM ?? `"BR-DMS" <noreply@br-dms.lokal>`,
    to:      email,
    subject: `BR-DMS – ${fristen.length} Frist(en) laufen in 7 Tagen ab`,
    text:    fristen.map(f =>
      `${f.dokumentTitel} – ${FRIST_TYP_LABEL[f.typ] ?? f.typ} – fällig in ${f.tageVerbleibend} Tag(en) (${new Date(f.faelligAm).toLocaleDateString("de-DE")})`
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
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#1e40af">Dokument</th>
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
