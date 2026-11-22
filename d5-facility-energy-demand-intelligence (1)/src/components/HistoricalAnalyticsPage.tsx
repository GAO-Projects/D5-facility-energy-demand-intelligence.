import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import { getCsvExportUrl } from '../api/client';
import { computeHistoricalSummary } from '../engine/analytics';
import { CHANNEL_DEFINITIONS } from '../engine/simulation';
import type { ChannelId, FacilityStateSnapshot } from '../engine/types';
import { formatPower, formatShortTime } from './ChannelCard';

interface HistoricalAnalyticsPageProps {
  snapshot: FacilityStateSnapshot;
}

export function HistoricalAnalyticsPage({ snapshot }: HistoricalAnalyticsPageProps) {
  const [periodPoints, setPeriodPoints] = useState<number>(0); // 0 = all
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelId>('all');
  const unit = snapshot.settings.displayUnit;

  const filteredHistory = useMemo(() => {
    return periodPoints === 0 ? snapshot.history : snapshot.history.slice(-periodPoints);
  }, [snapshot.history, periodPoints]);

  const summary = useMemo(
    () => computeHistoricalSummary(filteredHistory, snapshot.anomalyHistory),
    [filteredHistory, snapshot.anomalyHistory]
  );

  const channelComparisonData = useMemo(
    () =>
      (['ch1', 'ch2', 'ch3'] as ChannelId[]).map((chId) => ({
        name: CHANNEL_DEFINITIONS[chId].shortName,
        Average: summary.channelAverages[chId],
        Peak: summary.channelPeaks[chId],
      })),
    [summary]
  );

  const trendChartData = useMemo(() => {
    return filteredHistory.map((tick) => ({
      time: formatShortTime(tick.timestamp),
      source: tick.sourceType,
      power:
        channelFilter === 'all'
          ? tick.totalPowerW
          : tick.channels[channelFilter].power,
    }));
  }, [filteredHistory, channelFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Historical Energy Analytics</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Inspect retained power history, channel-wise averages and peaks, and export CSV telemetry datasets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={getCsvExportUrl('readings', channelFilter)}
            data-testid="export-readings-csv"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export Readings CSV
          </a>
          <a
            href={getCsvExportUrl('events', channelFilter)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export Events CSV
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-[#111827] p-1 border border-slate-800">
          {[
            { label: 'Last 15', value: 15 },
            { label: 'Last 30', value: 30 },
            { label: 'Last 60', value: 60 },
            { label: 'All Retained', value: 0 },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setPeriodPoints(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                periodPoints === opt.value
                  ? 'bg-sky-600/25 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Filter historical analytics by channel"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as 'all' | ChannelId)}
          className="rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-xs text-slate-200"
        >
          <option value="all">All Channels (Total Power)</option>
          <option value="ch1">Channel 1: LED Demonstration Load</option>
          <option value="ch2">Channel 2: Fan Demonstration Load 1</option>
          <option value="ch3">Channel 3: Fan Demonstration Load 2</option>
        </select>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
          <p className="text-xs text-slate-400">Average Power</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-white tabular-nums">
            {formatPower(summary.averagePowerW, unit)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
          <p className="text-xs text-slate-400">Peak Measured Power</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-amber-300 tabular-nums">
            {formatPower(summary.peakPowerW, unit)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
          <p className="text-xs text-slate-400">Minimum Power</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-sky-300 tabular-nums">
            {formatPower(summary.minPowerW, unit)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
          <p className="text-xs text-slate-400">Retained Readings</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-white tabular-nums">
            {summary.totalReadings}
          </p>
          <p className="text-[11px] text-slate-400 font-mono">
            {summary.measuredReadings} BLE · {summary.simulatedReadings} Sim
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
          <p className="text-xs text-slate-400">Anomaly Events</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-rose-300 tabular-nums">
            {summary.anomalyCount}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#111827] p-5">
          <h3 className="text-sm font-semibold text-white">
            Consumption Trend ({channelFilter === 'all' ? 'Total Facility' : CHANNEL_DEFINITIONS[channelFilter].name})
          </h3>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} minTickGap={20} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" W" width={48} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="power"
                  name="Power (W)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#111827] p-5">
          <h3 className="text-sm font-semibold text-white">
            Channel-Wise Average vs. Peak (W)
          </h3>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" W" width={44} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Average" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Peak" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Recent Historical Readings Table */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Retained Telemetry Log (Latest 25 Intervals)
          </h3>
          <span className="text-xs text-slate-400">
            Showing {Math.min(25, filteredHistory.length)} of {filteredHistory.length} ticks
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B1120] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium text-right">CH1 LED (W)</th>
                <th className="px-4 py-3 font-medium text-right">CH2 Fan 1 (W)</th>
                <th className="px-4 py-3 font-medium text-right">CH3 Fan 2 (W)</th>
                <th className="px-4 py-3 font-medium text-right">Total (W)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {filteredHistory
                .slice(-25)
                .reverse()
                .map((tick) => (
                  <tr key={tick.tickId} className="hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 text-slate-300">
                      {formatShortTime(tick.timestamp)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          tick.sourceType === 'measured' ? 'text-emerald-400' : 'text-sky-400'
                        }
                      >
                        {tick.sourceType.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-200">
                      {tick.channels.ch1.power !== null ? tick.channels.ch1.power.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-200">
                      {tick.channels.ch2.power !== null ? tick.channels.ch2.power.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-200">
                      {tick.channels.ch3.power !== null ? tick.channels.ch3.power.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-white">
                      {tick.totalPowerW.toFixed(2)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
