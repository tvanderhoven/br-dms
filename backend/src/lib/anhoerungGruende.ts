/**
 * Gründe-Kataloge für die Stellungnahme zu Anhörungen nach § 99 / § 102 BetrVG.
 *
 * Wortlaut und Nummerierung folgen § 99 Abs. 2 und § 102 Abs. 3 BetrVG (gekürzt).
 * Der Hinweis je Grund sagt, was die Begründung konkret enthalten muss – ein Widerspruch
 * oder eine Verweigerung, die nur den Gesetzestext wiederholt, ist unbeachtlich.
 *
 * ACHTUNG: Nach bestem Wissen zusammengestellt, aber nicht juristisch geprüft –
 * vor dem Versand durch den Vorsitz gegenlesen lassen.
 *
 * Spiegel im Frontend: frontend/src/lib/api.ts (gleiche Codes, gleiche Texte).
 */

export interface AnhoerungGrund {
  code: string;
  text: string;
  /** Was in die Begründung gehört (nur Anzeige im Formular, nicht im Brief) */
  hinweis: string;
}

// § 99 Abs. 2 BetrVG – Gründe für die Verweigerung der Zustimmung
export const ZUSTIMMUNGSVERWEIGERUNG_GRUENDE: AnhoerungGrund[] = [
  {
    code: "99-nr1",
    text: "Nr. 1 – Verstoß gegen ein Gesetz, eine Verordnung, eine Unfallverhütungsvorschrift, einen Tarifvertrag, " +
          "eine Betriebsvereinbarung, eine gerichtliche Entscheidung oder eine behördliche Anordnung",
    hinweis: "Die Vorschrift genau benennen (mit Paragraph bzw. Ziffer) und sagen, wodurch die Maßnahme dagegen verstößt.",
  },
  {
    code: "99-nr2",
    text: "Nr. 2 – Verstoß gegen eine Auswahlrichtlinie nach § 95 BetrVG",
    hinweis: "Die Richtlinie und die Regel darin benennen, gegen die die Maßnahme verstößt.",
  },
  {
    code: "99-nr3",
    text: "Nr. 3 – Begründete Besorgnis, dass andere Beschäftigte gekündigt werden oder sonstige Nachteile erleiden",
    hinweis: "Wer betroffen wäre und welcher Nachteil konkret droht, z. B. ein gleich geeigneter befristet "
           + "Beschäftigter, der bei einer unbefristeten Einstellung übergangen wird.",
  },
  {
    code: "99-nr4",
    text: "Nr. 4 – Benachteiligung des betroffenen Arbeitnehmers ohne betrieblichen oder persönlichen Grund",
    hinweis: "Worin der Nachteil für die betroffene Person liegt, z. B. schlechtere Arbeitsbedingungen nach einer Versetzung.",
  },
  {
    code: "99-nr5",
    text: "Nr. 5 – Die nach § 93 BetrVG verlangte innerbetriebliche Ausschreibung ist unterblieben",
    hinweis: "Wann der Betriebsrat die Ausschreibung verlangt hat und dass die Stelle nicht intern ausgeschrieben wurde.",
  },
  {
    code: "99-nr6",
    text: "Nr. 6 – Begründete Besorgnis, dass der Bewerber den Betriebsfrieden stören wird",
    hinweis: "Konkrete Tatsachen nennen (gesetzwidriges Verhalten oder grobe Verletzung von § 75 Abs. 1), keine Vermutungen.",
  },
];

// § 102 Abs. 3 BetrVG – Gründe für den Widerspruch gegen eine ordentliche Kündigung
export const WIDERSPRUCH_GRUENDE: AnhoerungGrund[] = [
  {
    code: "102-nr1",
    text: "Nr. 1 – Soziale Gesichtspunkte bei der Auswahl nicht oder nicht ausreichend berücksichtigt",
    hinweis: "Vergleichbare Beschäftigte benennen, die sozial weniger schutzwürdig sind, oder sagen, welches Kriterium "
           + "falsch gewichtet wurde (Betriebszugehörigkeit, Alter, Unterhaltspflichten, Schwerbehinderung).",
  },
  {
    code: "102-nr2",
    text: "Nr. 2 – Die Kündigung verstößt gegen eine Auswahlrichtlinie nach § 95 BetrVG",
    hinweis: "Die Richtlinie und die Regel darin benennen, gegen die die Kündigung verstößt.",
  },
  {
    code: "102-nr3",
    text: "Nr. 3 – Weiterbeschäftigung an einem anderen Arbeitsplatz im Betrieb oder Unternehmen möglich",
    hinweis: "Den freien Arbeitsplatz konkret benennen: Abteilung, Stelle, ab wann frei – z. B. „die ab 01.11. freie "
           + "Stelle Lagerlogistik, Werk 2“. Ein allgemeines „Weiterbeschäftigung ist möglich“ reicht nicht.",
  },
  {
    code: "102-nr4",
    text: "Nr. 4 – Weiterbeschäftigung nach zumutbaren Umschulungs- oder Fortbildungsmaßnahmen möglich",
    hinweis: "Welche Maßnahme, wie lange, und welcher Arbeitsplatz danach frei ist.",
  },
  {
    code: "102-nr5",
    text: "Nr. 5 – Weiterbeschäftigung unter geänderten Vertragsbedingungen möglich, der Arbeitnehmer ist einverstanden",
    hinweis: "Welche Änderung (z. B. Teilzeit, andere Schicht) auf welchem Arbeitsplatz – und dass das Einverständnis vorliegt.",
  },
];

/**
 * Codes aus der ersten Fassung der Kataloge (bis Version 1.2.1), deren Nummern nicht dem Gesetz
 * entsprachen, auf die richtigen Gründe abbilden. Ohne Entsprechung: "99-3" (Sonstige) und
 * "102-5" (Interessenausgleich – kein Widerspruchsgrund nach § 102 Abs. 3).
 */
const ALTE_CODES: Record<string, string | null> = {
  "99-1": "99-nr1", "99-2": "99-nr4", "99-3": null,
  "102-1": "102-nr1", "102-2": "102-nr3", "102-3": "102-nr4", "102-4": "102-nr5", "102-5": null,
};

export function gruendeNormalisieren(codes: string[] | null | undefined): string[] {
  const neu = (codes ?? []).map(c => (c in ALTE_CODES ? ALTE_CODES[c] : c)).filter((c): c is string => !!c);
  return [...new Set(neu)];
}

export function gruendeFuerArt(art: string | null | undefined): AnhoerungGrund[] {
  if (art === "ZUSTIMMUNGSVERWEIGERUNG") return ZUSTIMMUNGSVERWEIGERUNG_GRUENDE;
  if (art === "WIDERSPRUCH") return WIDERSPRUCH_GRUENDE;
  return [];
}

export const ANHOERUNG_GRUENDE_HINWEIS =
  "Gründe-Katalog nach bestem Wissen aus dem BetrVG, aber nicht juristisch geprüft – " +
  "vor dem Versand gegenlesen lassen.";
