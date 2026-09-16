'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { getErrorMessage } from '@/lib/errors';

export default function CreateSessionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Default values
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('20:00');
  const [venueName, setVenueName] = useState('Sân Cầu Lông Ngôi Sao');
  const [courtNumbers, setCourtNumbers] = useState('Sân 1');
  const [targetPlayers, setTargetPlayers] = useState(8);
  const [hourlyRate, setHourlyRate] = useState(100000);
  const [guestSurcharge, setGuestSurcharge] = useState(10000);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionDate,
          startTime,
          endTime,
          venueName,
          courtNumbers,
          targetPlayers,
          hourlyRate,
          guestSurcharge,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi tạo buổi đánh');

      router.push(`/sessions/${data.session.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Không thể tạo buổi đánh'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="club-page club-form-page min-h-screen pb-20 sm:pb-8">
      <Navbar user={null} />

      <main className="max-w-xl mx-auto px-4 py-6 space-y-5">
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft size={16} />
          <span>Quay lại danh sách</span>
        </Link>

        <div className="club-form-panel bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Tạo Buổi Đánh Mới</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Hệ thống sẽ tự động thêm danh sách 8 thành viên cố định vào buổi để điểm danh
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ngày đánh</label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-sm focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Giờ bắt đầu</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Giờ kết thúc</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-sm focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Địa điểm sân</label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-sm focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Số sân thuê (cách nhau bởi phẩy)</label>
                <input
                  type="text"
                  value={courtNumbers}
                  onChange={(e) => setCourtNumbers(e.target.value)}
                  placeholder="Sân 1, Sân 2"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Giá thuê sân / giờ (₫)</label>
                <input
                  type="number"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Số người mục tiêu (Target)</label>
                <input
                  type="number"
                  value={targetPlayers}
                  onChange={(e) => setTargetPlayers(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phụ thu khách giao lưu (₫)</label>
                <input
                  type="number"
                  value={guestSurcharge}
                  onChange={(e) => setGuestSurcharge(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-sm focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 mt-2"
            >
              <Save size={16} />
              <span>{loading ? 'Đang tạo...' : 'Tạo Buổi Đánh'}</span>
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
