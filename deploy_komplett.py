#!/usr/bin/env python3
"""
deploy_komplett.py
Uebertraegt alle Quelldateien aus deploy_dateien.txt per SSH auf den Host –
plattformunabhaengig, ohne tar (der Host braucht nur python3 >= 3.8).
Ziel und Pfad kommen aus .env.deploy (siehe _deploy_config.py).

Aufruf:
  python3 deploy_komplett.py                    uebertragen
  python3 deploy_komplett.py --trocken          nur anzeigen, was uebertragen wuerde
  python3 deploy_komplett.py --bauen            uebertragen und direkt neu bauen/starten
  python3 deploy_komplett.py 192.168.1.100      Host ueberschreiben (kombinierbar)
"""
import base64, os, subprocess, sys, textwrap

from _deploy_config import NAS_USER, NAS_HOST as _NAS_HOST, DATA_PATH, DOCKER_BIN, lies_dateiliste

argumente = [a for a in sys.argv[1:] if not a.startswith("--")]
schalter  = {a for a in sys.argv[1:] if a.startswith("--")}
if schalter - {"--trocken", "--bauen"}:
    sys.exit(__doc__)

NAS_HOST = argumente[0] if argumente else _NAS_HOST
NAS_BASE = DATA_PATH
ZIEL     = f"{NAS_USER}@{NAS_HOST}"
ROOT     = os.path.dirname(os.path.abspath(__file__))
COMPOSE  = f"sudo {DOCKER_BIN} compose -f {NAS_BASE}/docker-compose.yml"

# Wird nie uebertragen, auch wenn es in einem gelisteten Ordner liegt
AUSSCHLUSS_ORDNER = {"node_modules", "dist", "__pycache__"}
AUSSCHLUSS_DATEI  = {".env", ".env.local"}


def sammle_dateien(eintraege):
    dateien = []
    for rel in eintraege:
        abs_pfad = os.path.join(ROOT, rel.replace("/", os.sep))
        if os.path.isdir(abs_pfad):
            for dirpath, dirnames, filenames in os.walk(abs_pfad):
                dirnames[:] = sorted(d for d in dirnames if d not in AUSSCHLUSS_ORDNER)
                for fname in sorted(filenames):
                    if fname in AUSSCHLUSS_DATEI or fname.endswith(".env"):
                        continue
                    dateien.append(os.path.relpath(os.path.join(dirpath, fname), ROOT).replace(os.sep, "/"))
        elif os.path.isfile(abs_pfad):
            dateien.append(rel)
        else:
            sys.exit(f"FEHLER: {rel} fehlt lokal (siehe deploy_dateien.txt)")
    return dateien


# ── Python-Payload fuer den Host bauen ───────────────────────────────────────
def baue_payload(dateien, ersetzen):
    # Erst alles in einen Zwischenordner schreiben; nur wenn das vollstaendig
    # klappt, werden die markierten Ordner ersetzt – so bleibt bei einem Abbruch
    # der alte Stand erhalten und geloeschte Dateien bleiben nicht liegen.
    lines = [
        "import base64, os, shutil, sys",
        f"BASE = {NAS_BASE!r}",
        "NEU  = os.path.join(BASE, '.deploy-neu')",
        "shutil.rmtree(NEU, ignore_errors=True)",
        "",
    ]
    for rel in dateien:
        with open(os.path.join(ROOT, rel.replace("/", os.sep)), "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        chunks = textwrap.wrap(b64, 76) or [""]
        lines += [
            f"# {rel}",
            f"ziel = os.path.join(NEU, {rel!r})",
            "os.makedirs(os.path.dirname(ziel), exist_ok=True)",
            "b64 = (\n" + "\n".join(f"    {c!r}" for c in chunks) + "\n)",
            "open(ziel, 'wb').write(base64.b64decode(b64))",
        ] + (["os.chmod(ziel, 0o755)"] if rel.endswith(".sh") else []) + [""]

    lines += [
        f"for d in {ersetzen!r}:",
        "    shutil.rmtree(os.path.join(BASE, d), ignore_errors=True)",
        "shutil.copytree(NEU, BASE, dirs_exist_ok=True)",
        "shutil.rmtree(NEU)",
        f"print('  OK  {len(dateien)} Dateien uebertragen')",
    ]
    return "\n".join(lines)


def naechste_schritte():
    print()
    print("=" * 62)
    print("  Jetzt per SSH auf dem Host ausfuehren:")
    print("=" * 62)
    print()
    print(f"  ssh {ZIEL}")
    print()
    print("  OPTION A – Alles neu bauen (Backend + Frontend):")
    print(f"  {COMPOSE} pull postgres proxy && {COMPOSE} build --pull && {COMPOSE} up -d")
    print()
    print("  OPTION B – Nur Backend:")
    print(f"  {COMPOSE} build --pull backend && {COMPOSE} up -d")
    print()
    print("  OPTION C – Nur Frontend (ohne Cache):")
    print(f"  {COMPOSE} build --pull --no-cache frontend && {COMPOSE} up -d")
    print()
    print("  Logs pruefen:")
    print(f"  sudo {DOCKER_BIN} logs brdms_backend --tail 40 -f")
    print()
    print("  Tipp: python3 deploy_komplett.py --bauen erledigt Uebertragung und Option A in einem Schritt.")
    print()
    print("=" * 62)
    print("  Backup & Restore (auf dem Host ausfuehren):")
    print("=" * 62)
    print()
    print(f"  sudo bash {NAS_BASE}/backup.sh      # manuelles Backup")
    print(f"  sudo bash {NAS_BASE}/restore.sh     # wiederherstellen (interaktiv)")
    print()


# ── Hauptprogramm ─────────────────────────────────────────────────────────────
def main():
    print("=" * 62)
    print("  BR-DMS Komplett-Deploy")
    print("=" * 62)
    print(f"  Ziel   : {ZIEL}")
    print(f"  Pfad   : {NAS_BASE}")
    print(f"  docker : {DOCKER_BIN}")
    print("=" * 62)
    print()

    eintraege, ersetzen = lies_dateiliste()
    dateien = sammle_dateien(eintraege)

    if "--trocken" in schalter:
        print("  Probelauf – wuerde uebertragen:")
        for d in dateien:
            print(f"    {d}")
        print()
        print(f"  {len(dateien)} Dateien; auf dem Host ersetzt: {' '.join(ersetzen)}")
        return

    print(f"  {len(dateien)} Dateien werden uebertragen ...\n")
    try:
        subprocess.run(["ssh", ZIEL, "python3 -"], input=baue_payload(dateien, ersetzen).encode("utf-8"), check=True)
        if "--bauen" in schalter:
            print("\n  Baue und starte auf dem Host (sudo-Passwort des Hosts) ...")
            subprocess.run(["ssh", "-t", ZIEL, f"{COMPOSE} pull postgres proxy && {COMPOSE} build --pull && {COMPOSE} up -d"], check=True)
            print("  Container neu gebaut und gestartet")
            return
    except subprocess.CalledProcessError as e:
        print(f"\nFEHLER: SSH-Befehl fehlgeschlagen (Exit {e.returncode})", file=sys.stderr)
        sys.exit(e.returncode)
    except FileNotFoundError:
        print("FEHLER: 'ssh' nicht gefunden.", file=sys.stderr)
        sys.exit(1)

    naechste_schritte()


if __name__ == "__main__":
    main()
