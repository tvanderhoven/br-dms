// Ein Dokument in einem neuen Tab öffnen – E-Mails in der Mail-Ansicht (/email/:id),
// PDFs direkt im Browser, alles andere als Download. Muss direkt im Klick aufgerufen
// werden: Der Tab wird synchron geöffnet, sonst greift der Popup-Blocker. Die Datei
// wird mit dem Token geladen und als Blob gezeigt, weil ein einfacher Link den
// Auth-Header nicht mitschicken würde.
import { api, istEmail } from "./api";

export function emailFensterUrl(id: string): string {
  return `${window.location.origin}/email/${id}`;
}

// Dokument-IDs sind UUIDs. Die ID kann aus Inhalten stammen, die Benutzer schreiben
// (Verweise im Protokoll-Editor) – alles andere wird nicht in URLs eingesetzt.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dokumentInNeuemTabOeffnen(id: string, mimeTyp?: string): void {
  if (!UUID.test(id)) {
    alert("Ungültiger Dokumentverweis");
    return;
  }
  if (mimeTyp && istEmail(mimeTyp)) {
    window.open(emailFensterUrl(id), "_blank");
    return;
  }
  const tab = window.open("", "_blank");
  const token = localStorage.getItem("brdms_token");
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // Ohne bekannten Typ (z. B. Verweis im Protokoll-Editor) erst nachsehen
  const typ = mimeTyp ? Promise.resolve(mimeTyp) : api.dokumente.einzel(id).then(d => d.mimeTyp);

  typ
    .then(async t => {
      if (istEmail(t)) {
        if (tab) tab.location.href = emailFensterUrl(id); else window.location.href = emailFensterUrl(id);
        return;
      }
      const url = t === "application/pdf" ? api.dokumente.vorschauUrl(id) : api.dokumente.downloadUrl(id);
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const objectUrl = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = objectUrl; else window.location.href = objectUrl;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    })
    .catch(err => {
      if (tab) tab.close();
      alert(err instanceof Error ? `Dokument konnte nicht geöffnet werden: ${err.message}` : "Dokument konnte nicht geöffnet werden");
    });
}
