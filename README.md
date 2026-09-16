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

MongoDB phải chạy dưới dạng replica set hoặc sharded cluster để hỗ trợ transaction của luồng quyết toán. Sau khi cập nhật từ phiên bản cũ, chạy migration Giai đoạn 1 một lần:

```bash
bun run migrate:stage1
```

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
