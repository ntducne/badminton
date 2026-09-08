'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, Chip } from '@heroui/react';
import { Reveal, InteractiveCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { formatMoney } from '@/lib/calculations';
import { Wallet, History } from 'lucide-react';

export default function TreasuryPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [treasuryRes, userRes] = await Promise.all([
        fetch('/api/treasury'),
        fetch('/api/auth/me'),
      ]);

      const tData = await treasuryRes.json();
      setData(tData);

      const uData = await userRes.json();
      setCurrentUser(uData.user);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

        {/* Card Số dư quỹ */}
        <Reveal delay={0.05}>
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
                <span className="text-emerald-700 block text-[11px] font-medium">Thu tiền quý</span>
                <span className="font-bold text-emerald-700">+{formatMoney(data?.totalMemberPaid || 0)}</span>
              </div>
              <div className="p-2.5 bg-purple-50/60 rounded-2xl border border-purple-100">
                <span className="text-purple-700 block text-[11px] font-medium">Thu từ guest</span>
                <span className="font-bold text-purple-700">+{formatMoney(data?.totalGuestRevenue || 0)}</span>
              </div>
              <div className="p-2.5 bg-red-50/60 rounded-2xl border border-red-100">
                <span className="text-red-700 block text-[11px] font-medium">Chi phí các buổi</span>
                <span className="font-bold text-red-700">-{formatMoney(data?.totalSessionsExpense || 0)}</span>
              </div>
            </div>
          </Card>
        </Reveal>

        {/* Lịch sử biến động quỹ */}
        <Reveal delay={0.1} className="space-y-4">
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
              data.recentLogs.map((log: any) => (
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
                      color={log.amount >= 0 ? 'success' : 'danger'}
                      className="font-black text-xs"
                    >
                      {log.amount >= 0 ? `+${formatMoney(log.amount)}` : formatMoney(log.amount)}
                    </Chip>
                  </InteractiveCard>
                </StaggerItem>
              ))
            ) : (
              <p className="text-slate-400 text-center py-6">Chưa có giao dịch quỹ phát sinh gần đây.</p>
            )}
          </StaggerContainer>
        </Reveal>
      </main>
    </div>
  );
}
