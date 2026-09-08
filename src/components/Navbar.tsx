'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button, Chip } from '@heroui/react';
import { Home, Calendar, Package, Users, Wallet, LogOut, Shield } from 'lucide-react';
import { AuthSessionUser } from '@/lib/auth';

interface NavbarProps {
  user: AuthSessionUser | null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { label: 'Tổng quan', href: '/', icon: Home },
    { label: 'Buổi đánh', href: '/sessions', icon: Calendar },
    { label: 'Kho cầu', href: '/shuttlecock', icon: Package },
    { label: 'Thành viên', href: '/members', icon: Users },
    { label: 'Quỹ chung', href: '/treasury', icon: Wallet },
  ];

  return (
    <>
      {/* Top Header with Glass Effect */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-4 py-2.5 shadow-2xs"
      >
      {/* Top Header - Completely Static, No Entrance Animation */}
      {/* Top Header - Static without entrance slide */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-2.5 shadow-2xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 6 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-emerald-500/20"
            >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-xl shadow-sm">
              🏸
            </motion.div>
            </div>
            <div>
              <div className="font-bold text-slate-800 text-base leading-tight group-hover:text-emerald-700 transition">
                Badminton Club
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Chip size="sm" variant="flat" color="success" className="h-4 text-[10px] font-semibold px-1.5">
                  Quý 1/2026
                </Chip>
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-sm font-bold text-slate-700">{user.name}</span>
                  <div className="flex items-center justify-end gap-1">
                    {user.role === 'OWNER' && (
                      <Chip size="sm" variant="flat" color="warning" className="h-4 text-[10px] font-bold">
                        Chủ nhiệm
                      </Chip>
                    )}
                    {user.role === 'ADMIN' && (
                      <Chip size="sm" variant="flat" color="primary" className="h-4 text-[10px] font-bold">
                        Thủ quỹ
                      <Chip size="sm" variant="flat" color="secondary" className="h-4 text-[10px] font-bold">
                        Quản trị
                      </Chip>
                    )}
                    {user.role === 'MEMBER' && (
                      <span className="text-[11px] text-slate-400 font-medium">Thành viên</span>
                      <Chip size="sm" variant="flat" color="default" className="h-4 text-[10px] text-slate-500">
                        Hội viên
                      </Chip>
                    )}
                    <span className="text-xs text-slate-400 font-mono">#{user.id.slice(-4)}</span>
                  </div>
                </div>

                <Button
                  isIconOnly
                  variant="light"
                  color="danger"
                  size="sm"
                  onPress={handleLogout}
                  title="Đăng xuất"
                  className="rounded-xl"
                >
                  <LogOut size={17} />
                </Button>
              </div>
            ) : (
              <Link href="/login">
                <Button
                  size="sm"
                  color="primary"
                  variant="solid"
                  className="font-bold rounded-xl shadow-sm"
                >
                  Đăng nhập
                </Button>
              </Link>
            )}
          </div>
        </div>
      </motion.header>
      </header>

      {/* Desktop Navigation Bar with Spring Active Indicator */}
      <div className="hidden sm:block bg-white/70 backdrop-blur-sm border-b border-slate-200/60 sticky top-[61px] z-30">
      {/* Desktop Navigation Bar - Static Bar with Spring Active Indicator */}
      <div className="hidden sm:block bg-white/80 backdrop-blur-sm border-b border-slate-200/80 sticky top-[61px] z-30">
        <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
              >
                {isActive && (
                  <motion.div
                    layoutId="desktop-nav-pill"
                    className="absolute inset-0 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60 shadow-2xs"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute inset-0 bg-emerald-100/70 border border-emerald-300/60 rounded-xl"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className={`relative z-10 flex items-center gap-1.5 ${isActive ? 'text-emerald-700 font-extrabold' : ''}`}>
                  <Icon size={16} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                  <span>{item.label}</span>
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon
                    size={15}
                    className={isActive ? 'text-emerald-700 stroke-[2.5]' : 'text-slate-500'}
                  />
                  <span className={isActive ? 'text-emerald-900 font-bold' : ''}>
                    {item.label}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom Navigation for Mobile (Touch-friendly & Animated) */}
      <motion.nav
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 py-1.5 px-3 sm:hidden shadow-lg"
      >
      {/* Bottom Navigation for Mobile - Static, No Entrance Slide */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 py-1.5 px-3 sm:hidden shadow-lg">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-col items-center py-1 px-3 rounded-xl transition"
              >
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-pill"
                    className="absolute inset-0 bg-emerald-50 rounded-xl"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10 flex flex-col items-center">
                  <motion.div whileTap={{ scale: 0.85 }}>
                    <Icon
                      size={20}
                      className={`transition ${isActive ? 'text-emerald-600 stroke-[2.5]' : 'text-slate-400'}`}
                    />
                  </motion.div>
                  <Icon
                    size={20}
                    className={`transition ${isActive ? 'text-emerald-600 stroke-[2.5]' : 'text-slate-400'}`}
                  />
                  <span
                    className={`text-[10px] mt-0.5 transition ${
                      isActive ? 'text-emerald-700 font-bold' : 'text-slate-500 font-medium'
                    }`}
                  >
                    {item.label}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </motion.nav>
      </nav>
    </>
  );
}
