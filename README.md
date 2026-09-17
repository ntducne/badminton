# Cầu. — Quản lý câu lạc bộ cầu lông

Ứng dụng nội bộ giúp một đội cầu lông quản lý thành viên, lịch chơi, điểm danh, khách giao lưu, tồn kho cầu, quỹ chung và quyết toán bằng VietQR.

## Tính năng

- Dashboard theo quý đang hoạt động, gồm quỹ, lịch gần nhất và cảnh báo tồn kho.
- Tạo buổi chơi, điểm danh và tự phân loại nghỉ đúng hạn/nghỉ muộn.
- Quản lý khách giao lưu, chi phí sân/cầu/nước và quyết toán từng người.
- Theo dõi lô cầu theo đơn giá từng quả và lịch sử sử dụng.
- Phân quyền Owner, Admin, Member; công nợ cá nhân được giới hạn theo quyền.
- Sinh VietQR để thu tiền nhanh.

## Chạy local

Yêu cầu Bun 1.3+, Node.js 20+ và MongoDB.

MongoDB phải chạy dưới dạng replica set hoặc sharded cluster để hỗ trợ transaction của luồng quyết toán. Sau khi cập nhật từ phiên bản cũ, chạy migration theo thứ tự:

```bash
bun run migrate:stage1
bun run migrate:stage34:dry
bun run migrate:stage34
bun run migrate:stage567:dry
bun run migrate:stage567
```

Migration Giai đoạn 3–4 mặc định có lệnh dry-run riêng; khi apply, script lưu snapshot các collection tài chính bị tác động vào `migration_backups_stage34` trước khi ghi.
Nếu cần rollback ngay sau migration (trước khi hệ thống nhận giao dịch mới), dùng backup ID được in ra bởi lệnh apply:

```bash
bun run migrate:stage34:rollback -- 'stage34:2026-09-17T00:00:00.000Z'
```

Giai đoạn 5–7 có cơ chế tương tự qua `migrate:stage567:dry`, `migrate:stage567` và `migrate:stage567:rollback -- <backup-id>`.

## Vận hành định kỳ

```bash
bun run check:integrity
bun run backup:db
```

`check:integrity` đối chiếu tồn kho với movement, settlement với movement, số dư ledger và cảnh báo công nợ quá hạn. `backup:db` ghi snapshot JSON cùng manifest vào `BACKUP_DIRECTORY`; nên chạy cả hai bằng cron hằng ngày. Owner có thể xem audit tại `/audit`, và báo cáo quyết toán quý có thể tải dưới dạng CSV tương thích Excel hoặc PDF từ màn hình Thành viên.

```bash
cp .env.example .env.local
bun install
bun run seed
bun run dev
```

Mở `http://localhost:3000`. Tài khoản mẫu được khai báo trong script seed.

## Kiểm tra chất lượng

```bash
bun run check
```

Lệnh trên chạy ESLint, TypeScript, unit test và production build. Các script riêng lẻ: `bun run lint`, `bun run typecheck`, `bun test`, `bun run build`.

## Cấu trúc chính

- `src/app`: App Router pages và Route Handlers.
- `src/components`: navigation, motion và VietQR UI.
- `src/lib`: MongoDB, auth, types và business calculations.
- `tests`: unit test cho quy tắc tài chính/điểm danh.
- `nginx`: cấu hình reverse proxy và trang bảo trì.

## Biến môi trường

Xem [.env.example](./.env.example). Không commit `.env.local` hoặc secret thật vào Git.

Endpoint seed qua HTTP mặc định bị tắt và luôn bị khóa ở production. Chỉ bật `ALLOW_HTTP_SEED=true` trong môi trường phát triển tạm thời; ưu tiên dùng `bun run seed`.
Nếu buộc phải dùng endpoint này ở development, cấu hình thêm `SEED_TOKEN` và gửi token qua header `x-seed-token`.
