import { getDb } from './db.ts';
import { ensureOperationalIndexes } from './db-indexes.ts';

async function migrateStage1() {
  const db = await getDb();
  await ensureOperationalIndexes(db);

  const versionResult = await db.collection('sessions').updateMany(
    { version: { $exists: false } },
    { $set: { version: 0, settlementVersion: 0 } }
  );
  const settledResult = await db.collection('sessions').updateMany(
    { isSettled: true, status: { $ne: 'SETTLED' } },
    { $set: { status: 'SETTLED' } }
  );
  const flagResult = await db.collection('sessions').updateMany(
    { status: 'SETTLED', isSettled: { $ne: true } },
    { $set: { isSettled: true } }
  );

  console.log(JSON.stringify({
    database: db.databaseName,
    sessionsVersioned: versionResult.modifiedCount,
    statusesNormalized: settledResult.modifiedCount,
    settlementFlagsNormalized: flagResult.modifiedCount,
  }, null, 2));
}

migrateStage1().catch((error: unknown) => {
  console.error('Stage 1 migration failed:', error);
  process.exitCode = 1;
});

