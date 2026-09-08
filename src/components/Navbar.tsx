'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, CalendarDays, Package, Users, Wallet, LogOut, ChevronRight, LogIn } from 'lucide-react';
import { AuthSessionUser } from '@/lib/auth';

interface NavbarProps { user: AuthSessionUser | null }

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = [
    { label: 'Tổng quan', href: '/', icon: Home }, { label: 'Buổi đánh', href: '/sessions', icon: CalendarDays },
    { label: 'Kho cầu', href: '/shuttlecock', icon: Package }, { label: 'Thành viên', href: '/members', icon: Users },
    { label: 'Quỹ chung', href: '/treasury', icon: Wallet },
  ];
  const current = navItems.find((item) => pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)));
  const handleLogout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); router.refresh(); };
  return <>
    <aside className="club-sidebar">
      <Link href="/" className="club-brand"><span className="club-brand-mark">🏸<i /></span>cầu<span>.</span></Link>
      <div className="club-team"><span className="club-team-icon">🏸</span><div><strong>Đội cầu lông</strong><small>Quý 1 · 2026</small></div><ChevronRight size={15} /></div>
      <span className="club-nav-label">QUẢN LÝ ĐỘI</span>
      <nav>{navItems.map((item) => { const Icon = item.icon; const active = current?.href === item.href; return <Link key={item.href} href={item.href} className={`club-nav-item ${active ? 'active' : ''}`}>{active && <motion.span layoutId="nav-highlight" className="club-nav-highlight" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}<Icon size={17} /><span>{item.label}</span>{active && <b />}</Link>; })}</nav>
      <div className="club-sidebar-note"><span>✦</span><p>Chơi vui, minh bạch<br />và cùng nhau tiến bộ.</p></div>
      <div className="club-profile">{user ? <><span className="club-avatar">{user.name.slice(0, 1)}</span><div><strong>{user.name}</strong><small>{user.role === 'OWNER' ? 'Chủ nhiệm' : user.role === 'ADMIN' ? 'Quản trị viên' : 'Hội viên'}</small></div><button onClick={handleLogout} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={16} /></button></> : <Link href="/login" className="club-login-link"><LogIn size={16} /><span>Đăng nhập để sử dụng đội</span></Link>}</div>
    </aside>
    <header className="club-topbar"><div className="club-breadcrumb"><span>Đội cầu lông</span><ChevronRight size={14} /><strong>{current?.label || 'Tổng quan'}</strong></div>{user ? <div className="club-online"><i />Dữ liệu đã đồng bộ</div> : <Link href="/login" className="club-top-login">Đăng nhập</Link>}</header>
    <header className="club-mobilebar"><Link href="/" className="club-mobile-brand">🏸 <span>cầu.</span></Link><span>{current?.label}</span></header>
    <nav className="club-mobile-nav">{navItems.map((item) => { const Icon = item.icon; const active = current?.href === item.href; return <Link key={item.href} href={item.href} className={active ? 'active' : ''}><Icon size={19} /><span>{item.label}</span></Link>; })}</nav>
  </>;
}
