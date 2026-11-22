import { useMemo } from 'react';
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
import { AlertCircle, CheckCircle2, Cpu } from 'lucide-react';
import type { FacilityStateSnapshot } from '../engine/types';
import { formatPower, formatShortTime } from './ChannelCard';

interface ForecastPageProps {
  snapshot: FacilityStateSnapshot;
  busy: boolean;
  onChangeHorizon: (horizonMinutes: number) => void;
}

const FEATURE_LABELS = [
  'Deviation from Rolling Mean',
  '1-Step Demand Delta (t - t-1)',
  'Lagged Demand Delta (t-1 - t-2)',
  '4-Step Trend Slope',
  'Intercept Bias',
];

export function ForecastPage({ snapshot, busy, onChangeHorizon }: ForecastPageProps) {
  const fc = snapshot.latestForecast;
  const unit = snapshot.settings.displayUnit;

  const benchmarkChartData = useMemo(() => {
    if (!fc.ridgeMetrics || !fc.persistenceMetrics || !fc.movingAverageMetrics) return [];
    return [
      {
        model: 'Ridge Regression',
        MAE: fc.ridgeMetrics.mae,
        RMSE: fc.ridgeMetrics.rmse,
      },
      {
        model: 'Persistence Baseline',
        MAE: fc.persistenceMetrics.mae,
        RMSE: fc.persistenceMetrics.rmse,
      },
      {
        model: 'Moving Average',
        MAE: fc.movingAverageMetrics.mae,
        RMSE: fc.movingAverageMetrics.rmse,
      },
    ];
  }, [fc]);

  const forecastSeriesData = useMemo(() => {
    return snapshot.forecastHistory
      .slice(0, 24)
      .reverse()
      .map((item) => ({
        time: formatShortTime(item.timestamp),
        current: item.currentDemandW,
        predicted: item.predictedDemandW,
      }));
  }, [snapshot.forecastHistory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Demand Forecasting</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Regularized Ridge Regression trained on chronological sliding windows and evaluated on held-out sequences against Persistence &amp; Moving-Average baselines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Forecast Horizon:</span>
          <div className="flex items-center gap-1 rounded-lg bg-[#111827] p-1 border border-slate-800">
            {[1, 3, 5, 10, 15].map((mins) => (
              <button
                key={mins}
                type="button"
                disabled={busy}
                onClick={() => onChangeHorizon(mins)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  snapshot.settings.forecastHorizonMinutes === mins
                    ? 'bg-sky-600/25 text-sky-300 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mins} min
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Warning banner if insufficient history or low confidence */}
      {!fc.isReliable && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3 text-xs sm:text-sm text-amber-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <p className="font-semibold">Model Reliability Advisory</p>
            <p className="mt-0.5 text-amber-200/90">{fc.statusMessage}</p>
          </div>
        </div>
      )}

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <p className="text-xs text-slate-400">Current Total Demand</p>
          <p className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {formatPower(fc.currentDemandW, unit)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Source: {fc.sourceType.toUpperCase()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <p className="text-xs text-slate-400">
            Predicted Demand (+{fc.horizonMinutes}m)
          </p>
          <p
            data-testid="forecast-predicted-demand"
            className="mt-2 font-mono text-2xl font-bold text-sky-300 tabular-nums"
          >
            {fc.predictedDemandW !== null ? formatPower(fc.predictedDemandW, unit) : 'Gated'}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            {fc.lowerBoundW !== null && fc.upperBoundW !== null
              ? `95% CI: ${fc.lowerBoundW.toFixed(2)} – ${fc.upperBoundW.toFixed(2)} W`
              : 'Insufficient samples'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <p className="text-xs text-slate-400">Forecast Trend &amp; Confidence</p>
          <p className="mt-2 text-2xl font-bold text-white">{fc.trend}</p>
          <p className="mt-1 text-xs text-slate-400 flex items-center gap-1.5">
            {fc.isReliable && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
            <span>
              {fc.confidencePercent !== null
                ? `${fc.confidencePercent}% confidence (held-out RMSE)`
                : 'Confidence unavailable'}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <p className="text-xs text-slate-400">Model &amp; Evaluation Split</p>
          <p className="mt-2 font-mono text-sm font-semibold text-slate-100 flex items-center gap-1.5">
            <Cpu className="h-4 w-4 text-sky-400" />
            {fc.modelVersion}
          </p>
          <p className="mt-2 text-xs text-slate-400 font-mono tabular-nums">
            Train: {fc.trainingSamples} · Test: {fc.testSamples} · {formatShortTime(fc.timestamp)}
          </p>
        </div>
      </div>

      {/* Benchmark Comparison & Historical Forecast Trajectory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <h3 className="text-base font-semibold text-white">
            Held-Out Error Benchmark (MAE &amp; RMSE)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Evaluated strictly on held-out test sequence (30% split) — lower error is better.
          </p>

          {benchmarkChartData.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-xs text-slate-400">
              Collect at least 24 samples to display held-out baseline benchmarks.
            </div>
          ) : (
            <>
              <div className="h-56 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={benchmarkChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="model" tick={{ fontSize: 11, fill: '#94a3b8' }} />
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
                    <Bar dataKey="MAE" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="RMSE" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs text-left border-t border-slate-800">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Model</th>
                      <th className="py-2 px-3 font-medium text-right">Test MAE (W)</th>
                      <th className="py-2 pl-3 font-medium text-right">Test RMSE (W)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                    {benchmarkChartData.map((row) => (
                      <tr key={row.model}>
                        <td className="py-2 pr-3 font-sans text-slate-200">{row.model}</td>
                        <td className="py-2 px-3 text-right text-sky-300">{row.MAE.toFixed(3)}</td>
                        <td className="py-2 pl-3 text-right text-indigo-300">{row.RMSE.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <h3 className="text-base font-semibold text-white">
            Forecast vs. Actual Demand Trajectory
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Tracks recent Ridge Regression predictions alongside observed total facility demand.
          </p>
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastSeriesData}>
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
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="current"
                  name="Observed Total (W)"
                  stroke="#f8fafc"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="Predicted Demand (W)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Ridge Regression Feature Weights Transparency */}
      {fc.featureWeights.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <h3 className="text-sm font-semibold text-white">
            Learned Ridge Regression Coefficients (λ = 2.0)
          </h3>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {fc.featureWeights.map((weight, idx) => (
              <div
                key={FEATURE_LABELS[idx] ?? idx}
                className="rounded-lg border border-slate-800 bg-[#0B1120] p-3"
              >
                <p className="text-[11px] text-slate-400 truncate">
                  {FEATURE_LABELS[idx] ?? `Feature ${idx}`}
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                  {weight >= 0 ? '+' : ''}
                  {weight.toFixed(4)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
