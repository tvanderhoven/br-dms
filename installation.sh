#!/usr/bin/env bash
# BR-DMS Installationsassistent
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 &>/dev/null; then
  echo "Fehler: python3 nicht gefunden. Bitte Python 3 installieren."
  exit 1
fi

python3 "${DIR}/setup_wizard.py"
