import React from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { formatMoney } from '@/lib/calculations';
import { Session } from '@/lib/types';
import { Calendar, Plus, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SessionsListPage() {
  const user = await getCurrentUser();
  const db = await getDb();

  const sessions = await db
    .collection<Session>('sessions')
    .find({})
    .sort({ sessionDate: -1, startTime: -1 })
    .toArray();

  const isAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN';

  return (
    <div className="club-page club-sessions min-h-screen pb-20 sm:pb-8">
      <Navbar user={user} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Danh sách Buổi đánh</h1>
            <p className="text-xs text-slate-500">Quản lý lịch, điểm danh và quyết toán các buổi</p>
          </div>

          {isAdmin && (
            <Link
              href="/sessions/create"
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus size={16} />
              <span>Tạo buổi mới</span>
            </Link>
          )}
        </div>

        <div className="club-record-list space-y-3">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              className="block bg-white p-4 rounded-2xl border border-slate-200 hover:border-emerald-500 transition shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm">
                    {s.sessionCode}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <span>Buổi {s.sessionCode} • {s.sessionDate}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          s.isSettled ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {s.isSettled ? 'Đã quyết toán' : 'Đang mở'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {s.startTime} - {s.endTime} • {s.venueName}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="font-bold text-slate-800 text-sm block">
                      {formatMoney(s.totalExpense)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {s.participants?.filter((p) => p.attendanceStatus === 'ATTENDING').length || 0} người chơi
                    </span>
                  </div>
                  <ChevronRight size={18} className="text-slate-400" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
