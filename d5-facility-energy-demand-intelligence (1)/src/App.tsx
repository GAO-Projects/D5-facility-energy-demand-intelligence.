/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  controlSimulation,
  fetchFacilityState,
  setManualLoadState,
  triggerSimulationEvent,
  updateSystemSettings,
} from './api/client';
import { AnomalyPage } from './components/AnomalyPage';
import { BaselinePage } from './components/BaselinePage';
import { DeviceIntegrationPage } from './components/DeviceIntegrationPage';
import { EventLogsPage } from './components/EventLogsPage';
import { ForecastPage } from './components/ForecastPage';
import { HistoricalAnalyticsPage } from './components/HistoricalAnalyticsPage';
import { Layout, type NavPageId } from './components/Layout';
import { LiveMonitoringPage } from './components/LiveMonitoringPage';
import { OverviewPage } from './components/OverviewPage';
import { SettingsPage } from './components/SettingsPage';
import { SimulationControlPage } from './components/SimulationControlPage';
import type {
  ChannelId,
  DisturbanceType,
  FacilityStateSnapshot,
  LoadState,
  SystemSettings,
} from './engine/types';

export default function App() {
  const [activePage, setActivePage] = useState<NavPageId>('overview');
  const [snapshot, setSnapshot] = useState<FacilityStateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 4500);
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const next = await fetchFacilityState();
      setSnapshot(next);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(
        `Backend telemetry connection error: ${(err as Error).message}`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  // Poll backend synced with configured simulationIntervalMs
  const pollIntervalMs = snapshot?.settings.simulationIntervalMs ?? 2500;
  useEffect(() => {
    const id = setInterval(() => {
      void refreshState();
    }, Math.max(1200, pollIntervalMs));
    return () => clearInterval(id);
  }, [pollIntervalMs, refreshState]);

  const handleControlSimulation = async (
    action: 'start' | 'pause' | 'reset' | 'tick' | 'switch_mode',
    mode?: 'simulation' | 'ble_gateway'
  ) => {
    setBusy(true);
    try {
      const next = await controlSimulation(action, mode);
      setSnapshot(next);
      setErrorMessage(null);
      const messages: Record<string, string> = {
        start: 'Simulation stream started.',
        pause: 'Simulation stream paused.',
        reset: 'Simulation reset to 48-sample baseline sequence.',
        tick: 'Sampled single telemetry tick.',
        switch_mode:
          mode === 'ble_gateway'
            ? 'Switched to BLE Gateway Ingestion mode (awaiting measured packets).'
            : 'Switched to Local Simulation mode.',
      };
      showToast(messages[action] ?? 'Simulation updated.');
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLoadState = async (channelId: ChannelId, nextState: LoadState) => {
    setBusy(true);
    try {
      const next = await setManualLoadState(channelId, nextState);
      setSnapshot(next);
      setErrorMessage(null);
      showToast(
        `Simulated load input: ${channelId.toUpperCase()} set to ${nextState} (software simulation only).`
      );
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleTriggerEvent = async (
    type: DisturbanceType,
    targetChannel: ChannelId | 'all' = 'all',
    magnitudeFactor = 1.4
  ) => {
    setBusy(true);
    try {
      const next = await triggerSimulationEvent(type, targetChannel, magnitudeFactor);
      setSnapshot(next);
      setErrorMessage(null);
      const label =
        type === 'none'
          ? 'Cleared simulated disturbance and restored baseline operation.'
          : `Triggered SIMULATED event: ${type} (${targetChannel}).`;
      showToast(label);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSettings = async (partial: Partial<SystemSettings>) => {
    setBusy(true);
    try {
      const next = await updateSystemSettings(partial);
      setSnapshot(next);
      setErrorMessage(null);
      showToast('System settings updated and persisted.');
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="min-h-screen bg-[#0B1120] text-slate-200 flex items-center justify-center p-6">
        <div className="rounded-xl border border-slate-800 bg-[#111827] px-6 py-5 text-sm">
          Loading D5 Facility Energy Demand Intelligence telemetry...
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-[#0B1120] text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 space-y-3 text-sm">
          <p className="font-semibold text-rose-200">Unable to reach facility telemetry backend</p>
          <p className="text-xs text-rose-200/80">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void refreshState()}
            className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-medium"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout
      activePage={activePage}
      onNavigate={setActivePage}
      snapshot={snapshot}
      toastMessage={toastMessage}
      errorMessage={errorMessage}
    >
      {activePage === 'overview' && (
        <OverviewPage
          snapshot={snapshot}
          busy={busy}
          onControlSimulation={(action) => void handleControlSimulation(action)}
          onTriggerEvent={(type, target) => void handleTriggerEvent(type, target)}
          onToggleLoadState={(ch, st) => void handleToggleLoadState(ch, st)}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'live' && (
        <LiveMonitoringPage
          snapshot={snapshot}
          busy={busy}
          onToggleLoadState={(ch, st) => void handleToggleLoadState(ch, st)}
          onTickOnce={() => void handleControlSimulation('tick')}
        />
      )}

      {activePage === 'forecast' && (
        <ForecastPage
          snapshot={snapshot}
          busy={busy}
          onChangeHorizon={(mins) =>
            void handleSaveSettings({ forecastHorizonMinutes: mins })
          }
        />
      )}

      {activePage === 'anomalies' && <AnomalyPage snapshot={snapshot} />}

      {activePage === 'baseline' && <BaselinePage snapshot={snapshot} />}

      {activePage === 'historical' && <HistoricalAnalyticsPage snapshot={snapshot} />}

      {activePage === 'simulation' && (
        <SimulationControlPage
          snapshot={snapshot}
          busy={busy}
          onControlSimulation={(action) => void handleControlSimulation(action)}
          onTriggerEvent={(type, target, factor) =>
            void handleTriggerEvent(type, target, factor)
          }
          onToggleLoadState={(ch, st) => void handleToggleLoadState(ch, st)}
        />
      )}

      {activePage === 'devices' && (
        <DeviceIntegrationPage
          snapshot={snapshot}
          busy={busy}
          onSwitchMode={(mode) => void handleControlSimulation('switch_mode', mode)}
          onSnapshotUpdate={(next) => {
            setSnapshot(next);
            showToast('BLE ingestion state updated.');
          }}
        />
      )}

      {activePage === 'events' && <EventLogsPage snapshot={snapshot} />}

      {activePage === 'settings' && (
        <SettingsPage
          snapshot={snapshot}
          busy={busy}
          onSaveSettings={handleSaveSettings}
        />
      )}
    </Layout>
  );
}
