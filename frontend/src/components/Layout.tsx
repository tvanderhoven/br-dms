import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText, LayoutDashboard, Shield, CalendarDays,
  Mail, CheckSquare, Inbox, Search, X, LayoutTemplate, Settings, UserCircle, BookOpen, Menu, Newspaper, Globe, ClipboardList,
  Gavel, CalendarRange,
} from "lucide-react";
import { api, SuchErgebnis, KATEGORIE_LABEL, SITZUNG_STATUS_LABEL, RESSOURCE_KATEGORIE_LABEL, formatDatum, Rolle } from "../lib/api";
import { useDesign } from "../lib/useDesign";

function GlobaleSuche() {
  const [query, setQuery]           = useState("");
  const [ergebnisse, setErgebnisse] = useState<SuchErgebnis>({ dokumente: [], sitzungen: [] });
  const [offen, setOffen]           = useState(false);
  const [laden, setLaden]           = useState(false);
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate                    = useNavigate();

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

  const hatErgebnisse = ergebnisse.dokumente.length > 0 || ergebnisse.sitzungen.length > 0 || (ergebnisse.wissen ?? []).length > 0 || (ergebnisse.ressourcen ?? []).length > 0;

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
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
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
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
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
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
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
                      className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
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
              <button
                onClick={alleAnzeigen}
                className="w-full text-center text-xs text-blue-600 hover:text-blue-800 py-2 border-t border-gray-100 hover:bg-blue-50 transition-colors"
              >
                Alle Ergebnisse anzeigen →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  useDesign();
  const navigate   = useNavigate();
  const [mobileOffen, setMobileOffen]             = useState(false);
  const [inboxCount, setInboxCount]           = useState(0);
  const [nachrichtenCount, setNachrichtenCount] = useState(0);
  const [meineRolle, setMeineRolle]           = useState<Rolle | null>(null);

  useEffect(() => {
    api.dokumente.inbox()
      .then(docs => setInboxCount(docs.filter(d => !d.inboxGelesen).length))
      .catch(() => {});
    api.nachrichten.liste()
      .then(n => setNachrichtenCount(n.filter(x => !x.gelesen).length))
      .catch(() => {});
    api.auth.me()
      .then(b => setMeineRolle(b.rolle))
      .catch(() => {});
  }, []);

  function abmelden() {
    localStorage.removeItem("brdms_token");
    navigate("/login");
  }

  const linkKlasse = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
      isActive
        ? "bg-white/15 text-[rgb(var(--sidebar-text))] shadow-sm"
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
          <div className="flex items-center gap-2 text-[rgb(var(--sidebar-text))] font-bold text-lg">
            <Shield size={20} />
            BR-DMS
          </div>
          <p className="text-[rgb(var(--sidebar-text-muted))] text-xs mt-0.5">Betriebsrats-Cloud</p>
        </div>

        {/* Suche + Einstellungen + Abmelden */}
        <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-1.5">
            <GlobaleSuche />
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
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto pb-16">
          <NavLink to="/" end className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>
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
          <NavLink to="/dokumente" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <FileText size={16} />
            Dokumente
          </NavLink>
          <NavLink to="/sitzungen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <CalendarDays size={16} />
            Sitzungen
          </NavLink>
          <NavLink to="/vorlagen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <LayoutTemplate size={16} />
            Vorlagen
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
          <NavLink to="/aufgaben" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <CheckSquare size={16} />
            Aufgaben
          </NavLink>
          <NavLink to="/wissen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <BookOpen size={16} />
            Wissensarchiv
          </NavLink>
          <NavLink to="/ressourcen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <Globe size={16} />
            Ressourcen
          </NavLink>
          <NavLink to="/themen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <Newspaper size={16} />
            Themensammlung
          </NavLink>
          <NavLink to="/beschluesse" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <Gavel size={16} />
            Beschlussregister
          </NavLink>
          <NavLink to="/fristen" className={linkKlasse} onClick={() => setMobileOffen(false)}>
            <CalendarRange size={16} />
            Fristenkalender
          </NavLink>
          {(meineRolle === "ADMIN" || meineRolle === "VORSITZ") && (
            <NavLink to="/audit" className={linkKlasse} onClick={() => setMobileOffen(false)}>
              <ClipboardList size={16} />
              Audit-Log
            </NavLink>
          )}
        </nav>

        {/* Dekorativer Gradient unten */}
        <div className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.25), transparent)" }} />
      </aside>

      {/* Mobile Overlay */}
      {mobileOffen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOffen(false)} />
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
