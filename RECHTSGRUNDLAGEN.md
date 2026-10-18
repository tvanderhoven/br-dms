# Rechtsgrundlagen – ungeprüfte Arbeitsnotiz

> **Achtung: ungeprüfte Arbeitsnotiz.** Diese Datei ist **nicht** Teil des Handbuchs und keine Rechtsberatung.
> Die Zuordnungen stammen aus einer ersten Recherche und sind **nicht** gegen den Gesetzestext geprüft;
> einzelne Angaben haben sich bereits als falsch herausgestellt. Sie dient nur als Gedächtnisstütze, warum
> BR-DMS etwas so umsetzt, und wird Punkt für Punkt nachgeprüft.
>
> **Status:** `ungeprüft` = noch nicht kontrolliert · `geprüft TT.MM.JJJJ` = gegen den Gesetzestext abgeglichen
> (bei Bedarf mit Notiz, was korrigiert wurde).
>
> Ein „–“ bedeutet nicht „unzulässig“, sondern nur: Das Gesetz schreibt diesen konkreten Punkt nicht vor,
> BR-DMS geht hier bewusst darüber hinaus (meist, um Ladung oder Fristbeginn später belegen zu können).

## Sitzungslebenszyklus (Dokumenteneingang bis Abschluss)

| Phase | Funktion | Rechtsgrundlage (vermutet) | Status |
|---|---|---|---|
| Dokumenteneingang | Fristbeginn ab Zugang | § 130 BGB, §§ 187/188/193 BGB | ungeprüft |
| Dokumenteneingang | Hinweis auf Zustimmungsfiktion | § 99 / § 102 BetrVG | ungeprüft |
| Dokumenteneingang | Empfangsbestätigung an den Arbeitgeber | – (Beweis des Fristbeginns) | ungeprüft |
| Entwurf | Tagesordnung vorbereiten | § 29 BetrVG | ungeprüft |
| Fixierung | Tagesordnung feststellen und mitteilen | § 29 BetrVG | ungeprüft |
| Einladung | Einladung mit Tagesordnung | § 29 BetrVG | ungeprüft |
| Einladung | Ersatzmitglieder nur bei Vertretung laden | § 29 BetrVG | ungeprüft |
| Einladung | Einberufung auf Antrag (Arbeitgeber/ein Viertel) | § 29 BetrVG – Wochenfrist ist interne Bearbeitungsfrist, § 29 nennt keine Frist | ungeprüft |
| Einladung | Mindestens einmal im Monat tagen | kein Gesetzesgebot – interne Erinnerung | ungeprüft |
| Einladung | Versandnachweis (PDF/CSV) | – (Nachweis ordnungsgemäßer Ladung) | ungeprüft |
| Sitzung | Spontan-TOP nur einstimmig | Rechtsprechung, kein Gesetzestext | ungeprüft |
| Sitzung | Mehrheit der anwesenden Mitglieder | § 33 BetrVG | ungeprüft |
| Sitzung | Beschlussfähigkeit (mind. die Hälfte) | § 33 BetrVG | ungeprüft |
| Sitzung | Vertraulichkeit / Nichtöffentlichkeit | § 30, § 79 BetrVG | ungeprüft |
| Sitzung | Nachrücken von Ersatzmitgliedern | § 25 BetrVG | ungeprüft |
| Sitzung | Geschlechterquoten-Warnung | § 15 BetrVG | ungeprüft |
| Finalisierung | Niederschrift (Mindestinhalt) | § 34 BetrVG | ungeprüft |
| Finalisierung | Digitaler Zeitstempel (SHA-256) | – (Revisionssicherheit, über das Gesetz hinaus) | ungeprüft |
| Abschluss | Unterschrift Vorsitz und ein weiteres Mitglied | § 34 BetrVG | ungeprüft |
| Abschluss | Pflicht zu zwei Scans vor Abschluss | – (strengere interne Regel) | ungeprüft |
| Archiv | Sitzungspaket (ZIP), Protokoll-Archiv zur Amtsübergabe | – (Organisation/Kontinuität) | ungeprüft |

## Wahlen (BR und JAV)

Die Fristen selbst stehen im Code in `backend/src/lib/wahlFristen.ts` (dort mit Rechtsgrundlage je Frist).

| Phase | Funktion | Rechtsgrundlage (vermutet) | Status |
|---|---|---|---|
| Wahlvorstand | Bestellung vor Amtszeitende | § 16 BetrVG (BR, 10 Wochen) / § 63 BetrVG (JAV, 8 Wochen) | ungeprüft |
| Wahlvorstand | Ersatzbestellung durchs Arbeitsgericht | § 16 BetrVG (BR) / § 63 BetrVG (JAV) | ungeprüft |
| Wahlvorstand | Bestellung im vereinfachten Verfahren (4 Wochen) | § 17a BetrVG (BR) / § 63 BetrVG (JAV) | ungeprüft |
| Normales Verfahren | Wahlausschreiben | § 3 WO | ungeprüft |
| Normales Verfahren | Einspruch gegen Wählerliste | § 4 WO | ungeprüft |
| Normales Verfahren | Einreichung Wahlvorschläge | § 6 WO | ungeprüft |
| Normales Verfahren | Nachfrist bei fehlendem Vorschlag | § 9 WO | ungeprüft |
| Normales Verfahren | Bekanntmachung der Vorschläge | § 10 WO | ungeprüft |
| Vereinfachtes Verfahren | Wahlausschreiben (einstufig) | § 36 WO | ungeprüft |
| Vereinfachtes Verfahren | Wahlausschreiben-Frist | § 30 i. V. m. § 36 WO | ungeprüft |
| Vereinfachtes Verfahren | Bekanntmachung vor Wahlversammlung | § 36 WO | ungeprüft |
| Vereinfachtes Verfahren | Wahl als Versammlungswahl | § 14a BetrVG (BR) / § 63 i. V. m. § 14a BetrVG (JAV) | ungeprüft |
| Vereinfachtes Verfahren | Nachträgliche schriftliche Stimmabgabe | § 35 WO | ungeprüft |
| Ergebnis | Konstituierende Sitzung (binnen 1 Woche) | § 29 BetrVG | ungeprüft |
| Ergebnis | Anfechtungsfrist (2 Wochen) | § 19 BetrVG (BR) / § 63 i. V. m. § 19 (JAV) | ungeprüft |

| Funktion | Rechtsgrundlage (vermutet) | Status |
|---|---|---|
| BR-Wahlberechtigung (ab 16) | § 7 BetrVG | ungeprüft |
| Zeitarbeit erst nach > 3 Monaten wahlberechtigt | § 7 BetrVG | ungeprüft |
| BR-Wählbarkeit (ab 18, 6 Monate Betriebszugehörigkeit) | § 8 BetrVG; Leiharbeitnehmer nicht wählbar: § 14 AÜG | ungeprüft |
| JAV-Wahlberechtigung (unter 18 / Azubi unter 25) | § 60 / § 61 BetrVG | ungeprüft |
| JAV-Wählbarkeit (unter 25) | § 61 BetrVG | ungeprüft |
| Gremiumsgröße BR nach Betriebsgröße | § 9 BetrVG | ungeprüft |
| Gremiumsgröße JAV nach Betriebsgröße | § 62 BetrVG | ungeprüft |
| Reduzierte Größe im vereinfachten Verfahren | § 14a BetrVG (BR) / § 63 BetrVG (JAV) | ungeprüft |
| Mindestsitze Minderheitengeschlecht | § 15 BetrVG i. V. m. § 5 WO (BR) / § 62 BetrVG (JAV) | ungeprüft |
| Losentscheid bei gleicher Höchstzahl | § 5 WO | ungeprüft |
| Keine Geburtsdaten im Aushang der Wählerliste | kein BetrVG-Bezug – DSGVO Art. 5 (Datenminimierung) | ungeprüft |
| „Dual Studierende als Azubis zählen“-Schalter | nicht abschließend geklärt – Auslegung von § 60/61 je Vertragsform strittig; der Schalter macht die Entscheidung nur bewusst | ungeprüft |
| Historie der Wahlen | – (reine Dokumentation) | ungeprüft |

## Kosten (§ 40 BetrVG)

| Funktion | Rechtsgrundlage (vermutet) | Status |
|---|---|---|
| Arbeitgeber trägt die Kosten der BR-Tätigkeit | § 40 BetrVG | ungeprüft |
| Sachmittel, Büropersonal, Räume | § 40 BetrVG | ungeprüft |
| Schulungskosten (automatisch aus der Schulungsverwaltung) | § 37 BetrVG | ungeprüft |
| Kosten für hinzugezogene Sachverständige | § 80 BetrVG | ungeprüft |
| Kosten der Einigungsstelle | § 76a BetrVG | ungeprüft |
| Rechtsanwaltskosten | kein eigener Unterpunkt – allgemeine Erforderlichkeit nach § 40 | ungeprüft |
| Reisekosten | kein eigener Unterpunkt – allgemeine Erforderlichkeit nach § 40 | ungeprüft |
| Verknüpfung eines Kostenpostens mit einem Beschluss | kein Paragraph – interne Dokumentation, § 40 verlangt keinen Beschluss pro Ausgabe | ungeprüft |
| Nur Vorsitz/Stellv. ändern Status (Lesen: alle Mitglieder) | kein Paragraph – interne Rollenverteilung, Sache der Geschäftsordnung | ungeprüft |
| CSV/PDF-Export mit Formel-Schutz | – (reine Exportfunktion) | ungeprüft |

## Geschäftsordnung (§ 36 BetrVG)

| Funktion | Rechtsgrundlage (vermutet) | Status |
|---|---|---|
| BR muss sich eine Geschäftsordnung geben (schriftlich) | § 36 BetrVG | ungeprüft |
| Beschluss braucht Mehrheit ALLER Mitglieder, nicht nur der Anwesenden | § 36 BetrVG – geprüft gegen die bei der Abstimmung eingefrorene Soll-Stärke, nur Warnung, kein Blocker | ungeprüft |
| „Aktuell gültig“ = neueste Fassung nach Datum | kein Paragraph – reine Darstellungslogik | ungeprüft |
| Nur Vorsitz/Stellv. pflegen das Register | kein Paragraph – interne Rollenzuweisung | ungeprüft |
| Verknüpfung mit einem hochgeladenen Dokument | kein Paragraph – Organisationshilfe | ungeprüft |
| Fassung ohne Systembeschluss (Datum von Hand) | kein Paragraph – Übergangslösung für Altbestand/Papierfassungen | ungeprüft |

## Betriebsvereinbarungs-Register (§ 77 BetrVG)

| Funktion | Rechtsgrundlage (vermutet) | Status |
|---|---|---|
| Schriftform + gemeinsamer Beschluss von Arbeitgeber und BR | § 77 BetrVG | ungeprüft |
| Bekanntmachungspflicht im Betrieb | § 77 BetrVG – außerhalb von BR-DMS über das Intranet gelöst | ungeprüft |
| Unmittelbare, zwingende Wirkung | § 77 BetrVG | ungeprüft |
| Kündigung mit 3 Monaten Frist (Status „gekündigt“) | § 77 BetrVG – Frist wird nicht automatisch berechnet/überwacht | ungeprüft |
| Nachwirkung bei erzwingbarer Mitbestimmung | § 77 BetrVG – bewusst nicht abgebildet (keine Unterscheidung § 87 / § 88) | ungeprüft |
| Sozialplan als besondere BV-Form | § 112 BetrVG (nur im Beschlussregister als Rechtsgrundlage wählbar) | ungeprüft |
| Warnung 90 Tage vor Laufzeitende (Dashboard) | kein Paragraph – reine Erinnerungsfunktion | ungeprüft |
| Status „abgelöst“ | kein Paragraph – organisatorische Nachverfolgung | ungeprüft |
| Verknüpfung mit einem hochgeladenen Dokument | kein Paragraph – Organisationshilfe | ungeprüft |

## Gremien & Fremdprotokolle

Die Rechtsgrundlage ist in BR-DMS ein Freitextfeld je Gremium – das System zitiert nichts fest.
Zur Orientierung, was typischerweise zutrifft:

| Gremium / Funktion | Rechtsgrundlage (vermutet) | Status |
|---|---|---|
| Betriebsausschuss | § 27 BetrVG (ab 9 Mitgliedern Pflicht) | ungeprüft |
| Weitere Ausschüsse des BR | § 28 BetrVG (Aufgabenübertragung) | ungeprüft |
| Wirtschaftsausschuss | §§ 106–110 BetrVG (i. d. R. > 100 ständig Beschäftigte) | ungeprüft |
| Jugend- und Auszubildendenvertretung (JAV) | §§ 60–73 BetrVG | ungeprüft |
| Schwerbehindertenvertretung (SBV) | §§ 177–179 SGB IX | ungeprüft |
| Gesamtbetriebsrat | §§ 47–53 BetrVG | ungeprüft |
| Konzernbetriebsrat | §§ 54–59 BetrVG | ungeprüft |
| Arbeitsschutzausschuss (ASA) | § 11 ASiG – kein BetrVG | ungeprüft |
| Freitext-Rechtsgrundlage je Gremium | kein fest hinterlegter Paragraph – vom BR selbst eingetragen, nicht validiert | ungeprüft |
| Vertraulichkeits-Flag bei Fremdprotokollen | § 79 BetrVG (gilt sinngemäß auch für den Wirtschaftsausschuss) | ungeprüft |
| Zugriff nur für Gremium-Mitglieder + Vorsitz/Stellv./Admin | kein Paragraph – technische Umsetzung | ungeprüft |
| BR selbst erscheint nicht als Gremium | kein Paragraph – reine Design-Entscheidung | ungeprüft |

## Schulungsverwaltung / BR-Schulungsmatrix

In erster Linie als BR-Schulungsmatrix gedacht; die Nutzung für die ganze Belegschaft ist ein optionaler
Nebeneffekt ohne eigene BetrVG-Pflicht.

| Funktion | Rechtsgrundlage (vermutet) | Status |
|---|---|---|
| BR-Mitglieder: Teilnahme an erforderlichen Schulungen | § 37 BetrVG | ungeprüft |
| BR-Mitglieder: weitere Schulungen (3 zusätzliche Wochen je Amtszeit) | § 37 BetrVG | ungeprüft |
| Allgemeine Qualifikationsmatrix der gesamten Belegschaft | kein eigener BetrVG-Anspruch – grundsätzlich Aufgabe des Arbeitgebers/HR | ungeprüft |
| BR-Mitbestimmung bei betrieblichen Berufsbildungsmaßnahmen | §§ 96–98 BetrVG – Matrix nur Informationsgrundlage | ungeprüft |
| Automatische Übernahme von BR-Schulungskosten in die Kostenübersicht | kein eigener Paragraph – inhaltlich über § 37 i. V. m. § 40 | ungeprüft |
| Qualifikationsmatrix wird live berechnet (kein gespeicherter Stand) | kein Paragraph – technische Entscheidung | ungeprüft |
| Lesen nur Mitglieder, Ändern nur Vorsitz/Stellv. | kein Paragraph – interne Rollenverteilung | ungeprüft |
