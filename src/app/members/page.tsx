'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Chip } from '@heroui/react';
import { Reveal, InteractiveCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { formatMoney, formatMoneyShort } from '@/lib/calculations';
import type { AuthSessionUser } from '@/lib/auth';
import type { MemberReport } from '@/lib/types';
import { getErrorMessage } from '@/lib/errors';
import { Shield, ArrowDownRight, ArrowUpRight, CheckCircle2, AlertCircle, LoaderCircle } from 'lucide-react';

export default function MembersPage() {
  const [members, setMembers] = useState<MemberReport[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quarterName, setQuarterName] = useState('Quý hiện tại');

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/members'), fetch('/api/auth/me')])
      .then(async ([membersRes, userRes]) => {
        const [memberData, userData] = await Promise.all([membersRes.json(), userRes.json()]);
        if (!membersRes.ok) throw new Error(memberData.error || 'Không thể tải danh sách thành viên');
        if (active) {
          setMembers(memberData.members || []);
          setCurrentUser(userData.user || null);
          setQuarterName(memberData.quarterName || 'Quý hiện tại');
        }
      })
      .catch((reason: unknown) => active && setError(getErrorMessage(reason)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const isAdmin = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  return (
    <div className="club-page club-members min-h-screen pb-24 sm:pb-12">
      <Navbar user={currentUser} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Reveal>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">Thành viên & Công nợ</h1>
            <Chip size="sm" color="success" variant="flat" className="font-bold text-[10px]">
              {quarterName}
            </Chip>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi tỷ lệ tham gia, tiền đóng sân quý, số tiền ứng và công nợ
          </p>
        </Reveal>

        {/* Thông báo quyền xem & bảo mật */}
        <Reveal delay={0.05}>
          <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 text-blue-900 rounded-3xl text-xs flex items-center gap-2.5 shadow-2xs">
            <Shield size={18} className="text-blue-600 shrink-0" />
            <span>
              {isAdmin
                ? 'Bạn đang đăng nhập với quyền Quản trị viên (Xem toàn bộ công nợ).'
                : 'Chính sách bảo mật: Bạn chỉ nhìn thấy chi tiết công nợ của riêng tài khoản bạn.'}
            </span>
          </div>
        </Reveal>

        {/* Danh sách thành viên */}
        <Reveal delay={0.1} className="space-y-3">
          {loading && (
            <div className="club-state-panel"><LoaderCircle className="animate-spin" size={20} /> Đang tải thành viên…</div>
          )}
          {error && (
            <div className="club-state-panel club-state-error"><AlertCircle size={20} /> {error}</div>
          )}
          <StaggerContainer className="space-y-3">
            {!loading && !error && members.map((m) => {
              const hasAccessToDebt = m.totalSessionDebt !== null;
              const netDebt = m.netDebt ?? 0;

              return (
                <StaggerItem key={m.id}>
                  <InteractiveCard
                    className={`bg-white/95 backdrop-blur-sm p-4 sm:p-5 rounded-3xl border shadow-sm transition ${
                      m.isMe ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200/80'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-100 to-slate-200 text-slate-800 flex items-center justify-center font-black text-base shadow-inner">
                          {m.name.slice(0, 1)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-800 text-sm">{m.name}</span>
                            {m.isMe && (
                              <Chip size="sm" variant="flat" color="success" className="h-4 text-[10px] font-bold">
                                Bạn
                              </Chip>
                            )}
                            <Chip size="sm" variant="flat" color="default" className="h-4 text-[10px] font-medium capitalize">
                              {m.role.toLowerCase()}
                            </Chip>
                          </div>
                          <span className="text-xs text-slate-400 mt-0.5 block">
                            {m.phone} • Tiền sân quý: <strong>{formatMoney(m.fixedCourtFee)}</strong> (Đã đóng)
                          </span>
                        </div>
                      </div>

                      {/* Chỉ số tham gia */}
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-center sm:text-right">
                          <span className="text-slate-400 block text-[11px]">Tham gia</span>
                          <span className="font-extrabold text-emerald-600">{m.attendedCount} buổi</span>
                        </div>

                        <div className="text-center sm:text-right">
                          <span className="text-slate-400 block text-[11px]">Nghỉ hợp lệ (-6h)</span>
                          <span className="font-extrabold text-blue-600">{m.absentValidCount} buổi</span>
                          {m.estimatedQuarterRefund > 0 && (
                            <span className="text-[10px] text-blue-500 font-semibold block">
                              Hoàn ~{formatMoneyShort(m.estimatedQuarterRefund)}
                            </span>
                          )}
                        </div>

                        <div className="text-center sm:text-right">
                          <span className="text-slate-400 block text-[11px]">Nghỉ muộn</span>
                          <span className="font-extrabold text-red-600">{m.absentLateCount} buổi</span>
                        </div>
                      </div>
                    </div>

                    {/* Phần công nợ cá nhân */}
                    {hasAccessToDebt ? (
                      <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-slate-400 block text-[11px]">Nợ các buổi</span>
                            <span className="font-bold text-slate-700">
                              {formatMoney(m.totalSessionDebt ?? 0)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Đã ứng cho nhóm</span>
                            <span className="font-bold text-purple-700">
                              +{formatMoney(m.totalAdvanced ?? 0)}
                            </span>
                          </div>
                        </div>

                        <div>
                          {netDebt > 0 ? (
                            <Chip size="sm" color="danger" variant="flat" className="font-bold">
                              <span className="flex items-center gap-1">
                                <ArrowUpRight size={13} />
                                <span>Cần nộp: {formatMoney(netDebt)}</span>
                              </span>
                            </Chip>
                          ) : netDebt < 0 ? (
                            <Chip size="sm" color="success" variant="flat" className="font-bold">
                              <span className="flex items-center gap-1">
                                <ArrowDownRight size={13} />
                                <span>Nhóm nợ lại: {formatMoney(Math.abs(netDebt))}</span>
                              </span>
                            </Chip>
                          ) : (
                            <span className="font-bold text-slate-400 flex items-center gap-1">
                              <CheckCircle2 size={13} className="text-emerald-500" />
                              <span>Đã hoàn tất</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-400 italic">
                        🔒 Chi tiết công nợ được bảo mật riêng tư
                      </div>
                    )}
                  </InteractiveCard>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
          {!loading && !error && members.length === 0 && (
            <div className="club-state-panel">Chưa có thành viên trong quý hiện tại.</div>
          )}
        </Reveal>
      </main>
    </div>
  );
}
