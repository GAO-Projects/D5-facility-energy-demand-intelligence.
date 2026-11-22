import type { ChannelId, FacilityStateSnapshot, LoadState } from '../engine/types';
import { CHANNEL_DEFINITIONS } from '../engine/simulation';
import { ChannelCard, formatPower, formatShortTime } from './ChannelCard';
import { PowerChart } from './PowerChart';

interface LiveMonitoringPageProps {
  snapshot: FacilityStateSnapshot;
  busy: boolean;
  onToggleLoadState: (channelId: ChannelId, nextState: LoadState) => void;
  onTickOnce: () => void;
}

export function LiveMonitoringPage({
  snapshot,
  busy,
  onToggleLoadState,
  onTickOnce,
}: LiveMonitoringPageProps) {
  const unit = snapshot.settings.displayUnit;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Live Channel Monitoring</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Continuous voltage, current, and computed wattage (P = V × I) with explicit telemetry source tracking.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || snapshot.simulationState.mode !== 'simulation'}
          onClick={onTickOnce}
          className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-medium text-slate-100 transition-colors whitespace-nowrap"
        >
          Sample Single Tick Now
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {(['ch1', 'ch2', 'ch3'] as ChannelId[]).map((chId) => (
          <ChannelCard
            key={chId}
            channelId={chId}
            reading={snapshot.latestTick.channels[chId]}
            history={snapshot.history}
            displayUnit={unit}
            onToggleLoadState={onToggleLoadState}
            disabled={busy}
          />
        ))}
      </div>

      <PowerChart
        history={snapshot.history}
        defaultWindow={snapshot.settings.chartWindowPoints}
        title="High-Resolution Multi-Channel Power Stream"
      />

      {/* Detailed Channel Telemetry Diagnostics Table */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Channel Validation &amp; Freshness Diagnostics
          </h3>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            Freshness Limit: {snapshot.settings.dataFreshnessThresholdSec}s
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B1120] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Load Input</th>
                <th className="px-4 py-3 font-medium text-right">Voltage</th>
                <th className="px-4 py-3 font-medium text-right">Current</th>
                <th className="px-4 py-3 font-medium text-right">Power</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Validation Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {(['ch1', 'ch2', 'ch3'] as ChannelId[]).map((chId) => {
                const r = snapshot.latestTick.channels[chId];
                return (
                  <tr key={chId} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium text-slate-100">
                      {CHANNEL_DEFINITIONS[chId].name}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <span
                        className={
                          r.sourceType === 'measured' ? 'text-emerald-400' : 'text-sky-400'
                        }
                      >
                        {r.sourceType.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">{r.loadState}</td>
                    <td className="px-4 py-3 font-mono text-right text-slate-200 tabular-nums">
                      {r.voltage !== null ? `${r.voltage.toFixed(3)} V` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-slate-200 tabular-nums">
                      {r.current !== null ? `${r.current.toFixed(3)} A` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-right font-semibold text-white tabular-nums">
                      {formatPower(r.power, unit)}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{r.status}</td>
                    <td className="px-4 py-3 font-mono text-slate-400 tabular-nums">
                      {formatShortTime(r.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                      {r.validationNote ?? 'OK'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
