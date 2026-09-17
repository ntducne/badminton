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
    pricePerBall: 10000, purchaseDate: '2026-09-17', isPaidFromTreasury: true, version: 0,
  });
  await db.collection('inventory_movements').insertOne({
    id: 'purchase-batch-test', batchId: 'batch-test', type: 'PURCHASE', quantity: 12,
    unitCost: 10000, createdByUserId: 'owner-test', createdByName: 'Owner Test', createdAt: new Date().toISOString(),
  });
  await db.collection('quarters').insertOne({
    id: 'q-test', name: 'Quý test', status: 'ACTIVE', startingBalance: 0, version: 0,
    settlementVersion: 0, roundingUnit: 1000, cancellationFeePolicy: 'NONE',
    balanceCarryPolicy: 'SETTLE_NOW', defaultGuestSurcharge: 10000, defaultTargetPlayers: 8,
  });
  await db.collection('quarter_members').insertOne({
    id: 'qm-owner-test', quarterId: 'q-test', userId: 'owner-test', userName: 'Owner Test',
    userPhone: '0900000000', fixedCourtFee: 100000, paidAmount: 100000,
    paymentStatus: 'PAID', joinedDate: '2026-01-01', refundAmount: 0, isActive: true,
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
  assert.equal(await db.collection('treasury').countDocuments({ sessionId: 'session-ok' }), 0);
  const firstPayment = await db.collection('payments').findOne({ sessionId: 'session-ok' });
  assert.ok(firstPayment);
  assert.equal(firstPayment.expectedAmount, 138000);

  const memberCannotConfirm = await post(`/api/payments/${encodeURIComponent(firstPayment.id)}`, memberCookie, {
    action: 'CONFIRM', amount: 1000, method: 'CASH',
  });
  assert.equal(memberCannotConfirm.status, 403);

  const qrForPayment = await fetch(`${baseUrl}/api/vietqr?paymentId=${encodeURIComponent(firstPayment.id)}&amount=1`, {
    headers: { cookie },
  });
  const qrForPaymentBody = await qrForPayment.json();
  assert.equal(qrForPayment.status, 200, JSON.stringify(qrForPaymentBody));
  assert.equal(qrForPaymentBody.amount, 138000);

  const partialPayment = await post(`/api/payments/${encodeURIComponent(firstPayment.id)}`, cookie, {
    action: 'CONFIRM', amount: 38000, method: 'BANK_TRANSFER', reference: 'PARTIAL-1',
  });
  const partialPaymentBody = await partialPayment.json();
  assert.equal(partialPayment.status, 200, JSON.stringify(partialPaymentBody));
  assert.equal(partialPaymentBody.payment.status, 'PARTIAL');
  const finalPayment = await post(`/api/payments/${encodeURIComponent(firstPayment.id)}`, cookie, {
    action: 'CONFIRM', amount: 100000, method: 'BANK_TRANSFER', reference: 'FINAL-1',
  });
  const finalPaymentBody = await finalPayment.json();
  assert.equal(finalPayment.status, 200, JSON.stringify(finalPaymentBody));
  assert.equal(finalPaymentBody.payment.status, 'PAID');
  const refund = await post(`/api/payments/${encodeURIComponent(firstPayment.id)}`, cookie, {
    action: 'REFUND', amount: 18000, method: 'BANK_TRANSFER', reference: 'REFUND-1',
  });
  const refundBody = await refund.json();
  assert.equal(refund.status, 200, JSON.stringify(refundBody));
  assert.equal(refundBody.payment.status, 'PARTIAL');
  const treasurySummary = await fetch(`${baseUrl}/api/treasury?quarterId=q-test`, { headers: { cookie } });
  assert.equal(treasurySummary.status, 200);
  const treasuryBody = await treasurySummary.json();
  assert.equal(treasuryBody.totalIncome, 138000);
  assert.equal(treasuryBody.totalExpense, 18000);
  assert.equal(treasuryBody.currentFundBalance, 120000);
  assert.equal(treasuryBody.totalReceivable, 18000);

  const adjustment = await post('/api/treasury', cookie, {
    action: 'ADJUSTMENT', quarterId: 'q-test', amount: 10000, direction: 'IN', description: 'Đối chiếu test',
  });
  const adjustmentBody = await adjustment.json();
  assert.equal(adjustment.status, 200, JSON.stringify(adjustmentBody));
  const reversal = await post('/api/treasury', cookie, {
    action: 'REVERSE', entryId: adjustmentBody.entry.id, description: 'Đảo đối chiếu test',
  });
  assert.equal(reversal.status, 200, await reversal.text());
  const afterReversal = await fetch(`${baseUrl}/api/treasury?quarterId=q-test`, { headers: { cookie } });
  assert.equal((await afterReversal.json()).currentFundBalance, 120000);

  const repeatedSettle = await post('/api/sessions/session-ok/settle', cookie, { action: 'SETTLE' });
  assert.equal(repeatedSettle.status, 200, await repeatedSettle.text());
  assert.equal((await db.collection('shuttle_batches').findOne({ id: 'batch-test' })).remainingBalls, 8);
  assert.equal(await db.collection('session_settlements').countDocuments({ sessionId: 'session-ok' }), 1);

  const reopen = await post('/api/sessions/session-ok/settle', cookie, { action: 'REOPEN', notes: 'Integration test' });
  assert.equal(reopen.status, 200, await reopen.text());
  assert.equal((await db.collection('shuttle_batches').findOne({ id: 'batch-test' })).remainingBalls, 12);
  assert.equal((await db.collection('sessions').findOne({ id: 'session-ok' })).status, 'REOPENED');
  assert.equal((await db.collection('payments').findOne({ id: firstPayment.id })).status, 'CANCELLED');
  assert.equal(await db.collection('treasury').countDocuments({ sessionId: 'session-ok' }), 3);

  const secondSettle = await post('/api/sessions/session-ok/settle', cookie, { action: 'SETTLE' });
  assert.equal(secondSettle.status, 200, await secondSettle.text());
  assert.equal((await db.collection('shuttle_batches').findOne({ id: 'batch-test' })).remainingBalls, 8);
  assert.equal(await db.collection('session_settlements').countDocuments({ sessionId: 'session-ok' }), 2);
  assert.equal((await db.collection('payments').findOne({ sessionId: 'session-ok', status: 'PENDING' })).expectedAmount, 18000);

  const insufficient = await post('/api/sessions/session-insufficient/settle', cookie, { action: 'SETTLE' });
  assert.equal(insufficient.status, 409, await insufficient.text());
  assert.equal((await db.collection('sessions').findOne({ id: 'session-insufficient' })).status, 'OPEN');
  assert.equal((await db.collection('shuttle_batches').findOne({ id: 'batch-test' })).remainingBalls, 8);

  // Stage 5: purchases, damage and stocktake are represented by immutable movements.
  const purchase = await post('/api/shuttle', cookie, {
    quarterId: 'q-test', brandName: 'FIFO Test', tubeQuantity: 1, ballsPerTube: 12,
    pricePerTube: 120000, isPaidFromTreasury: true, notes: 'Integration purchase',
  });
  const purchaseBody = await purchase.json();
  assert.equal(purchase.status, 200, JSON.stringify(purchaseBody));
  assert.equal(await db.collection('inventory_movements').countDocuments({ batchId: purchaseBody.batch.id, type: 'PURCHASE' }), 1);
  assert.equal(await db.collection('treasury').countDocuments({ type: 'SHUTTLE_PURCHASE', direction: 'OUT' }), 1);
  const damaged = await fetch(`${baseUrl}/api/shuttle`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'DAMAGED', batchId: purchaseBody.batch.id, quantity: 2, reason: 'Test damaged', version: 0 }),
  });
  assert.equal(damaged.status, 200, await damaged.text());
  const adjusted = await fetch(`${baseUrl}/api/shuttle`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'ADJUSTMENT', batchId: purchaseBody.batch.id, newRemaining: 11, reason: 'Stocktake', version: 1 }),
  });
  assert.equal(adjusted.status, 200, await adjusted.text());
  const stockResponse = await fetch(`${baseUrl}/api/shuttle`, { headers: { cookie } });
  assert.equal((await stockResponse.json()).isReconciled, true);

  // Stage 6: a quarter can settle only after every session is settled or cancelled.
  const cancelOpenSession = await post('/api/sessions/session-insufficient/status', cookie, { status: 'CANCELLED', reason: 'End quarter' });
  assert.equal(cancelOpenSession.status, 200, await cancelOpenSession.text());
  const quarterSettlement = await post('/api/quarters/q-test/settle', cookie, { action: 'SETTLE' });
  const quarterSettlementBody = await quarterSettlement.json();
  assert.equal(quarterSettlement.status, 200, JSON.stringify(quarterSettlementBody));
  assert.equal(quarterSettlementBody.settlement.totalPayable, 100000);
  const quarterPayment = await db.collection('payments').findOne({ quarterSettlementId: quarterSettlementBody.settlement.id });
  assert.equal(quarterPayment.direction, 'PAYABLE');
  const payQuarterRefund = await post(`/api/payments/${encodeURIComponent(quarterPayment.id)}`, cookie, {
    action: 'CONFIRM', amount: 100000, method: 'BANK_TRANSFER',
  });
  assert.equal(payQuarterRefund.status, 200, await payQuarterRefund.text());
  const closeQuarter = await post('/api/quarters/q-test/settle', cookie, { action: 'CLOSE' });
  assert.equal(closeQuarter.status, 200, await closeQuarter.text());
  assert.equal((await db.collection('quarters').findOne({ id: 'q-test' })).status, 'CLOSED');

  const audit = await fetch(`${baseUrl}/api/audit`, { headers: { cookie } });
  assert.equal(audit.status, 200);
  assert.ok((await audit.json()).logs.every((log) => log.requestId));

  console.log('Stage 1-7 integration tests passed');
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
