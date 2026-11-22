import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Sparkles } from 'lucide-react';
import { getCsvExportUrl, requestAiExplanation } from '../api/client';
import type { ChannelId, FacilityStateSnapshot, SeverityLevel } from '../engine/types';
import { formatShortTime } from './ChannelCard';

interface AnomalyPageProps {
  snapshot: FacilityStateSnapshot;
}

export function AnomalyPage({ snapshot }: AnomalyPageProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelId>('all');
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const filteredHistory = useMemo(() => {
    return snapshot.anomalyHistory.filter((item) => {
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
      if (channelFilter !== 'all' && item.channelId !== channelFilter) return false;
      return true;
    });
  }, [snapshot.anomalyHistory, severityFilter, channelFilter]);

  const handleAnalyzeAnomalies = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await requestAiExplanation('anomalies');
      setAiNote(res.explanation);
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Anomaly Detection</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Reproducible baseline-deviation z-score scoring, state mismatch checks, and missing/stale telemetry detection.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={aiLoading}
            onClick={handleAnalyzeAnomalies}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-medium transition-colors whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiLoading ? 'Analyzing...' : 'Explain Anomalies with Gemini'}
          </button>
          <a
            href={getCsvExportUrl('anomalies', channelFilter === 'all' ? 'all' : channelFilter)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export Anomaly CSV
          </a>
        </div>
      </div>

      {aiError && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3">
          {aiError}
        </p>
      )}
      {aiNote && (
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 text-sm text-slate-200 whitespace-pre-line">
          {aiNote}
        </div>
      )}

      {/* Active Anomalies in Current Tick */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <h3 className="text-sm font-semibold text-white">
          Current Tick Active Anomalies ({snapshot.activeAnomalies.length})
        </h3>
        {snapshot.activeAnomalies.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              All monitored channels are operating within expected state-conditioned baseline bounds.
            </span>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {snapshot.activeAnomalies.map((anom) => (
              <div
                key={anom.anomalyId}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-rose-200 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                    {anom.channelName} — {anom.type}
                  </span>
                  <span className="font-mono text-rose-200 uppercase">
                    {anom.severity} · Score {anom.anomalyScore}/100
                  </span>
                </div>
                <p className="text-slate-200 leading-relaxed">{anom.explanation}</p>
                <div className="flex flex-wrap items-center gap-3 text-slate-400 font-mono">
                  <span>Source: {anom.dataSource.toUpperCase()}</span>
                  <span>
                    Trigger: {anom.isSimulatedTrigger ? 'SIMULATED TEST EVENT' : 'OBSERVED DEVIATION'}
                  </span>
                  <span>{formatShortTime(anom.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Historical Anomaly Log with Filters */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">
            Recorded Anomaly History ({filteredHistory.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter anomalies by channel"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as 'all' | ChannelId)}
              className="rounded-lg border border-slate-700 bg-[#0B1120] px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="all">All Channels</option>
              <option value="ch1">CH1 LED Load</option>
              <option value="ch2">CH2 Fan Load 1</option>
              <option value="ch3">CH3 Fan Load 2</option>
            </select>
            <select
              aria-label="Filter anomalies by severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'all' | SeverityLevel)}
              className="rounded-lg border border-slate-700 bg-[#0B1120] px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No anomaly records match the selected filters. Trigger a simulated anomaly or fault from Simulation Control to inspect scoring.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B1120] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium text-right">Score</th>
                  <th className="px-4 py-3 font-medium text-right">Z-Score</th>
                  <th className="px-4 py-3 font-medium">Origin</th>
                  <th className="px-4 py-3 font-medium">Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredHistory.slice(0, 60).map((anom) => (
                  <tr key={anom.anomalyId} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap tabular-nums">
                      {formatShortTime(anom.timestamp)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-100 whitespace-nowrap">
                      {anom.channelName}
                    </td>
                    <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{anom.type}</td>
                    <td className="px-4 py-3 uppercase font-mono">
                      <span
                        className={
                          anom.severity === 'critical' || anom.severity === 'high'
                            ? 'text-rose-400'
                            : anom.severity === 'medium'
                              ? 'text-amber-300'
                              : 'text-sky-300'
                        }
                      >
                        {anom.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-slate-100 tabular-nums">
                      {anom.anomalyScore}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-slate-300 tabular-nums">
                      {anom.zScore.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono">
                      <span
                        className={
                          anom.isSimulatedTrigger ? 'text-sky-400' : 'text-emerald-400'
                        }
                      >
                        {anom.isSimulatedTrigger ? 'SIMULATED EVENT' : anom.dataSource.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-md">{anom.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
