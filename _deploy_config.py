#!/usr/bin/env python3
"""
Zentrale Deploy-Konfiguration – liest NAS_USER, NAS_HOST und DATA_PATH aus der lokalen .env.
Wird von allen deploy_*.py Skripten importiert.
"""
import os

def _load_env():
    env = {}
    base = os.path.dirname(os.path.abspath(__file__))
    p = next((os.path.join(base, n) for n in (".env.deploy", ".env")
               if os.path.exists(os.path.join(base, n))), None)
    if p is None:
        return env
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            env[k.strip()] = v
    return env

_e = _load_env()

NAS_USER = _e.get("NAS_USER", "admin")
NAS_HOST = _e.get("NAS_HOST", "NAS")
ZIEL     = f"{NAS_USER}@{NAS_HOST}"

# DATA_PATH endet OHNE trailing slash – deploy-Skripte haengen selbst / an
DATA_PATH = _e.get("DATA_PATH", "/share/Container/br-dms").rstrip("/")
BASE      = DATA_PATH + "/"


def _docker_bin():
    """docker-Programm auf dem Host: DOCKER_BIN aus .env.deploy, sonst am Pfad
    erkennen (QNAP /share/..., Synology /volume...), sonst einfach 'docker'."""
    if _e.get("DOCKER_BIN"):
        return _e["DOCKER_BIN"]
    if DATA_PATH.startswith("/share/"):
        return "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"
    if DATA_PATH.startswith("/volume"):
        return "/usr/local/bin/docker"
    return "docker"


DOCKER_BIN = _docker_bin()


def lies_dateiliste():
    """Liest deploy_dateien.txt: (alle Eintraege, davon zu ersetzende Ordner)."""
    base = os.path.dirname(os.path.abspath(__file__))
    eintraege, ersetzen = [], []
    with open(os.path.join(base, "deploy_dateien.txt"), encoding="utf-8") as f:
        for zeile in f:
            teile = zeile.split()
            if not teile or teile[0].startswith("#"):
                continue
            eintraege.append(teile[0])
            if len(teile) > 1 and teile[1] == "*":
                ersetzen.append(teile[0])
    return eintraege, ersetzen
