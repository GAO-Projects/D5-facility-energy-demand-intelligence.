import { useState, type FormEvent } from 'react';
import { ArrowRight, Bluetooth, CheckCircle2, Info, XCircle } from 'lucide-react';
import { ingestBleTestPayload } from '../api/client';
import type { ChannelId, FacilityStateSnapshot } from '../engine/types';
import { formatShortTime } from './ChannelCard';

interface DeviceIntegrationPageProps {
  snapshot: FacilityStateSnapshot;
  busy: boolean;
  onSwitchMode: (mode: 'simulation' | 'ble_gateway') => void;
  onSnapshotUpdate: (next: FacilityStateSnapshot) => void;
}

export function DeviceIntegrationPage({
  snapshot,
  busy,
  onSwitchMode,
  onSnapshotUpdate,
}: DeviceIntegrationPageProps) {
  const [gatewayId, setGatewayId] = useState('GAO-217030-D5-GW01');
  const [protocol, setProtocol] = useState<'GAO-217030-HTTP' | 'GAO-217030-MQTT'>(
    'GAO-217030-HTTP'
  );
  const [channelId, setChannelId] = useState<ChannelId>('ch1');
  const [voltage, setVoltage] = useState('12.08');
  const [current, setCurrent] = useState('1.21');
  const [submitFeedback, setSubmitFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleTestIngest = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitFeedback(null);
    try {
      const res = await ingestBleTestPayload({
        gatewayId,
        protocol,
        channelId,
        voltage: Number(voltage),
        current: Number(current),
        timestamp: new Date().toISOString(),
      });
      if (res.snapshot) {
        onSnapshotUpdate(res.snapshot);
      }
      if (res.result?.accepted) {
        setSubmitFeedback({
          ok: true,
          message: `Accepted MEASURED packet: ${channelId.toUpperCase()} = ${res.result.reading.power} W (${res.result.reading.voltage} V × ${res.result.reading.current} A).`,
        });
      } else {
        setSubmitFeedback({
          ok: false,
          message: res.result?.error ?? 'Packet rejected by validator.',
        });
      }
    } catch (err) {
      setSubmitFeedback({ ok: false, message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">
            BLE Hardware Integration Readiness (GAO 217030)
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Modular HTTP/MQTT sensor ingestion interface, payload decoder, and strict physical vs. simulated telemetry separation.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-[#111827] p-1 border border-slate-800">
          <button
            type="button"
            disabled={busy}
            onClick={() => onSwitchMode('simulation')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              snapshot.simulationState.mode === 'simulation'
                ? 'bg-sky-600/25 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Local Simulation Mode
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSwitchMode('ble_gateway')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              snapshot.simulationState.mode === 'ble_gateway'
                ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            BLE Gateway Ingestion Mode
          </button>
        </div>
      </div>

      {/* Hardware Honesty Disclaimer */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-xs text-amber-200">
        <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
        <div>
          <p className="font-semibold">Hardware Connectivity Status: Integration Ready (No Live Gateway Bound)</p>
          <p className="mt-0.5 text-amber-200/90">
            Physical GAO 217030 BLE hardware connectivity has not been claimed or verified in this sandbox. The gateway operates strictly as a unidirectional sensing transport—no load-switching outputs exist. Use the modular HTTP ingestion tester below to verify packet decoding and MEASURED source tagging.
          </p>
        </div>
      </div>

      {/* Architecture Pipeline Diagram */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <h3 className="text-sm font-semibold text-white">
          Intended Sensing &amp; Transport Pipeline
        </h3>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-center text-xs">
          {[
            { title: '3× BLE Power Nodes', sub: 'CH1 LED, CH2/3 Fans (V, A)' },
            { title: 'GAO 217030 BLE Gateway', sub: 'Read-only BLE advertisement bridge' },
            { title: 'POST /api/ingest/ble', sub: 'HTTP / MQTT JSON forwarding' },
            { title: 'Payload Decoder', sub: 'Bounds, duplicate & staleness checks' },
            { title: 'AI Analytics Engine', sub: 'Ridge Forecast, Baseline & Anomalies' },
          ].map((stage, idx, arr) => (
            <div key={stage.title} className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-slate-800 bg-[#0B1120] p-3">
                <p className="font-medium text-slate-100">{stage.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{stage.sub}</p>
              </div>
              {idx < arr.length - 1 && (
                <ArrowRight className="hidden md:block h-4 w-4 text-slate-500 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interactive Ingestion Endpoint Tester */}
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Bluetooth className="h-4 w-4 text-emerald-400" />
            Test BLE Gateway Packet Ingestion (POST /api/ingest/ble)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Submits a structured GAO 217030 JSON packet through the production validator. Valid packets are stored strictly as <strong className="text-emerald-300">MEASURED</strong> readings; out-of-range values (e.g. V &gt; 30V) are rejected.
          </p>

          <form onSubmit={handleTestIngest} className="mt-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ble-gw" className="block text-slate-400 mb-1">
                  Gateway ID
                </label>
                <input
                  id="ble-gw"
                  type="text"
                  value={gatewayId}
                  onChange={(e) => setGatewayId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label htmlFor="ble-proto" className="block text-slate-400 mb-1">
                  Transport Protocol
                </label>
                <select
                  id="ble-proto"
                  value={protocol}
                  onChange={(e) =>
                    setProtocol(e.target.value as 'GAO-217030-HTTP' | 'GAO-217030-MQTT')
                  }
                  className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100"
                >
                  <option value="GAO-217030-HTTP">GAO-217030-HTTP</option>
                  <option value="GAO-217030-MQTT">GAO-217030-MQTT</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="ble-ch" className="block text-slate-400 mb-1">
                  Channel ID
                </label>
                <select
                  id="ble-ch"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value as ChannelId)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100"
                >
                  <option value="ch1">ch1 (LED)</option>
                  <option value="ch2">ch2 (Fan 1)</option>
                  <option value="ch3">ch3 (Fan 2)</option>
                </select>
              </div>
              <div>
                <label htmlFor="ble-v" className="block text-slate-400 mb-1">
                  Voltage (0–30 V)
                </label>
                <input
                  id="ble-v"
                  type="number"
                  step="0.01"
                  value={voltage}
                  onChange={(e) => setVoltage(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label htmlFor="ble-a" className="block text-slate-400 mb-1">
                  Current (0–10 A)
                </label>
                <input
                  id="ble-a"
                  type="number"
                  step="0.01"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium transition-colors"
            >
              {submitting ? 'Decoding & Validating...' : 'Send Test BLE Gateway Packet'}
            </button>
          </form>

          {submitFeedback && (
            <div
              className={`mt-3 rounded-lg border p-3 text-xs flex items-start gap-2 ${
                submitFeedback.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
              }`}
            >
              {submitFeedback.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span>{submitFeedback.message}</span>
            </div>
          )}
        </section>

        {/* BLE Packet Audit Log */}
        <section className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Gateway Ingestion Audit Log ({snapshot.bleIngestionLog.length})
            </h3>
            <span className="text-xs text-slate-400">Validation history</span>
          </div>

          {snapshot.bleIngestionLog.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No BLE gateway packets received yet. Submit a test payload on the left or configure a GAO 217030 HTTP forwarder to <code className="text-slate-200">/api/ingest/ble</code>.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70 max-h-80 overflow-y-auto">
              {snapshot.bleIngestionLog.slice(0, 20).map((entry, i) => (
                <div key={`${entry.receivedAt}-${i}`} className="px-4 py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-medium ${
                        entry.accepted ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {entry.accepted ? 'ACCEPTED (MEASURED)' : 'REJECTED'}
                    </span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {formatShortTime(entry.receivedAt)}
                    </span>
                  </div>
                  <p className="text-slate-300">
                    {entry.accepted && entry.reading
                      ? `${entry.gatewayId} → ${entry.reading.channelId.toUpperCase()}: ${entry.reading.voltage} V × ${entry.reading.current} A = ${entry.reading.power} W`
                      : entry.error}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
