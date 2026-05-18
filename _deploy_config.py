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
