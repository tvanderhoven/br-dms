import { useEffect, useState, FormEvent } from "react";
import { UserPlus, KeyRound, Power, Trash2, Loader2, X, Shield, Users, Info, ShieldCheck, ShieldOff } from "lucide-react";
import { api, Benutzer, Rolle, Geschlecht } from "../lib/api";

const GESCHLECHT_LABEL: Record<Geschlecht, string> = {
  MAENNLICH: "Männlich",
  WEIBLICH:  "Weiblich",
};

const ROLLEN: Rolle[] = ["VORSITZ", "STELLVERTRETER", "MITGLIED", "ERSATZMITGLIED", "JAV", "SBV"];

export const ROLLEN_LABEL: Record<Rolle, string> = {
  VORSITZ:         "Vorsitz",
  STELLVERTRETER:  "Stellvertreter des Vorsitz",
  MITGLIED:        "Mitglied",
  ERSATZMITGLIED:  "Ersatzmitglied",
  ADMIN:           "Administrator",
  JAV:             "JAV (nur Sitzungen/Protokolle)",
  SBV:             "SBV (nur Sitzungen/Protokolle)",
};

export const ROLLEN_FARBE: Record<Rolle, string> = {
  VORSITZ:         "bg-accent/10 text-accent",
  STELLVERTRETER:  "bg-accent/10 text-accent",
  MITGLIED:        "bg-green-100 text-green-700",
  ERSATZMITGLIED:  "bg-amber-100 text-amber-700",
  ADMIN:           "bg-purple-100 text-purple-700",
  JAV:             "bg-teal-100 text-teal-700",
  SBV:             "bg-blue-100 text-blue-700",
};

export default function BenutzerVerwaltung({ eingebettet = false }: { eingebettet?: boolean }) {
  const [benutzer, setBenutzer]       = useState<Benutzer[]>([]);
  const [laden, setLaden]             = useState(true);
  const [neuOffen, setNeuOffen]       = useState(false);
  const [resetId, setResetId]         = useState<string | null>(null);
  const [fehler, setFehler]           = useState("");
  // Admin ohne Inhaltszugriff setzt keine fremden Passwörter (Backend sperrt das auch)
  const [ohneInhalt, setOhneInhalt]   = useState(false);

  function laden_() {
    setLaden(true);
    fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/api/benutzer`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("brdms_token")}` },
    })
      .then(r => r.json())
      .then(setBenutzer)
      .catch(console.error)
      .finally(() => setLaden(false));
  }

  useEffect(laden_, []);
  useEffect(() => { api.auth.me().then(b => setOhneInhalt(!!b.ohneInhaltszugriff)).catch(() => {}); }, []);

  async function statusToggle(b: Benutzer) {
    setFehler("");
    try {
      await apiFetch(`/api/benutzer/${b.id}`, "PATCH", { aktiv: !b.aktiv });
      laden_();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function zweiFaktorZuruecksetzen(b: Benutzer) {
    if (!confirm(`Zwei-Faktor-Anmeldung von ${b.name} entfernen?\n\nDie Person wird abgemeldet und meldet sich danach nur mit Passwort an. Ist sie für ihre Rolle Pflicht, wird sie beim nächsten Login neu eingerichtet.`)) return;
    setFehler("");
    try {
      await apiFetch(`/api/benutzer/${b.id}/zwei-faktor-zuruecksetzen`, "POST", {}); // leerer Body: Fastify lehnt JSON-Content-Type ohne Body ab
      laden_();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function rolleAendern(b: Benutzer, rolle: Rolle) {
    try {
      await apiFetch(`/api/benutzer/${b.id}`, "PATCH", { rolle });
      laden_();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function geschlechtAendern(b: Benutzer, geschlecht: Geschlecht | "") {
    try {
      await apiFetch(`/api/benutzer/${b.id}`, "PATCH", { geschlecht: geschlecht || null });
      laden_();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function wahlReihenfolgeAendern(b: Benutzer, wahlReihenfolge: number | null) {
    try {
      await apiFetch(`/api/benutzer/${b.id}`, "PATCH", { wahlReihenfolge });
      laden_();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function benutzerLoeschen(b: Benutzer) {
    if (!confirm(`"${b.name}" wirklich endgültig löschen? Das geht nur, wenn der Benutzer noch keine Daten im System hinterlassen hat, und kann nicht rückgängig gemacht werden.`)) return;
    setFehler("");
    try {
      await apiFetch(`/api/benutzer/${b.id}`, "DELETE");
      laden_();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  const tokenPayload = (() => {
    try {
      const token = localStorage.getItem("brdms_token");
      if (!token) return null;
      return JSON.parse(atob(token.split(".")[1]));
    } catch { return null; }
  })();
  const meinId    = tokenPayload?.sub as string | null;
  const meinRolle = tokenPayload?.rolle as Rolle | null;

  return (
    <div className={eingebettet ? "" : "p-6"}>
      <div className="flex items-center justify-between mb-4">
        <div>
          {!eingebettet && <h1 className="text-2xl font-bold text-gray-900">Benutzerverwaltung</h1>}
          <p className="text-sm text-gray-500">{benutzer.length} Benutzer</p>
        </div>
        <button
          onClick={() => setNeuOffen(true)}
          className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <UserPlus size={16} />
          Neues Mitglied
        </button>
      </div>

      {fehler && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
          {fehler}
          <button onClick={() => setFehler("")}><X size={14} /></button>
        </div>
      )}

      <div className="mb-4 flex items-start gap-2 bg-accent/5 border border-accent/25 text-accent text-xs px-4 py-3 rounded-lg">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          Geschlecht und Wahl-Rang stammen aus dem Wahlprotokoll der letzten BR-Wahl (Rang nach Stimmenzahl, 1 = meiste Stimmen).
          Sie bestimmen, wer bei Abwesenheit automatisch als nächstes Ersatzmitglied vorgeschlagen wird.
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {laden ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Laden…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Rolle</th>
                <th className="px-4 py-3 font-medium">Geschlecht</th>
                <th className="px-4 py-3 font-medium">Wahl-Rang</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Letzter Login</th>
                <th className="px-4 py-3 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {benutzer.map(b => (
                <tr key={b.id} className={`hover:bg-gray-50 transition-colors ${!b.aktiv ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent font-semibold text-xs shrink-0">
                        {b.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{b.name}</p>
                        <p className="text-xs text-gray-400">{b.email}</p>
                        <EinladungsAdresse benutzer={b} onGespeichert={laden_} onFehler={setFehler} />
                        <p
                          className="text-xs text-gray-300 font-mono cursor-pointer hover:text-gray-500 select-all"
                          title="Klicken zum Kopieren"
                          onClick={() => navigator.clipboard.writeText(b.id)}
                        >{b.id}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {b.id === meinId ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLLEN_FARBE[b.rolle]}`}>
                        {ROLLEN_LABEL[b.rolle]}
                      </span>
                    ) : (
                      <select
                        value={b.rolle}
                        onChange={e => rolleAendern(b, e.target.value as Rolle)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${ROLLEN_FARBE[b.rolle]} bg-transparent`}
                      >
                        {ROLLEN.map(r => (
                          <option key={r} value={r}>{ROLLEN_LABEL[r]}</option>
                        ))}
                      </select>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <select
                      value={b.geschlecht ?? ""}
                      onChange={e => geschlechtAendern(b, e.target.value as Geschlecht | "")}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    >
                      <option value="">–</option>
                      <option value="MAENNLICH">{GESCHLECHT_LABEL.MAENNLICH}</option>
                      <option value="WEIBLICH">{GESCHLECHT_LABEL.WEIBLICH}</option>
                    </select>
                  </td>

                  <td className="px-4 py-3">
                    <WahlRangZelle benutzer={b} onGeaendert={wert => wahlReihenfolgeAendern(b, wert)} />
                  </td>

                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.aktiv ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {b.aktiv ? "Aktiv" : "Deaktiviert"}
                    </span>
                    {b.zweiFaktorAktiv && (
                      <span title="Zwei-Faktor-Anmeldung eingerichtet" className="ml-1 inline-flex items-center text-green-700 align-middle">
                        <ShieldCheck size={14} />
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-xs text-gray-500">
                    {b.letzterLogin
                      ? new Date(b.letzterLogin).toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })
                      : "Noch nie"}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {!ohneInhalt && <button
                        onClick={() => setResetId(b.id)}
                        title="Passwort zurücksetzen"
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                      >
                        <KeyRound size={13} />
                        PW reset
                      </button>}

                      {!ohneInhalt && b.zweiFaktorAktiv && b.id !== meinId && (
                        <button
                          onClick={() => zweiFaktorZuruecksetzen(b)}
                          title="Zwei-Faktor-Anmeldung entfernen (z. B. Handy verloren) – die Person meldet sich danach nur mit Passwort an"
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <ShieldOff size={13} />
                          2FA reset
                        </button>
                      )}

                      {b.id !== meinId && (
                        <button
                          onClick={() => statusToggle(b)}
                          title={b.aktiv ? "Deaktivieren" : "Aktivieren"}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                            b.aktiv
                              ? "text-gray-500 hover:text-red-600 hover:bg-red-50"
                              : "text-gray-500 hover:text-green-600 hover:bg-green-50"
                          }`}
                        >
                          <Power size={13} />
                          {b.aktiv ? "Sperren" : "Aktivieren"}
                        </button>
                      )}

                      {b.id !== meinId && meinRolle === "ADMIN" && (
                        <button
                          onClick={() => benutzerLoeschen(b)}
                          title="Endgültig löschen (nur möglich ohne vorhandene Daten im System)"
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={13} />
                          Löschen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {neuOffen && (
        <NeuerBenutzerModal
          onSchliessen={() => setNeuOffen(false)}
          onErfolg={() => { setNeuOffen(false); laden_(); }}
        />
      )}

      {resetId && (
        <PasswortResetModal
          benutzerId={resetId}
          benutzerName={benutzer.find(b => b.id === resetId)?.name ?? ""}
          onSchliessen={() => setResetId(null)}
          onErfolg={() => setResetId(null)}
        />
      )}
    </div>
  );
}

// ── Zweitadresse für Einladungen (inline bearbeitbar) ──────────────
function EinladungsAdresse({ benutzer, onGespeichert, onFehler }: {
  benutzer: Benutzer; onGespeichert: () => void; onFehler: (f: string) => void;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [wert, setWert] = useState(benutzer.einladungEmail ?? "");

  async function speichern() {
    setBearbeiten(false);
    if (wert.trim() === (benutzer.einladungEmail ?? "")) return;
    try {
      await apiFetch(`/api/benutzer/${benutzer.id}`, "PATCH", { einladungEmail: wert.trim() || null });
      onGespeichert();
    } catch (err) {
      setWert(benutzer.einladungEmail ?? "");
      onFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  if (bearbeiten) {
    return (
      <input
        type="email"
        autoFocus
        value={wert}
        onChange={e => setWert(e.target.value)}
        onBlur={speichern}
        onKeyDown={e => {
          if (e.key === "Enter") speichern();
          if (e.key === "Escape") { setWert(benutzer.einladungEmail ?? ""); setBearbeiten(false); }
        }}
        placeholder="Zweitadresse für Einladungen"
        className="mt-0.5 w-56 text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
      />
    );
  }
  return (
    <button
      onClick={() => setBearbeiten(true)}
      title="Adresse, an die Einladungen gehen (leer = Hauptadresse)"
      className="text-xs text-left text-gray-500 hover:text-[rgb(var(--accent))]"
    >
      {benutzer.einladungEmail
        ? <>Einladungen an: <span className="text-gray-700">{benutzer.einladungEmail}</span></>
        : <span className="text-gray-300 hover:text-[rgb(var(--accent))]">+ Adresse für Einladungen</span>}
    </button>
  );
}

// ── Neuer Benutzer Modal ──────────────────────────────────────────
function NeuerBenutzerModal({ onSchliessen, onErfolg }: { onSchliessen: () => void; onErfolg: () => void }) {
  const [laden, setLaden]     = useState(false);
  const [fehler, setFehler]   = useState("");
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [einladungEmail, setEinladungEmail] = useState("");
  const [rolle, setRolle]     = useState<Rolle>("MITGLIED");
  const [pw, setPw]           = useState("");
  const [pwWdh, setPwWdh]     = useState("");

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    if (pw !== pwWdh) { setFehler("Passwörter stimmen nicht überein"); return; }
    if (pw.length < 8) { setFehler("Passwort muss mindestens 8 Zeichen haben"); return; }
    setFehler("");
    setLaden(true);
    try {
      await apiFetch("/api/benutzer", "POST", { name, email, rolle, passwort: pw, einladungEmail: einladungEmail || null });
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <Modal titel="Neues Mitglied anlegen" onSchliessen={onSchliessen}>
      <form onSubmit={anlegen} className="space-y-4">
        <Feld label="Name *">
          <input value={name} onChange={e => setName(e.target.value)} required className={input} placeholder="Vorname Nachname" />
        </Feld>
        <Feld label="E-Mail *">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={input} />
        </Feld>
        <Feld label="Adresse für Einladungen (optional)">
          <input type="email" value={einladungEmail} onChange={e => setEinladungEmail(e.target.value)} className={input} placeholder="z. B. br-name@firma.de – leer = E-Mail oben" />
        </Feld>
        <Feld label="Rolle *">
          <select value={rolle} onChange={e => setRolle(e.target.value as Rolle)} className={input}>
            {ROLLEN.map(r => <option key={r} value={r}>{ROLLEN_LABEL[r]}</option>)}
          </select>
        </Feld>
        <Feld label="Passwort *">
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={8} className={input} placeholder="Mindestens 8 Zeichen" />
        </Feld>
        <Feld label="Passwort wiederholen *">
          <input type="password" value={pwWdh} onChange={e => setPwWdh(e.target.value)} required className={input} />
        </Feld>
        {fehler && <Fehlerbox>{fehler}</Fehlerbox>}
        <Buttons laden={laden} onAbbrechen={onSchliessen} submitLabel="Anlegen" />
      </form>
    </Modal>
  );
}

// ── Passwort-Reset Modal ──────────────────────────────────────────
function PasswortResetModal({ benutzerId, benutzerName, onSchliessen, onErfolg }: {
  benutzerId: string; benutzerName: string; onSchliessen: () => void; onErfolg: () => void;
}) {
  const [laden, setLaden]   = useState(false);
  const [fehler, setFehler] = useState("");
  const [pw, setPw]         = useState("");
  const [pwWdh, setPwWdh]   = useState("");

  async function reset(e: FormEvent) {
    e.preventDefault();
    if (pw !== pwWdh) { setFehler("Passwörter stimmen nicht überein"); return; }
    setFehler("");
    setLaden(true);
    try {
      await apiFetch(`/api/benutzer/${benutzerId}/passwort-reset`, "POST", { neuesPasswort: pw });
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <Modal titel={`Passwort zurücksetzen: ${benutzerName}`} onSchliessen={onSchliessen}>
      <form onSubmit={reset} className="space-y-4">
        <Feld label="Neues Passwort *">
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={8} className={input} placeholder="Mindestens 8 Zeichen" autoFocus />
        </Feld>
        <Feld label="Passwort wiederholen *">
          <input type="password" value={pwWdh} onChange={e => setPwWdh(e.target.value)} required className={input} />
        </Feld>
        {fehler && <Fehlerbox>{fehler}</Fehlerbox>}
        <Buttons laden={laden} onAbbrechen={onSchliessen} submitLabel="Passwort setzen" />
      </form>
    </Modal>
  );
}

// ── Wahl-Rang Zelle (eigene Komponente wegen lokalem Input-State) ──
function WahlRangZelle({ benutzer, onGeaendert }: { benutzer: Benutzer; onGeaendert: (wert: number | null) => void }) {
  const original = benutzer.wahlReihenfolge != null ? String(benutzer.wahlReihenfolge) : "";
  const [wert, setWert] = useState(original);

  useEffect(() => { setWert(original); }, [original]);

  function commit() {
    if (wert === original) return;
    if (wert.trim() === "") { onGeaendert(null); return; }
    const zahl = parseInt(wert, 10);
    if (!Number.isInteger(zahl) || zahl < 1) { setWert(original); return; }
    onGeaendert(zahl);
  }

  return (
    <input
      type="number"
      min={1}
      value={wert}
      onChange={e => setWert(e.target.value)}
      onBlur={commit}
      placeholder="–"
      className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
    />
  );
}

// ── Hilfskomponenten ──────────────────────────────────────────────
const input = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white";

function Modal({ titel, onSchliessen, children }: { titel: string; onSchliessen: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{titel}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Fehlerbox({ children }: { children: React.ReactNode }) {
  return <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{children}</div>;
}

function Buttons({ laden, onAbbrechen, submitLabel }: { laden: boolean; onAbbrechen: () => void; submitLabel: string }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onAbbrechen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
        Abbrechen
      </button>
      <button type="submit" disabled={laden} className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
        {laden && <Loader2 size={14} className="animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}

// ── API-Helfer ────────────────────────────────────────────────────
async function apiFetch(path: string, method: string, body?: unknown) {
  const base = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("brdms_token")}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.fehler ?? `HTTP ${res.status}`);
  return data;
}
