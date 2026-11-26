#!/usr/bin/env bash
# Đối soát dữ liệu sau khi import/cutover lên database production.
# Dùng:
#   ./deploy/verify-cutover.sh
#   SPOT_IDS="S001,S005,S012" EXPECTED_SONGS=12 ./deploy/verify-cutover.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-karaoke-prod}"
EXPECTED_SONGS="${EXPECTED_SONGS:-12}"
SPOT_IDS="${SPOT_IDS:-S001,S005,S012}"

if ! [[ "$SPOT_IDS" =~ ^[A-Za-z0-9]+(,[A-Za-z0-9]+)*$ ]]; then
    echo "SPOT_IDS không hợp lệ (chỉ cho phép chữ, số và dấu phẩy): $SPOT_IDS" >&2
    exit 1
fi
SPOT_COUNT="$(printf '%s' "$SPOT_IDS" | awk -F, '{print NF}')"

if [ ! -f "$ENV_FILE" ]; then
    echo "Không tìm thấy $ENV_FILE." >&2
    exit 1
fi

compose() {
    docker compose -p "$COMPOSE_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

run_sql() {
    printf '%s\n' "$1" | compose exec -T postgres \
        sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -F "|" -v ON_ERROR_STOP=1'
}

failures=0
check_pass() { echo "  [OK]   $1"; }
check_fail() { echo "  [FAIL] $1"; failures=$((failures + 1)); }

echo "== Tổng duyệt cutover (project: $COMPOSE_PROJECT) =="

if ! compose ps --status running --services 2>/dev/null | grep -qx backend; then
    echo "Backend chưa chạy. Bật stack trước: docker compose -p $COMPOSE_PROJECT --env-file $ENV_FILE -f $COMPOSE_FILE up -d"
    exit 1
fi

echo "-- Flyway"
flyway_row="$(run_sql "select version || '|' || success from flyway_schema_history order by installed_rank desc limit 1")"
if [ -z "$flyway_row" ]; then
    check_fail "flyway_schema_history rỗng (migration chưa chạy?)"
else
    version="${flyway_row%%|*}"
    success="${flyway_row##*|}"
    if [ "$success" = "t" ] || [ "$success" = "true" ]; then
        check_pass "migration mới nhất: V$version"
    else
        check_fail "migration V$version có success=false"
    fi
fi
flyway_failed="$(run_sql "select count(*) from flyway_schema_history where success = false")"
if [ "${flyway_failed:-1}" = "0" ]; then
    check_pass "không có migration nào success=false"
else
    check_fail "có ${flyway_failed:-?} migration success=false"
fi

echo "-- Bài hát"
counts="$(run_sql "select count(*), count(*) filter (where status = 'ACTIVE') from songs")"
total="${counts%%|*}"
active="${counts##*|}"
if [ "$total" = "$EXPECTED_SONGS" ]; then
    check_pass "tổng số bài = $total (kỳ vọng $EXPECTED_SONGS)"
else
    check_fail "tổng số bài = ${total:-?} (kỳ vọng $EXPECTED_SONGS)"
fi
if [ "${active:-0}" -ge "${EXPECTED_SONGS:-1}" ]; then
    check_pass "bài ACTIVE = $active"
else
    check_fail "bài ACTIVE = ${active:-?} (thiếu so với $EXPECTED_SONGS)"
fi

echo "-- Spot-check: $SPOT_IDS"
ids_sql="'$(printf '%s' "$SPOT_IDS" | sed "s/,/','/g")'"
spot_sql="select s.id || '|' || length(s.lyrics) || '|' || c.sample_count || '|' || octet_length(c.contour_data) || '|' || c.encoding || '|' || case when s.video_url like 'https://%' then 'https' else 'invalid' end
from songs s join song_pitch_contours c on c.song_id = s.id
where s.id in ($ids_sql) order by s.id"
spot_rows="$(run_sql "$spot_sql")"
if [ -z "$spot_rows" ]; then
    check_fail "không tìm thấy bài nào trong danh sách spot-check"
else
    spot_found="$(printf '%s\n' "$spot_rows" | sed '/^$/d' | wc -l | tr -d ' ')"
    if [ "${spot_found:-0}" -lt "$SPOT_COUNT" ]; then
        check_fail "spot-check chỉ trả về ${spot_found:-0}/$SPOT_COUNT ID yêu cầu"
    fi
    while IFS='|' read -r id lyrics_len samples contour_bytes encoding video; do
        [ -z "$id" ] && continue
        problems=""
        [ "${lyrics_len:-0}" -ge 50 ] || problems="$problems lyrics=${lyrics_len:-0}"
        [ "${samples:-0}" -ge 1 ] || problems="$problems samples=${samples:-0}"
        [ "${contour_bytes:-0}" -ge 1 ] || problems="$problems contour=${contour_bytes:-0}"
        case "$encoding" in
            GZIP*) ;;
            *) problems="$problems encoding=${encoding:-?}" ;;
        esac
        [ "$video" = "https" ] || problems="$problems video=${video:-?}"
        if [ -z "$problems" ]; then
            check_pass "$id: lyrics ${lyrics_len} ký tự, ${samples} mẫu pitch, contour ${contour_bytes} B, video https"
        else
            check_fail "$id:$problems"
        fi
    done <<< "$spot_rows"
fi

echo "-- Tài khoản quản trị"
admin_count="$(run_sql "select count(*) from admins where enabled")"
if [ "${admin_count:-0}" -ge 1 ]; then
    check_pass "admin đang bật = $admin_count"
else
    check_fail "không có admin nào đang bật"
fi

echo "-- Sức khoẻ dịch vụ"
if compose exec -T backend curl -fsS http://127.0.0.1:8080/actuator/health | grep -q '"status":"UP"'; then
    check_pass "backend /actuator/health = UP"
else
    check_fail "backend /actuator/health không UP"
fi

published="$(compose port frontend 80 2>/dev/null | head -n1)"
if [ -n "$published" ]; then
    if curl -fsS -o /dev/null "http://$published/"; then
        check_pass "frontend trả SPA tại http://$published/"
    else
        check_fail "frontend không phản hồi tại http://$published/"
    fi
else
    check_fail "không đọc được cổng publish của frontend"
fi

echo
if [ "$failures" -eq 0 ]; then
    echo "KẾT LUẬN: PASS — dữ liệu và dịch vụ khớp kỳ vọng."
    exit 0
fi
echo "KẾT LUẬN: FAIL — $failures mục cần kiểm tra lại."
exit 1
