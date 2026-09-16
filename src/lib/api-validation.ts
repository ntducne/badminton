import { NextResponse } from 'next/server';
import { z } from 'zod';

const id = z.string().trim().min(1).max(120);
const money = z.coerce.number().int().min(0).max(1_000_000_000);
const positiveMoney = z.coerce.number().int().positive().max(1_000_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có định dạng HH:mm');
const shortText = z.string().trim().min(1).max(160);
const optionalNote = z.string().trim().max(1000).optional();

export const loginSchema = z.strictObject({
  phone: z.string().trim().regex(/^\d{8,15}$/, 'Số điện thoại không hợp lệ'),
  password: z.string().min(1).max(128),
});

export const createSessionSchema = z.strictObject({
  quarterId: id.optional(),
  venueId: id.optional(),
  venueName: shortText.optional(),
  sessionDate: date,
  startTime: time.default('18:00'),
  endTime: time.default('20:00'),
  targetPlayers: z.coerce.number().int().min(1).max(100).default(8),
  guestSurcharge: money.default(10000),
  hourlyRate: positiveMoney.default(100000),
  courtNumbers: z.string().trim().min(1).max(300).default('Sân 1'),
}).refine((value) => value.endTime > value.startTime, {
  message: 'Giờ kết thúc phải sau giờ bắt đầu',
  path: ['endTime'],
});

const courtSchema = z.strictObject({
  id,
  sessionId: id,
  courtName: shortText,
  hours: z.number().positive().max(24),
  hourlyRate: money,
  totalCost: money,
});

const shuttleUsageSchema = z.strictObject({
  id,
  sessionId: id,
  batchId: id,
  brandName: shortText,
  ballsUsed: z.number().int().positive().max(1000),
  pricePerBall: money,
  totalCost: money,
});

const drinkAssignmentSchema = z.strictObject({
  participantId: id,
  participantName: shortText,
  quantity: z.number().positive().max(100),
  amount: money,
});

const sessionDrinkSchema = z.strictObject({
  id,
  sessionId: id,
  drinkItemId: id,
  drinkName: shortText,
  isShared: z.boolean(),
  quantity: z.number().positive().max(1000),
  unitPrice: money,
  totalCost: money,
  payerUserId: id.optional(),
  payerName: shortText.optional(),
  assignedParticipants: z.array(drinkAssignmentSchema).max(200).optional(),
});

const expenseSchema = z.strictObject({
  id,
  sessionId: id,
  category: z.enum(['COURT', 'SHUTTLE', 'DRINK', 'OTHER']),
  title: shortText,
  amount: money,
  notes: optionalNote,
  splitParticipantIds: z.array(id).max(200),
});

const advanceSchema = z.strictObject({
  id,
  sessionId: id,
  expenseId: id.optional(),
  userId: id,
  userName: shortText,
  amount: positiveMoney,
  refundStatus: z.enum(['UNREFUNDED', 'PARTIAL', 'REFUNDED']),
  refundedAmount: money,
  notes: optionalNote,
  createdAt: z.string().datetime(),
});

export const updateSessionSchema = z.strictObject({
  venueId: id.optional(),
  venueName: shortText.optional(),
  schedulePlanId: id.optional(),
  sessionDate: date.optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  targetPlayers: z.number().int().min(1).max(100).optional(),
  guestSurcharge: money.optional(),
  courts: z.array(courtSchema).max(20).optional(),
  shuttleUsages: z.array(shuttleUsageSchema).max(100).optional(),
  drinks: z.array(sessionDrinkSchema).max(200).optional(),
  expenses: z.array(expenseSchema).max(200).optional(),
  advances: z.array(advanceSchema).max(200).optional(),
}).refine(
  (value) => !value.startTime || !value.endTime || value.endTime > value.startTime,
  { message: 'Giờ kết thúc phải sau giờ bắt đầu', path: ['endTime'] }
);

export const attendanceSchema = z.strictObject({
  participantId: id.optional(),
  status: z.enum(['ATTENDING', 'ABSENT']),
});

export const guestSchema = z.strictObject({
  name: shortText,
  phone: z.string().trim().regex(/^\d{8,15}$/, 'Số điện thoại không hợp lệ').optional().or(z.literal('')),
});

export const settleSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('SETTLE'), notes: optionalNote }),
  z.strictObject({ action: z.literal('REOPEN'), notes: z.string().trim().min(1).max(1000) }),
]);

export const statusTransitionSchema = z.strictObject({
  status: z.enum(['OPEN', 'LOCKED', 'CANCELLED']),
  reason: optionalNote,
});

export const shuttleBatchSchema = z.strictObject({
  brandName: shortText,
  tubeQuantity: z.coerce.number().int().min(1).max(1000),
  ballsPerTube: z.coerce.number().int().min(1).max(100),
  pricePerTube: positiveMoney,
  payerUserId: id.optional(),
  payerName: shortText.optional(),
  isPaidFromTreasury: z.boolean().optional().default(false),
  notes: optionalNote,
});

export const drinkSchema = z.strictObject({
  name: shortText,
  unitPrice: positiveMoney,
  isSharedPitcher: z.boolean().optional().default(false),
});

export const vietQrQuerySchema = z.strictObject({
  amount: z.coerce.number().int().positive().max(100_000_000),
  description: z.string().trim().min(1).max(80).default('Tien cau long'),
});

export class RequestValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super('Dữ liệu không hợp lệ');
    this.name = 'RequestValidationError';
  }
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RequestValidationError([{ code: 'custom', path: [], message: 'JSON không hợp lệ', input: undefined }]);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new RequestValidationError(result.error.issues);
  return result.data;
}

export function validationErrorResponse(error: RequestValidationError) {
  return NextResponse.json({
    error: error.message,
    code: 'VALIDATION_ERROR',
    issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  }, { status: 400 });
}
