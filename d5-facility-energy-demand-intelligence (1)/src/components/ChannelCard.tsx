import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import type { ChannelId, LoadState, SensorReading, TickSnapshot } from '../engine/types';
import { CHANNEL_DEFINITIONS } from '../engine/simulation';

interface ChannelCardProps {
  channelId: ChannelId;
  reading: SensorReading;
  history: TickSnapshot[];
  displayUnit: 'W' | 'kW';
  onToggleLoadState: (channelId: ChannelId, nextState: LoadState) => void;
  disabled?: boolean;
}

export function formatPower(watts: number | null, unit: 'W' | 'kW'): string {
  if (watts === null) return '—';
  if (unit === 'kW') return `${(watts / 1000).toFixed(4)} kW`;
  return `${watts.toFixed(2)} W`;
}

export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid time';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ChannelCard({
  channelId,
  reading,
  history,
  displayUnit,
  onToggleLoadState,
  disabled = false,
}: ChannelCardProps) {
  const def = CHANNEL_DEFINITIONS[channelId];
  const isOn = reading.loadState === 'ON';

  const sparkData = history.slice(-20).map((t, idx) => ({
    idx,
    power: t.channels[channelId]?.power ?? 0,
  }));

  const statusTone =
    reading.status === 'Anomaly'
      ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
      : reading.status === 'Missing' || reading.status === 'Stale'
        ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
        : reading.status === 'Elevated'
          ? 'text-sky-300 border-sky-500/30 bg-sky-500/10'
          : reading.status === 'Standby'
            ? 'text-slate-400 border-slate-700 bg-slate-800/50'
            : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';

  const strokeColor =
    channelId === 'ch1' ? '#38bdf8' : channelId === 'ch2' ? '#34d399' : '#fbbf24';

  return (
    <section
      aria-label={def.name}
      data-testid={`channel-card-${channelId}`}
      className="rounded-xl border border-slate-800 bg-[#111827] p-5 flex flex-col justify-between gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-mono uppercase tracking-wider text-slate-300">
              {channelId.toUpperCase()}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={
                reading.sourceType === 'measured'
                  ? 'text-emerald-400 font-medium'
                  : 'text-sky-400 font-medium'
              }
            >
              {reading.sourceType === 'measured' ? 'Measured BLE' : 'Simulated'}
            </span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-slate-100 truncate">
            {def.name}
          </h3>
        </div>

        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusTone}`}
        >
          {reading.status}
        </span>
      </div>

      {/* Primary Electrical Metrics: V, A, W */}
      <div className="grid grid-cols-3 gap-3 border-y border-slate-800/80 py-3.5">
        <div>
          <p className="text-xs text-slate-400">Voltage</p>
          <p className="mt-0.5 font-mono text-base font-semibold text-slate-100 tabular-nums">
            {reading.voltage !== null ? `${reading.voltage.toFixed(2)} V` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Current</p>
          <p className="mt-0.5 font-mono text-base font-semibold text-slate-100 tabular-nums">
            {reading.current !== null ? `${reading.current.toFixed(3)} A` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Power (V×A)</p>
          <p
            data-testid={`channel-power-${channelId}`}
            className="mt-0.5 font-mono text-base font-semibold text-white tabular-nums"
          >
            {formatPower(reading.power, displayUnit)}
          </p>
        </div>
      </div>

      {/* Mini Historical Trend Sparkline */}
      <div className="h-14 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData}>
            <YAxis hide domain={['dataMin - 0.5', 'dataMax + 0.5']} />
            <Line
              type="monotone"
              dataKey="power"
              stroke={strokeColor}
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer: Timestamp + Simulated Manual Load Input */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="text-xs text-slate-400 font-mono tabular-nums truncate">
          Updated {formatShortTime(reading.timestamp)}
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-[#0B1120] p-0.5 border border-slate-800 shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggleLoadState(channelId, 'ON')}
            aria-label={`Set ${def.name} simulated state ON`}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              isOn
                ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sim ON
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggleLoadState(channelId, 'OFF')}
            aria-label={`Set ${def.name} simulated state OFF`}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              !isOn
                ? 'bg-slate-700 text-slate-100 border border-slate-600'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sim OFF
          </button>
        </div>
      </div>

      {reading.validationNote && (reading.status === 'Missing' || reading.status === 'Stale') && (
        <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5">
          {reading.validationNote}
        </p>
      )}
    </section>
  );
}
