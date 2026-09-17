'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Button, Card, Chip } from '@heroui/react';
import { Reveal, InteractiveCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { formatMoney } from '@/lib/calculations';
import type { AuthSessionUser } from '@/lib/auth';
import type { Payment, TreasurySummary } from '@/lib/types';
import { getErrorMessage } from '@/lib/errors';
import { Wallet, History, AlertCircle, LoaderCircle, CreditCard } from 'lucide-react';

type PaymentWithOutstanding = Payment & { outstandingAmount: number; isOverdue?: boolean };

export default function TreasuryPage() {
  const [data, setData] = useState<TreasurySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [error, setError] = useState('');
  const [payments, setPayments] = useState<PaymentWithOutstanding[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/treasury'), fetch('/api/auth/me'), fetch('/api/payments')])
      .then(async ([treasuryRes, userRes, paymentsRes]) => {
        const [treasuryData, userData, paymentsData] = await Promise.all([
          treasuryRes.json(), userRes.json(), paymentsRes.json(),
        ]);
        if (!treasuryRes.ok) throw new Error(treasuryData.error || 'Không thể tải dữ liệu quỹ');
        if (!paymentsRes.ok) throw new Error(paymentsData.error || 'Không thể tải công nợ');
        if (active) {
          setData(treasuryData);
          setCurrentUser(userData.user || null);
          setPayments(paymentsData.payments || []);
        }
      })
      .catch((reason: unknown) => active && setError(getErrorMessage(reason)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const confirmPayment = async (payment: PaymentWithOutstanding) => {
    const raw = window.prompt('Số tiền xác nhận:', String(payment.outstandingAmount));
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount <= 0) return alert('Số tiền không hợp lệ');
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(payment.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CONFIRM', amount, method: 'BANK_TRANSFER' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể xác nhận thanh toán');
      window.location.reload();
    } catch (reason: unknown) {
      alert(getErrorMessage(reason));
    }
  };

  const refundPayment = async (payment: PaymentWithOutstanding) => {
    const refundable = payment.paidAmount - payment.refundedAmount;
    const raw = window.prompt('Số tiền hoàn:', String(refundable));
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount <= 0) return alert('Số tiền không hợp lệ');
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(payment.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REFUND', amount, method: 'BANK_TRANSFER' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể hoàn tiền');
      window.location.reload();
    } catch (reason: unknown) {
      alert(getErrorMessage(reason));
    }
  };

  return (
    <div className="club-page club-treasury min-h-screen pb-24 sm:pb-12">
      <Navbar user={currentUser} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Reveal>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">Quỹ Chung Của Nhóm</h1>
            <Chip size="sm" color="success" variant="flat" className="font-bold text-[10px]">
              Minh bạch 100%
            </Chip>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Sổ quỹ chung xuyên suốt các quý, theo dõi biến động dòng tiền thực tế
          </p>
        </Reveal>

        {loading && <div className="club-state-panel"><LoaderCircle className="animate-spin" size={20} /> Đang đối soát quỹ…</div>}
        {error && <div className="club-state-panel club-state-error"><AlertCircle size={20} /> {error}</div>}

        {/* Card Số dư quỹ */}
        {!loading && !error && <Reveal delay={0.05}>
          <Card className="club-feature-panel bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/80 p-6 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Số dư hiện tại</span>
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl shadow-inner">
                <Wallet size={22} />
              </div>
            </div>

            <div className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight">
              {formatMoney(data?.currentFundBalance || 0)}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200/50">
                <span className="text-slate-400 block text-[11px] font-medium">Số dư đầu kỳ</span>
                <span className="font-bold text-slate-800">{formatMoney(data?.startingBalance || 0)}</span>
              </div>
              <div className="p-2.5 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                <span className="text-emerald-700 block text-[11px] font-medium">Tổng tiền thực thu</span>
                <span className="font-bold text-emerald-700">+{formatMoney(data?.totalIncome || 0)}</span>
              </div>
              <div className="p-2.5 bg-purple-50/60 rounded-2xl border border-purple-100">
                <span className="text-purple-700 block text-[11px] font-medium">Còn phải thu</span>
                <span className="font-bold text-purple-700">{formatMoney(data?.totalReceivable || 0)}</span>
              </div>
              <div className="p-2.5 bg-red-50/60 rounded-2xl border border-red-100">
                <span className="text-red-700 block text-[11px] font-medium">Còn phải trả</span>
                <span className="font-bold text-red-700">{formatMoney(data?.totalPayable || 0)}</span>
              </div>
            </div>
          </Card>
        </Reveal>}

        {!loading && !error && payments.some((payment) => payment.status !== 'CANCELLED') && (
          <Reveal delay={0.08} className="space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-slate-500" />
              <h2 className="font-bold text-slate-800 text-base">Công nợ đang mở</h2>
            </div>
            <div className="space-y-2">
              {payments.filter((payment) => payment.status !== 'CANCELLED').map((payment) => (
                <Card key={payment.id} className="p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-slate-800 text-xs block">{payment.payerName}</span>
                      <span className="text-[11px] text-slate-400">
                        {payment.direction === 'RECEIVABLE' ? 'CLB cần thu' : 'CLB cần hoàn'} • {payment.status}
                        {payment.isOverdue ? ' • QUÁ HẠN' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className={payment.direction === 'RECEIVABLE' ? 'font-black text-red-600 text-sm block' : 'font-black text-purple-700 text-sm block'}>
                          {payment.outstandingAmount > 0 ? formatMoney(payment.outstandingAmount) : 'Đã đủ'}
                        </span>
                        <span className="text-[10px] text-slate-400">Đã xử lý {formatMoney(payment.paidAmount)}</span>
                      </div>
                      {(currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN') && payment.outstandingAmount > 0 && (
                        <Button size="sm" color="primary" variant="flat" className="font-bold rounded-xl text-xs" onPress={() => confirmPayment(payment)}>
                          {payment.direction === 'RECEIVABLE' ? 'Xác nhận thu' : 'Xác nhận trả'}
                        </Button>
                      )}
                      {(currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN')
                        && payment.direction === 'RECEIVABLE'
                        && payment.paidAmount > payment.refundedAmount && (
                          <Button size="sm" color="danger" variant="flat" className="font-bold rounded-xl text-xs" onPress={() => refundPayment(payment)}>
                            Hoàn tiền
                          </Button>
                        )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Reveal>
        )}

        {/* Lịch sử biến động quỹ */}
        {!loading && !error && <Reveal delay={0.1} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History size={18} className="text-slate-500" />
              <h2 className="font-bold text-slate-800 text-base">Lịch sử thu chi</h2>
            </div>
            <Chip size="sm" variant="flat" color="default" className="text-[11px]">
              Tự động đối soát
            </Chip>
          </div>

          <StaggerContainer className="space-y-2 text-xs">
            {data?.recentLogs && data.recentLogs.length > 0 ? (
              data.recentLogs.map((log) => (
                <StaggerItem key={log.id}>
                  <InteractiveCard className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800 block text-xs">{log.description}</span>
                      <span className="text-slate-400 text-[11px]">
                        {log.createdAt?.slice(0, 10)} • Ghi nhận bởi: <strong>{log.createdByName}</strong>
                      </span>
                    </div>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={log.direction === 'IN' ? 'success' : 'danger'}
                      className="font-black text-xs"
                    >
                      {log.direction === 'IN' ? `+${formatMoney(log.amount)}` : `-${formatMoney(log.amount)}`}
                    </Chip>
                  </InteractiveCard>
                </StaggerItem>
              ))
            ) : (
              <p className="text-slate-400 text-center py-6">Chưa có giao dịch quỹ phát sinh gần đây.</p>
            )}
          </StaggerContainer>
        </Reveal>}
      </main>
    </div>
  );
}
