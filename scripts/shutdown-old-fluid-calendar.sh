#!/bin/bash
# Safely shut down the OLD FluidCalendar instance running from /opt/fluid-calendar.
#
# What starts it: the systemd unit `fluid-calendar.service`
#   (/etc/systemd/system/fluid-calendar.service), enabled at boot, running
#   `npm run start` in /opt/fluid-calendar on port 3000. There are no cron
#   jobs or other autostart mechanisms for it on this box.
#
# What this script does:
#   1. stops the service (frees port 3000)
#   2. disables it so it does NOT come back on reboot
# What it does NOT touch:
#   - PostgreSQL (the new instance uses the same Postgres server, different DB)
#   - the /opt/fluid-calendar files or the old `fluiddb` database
#     (kept as-is so data can still be recovered/compared later)
#
# Usage: sudo bash scripts/shutdown-old-fluid-calendar.sh

set -euo pipefail

SERVICE=fluid-calendar.service

echo "== Current state =="
systemctl status "$SERVICE" --no-pager --lines=0 || true
echo

echo "== Stopping $SERVICE (frees port 3000) =="
systemctl stop "$SERVICE"

echo "== Disabling $SERVICE (won't restart on reboot) =="
systemctl disable "$SERVICE"

echo
echo "== Verifying port 3000 is free =="
if ss -ltn 'sport = :3000' | grep -q 3000; then
  echo "WARNING: something is still listening on :3000:"
  ss -ltnp 'sport = :3000'
  exit 1
else
  echo "Port 3000 is free."
fi

echo
echo "Done. The old app is stopped and disabled."
echo "  - Old files remain at /opt/fluid-calendar (untouched)"
echo "  - Old database 'fluiddb' remains in Postgres (untouched)"
echo "  - To undo: sudo systemctl enable --now $SERVICE"
