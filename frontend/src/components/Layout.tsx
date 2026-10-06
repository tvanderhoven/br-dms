import { Outlet, NavLink, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText, LayoutDashboard, CalendarDays,
  Mail, CheckSquare, Inbox, Search, X, LayoutTemplate, Settings, UserCircle, BookOpen, Menu, Newspaper, Globe, ClipboardList,
  Gavel, CalendarRange, Wallet, Scale, GraduationCap, Users, Kanban, ChevronDown, MailPlus, Vote, Landmark,
} from "lucide-react";
import { api, SuchErgebnis, KATEGORIE_LABEL, SITZUNG_STATUS_LABEL, RESSOURCE_KATEGORIE_LABEL, formatDatum, Rolle, ModuleKey, GesetzParagraph } from "../lib/api";
import GesetzModal from "./GesetzModal";
import BrandLogo from "./BrandLogo";
import PasswortAendernModal from "./PasswortAendernModal";
import UeberModal from "./UeberModal";

// Ordnet Routen-Präfixe den abschaltbaren Modulen zu (siehe Einstellungen → Module).
// Bei einem deaktivierten Modul: Sidebar-Eintrag ausgeblendet + Direktaufruf der URL wird auf "/" umgeleitet.
const MODUL_PFADE: Record<string, ModuleKey> = {
  "/gehaltstabelle":         "personalverwaltung",
  "/mitarbeiter":            "personalverwaltung",
  "/schulungen":             "personalverwaltung",
  "/betriebsvereinbarungen": "betriebsvereinbarungen",
  "/gremien":                "gremien",
  "/wissen":                 "wissensarchiv",
  "/ressourcen":             "ressourcen",
  "/themen":                 "themensammlung",
};

function GlobaleSuche() {
  const [query, setQuery]           = useState("");
  const [ergebnisse, setErgebnisse] = useState<SuchErgebnis>({ dokumente: [], sitzungen: [] });
  const [offen, setOffen]           = useState(false);
  const [laden, setLaden]           = useState(false);
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate                    = useNavigate();
  const [gesetzModal, setGesetzModal] = useState<GesetzParagraph | null>(null);
  const [gesetzLaden, setGesetzLaden] = useState(false);

  function gesetzOeffnen(id: string) {
    reset();
    setGesetzLaden(true);
    api.gesetze.einzel(id).then(setGesetzModal).finally(() => setGesetzLaden(false));
  }

  const suche = useCallback((q: string) => {
    if (q.trim().length < 2) { setErgebnisse({ dokumente: [], sitzungen: [] }); setOffen(false); return; }
    setLaden(true);
    api.suche(q)
      .then(data => { setErgebnisse(data); setOffen(true); })
      .catch(() => {})
      .finally(() => setLaden(false));
  }, []);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => suche(v), 300);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim().length >= 2) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setOffen(false);
      navigate(`/suche?q=${encodeURIComponent(query.trim())}`);
    }
  }

  function alleAnzeigen() {
    setOffen(false);
    navigate(`/suche?q=${encodeURIComponent(query.trim())}`);
  }

  function reset() { setQuery(""); setErgebnisse({ dokumente: [], sitzungen: [] }); setOffen(false); }

  const hatErgebnisse =
    ergebnisse.dokumente.length > 0 || ergebnisse.sitzungen.length > 0 ||
    (ergebnisse.wissen ?? []).length > 0 || (ergebnisse.ressourcen ?? []).length > 0 ||
    (ergebnisse.betriebsvereinbarungen ?? []).length > 0 || (ergebnisse.schulungen ?? []).length > 0 ||
    (ergebnisse.mitarbeiter ?? []).length > 0 || (ergebnisse.gesetze ?? []).length > 0;

  return (
    <div className="relative flex-1">
      <div className="flex items-center rounded-lg px-2 py-1.5 gap-2" style={{ backgroundColor: "rgb(var(--sidebar-active) / 0.5)" }}>
        <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgb(var(--sidebar-text-muted))" }} />
        <input
          type="text"
          value={query}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Suchen… (Enter für Vollsuche)"
          className="bg-transparent text-[rgb(var(--sidebar-text))] placeholder:text-[rgb(var(--sidebar-text-muted))] text-xs w-full outline-none"
        />
        {query && (
          <button onClick={reset} style={{ color: "rgb(var(--sidebar-text-muted))" }} className="hover:text-[rgb(var(--sidebar-text))]">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {offen && (
        <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto min-w-[300px]">
          {laden ? (
            <p className="text-xs text-gray-400 px-3 py-2">Suche…</p>
          ) : !hatErgebnisse ? (
            <p className="text-xs text-gray-400 px-3 py-2">Keine Treffer</p>
          ) : (
            <>
              {ergebnisse.dokumente.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">Dokumente</p>
                  {ergebnisse.dokumente.map(dok => (
                    <button
                      key={dok.id}
                      onClick={() => { navigate("/dokumente", { state: { markiere: dok.id } }); reset(); }}
                      className="w-full text-left px-3 py-2 hover:bg-accent/5 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-800" title={dok.alias ?? dok.titel}>{dok.alias ?? dok.titel}</p>
                      <p className="text-xs text-gray-400">{KATEGORIE_LABEL[dok.kategorie]} · {dok.dateiname}</p>
                    </button>
                  ))}
                </>
              )}
              {ergebnisse.sitzungen.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">Sitzungen & Protokolle</p>
                  {ergebnisse.sitzungen.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { navigate("/sitzungen"); reset(); }}
                      className="w-full text-left px-3 py-2 hover:bg-accent/5 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-800 truncate">{s.titel}</p>
                      <p className="text-xs text-gray-400">{formatDatum(s.sitzungsdatum)} · {SITZUNG_STATUS_LABEL[s.status]}</p>
                    </button>
                  ))}
                </>
              )}
              {ergebnisse.wissen && ergebnisse.wissen.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">Wissensarchiv</p>
                  {ergebnisse.wissen.map(w => (
                    <button
                      key={w.id}
                      onClick={() => { navigate("/wissen"); reset(); }}
                      className="w-full text-left px-3 py-2 hover:bg-accent/5 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-800 truncate">{w.titel}</p>
                      <p className="text-xs text-gray-400">{w.kategorien.join(" · ") || formatDatum(w.erstelltAm)}</p>
                    </button>
                  ))}
                </>
              )}
              {ergebnisse.ressourcen && ergebnisse.ressourcen.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">Ressourcen</p>
                  {ergebnisse.ressourcen.map(r => (
                    <a
                      key={r.id}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={reset}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-accent/5 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{r.titel}</p>
                        <p className="text-xs text-gray-400">{RESSOURCE_KATEGORIE_LABEL[r.kategorie]}</p>
                      </div>
                      <Globe className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    </a>
                  ))}
                </>
              )}
              {ergebnisse.betriebsvereinbarungen && ergebnisse.betriebsvereinbarungen.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">Betriebsvereinbarungen</p>
                  {ergebnisse.betriebsvereinbarungen.map(bv => (
                    <button
                      key={bv.id}
                      onClick={() => { navigate("/betriebsvereinbarungen"); reset(); }}
                      className="w-full text-left px-3 py-2 hover:bg-accent/5 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-800 truncate">{bv.titel}</p>
                    </button>
                  ))}
                </>
              )}
              {ergebnisse.schulungen && ergebnisse.schulungen.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">Schulungen</p>
                  {ergebnisse.schulungen.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { navigate("/schulungen"); reset(); }}
                      className="w-full text-left px-3 py-2 hover:bg-accent/5 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-800 truncate">{s.qualifikation.name}{s.titel ? ` – ${s.titel}` : ""}</p>
                      <p className="text-xs text-gray-400">{formatDatum(s.datum)}</p>
                    </button>
                  ))}
                </>
              )}
              {ergebnisse.mitarbeiter && ergebnisse.mitarbeiter.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">Mitarbeiter</p>
                  {ergebnisse.mitarbeiter.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { navigate("/gehaltstabelle"); reset(); }}
                      className="w-full text-left px-3 py-2 hover:bg-accent/5 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-800 truncate">{m.nachname}, {m.vorname}</p>
                    </button>
                  ))}
                </>
              )}
              {ergebnisse.gesetze && ergebnisse.gesetze.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">Gesetzestexte</p>
                  {ergebnisse.gesetze.map(g => (
                    <button
                      key={g.id}
                      onClick={() => gesetzOeffnen(g.id)}
                      className="w-full text-left px-3 py-2 hover:bg-accent/5 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {g.gesetz} {g.paragraph}{g.titel ? ` – ${g.titel}` : ""}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{g.text}</p>
                    </button>
                  ))}
                </>
              )}
              <button
                onClick={alleAnzeigen}
                className="w-full text-center text-xs text-accent hover:text-accent-hover py-2 border-t border-gray-100 hover:bg-accent/5 transition-colors"
              >
                Alle Ergebnisse anzeigen →
              </button>
            </>
          )}
        </div>
      )}

      {(gesetzModal || gesetzLaden) && (
        <GesetzModal paragraph={gesetzModal} laden={gesetzLaden} onSchliessen={() => setGesetzModal(null)} />
      )}
    </div>
  );
}

const POLL_INTERVAL = 60_000;

function browserNotification(titel: string, text: string) {
  if (Notification.permission === "granted") {
    new Notification(titel, { body: text });
  }
}

// ── Einklappbare Menü-Gruppe (Oberthema in der Sidebar) ────────────
function NavGruppe({
  titel, gruppenKey, sichtbar = true, zu, onToggle, children,
}: {
  titel: string;
  gruppenKey: string;
  sichtbar?: boolean;
  zu: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  if (!sichtbar) return null;
  return (
    <div className="mt-3 first:mt-0">
      <button
        onClick={() => onToggle(gruppenKey)}
        className="w-full flex items-center justify-between px-3 py-1 text-[11px] font-bold uppercase tracking-wider opacity-75 hover:opacity-100 transition-opacity"
        style={{ color: "rgb(var(--sidebar-text-muted))" }}
      >
        <span>{titel}</span>
        <ChevronDown size={12} className={`transition-transform ${zu ? "-rotate-90" : ""}`} />
      </button>
      {!zu && <div className="space-y-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

export default function Layout() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const [mobileOffen, setMobileOffen]             = useState(false);
  const [inboxCount, setInboxCount]               = useState(0);
  const [nachrichtenCount, setNachrichtenCount]   = useState(0);
  const [aufgabenCount, setAufgabenCount]         = useState(0);
  const [meineRolle, setMeineRolle]               = useState<Rolle | null>(null);
  const [meinName, setMeinName]                   = useState("");
  // Admin ohne Inhaltszugriff (Einstellungen → Benutzer, festgelegt von Vorsitz/Stellv.)
  const [ohneInhalt, setOhneInhalt]               = useState(false);
  const [module, setModule]                       = useState<Record<ModuleKey, boolean> | null>(null);
  const [toast, setToast]                         = useState<string | null>(null);
  const [pwModalOffen, setPwModalOffen]           = useState(false);
  const [ueberOffen, setUeberOffen]               = useState(false);
  const [inaktivitaetMinuten, setInaktivitaetMinuten] = useState(0);
  const prevCounts = useRef({ inbox: 0, nachrichten: 0, aufgaben: 0 });
  const ersterLauf = useRef(true);
  // pollCounts läuft im setInterval mit dem Stand des ersten Renders –
  // Rolle daher per Ref lesen, nicht aus dem State
  const meinKonto = useRef<{ rolle: Rolle | null; ohneInhalt: boolean }>({ rolle: null, ohneInhalt: false });
  const letzteAktivitaet = useRef(Date.now());

  // Auf-/zugeklappte Menü-Gruppen – pro Gerät gemerkt (Standard: alle offen)
  const [navGruppenZu, setNavGruppenZu] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("brdms_nav_gruppen_zu") ?? "{}");
    } catch {
      return {};
    }
  });
  function navGruppeUmschalten(key: string) {
    setNavGruppenZu(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("brdms_nav_gruppen_zu", JSON.stringify(next));
      return next;
    });
  }

  async function pollCounts() {
    const { rolle, ohneInhalt } = meinKonto.current;
    // Eingang ist nur für Vorsitz/Stellvertreter/Admin – für alle anderen Rollen
    // gar nicht erst abfragen (sonst nur unnötige 403-Fehler im Netzwerk-Log)
    if (rolle && ["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(rolle) && !ohneInhalt) {
      try {
        const docs = await api.dokumente.inbox();
        const n = docs.filter(d => !d.inboxGelesen).length;
        if (!ersterLauf.current && n > prevCounts.current.inbox) {
          const neu = n - prevCounts.current.inbox;
          const msg = `${neu} neues Dokument${neu > 1 ? "e" : ""} im Eingang`;
          setToast(msg);
          browserNotification("BR-DMS · Eingang", msg);
        }
        prevCounts.current.inbox = n;
        setInboxCount(n);
      } catch {}
    }

    try {
      const nachrichten = await api.nachrichten.liste();
      const n = nachrichten.filter(x => !x.gelesen).length;
      if (!ersterLauf.current && n > prevCounts.current.nachrichten) {
        const neu = n - prevCounts.current.nachrichten;
        const msg = `${neu} neue Nachricht${neu > 1 ? "en" : ""}`;
        setToast(msg);
        browserNotification("BR-DMS · Nachrichten", msg);
      }
      prevCounts.current.nachrichten = n;
      setNachrichtenCount(n);
    } catch {}

    if (!ohneInhalt) try {
      const aufgaben = await api.aufgaben.liste();
      // Offene Aufgaben wie auf der Aufgaben-Seite – auch solche in Vorhaben,
      // aber ohne Vorhaben selbst und ohne Themen-Backlog-Einträge.
      const n = aufgaben.filter(a => !a.erledigt && a.typ === "AUFGABE" && a.kanbanStatus == null).length;
      if (!ersterLauf.current && n > prevCounts.current.aufgaben) {
        const neu = n - prevCounts.current.aufgaben;
        const msg = `${neu} neue Aufgabe${neu > 1 ? "n" : ""}`;
        setToast(msg);
        browserNotification("BR-DMS · Aufgaben", msg);
      }
      prevCounts.current.aufgaben = n;
      setAufgabenCount(n);
    } catch {}

    ersterLauf.current = false;
  }

  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    api.auth.me().then(b => {
      setMeineRolle(b.rolle);
      setMeinName(b.name);
      setOhneInhalt(!!b.ohneInhaltszugriff);
      meinKonto.current = { rolle: b.rolle, ohneInhalt: !!b.ohneInhaltszugriff };
    }).catch(() => {}).finally(pollCounts);
    api.einstellungen.module().then(setModule).catch(() => {});
    api.einstellungen.sicherheit().then(s => setInaktivitaetMinuten(s.inaktivitaetMinuten)).catch(() => {});
    const id = setInterval(pollCounts, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function abmelden() {
    localStorage.removeItem("brdms_token");
    navigate("/login");
  }

  // Automatisches Abmelden bei Inaktivität (0 = deaktiviert, siehe Einstellungen → System).
  // Prüft per Intervall statt bei jedem Event neu zu timern, damit mousemove nicht dauernd feuert.
  useEffect(() => {
    if (!inaktivitaetMinuten) return;

    const aktivitaetErfassen = () => { letzteAktivitaet.current = Date.now(); };
    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(ev => window.addEventListener(ev, aktivitaetErfassen, { passive: true }));

    letzteAktivitaet.current = Date.now();
    const grenzeMs = inaktivitaetMinuten * 60 * 1000;
    const pruefung = setInterval(() => {
      if (Date.now() - letzteAktivitaet.current >= grenzeMs) {
        localStorage.removeItem("brdms_token");
        window.location.href = "/login";
      }
    }, 10000);

    return () => {
      events.forEach(ev => window.removeEventListener(ev, aktivitaetErfassen));
      clearInterval(pruefung);
    };
  }, [inaktivitaetMinuten]);

  // Direktaufruf einer URL eines deaktivierten Moduls → zurück zum Dashboard.
  // Erst NACH allen Hooks geprüft (Rules of Hooks), daher hier statt weiter oben.
  const aktivesModulPfad = Object.keys(MODUL_PFADE).find(p => location.pathname.startsWith(p));
  if (aktivesModulPfad && module && module[MODUL_PFADE[aktivesModulPfad]] === false) {
    return <Navigate to="/dashboard" replace />;
  }

  // Admin ohne Inhaltszugriff: nur Verwaltung und eigene Nachrichten
  // (Backend sperrt den Rest zusätzlich, siehe middleware/auth.ts)
  if (ohneInhalt && !["/einstellungen", "/benutzer", "/posteingang"].some(p => location.pathname.startsWith(p))) {
    return <Navigate to="/einstellungen" replace />;
  }

  // JAV: stark eingeschränkte Rolle, darf im Frontend nur /sitzungen sehen
  // (Backend erzwingt das ohnehin zusätzlich auf API-Ebene, siehe middleware/auth.ts)
  if (meineRolle === "JAV" && !location.pathname.startsWith("/sitzungen")) {
    return <Navigate to="/sitzungen" replace />;
  }

  // Gehaltstabelle: nur Mitglied/Vorsitz/Stellvertreter/Admin (Backend erzwingt
  // das zusätzlich, siehe erfordert(Role.MITGLIED) in routes/gehaltstabelle.ts)
  if (
    location.pathname.startsWith("/gehaltstabelle") &&
    meineRolle && !["MITGLIED", "VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle)
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  // Einstellungen braucht ein Ersatzmitglied nicht – Passwort ändern geht
  // unabhängig davon über den Klick auf den eigenen Namen unten in der Sidebar.
  if (location.pathname.startsWith("/einstellungen") && meineRolle === "ERSATZMITGLIED") {
    return <Navigate to="/dashboard" replace />;
  }

  // Eingang (Dokumente der Tagesordnung zuordnen) nur Vorsitz/Stellvertreter/Admin
  if (
    location.pathname.startsWith("/eingang") &&
    meineRolle && !["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle)
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  // Solange module noch lädt (null), Eintrag anzeigen statt kurz aufblitzend auszublenden
  const modulAktiv = (k: ModuleKey) => module === null || module[k] !== false;

  const linkKlasse = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
      isActive
        ? "bg-white/10 text-[rgb(var(--sidebar-text))] shadow-[inset_3px_0_0_rgb(var(--brand-red))]"
        : "text-[rgb(var(--sidebar-text)/0.65)] hover:bg-white/10 hover:text-[rgb(var(--sidebar-text))]"
    }`;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 flex flex-col shrink-0 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 shadow-2xl ${mobileOffen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "linear-gradient(170deg, rgb(var(--sidebar-bg)) 0%, rgb(var(--sidebar-active)) 100%)", boxShadow: "inset -1px 0 0 rgba(255,255,255,0.06), 6px 0 30px rgba(0,0,0,0.18)" }}
      >

        {/* Logo */}
        <div className="px-4 pt-5 pb-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <NavLink to="/dashboard" onClick={() => setMobileOffen(false)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <BrandLogo
              size={38}
              textClassName="text-lg text-[rgb(var(--sidebar-text))]"
            />
          </NavLink>
          <p className="text-[rgb(var(--sidebar-text-muted))] text-xs mt-1.5 leading-snug">Dokumentenmanagement für Betriebsräte</p>
        </div>

        {/* Eingeloggter Benutzer – bewusst weit oben, damit man bei langer
            Navigation nicht bis ganz unten scrollen muss, um dranzukommen */}
        {meinName && (
          <button
            onClick={() => setPwModalOffen(true)}
            title="Passwort ändern"
            className="px-4 py-2 flex items-center gap-2 border-b hover:brightness-125 transition-[filter] text-left shrink-0"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.18)" }}
          >
            <UserCircle size={15} className="shrink-0" style={{ color: "rgb(var(--sidebar-text-muted))" }} />
            <span className="truncate text-xs font-medium" style={{ color: "rgb(var(--sidebar-text))" }} title={meinName}>
              {meinName}
            </span>
          </button>
        )}

        {/* Suche + Einstellungen + Abmelden */}
        <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-1.5">
            {meineRolle !== "JAV" && !ohneInhalt && <GlobaleSuche />}
            {meineRolle !== "JAV" && meineRolle !== "ERSATZMITGLIED" && (
            <NavLink
              to="/einstellungen"
              title="Einstellungen"
              className={({ isActive }) =>
                `p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                  isActive
                    ? "bg-[rgb(var(--sidebar-active))] text-[rgb(var(--sidebar-text))]"
                    : "text-[rgb(var(--sidebar-text-muted))] hover:text-[rgb(var(--sidebar-text))] hover:bg-[rgb(var(--sidebar-hover))]"
                }`
              }
              onClick={() => setMobileOffen(false)}
            >
              <Settings size={15} />
            </NavLink>
            )}
            <button
              onClick={abmelden}
              title="Abmelden"
              className="p-1.5 rounded-lg text-[rgb(var(--sidebar-text-muted))] hover:text-[rgb(var(--sidebar-text))] hover:bg-[rgb(var(--sidebar-hover))] transition-colors flex-shrink-0"
            >
              <UserCircle size={15} />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {ohneInhalt ? (
            // Admin ohne Inhaltszugriff: nur die technische Verwaltung
            <>
              <NavLink to="/einstellungen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <Settings size={16} />
                Einstellungen
              </NavLink>
              <NavLink to="/posteingang" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                {({ isActive }) => (
                  <>
                    <Mail size={16} />
                    <span className="flex-1">Nachrichten</span>
                    {nachrichtenCount > 0 && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-[rgb(var(--sidebar-text))] text-[rgb(var(--sidebar-bg))]" : "bg-[rgb(var(--accent))] text-white"}`}>
                        {nachrichtenCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
              <p className="px-3 pt-3 text-[11px] leading-snug" style={{ color: "rgb(var(--sidebar-text-muted))" }}>
                Technischer Zugang: Inhalte des Gremiums sind für den Admin gesperrt.
              </p>
            </>
          ) : meineRolle === "JAV" ? (
            // JAV: stark eingeschränkte Rolle, sieht nur Sitzungen/Protokolle
            <NavLink to="/sitzungen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <CalendarDays size={16} />
              Sitzungen
            </NavLink>
          ) : (
          <>
          <NavLink to="/dashboard" end className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>
          <NavLink to="/suche" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <Search size={16} />
            Suche
          </NavLink>

          <NavGruppe titel="Postfach" gruppenKey="postfach" zu={!!navGruppenZu.postfach} onToggle={navGruppeUmschalten}>
            {meineRolle && ["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle) && (
              <NavLink to="/eingang" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                {({ isActive }) => (
                  <>
                    <Inbox size={16} />
                    <span className="flex-1">Eingang</span>
                    {inboxCount > 0 && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-[rgb(var(--sidebar-text))] text-[rgb(var(--sidebar-bg))]" : "bg-[rgb(var(--accent))] text-white"}`}>
                        {inboxCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )}
            <NavLink to="/posteingang" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              {({ isActive }) => (
                <>
                  <Mail size={16} />
                  <span className="flex-1">Nachrichten</span>
                  {nachrichtenCount > 0 && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-[rgb(var(--sidebar-text))] text-[rgb(var(--sidebar-bg))]" : "bg-[rgb(var(--accent))] text-white"}`}>
                      {nachrichtenCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
            <NavLink to="/kummerkasten-verwaltung" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <MailPlus size={16} />
              Kummerkasten
            </NavLink>
          </NavGruppe>

          <NavGruppe titel="Sitzungen" gruppenKey="sitzungen" zu={!!navGruppenZu.sitzungen} onToggle={navGruppeUmschalten}>
            <NavLink to="/sitzungen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <CalendarDays size={16} />
              Sitzungen
            </NavLink>
            {(meineRolle === "ADMIN" || meineRolle === "VORSITZ" || meineRolle === "STELLVERTRETER") && (
              <NavLink to="/vorlagen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <LayoutTemplate size={16} />
                Vorlagen
              </NavLink>
            )}
            {modulAktiv("gremien") && (
              <NavLink to="/gremien" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <Landmark size={16} />
                Gremien
              </NavLink>
            )}
            <NavLink to="/beschluesse" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <Gavel size={16} />
              Beschlussregister
            </NavLink>
            <NavLink to="/fristen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <CalendarRange size={16} />
              Fristenkalender
            </NavLink>
          </NavGruppe>

          <NavGruppe titel="Dokumente & Wissen" gruppenKey="dokumente" zu={!!navGruppenZu.dokumente} onToggle={navGruppeUmschalten}>
            <NavLink to="/dokumente" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <FileText size={16} />
              Dokumente
            </NavLink>
            {modulAktiv("wissensarchiv") && (
              <NavLink to="/wissen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <BookOpen size={16} />
                Wissensarchiv
              </NavLink>
            )}
            {modulAktiv("ressourcen") && (
              <NavLink to="/ressourcen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <Globe size={16} />
                Ressourcen
              </NavLink>
            )}
            {modulAktiv("themensammlung") && (
              <NavLink to="/themen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <Newspaper size={16} />
                Themensammlung
              </NavLink>
            )}
          </NavGruppe>

          <NavGruppe titel="Planung" gruppenKey="planung" zu={!!navGruppenZu.planung} onToggle={navGruppeUmschalten}>
            <NavLink to="/aufgaben" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              {({ isActive }) => (
                <>
                  <CheckSquare size={16} />
                  <span className="flex-1">Aufgaben</span>
                  {aufgabenCount > 0 && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-[rgb(var(--sidebar-text))] text-[rgb(var(--sidebar-bg))]" : "bg-[rgb(var(--accent))] text-white"}`}>
                      {aufgabenCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
            <NavLink to="/themen-backlog" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <Kanban size={16} />
              Themen-Backlog
            </NavLink>
            <NavLink to="/wahlen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <Vote size={16} />
              Wahlen
            </NavLink>
          </NavGruppe>

          <NavGruppe
            titel="Personal"
            gruppenKey="personal"
            sichtbar={modulAktiv("personalverwaltung") || modulAktiv("betriebsvereinbarungen")}
            zu={!!navGruppenZu.personal}
            onToggle={navGruppeUmschalten}
          >
            {modulAktiv("personalverwaltung") &&
              meineRolle && ["MITGLIED", "VORSITZ", "STELLVERTRETER", "ADMIN"].includes(meineRolle) && (
              <NavLink to="/gehaltstabelle" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <Wallet size={16} />
                Eingruppierung
              </NavLink>
            )}
            {modulAktiv("personalverwaltung") && (
              <NavLink to="/mitarbeiter" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <Users size={16} />
                Mitarbeiter
              </NavLink>
            )}
            {modulAktiv("betriebsvereinbarungen") && (
              <NavLink to="/betriebsvereinbarungen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <Scale size={16} />
                Betriebsvereinbarungen
              </NavLink>
            )}
            {modulAktiv("personalverwaltung") && (
              <NavLink to="/schulungen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
                <GraduationCap size={16} />
                Schulungen
              </NavLink>
            )}
          </NavGruppe>

          <NavGruppe
            titel="Verwaltung"
            gruppenKey="verwaltung"
            sichtbar={meineRolle === "ADMIN" || meineRolle === "VORSITZ"}
            zu={!!navGruppenZu.verwaltung}
            onToggle={navGruppeUmschalten}
          >
            <NavLink to="/audit" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <ClipboardList size={16} />
              Audit-Log
            </NavLink>
          </NavGruppe>
          </>
          )}
        </nav>

        <button
          onClick={() => setUeberOffen(true)}
          className="shrink-0 px-4 py-2.5 text-left text-[11px] border-t transition-opacity opacity-70 hover:opacity-100"
          style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgb(var(--sidebar-text-muted))" }}
        >
          Über BR-DMS · Open Source (AGPL)
        </button>
      </aside>

      {pwModalOffen && (
        <PasswortAendernModal onSchliessen={() => setPwModalOffen(false)} />
      )}
      {ueberOffen && <UeberModal onSchliessen={() => setUeberOffen(false)} />}

      {/* Mobile Overlay */}
      {mobileOffen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOffen(false)} />
      )}

      {/* Toast-Benachrichtigung */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-2xl cursor-pointer animate-in slide-in-from-bottom-2 duration-300"
        >
          <span className="w-2 h-2 rounded-full bg-[rgb(var(--accent))] shrink-0" />
          {toast}
          <X size={14} className="text-gray-400 hover:text-white ml-1" />
        </div>
      )}

      {/* Hauptbereich */}
      <main className="flex-1 overflow-auto">
        {/* Mobile Top Bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white sticky top-0 z-10">
          <button onClick={() => setMobileOffen(true)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-gray-800 text-sm">BR-DMS</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
