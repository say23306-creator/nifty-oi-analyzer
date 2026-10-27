'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import type { DbChainRow } from '@/lib/db/queries';

interface OIBarChartProps {
  rows: DbChainRow[];
  spot: number;
}

interface ChartItem {
  strike: number;
  callOI: number;
  putOI: number;
  isATM: boolean;
}

export default function OIBarChart({ rows, spot }: OIBarChartProps) {
  const chartData = useMemo(() => {
    const map = new Map<number, { callOI: number; putOI: number }>();

    for (const r of rows) {
      if (!map.has(r.strike)) {
        map.set(r.strike, { callOI: 0, putOI: 0 });
      }
      const entry = map.get(r.strike)!;
      if (r.type === 'CE') {
        entry.callOI = (r.oi ?? 0) / 100000; // in Lakhs
      } else {
        entry.putOI = (r.oi ?? 0) / 100000; // in Lakhs
      }
    }

    const strikes = Array.from(map.keys()).sort((a, b) => a - b);
    if (strikes.length === 0) return [];

    // Find ATM strike
    let nearestAtm = strikes[0];
    let minDiff = Infinity;
    for (const s of strikes) {
      const diff = Math.abs(s - spot);
      if (diff < minDiff) {
        minDiff = diff;
        nearestAtm = s;
      }
    }

    // Keep ±12 strikes around ATM
    const atmIndex = strikes.indexOf(nearestAtm);
    const start = Math.max(0, atmIndex - 12);
    const end = Math.min(strikes.length, atmIndex + 13);
    const windowStrikes = strikes.slice(start, end);

    return windowStrikes.map((strike): ChartItem => {
      const data = map.get(strike)!;
      return {
        strike,
        callOI: parseFloat(data.callOI.toFixed(2)),
        putOI: parseFloat(data.putOI.toFixed(2)),
        isATM: strike === nearestAtm,
      };
    });
  }, [rows, spot]);

  if (chartData.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-slate-500 text-sm">
        No Open Interest data available
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>Open Interest Distribution</span>
            <span className="text-xs font-normal text-slate-400 font-mono">(in Lakhs)</span>
          </h2>
          <p className="text-xs text-slate-400">Call (CE) vs Put (PE) OI by strike around ATM</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-cyan-500" />
            <span className="text-slate-300">Call OI (CE)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500" />
            <span className="text-slate-300">Put OI (PE)</span>
          </div>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="strike"
              stroke="#64748b"
              fontSize={11}
              fontFamily="monospace"
              tickLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              fontFamily="monospace"
              tickLine={false}
              unit=" L"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const ce = payload.find((p) => p.dataKey === 'callOI')?.value as number;
                  const pe = payload.find((p) => p.dataKey === 'putOI')?.value as number;
                  const strikePcr = ce > 0 ? (pe / ce).toFixed(2) : '-';

                  return (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg shadow-xl text-xs font-mono">
                      <p className="font-bold text-white mb-1.5">Strike: {label}</p>
                      <p className="text-cyan-400">Call OI: {ce} L</p>
                      <p className="text-amber-400">Put OI: {pe} L</p>
                      <div className="mt-1 pt-1 border-t border-slate-800 text-slate-300">
                        PCR: <span className="font-bold text-white">{strikePcr}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="callOI" fill="#06b6d4" radius={[3, 3, 0, 0]} name="Call OI" />
            <Bar dataKey="putOI" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Put OI" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
