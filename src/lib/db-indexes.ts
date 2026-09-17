import type { Db } from 'mongodb';

let indexPromise: Promise<void> | undefined;

/** Indexes that enforce idempotency for settlement side effects. */
export function ensureOperationalIndexes(db: Db): Promise<void> {
  indexPromise ??= Promise.all([
    db.collection('session_settlements').createIndex({ id: 1 }, { unique: true }),
    db.collection('inventory_movements').createIndex({ id: 1 }, { unique: true }),
    db.collection('shuttle_batches').createIndex({ id: 1 }, { unique: true }),
    db.collection('quarter_settlements').createIndex({ id: 1 }, { unique: true }),
    db.collection('quarter_settlements').createIndex(
      { quarterId: 1, version: 1 }, { unique: true }
    ),
    db.collection('quarter_balance_carryovers').createIndex({ id: 1 }, { unique: true }),
    db.collection('audit_logs').createIndex({ id: 1 }, { unique: true }),
    db.collection('audit_logs').createIndex({ createdAt: -1 }),
    db.collection('payments').createIndex({ id: 1 }, { unique: true }),
    db.collection('payments').createIndex(
      { settlementId: 1, participantId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          settlementId: { $type: 'string' },
          participantId: { $type: 'string' },
        },
      }
    ),
    db.collection('payment_events').createIndex({ id: 1 }, { unique: true }),
    db.collection('treasury').createIndex({ id: 1 }, { unique: true }),
    db.collection('treasury').createIndex(
      { paymentId: 1, createdAt: 1 },
      { partialFilterExpression: { paymentId: { $type: 'string' } } }
    ),
    db.collection('treasury').createIndex(
      { reversesEntryId: 1 },
      { unique: true, partialFilterExpression: { reversesEntryId: { $type: 'string' } } }
    ),
    db.collection('treasury').createIndex(
      { settlementId: 1, type: 1 },
      {
        unique: true,
        partialFilterExpression: { settlementId: { $type: 'string' }, type: 'GUEST_SURCHARGE' },
      }
    ),
  ]).then(() => undefined).catch((error) => {
    indexPromise = undefined;
    throw error;
  });

  return indexPromise;
}
