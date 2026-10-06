/**
 * Prüft beim Start die Pflichtwerte aus der .env und bricht mit einer
 * verständlichen Meldung ab, statt später an unerwarteter Stelle zu scheitern
 * (z. B. ein Platzhalter-ENCRYPTION_KEY erst beim ersten Dokument-Upload).
 */

const PLATZHALTER = /BITTE_AENDERN|CHANGE_?ME/i;

export function konfigPruefen(): void {
  const fehler: string[] = [];
  const env = process.env;

  if (!env.DATABASE_URL) {
    fehler.push("DATABASE_URL fehlt (POSTGRES_USER, POSTGRES_PASSWORD und POSTGRES_DB in der .env setzen)");
  }
  if (env.DATABASE_URL && PLATZHALTER.test(env.DATABASE_URL)) {
    fehler.push("POSTGRES_PASSWORD ist noch der Platzhalter aus .env.example");
  }

  const jwt = env.JWT_SECRET ?? "";
  if (!jwt) fehler.push("JWT_SECRET fehlt – erzeugen mit: openssl rand -hex 32");
  else if (PLATZHALTER.test(jwt)) fehler.push("JWT_SECRET ist noch der Platzhalter aus .env.example – erzeugen mit: openssl rand -hex 32");
  // Nur Warnung: bestehende Installationen mit kürzerem Secret sollen nach einem Update weiter starten
  else if (jwt.length < 32) console.warn("[Konfiguration] JWT_SECRET ist kürzer als 32 Zeichen – empfohlen: openssl rand -hex 32");

  const key = env.ENCRYPTION_KEY ?? "";
  if (!key) fehler.push("ENCRYPTION_KEY fehlt – erzeugen mit: openssl rand -hex 32");
  else if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    fehler.push("ENCRYPTION_KEY muss genau 64 Hex-Zeichen lang sein – erzeugen mit: openssl rand -hex 32 " +
                "(bei einem Umzug/Restore unbedingt den alten Schlüssel übernehmen)");
  }

  if (fehler.length > 0) {
    console.error("[Konfiguration] BR-DMS kann nicht starten – bitte die .env korrigieren:");
    for (const f of fehler) console.error(`[Konfiguration]   • ${f}`);
    console.error("[Konfiguration] Tipp: Der Installationsassistent (bash installation.sh) erzeugt alle Schlüssel automatisch.");
    process.exit(1);
  }
}
