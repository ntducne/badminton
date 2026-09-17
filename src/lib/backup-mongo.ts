import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMongoClient } from './db.ts';

const database = process.env.MONGO_DB_DATABASE || 'badminton_db';
const baseDirectory = resolve(process.env.BACKUP_DIRECTORY || resolve(process.cwd(), 'backups'));
const timestamp = new Date().toISOString().replaceAll(':', '-');
const outputDirectory = resolve(baseDirectory, `${database}-${timestamp}`);
if (!outputDirectory.startsWith(`${baseDirectory}/`)) throw new Error('Invalid backup path');

mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const client = await getMongoClient();
const db = client.db(database);
const collections = await db.listCollections({}, { nameOnly: true }).toArray();
const manifest: Array<{ collection: string; documents: number }> = [];
for (const { name } of collections) {
  const documents = await db.collection(name).find({}).toArray();
  writeFileSync(resolve(outputDirectory, `${name}.json`), JSON.stringify(documents, null, 2), { mode: 0o600 });
  manifest.push({ collection: name, documents: documents.length });
}
writeFileSync(
  resolve(outputDirectory, 'manifest.json'),
  JSON.stringify({ database, timestamp, collections: manifest }, null, 2),
  { mode: 0o600 }
);
await client.close();
console.log(JSON.stringify({
  level: 'info', event: 'mongodb_backup_complete', database, outputDirectory,
  collections: manifest.length, createdAt: new Date().toISOString(),
}));
