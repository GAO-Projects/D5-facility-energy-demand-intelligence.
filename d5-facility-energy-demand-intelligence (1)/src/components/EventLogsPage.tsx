import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { getCsvExportUrl } from '../api/client';
import type { FacilityStateSnapshot } from '../engine/types';
import { formatShortTime } from './ChannelCard';

interface EventLogsPageProps {
  snapshot: FacilityStateSnapshot;
}

export function EventLogsPage({ snapshot }: EventLogsPageProps) {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'simulated' | 'measured'>('all');
  const [search, setSearch] = useState('');

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.eventLog.filter((evt) => {
      if (sourceFilter !== 'all' && evt.sourceType !== sourceFilter) return false;
      if (
        q &&
        !evt.description.toLowerCase().includes(q) &&
        !evt.eventType.toLowerCase().includes(q) &&
        !evt.affectedChannel.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [snapshot.eventLog, sourceFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">System &amp; Simulation Event Logs</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Auditable chronological trail of simulation triggers, manual load-state changes, BLE gateway packets, and configuration updates.
          </p>
        </div>

        <a
          href={getCsvExportUrl('events', 'all')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5" />
          Export Event Log CSV
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search event logs"
          placeholder="Search descriptions, channels, or event types..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
        />

        <div className="flex items-center gap-1 rounded-lg bg-[#111827] p-1 border border-slate-800">
          {(
            [
              { id: 'all', label: 'All Events' },
              { id: 'simulated', label: 'Simulated Only' },
              { id: 'measured', label: 'Measured BLE Only' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSourceFilter(tab.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                sourceFilter === tab.id
                  ? 'bg-sky-600/25 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No events match the current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B1120] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Event Type</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Simulated Flag</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredEvents.slice(0, 100).map((evt) => (
                  <tr key={evt.eventId} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap tabular-nums">
                      {formatShortTime(evt.timestamp)}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-200 whitespace-nowrap">
                      {evt.eventType}
                    </td>
                    <td className="px-4 py-3 font-mono uppercase text-slate-300 whitespace-nowrap">
                      {evt.affectedChannel}
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap">
                      <span
                        className={
                          evt.sourceType === 'measured' ? 'text-emerald-400' : 'text-sky-400'
                        }
                      >
                        {evt.sourceType.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap">
                      {evt.simulatedStatus ? (
                        <span className="text-sky-300">SIMULATED</span>
                      ) : (
                        <span className="text-emerald-300">PHYSICAL / SYS</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{evt.description}</td>
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
