#!/usr/bin/env python3
"""
deploy_komplett.py
Uebertraegt ALLE Quelldateien des BR-DMS auf das NAS per SSH-Pipe.
Ziel und Pfad werden aus der lokalen .env gelesen.

Aufruf:
  python3 deploy_komplett.py
  python3 deploy_komplett.py 192.168.1.100   # Host ueberschreiben
"""
import base64, os, subprocess, sys, textwrap

# ── Config aus .env ───────────────────────────────────────────────────────────
from _deploy_config import NAS_USER, NAS_HOST as _NAS_HOST, DATA_PATH

NAS_HOST = sys.argv[1] if len(sys.argv) > 1 else _NAS_HOST
NAS_BASE = DATA_PATH
ZIEL     = f"{NAS_USER}@{NAS_HOST}"
ROOT     = os.path.dirname(os.path.abspath(__file__))

# ── Dateien einsammeln ────────────────────────────────────────────────────────
# Verzeichnisse: alles darin rekursiv
SCAN_DIRS = [
    "backend/src",
    "backend/prisma",
    "frontend/src",
]

# Einzelne Dateien (Konfiguration, Dockerfiles, usw.)
EINZEL = [
    "docker-compose.yml",
    "start.sh",
    "backup.sh",
    "restore.sh",
    ".env.example",
    "backend/Dockerfile",
    "backend/docker-entrypoint.sh",
    "backend/package.json",
    "backend/tsconfig.json",
    "frontend/Dockerfile",
    "frontend/package.json",
    "frontend/index.html",
    "frontend/nginx.conf",
    "frontend/tailwind.config.js",
    "frontend/postcss.config.js",
    "frontend/tsconfig.json",
    "frontend/vite.config.ts",
    "proxy/nginx.conf",
    "proxy/generate-selfsigned-cert.sh",
]

# Erweiterungen die beim Scan beruecksichtigt werden
ERLAUBTE_EXT = {".ts", ".tsx", ".js", ".json", ".prisma", ".css", ".html", ".sh", ".conf"}

# Dateien / Muster die NIEMALS uebertragen werden
AUSSCHLUSS = {"package-lock.json", ".env", ".env.local"}


def sammle_dateien():
    dateien = []

    # Verzeichnisse rekursiv scannen
    for scandir in SCAN_DIRS:
        abs_dir = os.path.join(ROOT, scandir)
        if not os.path.isdir(abs_dir):
            continue
        for dirpath, _, filenames in os.walk(abs_dir):
            for fname in sorted(filenames):
                if os.path.splitext(fname)[1] not in ERLAUBTE_EXT:
                    continue
                if fname in AUSSCHLUSS:
                    continue
                abs_pfad = os.path.join(dirpath, fname)
                rel_pfad = os.path.relpath(abs_pfad, ROOT).replace(os.sep, "/")
                dateien.append(rel_pfad)

    # Einzeldateien
    for rel in EINZEL:
        if rel in AUSSCHLUSS:
            continue
        abs_pfad = os.path.join(ROOT, rel.replace("/", os.sep))
        if os.path.isfile(abs_pfad):
            dateien.append(rel)
        else:
            print(f"  ⚠  Nicht gefunden (uebersprungen): {rel}")

    return dateien


# ── Python-Payload fuer das NAS bauen ────────────────────────────────────────
def baue_payload(dateien):
    lines = [
        "import base64, os, sys",
        f"BASE = {NAS_BASE!r}",
        "ok = []",
        "fehler = []",
        "",
    ]

    for rel in dateien:
        abs_pfad = os.path.join(ROOT, rel.replace("/", os.sep))
        nas_pfad = f"{NAS_BASE}/{rel}"

        with open(abs_pfad, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")

        chunks = textwrap.wrap(b64, 76)
        if len(chunks) == 1:
            b64_literal = f"    b64 = {chunks[0]!r}"
        else:
            b64_literal = "    b64 = (\n" + "\n".join(
                f"        {c!r}" for c in chunks) + "\n    )"

        chmod_line = ["    os.chmod(ziel, 0o755)"] if rel.endswith('.sh') else []
        lines += [
            f"# {rel}",
            "try:",
            f"    ziel = {nas_pfad!r}",
            "    os.makedirs(os.path.dirname(ziel), exist_ok=True)",
            b64_literal,
            "    open(ziel, 'wb').write(base64.b64decode(b64))",
        ] + chmod_line + [
            f"    ok.append({rel!r})",
            f"    print('  OK  {rel}')",
            "except Exception as e:",
            f"    fehler.append({rel!r})",
            f"    print('  FEHLER  {rel}: ' + str(e), file=sys.stderr)",
            "",
        ]

    # Abschlussmeldung + Rebuild-Befehle
    dc = f"{NAS_BASE}/docker-compose.yml"
    lines += [
        "print()",
        "print('=' * 62)",
        f"print(f'Uebertragen: {{len(ok)}} Dateien | Fehler: {{len(fehler)}}')",
        "print('=' * 62)",
        "",
        "if fehler:",
        "    print('Fehlerhafte Dateien:')",
        "    for f in fehler: print('  - ' + f)",
        "    sys.exit(1)",
        "",
        "print()",
        "print('Naechste Schritte – Befehle auf dem NAS ausfuehren:')",
        "print()",
        "print('  OPTION A – Alles auf einmal (Backend + Frontend):')",
        "print()",
        f"print('  sudo /usr/local/bin/docker compose -f {dc} build')",
        f"print('  sudo /usr/local/bin/docker compose -f {dc} up -d')",
        "print()",
        "print('  OPTION B – Nur Backend (schneller bei reinen Backend-Aenderungen):')",
        "print()",
        f"print('  sudo /usr/local/bin/docker compose -f {dc} build backend')",
        f"print('  sudo /usr/local/bin/docker compose -f {dc} up -d')",
        "print()",
        "print('  OPTION C – Nur Frontend:')",
        "print()",
        f"print('  sudo /usr/local/bin/docker compose -f {dc} build --no-cache frontend')",
        f"print('  sudo /usr/local/bin/docker compose -f {dc} up -d')",
        "print()",
        "print('  Logs pruefen:')",
        "print()",
        "print('  sudo /usr/local/bin/docker logs brdms_backend --tail 40 -f')",
        "print('  sudo /usr/local/bin/docker logs brdms_frontend --tail 20')",
        "print()",
        "print('=' * 62)",
        "print('  Backup & Restore (auf dem NAS ausfuehren):')",
        "print('=' * 62)",
        "print()",
        "print('  Manuelles Backup:')",
        f"print('  sudo bash {NAS_BASE}/backup.sh')",
        "print()",
        "print('  Backup wiederherstellen (interaktiv):')",
        f"print('  sudo bash {NAS_BASE}/restore.sh')",
        "print()",
    ]

    return "\n".join(lines)


# ── Hauptprogramm ─────────────────────────────────────────────────────────────
def main():
    print("=" * 62)
    print("  BR-DMS Komplett-Deploy")
    print("=" * 62)
    print(f"  Ziel : {ZIEL}")
    print(f"  Pfad : {NAS_BASE}")
    print("=" * 62)
    print()

    dateien = sammle_dateien()
    print(f"  {len(dateien)} Dateien werden uebertragen ...\n")

    payload = baue_payload(dateien)

    try:
        subprocess.run(
            ["ssh", ZIEL, "python3 -"],
            input=payload.encode("utf-8"),
            check=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"\nFEHLER: SSH-Fehler (Exit {e.returncode})", file=sys.stderr)
        sys.exit(e.returncode)
    except FileNotFoundError:
        print("FEHLER: 'ssh' nicht gefunden.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
