import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TickSnapshot } from '../engine/types';
import { formatShortTime } from './ChannelCard';

interface PowerChartProps {
  history: TickSnapshot[];
  defaultWindow?: number;
  title?: string;
}

export function PowerChart({
  history,
  defaultWindow = 40,
  title = 'Live Multi-Channel Power Consumption',
}: PowerChartProps) {
  const [windowSize, setWindowSize] = useState<number>(defaultWindow);
  const [visibleSeries, setVisibleSeries] = useState({
    total: true,
    ch1: true,
    ch2: true,
    ch3: true,
  });

  const chartData = useMemo(() => {
    const sliced = windowSize === 0 ? history : history.slice(-windowSize);
    return sliced.map((tick) => ({
      time: formatShortTime(tick.timestamp),
      fullTime: tick.timestamp,
      source: tick.sourceType,
      disturbance: tick.isSimulatedGridDisturbance,
      total: tick.totalPowerW,
      ch1: tick.channels.ch1.power,
      ch2: tick.channels.ch2.power,
      ch3: tick.channels.ch3.power,
    }));
  }, [history, windowSize]);

  const toggleSeries = (key: keyof typeof visibleSeries) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Real-time power (W) across LED &amp; Fan loads · Dashed indicators mark simulated event intervals
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Channel Filter Buttons */}
          <div className="flex items-center gap-1 rounded-lg bg-[#0B1120] p-1 border border-slate-800">
            {(
              [
                { key: 'total', label: 'Total', color: 'text-white' },
                { key: 'ch1', label: 'CH1 LED', color: 'text-sky-400' },
                { key: 'ch2', label: 'CH2 Fan 1', color: 'text-emerald-400' },
                { key: 'ch3', label: 'CH3 Fan 2', color: 'text-amber-400' },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleSeries(item.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  visibleSeries[item.key]
                    ? `bg-slate-800 ${item.color}`
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Time-Range Filter */}
          <div className="flex items-center gap-1 rounded-lg bg-[#0B1120] p-1 border border-slate-800">
            {[
              { label: '15 pts', value: 15 },
              { label: '30 pts', value: 30 },
              { label: '60 pts', value: 60 },
              { label: 'All', value: 0 },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setWindowSize(opt.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  windowSize === opt.value
                    ? 'bg-sky-600/25 text-sky-300 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 h-72 w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            No historical readings available yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                minTickGap={24}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                unit=" W"
                width={52}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                  color: '#f1f5f9',
                }}
                formatter={(value: unknown, name: unknown) => [
                  value === null || value === undefined
                    ? 'Missing'
                    : `${Number(value).toFixed(2)} W`,
                  String(name ?? ''),
                ]}
                labelFormatter={(label, payload) => {
                  const first = payload?.[0]?.payload;
                  const src = first?.source === 'measured' ? 'MEASURED BLE' : 'SIMULATED';
                  const dist = first?.disturbance ? ' · Event Active' : '';
                  return `${label} (${src}${dist})`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              {visibleSeries.total && (
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total Measured Power"
                  stroke="#f8fafc"
                  strokeWidth={2.25}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {visibleSeries.ch1 && (
                <Line
                  type="monotone"
                  dataKey="ch1"
                  name="CH1 LED Load"
                  stroke="#38bdf8"
                  strokeWidth={1.75}
                  strokeDasharray="4 2"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              {visibleSeries.ch2 && (
                <Line
                  type="monotone"
                  dataKey="ch2"
                  name="CH2 Fan Load 1"
                  stroke="#34d399"
                  strokeWidth={1.75}
                  strokeDasharray="4 2"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              {visibleSeries.ch3 && (
                <Line
                  type="monotone"
                  dataKey="ch3"
                  name="CH3 Fan Load 2"
                  stroke="#fbbf24"
                  strokeWidth={1.75}
                  strokeDasharray="4 2"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
