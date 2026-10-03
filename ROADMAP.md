# BR-DMS – Roadmap

Stand: 4. Oktober 2026. Hier steht, was als Nächstes kommt und was dabei schon entschieden ist –
damit an jedem Rechner nach `git pull` klar ist, wo es weitergeht.

## Erledigt

| Paket | Inhalt | Stand |
|---|---|---|
| Fristen ohne Dokument | Fristen mit Bezeichnung/Notiz ohne Dokument (Wahl, Betriebsversammlung, Erinnerung); Fristen erledigen und wieder öffnen; „Überfällig“ nach Datum; Fristnamen zentral | Okt. 2026 |
| Aufgaben + Vorhaben | „Zeiträume“ in die Aufgaben-Seite integriert: Ansichten Board, Liste (nach Vorhaben gruppiert), Zeitplan (Gantt); Begriff „Vorhaben“; `/zeitraeume` leitet um | Okt. 2026 |

## Als Nächstes

### 1 · Sitzungsarten + Betriebsversammlung (§§ 42–46 BetrVG)

Neue Sitzungsarten neben ordentlich/außerordentlich: **konstituierend** und **Betriebsversammlung**.
Der Ablauf (Tagesordnung → Protokoll → PDF) wird wiederverwendet; Unterschiede je Art:

| | BR-Sitzung (ordentl./außerordentl./konstituierend) | Betriebsversammlung |
|---|---|---|
| Anwesenheitsliste mit Ersatz-Nachrücken | ja | nein – stattdessen Teilnehmerzahl / Freitext |
| Beschlüsse mit Stimmen | ja | nein – Anträge an den BR (§ 45) → Themen-Backlog |
| Protokoll-PDF | „Protokoll“ | „Niederschrift“ |

Geplante Funktionen der Betriebsversammlung:
- Planung: Termin, Ort, Tagesordnung, Einladung/Aushang (Export wie Themensammlung)
- Tätigkeitsbericht des BR (§ 43 Abs. 1) und Bericht des Arbeitgebers (§ 43 Abs. 2) als feste TOPs
- Fragen aus der Belegschaft vorab sammeln (Anbindung Kummerkasten)
- Erinnerung, wenn im Kalendervierteljahr noch keine Versammlung stattgefunden hat (Frist ohne Dokument)

### 2 · BR- und JAV-Wahl

- Wahl anlegen: Art (BR/JAV), Verfahren (normal/vereinfacht), Wahltag, Ende der Amtszeit
- Fristen der Wahlordnung rückwärts vom Wahltag berechnen (Wahlvorstand, Wahlausschreiben,
  Einspruch Wählerliste, Wahlvorschläge, Bekanntmachung, konstituierende Sitzung) → als Fristen
  und als Vorhaben im Zeitplan. **Fristen vor dem Einsatz juristisch gegenlesen lassen.**
- Gremiumsgröße (§ 9) und Mindestsitze des Minderheitengeschlechts (§ 15) aus den Mitarbeiterdaten vorschlagen
- Wahlergebnis übernehmen: Gewählte als Benutzer mit Wahlrang und Geschlecht → speist die Nachrück-Logik
- Historie der Wahlen
- Regelwahlen: BR alle 4 Jahre 1.3.–31.5. (2026, 2030); JAV alle 2 Jahre 1.10.–30.11. (2026, 2028)
- Erfahrungen aus der laufenden JAV-Wahl 2026 (Wahlvorstand) vorher einsammeln

Offene Frage: Wählerliste aus den Mitarbeiterdaten erzeugen? Für die JAV wäre ein Geburtsdatum
nötig (neues, datenschutzrelevantes Feld) – alternativ Liste von Hand pflegen.

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
  „Bericht aus dem Arbeitsschutzausschuss“ in der Sitzungsvorlage.

## Bekannte Kleinigkeiten

- Protokoll-PDF: angenommene Beschlüsse werden rot statt grün dargestellt (`pdf.service.ts` prüft auf
  „BESCHLOSSEN“, gespeichert wird „ANGENOMMEN“).
- Proxy: HTTP-Port leitet auf `https://<host>/` ohne Port um (`proxy/nginx.conf`).

## Arbeitsweise

- Neue Funktionen zuerst in der Demo-Instanz prüfen (`./demo/demo.sh reset`), dann aufs NAS deployen.
- Handbuch nach Änderungen neu erzeugen: Demo starten, `node tools/handbuch-screenshots/screenshots.mjs`,
  `python3 generate_manual.py`, PDF auch nach `br-dms-website/assets/` kopieren.
