import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import type { FacilityStateSnapshot, SystemSettings } from '../engine/types';

interface SettingsPageProps {
  snapshot: FacilityStateSnapshot;
  busy: boolean;
  onSaveSettings: (next: Partial<SystemSettings>) => Promise<void>;
}

export function SettingsPage({ snapshot, busy, onSaveSettings }: SettingsPageProps) {
  const [form, setForm] = useState<SystemSettings>(snapshot.settings);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setForm(snapshot.settings);
  }, [snapshot.settings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSavedNotice(false);
    await onSaveSettings(form);
    setSavedNotice(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">System Settings &amp; Documentation</h2>
        <p className="text-xs sm:text-sm text-slate-400">
          Configure simulation cadence, AI forecast horizon, data freshness thresholds, and inspect operational notes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#111827] p-5 space-y-4 text-xs"
        >
          <h3 className="text-base font-semibold text-white">Runtime Configuration</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="set-interval" className="block text-slate-400 mb-1">
                Simulation Interval (ms)
              </label>
              <input
                id="set-interval"
                type="number"
                min={1000}
                max={60000}
                step={500}
                value={form.simulationIntervalMs}
                onChange={(e) =>
                  setForm({ ...form, simulationIntervalMs: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100 font-mono"
              />
            </div>

            <div>
              <label htmlFor="set-horizon" className="block text-slate-400 mb-1">
                Forecast Horizon (minutes)
              </label>
              <input
                id="set-horizon"
                type="number"
                min={1}
                max={30}
                value={form.forecastHorizonMinutes}
                onChange={(e) =>
                  setForm({ ...form, forecastHorizonMinutes: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100 font-mono"
              />
            </div>

            <div>
              <label htmlFor="set-freshness" className="block text-slate-400 mb-1">
                Data Freshness Threshold (sec)
              </label>
              <input
                id="set-freshness"
                type="number"
                min={5}
                max={300}
                value={form.dataFreshnessThresholdSec}
                onChange={(e) =>
                  setForm({ ...form, dataFreshnessThresholdSec: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100 font-mono"
              />
            </div>

            <div>
              <label htmlFor="set-window" className="block text-slate-400 mb-1">
                Default Chart Window (points)
              </label>
              <input
                id="set-window"
                type="number"
                min={15}
                max={200}
                value={form.chartWindowPoints}
                onChange={(e) =>
                  setForm({ ...form, chartWindowPoints: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100 font-mono"
              />
            </div>

            <div>
              <label htmlFor="set-unit" className="block text-slate-400 mb-1">
                Display Power Unit
              </label>
              <select
                id="set-unit"
                value={form.displayUnit}
                onChange={(e) =>
                  setForm({ ...form, displayUnit: e.target.value as 'W' | 'kW' })
                }
                className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100"
              >
                <option value="W">Watts (W)</option>
                <option value="kW">Kilowatts (kW)</option>
              </select>
            </div>

            <div>
              <label htmlFor="set-sens" className="block text-slate-400 mb-1">
                Anomaly Z-Score Sensitivity
              </label>
              <select
                id="set-sens"
                value={form.anomalySensitivity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    anomalySensitivity: e.target.value as 'standard' | 'strict' | 'relaxed',
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-slate-100"
              >
                <option value="strict">Strict (z ≥ 2.4)</option>
                <option value="standard">Standard (z ≥ 3.0)</option>
                <option value="relaxed">Relaxed (z ≥ 3.8)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-medium transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              Save Settings
            </button>
            {savedNotice && (
              <span className="text-emerald-400 font-medium">Settings saved &amp; persisted.</span>
            )}
          </div>
        </form>

        {/* Operational & Architecture Guide */}
        <section className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#111827] p-5 space-y-4 text-xs text-slate-300 leading-relaxed">
          <h3 className="text-base font-semibold text-white">
            Operational Scope &amp; Limitations
          </h3>
          <div className="space-y-2.5">
            <p>
              <strong className="text-slate-100">Monitoring &amp; Forecasting Only:</strong> D5 Facility Energy Demand Intelligence strictly monitors consumption, learns state-conditioned baselines, detects anomalies, and forecasts short-term demand. No automated load switching, PWM dimming, or physical actuation is implemented.
            </p>
            <p>
              <strong className="text-slate-100">Analytical Models:</strong> Demand forecasting trains a regularized Ridge Regression model (λ = 2.0) over sliding window features and compares held-out test MAE/RMSE against Persistence and Moving-Average baselines. Anomaly detection scores deviations using state-conditioned z-scores plus freshness/missing-packet validation.
            </p>
            <p>
              <strong className="text-slate-100">Hardware Readiness:</strong> The GAO 217030 BLE ingestion interface (<code className="text-sky-300">POST /api/ingest/ble</code>) validates incoming JSON telemetry and tags accepted readings as <code className="text-emerald-300">MEASURED</code>, keeping them strictly distinct from simulated readings. Physical BLE hardware connectivity is not active until a live gateway forwards packets.
            </p>
            <p>
              <strong className="text-slate-100">Storage &amp; Persistence:</strong> Readings, forecasts, anomaly logs, simulation events, and settings persist locally on the backend server in <code className="text-slate-200">data/d5_facility_db.json</code>.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
