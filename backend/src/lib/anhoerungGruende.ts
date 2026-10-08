/**
 * Gründe-Kataloge für die Stellungnahme zu Anhörungen nach § 99 / § 102 BetrVG.
 *
 * ACHTUNG: Nach bestem Wissen aus BetrVG und KSchG zusammengestellt, aber nicht
 * juristisch geprüft – vor dem Versand durch den Vorsitz gegenlesen lassen.
 */

export interface AnhoerungGrund {
  code: string;
  text: string;
}

// § 99 Abs. 2 BetrVG – Gründe für die Verweigerung der Zustimmung
export const ZUSTIMMUNGSVERWEIGERUNG_GRUENDE: AnhoerungGrund[] = [
  {
    code: "99-1",
    text:
      "Nr. 1 – Verstoß gegen ein Gesetz, eine Verordnung, eine Unfallverhütungsvorschrift " +
      "oder eine Bestimmung des anzuwendenden Tarifvertrages oder einer Betriebsvereinbarung",
  },
  { code: "99-2", text: "Nr. 2 – Benachteiligung eines Bewerbers oder Arbeitnehmers ohne sachlichen Grund" },
  { code: "99-3", text: "Nr. 3 – Sonstige Gründe (siehe Begründungstext)" },
];

// § 102 Abs. 3 BetrVG i.V.m. § 1 Abs. 2/3 KSchG – Gründe für den Widerspruch
export const WIDERSPRUCH_GRUENDE: AnhoerungGrund[] = [
  { code: "102-1", text: "Nr. 1 – Sozialwidrigkeit i. S. d. § 1 Abs. 2 und 3 KSchG" },
  { code: "102-2", text: "Nr. 2 – Weiterbeschäftigung auf einem anderen Arbeitsplatz möglich" },
  { code: "102-3", text: "Nr. 3 – Weiterbeschäftigung nach Umschulung oder Fortbildung möglich" },
  { code: "102-4", text: "Nr. 4 – Weiterbeschäftigung zu geänderten Vertragsbedingungen möglich" },
  { code: "102-5", text: "Nr. 5 – Fehlerhafter Interessenausgleich (§ 1 Abs. 5 KSchG)" },
];

export function gruendeFuerArt(art: string | null | undefined): AnhoerungGrund[] {
  if (art === "ZUSTIMMUNGSVERWEIGERUNG") return ZUSTIMMUNGSVERWEIGERUNG_GRUENDE;
  if (art === "WIDERSPRUCH") return WIDERSPRUCH_GRUENDE;
  return [];
}

export const ANHOERUNG_GRUENDE_HINWEIS =
  "Gründe-Katalog nach bestem Wissen aus BetrVG/KSchG, aber nicht juristisch geprüft – " +
  "vor dem Versand gegenlesen lassen.";
