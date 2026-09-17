'use client';

import React, { useState, useEffect } from 'react';
import {
  Button,
  Chip,
  Card,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
} from '@heroui/react';
import { Navbar } from '@/components/Navbar';
import { Reveal, InteractiveCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { formatMoney } from '@/lib/calculations';
import { InventoryMovement, ShuttlecockBatch } from '@/lib/types';
import type { AuthSessionUser } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { Package, Plus, AlertTriangle, CheckCircle2, LoaderCircle, History, Wrench } from 'lucide-react';

export default function ShuttlecockPage() {
  const [batches, setBatches] = useState<ShuttlecockBatch[]>([]);
  const [totalRemaining, setTotalRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isReconciled, setIsReconciled] = useState(true);

  // Form state
  const [brandName, setBrandName] = useState('Yonex AS-50');
  const [tubeQuantity, setTubeQuantity] = useState(5);
  const [ballsPerTube, setBallsPerTube] = useState(12);
  const [pricePerTube, setPricePerTube] = useState(310000);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isPaidFromTreasury, setIsPaidFromTreasury] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [shuttleRes, userRes] = await Promise.all([
        fetch('/api/shuttle'),
        fetch('/api/auth/me'),
      ]);

      const data = await shuttleRes.json();
      setBatches(data.batches || []);
      setTotalRemaining(data.totalRemaining || 0);
      setMovements(data.movements || []);
      setIsReconciled(Boolean(data.isReconciled));

      const uData = await userRes.json();
      setCurrentUser(uData.user);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetch('/api/shuttle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName,
          tubeQuantity,
          ballsPerTube,
          pricePerTube,
          notes,
          isPaidFromTreasury,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi nhập kho');

      setShowModal(false);
      await loadData();
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Không thể nhập kho cầu'));
    } finally {
      setSubmitting(false);
    }
  };

  const adjustStock = async (batch: ShuttlecockBatch, action: 'DAMAGED' | 'ADJUSTMENT') => {
    const raw = prompt(action === 'DAMAGED' ? 'Số quả hỏng/mất:' : 'Số tồn thực tế:', String(action === 'DAMAGED' ? 1 : batch.remainingBalls));
    if (raw === null) return;
    const value = Number(raw);
    const reason = prompt('Lý do điều chỉnh:')?.trim();
    if (!Number.isInteger(value) || value < 0 || !reason) return alert('Dữ liệu điều chỉnh không hợp lệ');
    try {
      const response = await fetch('/api/shuttle', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'DAMAGED'
          ? { action, batchId: batch.id, quantity: value, reason, version: batch.version || 0 }
          : { action, batchId: batch.id, newRemaining: value, reason, version: batch.version || 0 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể điều chỉnh kho');
      await loadData();
    } catch (reasonValue: unknown) {
      alert(getErrorMessage(reasonValue));
    }
  };

  const isAdmin = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  return (
    <div className="club-page club-shuttlecock min-h-screen pb-24 sm:pb-12">
      <Navbar user={currentUser} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Reveal className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">Quản lý Tồn kho Cầu</h1>
            <p className="text-xs text-slate-500 mt-0.5">Theo dõi xuất nhập kho chi tiết theo từng quả</p>
          </div>

          {isAdmin && (
            <Button
              color="primary"
              variant="solid"
              size="sm"
              startContent={<Plus size={16} />}
              onPress={() => setShowModal(true)}
              className="font-bold rounded-xl shadow-sm"
            >
              Nhập kho cầu
            </Button>
          )}
        </Reveal>

        {!isReconciled && <div className="club-state-panel club-state-error"><AlertTriangle size={20} /> Tồn kho document không khớp sổ movement. Hãy chạy kiểm tra integrity.</div>}

        {/* Tồn kho tổng quan */}
        <Reveal delay={0.05}>
          <Card className="bg-white/90 backdrop-blur-md rounded-3xl border border-slate-200/80 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-13 h-13 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-inner">
                  <Package size={26} />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Tổng số quả cầu còn lại</span>
                  <div className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
                    {totalRemaining} <span className="text-sm font-normal text-slate-400">quả</span>
                    <span className="text-xs text-slate-400 font-normal ml-2">
                      (~{(totalRemaining / 12).toFixed(1)} ống)
                    </span>
                  </div>
                </div>
              </div>

              <div>
                {totalRemaining < 12 ? (
                  <Chip
                    size="md"
                    color="danger"
                    variant="flat"
                    startContent={<AlertTriangle size={15} />}
                    className="font-bold text-xs px-3"
                  >
                    Tồn kho thấp, cần nhập thêm
                  </Chip>
                ) : (
                  <Chip
                    size="md"
                    color="success"
                    variant="flat"
                    startContent={<CheckCircle2 size={15} />}
                    className="font-bold text-xs px-3"
                  >
                    Tồn kho đảm bảo
                  </Chip>
                )}
              </div>
            </div>
          </Card>
        </Reveal>

        {/* Danh sách các lô cầu đã nhập */}
        <Reveal delay={0.1} className="space-y-3">
          <h2 className="font-extrabold text-slate-800 text-base">Lịch sử các lô nhập ({batches.length})</h2>

          {loading ? (
            <div className="club-state-panel"><LoaderCircle className="animate-spin" size={20} /> Đang kiểm kê kho cầu…</div>
          ) : <StaggerContainer className="space-y-3">
            {batches.map((b) => (
              <StaggerItem key={b.id}>
                <InteractiveCard className="bg-white/90 backdrop-blur-sm p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-800 text-sm">{b.brandName}</span>
                        <Chip size="sm" variant="flat" color="default" className="font-mono text-[10px] h-5">
                          {b.batchCode}
                        </Chip>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Ngày mua: {b.purchaseDate} • Người mua: <strong>{b.payerName || 'Nhóm'}</strong>
                        {b.notes && ` • Ghi chú: ${b.notes}`}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Đơn giá</span>
                        <span className="font-bold text-slate-700">
                          {formatMoney(b.pricePerTube)} / ống (~{formatMoney(b.pricePerBall)} / quả)
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-slate-400 block text-[11px]">Còn lại</span>
                        <span className="font-black text-amber-600 text-base">
                          {b.remainingBalls} / {b.totalBalls} <span className="text-xs font-normal">quả</span>
                        </span>
                      </div>
                      {isAdmin && <div className="flex gap-1">
                        <Button isIconOnly size="sm" variant="flat" color="warning" title="Ghi nhận hỏng/mất" onPress={() => adjustStock(b, 'DAMAGED')}><AlertTriangle size={14} /></Button>
                        <Button isIconOnly size="sm" variant="flat" title="Kiểm kê" onPress={() => adjustStock(b, 'ADJUSTMENT')}><Wrench size={14} /></Button>
                      </div>}
                    </div>
                  </div>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerContainer>}
          {!loading && batches.length === 0 && <div className="club-state-panel">Chưa có lô cầu nào được nhập.</div>}
        </Reveal>

        <Reveal delay={0.12} className="space-y-3">
          <div className="flex items-center gap-2"><History size={18} /><h2 className="font-extrabold text-slate-800 text-base">Sổ biến động kho</h2></div>
          <div className="space-y-2">
            {movements.slice(0, 30).map((movement) => <Card key={movement.id} className="p-3 rounded-2xl border border-slate-200/80">
              <div className="flex justify-between gap-3 text-xs"><div><strong>{movement.type}</strong><p className="text-slate-400">{movement.reason || movement.sessionId || movement.batchId}</p></div><span className={movement.quantity >= 0 ? 'font-black text-emerald-600' : 'font-black text-red-600'}>{movement.quantity >= 0 ? '+' : ''}{movement.quantity} quả</span></div>
            </Card>)}
          </div>
        </Reveal>

        {/* Modal Nhập kho */}
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          placement="center"
          backdrop="blur"
          size="md"
          classNames={{
            base: 'bg-white rounded-3xl border border-slate-200 shadow-2xl p-2',
            header: 'border-b border-slate-100 py-3 px-4',
            body: 'py-4 px-4',
            footer: 'border-t border-slate-100 py-3 px-4',
          }}
        >
          <ModalContent>
            {() => (
              <form onSubmit={handleAddBatch}>
                <ModalHeader className="flex-col gap-0.5">
                  <h3 className="text-base font-bold text-slate-800">Nhập Lô Cầu Mới</h3>
                  <p className="text-xs text-slate-400 font-normal">
                    Hệ thống tự chia đều: Đơn giá 1 quả = Giá ống / Số quả
                  </p>
                </ModalHeader>

                <ModalBody className="gap-3 text-xs">
                  <Input
                    label="Thương hiệu / Loại cầu"
                    value={brandName}
                    onValueChange={setBrandName}
                    variant="bordered"
                    radius="lg"
                    size="sm"
                    required
                  />

                  <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200/60">
                    <input type="checkbox" checked={isPaidFromTreasury} onChange={(event) => setIsPaidFromTreasury(event.target.checked)} />
                    <span>Đã thanh toán trực tiếp từ quỹ (bỏ chọn nếu thành viên mua ứng)</span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="number"
                      label="Số ống mua"
                      min={1}
                      value={String(tubeQuantity)}
                      onValueChange={(v) => setTubeQuantity(Number(v))}
                      variant="bordered"
                      radius="lg"
                      size="sm"
                      required
                    />
                    <Input
                      type="number"
                      label="Số quả / ống"
                      min={1}
                      value={String(ballsPerTube)}
                      onValueChange={(v) => setBallsPerTube(Number(v))}
                      variant="bordered"
                      radius="lg"
                      size="sm"
                      required
                    />
                  </div>

                  <Input
                    type="number"
                    label="Giá mua 1 ống (₫)"
                    step={1000}
                    value={String(pricePerTube)}
                    onValueChange={(v) => setPricePerTube(Number(v))}
                    variant="bordered"
                    radius="lg"
                    size="sm"
                    required
                  />

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/60 text-slate-600">
                    Tổng nhập: <strong>{tubeQuantity * ballsPerTube} quả</strong> • Đơn giá: <strong>{formatMoney(Math.ceil(pricePerTube / ballsPerTube))} / quả</strong>
                  </div>

                  <Input
                    label="Ghi chú (người mua / địa điểm)"
                    placeholder="VD: Tùng mua ứng tại cửa hàng thể thao"
                    value={notes}
                    onValueChange={setNotes}
                    variant="bordered"
                    radius="lg"
                    size="sm"
                  />
                </ModalBody>

                <ModalFooter>
                  <Button variant="light" color="default" onPress={() => setShowModal(false)} className="rounded-xl">
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    color="primary"
                    variant="solid"
                    isLoading={submitting}
                    className="font-bold rounded-xl shadow-sm"
                  >
                    Lưu lô nhập kho
                  </Button>
                </ModalFooter>
              </form>
            )}
          </ModalContent>
        </Modal>
      </main>
    </div>
  );
}
