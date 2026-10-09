# BR-DMS – Roadmap

Stand: 9. Oktober 2026. Hier steht, was als Nächstes kommt und was dabei schon entschieden ist –
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
| Einladung, Ladung und Sitzungspaket (Paket 4) | Ladung vorab, Zweitadresse für Einladungen, Einladung per E-Mail mit Versandnachweis; Unterschriftenseite (Version + Prüfsumme) statt Komplettausdruck, Scan-Upload direkt oder per Watch-Folder-Zuordnung (`protokoll_scan` → Eingang); Sitzungspaket als ZIP, „Sitzung abschließen“ mit Checkliste → Status „Abgeschlossen“ | Okt. 2026 |
| Geschäftsordnung + SBV-Rolle | Register der Geschäftsordnung (§ 36) unter „Dokumente & Wissen“, neueste Fassung „Aktuell gültig“, nur Vorsitz/Stellvertretung pflegen (ohne Prüfung nach § 33); Rolle SBV (§ 178 SGB IX) verhält sich wie JAV; Demodaten für beides | Okt. 2026 |
| Vertraulichkeit einheitlich | Eine Regel in `backend/src/lib/vertraulich.ts`: Vorsitz, Stellvertretung und Admin sehen alles Vertrauliche, andere nur eigene Uploads bzw. Fremdprotokolle ihres Gremiums; Stellvertretung dem Vorsitz gleichgestellt (Kommentare löschen, Audit-Log im Menü) | Okt. 2026 |
| Dashboard „Auf einen Blick“ | Vier Karten oben auf dem Dashboard: nächste Sitzung, BVs die in 90 Tagen auslaufen oder gekündigt sind, ablaufende Qualifikationen + nächster Schulungstermin, Geschlechterquote (§ 15 Abs. 2); Module/Rechte blenden Karten einzeln aus | Okt. 2026 |
| Kopfbalken + Fremdprotokolle öffnen | Suche über die volle Breite, Einstellungen/Abmelden am rechten Rand, Suchfeld abgesetzt; Fremdprotokolle per Doppelklick öffnen; Fristen-Erinnerungsmail pausierbar | Okt. 2026 |
| Gremien und Fremdprotokolle (Paket 5) | Neue Seite „Gremien“ für Ausschüsse/JAV/SBV/GBR/Wirtschaftsausschuss (nicht den BR selbst); Sitzungen optional einem Gremium zuordnen; Fremdprotokolle (hochgeladenes Protokoll mit Gremium+Datum, ohne TOPs/Anwesenheit, mit vertraulich-Flag); neues togglebares Modul „Gremien“ | Okt. 2026 |
| Dokumente: Ordnerbaum (Ablage) | Ordner und Unterordner zusätzlich zu den Kategorien (Kategorie = was es ist und welche Fristen/Aufbewahrung gelten, Ordner = wo es liegt); Baum links neben der Liste mit „Alle Dokumente“ und „Ohne Ordner“, Pfadleiste, Unterordner als Zeilen, Dokumente per Drag & Drop einsortieren, Ordner im Baum verschieben, nur leere Ordner löschen; Ordnerwahl beim Hochladen (vorbelegt) und Bearbeiten; auf dem Handy Auswahlliste; Tabelle `ordner`, Routen `backend/src/routes/ordner.ts`; keine Rechte je Ordner (Vertraulichkeit bleibt am Dokument) | Okt. 2026 |
| E-Mails als Dokumente | `.eml` (Thunderbird, Webmailer) und `.msg` (Outlook) hochladen – per Klick oder Hineinziehen – und im Watch-Folder annehmen; Titel leer = Betreff; Von/An/Cc/Datum/Betreff und Anhangliste am Dokument (`email_kopf`), Kopf, Text und Anhangnamen in der Volltextsuche; Vorschau formatiert oder „Nur Text“ in abgeschottetem iframe (keine Skripte, keine externen Inhalte – kein Tracking); Anhänge herunterladen oder als eigenes Dokument ablegen (beim Hochladen alle auf einmal), abgelegte Anhänge erben Kategorie/Ordner/Vertraulichkeit, zeigen „Anhang aus …“, keine eigenen Fristen, nicht einzeln im Eingang; Parser in `backend/src/lib/email.ts` (mailparser, @kenjiuno/msgreader) | Okt. 2026 |
| Sicherheit: Rechte, Laufzeit, Header, Überwachung | Vertraulichkeit an allen Dokument-Routen geprüft; gespeichertes XSS über TOP-Text behoben; Mitarbeiterdaten lesen/anlegen nur Mitglieder + aktiv vertretende Ersatzmitglieder, ändern/Import/Standort/löschen nur Vorsitz/Stellvertretung (Gehaltstabellen-Schalter ausgenommen), Wählerliste nur Mitglieder; echte Client-IP im Audit-Log und beim Login-Limit (`PROXY_STATIONEN`); Rate-Limit für Passwort vergessen/zurücksetzen; Node 24, nginx 1.30, Fastify 5 u. a. (`npm audit` Backend 0); Proxy mit CSP, X-Frame-Options, nosniff, HSTS, Referrer-/Permissions-Policy; Update-Skripte mit `npm audit` und frischen Basis-Images; Dependabot und CodeQL auf GitHub | Okt. 2026 |
| Backup-Wochenübersicht | Einstellungen → System zeigt jetzt die letzten 8 Backups einzeln (Zeitpunkt, Größe, Status) statt nur das jüngste; wöchentliche Mail montags 07:00 Uhr nur an Vorsitz mit derselben Liste, warnt wenn das jüngste Backup älter als 2 Tage, unvollständig oder unverschlüsselt ist (`backend/src/lib/backups.ts`, `workers/backup.worker.ts`) | Okt. 2026 |

## Als Nächstes

**Entschieden (07.10.2026), in dieser Reihenfolge:**

| # | Paket | Größe | Inhalt |
|---|---|---|---|
| ✓ | Backup verschlüsseln | S | erledigt 07.10.2026: `BACKUP_KEY` in der `.env`, backup.sh verschlüsselt DB-Dump und Storage-Archiv (AES-256/PBKDF2, `.enc`), restore.sh prüft den Schlüssel vorab; Einstellungen → System warnt bei unverschlüsselten Backups; Assistent erzeugt den Schlüssel. Damit kann eine Kopie bei der IT liegen. Restore-Test mit `.enc` auf ein zweites System am 09.10.2026 erfolgreich. Offen beim Nutzer: QNAP-Snapshots einrichten, Schlüssel ausdrucken |
| A | Tests für Rechte und Rollen | M | Automatische Tests (Backend), die je Rolle prüfen, was sichtbar und erlaubt ist – vertrauliche Dokumente/Fremdprotokolle, JAV/SBV-Sperre, Admin ohne Inhaltszugriff, Stellvertretung = Vorsitz. Laufen vor jedem Deploy. Anlass: Stellvertretung bekam beim Öffnen vertraulicher Dokumente 403, obwohl Liste und Handbuch es erlaubten |
| B | Zwei-Faktor-Anmeldung (2FA) | M | Einmalcode per Authenticator-App (TOTP), einrichten mit QR-Code, Wiederherstellungscodes; Pflicht je Rolle einstellbar (mindestens für Vorsitz/Stellvertretung/Admin); Zurücksetzen durch Vorsitz/Admin mit Audit-Eintrag. Voraussetzung für die Sicherheits-Präsentation bei der IT |
| ✓ | Anhörung als Vorgang (§ 99 / § 102) | L | erledigt 08.10.2026: Status eingegangen → beraten → beschlossen → beantwortet im Dokument unter „Vorgang"; Stellungnahme aus einem finalisierten Beschluss am TOP erzeugen (Zustimmung, Zustimmungsverweigerung mit Gründen nach § 99 Abs. 2, Widerspruch nach § 102 Abs. 3), Brief-PDF mit echtem Briefkopf wird archiviert, Versanddatum als Nachweis, zugehörige Fristen erledigen sich automatisch mit dem Versand. Ersetzt die alte Platzhalter-Briefvorlage |
| D | Kostenübersicht (§ 40) | M | Jahresübersicht der BR-Kosten: Schulungen (Kosten gibt es schon), Sachverständige, Anwalt, Einigungsstelle; verbindet sich mit „Einigungsstelle“ unter „Später“ |
| E | Kalender-Abo + mobile Ansicht | S–M | Sitzungen und Fristen als abonnierbarer Kalender (iCal-Link mit persönlichem Token, nur eigene sichtbare Termine) für Outlook/Handy; mobile Ansicht durchgehen |

**Dokumentablage ausbauen (entschieden 09.10.2026), in dieser Reihenfolge:**

| # | Paket | Größe | Inhalt |
|---|---|---|---|
| ✓ | Ordnerbaum | M | erledigt 09.10.2026, siehe oben |
| ✓ | E-Mails als Dokumente | M | erledigt 09.10.2026, siehe oben. Offen: mit einer echten Outlook-`.msg` testen (es lag keine Beispieldatei vor) |
| G | Kategorie „Muster/Vorlage“ (optional) | S | nur falls Muster (z. B. Arbeitsverträge) eine eigene Aufbewahrungsregel brauchen, etwa „nie löschen“ |

Offen aus dem Sicherheits-Update vom 09.10.2026 (Backend: `npm audit` 0 Lücken nach Fastify 5, @fastify/jwt 10, nodemailer 10, adm-zip 0.6, node-cron 4):
Frontend braucht noch zwei größere Sprünge – React Router 7 (Open-Redirect über `<Link>`/`navigate`, mittel) und Tiptap 3 (`mergeAttributes`, mittel).

Bewusst später: E-Mails per IMAP selbst aus einem Postfach abholen – dafür müsste ein weiteres Passwort auf dem NAS liegen.

Bewusst nicht: Fachkommentare/Fachzeitschriften (Lizenzthema der Verlage – Gesetzestexte + Wissensarchiv
reichen) und Beschlüsse im Umlaufverfahren (BR-Beschlüsse brauchen eine Sitzung, auch per Video nach § 30 Abs. 2).

Ideen aus der BRbase-Demo (Bund-Verlag, 05.10.2026). BRbase läuft als Cloud-Dienst beim Anbieter,
BR-DMS ist der Gegenansatz (eigener Server) – einzelne Ideen übernehmen wir trotzdem.
Pakete 1–5 erledigt.

| # | Paket | Größe | Inhalt |
|---|---|---|---|
| 1 | ~~Sitzungsliste: kommend / vergangen~~ | S | erledigt, siehe oben |
| 2 | ~~TOPs per Drag & Drop~~ | S | erledigt, siehe oben |
| 3 | ~~Dokumente: Kategorien sichtbar + Herkunft~~ | S–M | erledigt, siehe oben |
| 4 | ~~Einladung, Ladung und Sitzungspaket~~ | L | erledigt, siehe oben |
| 5 | ~~Gremien und Fremdprotokolle~~ | M–L | erledigt, siehe unten |

**Paket 4 – Einladung, Ladung und Sitzungspaket** (erledigt, in Stufen)

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Ladung vorab: Anwesenheit heißt vor der Sitzung „Ladung & Verhinderung“ (Kommt / Verhindert / Als Ersatz geladen); Anwesenheitsliste-PDF gegliedert (Mitglieder · geladene Ersatzmitglieder „für X“ · JAV · weitere Ersatzmitglieder) | erledigt |
| 2 | Zweitadresse für Einladungen je Benutzer, Absenderadresse als Einstellung | erledigt |
| 3 | Einladung per E-Mail mit Tagesordnung als PDF, Versandnachweis je Empfänger (Tabelle `einladung_versand`); neue Sitzungen laden nur noch ordentliche Mitglieder + JAV vor | erledigt (API getestet, Oberfläche noch vom Nutzer zu prüfen) |
| 4 | Unterschriftenseite des Protokolls (Version + Prüfsumme) und zwei Upload-Plätze für Scans (Anwesenheitsliste, Protokoll-Unterschriften; eine kombinierte Datei darf beide füllen); Scans auch per Watch-Folder-Unterordner `protokoll_scan` → Zuordnung im Eingang (`ScanEingang`) | erledigt (noch nicht in der Demo getestet – kein Docker/Node auf diesem Rechner verfügbar) |
| 5 | Sitzungspaket als ZIP (Tagesordnung/Einladung-PDF, Versandnachweis-CSV, Protokoll/Niederschrift-PDF, Scans) und „Sitzung abschließen“ mit Checkliste → neuer Status „Abgeschlossen“ | erledigt (noch nicht in der Demo getestet) |

Entschieden (06.10.2026): Sitzungspaket als **ZIP**, nicht als zusammengefügtes PDF – braucht keine
neue Abhängigkeit (`adm-zip` war schon im Projekt) und jede Datei (insbesondere Scans als Nachweis)
bleibt im Original statt in ein Sammel-PDF konvertiert zu werden. Checkliste für „Sitzung abschließen“
bewusst schlank gehalten: nur Protokoll final (ohnehin Voraussetzung) + beide Scans, nicht „alle
Beschlüsse finalisiert“.

- *Ladung vorab:* Verhinderung eines Mitglieds schon vor der Sitzung erfassen → Ersatzmitglied laden
  (bestehender Nachrück-Vorschlag). Steht dann auf Einladung und Unterschriftenliste als „Ersatz für X“
  und wird in die Anwesenheit übernommen. Heute erscheint „(Vtg. f. X)“ erst, wenn die Anwesenheit erfasst ist.
- *Zweite E-Mail-Adresse je Benutzer* (z. B. `br-tvanderhoven@…`, `jav-jklaus@…`); Login bleibt die Hauptadresse.
- *Einladung per E-Mail* an alle Geladenen, mit Tagesordnung als PDF, von einer einstellbaren Absenderadresse.
- *Versand dokumentieren:* wer wann an welche Adresse eingeladen wurde – nachweisbar (§ 29 Abs. 2 BetrVG).
- *Sitzungspaket:* Tagesordnung/Einladung, Versandnachweis, Protokoll/Niederschrift und Scans gesammelt
  zur Sitzung, Download als ein ZIP; fehlende Teile werden ausgelassen statt den Download abzubrechen.
- *Sitzung abschließen:* letzter Schritt wird aktiv abgehakt (Checkliste: Protokoll final, beide Scans
  hochgeladen) → neuer Status „Abgeschlossen“, danach ist nichts mehr änderbar (Downloads bleiben möglich).

**Paket 5 – Gremien und Fremdprotokolle** (erledigt, noch nicht in der Demo getestet)
- Neue Seite „Gremien” verwaltet die anderen Gremien (Ausschüsse § 28, JAV, SBV, Gesamtbetriebsrat,
  Wirtschaftsausschuss, ASA, …) – der Betriebsrat selbst bleibt bewusst exklusiv auf der bestehenden
  Sitzungen-Seite, taucht dort nicht als Gremium auf.
- Sitzungen können beim Anlegen/Bearbeiten optional einem Gremium zugeordnet werden (`Sitzung.gremiumId`,
  leer = Betriebsrat) – falls ein Ausschuss seine Sitzungen doch voll im System führen will.
- *Fremdprotokoll:* Protokoll eines Gremiums, das der BR nicht selbst führt (ASA, Wirtschaftsausschuss,
  GBR …), als einzelnes hochgeladenes Dokument mit Gremium und Datum abgelegt – ohne TOPs/Anwesenheit,
  eigenes Modell `Fremdprotokoll` mit AES-256-GCM-Verschlüsselung wie bei Dokumenten/Scans. Eigenes
  `vertraulich`-Flag (z.B. für Wirtschaftsausschuss-Protokolle), beschränkt Ansicht/Download auf Vorsitz,
  Stellvertretung, Admin und die Mitglieder des Gremiums (seit 07.10.2026).
- Je Gremium zeigt die Detailansicht eine chronologische, gemischte Liste aus eigenen Sitzungen und
  Fremdprotokollen.
- Neues togglebares Modul „Gremien” (Einstellungen → Module).
- Überschneidet sich mit „Ausschüsse”, „Schwerbehindertenvertretung” und „Wirtschaftsausschuss” unter „Später” –
  mit dem Gremien-Register sind diese jetzt zumindest dokumentierbar, auch ohne eigene Fachlogik.

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

Weiter offen beim Wahl-Modul: Fristen und Paragrafen juristisch gegenlesen lassen; klären, ob dual
Studierende bei der JAV als Auszubildende zählen.

## Wahl-Modul (BR und JAV) – Entscheidungen

Werkzeug des **Betriebsrats**, nicht des Wahlvorstands: Wahlvorstand bestellen, Fristen überwachen,
Wählerliste vorbereiten, Ergebnis übernehmen. Im Wahlvorstand sitzt jeweils ein BR-Mitglied – der
Wahlvorstand braucht keinen eigenen Zugang. Wahlvorschläge und Stimmauszählung bleiben beim Wahlvorstand.
**Alle Fristen und Paragrafen vor dem Einsatz juristisch gegenlesen lassen.**

**Stufe 1 – Wahl anlegen, Fristen überwachen** ✓ (Okt. 2026: Seite „Wahlen“, Fristen in `backend/src/lib/wahlFristen.ts` mit Rechtsgrundlage und Kennzeichnung „Empfehlung“; Handbuch-Kapitel 5.5 vorhanden)
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

- Prüfung der Beschlussfähigkeit (§ 33), verknüpft mit der Geschäftsordnung (das Register selbst ist erledigt)
- Ausschüsse des BR (§ 28) mit eigener Mitgliederliste und Sitzungen
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
- Handbuch nach Änderungen neu erzeugen: Demo starten, `npx -y node@22 tools/handbuch-screenshots/screenshots.mjs`
  (braucht Node ≥ 22; findet google-chrome oder chromium selbst),
  `python3 generate_manual.py`, PDF auch nach `br-dms-website/assets/` kopieren. Ebenso
  `python3 generate_backup_anleitung.py` (Sicherung und Wiederherstellung) → `br-dms-website/assets/`.
