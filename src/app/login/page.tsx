'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, Shield, User, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('0988888888');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đăng nhập thất bại');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Lỗi đăng nhập');
    } finally {
      setLoading(false);
    }
  };

  const selectQuickUser = (userPhone: string) => {
    setPhone(userPhone);
    setPassword('123456');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border border-slate-200/60">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto text-3xl mb-3 shadow-inner">
            🏸
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Đội Nhóm Cầu Lông</h1>
          <p className="text-sm text-slate-500 mt-1">Đăng nhập tài khoản thành viên</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Số điện thoại</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0988888888"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            <LogIn size={18} />
            <span>{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
          </button>
        </form>

        {/* Nút chọn nhanh tài khoản để test nghiệp vụ */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-3 text-center">
            Chọn nhanh tài khoản để thử nghiệm
          </span>
          <div className="grid grid-cols-1 gap-2 text-xs">
            <button
              type="button"
              onClick={() => selectQuickUser('0988888888')}
              className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                phone === '0988888888'
                  ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-amber-500" />
                <div>
                  <span className="font-semibold block">Nguyễn Đức Tùng</span>
                  <span className="text-slate-400">0988888888 • Chủ nhóm (Owner)</span>
                </div>
              </div>
              <span className="text-slate-400">Pass: 123456</span>
            </button>

            <button
              type="button"
              onClick={() => selectQuickUser('0977777777')}
              className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                phone === '0977777777'
                  ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-blue-500" />
                <div>
                  <span className="font-semibold block">Phạm Hồng Đức</span>
                  <span className="text-slate-400">0977777777 • Thủ quỹ (Admin)</span>
                </div>
              </div>
              <span className="text-slate-400">Pass: 123456</span>
            </button>

            <button
              type="button"
              onClick={() => selectQuickUser('0966666666')}
              className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                phone === '0966666666'
                  ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                <div>
                  <span className="font-semibold block">Trần Văn Chính</span>
                  <span className="text-slate-400">0966666666 • Thành viên (Member)</span>
                </div>
              </div>
              <span className="text-slate-400">Pass: 123456</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

