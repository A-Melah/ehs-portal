'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ShieldCheck, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] px-4">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-30"
        style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #15b36e22 0%, transparent 50%), radial-gradient(circle at 80% 20%, #0a915922 0%, transparent 50%)' }}
      />

      <div className="relative w-full max-w-md fade-up">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center shadow-lg">
            <ShieldCheck className="text-white" size={24} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--color-muted)] font-medium">AI-Powered</p>
            <h1 className="text-xl font-display leading-tight">EHS Compliance Portal</h1>
          </div>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h2 className="text-2xl font-display mb-1">Welcome back</h2>
          <p className="text-sm text-[var(--color-muted)] mb-6">Sign in to your account to continue</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                           focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white
                           focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">
                {error}
              </p>
            )}

            <button onClick={handleLogin} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-[var(--color-muted)] mt-6">
          Secured by Supabase Auth · EHS Compliance Portal v1.0
        </p>
      </div>
    </div>
  );
}