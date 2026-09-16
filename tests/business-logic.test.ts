import { describe, test, expect } from 'bun:test';
import {
  ceilToThousand,
  checkIsBeforeDeadline,
  calculateSessionFinances,
  getNextSession,
} from '../src/lib/calculations';
import { Session } from '../src/lib/types';
import { canTransitionSession, isSessionMutable } from '../src/lib/session-state';
import { createSessionSchema, settleSchema, updateSessionSchema, vietQrQuerySchema } from '../src/lib/api-validation';

describe('Badminton Business Logic & Calculations', () => {
  test('Validation từ chối dữ liệu giả mạo và giới hạn VietQR', () => {
    expect(updateSessionSchema.safeParse({ status: 'SETTLED', totalExpense: 1 }).success).toBe(false);
    expect(createSessionSchema.safeParse({
      sessionDate: '2026-09-20', startTime: '20:00', endTime: '18:00',
    }).success).toBe(false);
    expect(settleSchema.safeParse({ action: 'REOPEN', notes: '' }).success).toBe(false);
    expect(vietQrQuerySchema.safeParse({ amount: 0, description: 'Test' }).success).toBe(false);
    expect(vietQrQuerySchema.safeParse({ amount: 10000, description: 'Test' }).success).toBe(true);
  });
  test('State machine chỉ cho phép các chuyển trạng thái an toàn', () => {
    expect(canTransitionSession('OPEN', 'SETTLED')).toBe(true);
    expect(canTransitionSession('SETTLED', 'REOPENED')).toBe(true);
    expect(canTransitionSession('SETTLED', 'OPEN')).toBe(false);
    expect(canTransitionSession('CANCELLED', 'OPEN')).toBe(false);
    expect(isSessionMutable({ status: 'OPEN', isSettled: false })).toBe(true);
    expect(isSessionMutable({ status: 'LOCKED', isSettled: false })).toBe(false);
    expect(isSessionMutable({ status: 'SETTLED', isSettled: true })).toBe(false);
  });
  test('Dashboard chọn đúng buổi tương lai gần nhất', () => {
    const sessions = [
      { id: 'past', sessionDate: '2026-01-10', startTime: '18:00' },
      { id: 'later', sessionDate: '2026-02-20', startTime: '18:00' },
      { id: 'next', sessionDate: '2026-02-16', startTime: '18:00' },
    ] as Session[];

    expect(getNextSession(sessions, new Date('2026-02-15T12:00:00'))?.id).toBe('next');
  });
  test('Rule 8.4: Làm tròn lên đến hàng nghìn đồng (Ceil to thousand)', () => {
    // 400.000đ chia cho 3 người = 133.333,33đ -> làm tròn lên: 134.000đ
    const divided = 400000 / 3;
    const rounded = ceilToThousand(divided);
    expect(rounded).toBe(134000);

    // 25.833,33đ (1 quả cầu 310k/12) -> làm tròn lên: 26.000đ
    expect(ceilToThousand(310000 / 12)).toBe(26000);

    // Đúng chẵn thì giữ nguyên
    expect(ceilToThousand(50000)).toBe(50000);
    expect(ceilToThousand(0)).toBe(0);
  });

  test('Rule 3.3 & 3.4: Báo nghỉ trước deadline 6 tiếng', () => {
    // Ngày tương lai (chắc chắn > 6h)
    const futureDate = '2028-12-31';
    expect(checkIsBeforeDeadline(futureDate, '18:00')).toBe(true);

    // Ngày quá khứ (chắc chắn < 6h)
    const pastDate = '2020-01-01';
    expect(checkIsBeforeDeadline(pastDate, '18:00')).toBe(false);
  });

  test('Kịch bản mẫu Mục 25: Tính toán tài chính Buổi 15', () => {
    // Mock Session 15 theo đúng kịch bản nghiệp vụ Mục 25
    const mockSession: Session = {
      id: 'test-session-15',
      quarterId: 'q-1',
      venueId: 'v-1',
      venueName: 'Sân Cầu Lông Ngôi Sao',
      sessionCode: 'B-15',
      sessionDate: '2026-02-17',
      startTime: '18:00',
      endTime: '20:00',
      status: 'OPEN',
      targetPlayers: 8,
      guestSurcharge: 10000,
      totalCourtFee: 200000,
      totalShuttleFee: 104000,
      totalDrinkFee: 25000,
      totalOtherFee: 0,
      totalExpense: 329000,
      totalGuestRevenue: 0,
      isSettled: false,
      courts: [
        { id: 'c-1', sessionId: 'test-session-15', courtName: 'Sân 1', hours: 2, hourlyRate: 100000, totalCost: 200000 },
      ],
      shuttleUsages: [
        { id: 'su-1', sessionId: 'test-session-15', batchId: 'b-1', brandName: 'Yonex', ballsUsed: 4, pricePerBall: 25834, totalCost: 104000 },
      ],
      drinks: [
        {
          id: 'd-1',
          sessionId: 'test-session-15',
          drinkItemId: 'd-pitcher',
          drinkName: 'Ca Trà Đá',
          isShared: true,
          quantity: 1,
          unitPrice: 25000,
          totalCost: 25000,
          assignedParticipants: [
            { participantId: 'p-tung', participantName: 'Tùng', quantity: 1, amount: 5000 },
            { participantId: 'p-duc', participantName: 'Đức', quantity: 1, amount: 5000 },
            { participantId: 'p-chinh', participantName: 'Chính', quantity: 1, amount: 5000 },
            { participantId: 'p-giang', participantName: 'Giang', quantity: 1, amount: 5000 },
            { participantId: 'p-guest-2', participantName: 'Bình (Guest)', quantity: 1, amount: 5000 },
          ],
        },
      ],
      expenses: [],
      advances: [
        { id: 'adv-1', sessionId: 'test-session-15', userId: 'u-tung', userName: 'Tùng', amount: 200000, refundStatus: 'UNREFUNDED', refundedAmount: 0, createdAt: '' },
        { id: 'adv-2', sessionId: 'test-session-15', userId: 'u-duc', userName: 'Đức', amount: 25000, refundStatus: 'UNREFUNDED', refundedAmount: 0, createdAt: '' },
      ],
      participants: [
        { id: 'p-tung', sessionId: 'test-session-15', userId: 'u-tung', userName: 'Tùng', isGuest: false, attendanceStatus: 'ATTENDING', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 0, totalCost: 0, totalAdvanced: 200000, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
        { id: 'p-duc', sessionId: 'test-session-15', userId: 'u-duc', userName: 'Đức', isGuest: false, attendanceStatus: 'ATTENDING', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 0, totalCost: 0, totalAdvanced: 25000, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
        { id: 'p-chinh', sessionId: 'test-session-15', userId: 'u-chinh', userName: 'Chính', isGuest: false, attendanceStatus: 'ATTENDING', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 0, totalCost: 0, totalAdvanced: 0, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
        { id: 'p-giang', sessionId: 'test-session-15', userId: 'u-giang', userName: 'Giang', isGuest: false, attendanceStatus: 'ATTENDING', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 0, totalCost: 0, totalAdvanced: 0, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
        { id: 'p-nam', sessionId: 'test-session-15', userId: 'u-nam', userName: 'Nam', isGuest: false, attendanceStatus: 'ATTENDING', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 0, totalCost: 0, totalAdvanced: 0, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
        { id: 'p-huy', sessionId: 'test-session-15', userId: 'u-huy', userName: 'Huy', isGuest: false, attendanceStatus: 'ATTENDING', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 0, totalCost: 0, totalAdvanced: 0, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
        { id: 'p-linh', sessionId: 'test-session-15', userId: 'u-linh', userName: 'Linh', isGuest: false, attendanceStatus: 'ABSENT_VALID', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 0, totalCost: 0, totalAdvanced: 0, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
        { id: 'p-hoang', sessionId: 'test-session-15', userId: 'u-hoang', userName: 'Hoàng', isGuest: false, attendanceStatus: 'ABSENT_LATE', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 0, totalCost: 0, totalAdvanced: 0, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
        { id: 'p-guest-1', sessionId: 'test-session-15', userName: 'Tuấn (Giao lưu)', isGuest: true, attendanceStatus: 'ATTENDING', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 10000, totalCost: 0, totalAdvanced: 0, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
        { id: 'p-guest-2', sessionId: 'test-session-15', userName: 'Bình (Giao lưu)', isGuest: true, attendanceStatus: 'ATTENDING', courtFeeShare: 0, shuttleFeeShare: 0, drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 10000, totalCost: 0, totalAdvanced: 0, totalPaid: 0, debtAmount: 0, netSettlement: 0, paymentStatus: 'UNPAID' },
      ],
      createdAt: '',
      updatedAt: '',
    };

    const finances = calculateSessionFinances(mockSession);

    // 1. Số người thực tế chơi: 6 member + 2 guest = 8 người
    expect(finances.activeCount).toBe(8);
    expect(finances.attendingMembers).toBe(6);
    expect(finances.existingGuests).toBe(2);
    expect(finances.neededGuests).toBe(0);
    expect(finances.playerStatusText).toBe('Đủ người');

    // 2. Tiền sân chia 8 người: 200k / 8 = 25k/người
    expect(finances.courtFeePerPerson).toBe(25000);

    // 3. Tiền cầu chia 8 người: 104k / 8 = 13k/người
    expect(finances.shuttleFeePerPerson).toBe(13000);

    // 4. Khách Tuấn (Guest 1, không uống nước):
    // Sân (25k) + Cầu (13k) + Phụ thu (10k) = 48.000đ
    const guest1 = finances.participants.find((p) => p.id === 'p-guest-1');
    expect(guest1?.totalCost).toBe(48000);

    // 5. Khách Bình (Guest 2, có uống trà đá 5k):
    // Sân (25k) + Cầu (13k) + Nước (5k) + Phụ thu (10k) = 53.000đ
    const guest2 = finances.participants.find((p) => p.id === 'p-guest-2');
    expect(guest2?.totalCost).toBe(53000);

    // 6. Tùng (Member, uống nước 5k, đã ứng tiền sân 200k):
    // Chi phí buổi này: Cầu (13k) + Nước (5k) = 18.000đ
    // Net: 18.000đ - 200.000đ (đã ứng) = -182.000đ (Nhóm nợ lại Tùng 182.000đ)
    const tung = finances.participants.find((p) => p.id === 'p-tung');
    expect(tung?.totalCost).toBe(18000);
    expect(tung?.netSettlement).toBe(-182000);

    // 7. Chính (Member, uống nước 5k, không ứng):
    // Chi phí buổi này: Cầu (13k) + Nước (5k) = 18.000đ
    // Net: 18.000đ phải nộp
    const chinh = finances.participants.find((p) => p.id === 'p-chinh');
    expect(chinh?.totalCost).toBe(18000);
    expect(chinh?.debtAmount).toBe(18000);

    // 8. Linh (Member nghỉ có phép):
    // Chi phí buổi này = 0đ
    const linh = finances.participants.find((p) => p.id === 'p-linh');
    expect(linh?.totalCost).toBe(0);
    expect(linh?.debtAmount).toBe(0);
  });
});
