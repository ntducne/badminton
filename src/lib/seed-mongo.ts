import { getDb } from './db';
import bcrypt from 'bcryptjs';
import { AttendanceStatus, SessionStatus, QuarterStatus, PaymentStatus } from './types';

export async function seedMongo() {
  const db = await getDb();
  console.log('Seeding MongoDB database:', db.databaseName);

  // Xóa collections cũ
  await db.collection('users').deleteMany({});
  await db.collection('quarters').deleteMany({});
  await db.collection('quarter_members').deleteMany({});
  await db.collection('venues').deleteMany({});
  await db.collection('schedules').deleteMany({});
  await db.collection('sessions').deleteMany({});
  await db.collection('shuttle_batches').deleteMany({});
  await db.collection('drink_items').deleteMany({});
  await db.collection('payments').deleteMany({});
  await db.collection('treasury').deleteMany({});
  await db.collection('audit_logs').deleteMany({});

  const hashedPassword = await bcrypt.hash('123456', 10);

  // 1. Tạo 8 thành viên
  const users = [
    { id: 'u-tung', name: 'Nguyễn Đức Tùng', phone: '0988888888', email: 'tung@badminton.club', role: 'OWNER' },
    { id: 'u-duc', name: 'Phạm Hồng Đức', phone: '0977777777', email: 'duc@badminton.club', role: 'ADMIN' },
    { id: 'u-chinh', name: 'Trần Văn Chính', phone: '0966666666', email: 'chinh@badminton.club', role: 'MEMBER' },
    { id: 'u-giang', name: 'Lê Trường Giang', phone: '0955555555', email: 'giang@badminton.club', role: 'MEMBER' },
    { id: 'u-nam', name: 'Vũ Hoài Nam', phone: '0944444444', email: 'nam@badminton.club', role: 'MEMBER' },
    { id: 'u-huy', name: 'Đỗ Quang Huy', phone: '0933333333', email: 'huy@badminton.club', role: 'MEMBER' },
    { id: 'u-linh', name: 'Bùi Thùy Linh', phone: '0922222222', email: 'linh@badminton.club', role: 'MEMBER' },
    { id: 'u-hoang', name: 'Ngô Việt Hoàng', phone: '0911111111', email: 'hoang@badminton.club', role: 'MEMBER' },
  ].map((u) => ({
    ...u,
    password: hashedPassword,
    avatarUrl: null,
    bankName: 'MBBank',
    bankAccount: u.phone,
    accountName: u.name.toUpperCase(),
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  await db.collection('users').insertMany(users);

  // 2. Tạo Quý 1/2026
  const quarter = {
    id: 'q-2026-1',
    name: 'Quý 1/2026',
    year: 2026,
    quarterNumber: 1,
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    status: 'ACTIVE' as QuarterStatus,
    defaultGuestSurcharge: 10000,
    defaultTargetPlayers: 8,
    autoTransferBalance: true,
    startingBalance: 0,
    currentBalance: 2080000, // 8 người x 260k
    notes: 'Quý 1 hoạt động năm 2026',
    createdAt: new Date().toISOString(),
  };
  await db.collection('quarters').insertOne(quarter);

  // 3. Tạo Quarter Members (8 thành viên cố định)
  const quarterMembers = users.map((u) => ({
    id: `qm-${quarter.id}-${u.id}`,
    quarterId: quarter.id,
    userId: u.id,
    userName: u.name,
    userPhone: u.phone,
    fixedCourtFee: 260000,
    paidAmount: 260000,
    paymentStatus: 'PAID' as PaymentStatus,
    joinedDate: '2026-01-01',
    refundAmount: 0,
    isActive: true,
    notes: 'Thành viên cố định quý 1',
  }));
  await db.collection('quarter_members').insertMany(quarterMembers);

  // 4. Địa điểm sân (Venue)
  const venue = {
    id: 'v-star',
    name: 'Sân Cầu Lông Ngôi Sao',
    address: 'Số 123 Cầu Giấy, Cầu Giấy, Hà Nội',
    phone: '0901234567',
    googleMapUrl: 'https://maps.google.com/?q=21.0333,105.7999',
    defaultHourlyRate: 100000,
    notes: 'Sân thảm chất lượng cao, trần cao 9m',
    courts: [
      { id: 'c-1', courtNumber: 'Sân 1', hourlyRate: 100000 },
      { id: 'c-2', courtNumber: 'Sân 2', hourlyRate: 100000 },
    ],
    createdAt: new Date().toISOString(),
  };
  await db.collection('venues').insertOne(venue);

  // 5. Cấu hình Lịch đánh cố định (Thứ 3 & Thứ 5, 18:00 - 20:00)
  const schedule = {
    id: 'sp-1',
    quarterId: quarter.id,
    venueId: venue.id,
    venueName: venue.name,
    dayOfWeek: 2, // Thứ 3
    startTime: '18:00',
    endTime: '20:00',
    numberOfCourts: 1,
    courtNumbers: 'Sân 1',
    targetPlayers: 8,
    estimatedHourlyPrice: 100000,
    isActive: true,
  };
  await db.collection('schedules').insertOne(schedule);

  // 6. Tồn kho cầu
  const shuttleBatch = {
    id: 'batch-yonex-1',
    brandName: 'Yonex AS-50',
    batchCode: 'BATCH-YONEX-2026-01',
    tubeQuantity: 5,
    ballsPerTube: 12,
    totalBalls: 60,
    remainingBalls: 56, // Đã dùng 4 quả ở buổi 15
    pricePerTube: 310000,
    pricePerBall: Math.ceil(310000 / 12), // ~25.834đ
    purchaseDate: '2026-01-05',
    payerUserId: 'u-tung',
    payerName: 'Nguyễn Đức Tùng',
    isPaidFromTreasury: false,
    notes: 'Tùng mua ứng 5 ống',
  };
  await db.collection('shuttle_batches').insertOne(shuttleBatch);

  // 7. Danh mục nước uống
  const drinks = [
    { id: 'd-aqua', name: 'Nước suối Aquafina 500ml', isSharedPitcher: false, unitPrice: 10000, isActive: true },
    { id: 'd-revive', name: 'Revive Chanh Muối', isSharedPitcher: false, unitPrice: 15000, isActive: true },
    { id: 'd-sting', name: 'Sting Dâu', isSharedPitcher: false, unitPrice: 15000, isActive: true },
    { id: 'd-pitcher', name: 'Ca Trà Đá Lớn', isSharedPitcher: true, unitPrice: 25000, isActive: true },
  ];
  await db.collection('drink_items').insertMany(drinks);

  // 8. Buổi đánh mẫu: "Buổi 15" theo Mục 25
  const session15 = {
    id: 'session-15',
    quarterId: quarter.id,
    venueId: venue.id,
    venueName: venue.name,
    schedulePlanId: schedule.id,
    sessionCode: 'B-15',
    sessionDate: '2026-02-17',
    startTime: '18:00',
    endTime: '20:00',
    status: 'OPEN' as SessionStatus,
    targetPlayers: 8,
    guestSurcharge: 10000,
    totalCourtFee: 200000, // 2 tiếng x 100k
    totalShuttleFee: 104000, // 4 quả x 25.834đ (làm tròn lên) = 104.000đ
    totalDrinkFee: 25000, // 1 ca trà đá lớn
    totalOtherFee: 0,
    totalExpense: 329000,
    totalGuestRevenue: 112000, // 2 guest x 56.000đ
    isSettled: false,
    courts: [
      { id: 'sc-1', sessionId: 'session-15', courtName: 'Sân 1', hours: 2, hourlyRate: 100000, totalCost: 200000 },
    ],
    participants: [
      {
        id: 'p-tung',
        sessionId: 'session-15',
        userId: 'u-tung',
        userName: 'Nguyễn Đức Tùng',
        userPhone: '0988888888',
        isGuest: false,
        attendanceStatus: 'ATTENDING' as AttendanceStatus,
        courtFeeShare: 25000,
        shuttleFeeShare: 13000,
        drinkFeeShare: 5000, // 25k ca chia cho 5 người uống = 5k
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 18000, // Cầu 13k + Nước 5k (sân đã đóng theo quý)
        totalAdvanced: 200000, // Tùng ứng tiền sân 200k
        totalPaid: 0,
        debtAmount: 0,
        netSettlement: -182000, // Nhóm nợ lại Tùng 182.000đ
        paymentStatus: 'OVERPAID' as PaymentStatus,
      },
      {
        id: 'p-duc',
        sessionId: 'session-15',
        userId: 'u-duc',
        userName: 'Phạm Hồng Đức',
        userPhone: '0977777777',
        isGuest: false,
        attendanceStatus: 'ATTENDING' as AttendanceStatus,
        courtFeeShare: 25000,
        shuttleFeeShare: 13000,
        drinkFeeShare: 5000,
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 18000,
        totalAdvanced: 25000, // Đức ứng tiền ca nước 25k
        totalPaid: 0,
        debtAmount: 0,
        netSettlement: -7000, // Nhóm nợ lại Đức 7.000đ
        paymentStatus: 'OVERPAID' as PaymentStatus,
      },
      {
        id: 'p-chinh',
        sessionId: 'session-15',
        userId: 'u-chinh',
        userName: 'Trần Văn Chính',
        userPhone: '0966666666',
        isGuest: false,
        attendanceStatus: 'ATTENDING' as AttendanceStatus,
        courtFeeShare: 25000,
        shuttleFeeShare: 13000,
        drinkFeeShare: 5000,
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 18000,
        totalAdvanced: 0,
        totalPaid: 0,
        debtAmount: 18000,
        netSettlement: 18000,
        paymentStatus: 'UNPAID' as PaymentStatus,
      },
      {
        id: 'p-giang',
        sessionId: 'session-15',
        userId: 'u-giang',
        userName: 'Lê Trường Giang',
        userPhone: '0955555555',
        isGuest: false,
        attendanceStatus: 'ATTENDING' as AttendanceStatus,
        courtFeeShare: 25000,
        shuttleFeeShare: 13000,
        drinkFeeShare: 5000,
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 18000,
        totalAdvanced: 0,
        totalPaid: 0,
        debtAmount: 18000,
        netSettlement: 18000,
        paymentStatus: 'UNPAID' as PaymentStatus,
      },
      {
        id: 'p-nam',
        sessionId: 'session-15',
        userId: 'u-nam',
        userName: 'Vũ Hoài Nam',
        userPhone: '0944444444',
        isGuest: false,
        attendanceStatus: 'ATTENDING' as AttendanceStatus,
        courtFeeShare: 25000,
        shuttleFeeShare: 13000,
        drinkFeeShare: 5000,
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 18000,
        totalAdvanced: 0,
        totalPaid: 0,
        debtAmount: 18000,
        netSettlement: 18000,
        paymentStatus: 'UNPAID' as PaymentStatus,
      },
      {
        id: 'p-huy',
        sessionId: 'session-15',
        userId: 'u-huy',
        userName: 'Đỗ Quang Huy',
        userPhone: '0933333333',
        isGuest: false,
        attendanceStatus: 'ATTENDING' as AttendanceStatus,
        courtFeeShare: 25000,
        shuttleFeeShare: 13000,
        drinkFeeShare: 0, // Huy không uống trà đá
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 13000,
        totalAdvanced: 0,
        totalPaid: 0,
        debtAmount: 13000,
        netSettlement: 13000,
        paymentStatus: 'UNPAID' as PaymentStatus,
      },
      {
        id: 'p-linh',
        sessionId: 'session-15',
        userId: 'u-linh',
        userName: 'Bùi Thùy Linh',
        userPhone: '0922222222',
        isGuest: false,
        attendanceStatus: 'ABSENT_VALID' as AttendanceStatus, // Báo trước 6h -> Được hoàn tiền sân quý
        courtFeeShare: 0,
        shuttleFeeShare: 0,
        drinkFeeShare: 0,
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 0,
        totalAdvanced: 0,
        totalPaid: 0,
        debtAmount: 0,
        netSettlement: 0,
        paymentStatus: 'PAID' as PaymentStatus,
      },
      {
        id: 'p-hoang',
        sessionId: 'session-15',
        userId: 'u-hoang',
        userName: 'Ngô Việt Hoàng',
        userPhone: '0911111111',
        isGuest: false,
        attendanceStatus: 'ABSENT_LATE' as AttendanceStatus, // Báo muộn < 6h -> Không được hoàn tiền sân
        courtFeeShare: 0,
        shuttleFeeShare: 0,
        drinkFeeShare: 0,
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 0,
        totalAdvanced: 0,
        totalPaid: 0,
        debtAmount: 0,
        netSettlement: 0,
        paymentStatus: 'PAID' as PaymentStatus,
      },
      {
        id: 'p-guest-1',
        sessionId: 'session-15',
        userName: 'Tuấn (Giao lưu)',
        userPhone: '0999111222',
        isGuest: true,
        attendanceStatus: 'ATTENDING' as AttendanceStatus,
        courtFeeShare: 25000,
        shuttleFeeShare: 13000,
        drinkFeeShare: 0, // Không uống nước
        otherFeeShare: 0,
        guestSurcharge: 10000,
        totalCost: 48000,
        totalAdvanced: 0,
        totalPaid: 48000, // Đã thanh toán
        debtAmount: 0,
        netSettlement: 0,
        paymentStatus: 'PAID' as PaymentStatus,
      },
      {
        id: 'p-guest-2',
        sessionId: 'session-15',
        userName: 'Bình (Giao lưu)',
        userPhone: '0999333444',
        isGuest: true,
        attendanceStatus: 'ATTENDING' as AttendanceStatus,
        courtFeeShare: 25000,
        shuttleFeeShare: 13000,
        drinkFeeShare: 5000, // Có uống trà đá
        otherFeeShare: 0,
        guestSurcharge: 10000,
        totalCost: 53000, // 25k + 13k + 5k + 10k phụ thu (làm tròn hoặc theo công thức đề xuất ~56k)
        totalAdvanced: 0,
        totalPaid: 0,
        debtAmount: 53000,
        netSettlement: 53000,
        paymentStatus: 'UNPAID' as PaymentStatus,
      },
    ],
    shuttleUsages: [
      {
        id: 'su-1',
        sessionId: 'session-15',
        batchId: shuttleBatch.id,
        brandName: shuttleBatch.brandName,
        ballsUsed: 4,
        pricePerBall: shuttleBatch.pricePerBall,
        totalCost: 104000,
      },
    ],
    drinks: [
      {
        id: 'sd-1',
        sessionId: 'session-15',
        drinkItemId: 'd-pitcher',
        drinkName: 'Ca Trà Đá Lớn',
        isShared: true,
        quantity: 1,
        unitPrice: 25000,
        totalCost: 25000,
        payerUserId: 'u-duc',
        payerName: 'Phạm Hồng Đức',
        assignedParticipants: [
          { participantId: 'p-tung', participantName: 'Nguyễn Đức Tùng', quantity: 1, amount: 5000 },
          { participantId: 'p-duc', participantName: 'Phạm Hồng Đức', quantity: 1, amount: 5000 },
          { participantId: 'p-chinh', participantName: 'Trần Văn Chính', quantity: 1, amount: 5000 },
          { participantId: 'p-giang', participantName: 'Lê Trường Giang', quantity: 1, amount: 5000 },
          { participantId: 'p-nam', participantName: 'Vũ Hoài Nam', quantity: 1, amount: 5000 },
        ],
      },
    ],
    expenses: [],
    advances: [
      {
        id: 'adv-1',
        sessionId: 'session-15',
        userId: 'u-tung',
        userName: 'Nguyễn Đức Tùng',
        amount: 200000,
        refundStatus: 'UNREFUNDED',
        refundedAmount: 0,
        notes: 'Tùng trả tiền thuê sân',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'adv-2',
        sessionId: 'session-15',
        userId: 'u-duc',
        userName: 'Phạm Hồng Đức',
        amount: 25000,
        refundStatus: 'UNREFUNDED',
        refundedAmount: 0,
        notes: 'Đức mua ca trà đá lớn',
        createdAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.collection('sessions').insertOne(session15);

  console.log('MongoDB Seeding Completed Successfully!');
}

// Chạy seed nếu gọi trực tiếp
if (process.argv[1]?.includes('seed-mongo')) {
  seedMongo().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
