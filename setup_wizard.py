#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BR-DMS Installationsassistent
Führt durch die Erstkonfiguration und erstellt:
  • .env     – lokal (für Deploy-Skripte auf diesem Rechner)
  • nas.env  – vollständig (für das NAS, per SCP übertragen)
"""

import os, sys, re, secrets, string, getpass, subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LOCAL_ENV  = SCRIPT_DIR / ".env"
NAS_ENV    = SCRIPT_DIR / "nas.env"

# ── ANSI-Farben ───────────────────────────────────────────────────────────────
BOLD = "\033[1m"; RESET = "\033[0m"
GREEN = "\033[92m"; YEL = "\033[93m"; RED = "\033[91m"
CYAN = "\033[96m"; GRAY = "\033[90m"; DIM = "\033[2m"; MAG = "\033[95m"

def c(t, col): return f"{col}{t}{RESET}"
def ok(t):    print(f"  {c('✓', GREEN)} {t}")
def warn(t):  print(f"  {c('⚠', YEL)} {t}")
def err(t):   print(f"  {c('✗', RED)} {t}")
def note(t):  print(f"  {c('→', CYAN)} {t}")
def hr():     print(c("─" * 64, GRAY))

def section(n, title, color=CYAN):
    print()
    hr()
    print(f"  {c(f'SCHRITT {n}', DIM)}   {c(title, BOLD + color)}")
    hr()

def ask(label, default=None, secret=False, required=True):
    hint = f" {c('[' + str(default) + ']', DIM)}" if default is not None else ""
    prompt = f"  {label}{hint}: "
    while True:
        try:
            val = (getpass.getpass if secret else input)(prompt)
            if not secret:
                val = val.strip()
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(0)
        if val == "" and default is not None:
            return str(default)
        if val:
            return val
        if not required:
            return ""
        print(c("    ↳ Pflichtfeld – bitte eingeben.", RED))

def ask_yn(label, default=True):
    hint = c("J/n" if default else "j/N", DIM)
    try:
        val = input(f"  {label} [{hint}]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        sys.exit(0)
    return default if val == "" else val in ("j", "ja", "y", "yes", "1")

def ask_pw(label, min_len=8):
    while True:
        pw1 = ask(label, secret=True)
        if len(pw1) < min_len:
            print(c(f"    ↳ Mind. {min_len} Zeichen erforderlich.", RED))
            continue
        pw2 = ask("Passwort wiederholen", secret=True)
        if pw1 == pw2:
            return pw1
        print(c("    ↳ Passworte stimmen nicht überein.", RED))

def gen_hex(n=32):
    return secrets.token_hex(n)

def gen_pw(length=22):
    abc = string.ascii_letters + string.digits + "-_!@$%"
    return "".join(secrets.choice(abc) for _ in range(length))

def load_env(path):
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def ssh_query_id(user, host):
    """Versucht PUID/PGID via SSH zu ermitteln. Gibt (uid, gid) oder None zurück."""
    try:
        r = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=6",
             "-o", "StrictHostKeyChecking=accept-new",
             f"{user}@{host}", "id"],
            capture_output=True, text=True, timeout=12
        )
        if r.returncode == 0:
            m_uid = re.search(r"uid=(\d+)", r.stdout)
            m_gid = re.search(r"gid=(\d+)", r.stdout)
            if m_uid and m_gid:
                return m_uid.group(1), m_gid.group(1)
    except Exception:
        pass
    return None

def validate_email(email):
    return re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email) is not None

# ── HAUPTPROGRAMM ─────────────────────────────────────────────────────────────

def main():
    os.system("")  # Windows ANSI-Aktivierung (schadet auf Linux nicht)

    print()
    print(c("═" * 64, BOLD + CYAN))
    print(c("  BR-DMS Installationsassistent", BOLD + CYAN))
    print(c("═" * 64, BOLD + CYAN))
    print()
    print("  Dieses Skript führt dich durch die Erstkonfiguration")
    print("  und erstellt am Ende zwei Dateien:")
    print()
    print(f"  {c('.env', YEL)}     – lokal, für die Deploy-Skripte auf diesem Rechner")
    print(f"  {c('nas.env', YEL)} – vollständig, wird per SCP auf das NAS kopiert")
    print()
    warn("ENCRYPTION_KEY  sichern! Ohne ihn sind alle Dokumente verloren.")
    print()

    # Bestehende .env als Quelle für Voreinstellungen
    existing = load_env(LOCAL_ENV)
    existing_nas = load_env(NAS_ENV) if NAS_ENV.exists() else {}
    defaults = {**existing_nas, **existing}  # lokale .env überschreibt nas.env bei Überschneidungen

    if LOCAL_ENV.exists() or NAS_ENV.exists():
        note("Bestehende Konfiguration gefunden – Werte als Voreinstellungen geladen.")

    # ─────────────────────────────────────────────────────────────────────────
    # Schritt 1: Zielsystem
    # ─────────────────────────────────────────────────────────────────────────
    section(1, "Zielsystem wählen")
    print()
    print(f"  {c('[1]', BOLD)} Synology NAS   (Container Manager, /volume1/docker/...)")
    print(f"  {c('[2]', BOLD)} QNAP NAS        (Container Station, /share/Container/...)")
    print()

    while True:
        wahl = ask("Auswahl", default="1")
        if wahl in ("1", "2"):
            break
        print(c("    ↳ Bitte 1 oder 2 eingeben.", RED))

    if wahl == "1":
        plattform     = "SYNOLOGY"
        data_path_def = "/volume1/docker/br-dms"
        puid_def      = "1026"
        docker_cmd    = "sudo /usr/local/bin/docker"
    else:
        plattform     = "QNAP"
        data_path_def = "/share/Container/br-dms"
        puid_def      = "1000"
        pgid_def      = "100"
        docker_cmd    = "sudo docker"

    ok(f"Zielsystem: {c(plattform, BOLD)}")

    # ─────────────────────────────────────────────────────────────────────────
    # Schritt 2: NAS-Zugangsdaten
    # ─────────────────────────────────────────────────────────────────────────
    section(2, "NAS-Zugangsdaten")
    print()

    nas_ip   = ask("IP-Adresse des NAS",   default=defaults.get("NAS_IP", defaults.get("NAS_HOST", "192.168.1.100")))
    nas_user = ask("SSH-Benutzername",      default=defaults.get("NAS_USER", "admin"))
    data_path = ask("Datenpfad auf dem NAS", default=data_path_def)
    print()
    auto_puid = ask_yn("PUID/PGID automatisch per SSH ermitteln?", default=True)
    puid = pgid = None
    if auto_puid:
        print()
        note(f"Verbinde mit {nas_user}@{nas_ip} …")
        result = ssh_query_id(nas_user, nas_ip)
        if result:
            puid, pgid = result
            ok(f"PUID={c(puid, BOLD)}   PGID={c(pgid, BOLD)}")
        else:
            warn("SSH-Abfrage fehlgeschlagen – bitte manuell eingeben.")
            print("  (Tipp: auf dem NAS per SSH einloggen und 'id' ausführen)")

    if not puid:
        print()
        puid = ask("PUID (User-ID auf dem NAS)", default=puid_def)
        pgid = ask("PGID (Gruppen-ID)",           default="100")

    # ─────────────────────────────────────────────────────────────────────────
    # Schritt 3: Sicherheitsschlüssel
    # ─────────────────────────────────────────────────────────────────────────
    section(3, "Sicherheitsschlüssel", color=YEL)
    print()

    existing_jwt = defaults.get("JWT_SECRET", "")
    existing_enc = defaults.get("ENCRYPTION_KEY", "")
    existing_dbpw = defaults.get("POSTGRES_PASSWORD", "")

    has_secrets = (len(existing_jwt) == 64 and len(existing_enc) == 64)

    if has_secrets:
        note("Bestehende Schlüssel gefunden.")
        keep_secrets = ask_yn("Bestehende Schlüssel behalten?", default=True)
        if keep_secrets:
            jwt_secret     = existing_jwt
            encryption_key = existing_enc
            ok("JWT_SECRET:      " + c(jwt_secret[:16] + "…", DIM))
            ok("ENCRYPTION_KEY:  " + c(encryption_key[:16] + "…", DIM))
        else:
            jwt_secret     = gen_hex()
            encryption_key = gen_hex()
            ok("JWT_SECRET:      " + c(jwt_secret[:16] + "…  (neu generiert)", GREEN))
            ok("ENCRYPTION_KEY:  " + c(encryption_key[:16] + "…  (neu generiert)", GREEN))
    else:
        jwt_secret     = gen_hex()
        encryption_key = gen_hex()
        ok("JWT_SECRET:      " + c(jwt_secret[:16] + "…  (automatisch generiert)", GREEN))
        ok("ENCRYPTION_KEY:  " + c(encryption_key[:16] + "…  (automatisch generiert)", GREEN))

    print()
    warn(c("ENCRYPTION_KEY separat sichern (Passwortmanager o.ä.)!", BOLD))
    warn("Verlust = alle Dokumente sind dauerhaft nicht mehr lesbar.")

    print()
    if existing_dbpw and len(existing_dbpw) >= 12:
        keep_dbpw = ask_yn("Bestehendes Datenbankpasswort behalten?", default=True)
        if keep_dbpw:
            db_password = existing_dbpw
        else:
            db_password = gen_pw(24)
            ok(f"POSTGRES_PASSWORD: {c(db_password, BOLD)}")
    else:
        gen_or_own = ask_yn("Datenbankpasswort automatisch generieren?", default=True)
        if gen_or_own:
            db_password = gen_pw(24)
        else:
            db_password = ask_pw("Datenbankpasswort (mind. 12 Zeichen)", min_len=12)
        ok(f"POSTGRES_PASSWORD: {c(db_password, BOLD)}")

    # ─────────────────────────────────────────────────────────────────────────
    # Schritt 4: Administrator-Konto
    # ─────────────────────────────────────────────────────────────────────────
    section(4, "Administrator-Konto")
    print()
    print("  Das ist der erste Login-Account nach der Installation.")
    print()

    admin_email_def = defaults.get("ADMIN_EMAIL", "admin@br-dms.lokal")
    admin_email = ask("Admin E-Mail-Adresse", default=admin_email_def)
    while not validate_email(admin_email):
        print(c("    ↳ Keine gültige E-Mail-Adresse.", RED))
        admin_email = ask("Admin E-Mail-Adresse", default=admin_email_def)

    print()
    admin_pw = ask_pw("Admin-Passwort (mind. 8 Zeichen)", min_len=8)
    ok(f"Admin-Konto: {c(admin_email, BOLD)}")

    # ─────────────────────────────────────────────────────────────────────────
    # Schritt 5: Ports
    # ─────────────────────────────────────────────────────────────────────────
    section(5, "Ports")
    print()

    frontend_port = ask("Frontend-Port", default=defaults.get("FRONTEND_PORT", "3000"))
    backend_port  = ask("Backend-Port",  default=defaults.get("BACKEND_PORT",  "4000"))

    # ─────────────────────────────────────────────────────────────────────────
    # Schritt 6: E-Mail (Passwort-Reset)
    # ─────────────────────────────────────────────────────────────────────────
    section(6, "E-Mail (Passwort-Reset) – optional")
    print()
    print("  Ermöglicht das Zurücksetzen vergessener Passwörter per E-Mail.")
    print()

    smtp_configured = ask_yn("E-Mail konfigurieren?", default=bool(defaults.get("SMTP_HOST")))

    if smtp_configured:
        smtp_host = ask("SMTP-Server",    default=defaults.get("SMTP_HOST", "smtp.ionos.de"))
        smtp_port = ask("SMTP-Port",      default=defaults.get("SMTP_PORT", "587"))
        smtp_user = ask("SMTP-Benutzername (E-Mail-Adresse)", default=defaults.get("SMTP_USER", ""))
        smtp_pass = ask("SMTP-Passwort", secret=True)
        smtp_from = ask("Absender-Name",  default=defaults.get("SMTP_FROM", f"BR-DMS <{smtp_user}>"))
        ok("E-Mail konfiguriert.")
    else:
        smtp_host = smtp_port = smtp_user = smtp_pass = smtp_from = ""
        note("E-Mail übersprungen – kann später in der .env auf dem NAS ergänzt werden.")

    # ─────────────────────────────────────────────────────────────────────────
    # Schritt 7: WatchFolder
    # ─────────────────────────────────────────────────────────────────────────
    section(7, "WatchFolder (automatischer Dokumentenimport)")
    print()
    print("  Der WatchFolder überwacht einen Netzwerkordner und importiert")
    print("  neue Dateien automatisch als Dokumente.")
    print()

    wf_default = defaults.get("WATCH_FOLDER_ENABLED", "false").lower() == "true"
    wf_enabled = ask_yn("WatchFolder aktivieren?", default=wf_default)

    if wf_enabled:
        print()
        warn("Nach dem ersten Start die SYSTEM_USER_ID aus der Benutzerverwaltung")
        warn("im System holen und in der nas.env auf dem NAS nachtragen.")
        system_user_id = defaults.get("SYSTEM_USER_ID", "")
        if system_user_id:
            keep_uid = ask_yn(f"Bestehende SYSTEM_USER_ID behalten ({system_user_id[:8]}…)?", default=True)
            if not keep_uid:
                system_user_id = ""
    else:
        system_user_id = defaults.get("SYSTEM_USER_ID", "")

    # ─────────────────────────────────────────────────────────────────────────
    # Schritt 8: Zusammenfassung & Dateien schreiben
    # ─────────────────────────────────────────────────────────────────────────
    section(8, "Zusammenfassung")
    print()

    rows = [
        ("Zielsystem",         plattform),
        ("NAS-IP",             nas_ip),
        ("SSH-Benutzer",       nas_user),
        ("DATA_PATH",          data_path),
        ("PUID / PGID",        f"{puid} / {pgid}"),
        ("Frontend-Port",      frontend_port),
        ("Backend-Port",       backend_port),
        ("JWT_SECRET",         jwt_secret[:16] + "…"),
        ("ENCRYPTION_KEY",     encryption_key[:16] + "…"),
        ("POSTGRES_PASSWORD",  db_password[:6] + "…"),
        ("Admin-E-Mail",       admin_email),
        ("Admin-Passwort",     "●●●●●●●●"),
        ("E-Mail (SMTP)",      smtp_host if smtp_configured else "nicht konfiguriert"),
        ("WatchFolder",        "aktiviert" if wf_enabled else "deaktiviert"),
    ]

    label_w = max(len(r[0]) for r in rows) + 2
    for label, val in rows:
        pad = " " * (label_w - len(label))
        print(f"  {c(label, DIM)}{pad}{c(val, BOLD)}")

    print()
    if not ask_yn("Dateien jetzt schreiben?", default=True):
        print()
        note("Abgebrochen – keine Dateien geschrieben.")
        sys.exit(0)

    # ── nas.env schreiben ────────────────────────────────────────────────────
    smtp_block = ""
    if smtp_configured:
        smtp_block = f"""
# --- E-Mail (Passwort-Reset) ------------------------------------
SMTP_HOST={smtp_host}
SMTP_PORT={smtp_port}
SMTP_USER={smtp_user}
SMTP_PASS={smtp_pass}
SMTP_FROM={smtp_from}
"""
    else:
        smtp_block = """
# --- E-Mail (Passwort-Reset) ------------------------------------
# Zum Aktivieren auskommentieren und Werte eintragen:
# SMTP_HOST=smtp.ionos.de
# SMTP_PORT=587
# SMTP_USER=deine@domain.de
# SMTP_PASS=dein-passwort
# SMTP_FROM=BR-DMS <deine@domain.de>
"""

    nas_env_content = f"""\
# ================================================================
#  BR-DMS – Konfiguration für das NAS
#  Erzeugt von setup_wizard.py – auf das NAS kopieren als .env
#  Pfad auf dem NAS: {data_path}/.env
# ================================================================

# --- Plattform ({plattform}) ----------------------------------------
DATA_PATH={data_path}
NAS_USER={nas_user}
NAS_HOST={nas_ip}
NAS_IP={nas_ip}
PUID={puid}
PGID={pgid}

# --- Datenbank --------------------------------------------------
POSTGRES_USER=brdms
POSTGRES_PASSWORD={db_password}
POSTGRES_DB=brdms

# --- Backend ----------------------------------------------------
NODE_ENV=production
BACKEND_PORT={backend_port}

# JWT-Secret (NICHT verlieren, niemals teilen)
JWT_SECRET={jwt_secret}

# AES-256-Schlüssel – BACKUP PFLICHT!
# Verlust = alle Dokumente dauerhaft unlesbar
ENCRYPTION_KEY={encryption_key}

# Intern im Container – nicht ändern
STORAGE_PATH=/data/storage

# --- Frontend ---------------------------------------------------
FRONTEND_PORT={frontend_port}
APP_URL=http://{nas_ip}:{frontend_port}
{smtp_block}
# --- Watch-Folder -----------------------------------------------
WATCH_FOLDER=/data/watch_inbox
WATCH_FOLDER_ENABLED={'true' if wf_enabled else 'false'}
# UUID des Admin-Benutzers (nach erstem Login in Benutzerverwaltung ermitteln)
SYSTEM_USER_ID={system_user_id}

# --- Admin-Seed (wird beim ersten 'prisma db seed' verwendet) ---
ADMIN_EMAIL={admin_email}
ADMIN_PASSWORD={admin_pw}
"""

    NAS_ENV.write_text(nas_env_content, encoding="utf-8")
    ok(f"nas.env  geschrieben → {c(str(NAS_ENV), BOLD)}")

    # ── lokale .env schreiben ────────────────────────────────────────────────
    local_env_content = f"""\
# ================================================================
#  BR-DMS – Lokale .env für Deploy-Skripte
#  Nur auf diesem Rechner – keine Secrets!
# ================================================================

DATA_PATH={data_path}
NAS_USER={nas_user}
NAS_HOST={nas_ip}
NAS_IP={nas_ip}
PUID={puid}
PGID={pgid}
BACKEND_PORT={backend_port}
FRONTEND_PORT={frontend_port}
"""
    LOCAL_ENV.write_text(local_env_content, encoding="utf-8")
    ok(f".env     geschrieben → {c(str(LOCAL_ENV), BOLD)}")

    # ─────────────────────────────────────────────────────────────────────────
    # Schritt 9: Nächste Schritte
    # ─────────────────────────────────────────────────────────────────────────
    section(9, "Nächste Schritte", color=GREEN)
    print()

    dc_file = f"{data_path}/docker-compose.yml"

    steps = [
        ("Verzeichnisse auf dem NAS anlegen",
         f'ssh {nas_user}@{nas_ip} "mkdir -p {data_path}/{{storage,postgres,logs,watch_inbox}}"'),
        ("nas.env auf das NAS kopieren",
         f"scp {NAS_ENV} {nas_user}@{nas_ip}:{data_path}/.env"),
        ("Quelldateien deployen",
         f"python3 {SCRIPT_DIR}/deploy_komplett.py"),
        ("Container bauen (Erstinstallation – Option A)",
         f"{docker_cmd} compose -f {dc_file} build"),
        ("Container starten",
         f"{docker_cmd} compose -f {dc_file} up -d"),
        ("Admin-Benutzer anlegen (einmalig)",
         f"{docker_cmd} exec brdms_backend npx prisma db seed"),
        ("System aufrufen",
         f"http://{nas_ip}:{frontend_port}"),
    ]

    for i, (titel, befehl) in enumerate(steps, 1):
        print(f"  {c(str(i) + '.', BOLD + CYAN)} {titel}")
        print(f"     {c(befehl, YEL)}")
        print()

    if wf_enabled:
        print()
        warn("WatchFolder: Nach dem ersten Login SYSTEM_USER_ID aus der Benutzerverwaltung")
        warn(f"holen und in {data_path}/.env auf dem NAS eintragen, dann Backend neu starten:")
        print(f"     {c(docker_cmd + ' compose -f ' + dc_file + ' restart backend', YEL)}")
        print()

    hr()
    print()
    ok(c("Fertig! Viel Erfolg mit der Installation.", BOLD + GREEN))
    print()


if __name__ == "__main__":
    main()
