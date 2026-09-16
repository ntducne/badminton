# Kế hoạch nâng cấp logic toàn diện

## 1. Mục tiêu

Nâng cấp ứng dụng từ công cụ theo dõi nội bộ thành hệ thống quản lý câu lạc bộ có thể:

- Đối soát chính xác quỹ, công nợ và tồn kho.
- Quyết toán an toàn, không phát sinh giao dịch trùng.
- Hoàn tác nghiệp vụ mà không làm mất lịch sử.
- Kiểm soát chặt quyền truy cập và dữ liệu đầu vào.
- Vận hành ổn định khi có nhiều quản trị viên thao tác đồng thời.

## 2. Nguyên tắc triển khai

- Dữ liệu nghiệp vụ gốc và dữ liệu tính toán phải được phân biệt rõ.
- Giao dịch đã ghi sổ không bị sửa hoặc xóa; sai lệch được xử lý bằng bút toán đảo hoặc điều chỉnh.
- Các thay đổi liên quan đồng thời đến buổi chơi, kho, quỹ và audit phải nằm trong một MongoDB transaction.
- Mọi API ghi dữ liệu phải có authentication, authorization và Zod validation.
- Mỗi giai đoạn phải hoàn thành migration, API, UI và test trước khi chuyển sang giai đoạn tiếp theo.
- Không triển khai thêm tính năng tài chính mới trước khi hoàn thành cơ chế quyết toán an toàn.

## Tiến độ thực hiện

| Giai đoạn | Trạng thái | Ngày cập nhật |
|---|---|---|
| Giai đoạn 1 — Bảo toàn dữ liệu và quyết toán an toàn | ✅ Hoàn thành | 2026-09-17 |
| Giai đoạn 2 — Validation và bảo mật API | ✅ Hoàn thành | 2026-09-17 |
| Giai đoạn 3 — Sổ cái quỹ thống nhất | Chưa thực hiện | — |
| Giai đoạn 4 — Thanh toán và công nợ | Chưa thực hiện | — |
| Giai đoạn 5 — Sổ biến động kho cầu | Chưa thực hiện | — |
| Giai đoạn 6 — Quyết toán thành viên theo quý | Chưa thực hiện | — |
| Giai đoạn 7 — Đồng thời, audit và vận hành | Chưa thực hiện | — |

## 3. Giai đoạn 1 — Bảo toàn dữ liệu và quyết toán an toàn ✅

> Hoàn thành ngày 2026-09-17. Đã triển khai state machine, optimistic version, MongoDB transaction, settlement snapshot, idempotency, kiểm tra tồn kho, bút toán đảo kho/quỹ, audit và khóa các mutation sai trạng thái. Migration `migrate:stage1` đã chạy thành công trên `badminton_db`; MongoDB hiện chạy replica set `rs0` và hỗ trợ transaction.

### 3.1. Chuẩn hóa trạng thái buổi chơi

Áp dụng state machine:

```text
DRAFT → OPEN → LOCKED → SETTLED
             ↘ CANCELLED
SETTLED → REOPENED → OPEN
```

Ý nghĩa:

- `DRAFT`: đang chuẩn bị, chưa mở điểm danh.
- `OPEN`: thành viên có thể xác nhận tham gia hoặc báo nghỉ.
- `LOCKED`: buổi đã khóa; chỉ quản trị viên được điều chỉnh.
- `SETTLED`: đã quyết toán và dữ liệu nghiệp vụ bị khóa.
- `REOPENED`: đã mở lại từ một lần quyết toán trước.
- `CANCELLED`: buổi bị hủy và được xử lý theo chính sách hủy sân.

Chỉ cho phép các chuyển trạng thái hợp lệ ở server. Loại bỏ việc dùng đồng thời `status` và `isSettled` làm hai nguồn sự thật độc lập.

### 3.2. Xây dựng settlement service

Quyết toán phải thực hiện trong một MongoDB transaction:

1. Đọc session và kiểm tra phiên bản.
2. Kiểm tra trạng thái cho phép quyết toán.
3. Kiểm tra người tham gia, chi phí và tồn kho.
4. Tính lại toàn bộ số liệu trên server.
5. Trừ tồn kho cầu.
6. Tạo các khoản phải thu/phải trả.
7. Tạo bút toán quỹ.
8. Lưu snapshot quyết toán.
9. Ghi audit log.
10. Commit đồng thời hoặc rollback toàn bộ.

### 3.3. Bảo đảm idempotency

- Mỗi lần quyết toán có một `settlementId` duy nhất.
- Mọi bút toán quỹ và giao dịch kho gắn với `settlementId`.
- Gọi lại cùng một yêu cầu quyết toán không được tạo thêm tác động.
- Tạo unique index cho các tổ hợp nghiệp vụ quan trọng.
- Hai quản trị viên quyết toán đồng thời chỉ một request được thành công.

### 3.4. Mở lại bằng giao dịch đảo

Khi mở lại một session đã quyết toán:

- Bắt buộc nhập lý do.
- Hoàn lại lượng cầu đã xuất bằng movement đảo.
- Tạo bút toán đảo cho các giao dịch quỹ.
- Giữ nguyên settlement và audit cũ.
- Tạo settlement version mới khi quyết toán lại.

### 3.5. Khóa chỉnh sửa sai trạng thái

- Không thêm hoặc xóa guest khi session đã khóa hay quyết toán.
- Không điểm danh sau khi session đã khóa.
- Không sửa trực tiếp các trường tổng tiền.
- Không xóa session đã có giao dịch tài chính.
- Không cho cập nhật session đã quyết toán nếu chưa thực hiện `REOPEN`.

### Tiêu chí nghiệm thu

- Luồng `settle → reopen → settle` không làm lệch quỹ hoặc kho.
- Gọi `SETTLE` hai lần không tạo giao dịch trùng.
- Lỗi tại bất kỳ bước nào đều rollback toàn bộ.
- Không thể quyết toán khi tồn kho không đủ.
- Có integration test cho tất cả trường hợp trên.

### Kết quả triển khai

- [x] State machine cho `DRAFT`, `OPEN`, `LOCKED`, `SETTLED`, `REOPENED`, `CANCELLED`.
- [x] API chuyển trạng thái có kiểm tra transition và audit.
- [x] Settlement service chạy trong MongoDB transaction.
- [x] Settlement ID và version chống xử lý trùng.
- [x] Kiểm tra tồn kho có điều kiện, không cho tồn âm.
- [x] Mở lại bắt buộc lý do và tạo movement/bút toán đảo.
- [x] Điểm danh, guest và chỉnh sửa bị khóa theo trạng thái.
- [x] Không cho xóa session đã có giao dịch tài chính.
- [x] Optimistic concurrency bằng trường `version`.
- [x] Unique index cho settlement, inventory movement và phụ thu guest.
- [x] Migration dữ liệu cũ và script `bun run migrate:stage1`.
- [x] Unit test cho state machine và toàn bộ quality gate hiện tại.
- [x] Integration test cho idempotency, reversal, re-settlement và rollback khi thiếu kho.

## 4. Giai đoạn 2 — Validation và bảo mật API ✅

> Hoàn thành ngày 2026-09-17. Đã áp dụng Zod strict schema cho các request hiện có, chuẩn hóa lỗi validation, khóa mass-assignment, bắt buộc authentication trên API nội bộ, phân biệt `401/403`, che dữ liệu tài chính cá nhân, bảo vệ HTTP seed và cố định tài khoản VietQR ở server.

### 4.1. Zod validation

Tạo schema cho:

- Đăng nhập.
- Tạo và cập nhật buổi chơi.
- Điểm danh.
- Thêm hoặc xóa guest.
- Nhập và xuất cầu.
- Ghi nhận chi phí.
- Quyết toán và mở lại.
- Thanh toán và VietQR.

Các quy tắc tối thiểu:

- Số tiền phải là số nguyên không âm và có giới hạn hợp lý.
- `endTime` phải lớn hơn `startTime`.
- `targetPlayers` phải lớn hơn 0.
- `ballsUsed` phải lớn hơn 0.
- Không tạo hai buổi trùng sân, ngày và giờ.
- Không cho một thành viên xuất hiện hai lần trong cùng session.
- Chuẩn hóa tên, số điện thoại và ghi chú.

### 4.2. Whitelist trường cập nhật

Không merge trực tiếp request body vào document. Client không được phép sửa:

- `id`, `quarterId` sau khi phát sinh giao dịch.
- `status`, `isSettled`.
- Các trường tổng tiền.
- Người và thời điểm quyết toán.
- Settlement, payment và inventory references.

### 4.3. Authentication và authorization

- Owner: quản lý cấu hình, hủy/xóa và mở lại quyết toán.
- Admin: vận hành session, kho và thanh toán.
- Member: xem và cập nhật dữ liệu của chính mình.
- Guest: không có quyền API nội bộ, trừ link giới hạn nếu được thiết kế riêng.

Tất cả API nội bộ phải yêu cầu đăng nhập, kể cả API đọc session và tồn kho.

### 4.4. Gia cố VietQR

- Không nhận tùy ý `bankId`, `accountNo`, `accountName` từ query.
- Tài khoản nhận tiền lấy từ cấu hình server hoặc hồ sơ đã xác thực.
- Giới hạn số tiền và độ dài nội dung.
- Tạo VietQR không đồng nghĩa với đã thanh toán.

### Tiêu chí nghiệm thu

- Request không hợp lệ trả `400` với cấu trúc lỗi thống nhất.
- Thành viên không thể sửa dữ liệu của người khác.
- Client không thể giả mạo tổng tiền hoặc trạng thái quyết toán.
- API nội bộ không trả dữ liệu cho người chưa đăng nhập.

### Kết quả triển khai

- [x] Zod schema dùng chung cho login, session, attendance, guest, kho, nước, settlement, trạng thái và VietQR.
- [x] JSON lỗi hoặc request sai trả `400` với `VALIDATION_ERROR` và danh sách field lỗi.
- [x] Session update dùng strict whitelist; từ chối `status`, tổng tiền và trường hệ thống.
- [x] Kiểm tra thời gian, số tiền, số lượng, giới hạn chuỗi và trùng lịch sân.
- [x] Ngăn guest trùng tên hoặc số điện thoại trong cùng buổi.
- [x] API session, kho, nước và VietQR yêu cầu đăng nhập.
- [x] Proxy bảo vệ toàn bộ trang nội bộ; Server Component xác thực token trước khi đọc MongoDB.
- [x] Phân biệt rõ unauthenticated `401` và unauthorized `403`.
- [x] Member chỉ nhận dữ liệu tài chính của chính mình; dữ liệu người khác được che.
- [x] VietQR chỉ dùng tài khoản cấu hình server, giới hạn số tiền và nội dung.
- [x] HTTP seed yêu cầu cả cờ môi trường và `SEED_TOKEN`, đồng thời luôn tắt ở production.
- [x] Production yêu cầu `JWT_SECRET` tối thiểu 32 ký tự.
- [x] Unit test và integration test cho validation, quyền truy cập, privacy và VietQR.

## 5. Giai đoạn 3 — Sổ cái quỹ thống nhất

### 5.1. Thiết kế treasury ledger

```ts
interface TreasuryEntry {
  id: string;
  quarterId: string;
  sessionId?: string;
  settlementId?: string;
  paymentId?: string;
  type:
    | 'QUARTER_FEE'
    | 'GUEST_PAYMENT'
    | 'MEMBER_PAYMENT'
    | 'COURT_EXPENSE'
    | 'SHUTTLE_PURCHASE'
    | 'ADVANCE_REFUND'
    | 'MEMBER_REFUND'
    | 'ADJUSTMENT'
    | 'REVERSAL';
  amount: number;
  direction: 'IN' | 'OUT';
  status: 'PENDING' | 'POSTED' | 'REVERSED';
  reversesEntryId?: string;
  description: string;
  createdByUserId: string;
  createdAt: string;
}
```

### 5.2. Nguyên tắc sổ cái

- Số dư chỉ tính từ các entry có trạng thái `POSTED`.
- Không tính số dư song song từ session và treasury.
- Không sửa hoặc xóa bút toán đã ghi sổ.
- Sai lệch được xử lý bằng `ADJUSTMENT` hoặc `REVERSAL`.
- Mỗi entry phải liên kết được về nghiệp vụ nguồn.

### 5.3. Báo cáo

- Số dư thực tế.
- Tổng phải thu.
- Tổng phải trả cho người ứng.
- Thu và chi theo quý.
- Dòng tiền theo loại nghiệp vụ.
- Đối chiếu số dư hệ thống với tài khoản ngân hàng.

### Tiêu chí nghiệm thu

```text
Số dư đầu kỳ + Tổng thu - Tổng chi = Số dư hiện tại
```

Toàn bộ số dư phải tái tạo được từ lịch sử ledger.

## 6. Giai đoạn 4 — Thanh toán và công nợ

### 6.1. Thiết kế payment

```ts
interface Payment {
  id: string;
  payerType: 'MEMBER' | 'GUEST';
  payerId?: string;
  sessionId?: string;
  quarterId?: string;
  expectedAmount: number;
  paidAmount: number;
  method: 'CASH' | 'BANK_TRANSFER';
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'REFUNDED';
  reference?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  createdAt: string;
}
```

### 6.2. Luồng nghiệp vụ

1. Quyết toán tạo khoản phải thu hoặc phải trả.
2. VietQR hiển thị đúng số tiền của khoản phải thu.
3. Admin xác nhận tiền đã nhận hoặc tích hợp webhook về sau.
4. Payment chuyển sang `PARTIAL` hoặc `PAID`.
5. Hệ thống tạo bút toán thu quỹ.
6. Trả thừa hoặc hoàn tiền tạo payment và bút toán mới.

Phân biệt rõ:

- Chi phí phải chịu.
- Số phải thu.
- Số đã thanh toán.
- Số còn nợ.
- Số CLB phải hoàn.

### Tiêu chí nghiệm thu

- Tạo QR không làm tăng số dư quỹ.
- Chỉ payment đã xác nhận mới tạo dòng tiền thực tế.
- Hỗ trợ thanh toán một phần, nhiều lần và hoàn tiền.
- Tổng công nợ khớp với payment và ledger.

## 7. Giai đoạn 5 — Sổ biến động kho cầu

### 7.1. Thiết kế inventory movement

```ts
interface InventoryMovement {
  id: string;
  batchId: string;
  sessionId?: string;
  settlementId?: string;
  type: 'PURCHASE' | 'SESSION_USAGE' | 'DAMAGED' | 'ADJUSTMENT' | 'REVERSAL';
  quantity: number;
  unitCost: number;
  createdByUserId: string;
  createdAt: string;
}
```

### 7.2. Nghiệp vụ kho

- Xuất kho theo FIFO hoặc chọn lô cụ thể.
- Không cho tồn kho âm.
- Mỗi lần xuất gắn với session và settlement.
- Reopen tạo movement đảo.
- Cầu hỏng hoặc mất có movement riêng.
- Kiểm kê chênh lệch bằng `ADJUSTMENT`.
- Nhập cầu bằng tiền quỹ tạo khoản chi.
- Thành viên mua ứng tạo khoản CLB phải hoàn.

### Tiêu chí nghiệm thu

```text
Tồn kho = Tổng nhập - Tổng sử dụng - Hỏng ± Điều chỉnh
```

Số lượng trên từng batch phải đối chiếu được với toàn bộ movement.

## 8. Giai đoạn 6 — Quyết toán thành viên theo quý

### 8.1. Thay hoàn tiền ước tính bằng số thực tế

- Phí quý được xem là khoản tạm thu.
- Mỗi buổi ghi nhận chi phí sân thực tế.
- Nghỉ hợp lệ không chịu phần sân của buổi đó.
- Nghỉ muộn vẫn chịu phần sân.
- Thành viên vào hoặc rời giữa quý chỉ chịu các buổi thuộc thời gian tham gia.
- Buổi hủy được xử lý theo chính sách phí hủy sân.

### 8.2. Công thức cuối kỳ

```text
Số cuối kỳ = Tổng nghĩa vụ thực tế - Đã đóng - Đã thanh toán thêm
```

- Kết quả dương: thành viên phải nộp thêm.
- Kết quả âm: CLB phải hoàn lại.
- Kết quả bằng 0: đã hoàn tất.

### 8.3. Cấu hình theo quý

- Deadline báo nghỉ.
- Cách chia tiền sân.
- Phụ thu guest.
- Quy tắc làm tròn.
- Chính sách thành viên vào hoặc rời quý.
- Chính sách chuyển số dư sang quý sau.

### Tiêu chí nghiệm thu

- Không còn sử dụng mức hoàn tiền cố định theo buổi.
- Có thể giải thích chi tiết số tiền cuối kỳ của từng thành viên.
- Tổng nghĩa vụ thành viên khớp với chi phí thực tế và ledger.

## 9. Giai đoạn 7 — Đồng thời, audit và vận hành

### 9.1. Optimistic concurrency

- Thêm `version` vào các document quan trọng.
- Update bằng điều kiện `{ id, version }`.
- Tăng version sau mỗi thay đổi.
- Trả `409 Conflict` nếu dữ liệu đã được người khác cập nhật.

### 9.2. ID và audit

- Thay ID dựa trên `Date.now()` bằng `ObjectId` hoặc `crypto.randomUUID()`.
- Lưu `oldData` và `newData` dạng document, không stringify JSON.
- Bổ sung màn hình audit cho Owner.
- Mỗi audit record có request ID, actor, thời gian và lý do.

### 9.3. Quan sát và vận hành

- Structured logging và request ID.
- Cảnh báo tồn kho thấp.
- Cảnh báo công nợ quá hạn.
- Backup MongoDB định kỳ.
- Script kiểm tra tính toàn vẹn quỹ và kho.
- Export Excel/PDF cho quyết toán quý.

## 10. Chiến lược migration

1. Backup toàn bộ database trước khi migration.
2. Bổ sung schema mới mà chưa xóa trường cũ.
3. Viết script chuyển dữ liệu hiện tại sang ledger, payment và inventory movement.
4. Chạy script đối chiếu trước/sau migration.
5. Chuyển API đọc sang mô hình mới.
6. Chuyển API ghi sang mô hình mới.
7. Theo dõi một chu kỳ vận hành.
8. Chỉ xóa trường cũ sau khi đối chiếu thành công.

Migration phải có dry-run, báo cáo chênh lệch và khả năng rollback.

## 11. Kế hoạch kiểm thử

### Unit test

- Chia tiền sân, cầu, nước và chi phí khác.
- Quy tắc làm tròn và phần chênh lệch.
- Deadline báo nghỉ.
- Tính công nợ và hoàn tiền.
- State machine.

### Integration test

- Quyền hạn theo từng role.
- Quyết toán thành công.
- Rollback khi kho không đủ.
- Quyết toán lặp.
- Hai request quyết toán đồng thời.
- Mở lại rồi quyết toán lại.
- Payment một phần, nhiều lần và hoàn tiền.
- Nhập/xuất/đảo kho.
- Chốt quý.

### Kiểm thử tính toàn vẹn

- Ledger tái tạo đúng số dư.
- Movement tái tạo đúng tồn kho.
- Tổng payment khớp với công nợ.
- Mọi settlement có đủ audit, ledger và inventory references.

## 12. Thứ tự sprint đề xuất

| Sprint | Phạm vi | Kết quả chính |
|---|---|---|
| 1 | State machine, Zod validation, permission | Chặn thao tác và dữ liệu không hợp lệ |
| 2 | Transactional settlement, idempotency, reopen | Quyết toán an toàn và có thể hoàn tác |
| 3 | Treasury ledger và payment | Quỹ và công nợ đối soát được |
| 4 | Inventory movements | Kho cầu có lịch sử đầy đủ, không âm |
| 5 | Quyết toán thành viên theo quý | Thu/hoàn tiền dựa trên chi phí thực tế |
| 6 | Audit, báo cáo, migration cleanup | Sẵn sàng vận hành lâu dài |

## 13. Definition of Done chung

Một hạng mục chỉ được xem là hoàn thành khi:

- Có schema và validation rõ ràng.
- Có kiểm tra authentication và authorization.
- Có migration nếu thay đổi dữ liệu.
- Có unit test và integration test phù hợp.
- Lint, typecheck, test và production build đều thành công.
- Có audit cho thao tác tài chính hoặc thay đổi quan trọng.
- Không tạo ra trạng thái dữ liệu trung gian khi request thất bại.
- Tài liệu vận hành và rollback đã được cập nhật.

## 14. Ưu tiên bắt đầu

Hai sprint đầu là bắt buộc trước khi sử dụng hệ thống cho dữ liệu tài chính thật. Hạng mục nên bắt đầu đầu tiên là transactional settlement vì đây là điểm kết nối giữa session, công nợ, tồn kho, quỹ và audit.
