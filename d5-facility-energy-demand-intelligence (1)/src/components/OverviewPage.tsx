import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Cpu,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  ZapOff,
} from 'lucide-react';
import { requestAiExplanation } from '../api/client';
import type {
  ChannelId,
  DisturbanceType,
  FacilityStateSnapshot,
  LoadState,
} from '../engine/types';
import { ChannelCard, formatPower, formatShortTime } from './ChannelCard';
import type { NavPageId } from './Layout';
import { PowerChart } from './PowerChart';

interface OverviewPageProps {
  snapshot: FacilityStateSnapshot;
  busy: boolean;
  onControlSimulation: (action: 'start' | 'pause' | 'reset' | 'tick') => void;
  onTriggerEvent: (type: DisturbanceType, target?: ChannelId | 'all') => void;
  onToggleLoadState: (channelId: ChannelId, nextState: LoadState) => void;
  onNavigate: (page: NavPageId) => void;
}

export function OverviewPage({
  snapshot,
  busy,
  onControlSimulation,
  onTriggerEvent,
  onToggleLoadState,
  onNavigate,
}: OverviewPageProps) {
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const { totalPower, latestForecast, baselineComparison, activeAnomalies, simulationState } =
    snapshot;
  const unit = snapshot.settings.displayUnit;
  const hasDisturbance = simulationState.activeDisturbance.type !== 'none';

  const handleGenerateBriefing = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await requestAiExplanation('overview');
      setAiBriefing(res.explanation);
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Total Measured Power + Quick Simulation Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <section
          aria-label="Total Measured Power"
          className="xl:col-span-7 rounded-xl border border-slate-800 bg-[#111827] p-5 flex flex-col justify-between gap-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Aggregate Facility Load (CH1 + CH2 + CH3)</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    totalPower.sourceType === 'measured'
                      ? 'text-emerald-400 font-medium'
                      : 'text-sky-400 font-medium'
                  }
                >
                  {totalPower.sourceType === 'measured'
                    ? 'Measured BLE'
                    : totalPower.sourceType === 'mixed'
                      ? 'Mixed (Measured + Simulated)'
                      : 'Simulated Readings'}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span
                  data-testid="total-measured-power"
                  className="font-mono text-3xl sm:text-4xl font-bold text-white tabular-nums tracking-tight"
                >
                  {formatPower(totalPower.currentTotalW, unit)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-sm font-mono font-medium tabular-nums ${
                    totalPower.deltaW > 0.2
                      ? 'text-amber-300'
                      : totalPower.deltaW < -0.2
                        ? 'text-sky-300'
                        : 'text-slate-400'
                  }`}
                >
                  {totalPower.deltaW >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {totalPower.deltaW >= 0 ? '+' : ''}
                  {totalPower.deltaW.toFixed(2)} W ({totalPower.percentChange >= 0 ? '+' : ''}
                  {totalPower.percentChange.toFixed(1)}%)
                </span>
              </div>
            </div>

            <span
              className={`rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                totalPower.status === 'Nominal'
                  ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                  : totalPower.status === 'Degraded Telemetry' ||
                      totalPower.status === 'No Valid Readings'
                    ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                    : 'text-sky-300 border-sky-500/30 bg-sky-500/10'
              }`}
            >
              {totalPower.status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-800/80 text-xs">
            <div>
              <p className="text-slate-400">Previous Reading</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-200 tabular-nums">
                {formatPower(totalPower.previousTotalW, unit)}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Measured BLE Portion</p>
              <p className="mt-1 font-mono text-sm font-semibold text-emerald-300 tabular-nums">
                {formatPower(totalPower.measuredTotalW, unit)}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Simulated Portion</p>
              <p className="mt-1 font-mono text-sm font-semibold text-sky-300 tabular-nums">
                {formatPower(totalPower.simulatedTotalW, unit)}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Valid Channels</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-200 tabular-nums">
                {snapshot.latestTick.validChannelCount} / 3
              </p>
            </div>
          </div>
        </section>

        {/* Simulation Quick Toolbar */}
        <section
          aria-label="Simulation Controls"
          className="xl:col-span-5 rounded-xl border border-slate-800 bg-[#111827] p-5 flex flex-col justify-between gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Simulation &amp; Event Workbench
              </h2>
              <p className="text-xs text-slate-400">
                All triggers below are tagged as SIMULATED events
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {simulationState.isRunning ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onControlSimulation('pause')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-200 text-xs font-medium hover:bg-amber-500/25 transition-colors whitespace-nowrap"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause Simulation
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onControlSimulation('start')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 text-xs font-medium hover:bg-emerald-500/25 transition-colors whitespace-nowrap"
                >
                  <Play className="h-3.5 w-3.5" />
                  Start Simulation
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onControlSimulation('reset')}
                aria-label="Reset Simulation"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 text-xs font-medium hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('demand_increase', 'all')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-[#0B1120] hover:border-sky-500/50 hover:text-sky-200 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <TrendingUp className="h-3.5 w-3.5 text-sky-400" />
              Simulate Demand Increase
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('demand_decrease', 'all')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-[#0B1120] hover:border-sky-500/50 hover:text-sky-200 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <TrendingDown className="h-3.5 w-3.5 text-sky-400" />
              Simulate Demand Decrease
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('anomaly', 'ch2')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-[#0B1120] hover:border-rose-500/50 hover:text-rose-200 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              Simulate Anomaly
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTriggerEvent('missing_data', 'ch2')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-[#0B1120] hover:border-amber-500/50 hover:text-amber-200 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <ZapOff className="h-3.5 w-3.5 text-amber-400" />
              Simulate Missing Data
            </button>
          </div>

          {hasDisturbance && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              <span className="text-amber-200 truncate">
                Active simulated event:{' '}
                <strong className="font-mono">{simulationState.activeDisturbance.type}</strong>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onTriggerEvent('none', 'all')}
                className="shrink-0 text-amber-100 underline hover:text-white font-medium"
              >
                Restore Baseline
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Row 2: Three Individual Channel Cards */}
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

      {/* Row 3: Live Power Chart */}
      <PowerChart
        history={snapshot.history}
        defaultWindow={snapshot.settings.chartWindowPoints}
      />

      {/* Row 4: AI Demand Forecast + Baseline Comparison + Active Anomaly Detection */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* AI Demand Forecast Summary */}
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Cpu className="h-3.5 w-3.5 text-sky-400" />
                <span>Ridge Regression ({latestForecast.horizonMinutes}m horizon)</span>
              </div>
              <h3 className="mt-1 text-base font-semibold text-white">AI Demand Forecast</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('forecast')}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap"
            >
              Full Forecast →
            </button>
          </div>

          {latestForecast.predictedDemandW !== null ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-2xl font-bold text-white tabular-nums">
                  {formatPower(latestForecast.predictedDemandW, unit)}
                </span>
                <span className="text-xs font-medium text-sky-300">
                  {latestForecast.trend} · {latestForecast.confidencePercent}% conf.
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs border-t border-slate-800/80 pt-3">
                <div>
                  <p className="text-slate-400">Ridge MAE</p>
                  <p className="font-mono text-slate-100 tabular-nums">
                    {latestForecast.ridgeMetrics?.mae.toFixed(2)} W
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Persist MAE</p>
                  <p className="font-mono text-slate-300 tabular-nums">
                    {latestForecast.persistenceMetrics?.mae.toFixed(2)} W
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">MA MAE</p>
                  <p className="font-mono text-slate-300 tabular-nums">
                    {latestForecast.movingAverageMetrics?.mae.toFixed(2)} W
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              {latestForecast.statusMessage}
            </p>
          )}

          <p className="text-[11px] text-slate-500 font-mono">
            Generated {formatShortTime(latestForecast.timestamp)} · {latestForecast.trainingSamples} train /{' '}
            {latestForecast.testSamples} test
          </p>
        </section>

        {/* Baseline Consumption Comparison */}
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                <span>State-Conditioned Baseline</span>
              </div>
              <h3 className="mt-1 text-base font-semibold text-white">Baseline Comparison</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('baseline')}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap"
            >
              Details →
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-2xl font-bold text-white tabular-nums">
                {formatPower(baselineComparison.expectedTotalW, unit)}
              </span>
              <span
                className={`text-xs font-medium ${
                  baselineComparison.withinExpected ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {baselineComparison.withinExpected ? 'Within Expected' : 'Deviation Detected'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs border-t border-slate-800/80 pt-3">
              <div>
                <p className="text-slate-400">Actual vs Expected</p>
                <p className="font-mono text-slate-100 tabular-nums">
                  {baselineComparison.deltaW >= 0 ? '+' : ''}
                  {baselineComparison.deltaW.toFixed(2)} W ({baselineComparison.percentDiff >= 0 ? '+' : ''}
                  {baselineComparison.percentDiff.toFixed(1)}%)
                </p>
              </div>
              <div>
                <p className="text-slate-400">Learned Samples</p>
                <p className="font-mono text-slate-200 tabular-nums">
                  {baselineComparison.sampleCount} ({baselineComparison.confidenceLabel})
                </p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 font-mono truncate">
            State: {baselineComparison.stateSignature}
          </p>
        </section>

        {/* Active Anomaly Detection */}
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                <span>Reproducible Z-Score Engine</span>
              </div>
              <h3 className="mt-1 text-base font-semibold text-white">Anomaly Detection</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('anomalies')}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap"
            >
              View All →
            </button>
          </div>

          {activeAnomalies.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">
              No active anomalies. All reported channels conform to learned load-state baselines.
            </div>
          ) : (
            <div className="space-y-2 max-h-36 overflow-y-auto">
              {activeAnomalies.slice(0, 3).map((anom) => (
                <div
                  key={anom.anomalyId}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 font-medium text-rose-200">
                    <span>
                      {anom.channelName} · {anom.type}
                    </span>
                    <span className="font-mono tabular-nums">Score {anom.anomalyScore}</span>
                  </div>
                  <p className="mt-1 text-slate-300 line-clamp-2">{anom.explanation}</p>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-500 font-mono">
            Historical alerts logged: {snapshot.anomalyHistory.length}
          </p>
        </section>
      </div>

      {/* Row 5: Gemini Grounded Operational Briefing */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-400" />
              Gemini Analytical Operational Briefing
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Synthesizes natural-language commentary strictly from the real Ridge Regression, Baseline, and Anomaly outputs above.
            </p>
          </div>
          <button
            type="button"
            disabled={aiLoading}
            onClick={handleGenerateBriefing}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-medium transition-colors whitespace-nowrap"
          >
            {aiLoading ? 'Generating Briefing...' : 'Generate AI Briefing'}
          </button>
        </div>

        {aiError && (
          <p className="mt-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3">
            {aiError}
          </p>
        )}

        {aiBriefing && (
          <div className="mt-3 rounded-lg border border-slate-800 bg-[#0B1120] p-4 text-sm text-slate-200 whitespace-pre-line leading-relaxed">
            {aiBriefing}
          </div>
        )}
      </section>
    </div>
  );
}
