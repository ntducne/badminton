import { Session, SessionParticipant, AttendanceStatus } from './types';

/**
 * Làm tròn lên đến hàng nghìn đồng (theo nghiệp vụ: làm tròn lên để bảo toàn quỹ)
 */
export function ceilToThousand(amount: number): number {
  if (amount <= 0) return 0;
  return Math.ceil(amount / 1000) * 1000;
}

/**
 * Định dạng tiền tệ VNĐ chuẩn
 */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Định dạng tiền tệ rút gọn (VD: 56k, 1.2 tr)
 */
export function formatMoneyShort(amount: number | null | undefined): string {
  if (!amount || isNaN(amount)) return '0';
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr`;
  }
  return `${Math.round(amount / 1_000).toLocaleString('vi-VN')}k`;
}

/**
 * Kiểm tra xem thời điểm hiện tại có trước deadline 6 tiếng hay không
 */
export function checkIsBeforeDeadline(sessionDateStr: string, startTimeStr: string): boolean {
  try {
    const sessionStart = new Date(`${sessionDateStr}T${startTimeStr}:00`);
    const now = new Date();
    const diffMs = sessionStart.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours >= 6;
  } catch {
    return false;
  }
}

/**
 * Động cơ tính toán tài chính chi tiết cho một buổi đánh
 */
export function calculateSessionFinances(session: Session) {
  // 1. Lọc danh sách người thực tế tham gia chơi
  const activeParticipants = session.participants.filter(
    (p) => p.attendanceStatus === 'ATTENDING'
  );
  const activeCount = activeParticipants.length;

  // 2. Tiền sân:
  const totalCourtFee = session.courts.reduce((sum, c) => sum + (c.totalCost || 0), 0);
  const courtFeePerPerson = activeCount > 0 ? ceilToThousand(totalCourtFee / activeCount) : 0;

  // 3. Tiền cầu:
  const totalShuttleFee = session.shuttleUsages.reduce((sum, u) => sum + (u.totalCost || 0), 0);
  const shuttleFeePerPerson = activeCount > 0 ? ceilToThousand(totalShuttleFee / activeCount) : 0;

  // 4. Tiền nước:
  let totalDrinkFee = 0;
  const drinkShareMap: Record<string, number> = {};

  for (const drink of session.drinks) {
    totalDrinkFee += drink.totalCost || 0;
    if (drink.assignedParticipants && drink.assignedParticipants.length > 0) {
      for (const share of drink.assignedParticipants) {
        drinkShareMap[share.participantId] = (drinkShareMap[share.participantId] || 0) + share.amount;
      }
    }
  }

  // 5. Chi phí khác:
  let totalOtherFee = 0;
  const otherShareMap: Record<string, number> = {};

  for (const exp of session.expenses) {
    if (exp.category === 'OTHER') {
      totalOtherFee += exp.amount || 0;
      const splitIds = exp.splitParticipantIds || [];
      if (splitIds.length > 0) {
        const perPerson = ceilToThousand(exp.amount / splitIds.length);
        for (const pid of splitIds) {
          otherShareMap[pid] = (otherShareMap[pid] || 0) + perPerson;
        }
      }
    }
  }

  // 6. Tính toán cho từng người:
  let totalGuestRevenue = 0;

  const updatedParticipants: SessionParticipant[] = session.participants.map((p) => {
    if (p.attendanceStatus !== 'ATTENDING') {
      // Người nghỉ buổi
      return {
        ...p,
        courtFeeShare: 0,
        shuttleFeeShare: 0,
        drinkFeeShare: 0,
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 0,
        debtAmount: 0,
        netSettlement: 0 - p.totalAdvanced, // Nếu nghỉ mà đã ứng tiền thì nhóm vẫn nợ hoàn trả
        paymentStatus: p.totalAdvanced > 0 ? 'PAID' : 'PAID',
      };
    }

    const courtShare = courtFeePerPerson;
    const shuttleShare = shuttleFeePerPerson;
    const drinkShare = drinkShareMap[p.id] || 0;
    const otherShare = otherShareMap[p.id] || 0;
    const guestSurcharge = p.isGuest ? session.guestSurcharge || 0 : 0;

    // Tổng chi phí buổi của người này
    let totalCost = 0;
    if (p.isGuest) {
      // Guest: Sân + Cầu + Nước + Chi phí khác + Phụ thu guest
      totalCost = courtShare + shuttleShare + drinkShare + otherShare + guestSurcharge;
      totalGuestRevenue += totalCost;
    } else {
      // Thành viên cố định: Đã đóng tiền sân quý, tại buổi chỉ thanh toán Cầu + Nước + Khác
      totalCost = shuttleShare + drinkShare + otherShare;
    }

    // Net phải nộp hoặc nhận: TotalCost - Tiền đã ứng - Tiền đã trả
    const netSettlement = totalCost - (p.totalAdvanced || 0) - (p.totalPaid || 0);
    const debtAmount = netSettlement > 0 ? netSettlement : 0;

    let paymentStatus: SessionParticipant['paymentStatus'] = 'UNPAID';
    if (netSettlement <= 0) {
      paymentStatus = netSettlement < 0 ? 'OVERPAID' : 'PAID';
    } else if (p.totalPaid > 0) {
      paymentStatus = 'PARTIAL';
    }

    return {
      ...p,
      courtFeeShare: courtShare,
      shuttleFeeShare: shuttleShare,
      drinkFeeShare: drinkShare,
      otherFeeShare: otherShare,
      guestSurcharge,
      totalCost,
      debtAmount,
      netSettlement,
      paymentStatus,
    };
  });

  const totalExpense = totalCourtFee + totalShuttleFee + totalDrinkFee + totalOtherFee;

  // Tính số lượng tuyển guest:
  const attendingMembers = activeParticipants.filter((p) => !p.isGuest).length;
  const existingGuests = activeParticipants.filter((p) => p.isGuest).length;
  const targetPlayers = session.targetPlayers || 8;
  const neededGuests = Math.max(0, targetPlayers - attendingMembers - existingGuests);
  const totalAttending = attendingMembers + existingGuests;

  let playerStatusText = 'Đủ người';
  if (totalAttending < targetPlayers) {
    playerStatusText = `Thiếu ${targetPlayers - totalAttending} người`;
  } else if (totalAttending > targetPlayers) {
    playerStatusText = `Dư ${totalAttending - targetPlayers} người`;
  }

  return {
    totalCourtFee,
    totalShuttleFee,
    totalDrinkFee,
    totalOtherFee,
    totalExpense,
    totalGuestRevenue,
    courtFeePerPerson,
    shuttleFeePerPerson,
    activeCount,
    attendingMembers,
    existingGuests,
    neededGuests,
    playerStatusText,
    participants: updatedParticipants,
  };
}

