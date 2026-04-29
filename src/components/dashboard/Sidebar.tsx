'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ShieldCheck, LayoutDashboard, Package, ClipboardList,
  FileBarChart, LogOut, ChevronRight
} from 'lucide-react';
import type { User } from '@/types';

const navItems = [
  { href: '/dashboard',             label: 'Overview',    icon: LayoutDashboard },
  { href: '/dashboard/assets',      label: 'Assets',      icon: Package },
  { href: '/dashboard/inspections', label: 'Inspections', icon: ClipboardList },
  { href: '/dashboard/reports',     label: 'Reports',     icon: FileBarChart },
];

export default function Sidebar({ profile }: { profile: User | null }) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-[var(--color-border)]
                      flex-col z-40 hidden md:flex">
      {/* Logo */}
      <div className="p-6 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <ShieldCheck className="text-white" size={18} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">EHS Portal</p>
            <p className="text-sm font-semibold leading-tight">Compliance AI</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${active
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
                }`}
            >
              <Icon size={16} />
              {label}
              {active && <ChevronRight size={14} className="ml-auto opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold">
            {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.full_name ?? 'User'}</p>
            <p className="text-xs text-[var(--color-muted)] capitalize">{profile?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-muted)]
                     hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
