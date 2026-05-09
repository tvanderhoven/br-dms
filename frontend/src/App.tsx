import { Routes, Route, Navigate } from "react-router-dom";
import Aufgaben from "./pages/Aufgaben";
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
import Layout from "./components/Layout";

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
    return <Navigate to="/login" replace />;
  }
  return element;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"              element={<Login />} />
      <Route path="/passwort-vergessen" element={<PasswortVergessen />} />
      <Route path="/passwort-reset"     element={<PasswortReset />} />
      <Route element={<Layout />}>
        <Route path="/"           element={geschuetzt(<Dashboard />)} />
        <Route path="/eingang"    element={geschuetzt(<Eingang />)} />
        <Route path="/dokumente"  element={geschuetzt(<Dokumente />)} />
        <Route path="/sitzungen"  element={geschuetzt(<Sitzungen />)} />
        <Route path="/benutzer"   element={geschuetzt(<Benutzer />)} />
        <Route path="/posteingang" element={geschuetzt(<Posteingang />)} />
        <Route path="/aufgaben"    element={geschuetzt(<Aufgaben />)} />
        <Route path="/vorlagen"      element={geschuetzt(<Vorlagen />)} />
        <Route path="/wissen"         element={geschuetzt(<Wissensarchiv />)} />
        <Route path="/ressourcen"     element={geschuetzt(<Ressourcen />)} />
        <Route path="/suche"          element={geschuetzt(<Suche />)} />
        <Route path="/themen"         element={geschuetzt(<Themensammlung />)} />
        <Route path="/beschluesse"    element={geschuetzt(<Beschluesse />)} />
        <Route path="/fristen"        element={geschuetzt(<Fristenkalender />)} />
        <Route path="/audit"          element={geschuetzt(<Auditlog />)} />
        <Route path="/einstellungen" element={geschuetzt(<Einstellungen />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
