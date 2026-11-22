import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FacilityStateSnapshot } from '../engine/types';
import { formatPower } from './ChannelCard';

interface BaselinePageProps {
  snapshot: FacilityStateSnapshot;
}

export function BaselinePage({ snapshot }: BaselinePageProps) {
  const b = snapshot.baselineComparison;
  const unit = snapshot.settings.displayUnit;

  const chartData = b.channels.map((ch) => ({
    name: ch.channelId.toUpperCase(),
    Expected: ch.expectedW,
    Actual: ch.actualW ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">State-Conditioned Baseline Analysis</h2>
        <p className="text-xs sm:text-sm text-slate-400">
          Compares current measured wattage against normal consumption patterns learned from historical non-disturbed samples conditioned on observed ON/OFF load states.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <p className="text-xs text-slate-400">Observed Load Signature</p>
          <p className="mt-2 font-mono text-sm font-semibold text-slate-100">
            {b.stateSignature}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Learning mode: {b.confidenceLabel} ({b.sampleCount} samples)
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <p className="text-xs text-slate-400">Expected Baseline Power</p>
          <p className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {formatPower(b.expectedTotalW, unit)}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            σ = ±{b.expectedStdDevW.toFixed(2)} W
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <p className="text-xs text-slate-400">Current Measured Power</p>
          <p className="mt-2 font-mono text-2xl font-bold text-sky-300 tabular-nums">
            {formatPower(b.actualTotalW, unit)}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            Delta: {b.deltaW >= 0 ? '+' : ''}
            {b.deltaW.toFixed(2)} W ({b.percentDiff >= 0 ? '+' : ''}
            {b.percentDiff.toFixed(1)}%)
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <p className="text-xs text-slate-400">Behavior Assessment</p>
          <p
            className={`mt-2 text-2xl font-bold ${
              b.withinExpected ? 'text-emerald-400' : 'text-amber-300'
            }`}
          >
            {b.withinExpected ? 'Normal' : 'Outside Baseline'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            3σ dynamic state tolerance
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <h3 className="text-base font-semibold text-white">
          Expected Baseline vs. Actual Channel Power
        </h3>
        <div className="h-64 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" W" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Expected" name="Learned Baseline (W)" fill="#64748b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Actual" name="Actual Observed (W)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">
            Per-Channel Learned Baseline Breakdown
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B1120] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Observed State</th>
                <th className="px-4 py-3 font-medium text-right">Expected (W)</th>
                <th className="px-4 py-3 font-medium text-right">Actual (W)</th>
                <th className="px-4 py-3 font-medium text-right">Delta (W / %)</th>
                <th className="px-4 py-3 font-medium text-right">Learned σ (W)</th>
                <th className="px-4 py-3 font-medium text-right">Samples</th>
                <th className="px-4 py-3 font-medium">Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {b.channels.map((ch) => (
                <tr key={ch.channelId} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-medium text-slate-100">{ch.channelName}</td>
                  <td className="px-4 py-3 font-mono text-slate-300">{ch.loadState}</td>
                  <td className="px-4 py-3 font-mono text-right text-slate-200 tabular-nums">
                    {formatPower(ch.expectedW, unit)}
                  </td>
                  <td className="px-4 py-3 font-mono text-right text-white font-semibold tabular-nums">
                    {formatPower(ch.actualW, unit)}
                  </td>
                  <td className="px-4 py-3 font-mono text-right text-slate-300 tabular-nums">
                    {ch.deltaW !== null
                      ? `${ch.deltaW >= 0 ? '+' : ''}${ch.deltaW.toFixed(2)} W (${ch.percentDiff?.toFixed(1)}%)`
                      : 'Missing'}
                  </td>
                  <td className="px-4 py-3 font-mono text-right text-slate-400 tabular-nums">
                    ±{ch.stdDevW.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono text-right text-slate-300 tabular-nums">
                    {ch.sampleCount}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        ch.withinExpected ? 'text-emerald-400' : 'text-amber-300'
                      }
                    >
                      {ch.withinExpected ? 'Within Baseline' : 'Deviation'}
                    </span>
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
