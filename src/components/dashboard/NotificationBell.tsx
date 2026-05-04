'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, ShieldAlert, AlertTriangle, X } from 'lucide-react';

interface Notification {
  id:      string;
  type:    'hazard' | 'flagged';
  message: string;
  time:    Date;
  read:    boolean;
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Ensures only ONE Supabase Realtime subscription exists regardless of how many
// NotificationBell components are mounted (mobile drawer + desktop sidebar both
// render this component, but only one channel should ever be open).

let globalListeners = new Set<(n: Notification) => void>();
let channelBooted   = false;

function bootChannel() {
  if (channelBooted) return;
  channelBooted = true;

  const supabase = createClient();

  supabase
    .channel('ehs-notifications')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'hazard_reports' },
      (payload) => {
        const report = payload.new as any;
        const n: Notification = {
          id:      crypto.randomUUID(),
          type:    'hazard',
          message: `New ${report.severity} hazard reported at ${report.location}`,
          time:    new Date(),
          read:    false,
        };
        globalListeners.forEach(cb => cb(n));
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'inspections' },
      (payload) => {
        const ins = payload.new as any;
        if (ins.status === 'flagged') {
          const n: Notification = {
            id:      crypto.randomUUID(),
            type:    'flagged',
            message: `New inspection flagged — critical breach detected`,
            time:    new Date(),
            read:    false,
          };
          globalListeners.forEach(cb => cb(n));
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'inspections' },
      (payload) => {
        const ins = payload.new as any;
        if (ins.status === 'flagged') {
          const n: Notification = {
            id:      crypto.randomUUID(),
            type:    'flagged',
            message: `Inspection flagged — critical breach detected (score: ${Math.round(ins.compliance_score)}%)`,
            time:    new Date(),
            read:    false,
          };
          globalListeners.forEach(cb => cb(n));
        }
      }
    )
    .subscribe();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen]                   = useState(false);
  const ref                               = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read).length;

  useEffect(() => {
    // Boot the singleton channel once ever
    bootChannel();

    // Register this component instance as a listener
    const listener = (n: Notification) => {
      setNotifications(prev => [n, ...prev.slice(0, 19)]);
    };
    globalListeners.add(listener);

    // Cleanup: unregister this instance (does NOT close the channel)
    return () => { globalListeners.delete(listener); };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  function dismiss(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  function formatTime(date: Date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open && unread) markAllRead(); }}
        className="relative p-2 rounded-xl hover:bg-[var(--color-surface)] transition-colors"
        title="Notifications"
      >
        <Bell size={16} className="text-[var(--color-muted)]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px]
                           font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-2 z-30 w-80 bg-white
                          border border-[var(--color-border)] rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">Notifications</p>
              {notifications.length > 0 && (
                <button
                  onClick={() => setNotifications([])}
                  className="text-xs text-[var(--color-muted)] hover:text-red-500 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-[var(--color-border)]">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell size={24} className="mx-auto text-[var(--color-muted)] opacity-30 mb-2" />
                  <p className="text-xs text-[var(--color-muted)]">No notifications yet</p>
                </div>
              ) : (
                notifications.map(n => {
                  const Icon  = n.type === 'hazard' ? ShieldAlert : AlertTriangle;
                  const color = n.type === 'hazard'
                    ? 'text-orange-600 bg-orange-50'
                    : 'text-red-600 bg-red-50';
                  return (
                    <div key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors
                        ${!n.read ? 'bg-brand-50/40' : ''}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center
                                       flex-shrink-0 mt-0.5 ${color}`}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[var(--color-text)] leading-relaxed">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                          {formatTime(n.time)}
                        </p>
                      </div>
                      <button
                        onClick={() => dismiss(n.id)}
                        className="flex-shrink-0 p-1 hover:text-red-500
                                   text-[var(--color-muted)] transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}