# Online-Demo (ohne echtes Backend)

Phase 1: eine statische Demo-Version des Frontends mit erfundenen Beispieldaten
statt eines echten Servers. Läuft komplett im Browser, passt auf ein normales
Webhosting-Paket (z. B. IONOS Webhosting Pro) ohne Node/Docker/Postgres.

## Was funktioniert, was nicht

**Enthalten** (mit Beispieldaten aus `src/demo/fixtures.ts`, Änderungen bleiben
nur bis zum nächsten Seiten-Reload erhalten):
Dashboard, Sitzungen (drei Beispielsitzungen: Entwurf, fixierte Tagesordnung,
finales Protokoll mit Anwesenheit und Beschlüssen; PDFs und Einladungsversand
zeigen nur einen Hinweis), Personal (36 erfundene Beschäftigte in `src/demo/personal.ts`:
Eingruppierung mit Historie, AT-Gehälter, Zeitmodelle, Überstunden, Schulungen und
Qualifikationsmatrix; Import aus Dateien zeigt nur einen Hinweis), Aufgaben, Themenakten (Themen-Backlog mit Verlauf), Aktivitäts-Feed im Dashboard, Fristenkalender, Beschlussregister,
Wissensarchiv, Ressourcen, Vorlagen, Betriebsvereinbarungen, Geschäftsordnung,
Themensammlung, Nachrichten (Postfach), Schnellsuche im Kopfbalken, der
öffentliche Kummerkasten.

**Absichtlich deaktiviert** (Seite nicht aufrufbar, Link/Navigation ausgeblendet,
Direktaufruf der URL landet auf dem Dashboard – siehe `DEMO_GESPERRTE_PFADE` in
`src/components/Layout.tsx`): Eingang, Dokumente, Benutzerverwaltung,
Kosten, Wahlen, Audit-Log, Einstellungen, Mein Konto, die große Suchseite.
Das sind die Seiten mit echtem Datei-Upload, PDF-Erzeugung, E-Mail-Versand
oder 2FA – zu riskant, um sie ohne echten Server
überzeugend nachzubauen. Kandidat für Phase 2.

Login akzeptiert in der Demo jede Eingabe (siehe `DEMO_MODE`-Hinweis auf der
Login-Seite).

## Lokal testen

```bash
npm install
npm run dev:demo
```

Startet Vite im Modus `demo` (lädt `.env.demo`, setzt `VITE_DEMO_MODE=true`).
Einfach auf "Anmelden" klicken (Feld ist vorausgefüllt) und durchklicken.

## Für die Subdomain bauen

```bash
npm run build:demo
```

Erzeugt `frontend/dist-demo/`. Der gesamte Inhalt dieses Ordners (inklusive der
unsichtbaren Datei `.htaccess`) kommt per FTP/SFTP in das Webroot der Subdomain
(z. B. `demo.xy.de`) im IONOS-Webhosting-Paket. Die `.htaccess` sorgt dafür,
dass Unterseiten wie `/dashboard` bei einem Reload nicht mit 404 abbrechen
(React Router läuft im Browser, der Server kennt diese Pfade nicht).

Kein PHP, keine Datenbank, kein Node auf dem Server nötig – nur statische
Dateien.

## Funktionsweise

`src/demo/index.ts` ersetzt beim Start `window.fetch` für alle Aufrufe an
`/api/...` durch ein kleines In-Memory-Mini-Backend (`src/demo/mockBackend.ts`),
das die Beispieldaten aus `src/demo/fixtures.ts` ausliefert und einfache
Anlegen/Ändern/Löschen-Aktionen im Speicher nachbildet. Kein echter Server,
keine Persistenz, keine echten Zugangsdaten nötig.
