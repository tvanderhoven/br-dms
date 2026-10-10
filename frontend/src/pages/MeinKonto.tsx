/**
 * Mein Konto – eigenes Profil, Passwort, Sitzungen und Zwei-Faktor-Anmeldung
 * an einer Stelle (erreichbar über den eigenen Namen oben in der Seitenleiste).
 */

import { useEffect, useState, FormEvent, ReactNode } from "react";
import { UserCircle, ShieldCheck, KeyRound, LogOut, Loader2, Pencil, X, History, Check } from "lucide-react";
import { api, Anmeldung, MeinKonto as Konto, ROLLE_LABEL, ZweiFaktorEinrichtung, formatDatum } from "../lib/api";
import PasswortAendernModal from "../components/PasswortAendernModal";
import { CodeFeld, Fehler, QrEinrichtung, Wiederherstellungscodes } from "../components/ZweiFaktorBausteine";

const eingabeKlasse =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";
const knopf =
  "flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60";
const hauptKnopf =
  "flex items-center justify-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5 rounded-lg";

function zeitpunkt(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Grobe Browser-Erkennung für die Anmeldeliste – genau muss das nicht sein */
function browser(ua: string | null): string {
  if (!ua) return "–";
  const name = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${name} · ${os}` : name;
}

export default function MeinKonto() {
  const [konto, setKonto]           = useState<Konto | null>(null);
  const [anmeldungen, setAnmeldungen] = useState<Anmeldung[]>([]);
  const [fehler, setFehler]         = useState("");
  const [pwOffen, setPwOffen]       = useState(false);
  const [dialog, setDialog]         = useState<null | "email" | "2fa-ein" | "2fa-aus" | "codes">(null);
  const [hinweis, setHinweis]       = useState("");

  function laden() {
    api.konto.laden().then(setKonto).catch(e => setFehler(e.message));
    api.konto.anmeldungen().then(setAnmeldungen).catch(() => {});
  }
  useEffect(laden, []);

  function meldung(text: string) {
    setHinweis(text);
    setTimeout(() => setHinweis(""), 4000);
  }

  async function ueberallAbmelden() {
    if (!confirm("Auf allen anderen Rechnern abmelden? Du bleibst hier angemeldet.")) return;
    try {
      await api.konto.abmeldenUeberall();
      meldung("Alle anderen Sitzungen sind beendet.");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Fehler");
    }
  }

  if (!konto) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        {fehler ? <span className="text-red-700">{fehler}</span> : <><Loader2 size={16} className="animate-spin" /> Laden…</>}
      </div>
    );
  }

  const zf = konto.zweiFaktor;

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
          <UserCircle className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mein Konto</h1>
          <p className="text-sm text-gray-500">Deine Daten, dein Passwort und deine Anmeldungen</p>
        </div>
      </div>

      {hinweis && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2 rounded-lg flex items-center gap-2">
          <Check size={15} /> {hinweis}
        </div>
      )}
      {fehler && <div className="mb-4"><Fehler text={fehler} /></div>}

      {/* Profil */}
      <Karte titel="Profil" icon={<UserCircle size={16} />}>
        <dl className="divide-y divide-gray-100">
          <Zeile label="Name">{konto.name}</Zeile>
          <Zeile label="Rolle">{ROLLE_LABEL[konto.rolle]}</Zeile>
          <Zeile label="Anmelde-E-Mail" aktion={<button onClick={() => setDialog("email")} className={knopf}><Pencil size={13} /> Ändern</button>}>
            {konto.email}
            <span className="block text-xs text-gray-400">Benutzername zum Anmelden und Adresse für „Passwort vergessen“</span>
          </Zeile>
          <EinladungZeile konto={konto} onGespeichert={e => { setKonto({ ...konto, einladungEmail: e }); meldung("Einladungsadresse gespeichert."); }} />
          <Zeile label="Letzte Anmeldung">{zeitpunkt(konto.letzterLogin)}</Zeile>
          <Zeile label="Konto seit">{formatDatum(konto.erstelltAm)}</Zeile>
        </dl>
      </Karte>

      {/* Sicherheit */}
      <Karte titel="Sicherheit" icon={<KeyRound size={16} />}>
        <dl className="divide-y divide-gray-100">
          <Zeile label="Passwort" aktion={<button onClick={() => setPwOffen(true)} className={knopf}><KeyRound size={13} /> Ändern</button>}>
            <span className="text-gray-500">Beim Ändern werden alle anderen Sitzungen beendet.</span>
          </Zeile>
          <Zeile label="Sitzungen" aktion={<button onClick={ueberallAbmelden} className={knopf}><LogOut size={13} /> Überall sonst abmelden</button>}>
            <span className="text-gray-500">Z. B. wenn du dich an einem fremden Rechner nicht abgemeldet hast.</span>
          </Zeile>
          <Zeile
            label="Zwei-Faktor-Anmeldung"
            aktion={zf.modus === "aus" ? null : zf.aktiv ? (
              <div className="flex gap-2 flex-wrap justify-end">
                <button onClick={() => setDialog("codes")} className={knopf}>Neue Wiederherstellungscodes</button>
                {!zf.pflicht && <button onClick={() => setDialog("2fa-aus")} className={knopf}>Abschalten</button>}
              </div>
            ) : (
              <button onClick={() => setDialog("2fa-ein")} className={hauptKnopf}><ShieldCheck size={14} /> Einrichten</button>
            )}
          >
            {zf.modus === "aus" ? (
              <span className="text-gray-500">In dieser Installation ausgeschaltet.</span>
            ) : zf.aktiv ? (
              <>
                <span className="inline-flex items-center gap-1 text-green-700 font-medium"><ShieldCheck size={14} /> Eingerichtet</span>
                <span className={`block text-xs ${zf.restCodes <= 3 ? "text-amber-700" : "text-gray-400"}`}>
                  Noch {zf.restCodes} Wiederherstellungscode{zf.restCodes === 1 ? "" : "s"}
                  {zf.pflicht && " · für deine Rolle Pflicht"}
                </span>
              </>
            ) : (
              <span className="text-gray-500">
                Nicht eingerichtet.{zf.pflicht && " Für deine Rolle Pflicht – wird bei der nächsten Anmeldung verlangt."}
                <span className="block text-xs text-gray-400">Zusätzlich zum Passwort ein Code aus einer Authenticator-App.</span>
              </span>
            )}
          </Zeile>
        </dl>
      </Karte>

      {/* Anmeldungen */}
      <Karte titel="Letzte Anmeldungen" icon={<History size={16} />}>
        {anmeldungen.length === 0 ? (
          <p className="text-sm text-gray-500 px-4 py-3">Noch keine Anmeldungen aufgezeichnet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2 font-medium">Zeitpunkt</th>
                <th className="px-4 py-2 font-medium">Browser</th>
                <th className="px-4 py-2 font-medium">IP-Adresse</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {anmeldungen.map((a, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{zeitpunkt(a.zeitpunkt)}</td>
                  <td className="px-4 py-2 text-gray-600">{browser(a.userAgent)}</td>
                  <td className="px-4 py-2 text-gray-600 font-mono text-xs">{a.ip ?? "–"}</td>
                  <td className="px-4 py-2 text-xs">{!a.erfolg && <span className="text-red-700">Code falsch</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
          Kommt dir eine Anmeldung fremd vor? Passwort ändern und dem Vorsitz Bescheid geben.
        </p>
      </Karte>

      {pwOffen && <PasswortAendernModal onSchliessen={() => setPwOffen(false)} />}

      {dialog === "email" && (
        <EmailDialog
          aktuell={konto.email}
          onSchliessen={() => setDialog(null)}
          onGespeichert={email => { setKonto({ ...konto, email }); setDialog(null); meldung("Anmelde-E-Mail geändert – die alte Adresse hat einen Hinweis bekommen."); }}
        />
      )}
      {dialog === "2fa-ein" && <ZweiFaktorEinrichtenDialog onSchliessen={() => { setDialog(null); laden(); }} />}
      {dialog === "2fa-aus" && <ZweiFaktorAbschaltenDialog onSchliessen={() => setDialog(null)} onFertig={() => { setDialog(null); laden(); meldung("Zwei-Faktor-Anmeldung abgeschaltet."); }} />}
      {dialog === "codes" && <NeueCodesDialog onSchliessen={() => { setDialog(null); laden(); }} />}
    </div>
  );
}

// ── Kleine Bausteine ────────────────────────────────────────────

function Karte({ titel, icon, children }: { titel: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5">
      <h2 className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 font-semibold text-gray-800 text-sm">
        <span className="text-[rgb(var(--accent))]">{icon}</span> {titel}
      </h2>
      {children}
    </section>
  );
}

function Zeile({ label, children, aktion }: { label: string; children: ReactNode; aktion?: ReactNode }) {
  return (
    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <dt className="text-sm text-gray-500 sm:w-48 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-800 flex-1 min-w-0 break-words">{children}</dd>
      {aktion && <div className="shrink-0">{aktion}</div>}
    </div>
  );
}

function Dialog({ titel, onSchliessen, children }: { titel: string; onSchliessen: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">{titel}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/** Formular mit Passwortfeld – für Aktionen, die das Passwort verlangen */
function MitPasswort({ knopfText, gefaehrlich = false, onAbsenden, children }: {
  knopfText: string; gefaehrlich?: boolean; onAbsenden: (passwort: string) => Promise<void>; children?: ReactNode;
}) {
  const [passwort, setPasswort] = useState("");
  const [laden, setLaden]       = useState(false);
  const [fehler, setFehler]     = useState("");

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      await onAbsenden(passwort);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      {children}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Dein Passwort</label>
        <input type="password" autoComplete="current-password" value={passwort} onChange={e => setPasswort(e.target.value)}
          required autoFocus={!children} className={eingabeKlasse} />
      </div>
      {fehler && <Fehler text={fehler} />}
      <button type="submit" disabled={laden || !passwort}
        className={`w-full ${gefaehrlich ? "bg-red-600 hover:bg-red-700" : "bg-[rgb(var(--accent))] hover:brightness-90"} disabled:opacity-60 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2`}>
        {laden && <Loader2 size={16} className="animate-spin" />} {knopfText}
      </button>
    </form>
  );
}

function EinladungZeile({ konto, onGespeichert }: { konto: Konto; onGespeichert: (e: string | null) => void }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [wert, setWert]             = useState(konto.einladungEmail ?? "");
  const [fehler, setFehler]         = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    try {
      const r = await api.konto.einladungEmail(wert.trim() || null);
      onGespeichert(r.einladungEmail);
      setBearbeiten(false);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  if (bearbeiten) {
    return (
      <form onSubmit={speichern} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <span className="text-sm text-gray-500 sm:w-48 shrink-0">Einladungen an</span>
        <div className="flex-1">
          <input type="email" value={wert} onChange={e => setWert(e.target.value)} autoFocus placeholder={konto.email}
            className={eingabeKlasse} />
          {fehler && <p className="text-red-700 text-xs mt-1">{fehler}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="submit" className={hauptKnopf}>Speichern</button>
          <button type="button" onClick={() => { setBearbeiten(false); setWert(konto.einladungEmail ?? ""); }} className={knopf}>Abbrechen</button>
        </div>
      </form>
    );
  }
  return (
    <Zeile label="Einladungen an" aktion={<button onClick={() => setBearbeiten(true)} className={knopf}><Pencil size={13} /> Ändern</button>}>
      {konto.einladungEmail ?? <span className="text-gray-500">wie Anmelde-E-Mail</span>}
      <span className="block text-xs text-gray-400">Optional eine zweite Adresse (z. B. br-…@) nur für Sitzungseinladungen</span>
    </Zeile>
  );
}

function EmailDialog({ aktuell, onSchliessen, onGespeichert }: {
  aktuell: string; onSchliessen: () => void; onGespeichert: (email: string) => void;
}) {
  const [email, setEmail] = useState(aktuell);
  return (
    <Dialog titel="Anmelde-E-Mail ändern" onSchliessen={onSchliessen}>
      <MitPasswort knopfText="Ändern" onAbsenden={async pw => onGespeichert((await api.konto.email(email, pw)).email)}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Neue Adresse</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus className={eingabeKlasse} />
          <p className="text-xs text-gray-500 mt-1">
            Ab sofort meldest du dich damit an. Die alte Adresse bekommt einen Hinweis.
          </p>
        </div>
      </MitPasswort>
    </Dialog>
  );
}

function ZweiFaktorEinrichtenDialog({ onSchliessen }: { onSchliessen: () => void }) {
  const [daten, setDaten] = useState<ZweiFaktorEinrichtung | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  return (
    <Dialog titel="Zwei-Faktor-Anmeldung einrichten" onSchliessen={onSchliessen}>
      {codes ? (
        <Wiederherstellungscodes codes={codes} onFertig={onSchliessen} fertigText="Fertig" />
      ) : daten ? (
        <QrEinrichtung daten={daten} onBestaetigen={async c => setCodes(await api.konto.zweiFaktorBestaetigen(c))} />
      ) : (
        <MitPasswort knopfText="Weiter" onAbsenden={async pw => setDaten(await api.konto.zweiFaktorStart(pw))}>
          <p className="text-sm text-gray-600">
            Danach fragt BR-DMS bei jeder Anmeldung zusätzlich nach einem 6-stelligen Code aus einer
            Authenticator-App. Andere Sitzungen werden dabei beendet.
          </p>
        </MitPasswort>
      )}
    </Dialog>
  );
}

function ZweiFaktorAbschaltenDialog({ onSchliessen, onFertig }: { onSchliessen: () => void; onFertig: () => void }) {
  return (
    <Dialog titel="Zwei-Faktor-Anmeldung abschalten" onSchliessen={onSchliessen}>
      <MitPasswort knopfText="Abschalten" gefaehrlich onAbsenden={async pw => { await api.konto.zweiFaktorAbschalten(pw); onFertig(); }}>
        <p className="text-sm text-gray-600">
          Danach reicht wieder das Passwort. Die Wiederherstellungscodes werden ungültig.
        </p>
      </MitPasswort>
    </Dialog>
  );
}

function NeueCodesDialog({ onSchliessen }: { onSchliessen: () => void }) {
  const [code, setCode]     = useState("");
  const [codes, setCodes]   = useState<string[] | null>(null);
  const [laden, setLaden]   = useState(false);
  const [fehler, setFehler] = useState("");

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      setCodes((await api.konto.neueCodes(code)).wiederherstellungscodes);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
      setCode("");
    } finally {
      setLaden(false);
    }
  }

  return (
    <Dialog titel="Neue Wiederherstellungscodes" onSchliessen={onSchliessen}>
      {codes ? (
        <Wiederherstellungscodes codes={codes} onFertig={onSchliessen} fertigText="Fertig" />
      ) : (
        <form onSubmit={absenden} className="space-y-4">
          <p className="text-sm text-gray-600">
            Die bisherigen Codes werden ungültig. Zur Bestätigung den aktuellen Code aus der App eingeben.
          </p>
          <CodeFeld wert={code} onAendern={setCode} />
          {fehler && <Fehler text={fehler} />}
          <button type="submit" disabled={laden || code.replace(/\s/g, "").length !== 6}
            className="w-full bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2">
            {laden && <Loader2 size={16} className="animate-spin" />} Neue Codes erzeugen
          </button>
        </form>
      )}
    </Dialog>
  );
}
