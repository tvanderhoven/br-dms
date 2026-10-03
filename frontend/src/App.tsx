import { Routes, Route, Navigate } from "react-router-dom";
import Aufgaben from "./pages/Aufgaben";
import ThemenBacklog from "./pages/ThemenBacklog";
import Login from "./pages/Login";
import PasswortVergessen from "./pages/PasswortVergessen";
import PasswortReset from "./pages/PasswortReset";
import Dashboard from "./pages/Dashboard";
import Dokumente from "./pages/Dokumente";
import Benutzer from "./pages/Benutzer";
import Sitzungen from "./pages/Sitzungen";
import Posteingang from "./pages/Posteingang";
import Eingang from "./pages/Eingang";
import Vorlagen from "./pages/Vorlagen";
import Einstellungen from "./pages/Einstellungen";
import Wissensarchiv from "./pages/Wissensarchiv";
import Ressourcen from "./pages/Ressourcen";
import Auditlog from "./pages/Auditlog";
import Suche from "./pages/Suche";
import Themensammlung from "./pages/Themensammlung";
import Beschluesse from "./pages/Beschluesse";
import Fristenkalender from "./pages/Fristenkalender";
import Gehaltstabelle from "./pages/Gehaltstabelle";
import MitarbeiterUebersicht from "./pages/MitarbeiterUebersicht";
import KummerkastenOeffentlich from "./pages/KummerkastenOeffentlich";
import KummerkastenVerwaltung from "./pages/KummerkastenVerwaltung";
import Betriebsvereinbarungen from "./pages/Betriebsvereinbarungen";
import Schulungen from "./pages/Schulungen";
import Layout from "./components/Layout";
import { useDesign } from "./lib/useDesign";

function tokenGueltig(): boolean {
  const t = localStorage.getItem("brdms_token");
  if (!t) return false;
  try {
    const { exp } = JSON.parse(atob(t.split(".")[1]));
    return exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function geschuetzt(element: React.ReactElement) {
  if (!tokenGueltig()) {
    localStorage.removeItem("brdms_token");
    // Ziel merken (z.B. ein per E-Mail verschickter Link auf eine bestimmte
    // Sitzung), damit man nach dem Login direkt dort landet statt im Dashboard.
    const ziel = window.location.pathname + window.location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(ziel)}`} replace />;
  }
  return element;
}

export default function App() {
  // Gespeichertes Design (Einstellungen → Design) auf allen Seiten, auch vor dem Login
  useDesign();
  return (
    <Routes>
      {/* Öffentlich, kein Login, kein Layout – Startseite für die Belegschaft */}
      <Route path="/"                   element={<KummerkastenOeffentlich />} />
      <Route path="/kummerkasten"       element={<KummerkastenOeffentlich />} />
      <Route path="/login"              element={<Login />} />
      <Route path="/passwort-vergessen" element={<PasswortVergessen />} />
      <Route path="/passwort-reset"     element={<PasswortReset />} />
      <Route element={<Layout />}>
        <Route path="/dashboard"  element={geschuetzt(<Dashboard />)} />
        <Route path="/eingang"    element={geschuetzt(<Eingang />)} />
        <Route path="/dokumente"  element={geschuetzt(<Dokumente />)} />
        <Route path="/sitzungen"  element={geschuetzt(<Sitzungen />)} />
        <Route path="/benutzer"   element={geschuetzt(<Benutzer />)} />
        <Route path="/posteingang" element={geschuetzt(<Posteingang />)} />
        <Route path="/aufgaben"    element={geschuetzt(<Aufgaben />)} />
        {/* Früher eigene Seite – Vorhaben leben jetzt in den Aufgaben */}
        <Route path="/zeitraeume" element={<Navigate to="/aufgaben?ansicht=zeitplan" replace />} />
        <Route path="/themen-backlog" element={geschuetzt(<ThemenBacklog />)} />
        <Route path="/vorlagen"      element={geschuetzt(<Vorlagen />)} />
        <Route path="/wissen"         element={geschuetzt(<Wissensarchiv />)} />
        <Route path="/ressourcen"     element={geschuetzt(<Ressourcen />)} />
        <Route path="/suche"          element={geschuetzt(<Suche />)} />
        <Route path="/themen"         element={geschuetzt(<Themensammlung />)} />
        <Route path="/beschluesse"    element={geschuetzt(<Beschluesse />)} />
        <Route path="/fristen"        element={geschuetzt(<Fristenkalender />)} />
        <Route path="/gehaltstabelle" element={geschuetzt(<Gehaltstabelle />)} />
        <Route path="/mitarbeiter"    element={geschuetzt(<MitarbeiterUebersicht />)} />
        <Route path="/kummerkasten-verwaltung" element={geschuetzt(<KummerkastenVerwaltung />)} />
        <Route path="/betriebsvereinbarungen" element={geschuetzt(<Betriebsvereinbarungen />)} />
        <Route path="/schulungen"     element={geschuetzt(<Schulungen />)} />
        <Route path="/audit"          element={geschuetzt(<Auditlog />)} />
        <Route path="/einstellungen" element={geschuetzt(<Einstellungen />)} />
      </Route>
      <Route path="*" element={<Navigate to={tokenGueltig() ? "/dashboard" : "/"} replace />} />
    </Routes>
  );
}
