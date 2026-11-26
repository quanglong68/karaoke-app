#!/usr/bin/env bash
# Phục hồi database từ file dump do backup-postgres.sh tạo ra.
# CẢNH BÁO: ghi đè toàn bộ dữ liệu hiện tại. Phải gõ RESTORE để xác nhận.
# Dùng: ./deploy/restore-postgres.sh backups/karaoke-20261109T030000Z.dump
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-karaoke-prod}"

if [ "$#" -ne 1 ]; then
    echo "Dùng: $0 <file-backup.dump>" >&2
    exit 1
fi

backup_file="$1"
if [ ! -s "$backup_file" ]; then
    echo "Không tìm thấy file backup '$backup_file' hoặc file rỗng." >&2
    exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
    echo "Không tìm thấy $ENV_FILE." >&2
    exit 1
fi

echo "Bạn sắp GHI ĐÈ database bằng: $backup_file"
echo "Ứng dụng sẽ bị dừng trong lúc phục hồi."
read -r -p "Gõ RESTORE để tiếp tục: " answer
if [ "$answer" != "RESTORE" ]; then
    echo "Đã huỷ."
    exit 1
fi

compose() {
    docker compose -p "$COMPOSE_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "Dừng frontend và backend..."
compose stop frontend backend

echo "Đang phục hồi..."
restore_failed=0
if ! compose exec -T postgres \
    sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction --exit-on-error' < "$backup_file"; then
    restore_failed=1
    echo "Phục hồi thất bại; database có thể chưa ở trạng thái mong muốn." >&2
fi

echo "Khởi động lại..."
compose start backend frontend

if [ "$restore_failed" -ne 0 ]; then
    echo "Kiểm tra log backend trước khi tiếp tục sử dụng." >&2
    exit 1
fi

echo "Xong. Kiểm tra sức khoẻ:"
echo "  docker compose --env-file .env.prod -f docker-compose.prod.yml ps"
