#!/bin/bash
# Nightly logical backup of the fluidcal Postgres database.
# Writes compressed pg_dump custom-format archives to /var/backups/fluidcal
# and prunes backups older than RETAIN_DAYS. Run by the
# fluidcal-db-backup.timer systemd unit (see docs/deploy/).
#
# Restore with:
#   pg_restore -U fluidcal -d fluidcal --clean --if-exists <file>.dump

set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/var/backups/fluidcal}
RETAIN_DAYS=${RETAIN_DAYS:-30}

mkdir -p "$BACKUP_DIR"

STAMP=$(date +%Y-%m-%d_%H%M%S)
OUT="$BACKUP_DIR/fluidcal_$STAMP.dump"

# Custom format (-Fc) is compressed and supports selective pg_restore.
sudo -u postgres pg_dump -Fc fluidcal > "$OUT"

# Prune old backups
find "$BACKUP_DIR" -name "fluidcal_*.dump" -mtime +"$RETAIN_DAYS" -delete

echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
