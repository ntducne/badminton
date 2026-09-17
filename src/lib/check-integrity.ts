import { getMongoClient } from './db.ts';
import type { InventoryMovement, Payment, Quarter, SessionSettlement, ShuttlecockBatch, TreasuryEntry } from './types.ts';

const client = await getMongoClient();
const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
const errors: string[] = [];
const warnings: string[] = [];
const paymentOutstanding = (payment: Payment) => payment.status === 'CANCELLED' || payment.status === 'REFUNDED'
  ? 0
  : Math.max(0, payment.expectedAmount - payment.paidAmount + payment.refundedAmount);

const [batches, movements, entries, quarters, payments, settlements] = await Promise.all([
  db.collection<ShuttlecockBatch>('shuttle_batches').find({}).toArray(),
  db.collection<InventoryMovement>('inventory_movements').find({}).toArray(),
  db.collection<TreasuryEntry>('treasury').find({ status: 'POSTED' }).toArray(),
  db.collection<Quarter>('quarters').find({}).toArray(),
  db.collection<Payment>('payments').find({ status: { $nin: ['CANCELLED', 'REFUNDED'] } }).toArray(),
  db.collection<SessionSettlement>('session_settlements').find({ status: 'POSTED' }).toArray(),
]);

for (const batch of batches) {
  const reconstructed = movements.filter((movement) => movement.batchId === batch.id)
    .reduce((sum, movement) => sum + movement.quantity, 0);
  if (reconstructed !== batch.remainingBalls) {
    errors.push(`Batch ${batch.id}: movement=${reconstructed}, document=${batch.remainingBalls}`);
  }
  if (batch.remainingBalls < Number(process.env.LOW_STOCK_THRESHOLD || 12)) {
    warnings.push(`Low stock ${batch.id}: ${batch.remainingBalls}`);
  }
}

for (const settlement of settlements) {
  const expectedUsage = settlement.calculation.totalShuttleFee > 0;
  const hasMovement = movements.some((movement) => movement.settlementId === settlement.id && movement.type === 'SESSION_USAGE');
  if (expectedUsage && !hasMovement) errors.push(`Settlement ${settlement.id} thiếu inventory movement`);
}

const now = Date.now();
for (const payment of payments) {
  if (payment.dueAt && new Date(payment.dueAt).getTime() < now && paymentOutstanding(payment) > 0) {
    warnings.push(`Overdue payment ${payment.id}: ${paymentOutstanding(payment)}`);
  }
}

const quarterBalances = quarters.map((quarter) => {
  const quarterEntries = entries.filter((entry) => entry.quarterId === quarter.id);
  const ledgerBalance = (quarter.startingBalance || 0)
    + quarterEntries.filter((entry) => entry.direction === 'IN').reduce((sum, entry) => sum + entry.amount, 0)
    - quarterEntries.filter((entry) => entry.direction === 'OUT').reduce((sum, entry) => sum + entry.amount, 0);
  return { quarterId: quarter.id, ledgerBalance };
});

console.log(JSON.stringify({
  level: errors.length ? 'error' : 'info', event: 'integrity_check',
  database: db.databaseName, errors, warnings, quarterBalances, checkedAt: new Date().toISOString(),
}, null, 2));
await client.close();
if (errors.length) process.exitCode = 1;
