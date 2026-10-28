'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [istTime, setIstTime] = useState<string>('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };
      setIstTime(new Intl.DateTimeFormat('en-IN', options).format(now));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (e) {
      console.error(e);
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#080d16] text-slate-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#0b121e]/90 backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="w-full px-2 sm:px-4 mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20 font-mono font-bold text-white text-sm">
              OI
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">NIFTY 50</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  OI ANALYZER
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Institutional Chain & Alerts</p>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 text-xs">
            {/* IST Time */}
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Indian Standard Time</span>
              <span className="font-mono text-slate-200 font-medium">{istTime || '--:--:--'}</span>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-3 py-1.5 rounded-lg border border-slate-700/80 hover:bg-slate-800 text-slate-300 hover:text-white transition font-medium text-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>{loggingOut ? 'Logging out...' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main body: 100% full screen width for high-density trading terminal */}
      <main className="flex-1 w-full px-2 sm:px-4 py-2 sm:py-3 flex flex-col gap-2.5">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/70 py-4 px-6 text-center text-xs text-slate-400">
        <p>
          Nifty 50 Option Chain OI Analyzer • Built with Next.js, Kite Connect & Supabase •{' '}
          <span className="text-amber-400/80">Educational / Informational Purpose Only</span>
        </p>
      </footer>
    </div>
  );
}
