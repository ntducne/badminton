import type { Db } from 'mongodb';

let indexPromise: Promise<void> | undefined;

/** Indexes that enforce idempotency for settlement side effects. */
export function ensureOperationalIndexes(db: Db): Promise<void> {
  indexPromise ??= Promise.all([
    db.collection('session_settlements').createIndex({ id: 1 }, { unique: true }),
    db.collection('inventory_movements').createIndex({ id: 1 }, { unique: true }),
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

