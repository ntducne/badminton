import { MongoClient, Db } from 'mongodb';

const globalDb = globalThis as typeof globalThis & {
  mongoPromise?: Promise<MongoClient>;
};

export async function getDb(): Promise<Db> {
  if (!globalDb.mongoPromise) {
    const username = process.env.MONGO_DB_USERNAME;
    const password = process.env.MONGO_DB_PASSWORD;
    const credentials =
      username && password
        ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
        : '';
    const uri =
      process.env.MONGODB_URI ||
      `mongodb://${credentials}${process.env.MONGO_DB_HOST || '127.0.0.1'}:${process.env.MONGO_DB_PORT || '27017'}/?authSource=${encodeURIComponent(process.env.MONGO_DB_AUTH_SOURCE || 'admin')}`;

    globalDb.mongoPromise = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      ...(process.env.MONGO_DB_DIRECT_CONNECTION === 'true' ? { directConnection: true } : {}),
    })
      .connect()
      .catch((error) => {
        globalDb.mongoPromise = undefined;
        throw error;
      });
  }
  return (await globalDb.mongoPromise).db(process.env.MONGO_DB_DATABASE || 'badminton_db');
}

export async function getMongoClient(): Promise<MongoClient> {
  await getDb();
  if (!globalDb.mongoPromise) throw new Error('Không thể khởi tạo MongoDB client');
  return globalDb.mongoPromise;
}
