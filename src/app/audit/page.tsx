'use client';

import { useEffect, useState } from 'react';
import { Card, Chip } from '@heroui/react';
import { Navbar } from '@/components/Navbar';
import type { AuthSessionUser } from '@/lib/auth';
import type { AuditLog } from '@/lib/types';
import { AlertCircle, LoaderCircle, ScrollText } from 'lucide-react';

export default function AuditPage() {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([fetch('/api/auth/me'), fetch('/api/audit')])
      .then(async ([userResponse, auditResponse]) => {
        const [userBody, auditBody] = await Promise.all([userResponse.json(), auditResponse.json()]);
        if (!auditResponse.ok) throw new Error(auditBody.error || 'Không thể tải audit');
        setUser(userBody.user || null);
        setLogs(auditBody.logs || []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không thể tải audit'))
      .finally(() => setLoading(false));
  }, []);
  return <div className="club-page min-h-screen pb-24 sm:pb-12">
    <Navbar user={user} />
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-2"><ScrollText size={20} /><h1 className="text-xl font-black text-slate-800">Nhật ký kiểm toán</h1></div>
      {loading && <div className="club-state-panel"><LoaderCircle className="animate-spin" size={20} /> Đang tải audit…</div>}
      {error && <div className="club-state-panel club-state-error"><AlertCircle size={20} /> {error}</div>}
      {!loading && !error && logs.map((log) => <Card key={log.id} className="p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div><strong className="text-sm text-slate-800">{log.action}</strong><p className="text-xs text-slate-500">{log.entityType} • {log.entityId}</p></div>
          <Chip size="sm" variant="flat">{log.userName}</Chip>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">{log.createdAt} • Request: {log.requestId || 'legacy'}</p>
        {log.reason && <p className="text-xs text-slate-600 mt-1">Lý do: {log.reason}</p>}
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-slate-500">Chi tiết thay đổi</summary><pre className="mt-2 p-3 bg-slate-50 rounded-xl overflow-auto text-[10px]">{JSON.stringify({ oldData: log.oldData, newData: log.newData }, null, 2)}</pre></details>
      </Card>)}
    </main>
  </div>;
}
