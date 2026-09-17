import type { AuthSessionUser } from './auth';
import { getMongoClient } from './db';
import { ensureOperationalIndexes } from './db-indexes';
import type { InventoryMovement, Payment, Quarter, ShuttlecockBatch, TreasuryEntry } from './types';

export class InventoryError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'InventoryError';
  }
}

type PurchaseInput = {
  quarterId?: string;
  brandName: string;
  tubeQuantity: number;
  ballsPerTube: number;
  pricePerTube: number;
  payerUserId?: string;
  payerName?: string;
  isPaidFromTreasury: boolean;
  notes?: string;
};

export async function purchaseShuttleBatch(
  input: PurchaseInput,
  user: AuthSessionUser,
  requestId: string
): Promise<ShuttlecockBatch> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  await ensureOperationalIndexes(db);
  const mongoSession = client.startSession();
  let created: ShuttlecockBatch | undefined;
  try {
    await mongoSession.withTransaction(async () => {
      const quarter = input.quarterId
        ? await db.collection<Quarter>('quarters').findOne({ id: input.quarterId }, { session: mongoSession })
        : await db.collection<Quarter>('quarters').findOne({ status: 'ACTIVE' }, { session: mongoSession });
      if (!quarter) throw new InventoryError('Không tìm thấy quý để hạch toán lô cầu', 409);

      const now = new Date().toISOString();
      const id = `batch-${crypto.randomUUID()}`;
      const totalBalls = input.tubeQuantity * input.ballsPerTube;
      const totalAmount = input.tubeQuantity * input.pricePerTube;
      const payerUserId = input.payerUserId || user.id;
      const payerName = input.payerName || user.name;
      created = {
        id,
        brandName: input.brandName,
        batchCode: `BATCH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        tubeQuantity: input.tubeQuantity,
        ballsPerTube: input.ballsPerTube,
        totalBalls,
        remainingBalls: totalBalls,
        pricePerTube: input.pricePerTube,
        pricePerBall: Math.ceil(input.pricePerTube / input.ballsPerTube),
        purchaseDate: now.slice(0, 10),
        payerUserId,
        payerName,
        isPaidFromTreasury: input.isPaidFromTreasury,
        notes: input.notes,
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection<ShuttlecockBatch>('shuttle_batches').insertOne(created, { session: mongoSession });

      const movement: InventoryMovement = {
        id: `inventory:purchase:${id}`,
        batchId: id,
        type: 'PURCHASE',
        quantity: totalBalls,
        unitCost: created.pricePerBall,
        reason: input.notes || 'Nhập lô cầu',
        createdByUserId: user.id,
        createdByName: user.name,
        createdAt: now,
      };
      await db.collection<InventoryMovement>('inventory_movements').insertOne(movement, { session: mongoSession });

      if (input.isPaidFromTreasury) {
        const entry: TreasuryEntry = {
          id: `treasury:shuttle-purchase:${id}`,
          quarterId: quarter.id,
          type: 'SHUTTLE_PURCHASE',
          amount: totalAmount,
          direction: 'OUT',
          status: 'POSTED',
          description: `Mua ${input.tubeQuantity} ống ${input.brandName}`,
          createdByUserId: user.id,
          createdByName: user.name,
          createdAt: now,
        };
        await db.collection<TreasuryEntry>('treasury').insertOne(entry, { session: mongoSession });
      } else {
        const payment: Payment = {
          id: `payment:shuttle-advance:${id}`,
          payerType: 'MEMBER',
          payerId: payerUserId,
          payerName,
          quarterId: quarter.id,
          direction: 'PAYABLE',
          expectedAmount: totalAmount,
          paidAmount: 0,
          refundedAmount: 0,
          status: 'PENDING',
          reference: `SHUTTLE_PURCHASE:${id}`,
          dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection<Payment>('payments').insertOne(payment, { session: mongoSession });
      }

      await db.collection('audit_logs').insertOne({
        id: `audit:inventory:purchase:${id}`,
        entityType: 'SHUTTLE_BATCH',
        entityId: id,
        action: 'PURCHASE',
        newData: { batch: created, movement, totalAmount, quarterId: quarter.id },
        userId: user.id,
        userName: user.name,
        requestId,
        createdAt: now,
      }, { session: mongoSession });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await mongoSession.endSession();
  }
  if (!created) throw new InventoryError('Không thể nhập kho cầu', 500);
  return created;
}

export async function adjustShuttleStock(
  input: { action: 'DAMAGED'; batchId: string; quantity: number; reason: string; version: number }
    | { action: 'ADJUSTMENT'; batchId: string; newRemaining: number; reason: string; version: number },
  user: AuthSessionUser,
  requestId: string
): Promise<ShuttlecockBatch> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  await ensureOperationalIndexes(db);
  const mongoSession = client.startSession();
  let result: ShuttlecockBatch | undefined;
  try {
    await mongoSession.withTransaction(async () => {
      const batch = await db.collection<ShuttlecockBatch>('shuttle_batches').findOne(
        { id: input.batchId }, { session: mongoSession }
      );
      if (!batch) throw new InventoryError('Không tìm thấy lô cầu', 404);
      if ((batch.version || 0) !== input.version) throw new InventoryError('Lô cầu vừa được cập nhật', 409);
      const nextRemaining = input.action === 'DAMAGED'
        ? batch.remainingBalls - input.quantity
        : input.newRemaining;
      if (nextRemaining < 0 || nextRemaining > batch.totalBalls) {
        throw new InventoryError('Số tồn mới phải nằm trong giới hạn của lô', 409);
      }
      const delta = nextRemaining - batch.remainingBalls;
      if (delta === 0) throw new InventoryError('Số tồn không thay đổi');
      const now = new Date().toISOString();
      result = {
        ...batch,
        remainingBalls: nextRemaining,
        version: (batch.version || 0) + 1,
        updatedAt: now,
      };
      const replaced = await db.collection<ShuttlecockBatch>('shuttle_batches').replaceOne(
        { id: batch.id, version: batch.version || 0 }, result, { session: mongoSession }
      );
      if (replaced.modifiedCount !== 1) throw new InventoryError('Lô cầu vừa được cập nhật', 409);

      const movement: InventoryMovement = {
        id: `inventory:${input.action.toLowerCase()}:${crypto.randomUUID()}`,
        batchId: batch.id,
        type: input.action,
        quantity: delta,
        unitCost: batch.pricePerBall,
        reason: input.reason,
        createdByUserId: user.id,
        createdByName: user.name,
        createdAt: now,
      };
      await db.collection<InventoryMovement>('inventory_movements').insertOne(movement, { session: mongoSession });
      await db.collection('audit_logs').insertOne({
        id: `audit:${movement.id}`,
        entityType: 'SHUTTLE_BATCH',
        entityId: batch.id,
        action: input.action,
        oldData: { remainingBalls: batch.remainingBalls, version: batch.version || 0 },
        newData: { remainingBalls: nextRemaining, version: result.version, movementId: movement.id },
        reason: input.reason,
        userId: user.id,
        userName: user.name,
        requestId,
        createdAt: now,
      }, { session: mongoSession });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await mongoSession.endSession();
  }
  if (!result) throw new InventoryError('Không thể cập nhật kho', 500);
  return result;
}
