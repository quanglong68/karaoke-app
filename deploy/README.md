# Triển khai production (Phase 5)

Mô hình: **một cổng công khai duy nhất** là nginx của frontend (bind `127.0.0.1:8088`).
Nginx vừa phục vụ file giao diện, vừa chuyển tiếp `/api/` và `/ws-karaoke/` sang backend.
Backend và PostgreSQL **không mở cổng ra ngoài**. HTTPS do lớp phía trước đảm nhận
(Cloudflare Tunnel hoặc Caddy) — nginx không giữ chứng chỉ.

```
Internet ──HTTPS──> Cloudflare Tunnel / Caddy ──HTTP──> frontend nginx :8088
                                                        ├── /            → file tĩnh
                                                        ├── /api/        → backend:8080
                                                        └── /ws-karaoke/ → backend:8080
                                                              backend ──> postgres:5432 (mạng nội bộ)
```

> Backend giữ phòng, phiên đăng nhập, bộ đếm rate-limit và timer trong RAM. Chỉ chạy
> **một instance backend**; restart backend sẽ xoá mọi phòng đang mở (bài hát và tài
> khoản admin vẫn còn trong PostgreSQL). Muốn scale ngang phải chuyển các phần này
> sang Redis hoặc một store dùng chung.

## 1. Chuẩn bị

- Máy chủ Linux có Docker Engine 24+ và Docker Compose v2.
- Tên miền đã trỏ về máy chủ (hoặc về Cloudflare Tunnel).
- Tài khoản Cloudinary (lưu file audio/video bài hát).

```bash
git clone <repo> /opt/karaoke
cd /opt/karaoke
cp .env.prod.example .env.prod
chmod 600 .env.prod
chmod +x deploy/*.sh
```

Sửa `.env.prod`, bắt buộc điền:

| Biến | Ghi chú |
| --- | --- |
| `POSTGRES_PASSWORD` | Mật khẩu mạnh, ví dụ `openssl rand -base64 24` |
| `APP_ALLOWED_ORIGINS` | Đúng origin công khai, ví dụ `https://karaoke.example.com`. Không dùng `*`, không dùng dải LAN |
| `ADMIN_BOOTSTRAP_USERNAME` / `ADMIN_BOOTSTRAP_PASSWORD` | Chỉ dùng ở lần khởi động đầu khi bảng admin còn rỗng; mật khẩu ≥ 12 ký tự |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Lấy trong Dashboard Cloudinary |
| `TRUST_FORWARDED_HEADERS` | Bắt buộc khai báo tường minh. Đặt `true` khi TLS proxy phía trước (Cloudflare Tunnel/Caddy) ghi đè `X-Forwarded-For`; nginx trong compose đã làm việc đó. Nếu chạy backend trực tiếp không qua proxy thì đặt `false` |

Backend sẽ **từ chối khởi động** (fail-fast) nếu profile `prod` thiếu origin https,
bật cookie không-secure, hoặc chưa có admin nào mà cũng không có bootstrap.

## 2. Chạy

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
```

Lần đầu build backend mất vài phút (Maven + Python/librosa). Khi `ps` cho thấy
`karaoke-prod-backend` và `karaoke-prod-postgres` ở trạng thái `healthy` là xong.

Kiểm tra nhanh:

```bash
curl -I http://127.0.0.1:8088/                     # 200, trang chủ SPA
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  exec backend curl -fsS http://127.0.0.1:8080/actuator/health
# {"status":"UP","groups":["liveness","readiness"]}
```

`/actuator/**` chỉ truy cập được từ loopback trong container và bị nginx chặn
(`404`) nếu gọi từ ngoài.

## 3. Gắn HTTPS

Chọn **một** trong hai cách. Cả hai đều trỏ về `http://127.0.0.1:8088`.

### Cách A — Cloudflare Tunnel (không mở cổng 80/443)

```bash
cloudflared tunnel login
cloudflared tunnel create karaoke
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: karaoke
credentials-file: /root/.cloudflared/<uuid>.json
ingress:
  - hostname: karaoke.example.com
    service: http://127.0.0.1:8088
  - service: http_status:404
```

```bash
cloudflared tunnel route dns karaoke karaoke.example.com
systemctl enable --now cloudflared
```

Cloudflare tự đặt header `CF-Connecting-IP`; nginx đã dùng header này để lấy IP thật
cho rate-limit và audit log. nginx chỉ tin header khi kết nối đến từ loopback/Docker
bridge, nên đừng đổi `HTTP_BIND` sang `0.0.0.0` — hãy để TLS proxy là cửa ngõ duy nhất.
Nếu chạy thử nhanh bằng `cloudflared tunnel --url ...`
thì origin tạm thời là một tên miền `trycloudflare.com` — nhớ đổi `APP_ALLOWED_ORIGINS`
tương ứng và khởi động lại backend.

### Cách B — Caddy (tự xin chứng chỉ Let's Encrypt)

`/etc/caddy/Caddyfile`:

```
karaoke.example.com {
    reverse_proxy 127.0.0.1:8088 {
        header_up CF-Connecting-IP {http.request.remote.host}
    }
}
```

`header_up` ở trên ghi đè header mỗi request, nên client không giả mạo được IP.
Sau đó `systemctl reload caddy`.

> Đổi `APP_ALLOWED_ORIGINS` thì phải `docker compose ... up -d backend` để nạp lại.

## 4. Kiểm thử end-to-end (checklist nghiệm thu)

1. Mở `https://karaoke.example.com`, tạo phòng, vào bằng điện thoại — mic hoạt động
   (điện thoại cần HTTPS, xem ghi chú LAN trong `.agents/`).
2. Đăng nhập `/admin` bằng tài khoản bootstrap, sau đó bấm **Đổi mật khẩu** ngay trên
   thanh tiêu đề để đặt mật khẩu riêng (≥ 12 ký tự; hệ thống tự động thu hồi mọi phiên
   khác của tài khoản đó).
3. Upload một bài mới, chờ xử lý xong, bài xuất hiện trong thư viện và chơi được.
4. `docker compose ... restart` → vào lại: phòng cũ không còn (đúng thiết kế),
   **bài hát và tài khoản admin vẫn còn**; lịch sử Flyway không chạy lại.
5. Log audit có sự kiện đăng nhập/đổi mật khẩu/upload/xoá:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs backend \
  | grep 'event='
# event=admin.login.success actor=admin ip=203.0.113.5 ...
# event=admin.password.change actor=admin ip=203.0.113.5 detail=otherSessionsRevoked=...
# event=song.upload.success actor=admin ip=203.0.113.5 detail=songId=...
# event=song.archive actor=admin ip=203.0.113.5 detail=songId=...
```

Không có mật khẩu/token trong log — chỉ username, IP, mã bài.

### Đối soát dữ liệu sau cutover

```bash
./deploy/verify-cutover.sh
# Đổi kỳ vọng khi cần:
SPOT_IDS="S001,S005,S012" EXPECTED_SONGS=12 ./deploy/verify-cutover.sh
```

Script kiểm tra: migration Flyway mới nhất, tổng số bài và số bài `ACTIVE`, 3 bài spot-check
(có lyrics, pitch samples, contour nén, video https), admin đang bật, `/actuator/health`, SPA
qua cổng publish. Kết thúc bằng `KẾT LUẬN: PASS` hoặc liệt kê từng mục `FAIL`.

## 5. Sao lưu & phục hồi

Database là nơi duy nhất chứa dữ liệu cần giữ (bài hát, lời, contour, admin).
File media nằm trên Cloudinary nên **không** nằm trong backup này.

```bash
# Sao lưu thủ công
./deploy/backup-postgres.sh
# → backups/karaoke-<UTC timestamp>.dump, tự xoá bản cũ hơn 14 ngày

# Cron 3h sáng mỗi ngày (giữ 14 ngày)
0 3 * * * /opt/karaoke/deploy/backup-postgres.sh >> /var/log/karaoke-backup.log 2>&1
```

Phục hồi (ghi đè dữ liệu hiện tại, phải gõ `RESTORE`):

```bash
./deploy/restore-postgres.sh backups/karaoke-20261109T030000Z.dump
```

Script tự dừng frontend/backend, chạy `pg_restore --clean --if-exists`, rồi bật lại.
Sau khi phục hồi, mở `/admin` kiểm tra số bài và đăng nhập được.

Nên copy `backups/` sang máy khác (rclone, scp, hoặc Cloudflare R2) — backup cùng ổ
với database không cứu được khi ổ hỏng.

## 6. Cập nhật phiên bản & rollback

```bash
git fetch && git checkout <tag>
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

- Flyway chỉ chạy migration mới; migration đã áp dụng thì không sửa file cũ.
- Rollback code: `git checkout <tag-trước>` rồi build lại. Nếu migration mới không
  tương thích ngược, cần phục hồi database từ dump chụp **trước** khi nâng cấp.
- Trước mỗi lần nâng cấp: chạy `./deploy/backup-postgres.sh`.

## 7. Ghi chú Phase 6 (chuyển dữ liệu)

`data/songs.json` (12 bài cũ) đã nằm trong image backend. Bộ import mặc định tắt
(`APP_LEGACY_IMPORT_ENABLED=false`) và idempotent (bỏ qua bài đã có ID).
Khi cutover, bật một lần:

```bash
# trong .env.prod
APP_LEGACY_IMPORT_ENABLED=true
# khởi động lại backend, xem log "Legacy song import finished: N new songs"
# rồi đặt lại false để tránh chạy lại mỗi lần restart
```
