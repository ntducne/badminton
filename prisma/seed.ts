import { PrismaClient, Role, QuarterStatus, SessionStatus, AttendanceStatus, PaymentStatus, ExpenseCategory, PaymentMethod, TransactionStatus, TreasuryType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding Badminton Database ---');

  // 1. Clean existing data (if any)
  await prisma.auditLog.deleteMany({});
  await prisma.advanceRefund.deleteMany({});
  await prisma.treasuryLog.deleteMany({});
  await prisma.paymentTransaction.deleteMany({});
  await prisma.expenseShare.deleteMany({});
  await prisma.expenseAdvance.deleteMany({});
  await prisma.sessionDrinkShare.deleteMany({});
  await prisma.sessionDrink.deleteMany({});
  await prisma.shuttlecockUsage.deleteMany({});
  await prisma.sessionParticipant.deleteMany({});
  await prisma.sessionCourt.deleteMany({});
  await prisma.sessionExpense.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.schedulePlan.deleteMany({});
  await prisma.quarterMember.deleteMany({});
  await prisma.quarter.deleteMany({});
  await prisma.court.deleteMany({});
  await prisma.venue.deleteMany({});
  await prisma.shuttlecockBatch.deleteMany({});
  await prisma.shuttlecockBrand.deleteMany({});
  await prisma.drinkItem.deleteMany({});
  await prisma.user.deleteMany({});

  const defaultPassword = await bcrypt.hash('123456', 10);

  // 2. Tạo 8 thành viên cố định (Tùng Owner, Đức Admin, 6 Member)
  const usersData = [
    { name: 'Nguyễn Đức Tùng', phone: '0988888888', email: 'tung@badminton.club', role: Role.OWNER },
    { name: 'Phạm Hồng Đức', phone: '0977777777', email: 'duc@badminton.club', role: Role.ADMIN },
    { name: 'Trần Văn Chính', phone: '0966666666', email: 'chinh@badminton.club', role: Role.MEMBER },
    { name: 'Lê Trường Giang', phone: '0955555555', email: 'giang@badminton.club', role: Role.MEMBER },
    { name: 'Vũ Hoài Nam', phone: '0944444444', email: 'nam@badminton.club', role: Role.MEMBER },
    { name: 'Đỗ Quang Huy', phone: '0933333333', email: 'huy@badminton.club', role: Role.MEMBER },
    { name: 'Bùi Thùy Linh', phone: '0922222222', email: 'linh@badminton.club', role: Role.MEMBER },
    { name: 'Ngô Việt Hoàng', phone: '0911111111', email: 'hoang@badminton.club', role: Role.MEMBER },
  ];

  const createdUsers: Record<string, any> = {};
  for (const u of usersData) {
    const user = await prisma.user.create({
      data: {
        name: u.name,
        phone: u.phone,
        email: u.email,
        password: defaultPassword,
        role: u.role,
        bankName: 'MBBank',
        bankAccount: u.phone,
        accountName: u.name.toUpperCase(),
      },
    });
    createdUsers[u.name] = user;
    console.log(`Created User: ${user.name} (${user.role}) - Phone: ${user.phone}`);
  }

  // 3. Tạo Quý 1/2026
  const quarter1 = await prisma.quarter.create({
    data: {
      name: 'Quý 1/2026',
      year: 2026,
      quarterNumber: 1,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-03-31T23:59:59Z'),
      status: QuarterStatus.ACTIVE,
      defaultGuestSurcharge: 10000,
      defaultTargetPlayers: 8,
      startingBalance: 0,
      notes: 'Quý hoạt động đầu năm 2026',
    },
  });
  console.log(`Created Quarter: ${quarter1.name}`);

  // 4. Thêm 8 thành viên cố định vào Quý 1 với tiền sân cố định 260.000đ/người
  for (const name of Object.keys(createdUsers)) {
    const user = createdUsers[name];
    await prisma.quarterMember.create({
      data: {
        quarterId: quarter1.id,
        userId: user.id,
        fixedCourtFee: 260000,
        paidAmount: 260000, // Giả định đã đóng tiền sân đầu quý
        paymentStatus: PaymentStatus.PAID,
      },
    });
  }

  // 5. Địa điểm sân và Sân chi tiết
  const venue = await prisma.venue.create({
    data: {
      name: 'Sân Cầu Lông Ngôi Sao',
      address: 'Số 123 Cầu Giấy, Cầu Giấy, Hà Nội',
      phone: '0901234567',
      googleMapUrl: 'https://maps.google.com/?q=21.0333,105.7999',
      defaultHourlyRate: 100000,
      notes: 'Sân thảm chất lượng cao, trần cao 9m',
    },
  });

  const court1 = await prisma.court.create({
    data: {
      venueId: venue.id,
      courtNumber: 'Sân 1',
      hourlyRate: 100000,
    },
  });

  await prisma.court.create({
    data: {
      venueId: venue.id,
      courtNumber: 'Sân 2',
      hourlyRate: 100000,
    },
  });

  // 6. Cấu hình Lịch đánh cố định (Thứ 3 & Thứ 5, 18:00 - 20:00)
  const schedulePlan1 = await prisma.schedulePlan.create({
    data: {
      quarterId: quarter1.id,
      venueId: venue.id,
      dayOfWeek: 2, // Thứ 3
      startTime: '18:00',
      endTime: '20:00',
      numberOfCourts: 1,
      courtNumbers: 'Sân 1',
      targetPlayers: 8,
      estimatedHourlyPrice: 100000,
    },
  });

  // 7. Nhãn hiệu cầu & Nhập kho cầu (Lô 5 ống = 60 quả Yonex)
  const yonexBrand = await prisma.shuttlecockBrand.create({
    data: {
      name: 'Yonex AS-50',
      description: 'Cầu thi đấu chính hãng Yonex AS-50',
    },
  });

  await prisma.shuttlecockBrand.create({
    data: {
      name: 'Hải Yến Xanh Đỏ',
      description: 'Cầu lông Hải Yến tập luyện',
    },
  });

  const batch = await prisma.shuttlecockBatch.create({
    data: {
      brandId: yonexBrand.id,
      batchCode: 'BATCH-YONEX-2026-01',
      tubeQuantity: 5,
      ballsPerTube: 12,
      totalBalls: 60,
      remainingBalls: 56, // Sau buổi 15 dùng 4 quả -> còn 56 quả
      pricePerTube: 310000,
      pricePerBall: 310000 / 12, // 25.833,33đ
      purchaseDate: new Date('2026-01-05T09:00:00Z'),
      payerUserId: createdUsers['Nguyễn Đức Tùng'].id,
      notes: 'Tùng mua ứng 5 ống',
    },
  });
  console.log(`Created Shuttlecock Batch: 60 balls (310k/tube)`);

  // 8. Danh mục nước
  const drinkAquafina = await prisma.drinkItem.create({
    data: { name: 'Nước suối Aquafina 500ml', unitPrice: 10000, isSharedPitcher: false },
  });
  const drinkRevive = await prisma.drinkItem.create({
    data: { name: 'Revive Chanh Muối', unitPrice: 15000, isSharedPitcher: false },
  });
  const drinkSting = await prisma.drinkItem.create({
    data: { name: 'Sting Dâu', unitPrice: 15000, isSharedPitcher: false },
  });
  const drinkPitcher = await prisma.drinkItem.create({
    data: { name: 'Ca Trà Đá Lớn', unitPrice: 25000, isSharedPitcher: true },
  });

  // 9. Tạo Buổi đánh mẫu: "Buổi 15" theo Mục 25
  const session15 = await prisma.session.create({
    data: {
      quarterId: quarter1.id,
      venueId: venue.id,
      schedulePlanId: schedulePlan1.id,
      sessionCode: 'B-15',
      sessionDate: new Date('2026-02-17T18:00:00Z'),
      startTime: '18:00',
      endTime: '20:00',
      status: SessionStatus.OPEN,
      targetPlayers: 8,
      guestSurcharge: 10000,
      totalCourtFee: 200000, // 2 giờ x 100k = 200k (hoặc tổng thanh toán)
      totalShuttleFee: Math.ceil((310000 / 12) * 4), // 4 quả Yonex: ~103.334đ
      totalDrinkFee: 25000, // 1 ca nước lớn do Đức mua
      totalOtherFee: 0,
      totalExpense: 200000 + Math.ceil((310000 / 12) * 4) + 25000,
    },
  });

  // Thuê sân 1 trong 2 tiếng
  await prisma.sessionCourt.create({
    data: {
      sessionId: session15.id,
      courtName: 'Sân 1',
      hours: 2.0,
      hourlyRate: 100000,
      totalCost: 200000,
    },
  });

  // Sử dụng 4 quả cầu trong kho
  await prisma.shuttlecockUsage.create({
    data: {
      sessionId: session15.id,
      batchId: batch.id,
      ballsUsed: 4,
      pricePerBall: 310000 / 12,
      totalCost: Math.ceil((310000 / 12) * 4),
    },
  });

  // 1 ca nước do Đức mua ứng
  const sessionDrink1 = await prisma.sessionDrink.create({
    data: {
      sessionId: session15.id,
      drinkItemId: drinkPitcher.id,
      quantity: 1,
      unitPrice: 25000,
      totalCost: 25000,
      payerUserId: createdUsers['Phạm Hồng Đức'].id,
      isShared: true,
    },
  });

  // Danh sách người tham gia buổi 15:
  // 6 thành viên cố định đi: Tùng, Đức, Chính, Giang, Nam, Huy
  // 2 thành viên nghỉ: Linh (nghỉ hợp lệ trước 6h), Hoàng (nghỉ muộn)
  // 2 Guest: Khách Tuấn, Khách Bình
  const participants = [
    { name: 'Nguyễn Đức Tùng', isGuest: false, status: AttendanceStatus.ATTENDING, user: createdUsers['Nguyễn Đức Tùng'] },
    { name: 'Phạm Hồng Đức', isGuest: false, status: AttendanceStatus.ATTENDING, user: createdUsers['Phạm Hồng Đức'] },
    { name: 'Trần Văn Chính', isGuest: false, status: AttendanceStatus.ATTENDING, user: createdUsers['Trần Văn Chính'] },
    { name: 'Lê Trường Giang', isGuest: false, status: AttendanceStatus.ATTENDING, user: createdUsers['Lê Trường Giang'] },
    { name: 'Vũ Hoài Nam', isGuest: false, status: AttendanceStatus.ATTENDING, user: createdUsers['Vũ Hoài Nam'] },
    { name: 'Đỗ Quang Huy', isGuest: false, status: AttendanceStatus.ATTENDING, user: createdUsers['Đỗ Quang Huy'] },
    { name: 'Bùi Thùy Linh', isGuest: false, status: AttendanceStatus.ABSENT_VALID, user: createdUsers['Bùi Thùy Linh'] },
    { name: 'Ngô Việt Hoàng', isGuest: false, status: AttendanceStatus.ABSENT_LATE, user: createdUsers['Ngô Việt Hoàng'] },
    { name: 'Tuấn (Giao lưu)', isGuest: true, status: AttendanceStatus.ATTENDING, phone: '0999111222' },
    { name: 'Bình (Giao lưu)', isGuest: true, status: AttendanceStatus.ATTENDING, phone: '0999333444' },
  ];

  for (const p of participants) {
    await prisma.sessionParticipant.create({
      data: {
        sessionId: session15.id,
        userId: p.user?.id || null,
        isGuest: p.isGuest,
        guestName: p.isGuest ? p.name : null,
        guestPhone: p.isGuest ? p.phone : null,
        attendanceStatus: p.status,
      },
    });
  }

  // Tùng ứng tiền sân 200.000đ
  await prisma.expenseAdvance.create({
    data: {
      sessionId: session15.id,
      userId: createdUsers['Nguyễn Đức Tùng'].id,
      amount: 200000,
      notes: 'Tùng trả tiền thuê sân',
    },
  });

  // Đức ứng tiền nước 25.000đ
  await prisma.expenseAdvance.create({
    data: {
      sessionId: session15.id,
      userId: createdUsers['Phạm Hồng Đức'].id,
      amount: 25000,
      notes: 'Đức mua ca trà đá lớn',
    },
  });

  console.log(`Seeding completed successfully!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
