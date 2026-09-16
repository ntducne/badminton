export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export type QuarterStatus = 'PLANNING' | 'ACTIVE' | 'SETTLED' | 'CLOSED';

export type SessionStatus = 'DRAFT' | 'OPEN' | 'LOCKED' | 'SETTLED' | 'REOPENED' | 'CANCELLED';

export type SettlementStatus = 'POSTED' | 'REVERSED';

export type InventoryMovementType = 'SESSION_USAGE' | 'REVERSAL';

export type AttendanceStatus = 'ATTENDING' | 'ABSENT_VALID' | 'ABSENT_LATE' | 'NOT_CONFIRMED';

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID' | 'REFUNDED';

export type RefundStatus = 'UNREFUNDED' | 'PARTIAL' | 'REFUNDED';

export type ExpenseCategory = 'COURT' | 'SHUTTLE' | 'DRINK' | 'OTHER';

export type PaymentType = 'QUARTER_FEE' | 'SESSION_FEE' | 'GUEST_FEE' | 'DEBT_PAYMENT' | 'OTHER_INCOME';

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  password?: string;
  role: Role;
  avatarUrl?: string;
  bankName?: string;
  bankAccount?: string;
  accountName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Quarter {
  id: string;
  name: string;
  year: number;
  quarterNumber: number;
  startDate: string;
  endDate: string;
  status: QuarterStatus;
  defaultGuestSurcharge: number;
  defaultTargetPlayers: number;
  autoTransferBalance: boolean;
  startingBalance: number;
  currentBalance: number;
  notes?: string;
  createdAt: string;
}

export interface QuarterMember {
  id: string;
  quarterId: string;
  userId: string;
  userName: string;
  userPhone: string;
  fixedCourtFee: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  joinedDate: string;
  leftDate?: string;
  refundAmount: number;
  isActive: boolean;
  notes?: string;
}

export interface VenueCourt {
  id: string;
  courtNumber: string;
  hourlyRate?: number;
}

export interface Venue {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  googleMapUrl?: string;
  defaultHourlyRate: number;
  notes?: string;
  courts: VenueCourt[];
  createdAt: string;
}

export interface SchedulePlan {
  id: string;
  quarterId: string;
  venueId: string;
  venueName: string;
  dayOfWeek: number; // 0=Chủ nhật, 1=Thứ 2, ..., 6=Thứ 7
  startTime: string; // "18:00"
  endTime: string; // "20:00"
  numberOfCourts: number;
  courtNumbers: string;
  targetPlayers: number;
  estimatedHourlyPrice: number;
  isActive: boolean;
}

export interface SessionCourt {
  id: string;
  sessionId: string;
  courtName: string;
  hours: number;
  hourlyRate: number;
  totalCost: number;
}

export interface SessionParticipant {
  id: string;
  sessionId: string;
  userId?: string;
  userName: string;
  userPhone?: string;
  isGuest: boolean;
  attendanceStatus: AttendanceStatus;
  confirmedAt?: string;
  confirmedBy?: string;
  courtFeeShare: number;
  shuttleFeeShare: number;
  drinkFeeShare: number;
  otherFeeShare: number;
  guestSurcharge: number;
  totalCost: number;
  totalAdvanced: number;
  totalPaid: number;
  debtAmount: number;
  netSettlement: number; // >0: phải nộp thêm; <0: nhóm nợ hoàn trả
  paymentStatus: PaymentStatus;
}

export interface ShuttlecockBatch {
  id: string;
  brandName: string;
  batchCode: string;
  tubeQuantity: number;
  ballsPerTube: number;
  totalBalls: number;
  remainingBalls: number;
  pricePerTube: number;
  pricePerBall: number;
  purchaseDate: string;
  payerUserId?: string;
  payerName?: string;
  isPaidFromTreasury: boolean;
  notes?: string;
}

export interface ShuttlecockUsage {
  id: string;
  sessionId: string;
  batchId: string;
  brandName: string;
  ballsUsed: number;
  pricePerBall: number;
  totalCost: number;
}

export interface DrinkItem {
  id: string;
  name: string;
  isSharedPitcher: boolean;
  unitPrice: number;
  isActive: boolean;
}

export interface SessionDrink {
  id: string;
  sessionId: string;
  drinkItemId: string;
  drinkName: string;
  isShared: boolean;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  payerUserId?: string;
  payerName?: string;
  assignedParticipants?: {
    participantId: string;
    participantName: string;
    quantity: number;
    amount: number;
  }[];
}

export interface SessionExpense {
  id: string;
  sessionId: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  notes?: string;
  splitParticipantIds: string[];
}

export interface ExpenseAdvance {
  id: string;
  sessionId: string;
  expenseId?: string;
  userId: string;
  userName: string;
  amount: number;
  refundStatus: RefundStatus;
  refundedAmount: number;
  notes?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  quarterId: string;
  venueId: string;
  venueName: string;
  schedulePlanId?: string;
  sessionCode: string;
  sessionDate: string; // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
  status: SessionStatus;
  version?: number;
  settlementVersion?: number;
  currentSettlementId?: string;
  targetPlayers: number;
  guestSurcharge: number;
  totalCourtFee: number;
  totalShuttleFee: number;
  totalDrinkFee: number;
  totalOtherFee: number;
  totalExpense: number;
  totalGuestRevenue: number;
  isSettled: boolean;
  settledAt?: string;
  settledByUserId?: string;
  settledByName?: string;
  settlementNotes?: string;
  reopenedAt?: string;
  reopenedByUserId?: string;
  courts: SessionCourt[];
  participants: SessionParticipant[];
  shuttleUsages: ShuttlecockUsage[];
  drinks: SessionDrink[];
  expenses: SessionExpense[];
  advances: ExpenseAdvance[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionSettlement {
  id: string;
  sessionId: string;
  quarterId: string;
  version: number;
  status: SettlementStatus;
  calculation: SessionCalculation;
  notes?: string;
  settledByUserId: string;
  settledByName: string;
  settledAt: string;
  reversedAt?: string;
  reversedByUserId?: string;
  reversedByName?: string;
  reversalReason?: string;
}

export interface InventoryMovement {
  id: string;
  batchId: string;
  sessionId: string;
  settlementId: string;
  usageId: string;
  type: InventoryMovementType;
  quantity: number;
  unitCost: number;
  reversesMovementId?: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export interface SettlementTreasuryEntry {
  id: string;
  quarterId: string;
  sessionId: string;
  settlementId: string;
  amount: number;
  type: 'GUEST_SURCHARGE' | 'REVERSAL';
  status: SettlementStatus;
  description: string;
  reversesEntryId?: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  sessionId?: string;
  quarterId?: string;
  participantId?: string;
  userId?: string;
  payerName: string;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  billImageUrl?: string;
  confirmedByUserId?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface TreasuryLog {
  id: string;
  quarterId?: string;
  sessionId?: string;
  amount: number;
  balanceAfter: number;
  type: string;
  description: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  oldData?: unknown;
  newData?: unknown;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface MemberReport {
  id: string;
  userId: string;
  name: string;
  phone: string;
  role: Role;
  attendedCount: number;
  absentValidCount: number;
  absentLateCount: number;
  fixedCourtFee: number;
  paidCourtFee: number;
  estimatedQuarterRefund: number;
  totalSessionDebt: number | null;
  totalAdvanced: number | null;
  netDebt: number | null;
  isMe: boolean;
}

export interface TreasurySummary {
  quarterName: string;
  startingBalance: number;
  totalMemberPaid: number;
  totalGuestRevenue: number;
  totalSessionsExpense: number;
  totalAdvancedByMembers: number;
  currentFundBalance: number;
  recentLogs: TreasuryLog[];
}

export type SessionCalculation = ReturnType<typeof import('./calculations').calculateSessionFinances>;
