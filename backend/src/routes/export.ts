import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { DokumentStatus, Kategorie, Role } from "@prisma/client";
import PDFDocument from "pdfkit";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { FRIST_TYP_LABEL } from "../lib/fristen.js";
import { KATEGORIE_LABEL } from "../lib/kategorien.js";



function pdfBuffer(cb: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    cb(doc);
    doc.end();
  });
}

export async function exportRouten(app: FastifyInstance): Promise<void> {

  // ── GET /api/export/amtsuebergabe ────────────────────────────────
  app.get(
    "/amtsuebergabe",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const [dokumente, beschluesse, benutzerListe, fristenOhneDokument] = await Promise.all([
        prisma.dokument.findMany({
          where:   { status: { not: DokumentStatus.GELOESCHT } },
          include: { fristen: true, hochgeladenVon: { select: { name: true } } },
          orderBy: { kategorie: "asc" },
        }),
        prisma.beschluss.findMany({
          where:   { finalisiert: true },
          include: {
            top: {
              select: {
                nummer: true,
                titel:  true,
                sitzung: { select: { titel: true, sitzungsdatum: true } },
              },
            },
          },
          orderBy: { finalisiertAm: "desc" },
        }),
        prisma.benutzer.findMany({
          where:   { aktiv: true },
          select:  { name: true, email: true, rolle: true },
          orderBy: { name: "asc" },
        }),
        prisma.frist.findMany({
          where:   { dokumentId: null, status: "OFFEN" },
          orderBy: { faelligAm: "asc" },
        }),
      ]);

      const pdf = await pdfBuffer(doc => {
        const datum = new Date().toLocaleDateString("de-DE", { dateStyle: "long" });

        // Titelseite
        doc.fontSize(22).font("Helvetica-Bold")
          .text("Amtsübergabe-Dokumentation", { align: "center" });
        doc.fontSize(13).font("Helvetica")
          .text("BR-DMS – Betriebsrats-Dokumentenmanagementsystem", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor("#6b7280")
          .text(`Erstellt am: ${datum}`, { align: "center" });
        doc.fillColor("black");
        doc.moveDown(2);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#1e3a8a");
        doc.moveDown(2);

        // 1. Betriebsratsmitglieder
        doc.fontSize(15).font("Helvetica-Bold").fillColor("#1e3a8a")
          .text("1. Mitglieder des Betriebsrats");
        doc.fillColor("black").moveDown(0.5);
        for (const b of benutzerListe) {
          doc.fontSize(10).font("Helvetica")
            .text(`• ${b.name}  (${b.email})  –  ${b.rolle}`, { indent: 10 });
        }
        doc.moveDown(1.5);

        // 2. Dokumente
        doc.fontSize(15).font("Helvetica-Bold").fillColor("#1e3a8a")
          .text(`2. Aktive Dokumente (${dokumente.length})`);
        doc.fillColor("black").moveDown(0.5);

        let letzteKat = "";
        for (const d of dokumente) {
          if (d.kategorie !== letzteKat) {
            letzteKat = d.kategorie;
            doc.moveDown(0.3);
            doc.fontSize(10).font("Helvetica-Bold")
              .text(KATEGORIE_LABEL[d.kategorie] ?? d.kategorie, { indent: 10 });
          }
          const titel = d.alias ?? d.titel;
          const az    = d.aktenzeichen ? ` – AZ: ${d.aktenzeichen}` : "";
          const frist = d.fristen.filter(f => f.status === "OFFEN").map(f =>
            `${FRIST_TYP_LABEL[f.typ] ?? f.typ} bis ${new Date(f.faelligAm).toLocaleDateString("de-DE")}`
          ).join(", ");
          doc.fontSize(9).font("Helvetica")
            .text(`${titel}${az}${frist ? `  |  ⏰ ${frist}` : ""}  [${d.status}]`, { indent: 20 });
        }
        if (fristenOhneDokument.length > 0) {
          doc.moveDown(0.3);
          doc.fontSize(10).font("Helvetica-Bold").text("Offene Fristen ohne Dokument", { indent: 10 });
          for (const f of fristenOhneDokument) {
            doc.fontSize(9).font("Helvetica").text(
              `${f.bezeichnung ?? FRIST_TYP_LABEL[f.typ] ?? f.typ} – fällig ${new Date(f.faelligAm).toLocaleDateString("de-DE")}`,
              { indent: 20 },
            );
          }
        }
        doc.moveDown(1.5);

        // 3. Beschlussregister
        doc.fontSize(15).font("Helvetica-Bold").fillColor("#1e3a8a")
          .text(`3. Beschlussregister (${beschluesse.length} finalisierte Beschlüsse)`);
        doc.fillColor("black").moveDown(0.5);

        for (const b of beschluesse) {
          const datumStr = b.finalisiertAm
            ? new Date(b.finalisiertAm).toLocaleDateString("de-DE")
            : "–";
          doc.fontSize(10).font("Helvetica-Bold")
            .text(`${b.top.sitzung.titel}  –  TOP ${b.top.nummer}: ${b.top.titel}  (${datumStr})`, { indent: 10 });
          doc.fontSize(9).font("Helvetica")
            .text(`Antrag: ${b.antragstext}`, { indent: 20 });
          doc.text(
            `Ergebnis: ${b.ergebnis ?? "–"}  (Ja: ${b.jaStimmen} / Nein: ${b.neinStimmen} / Enthaltungen: ${b.enthaltungen})`,
            { indent: 20 }
          );
          if (b.rechtsgrundlage) {
            doc.text(`Rechtsgrundlage: ${b.rechtsgrundlage}`, { indent: 20 });
          }
          doc.moveDown(0.5);
        }
      });

      const dateiname = `BR-DMS_Amtsuebergabe_${new Date().toISOString().slice(0, 10)}.pdf`;
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${dateiname}"`)
        .header("Content-Length", pdf.length)
        .send(pdf);
    }
  );

  // Hinweis: Der frühere Platzhalter-Endpoint "briefvorlage" wurde durch den
  // vollständigen Anhörungs-Vorgang ersetzt (routes/anhoerung.ts – echter
  // Briefkopf, Verknüpfung zum Beschluss, Archivierung, Fristen-Erledigung).
}
