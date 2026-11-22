import { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  TrendingDown,
  TrendingUp,
  ZapOff,
} from 'lucide-react';
import { CHANNEL_DEFINITIONS } from '../engine/simulation';
import type {
  ChannelId,
  DisturbanceType,
  FacilityStateSnapshot,
  LoadState,
} from '../engine/types';
import { formatPower } from './ChannelCard';

interface SimulationControlPageProps {
  snapshot: FacilityStateSnapshot;
  busy: boolean;
  onControlSimulation: (action: 'start' | 'pause' | 'reset' | 'tick') => void;
  onTriggerEvent: (
    type: DisturbanceType,
    targetChannel: ChannelId | 'all',
    magnitudeFactor: number
  ) => void;
  onToggleLoadState: (channelId: ChannelId, nextState: LoadState) => void;
}

export function SimulationControlPage({
  snapshot,
  busy,
  onControlSimulation,
  onTriggerEvent,
  onToggleLoadState,
}: SimulationControlPageProps) {
  const [targetChannel, setTargetChannel] = useState<ChannelId | 'all'>('all');
  const [magnitudeFactor, setMagnitudeFactor] = useState<number>(1.45);
  const { simulationState, latestTick } = snapshot;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Simulation Control Workbench</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Software-only telemetry simulator for testing demand spikes, drops, electrical anomalies, missing readings, and stale BLE states.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {simulationState.isRunning ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onControlSimulation('pause')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-200 text-xs font-medium hover:bg-amber-500/25 transition-colors"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause Simulation
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onControlSimulation('start')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 text-xs font-medium hover:bg-emerald-500/25 transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              Start Simulation
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onControlSimulation('tick')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-slate-200"
          >
            <StepForward className="h-3.5 w-3.5" />
            Step Tick
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onControlSimulation('reset')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-slate-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Simulation
          </button>
        </div>
      </div>

      {/* Strict Scope Boundary Notice */}
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-sky-200">
        <strong>Software Simulation Boundary:</strong> All switches and demand triggers below operate strictly inside the local telemetry simulator. No physical relay, PWM dimmer, fan controller, or hardware actuator is connected or commanded.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual Simulated Load State Controls */}
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-white">
              Simulated Manual Load-State Inputs
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Toggle demonstration load states to verify baseline adaptation, total wattage sums, and forecast updates.
            </p>
          </div>

          <div className="space-y-3">
            {(['ch1', 'ch2', 'ch3'] as ChannelId[]).map((chId) => {
              const def = CHANNEL_DEFINITIONS[chId];
              const state = simulationState.loadStates[chId];
              const reading = latestTick.channels[chId];
              const isOn = state === 'ON';

              return (
                <div
                  key={chId}
                  className="rounded-lg border border-slate-800 bg-[#0B1120] p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{def.name}</p>
                    <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                      Observed: {formatPower(reading.power, snapshot.settings.displayUnit)} ·{' '}
                      {reading.voltage !== null ? `${reading.voltage.toFixed(2)}V` : '—'} ·{' '}
                      {reading.current !== null ? `${reading.current.toFixed(2)}A` : '—'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 rounded-lg bg-[#111827] p-1 border border-slate-800">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onToggleLoadState(chId, 'ON')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        isOn
                          ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Simulated ON
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onToggleLoadState(chId, 'OFF')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        !isOn
                          ? 'bg-slate-700 text-slate-100 border border-slate-600'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Simulated OFF
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Disturbance & Fault Injection Controls */}
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-white">
              Simulated Event &amp; Fault Injection
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Inject labeled simulation disturbances to test anomaly scoring, stale telemetry alerts, and forecasting resilience.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sim-target-channel"
                className="block text-xs text-slate-400 mb-1.5"
              >
                Target Channel
              </label>
              <select
                id="sim-target-channel"
                value={targetChannel}
                onChange={(e) => setTargetChannel(e.target.value as ChannelId | 'all')}
                className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-xs text-slate-100"
              >
                <option value="all">All Channels (Facility-Wide)</option>
                <option value="ch1">Channel 1 (LED Load)</option>
                <option value="ch2">Channel 2 (Fan Load 1)</option>
                <option value="ch3">Channel 3 (Fan Load 2)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="sim-magnitude"
                className="block text-xs text-slate-400 mb-1.5"
              >
                Demand Increase Factor ({magnitudeFactor.toFixed(2)}×)
              </label>
              <input
                id="sim-magnitude"
                type="range"
                min={1.15}
                max={2.2}
                step={0.05}
                value={magnitudeFactor}
                onChange={(e) => setMagnitudeFactor(Number(e.target.value))}
                className="w-full accent-sky-400 mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('demand_increase', targetChannel, magnitudeFactor)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-[#0B1120] hover:border-sky-500/50 text-xs font-medium text-slate-100"
            >
              <TrendingUp className="h-4 w-4 text-sky-400" />
              Simulate Demand Increase
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('demand_decrease', targetChannel, 0.55)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-[#0B1120] hover:border-sky-500/50 text-xs font-medium text-slate-100"
            >
              <TrendingDown className="h-4 w-4 text-sky-400" />
              Simulate Demand Decrease
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('anomaly', targetChannel === 'all' ? 'ch2' : targetChannel, 1.9)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-[#0B1120] hover:border-rose-500/50 text-xs font-medium text-slate-100"
            >
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              Simulate Anomaly
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('missing_data', targetChannel === 'all' ? 'ch2' : targetChannel, 1)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-[#0B1120] hover:border-amber-500/50 text-xs font-medium text-slate-100"
            >
              <ZapOff className="h-4 w-4 text-amber-400" />
              Simulate Missing Data
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('stale_ble', targetChannel === 'all' ? 'ch1' : targetChannel, 1)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-[#0B1120] hover:border-amber-500/50 text-xs font-medium text-slate-100"
            >
              <Clock className="h-4 w-4 text-amber-400" />
              Simulate Stale BLE Data
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('none', 'all', 1)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-medium text-emerald-200"
            >
              Restore Normal Baseline
            </button>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0B1120] p-3 text-xs text-slate-300 flex items-center justify-between">
            <span>Active Disturbance State:</span>
            <span className="font-mono text-sky-300">
              {simulationState.activeDisturbance.type} ({simulationState.activeDisturbance.targetChannel})
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
