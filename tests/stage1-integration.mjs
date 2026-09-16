import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const databaseName = `badminton_stage1_test_${process.pid}`;
const port = 32000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) throw new Error('MONGODB_URI is required');

const client = new MongoClient(mongoUri);
let server;
let connected = false;
let serverOutput = '';

function fixtureSession(id, ballsUsed) {
  const now = new Date().toISOString();
  return {
    id,
    quarterId: 'q-test',
    venueId: 'v-test',
    venueName: 'Sân test',
    sessionCode: id,
    sessionDate: '2026-09-17',
    startTime: '18:00',
    endTime: '20:00',
    status: 'OPEN',
    version: 0,
    settlementVersion: 0,
    targetPlayers: 1,
    guestSurcharge: 10000,
    totalCourtFee: 100000,
    totalShuttleFee: ballsUsed * 10000,
    totalDrinkFee: 0,
    totalOtherFee: 0,
    totalExpense: 100000 + ballsUsed * 10000,
    totalGuestRevenue: 0,
    isSettled: false,
    courts: [{ id: `${id}:court`, sessionId: id, courtName: 'Sân 1', hours: 1, hourlyRate: 100000, totalCost: 100000 }],
    participants: [{
      id: `${id}:guest`, sessionId: id, userName: 'Guest Test', userPhone: '0999999999', isGuest: true,
      attendanceStatus: 'ATTENDING', courtFeeShare: 0, shuttleFeeShare: 0,
      drinkFeeShare: 0, otherFeeShare: 0, guestSurcharge: 10000,
      totalCost: 77777, totalAdvanced: 12000, totalPaid: 0, debtAmount: 77777,
      netSettlement: 77777, paymentStatus: 'UNPAID',
    }],
    shuttleUsages: [{
      id: `${id}:usage`, sessionId: id, batchId: 'batch-test', brandName: 'Test',
      ballsUsed, pricePerBall: 10000, totalCost: ballsUsed * 10000,
    }],
    drinks: [], expenses: [], advances: [], createdAt: now, updatedAt: now,
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Next.js test server did not start');
}

async function post(path, cookie, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

try {
  await client.connect();
  connected = true;
  const db = client.db(databaseName);
  const password = await bcrypt.hash('123456', 4);
  await db.collection('users').insertOne({
    id: 'owner-test', name: 'Owner Test', phone: '0900000000', password,
    role: 'OWNER', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await db.collection('users').insertOne({
    id: 'member-test', name: 'Member Test', phone: '0900000001', password,
    role: 'MEMBER', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await db.collection('shuttle_batches').insertOne({
    id: 'batch-test', brandName: 'Test', batchCode: 'TEST', tubeQuantity: 1,
    ballsPerTube: 12, totalBalls: 12, remainingBalls: 12, pricePerTube: 120000,
    pricePerBall: 10000, purchaseDate: '2026-09-17', isPaidFromTreasury: true,
  });
  await db.collection('sessions').insertMany([
    fixtureSession('session-ok', 4),
    fixtureSession('session-insufficient', 99),
  ]);

  server = spawn('node_modules/.bin/next', ['start', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, MONGO_DB_DATABASE: databaseName },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.on('data', (chunk) => { serverOutput += chunk; });
  await waitForServer();

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '0900000000', password: '123456' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'Login cookie missing');

  const memberLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '0900000001', password: '123456' }),
  });
  assert.equal(memberLogin.status, 200);
  const memberCookie = memberLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(memberCookie, 'Member login cookie missing');

  // Stage 2: authentication, authorization and strict validation.
  assert.equal((await fetch(`${baseUrl}/api/sessions`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/shuttle`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/vietqr?amount=10000`)).status, 401);
  const protectedPage = await fetch(`${baseUrl}/sessions`, { redirect: 'manual' });
  assert.equal(protectedPage.status, 307);
  assert.match(protectedPage.headers.get('location') || '', /\/login\?next=/);

  const forbiddenCreate = await post('/api/sessions', memberCookie, {
    sessionDate: '2026-10-01', startTime: '18:00', endTime: '20:00',
  });
  assert.equal(forbiddenCreate.status, 403);

  const memberDetail = await fetch(`${baseUrl}/api/sessions/session-ok`, { headers: { cookie: memberCookie } });
  assert.equal(memberDetail.status, 200);
  const hiddenParticipant = (await memberDetail.json()).session.participants[0];
  assert.equal(hiddenParticipant.userPhone, undefined);
  assert.equal(hiddenParticipant.totalCost, 0);
  assert.equal(hiddenParticipant.debtAmount, 0);

  const forgedUpdate = await fetch(`${baseUrl}/api/sessions/session-ok`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ status: 'SETTLED', totalExpense: 1 }),
  });
  assert.equal(forgedUpdate.status, 400);
  assert.equal((await forgedUpdate.json()).code, 'VALIDATION_ERROR');
  assert.equal((await db.collection('sessions').findOne({ id: 'session-ok' })).status, 'OPEN');

  const invalidGuest = await post('/api/sessions/session-ok/guests', cookie, { name: 'X', phone: 'abc' });
  assert.equal(invalidGuest.status, 400);

  const invalidJson = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: '{',
  });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).code, 'VALIDATION_ERROR');

  const qr = await fetch(`${baseUrl}/api/vietqr?amount=10000&description=Test&bankId=attacker`, {
    headers: { cookie: memberCookie },
  });
  const qrBody = await qr.json();
  assert.equal(qr.status, 200, JSON.stringify(qrBody));
  assert.notEqual(qrBody.bankId, 'attacker');

  const firstSettle = await post('/api/sessions/session-ok/settle', cookie, { action: 'SETTLE' });
  assert.equal(firstSettle.status, 200, await firstSettle.text());
  assert.equal((await db.collection('shuttle_batches').findOne({ id: 'batch-test' })).remainingBalls, 8);
  assert.equal(await db.collection('session_settlements').countDocuments({ sessionId: 'session-ok' }), 1);
  assert.equal(await db.collection('treasury').countDocuments({ sessionId: 'session-ok', type: 'GUEST_SURCHARGE' }), 1);

  const repeatedSettle = await post('/api/sessions/session-ok/settle', cookie, { action: 'SETTLE' });
  assert.equal(repeatedSettle.status, 200, await repeatedSettle.text());
  assert.equal((await db.collection('shuttle_batches').findOne({ id: 'batch-test' })).remainingBalls, 8);
  assert.equal(await db.collection('session_settlements').countDocuments({ sessionId: 'session-ok' }), 1);

  const reopen = await post('/api/sessions/session-ok/settle', cookie, { action: 'REOPEN', notes: 'Integration test' });
  assert.equal(reopen.status, 200, await reopen.text());
  assert.equal((await db.collection('shuttle_batches').findOne({ id: 'batch-test' })).remainingBalls, 12);
  assert.equal((await db.collection('sessions').findOne({ id: 'session-ok' })).status, 'REOPENED');
  assert.equal(await db.collection('treasury').countDocuments({ sessionId: 'session-ok', type: 'REVERSAL' }), 1);

  const secondSettle = await post('/api/sessions/session-ok/settle', cookie, { action: 'SETTLE' });
  assert.equal(secondSettle.status, 200, await secondSettle.text());
  assert.equal((await db.collection('shuttle_batches').findOne({ id: 'batch-test' })).remainingBalls, 8);
  assert.equal(await db.collection('session_settlements').countDocuments({ sessionId: 'session-ok' }), 2);

  const insufficient = await post('/api/sessions/session-insufficient/settle', cookie, { action: 'SETTLE' });
  assert.equal(insufficient.status, 409, await insufficient.text());
  assert.equal((await db.collection('sessions').findOne({ id: 'session-insufficient' })).status, 'OPEN');
  assert.equal((await db.collection('shuttle_batches').findOne({ id: 'batch-test' })).remainingBalls, 8);

  console.log('Stage 1 and 2 integration tests passed');
} catch (error) {
  if (server) console.error(serverOutput);
  throw error;
} finally {
  if (server) {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise((resolve) => server.once('exit', resolve));
    }
  }
  if (connected) {
    await client.db(databaseName).dropDatabase();
  }
  await client.close();
}
