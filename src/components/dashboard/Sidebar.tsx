'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ShieldCheck, ShieldAlert, LayoutDashboard, Package,
  ClipboardList, FileBarChart, LogOut, ChevronRight,
  Users, Scale, BookOpen, Menu, X
} from 'lucide-react';
import type { User } from '@/types';
import NotificationBell from '@/components/dashboard/NotificationBell';

const BASE_NAV = [
  { href: '/dashboard',             label: 'Overview',    icon: LayoutDashboard },
  { href: '/dashboard/assets',      label: 'Assets',      icon: Package },
  { href: '/dashboard/inspections', label: 'Inspections', icon: ClipboardList },
  { href: '/dashboard/reports',     label: 'Reports',     icon: FileBarChart },
  { href: '/dashboard/hazards',     label: 'Hazards',     icon: ShieldAlert },
  { href: '/dashboard/compliance',  label: 'Compliance',  icon: Scale },
];

const ADMIN_NAV      = { href: '/dashboard/admin',            label: 'Staff',      icon: Users };
const LEGAL_DOCS_NAV = { href: '/dashboard/admin/legal-docs', label: 'Legal Docs', icon: BookOpen };

const roleLabel: Record<string, string> = {
  shopfloor_worker: 'Shopfloor Worker',
  inspector:        'Inspector',
  ehs_manager:      'EHS Manager',
  admin:            'Admin',
};

function NavLinks({
  navItems,
  isAdmin,
  onNavClick,
}: {
  navItems:   { href: string; label: string; icon: any }[];
  isAdmin:    boolean;
  onNavClick: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = href === '/dashboard'
          ? pathname === '/dashboard'
          : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
              ${active
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
              }`}
          >
            <Icon size={16} className="flex-shrink-0" />
            <span className="truncate">{label}</span>
            {active && <ChevronRight size={13} className="ml-auto flex-shrink-0 opacity-70" />}
          </Link>
        );
      })}

      {isAdmin && (
        <div className="pt-3 mt-1">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
            Admin
          </p>
        </div>
      )}
    </nav>
  );
}

function UserFooter({
  profile,
  onLogout,
}: {
  profile:  User | null;
  onLogout: () => void;
}) {
  // NotificationBell is NOT rendered here to avoid duplicate Realtime subscriptions.
  // It is rendered once in the top-level Sidebar component instead.
  return (
    <div className="p-3 border-t border-[var(--color-border)] flex-shrink-0">
      <div className="flex items-center gap-2.5 mb-2 px-1">
        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center
                        text-brand-700 text-xs font-bold flex-shrink-0">
          {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{profile?.full_name ?? 'User'}</p>
          <p className="text-xs text-[var(--color-muted)] truncate">
            {roleLabel[profile?.role ?? ''] ?? profile?.role ?? '—'}
          </p>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-muted)]
                   hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
      >
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}

export default function Sidebar({ profile }: { profile: User | null }) {
  const [open, setOpen] = useState(false);
  const pathname        = usePathname();
  const router          = useRouter();
  const supabase        = createClient();

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  const isAdmin  = profile?.role === 'admin';
  const navItems = isAdmin ? [...BASE_NAV, ADMIN_NAV, LEGAL_DOCS_NAV] : BASE_NAV;

  return (
    <>
      {/* ── Mobile top bar ────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white
                         border-b border-[var(--color-border)] flex items-center px-4 gap-3">
        <button
          onClick={() => setOpen(true)}
          className="p-2 -ml-1 rounded-xl hover:bg-[var(--color-surface)]
                     text-[var(--color-text)] transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="text-white" size={14} />
          </div>
          <p className="text-sm font-semibold truncate">EHS Compliance AI</p>
        </div>

        {/* Single NotificationBell instance — mobile top bar only */}
        <NotificationBell />
      </header>

      {/* ── Mobile backdrop ───────────────────────────────────────── */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm
                    transition-opacity duration-300
                    ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* ── Mobile drawer ─────────────────────────────────────────── */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw]
                    bg-white flex flex-col shadow-2xl
                    transition-transform duration-300 ease-in-out
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Navigation menu"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-4
                        border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
              <ShieldCheck className="text-white" size={16} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">EHS Portal</p>
              <p className="text-sm font-semibold leading-tight">Compliance AI</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-xl hover:bg-[var(--color-surface)]
                       text-[var(--color-muted)] transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <NavLinks navItems={navItems} isAdmin={isAdmin} onNavClick={() => setOpen(false)} />
        <UserFooter profile={profile} onLogout={handleLogout} />
      </aside>

      {/* ── Desktop sidebar ───────────────────────────────────────── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-64
                        bg-white border-r border-[var(--color-border)] flex-col">
        {/* Logo + notification bell — desktop */}
        <div className="px-5 py-5 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
              <ShieldCheck className="text-white" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">EHS Portal</p>
              <p className="text-sm font-semibold leading-tight">Compliance AI</p>
            </div>
            {/* Single NotificationBell instance — desktop sidebar only */}
            <NotificationBell />
          </div>
        </div>

        <NavLinks navItems={navItems} isAdmin={isAdmin} onNavClick={() => {}} />
        <UserFooter profile={profile} onLogout={handleLogout} />
      </aside>
    </>
  );
}