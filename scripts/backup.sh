#!/bin/sh
# Nightly Postgres backup: pg_dump -> gzip -> /backups, with retention pruning.
# Runs as a long-lived container (see the `backup` service in
# docker-compose.prod.yml). /backups is bind-mounted to ./backups on the host,
# so copy that directory off-box periodically (scp/rsync) for real safety.
#
# Restore a dump with:
#   gunzip -c backups/arena-YYYYMMDD-HHMMSS.sql.gz | \
#     docker compose --env-file .env.prod -f docker-compose.prod.yml \
#     exec -T postgres psql -U arena -d arena
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
INTERVAL_SEC="${BACKUP_INTERVAL_SEC:-86400}"
HOST="${POSTGRES_HOST:-postgres}"
USER="${POSTGRES_USER:-arena}"
DB="${POSTGRES_DB:-arena}"

mkdir -p /backups

run_backup() {
  ts=$(date +%Y%m%d-%H%M%S)
  out="/backups/arena-${ts}.sql.gz"
  echo "[backup] $(date -u +%FT%TZ) dumping ${DB} -> ${out}"
  if pg_dump -h "${HOST}" -U "${USER}" -d "${DB}" | gzip >"${out}.partial"; then
    mv "${out}.partial" "${out}"
    echo "[backup] wrote ${out} ($(du -h "${out}" | cut -f1))"
  else
    echo "[backup] FAILED — leaving previous backups intact" >&2
    rm -f "${out}.partial"
  fi
  # Prune dumps older than the retention window.
  find /backups -name 'arena-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
}

# Back up immediately on start, then every INTERVAL_SEC (default 24h).
while true; do
  run_backup
  sleep "${INTERVAL_SEC}"
done
