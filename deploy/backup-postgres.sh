#!/usr/bin/env bash
# Sao lưu database PostgreSQL ra file dump (custom format) trong backups/.
# Dùng: ./deploy/backup-postgres.sh
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-karaoke-prod}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Không tìm thấy $ENV_FILE. Hãy copy .env.prod.example thành .env.prod trước." >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$BACKUP_DIR/karaoke-$stamp.dump"

echo "Đang dump database..."
docker compose -p "$COMPOSE_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$output"

if [ ! -s "$output" ]; then
    rm -f "$output"
    echo "Dump rỗng hoặc thất bại; đã xoá file. Kiểm tra container postgres còn chạy không." >&2
    exit 1
fi

# Dọn bản cũ hơn RETENTION_DAYS ngày.
find "$BACKUP_DIR" -type f -name 'karaoke-*.dump' -mtime +"$RETENTION_DAYS" -delete

echo "Đã sao lưu: $output ($(du -h "$output" | cut -f1))"
echo "Giữ lại các bản trong $RETENTION_DAYS ngày gần nhất."
