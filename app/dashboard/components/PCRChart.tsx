'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface HistoryPoint {
  id: number;
  ts: string | Date;
  spot: number;
  pcr: number;
  totalCeOI: number;
  totalPeOI: number;
}

interface PCRChartProps {
  history: HistoryPoint[];
}

export default function PCRChart({ history }: PCRChartProps) {
  const chartData = useMemo(() => {
    return history.map((item) => {
      const date = new Date(item.ts);
      const timeStr = date.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      return {
        time: timeStr,
        spot: item.spot,
        pcr: item.pcr,
      };
    });
  }, [history]);

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        Collecting snapshot history...
      </div>
    );
  }

  const latestPCR = chartData[chartData.length - 1]?.pcr ?? 0;
  const pcrStatus =
    latestPCR >= 1.2
      ? { label: 'Bullish (>1.2)', color: 'text-emerald-400' }
      : latestPCR <= 0.8
      ? { label: 'Bearish (<0.8)', color: 'text-rose-400' }
      : { label: 'Neutral (0.8 - 1.2)', color: 'text-amber-400' };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>PCR (Put-Call Ratio) Trend</span>
            <span className={`text-xs font-mono font-bold ${pcrStatus.color}`}>
              {latestPCR.toFixed(2)} • {pcrStatus.label}
            </span>
          </h2>
          <p className="text-xs text-slate-400">Intraday PCR evolution across snapshots</p>
        </div>
      </div>

      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={10}
              fontFamily="monospace"
              tickLine={false}
            />
            <YAxis
              yAxisId="pcr"
              stroke="#06b6d4"
              fontSize={10}
              fontFamily="monospace"
              tickLine={false}
              domain={[0.4, 2.0]}
              ticks={[0.6, 0.8, 1.0, 1.2, 1.4, 1.6]}
            />
            <ReferenceLine yAxisId="pcr" y={1.0} stroke="#475569" strokeDasharray="3 3" />
            <ReferenceLine yAxisId="pcr" y={1.2} stroke="#10b981" strokeDasharray="3 3" label={{ value: '1.2 Bullish', fill: '#10b981', fontSize: 9, position: 'insideRight' }} />
            <ReferenceLine yAxisId="pcr" y={0.8} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: '0.8 Bearish', fill: '#f43f5e', fontSize: 9, position: 'insideRight' }} />

            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const pcr = payload.find((p) => p.dataKey === 'pcr')?.value as number;
                  const spot = payload.find((p) => p.dataKey === 'spot')?.value as number;
                  return (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg shadow-xl text-xs font-mono">
                      <p className="text-slate-400 mb-1">Time (IST): {label}</p>
                      <p className="text-cyan-400 font-bold">PCR: {pcr?.toFixed(3)}</p>
                      {spot && <p className="text-slate-200">Spot: {spot?.toFixed(2)}</p>}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              yAxisId="pcr"
              type="monotone"
              dataKey="pcr"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ r: 2, fill: '#06b6d4' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
