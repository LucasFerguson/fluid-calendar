#!/usr/bin/env bash
#
# Rebuild and deploy the FluidCalendar archival fork on this homelab box.
#
# Runs the open-source production build and restarts the systemd unit that
# manages the app. The build happens BEFORE the restart, so a failed build
# never takes the running service down. Safe to re-run.
#
# Usage:  scripts/deploy.sh
#
# The production app is managed by systemd, NOT by hand. Do not start/kill
# `next` directly — always deploy through this script (or `systemctl restart
# fluid-calendar-archive.service` for a plain restart without a rebuild).

set -euo pipefail

cd "$(dirname "$0")/.."
SERVICE="fluid-calendar-archive.service"

echo "==> Git state"
git rev-parse --abbrev-ref HEAD
git --no-pager log --oneline -1

echo "==> Applying database migrations (fluidcal)"
npx prisma migrate deploy

echo "==> Regenerating Prisma client"
npm run prisma:generate

echo "==> Building (open-source, SAAS features off)"
npm run build:os

echo "==> Restarting ${SERVICE}"
systemctl restart "${SERVICE}"
sleep 2
systemctl --no-pager --lines=0 status "${SERVICE}" | head -6 || true

echo "==> Smoke test http://localhost:3000"
code=""
for _ in $(seq 1 25); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000 || true)
  case "$code" in
    200|301|302|307|308) echo "OK (HTTP $code)"; exit 0 ;;
  esac
  sleep 1
done
echo "WARN: app did not return a healthy status in time (last: ${code:-none})" >&2
echo "      check: journalctl -u ${SERVICE} -n 50 --no-pager" >&2
exit 1
