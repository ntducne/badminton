'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Button,
  Chip,
  Card,
  CardBody,
  Tabs,
  Tab,
  Input,
} from '@heroui/react';
import { Navbar } from '@/components/Navbar';
import { VietQRModal } from '@/components/VietQRModal';
import { Reveal, InteractiveCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { formatMoney, formatMoneyShort } from '@/lib/calculations';
import { Session, SessionParticipant } from '@/lib/types';
import {
  Calendar,
  Users,
  Package,
  Coffee,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Plus,
  Trash2,
  DollarSign,
  Calculator,
  Lock,
  Unlock,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [calculation, setCalculation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Active Tab
  const [selectedTab, setSelectedTab] = useState<string>('attendance');

  // Guest input state
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);

  // VietQR modal state
  const [qrModal, setQrModal] = useState<{
    isOpen: boolean;
    payerName: string;
    amount: number;
    description: string;
  }>({
    isOpen: false,
    payerName: '',
    amount: 0,
    description: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [sessRes, userRes] = await Promise.all([
        fetch(`/api/sessions/${id}`),
        fetch('/api/auth/me'),
      ]);

      const sessData = await sessRes.json();
      if (!sessRes.ok) throw new Error(sessData.error || 'Lỗi tải buổi đánh');

      const userData = await userRes.json();
      setCurrentUser(userData.user);

      setSession(sessData.session);
      setCalculation(sessData.calculation);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleAttendance = async (participantId: string, status: 'ATTENDING' | 'ABSENT') => {
    try {
      const res = await fetch(`/api/sessions/${id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, status }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;

    try {
      setAddingGuest(true);
      const res = await fetch(`/api/sessions/${id}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: guestName, phone: guestPhone }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setGuestName('');
      setGuestPhone('');
      await loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingGuest(false);
    }
  };

  const handleRemoveGuest = async (participantId: string) => {
    if (!confirm('Bạn có chắc muốn xóa khách giao lưu này?')) return;

    try {
      const res = await fetch(`/api/sessions/${id}/guests?participantId=${participantId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSettleAction = async (action: 'SETTLE' | 'REOPEN') => {
    const confirmMsg =
      action === 'SETTLE'
        ? 'Xác nhận Quyết toán buổi đánh? Tồn kho cầu sẽ được trừ và phụ thu khách được hạch toán vào quỹ.'
        : 'Xác nhận Mở lại buổi đánh? Thay đổi sẽ được ghi vào nhật ký kiểm toán (Audit Log).';

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/sessions/${id}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(data.message);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openQR = (participant: SessionParticipant) => {
    const amount = participant.debtAmount > 0 ? participant.debtAmount : participant.totalCost;
    setQrModal({
      isOpen: true,
      payerName: participant.userName,
      amount,
      description: `${participant.userName} nop ${session?.sessionCode || 'buoi cau long'}`,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-sm w-full p-6 text-center rounded-3xl border border-red-200">
          <CardBody className="gap-2 items-center">
            <AlertCircle size={36} className="text-red-500" />
            <h2 className="text-base font-bold text-slate-800">Không tìm thấy buổi đánh</h2>
            <p className="text-xs text-slate-500">{error}</p>
            <Link href="/">
              <Button variant="flat" color="default" className="mt-4 rounded-xl">
                Quay về trang chủ
              </Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-50/70 pb-24 sm:pb-12">
      <Navbar user={currentUser} />

      {/* VietQR Modal */}
      <VietQRModal
        isOpen={qrModal.isOpen}
        onClose={() => setQrModal({ ...qrModal, isOpen: false })}
        payerName={qrModal.payerName}
        amount={qrModal.amount}
        description={qrModal.description}
      />

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {/* Navigation & Status Header */}
        <Reveal className="flex items-center justify-between">
          <Link href="/">
            <Button
              variant="light"
              size="sm"
              startContent={<ArrowLeft size={16} />}
              className="text-xs font-semibold text-slate-500 rounded-xl px-2"
            >
              Trang chủ
            </Button>
          </Link>

          <Chip
            size="md"
            variant="flat"
            color={session.isSettled ? 'secondary' : 'success'}
            startContent={session.isSettled ? <Lock size={13} /> : <Unlock size={13} />}
            className="font-extrabold text-xs px-2"
          >
            {session.isSettled ? 'ĐÃ QUYẾT TOÁN' : 'ĐANG MỞ ĐIỂM DANH'}
          </Chip>
        </Reveal>

        {/* Hero Card with Session Details */}
        <Reveal delay={0.05}>
          <Card className="bg-white/90 backdrop-blur-md rounded-3xl border border-slate-200/80 shadow-md p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-black text-xl shadow-md shadow-emerald-500/20"
                >
                  {session.sessionCode}
                </motion.div>
                <div>
                  <h1 className="text-lg sm:text-xl font-extrabold text-slate-800">
                    Buổi {session.sessionCode} • {session.sessionDate}
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {session.venueName} • {session.startTime} - {session.endTime} (Mục tiêu: {session.targetPlayers} người)
                  </p>
                </div>
              </div>

              {/* Admin Actions */}
              {isAdmin && (
                <div>
                  {session.isSettled ? (
                    <Button
                      size="sm"
                      variant="bordered"
                      color="default"
                      startContent={<Unlock size={14} />}
                      onPress={() => handleSettleAction('REOPEN')}
                      className="font-bold rounded-xl"
                    >
                      Mở lại buổi
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      color="primary"
                      variant="solid"
                      startContent={<CheckCircle2 size={16} />}
                      onPress={() => handleSettleAction('SETTLE')}
                      className="font-bold rounded-xl shadow-sm"
                    >
                      Quyết toán buổi
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Metrics Quick Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100">
              <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/50">
                <span className="text-slate-400 block text-[11px] font-medium">Người tham gia</span>
                <span className="font-extrabold text-slate-800 text-sm">
                  {calculation?.activeCount || 0} / {session.targetPlayers}
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
                  {calculation?.playerStatusText}
                </span>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/50">
                <span className="text-slate-400 block text-[11px] font-medium">Tiền sân</span>
                <span className="font-extrabold text-slate-800 text-sm">
                  {formatMoneyShort(session.totalCourtFee)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  ~{formatMoneyShort(calculation?.courtFeePerPerson)} / người
                </span>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/50">
                <span className="text-slate-400 block text-[11px] font-medium">Cầu đã dùng</span>
                <span className="font-extrabold text-slate-800 text-sm">
                  {formatMoneyShort(session.totalShuttleFee)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {session.shuttleUsages?.reduce((s, u) => s + u.ballsUsed, 0) || 0} quả
                </span>
              </div>

              <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-100">
                <span className="text-emerald-700 block text-[11px] font-semibold">Tổng chi buổi</span>
                <span className="font-extrabold text-emerald-700 text-sm">
                  {formatMoneyShort(session.totalExpense)}
                </span>
                <span className="text-[10px] text-emerald-600 block mt-0.5">
                  Thu guest: {formatMoneyShort(session.totalGuestRevenue)}
                </span>
              </div>
            </div>
          </Card>
        </Reveal>

        {/* HeroUI Animated Tabs */}
        <Reveal delay={0.1}>
          <Tabs
            selectedKey={selectedTab}
            onSelectionChange={(key) => setSelectedTab(String(key))}
            variant="solid"
            color="primary"
            classNames={{
              tabList: 'bg-slate-200/80 p-1 rounded-2xl w-full border border-slate-200/60 shadow-inner',
              cursor: 'bg-white rounded-xl shadow-sm',
              tab: 'h-10 text-xs font-bold rounded-xl data-[selected=true]:text-emerald-700',
            }}
          >
            <Tab
              key="attendance"
              title={
                <div className="flex items-center gap-1.5">
                  <Users size={15} />
                  <span>Điểm danh & Guest</span>
                </div>
              }
            />
            <Tab
              key="expenses"
              title={
                <div className="flex items-center gap-1.5">
                  <DollarSign size={15} />
                  <span>Chi phí & Cầu nước</span>
                </div>
              }
            />
            <Tab
              key="settlement"
              title={
                <div className="flex items-center gap-1.5">
                  <Calculator size={15} />
                  <span>Bảng Bill & VietQR</span>
                </div>
              }
            />
          </Tabs>
        </Reveal>

        {/* TAB 1: ĐIỂM DANH & GUEST */}
        <AnimatePresence mode="wait">
          {selectedTab === 'attendance' && (
            <motion.div
              key="tab-attendance"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Alert tuyển guest */}
              <div
                className={`p-4 rounded-3xl border flex items-center justify-between shadow-xs ${
                  (calculation?.neededGuests || 0) > 0
                    ? 'bg-amber-50/90 border-amber-200/80 text-amber-950'
                    : 'bg-emerald-50/90 border-emerald-200/80 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-3">
                  {(calculation?.neededGuests || 0) > 0 ? (
                    <div className="p-2 bg-amber-100 text-amber-700 rounded-2xl">
                      <AlertTriangle size={20} />
                    </div>
                  ) : (
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-2xl">
                      <CheckCircle2 size={20} />
                    </div>
                  )}
                  <div>
                    <span className="font-bold text-sm block">
                      Tình trạng sân: {calculation?.playerStatusText}
                    </span>
                    <p className="text-xs opacity-75 mt-0.5">
                      Hiện có {calculation?.activeCount} người ({calculation?.attendingMembers} thành viên,{' '}
                      {calculation?.existingGuests} khách giao lưu)
                    </p>
                  </div>
                </div>

                {(calculation?.neededGuests || 0) > 0 && (
                  <Chip size="sm" color="warning" variant="solid" className="font-bold px-2">
                    Cần {calculation?.neededGuests} guest
                  </Chip>
                )}
              </div>

              {/* Danh sách thành viên cố định */}
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 text-sm">
                    Thành viên cố định ({session.participants.filter((p) => !p.isGuest).length})
                  </h3>
                  <span className="text-[11px] text-slate-400">Deadline báo nghỉ: trước 6 tiếng</span>
                </div>

                <div className="space-y-2">
                  {session.participants
                    .filter((p) => !p.isGuest)
                    .map((p) => {
                      const isAttending = p.attendanceStatus === 'ATTENDING';
                      const isAbsentValid = p.attendanceStatus === 'ABSENT_VALID';
                      const isAbsentLate = p.attendanceStatus === 'ABSENT_LATE';
                      const canEdit = isAdmin || p.userId === currentUser?.id;

                      return (
                        <motion.div
                          key={p.id}
                          whileHover={{ x: 2 }}
                          className="p-3 bg-slate-50/70 hover:bg-slate-100/80 rounded-2xl border border-slate-200/60 flex items-center justify-between gap-3 transition"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">{p.userName}</span>
                              {p.userId === currentUser?.id && (
                                <Chip size="sm" variant="flat" color="success" className="h-4 text-[10px] font-bold">
                                  Bạn
                                </Chip>
                              )}
                            </div>
                            <span className="text-xs text-slate-400">{p.userPhone}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isAttending && (
                              <Chip size="sm" color="success" variant="flat" className="font-bold text-xs">
                                Đi đánh
                              </Chip>
                            )}
                            {isAbsentValid && (
                              <Chip size="sm" color="primary" variant="flat" className="font-bold text-xs">
                                Nghỉ (-6h, trừ tiền)
                              </Chip>
                            )}
                            {isAbsentLate && (
                              <Chip size="sm" color="danger" variant="flat" className="font-bold text-xs">
                                Nghỉ muộn (mất tiền)
                              </Chip>
                            )}

                            {canEdit && !session.isSettled && (
                              <Button
                                size="sm"
                                variant={isAttending ? 'bordered' : 'flat'}
                                color={isAttending ? 'default' : 'success'}
                                onPress={() => handleAttendance(p.id, isAttending ? 'ABSENT' : 'ATTENDING')}
                                className="h-8 text-xs font-bold rounded-xl"
                              >
                                {isAttending ? 'Báo nghỉ' : 'Báo đi'}
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
              </Card>

              {/* Danh sách Khách giao lưu (Guest) */}
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 text-sm">
                    Khách Giao Lưu ({session.participants.filter((p) => p.isGuest).length})
                  </h3>
                  <Chip size="sm" color="secondary" variant="flat" className="font-bold text-[11px]">
                    Phụ thu: +{formatMoney(session.guestSurcharge)} / khách
                  </Chip>
                </div>

                {/* Form thêm Guest nhanh với HeroUI Input & Button */}
                {isAdmin && !session.isSettled && (
                  <form onSubmit={handleAddGuest} className="flex gap-2">
                    <Input
                      size="sm"
                      placeholder="Tên khách giao lưu (VD: Tuấn giao lưu)"
                      value={guestName}
                      onValueChange={setGuestName}
                      variant="bordered"
                      radius="lg"
                      className="flex-1"
                    />
                    <Input
                      size="sm"
                      placeholder="SĐT (tùy chọn)"
                      value={guestPhone}
                      onValueChange={setGuestPhone}
                      variant="bordered"
                      radius="lg"
                      className="w-36 hidden sm:block"
                    />
                    <Button
                      type="submit"
                      color="secondary"
                      variant="solid"
                      size="sm"
                      isLoading={addingGuest}
                      startContent={!addingGuest && <Plus size={15} />}
                      className="font-bold rounded-xl px-4"
                    >
                      Thêm Guest
                    </Button>
                  </form>
                )}

                <div className="space-y-2">
                  {session.participants.filter((p) => p.isGuest).length === 0 ? (
                    <p className="text-xs text-slate-400 py-3 text-center">Chưa có khách giao lưu nào.</p>
                  ) : (
                    session.participants
                      .filter((p) => p.isGuest)
                      .map((g) => (
                        <motion.div
                          key={g.id}
                          whileHover={{ scale: 1.005 }}
                          className="p-3 bg-purple-50/50 rounded-2xl border border-purple-100 flex items-center justify-between gap-3 shadow-2xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">{g.userName}</span>
                              <Chip size="sm" color="secondary" variant="solid" className="h-4 text-[10px] font-bold">
                                Guest
                              </Chip>
                            </div>
                            <span className="text-xs text-slate-500 font-medium">
                              Phải nộp: {formatMoney(g.totalCost || 56000)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              color="secondary"
                              startContent={<QrCode size={14} />}
                              onPress={() => openQR(g)}
                              className="h-8 font-bold rounded-xl text-xs"
                            >
                              Mã QR
                            </Button>

                            {isAdmin && !session.isSettled && (
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                color="danger"
                                onPress={() => handleRemoveGuest(g.id)}
                                className="rounded-xl"
                              >
                                <Trash2 size={16} />
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      ))
                  )}
                </div>
              </Card>
            </motion.div>
          )}

          {/* TAB 2: CHI PHÍ & CẦU NƯỚC */}
          {selectedTab === 'expenses' && (
            <motion.div
              key="tab-expenses"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Tiền sân */}
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-xl">
                      <Calendar size={18} />
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm">Tiền Sân</h3>
                  </div>
                  <Chip size="sm" color="success" variant="flat" className="font-extrabold text-sm">
                    {formatMoney(session.totalCourtFee)}
                  </Chip>
                </div>

                <div className="space-y-2">
                  {session.courts?.map((c) => (
                    <div key={c.id} className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 text-xs block">{c.courtName}</span>
                        <span className="text-slate-400 text-xs">
                          {c.hours} tiếng • {formatMoney(c.hourlyRate)} / giờ
                        </span>
                      </div>
                      <span className="font-extrabold text-slate-800 text-xs">{formatMoney(c.totalCost)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Chia đều cho {calculation?.activeCount} người thực tế chơi (~{formatMoney(calculation?.courtFeePerPerson)} / người).
                </p>
              </Card>

              {/* Cầu lông & Tồn kho */}
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-100 text-amber-700 rounded-xl">
                      <Package size={18} />
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm">Cầu Lông & Trừ Kho</h3>
                  </div>
                  <Chip size="sm" color="warning" variant="flat" className="font-extrabold text-sm">
                    {formatMoney(session.totalShuttleFee)}
                  </Chip>
                </div>

                <div className="space-y-2">
                  {session.shuttleUsages?.map((u) => (
                    <div key={u.id} className="p-3 bg-amber-50/50 rounded-2xl flex items-center justify-between border border-amber-100">
                      <div>
                        <span className="font-bold text-slate-800 text-xs block">{u.brandName}</span>
                        <span className="text-slate-400 text-xs">
                          Đã dùng: <strong>{u.ballsUsed} quả</strong> • Đơn giá: {formatMoney(u.pricePerBall)} / quả
                        </span>
                      </div>
                      <span className="font-extrabold text-slate-800 text-xs">{formatMoney(u.totalCost)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Chia đều cho {calculation?.activeCount} người chơi (~{formatMoney(calculation?.shuttleFeePerPerson)} / người).
                </p>
              </Card>

              {/* Nước uống (Ca trà đá chia đều / Chai riêng) */}
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 text-blue-700 rounded-xl">
                      <Coffee size={18} />
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm">Nước Uống</h3>
                  </div>
                  <Chip size="sm" color="primary" variant="flat" className="font-extrabold text-sm">
                    {formatMoney(session.totalDrinkFee)}
                  </Chip>
                </div>

                <div className="space-y-2">
                  {session.drinks?.map((d) => (
                    <div key={d.id} className="p-3 bg-blue-50/40 rounded-2xl border border-blue-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-800 text-xs block">
                            {d.drinkName} {d.isShared && '(Ca uống chung)'}
                          </span>
                          <span className="text-slate-400 text-xs">
                            {d.quantity} {d.isShared ? 'ca' : 'chai'} • Người mua: <strong>{d.payerName}</strong>
                          </span>
                        </div>
                        <span className="font-extrabold text-slate-800 text-xs">{formatMoney(d.totalCost)}</span>
                      </div>

                      {d.isShared && d.assignedParticipants && (
                        <div className="pt-2 border-t border-blue-100">
                          <span className="text-[11px] text-slate-500 font-medium block mb-1">
                            Chia cho {d.assignedParticipants.length} người uống (
                            {formatMoney(d.totalCost / d.assignedParticipants.length)} / người):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {d.assignedParticipants.map((sh) => (
                              <Chip key={sh.participantId} size="sm" variant="flat" color="default" className="text-[10px]">
                                {sh.participantName}
                              </Chip>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Thành viên ứng tiền */}
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-purple-100 text-purple-700 rounded-xl">
                      <Users size={18} />
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm">Thành Viên Ứng Tiền</h3>
                  </div>
                  <span className="text-xs text-purple-700 font-medium">Nhóm nợ hoàn trả</span>
                </div>

                <div className="space-y-2">
                  {session.advances?.map((adv) => (
                    <div key={adv.id} className="p-3 bg-purple-50/50 rounded-2xl border border-purple-100 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 text-xs block">{adv.userName}</span>
                        <span className="text-slate-400 text-xs">{adv.notes || 'Ứng chi phí buổi'}</span>
                      </div>
                      <span className="font-extrabold text-purple-700 text-sm">
                        +{formatMoney(adv.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {/* TAB 3: BẢNG BILL & VIETQR */}
          {selectedTab === 'settlement' && (
            <motion.div
              key="tab-settlement"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">
                      Bảng Quyết Toán Buổi {session.sessionCode}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Làm tròn lên 1.000đ, khách giao lưu nộp đủ, thành viên cố định bù trừ khoản ứng
                    </p>
                  </div>
                </div>

                {/* Danh sách từng người */}
                <div className="space-y-3">
                  {session.participants.map((p) => {
                    const isAttending = p.attendanceStatus === 'ATTENDING';
                    const needsToPay = p.debtAmount > 0;
                    const isOverpaid = p.netSettlement < 0;

                    return (
                      <motion.div
                        key={p.id}
                        whileHover={{ y: -1 }}
                        className={`p-3.5 rounded-2xl border transition ${
                          isAttending
                            ? 'bg-white border-slate-200/80 shadow-2xs'
                            : 'bg-slate-50/60 border-slate-200 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">{p.userName}</span>
                              {p.isGuest ? (
                                <Chip size="sm" color="secondary" variant="flat" className="h-4 text-[10px] font-bold">
                                  Guest
                                </Chip>
                              ) : (
                                <Chip size="sm" color="success" variant="flat" className="h-4 text-[10px] font-semibold">
                                  Cố định
                                </Chip>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {isAttending ? (
                                <span>
                                  {p.isGuest ? 'Sân + Cầu + Nước + Phụ thu' : 'Cầu + Nước'}
                                  {p.totalAdvanced > 0 && ` • Đã ứng: ${formatMoney(p.totalAdvanced)}`}
                                </span>
                              ) : (
                                <span>
                                  Nghỉ ({p.attendanceStatus === 'ABSENT_VALID' ? 'Có phép -6h' : 'Muộn'})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right flex items-center gap-2 sm:gap-3">
                            <div>
                              {needsToPay ? (
                                <div>
                                  <span className="font-extrabold text-red-600 text-sm block">
                                    {formatMoney(p.debtAmount)}
                                  </span>
                                  <span className="text-[10px] text-red-500 font-bold">Cần nộp</span>
                                </div>
                              ) : isOverpaid ? (
                                <div>
                                  <span className="font-extrabold text-emerald-600 text-sm block">
                                    {formatMoney(Math.abs(p.netSettlement))}
                                  </span>
                                  <span className="text-[10px] text-emerald-600 font-bold">Nhóm hoàn lại</span>
                                </div>
                              ) : (
                                <div>
                                  <span className="font-bold text-slate-700 text-sm block">0 ₫</span>
                                  <span className="text-[10px] text-slate-400">Đã xong</span>
                                </div>
                              )}
                            </div>

                            {needsToPay && (
                              <Button
                                isIconOnly
                                size="sm"
                                variant="flat"
                                color="success"
                                onPress={() => openQR(p)}
                                className="rounded-xl"
                                title="Xem VietQR"
                              >
                                <QrCode size={17} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
