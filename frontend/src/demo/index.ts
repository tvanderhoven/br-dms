/**
 * Schaltet den Demo-Modus ein: ersetzt window.fetch für alle /api/...-Aufrufe
 * durch das Mini-Backend aus mockBackend.ts. Wird nur aufgerufen, wenn
 * VITE_DEMO_MODE=true gesetzt ist (siehe .env.demo und main.tsx).
 */
import { handleDemoRequest } from "./mockBackend";

const KUNSTLICHE_LATENZ_MS = 200;

export function installDemoMode(): void {
  const echterFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlText = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlText, window.location.origin);

    if (!url.pathname.startsWith("/api/")) {
      return echterFetch(input, init);
    }

    const method = (init && init.method ? init.method : "GET").toUpperCase();
    // Uploads (FormData) als einfaches Objekt weiterreichen – Dateien nur mit ihrem Namen
    const bodyText = init && typeof init.body === "string" ? init.body
      : init?.body instanceof FormData
        ? JSON.stringify(Object.fromEntries([...init.body.entries()].map(([k, v]) => [typeof v === "string" ? k : "dateiname", typeof v === "string" ? v : v.name])))
        : undefined;

    await new Promise(resolve => setTimeout(resolve, KUNSTLICHE_LATENZ_MS + Math.random() * 150));
    return handleDemoRequest(method, url.pathname, url.searchParams, bodyText);
  };

  // eslint-disable-next-line no-console
  console.info("[BR-DMS Demo] Mock-Backend aktiv – alle Daten sind frei erfunden, nichts wird dauerhaft gespeichert.");
}
