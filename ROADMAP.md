# BR-DMS – Roadmap

Stand: 4. Oktober 2026. Hier steht, was als Nächstes kommt und was dabei schon entschieden ist –
damit an jedem Rechner nach `git pull` klar ist, wo es weitergeht.

## Erledigt

| Paket | Inhalt | Stand |
|---|---|---|
| Fristen ohne Dokument | Fristen mit Bezeichnung/Notiz ohne Dokument (Wahl, Betriebsversammlung, Erinnerung); Fristen erledigen und wieder öffnen; „Überfällig“ nach Datum; Fristnamen zentral | Okt. 2026 |
| Aufgaben + Vorhaben | „Zeiträume“ in die Aufgaben-Seite integriert: Ansichten Board, Liste (nach Vorhaben gruppiert), Zeitplan (Gantt); Begriff „Vorhaben“; `/zeitraeume` leitet um | Okt. 2026 |
| Sitzungsarten + Betriebsversammlung | Neue Arten „konstituierend“ (Standard-TOPs nach § 29) und „Betriebsversammlung“: Standard-TOPs nach § 43, Teilnehmerzahl statt Anwesenheitsliste, keine Beschlüsse, Anträge (§ 45) per Knopf ins Themen-Backlog, Fragen aus dem Kummerkasten in einen TOP übernehmen, PDF als „Einladung“ (Aushang) und „Niederschrift“; automatische Quartals-Frist (§ 43 Abs. 1), erledigt sich mit der ersten Versammlung im Quartal | Okt. 2026 |
| Wahlen (BR und JAV) | Seite „Wahlen“: Fristen für normales und vereinfachtes Verfahren, Wählerliste mit Gremiumsgröße und Mindestsitzen, PDF zum Aushang und CSV, Ergebnis übernehmen mit konstituierender Sitzung; Mitarbeiter mit Geburtsdatum und Geschlecht (Dialog und CSV-Import) | Okt. 2026 |
| Admin ohne Inhaltszugriff | Einstellung unter Benutzerverwaltung (nur Vorsitz/Stellvertretung): Admin auf die technische Verwaltung beschränken – Positivliste zentral im Backend, Navigation nur Einstellungen und Nachrichten; kein Passwort-Reset für andere, keine eigene Rollenänderung, neue Konten werden dem Vorsitz gemeldet; Rundnachrichten (Tagesordnung, „an alle“) gehen nicht mehr an ihn | Okt. 2026 |
| Sitzungsliste + TOPs ziehen | Sitzungsliste in „Kommende“ (nächste zuerst, heute zählt dazu) und „Vergangene“ gegliedert, Spalte „Dokumente“ (verknüpfte Dokumente über alle TOPs, für die JAV ohne vertrauliche TOPs); TOPs im Entwurf am Griff per Drag & Drop verschieben, Pfeile bleiben | Okt. 2026 |
| Dokumente: Kategorien + Herkunft | Kategorie-Leiste mit Zählern statt Dropdown; neue Kategorien Abmahnung (3 Jahre), Information des Arbeitgebers, Arbeits- und Gesundheitsschutz, Schriftverkehr (je 5 Jahre) samt Watch-Folder-Unterordnern; Kategorien/Aufbewahrung zentral in `backend/src/lib/kategorien.ts`; „Behandelt in Sitzung/TOP“ in Liste und Vorschau; Löschdatum je Dokument mit Vorschlag nach Kategorie-Regel, nur in der Zukunft | Okt. 2026 |
| Kleinigkeiten | Protokoll-PDF zeigt angenommene Beschlüsse grün; HTTP-Weiterleitung behält den HTTPS-Port; Ort an den Unterschriften als Einstellung statt fest im Code; Fristen im Fristenkalender bearbeiten (Bezeichnung, Datum, Notiz) | Okt. 2026 |

## Als Nächstes

Ideen aus der BRbase-Demo (Bund-Verlag, 05.10.2026). BRbase läuft als Cloud-Dienst beim Anbieter,
BR-DMS ist der Gegenansatz (eigener Server) – einzelne Ideen übernehmen wir trotzdem.
Pakete 1–3 erledigt; als Nächstes 4 als Block, dann 5.

| # | Paket | Größe | Inhalt |
|---|---|---|---|
| 1 | ~~Sitzungsliste: kommend / vergangen~~ | S | erledigt, siehe oben |
| 2 | ~~TOPs per Drag & Drop~~ | S | erledigt, siehe oben |
| 3 | ~~Dokumente: Kategorien sichtbar + Herkunft~~ | S–M | erledigt, siehe oben |
| 4 | Einladung, Ladung und Sitzungspaket | L | siehe unten |
| 5 | Gremien und Fremdprotokolle | M–L | siehe unten |

**Paket 4 – Einladung, Ladung und Sitzungspaket**
- *Ladung vorab:* Verhinderung eines Mitglieds schon vor der Sitzung erfassen → Ersatzmitglied laden
  (bestehender Nachrück-Vorschlag). Steht dann auf Einladung und Unterschriftenliste als „Ersatz für X“
  und wird in die Anwesenheit übernommen. Heute erscheint „(Vtg. f. X)“ erst, wenn die Anwesenheit erfasst ist.
- *Zweite E-Mail-Adresse je Benutzer* (z. B. `br-tvanderhoven@…`, `jav-jklaus@…`); Login bleibt die Hauptadresse.
- *Einladung per E-Mail* an alle Geladenen, mit Tagesordnung als PDF, von einer einstellbaren Absenderadresse.
- *Versand dokumentieren:* wer wann an welche Adresse eingeladen wurde – nachweisbar (§ 29 Abs. 2 BetrVG).
- *Sitzungspaket:* Einladung, Tagesordnung, Protokoll und Unterschriftenliste gesammelt zur Sitzung
  (Download als ZIP oder ein PDF).
- *Sitzung abschließen:* letzter Schritt wird aktiv abgehakt (Checkliste: Protokoll final, Unterschriftenliste
  unterschrieben hochgeladen, Beschlüsse erfasst …) → neuer Status „Abgeschlossen“.

**Paket 5 – Gremien und Fremdprotokolle**
- Sitzungen einem Gremium zuordnen und danach gliedern: BR, Ausschüsse (§ 28), JAV, SBV …
- *Fremdprotokoll:* Protokoll eines Gremiums, das der BR nicht selbst führt (ASA, Wirtschaftsausschuss,
  GBR …), als einzelnes Dokument mit Gremium und Datum ablegen – ohne TOPs/Anwesenheit.
- Überschneidet sich mit „Ausschüsse“, „Schwerbehindertenvertretung“ und „Wirtschaftsausschuss“ unter „Später“.

**Entschieden (05.10.2026):**
- Kategorien: vorerst fest (erweitert). Zusätzlich die Aufbewahrungsfrist *pro Dokument* nachträglich
  ändern können (z. B. wenn beim Hochladen die falsche Kategorie/Frist gewählt wurde).
- Anmeldung mit der Hauptadresse, Einladungen an die zweite Adresse (falls vorhanden). Dafür ein
  Kontaktdatensatz je Benutzer, der später auch Personen anderer Gremien, Protokollführung oder
  Assistenz aufnehmen kann.
- Die unterschriebene Unterschriftenliste wird als Scan hochgeladen und gehört zum Sitzungspaket –
  alles unter einem Dach, nichts mehr abheften.
- Gremien: oberste Gliederung nach Gremium, darunter die Protokolle. Je Gremium frei, ob die Sitzung
  im System geführt oder ein Fremdprotokoll abgelegt wird – auch gemischt (ASA mal selbst, mal von
  anderen). Hauptsache dokumentiert.

**Noch offen:** Sitzungspaket als ZIP oder als ein zusammengefügtes PDF?

Weiter offen beim Wahl-Modul: Fristen und Paragrafen juristisch gegenlesen lassen; klären, ob dual
Studierende bei der JAV als Auszubildende zählen.

## Wahl-Modul (BR und JAV) – Entscheidungen

Werkzeug des **Betriebsrats**, nicht des Wahlvorstands: Wahlvorstand bestellen, Fristen überwachen,
Wählerliste vorbereiten, Ergebnis übernehmen. Im Wahlvorstand sitzt jeweils ein BR-Mitglied – der
Wahlvorstand braucht keinen eigenen Zugang. Wahlvorschläge und Stimmauszählung bleiben beim Wahlvorstand.
**Alle Fristen und Paragrafen vor dem Einsatz juristisch gegenlesen lassen.**

**Stufe 1 – Wahl anlegen, Fristen überwachen** ✓ (Okt. 2026: Seite „Wahlen“, Fristen in `backend/src/lib/wahlFristen.ts` mit Rechtsgrundlage und Kennzeichnung „Empfehlung“; Handbuch-Kapitel steht noch aus)
- Wahl anlegen: Art (BR/JAV), Verfahren (normal/vereinfacht), erster Tag der Stimmabgabe, Ende der Amtszeit
- Fristen rückwärts berechnen → Fristen ohne Dokument + Vorhaben im Zeitplan, z. B. (normales Verfahren):
  Wahlvorstand bestellen (BR: 10 Wochen vor Amtszeitende, § 16; JAV: 8 Wochen, § 63 Abs. 2),
  Wahlausschreiben (6 Wochen vor Stimmabgabe, § 3 WO), Einspruch Wählerliste und Wahlvorschläge
  (2 Wochen nach Ausschreiben, §§ 4, 6 WO), Bekanntmachung der Vorschläge (1 Woche vor Stimmabgabe, § 10 WO),
  konstituierende Sitzung (1 Woche nach der Wahl, § 29), Ende der Anfechtungsfrist (2 Wochen, § 19)
- Vereinfachtes Verfahren (§ 14a, für die JAV § 63 Abs. 4) mit eigenen, kürzeren Fristen – **für uns
  der Regelfall bei der JAV** (18 Azubis)
- Die laufende JAV-Wahl 2026 lässt sich dann sofort eintragen

**Stufe 2 – Wählerliste und Gremiumsgröße** ✓ (Okt. 2026: Bereich auf der Seite „Wahlen“, Berechnung in `backend/src/lib/waehlerliste.ts`; PDF zum Aushang ohne Geburtsdaten, CSV für den Wahlvorstand, Ausschluss von Hand je Wahl)
- Wählerliste aus den Mitarbeiterdaten zum Stichtag: BR ab 16 (§ 7), JAV unter 18 bzw. Azubis unter 25
  (§§ 60, 61); Zeitarbeit markieren (wahlberechtigt erst nach > 3 Monaten Einsatz)
- Getrennt nach Geschlechtern (§ 2 WO), Abdruck zum Aushang ohne Geburtsdaten
- Schalter je Wahl: **dual Studierende als Auszubildende zählen** (Standard: aus). Entscheidet bei uns
  über 1 oder 3 JAV-Sitze (18 Azubis + 3 dual Studierende, Grenze 20/21 nach § 62) – ob sie mitzählen,
  hängt vom Vertrag ab (ausbildungsintegriert eher ja, praxisintegriert umstritten) → vorher klären
- Gremiumsgröße (§ 9 bzw. § 62) und Mindestsitze des Minderheitengeschlechts (§ 15, d'Hondt nach § 5 WO) vorschlagen

**Stufe 3 – Ergebnis übernehmen** ✓ (Okt. 2026: Dialog mit Vorschau, `backend/src/lib/wahlErgebnis.ts`; nicht Wiedergewählte optional deaktivieren, Quote in die Einstellungen, konstituierende Sitzung anlegen)
- Gewählte als Benutzer mit Wahlrang und Geschlecht → speist die Nachrück-Logik
- Konstituierende Sitzung gleich mit anlegen (Standard-Tagesordnung gibt es schon)
- Historie der Wahlen

Regelwahlen: BR alle 4 Jahre 1.3.–31.5. (2026, 2030); JAV alle 2 Jahre 1.10.–30.11. (2026, 2028).

**Schon erledigt (Okt. 2026):** Mitarbeiter haben Geburtsdatum und Geschlecht, beides im Bearbeiten-Dialog
und im CSV-Import (Spalten „Geburtsdatum“, „Geschlecht“ oder „Anrede“). Vor jeder Wahl liefert die
Personalabteilung aktuelle Listen; der Import gleicht über die PNR ab und korrigiert abweichende Werte.

## Später (unpriorisiert)

- Geschäftsordnung (§ 36 BetrVG), verknüpft mit einer Prüfung der Beschlussfähigkeit (§ 33)
- Ausschüsse des BR (§ 28) mit eigener Mitgliederliste und Sitzungen
- Dashboard-Bündelung: nächste Sitzung, auslaufende BVs, Schulungsablauf, Quoten-Status an einer Stelle
- Schwerbehindertenvertretung als Rolle analog JAV (§ 178 SGB IX) und SGB IX §§ 164–178 als Gesetzestexte
- Wirtschaftsausschuss (§§ 106–110)
- Einigungsstelle: eskalierte Fälle (Antrag, Spruch, Kosten)
- Weitere Gesetzestexte
- Freistellung/Lohnausgleich (§ 37) – niedrige Priorität

## Bewusst nicht geplant

- **Arbeitsschutzausschuss als eigener Bereich:** wird vom Arbeitgeber/HR geleitet; die Infos kommen
  über das ASA-Mitglied als Bericht in die BR-Sitzung. Abbildung über einen Standard-TOP
  „Bericht aus dem Arbeitsschutzausschuss“ in der Sitzungsvorlage (in der Demo-Vorlage „Ordentliche
  Sitzung“ als Beispiel enthalten).

## Bekannte Kleinigkeiten

- Betriebsversammlung: Fragen aus dem Kummerkasten werden nur im Entwurf übernommen (danach ist der TOP-Inhalt fixiert).

## Arbeitsweise

- Versionsnummer (`frontend/package.json`, `backend/package.json`; Über-Ansicht und Handbuch lesen sie
  von dort) wird hochgezählt, wenn ein Stand aufs NAS geht, nicht pro Commit – dazu ein Tag `vX.Y.Z`.
  Hintere Zahl: nur Fehlerbehebungen; mittlere: neue Funktionen; vordere: großer Umbruch
  (z. B. Update passt nicht mehr ohne Weiteres auf alte Daten).
- Neue Funktionen zuerst in der Demo-Instanz prüfen (`./demo/demo.sh reset`), dann aufs NAS deployen.
- Handbuch nach Änderungen neu erzeugen: Demo starten, `node tools/handbuch-screenshots/screenshots.mjs`,
  `python3 generate_manual.py`, PDF auch nach `br-dms-website/assets/` kopieren.
