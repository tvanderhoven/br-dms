import nodemailer from "nodemailer";

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
