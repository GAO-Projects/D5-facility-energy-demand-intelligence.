import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bluetooth,
  Clock,
  Cpu,
  FileText,
  Gauge,
  LayoutDashboard,
  Menu,
  Scale,
  Settings as SettingsIcon,
  Sliders,
  X,
} from 'lucide-react';
import type { FacilityStateSnapshot } from '../engine/types';
import { formatShortTime } from './ChannelCard';

export type NavPageId =
  | 'overview'
  | 'live'
  | 'forecast'
  | 'anomalies'
  | 'baseline'
  | 'historical'
  | 'simulation'
  | 'devices'
  | 'events'
  | 'settings';

export const NAV_ITEMS: { id: NavPageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview Dashboard', icon: LayoutDashboard },
  { id: 'live', label: 'Live Monitoring', icon: Activity },
  { id: 'forecast', label: 'AI Demand Forecast', icon: Cpu },
  { id: 'anomalies', label: 'Anomaly Detection', icon: AlertTriangle },
  { id: 'baseline', label: 'Baseline Analysis', icon: Scale },
  { id: 'historical', label: 'Historical Analytics', icon: BarChart3 },
  { id: 'simulation', label: 'Simulation Control', icon: Sliders },
  { id: 'devices', label: 'Device Integration', icon: Bluetooth },
  { id: 'events', label: 'Event Logs', icon: FileText },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

interface LayoutProps {
  activePage: NavPageId;
  onNavigate: (page: NavPageId) => void;
  snapshot: FacilityStateSnapshot;
  toastMessage: string | null;
  errorMessage: string | null;
  children: ReactNode;
}

export function Layout({
  activePage,
  onNavigate,
  snapshot,
  toastMessage,
  errorMessage,
  children,
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [nowClock, setNowClock] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNowClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isSimulatedMode = snapshot.simulationState.mode === 'simulation';
  const connStatus = snapshot.connectionStatus;
  const connBadgeClass =
    connStatus === 'Connected'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : connStatus === 'Simulation Mode'
        ? 'text-sky-300 border-sky-500/40 bg-sky-500/10'
        : connStatus === 'Stale Data'
          ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
          : 'text-rose-300 border-rose-500/40 bg-rose-500/10';

  const handleSelectPage = (page: NavPageId) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-800/90 bg-[#0F172A]">
        <div className="px-5 py-5 border-b border-slate-800/90 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Gauge className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">D5 Facility AIoT</p>
            <p className="text-xs text-slate-400 truncate">Demand Intelligence</p>
          </div>
        </div>

        <nav aria-label="Primary Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            const showAnomalyCount =
              item.id === 'anomalies' && snapshot.activeAnomalies.length > 0;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectPage(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-sky-500/15 text-sky-200 border border-sky-500/30'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {showAnomalyCount && (
                  <span className="font-mono text-xs text-rose-300 tabular-nums shrink-0">
                    {snapshot.activeAnomalies.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/90 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center justify-between">
            <span>Control Policy</span>
            <span className="text-slate-200 font-medium">Monitor Only</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            No automatic load actuation. Operator retains manual control of all physical loads.
          </p>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0F172A] border-r border-slate-800 flex flex-col z-10">
            <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">D5 Facility AIoT</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="Mobile Navigation" className="flex-1 overflow-y-auto p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPage(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left ${
                      active
                        ? 'bg-sky-500/15 text-sky-200 border border-sky-500/30'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Application Header */}
        <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#0B1120]/95 backdrop-blur-sm px-4 sm:px-6 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="lg:hidden p-2 rounded-lg border border-slate-800 text-slate-300 hover:bg-slate-800"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight truncate">
                  D5 Facility Energy Demand Intelligence
                </h1>
                <p className="text-xs text-slate-400 truncate">
                  AI-Powered Energy Monitoring, Demand Forecasting &amp; Anomaly Detection
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="hidden sm:flex items-center gap-2 text-slate-300 font-mono tabular-nums">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>{nowClock.toLocaleDateString()} {nowClock.toLocaleTimeString()}</span>
              </div>

              <span className="hidden md:inline text-slate-600" aria-hidden="true">
                |
              </span>

              <div className="flex items-center gap-2 text-slate-300">
                <span className="text-slate-400">Monitor:</span>
                <span className="font-medium text-slate-100">
                  {snapshot.simulationState.isRunning ? 'Live Streaming' : 'Paused'}
                </span>
              </div>

              <span
                data-testid="connection-status-badge"
                className={`rounded-md border px-2.5 py-1 font-medium whitespace-nowrap ${connBadgeClass}`}
              >
                {connStatus}
              </span>

              <span
                data-testid="data-source-indicator"
                className={`rounded-md border px-2.5 py-1 font-medium whitespace-nowrap ${
                  isSimulatedMode
                    ? 'text-sky-300 border-sky-500/40 bg-sky-500/10'
                    : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                }`}
              >
                {isSimulatedMode ? 'Source: SIMULATED' : 'Source: MEASURED BLE'}
              </span>

              <span className="hidden xl:inline text-slate-400 font-mono tabular-nums">
                Updated {formatShortTime(snapshot.latestTick.timestamp)}
              </span>
            </div>
          </div>
        </header>

        {/* System-wide Telemetry Warnings */}
        {(snapshot.connectionStatus === 'Stale Data' ||
          snapshot.connectionStatus === 'Disconnected' ||
          snapshot.latestTick.validChannelCount < 3) && (
          <div
            role="alert"
            className="mx-4 sm:mx-6 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs sm:text-sm text-amber-200 flex items-center gap-2.5"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              {snapshot.connectionStatus === 'Stale Data'
                ? 'Telemetry staleness detected: one or more channels exceeded the configured data freshness threshold.'
                : snapshot.connectionStatus === 'Disconnected'
                  ? 'Telemetry disconnected: no valid channel readings are currently arriving.'
                  : `Degraded telemetry: ${3 - snapshot.latestTick.validChannelCount} channel(s) reported missing or stale data. Missing values are excluded from Total Power rather than fabricated.`}
            </span>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mx-4 sm:mx-6 mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs sm:text-sm text-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {toastMessage && (
          <div
            role="status"
            className="mx-4 sm:mx-6 mt-4 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-xs sm:text-sm text-sky-200"
          >
            {toastMessage}
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 px-4 sm:px-6 py-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
