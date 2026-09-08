import React from 'react';
import Link from 'next/link';
import { Button, Chip, Card, CardBody } from '@heroui/react';
import { Navbar } from '@/components/Navbar';
import { Reveal, StaggerContainer, StaggerItem, InteractiveCard } from '@/components/motion';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { formatMoney, formatMoneyShort, calculateSessionFinances } from '@/lib/calculations';
import { Session, Quarter, QuarterMember, ShuttlecockBatch } from '@/lib/types';
import { Calendar, Users, Wallet, Package, ArrowRight, UserCheck, AlertTriangle, CheckCircle2, Plus, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const db = await getDb();

  // 1. Quý hiện tại
  const quarter = await db.collection<Quarter>('quarters').findOne({ status: 'ACTIVE' });
  const quarterId = quarter?.id || 'q-2026-1';

  // 2. Thành viên cố định
  const members = await db.collection<QuarterMember>('quarter_members').find({ quarterId }).toArray();

  // 3. Buổi đánh gần nhất / tiếp theo
  const sessions = await db
    .collection<Session>('sessions')
    .find({ quarterId })
    .sort({ sessionDate: -1, startTime: -1 })
    .toArray();

  const nextSession = sessions.length > 0 ? sessions[0] : null;
  const nextSessionCalc = nextSession ? calculateSessionFinances(nextSession) : null;

  // 4. Tồn kho cầu
  const batches = await db.collection<ShuttlecockBatch>('shuttle_batches').find({}).toArray();
  const totalRemainingBalls = batches.reduce((sum, b) => sum + (b.remainingBalls || 0), 0);

  // 5. Thống kê quỹ & nợ
  const totalMemberPaid = members.reduce((sum, m) => sum + (m.paidAmount || 0), 0);
  const totalGuestRevenue = sessions.reduce((sum, s) => sum + (s.totalGuestRevenue || 0), 0);
  const totalSessionsExpense = sessions.reduce((sum, s) => sum + (s.totalExpense || 0), 0);

  let totalAdvancedByMembers = 0;
  for (const s of sessions) {
    for (const adv of s.advances || []) {
      totalAdvancedByMembers += adv.amount || 0;
    }
  }

  const currentFundBalance = (quarter?.startingBalance || 0) + totalMemberPaid + totalGuestRevenue - totalSessionsExpense;

  const attendingList = nextSession?.participants.filter((p) => p.attendanceStatus === 'ATTENDING') || [];
  const absentValidList = nextSession?.participants.filter((p) => p.attendanceStatus === 'ABSENT_VALID') || [];
  const absentLateList = nextSession?.participants.filter((p) => p.attendanceStatus === 'ABSENT_LATE') || [];

  const isAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN';

  return (
    <div className="club-page club-overview min-h-screen pb-24 sm:pb-12">
      <Navbar user={user} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome Header */}
        <Reveal className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                Chào {user?.name || 'bạn'}! 🏸
              </h1>
              <Chip size="sm" variant="flat" color="success" className="font-bold text-[10px]">
                {quarter?.name || 'Quý 1/2026'}
              </Chip>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Quản lý đội nhóm, điểm danh, tồn kho cầu & quyết toán VietQR 1-chạm
            </p>
          </div>

          {isAdmin && (
            <Link href="/sessions/create">
              <Button
                color="primary"
                variant="solid"
                size="md"
                startContent={<Plus size={16} />}
                className="font-bold rounded-2xl shadow-sm hover:shadow-md transition shrink-0"
              >
                Tạo buổi đánh mới
              </Button>
            </Link>
          )}
        </Reveal>

        {/* 4 Cards Thống Kê Chính với Motion Stagger */}
        <StaggerContainer className="club-stat-grid grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Card Quỹ chung */}
          <StaggerItem>
            <InteractiveCard className="bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold text-slate-500">Số dư quỹ</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Wallet size={16} />
                </div>
              </div>
              <div className="text-lg sm:text-xl font-black text-emerald-600 tracking-tight">
                {formatMoneyShort(currentFundBalance)}
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">
                Thu {formatMoneyShort(totalMemberPaid + totalGuestRevenue)} • Chi {formatMoneyShort(totalSessionsExpense)}
              </span>
            </InteractiveCard>
          </StaggerItem>

          {/* Card Buổi tiếp theo */}
          <StaggerItem>
            <InteractiveCard className="bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold text-slate-500">Buổi tiếp</span>
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Calendar size={16} />
                </div>
              </div>
              <div className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
                {nextSession?.sessionCode || 'Chưa có'}
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">
                {nextSession ? `${nextSession.sessionDate} (${nextSession.startTime})` : 'Tạo lịch mới'}
              </span>
            </InteractiveCard>
          </StaggerItem>

          {/* Card Tồn kho cầu */}
          <StaggerItem>
            <InteractiveCard className="bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold text-slate-500">Tồn kho cầu</span>
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Package size={16} />
                </div>
              </div>
              <div className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
                {totalRemainingBalls} <span className="text-xs font-normal text-slate-400">quả</span>
              </div>
              <div className="mt-1">
                {totalRemainingBalls < 12 ? (
                  <Chip size="sm" color="danger" variant="flat" className="h-4 text-[10px] font-bold">
                    ⚠️ Sắp hết
                  </Chip>
                ) : (
                  <Chip size="sm" color="success" variant="flat" className="h-4 text-[10px] font-bold">
                    Đầy đủ
                  </Chip>
                )}
              </div>
            </InteractiveCard>
          </StaggerItem>

          {/* Card Nhóm nợ người ứng */}
          <StaggerItem>
            <InteractiveCard className="bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold text-slate-500">Nợ người ứng</span>
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                  <Users size={16} />
                </div>
              </div>
              <div className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
                {formatMoneyShort(totalAdvancedByMembers)}
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">Chờ hoàn trả từ quỹ</span>
            </InteractiveCard>
          </StaggerItem>
        </StaggerContainer>

        {/* Tiêu Điểm: Buổi đánh sắp tới / Đang mở */}
        {nextSession && (
          <Reveal delay={0.15}>
            <Card className="club-feature-panel bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-md space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-black text-xl shadow-md shadow-emerald-500/20">
                    {nextSession.sessionCode}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-black text-slate-800">
                        Buổi {nextSession.sessionCode} • {nextSession.sessionDate}
                      </h2>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={nextSession.isSettled ? 'secondary' : 'success'}
                        className="font-bold text-[10px]"
                      >
                        {nextSession.isSettled ? 'Đã quyết toán' : 'Đang mở'}
                      </Chip>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {nextSession.venueName} • {nextSession.startTime} - {nextSession.endTime} (Mục tiêu: {nextSession.targetPlayers} người)
                    </p>
                  </div>
                </div>

                <Link href={`/sessions/${nextSession.id}`}>
                  <Button
                    color="primary"
                    variant="flat"
                    size="sm"
                    endContent={<ArrowRight size={14} />}
                    className="font-bold rounded-xl shadow-2xs"
                  >
                    Vào chi tiết buổi
                  </Button>
                </Link>
              </div>

              {/* Status Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 bg-slate-50/80 rounded-2xl flex items-center justify-between border border-slate-200/50">
                  <div>
                    <span className="text-slate-400 block text-[11px] font-medium">Tham gia thực tế</span>
                    <span className="font-extrabold text-slate-800 text-sm">
                      {attendingList.length} người ({nextSessionCalc?.attendingMembers} cố định, {nextSessionCalc?.existingGuests} guest)
                    </span>
                  </div>
                  <UserCheck size={22} className="text-emerald-600" />
                </div>

                <div className="p-3.5 bg-slate-50/80 rounded-2xl flex items-center justify-between border border-slate-200/50">
                  <div>
                    <span className="text-slate-400 block text-[11px] font-medium">Tình trạng số lượng</span>
                    <span
                      className={`font-extrabold text-sm ${
                        (nextSessionCalc?.neededGuests || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    >
                      {nextSessionCalc?.playerStatusText}
                    </span>
                  </div>
                  {(nextSessionCalc?.neededGuests || 0) > 0 ? (
                    <AlertTriangle size={22} className="text-amber-500" />
                  ) : (
                    <CheckCircle2 size={22} className="text-emerald-500" />
                  )}
                </div>

                <div className="p-3.5 bg-slate-50/80 rounded-2xl flex items-center justify-between border border-slate-200/50">
                  <div>
                    <span className="text-slate-400 block text-[11px] font-medium">Số guest cần tuyển</span>
                    <span className="font-extrabold text-slate-800 text-sm">
                      {nextSessionCalc?.neededGuests || 0} khách
                    </span>
                  </div>
                  <Users size={22} className="text-blue-500" />
                </div>
              </div>

              {/* Attendance Badges */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>Người tham gia ({attendingList.length})</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Nghỉ: {absentValidList.length} có phép, {absentLateList.length} muộn
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {attendingList.map((p) => (
                    <Chip
                      key={p.id}
                      size="sm"
                      variant="flat"
                      color={p.isGuest ? 'secondary' : 'success'}
                      className="font-bold text-xs"
                    >
                      {p.userName} {p.isGuest && '(Guest)'}
                    </Chip>
                  ))}
                  {absentValidList.map((p) => (
                    <Chip key={p.id} size="sm" variant="flat" color="primary" className="font-semibold text-xs">
                      {p.userName} (Nghỉ -6h)
                    </Chip>
                  ))}
                  {absentLateList.map((p) => (
                    <Chip key={p.id} size="sm" variant="flat" color="danger" className="font-semibold text-xs">
                      {p.userName} (Nghỉ muộn)
                    </Chip>
                  ))}
                </div>
              </div>
            </Card>
          </Reveal>
        )}

        {/* Danh sách các buổi đánh gần đây */}
        <Reveal delay={0.2} className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-800 text-base">Danh sách buổi đánh ({sessions.length})</h3>
            <Link href="/sessions">
              <Button variant="light" size="sm" color="primary" className="font-bold text-xs">
                Xem tất cả
              </Button>
            </Link>
          </div>

          <div className="space-y-2.5">
            {sessions.map((s) => (
              <InteractiveCard key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="block bg-white/90 backdrop-blur-sm p-4 rounded-2xl border border-slate-200/80 hover:border-emerald-500/60 transition shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-700 text-sm">
                        {s.sessionCode}
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                          <span>Buổi {s.sessionCode} • {s.sessionDate}</span>
                          <Chip
                            size="sm"
                            variant="flat"
                            color={s.isSettled ? 'default' : 'success'}
                            className="h-4 text-[10px] font-bold"
                          >
                            {s.isSettled ? 'Đã quyết toán' : 'Chưa quyết toán'}
                          </Chip>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {s.startTime} - {s.endTime} • {s.venueName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-slate-800 text-sm block">
                        {formatMoney(s.totalExpense)}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {s.participants?.filter((p) => p.attendanceStatus === 'ATTENDING').length || 0} người chơi
                      </span>
                    </div>
                  </div>
                </Link>
              </InteractiveCard>
            ))}
          </div>
        </Reveal>
      </main>
    </div>
  );
}
