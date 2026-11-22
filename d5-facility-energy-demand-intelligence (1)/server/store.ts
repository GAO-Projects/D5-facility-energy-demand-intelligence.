import fs from 'node:fs';
import path from 'node:path';
import {
  computeBaselineComparison,
  computeHistoricalSummary,
  computeTotalPowerSummary,
  detectAnomalies,
  generateDemandForecast,
} from '../src/engine/analytics';
import { decodeAndValidateBlePayload } from '../src/engine/bleDecoder';
import {
  CHANNEL_DEFINITIONS,
  createInitialSimulationState,
  generateSeedHistory,
  generateSimulatedTick,
} from '../src/engine/simulation';
import type {
  AnomalyRecord,
  BleIngestionResult,
  ChannelId,
  ConnectionStatus,
  DisturbanceType,
  FacilityStateSnapshot,
  ForecastRecord,
  LoadState,
  RawBleGatewayPayload,
  SensorReading,
  SimulationEvent,
  SimulationState,
  SystemSettings,
  TickSnapshot,
} from '../src/engine/types';

interface PersistedDatabase {
  simulationState: SimulationState;
  settings: SystemSettings;
  history: TickSnapshot[];
  forecastHistory: ForecastRecord[];
  anomalyHistory: AnomalyRecord[];
  eventLog: SimulationEvent[];
  bleIngestionLog: BleIngestionResult[];
  lastMeasuredByChannel: Partial<Record<ChannelId, SensorReading>>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'd5_facility_db.json');
const MAX_HISTORY_TICKS = 400;
const MAX_FORECAST_HISTORY = 120;
const MAX_ANOMALY_HISTORY = 150;
const MAX_EVENT_LOG = 250;
const MAX_BLE_LOG = 100;

export function createDefaultSettings(): SystemSettings {
  return {
    simulationIntervalMs: 2500,
    forecastHorizonMinutes: 5,
    dataFreshnessThresholdSec: 30,
    displayUnit: 'W',
    chartWindowPoints: 40,
    anomalySensitivity: 'standard',
  };
}

function createInitialDb(): PersistedDatabase {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const settings = createDefaultSettings();
  const simulationState = createInitialSimulationState();
  const history = generateSeedHistory(nowMs, settings.dataFreshnessThresholdSec, 64);
  const latestTick = history[history.length - 1];
  const initialForecast = generateDemandForecast(
    history,
    settings.forecastHorizonMinutes,
    nowIso
  );

  const initEvent: SimulationEvent = {
    eventId: `evt-init-${nowMs}`,
    eventType: 'simulation_started',
    affectedChannel: 'all',
    description:
      'Initialized D5 Facility simulation engine with 64 deterministic baseline training intervals (all records labeled SIMULATED).',
    timestamp: nowIso,
    simulatedStatus: true,
    sourceType: 'simulated',
  };

  // Evaluate initial baseline & anomalies just in case
  const baseline = computeBaselineComparison(history, latestTick);
  const anomalies = detectAnomalies(latestTick, baseline, settings.anomalySensitivity);

  return {
    simulationState,
    settings,
    history,
    forecastHistory: [initialForecast],
    anomalyHistory: anomalies,
    eventLog: [initEvent],
    bleIngestionLog: [],
    lastMeasuredByChannel: {},
  };
}

export class FacilityStore {
  private db: PersistedDatabase;

  constructor() {
    this.db = this.loadFromDisk();
  }

  private loadFromDisk(): PersistedDatabase {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedDatabase;
        if (parsed && Array.isArray(parsed.history) && parsed.history.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load persisted D5 facility database, creating fresh store:', err);
    }
    const fresh = createInitialDb();
    this.persistToDisk(fresh);
    return fresh;
  }

  private persistToDisk(data: PersistedDatabase = this.db): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, DB_PATH);
    } catch (err) {
      console.error('Failed to persist D5 facility database:', err);
    }
  }

  private pushEvent(event: SimulationEvent): void {
    this.db.eventLog.unshift(event);
    if (this.db.eventLog.length > MAX_EVENT_LOG) {
      this.db.eventLog.length = MAX_EVENT_LOG;
    }
  }

  private deriveConnectionStatus(latestTick: TickSnapshot): ConnectionStatus {
    const channels = Object.values(latestTick.channels);
    const hasStale = channels.some((c) => c.isStale);
    const allMissing = channels.every((c) => c.status === 'Missing');

    if (this.db.simulationState.mode === 'ble_gateway') {
      if (allMissing) return 'Disconnected';
      if (hasStale) return 'Stale Data';
      const ageSec = (Date.now() - Date.parse(latestTick.timestamp)) / 1000;
      if (ageSec > this.db.settings.dataFreshnessThresholdSec) {
        return 'Stale Data';
      }
      return 'Connected';
    }

    if (hasStale) return 'Stale Data';
    if (allMissing) return 'Disconnected';
    return 'Simulation Mode';
  }

  public getSnapshot(): FacilityStateSnapshot {
    const nowIso = new Date().toISOString();
    const history = this.db.history;
    const latestTick = history[history.length - 1];
    const previousTick = history.length > 1 ? history[history.length - 2] : undefined;

    const totalPower = computeTotalPowerSummary(latestTick, previousTick);
    const baselineComparison = computeBaselineComparison(history, latestTick);
    const latestForecast =
      this.db.forecastHistory[0] ??
      generateDemandForecast(history, this.db.settings.forecastHorizonMinutes, nowIso);
    const activeAnomalies = detectAnomalies(
      latestTick,
      baselineComparison,
      this.db.settings.anomalySensitivity
    );
    const historicalSummary = computeHistoricalSummary(history, this.db.anomalyHistory);

    return {
      connectionStatus: this.deriveConnectionStatus(latestTick),
      simulationState: this.db.simulationState,
      settings: this.db.settings,
      latestTick,
      totalPower,
      baselineComparison,
      latestForecast,
      activeAnomalies,
      history,
      forecastHistory: this.db.forecastHistory,
      anomalyHistory: this.db.anomalyHistory,
      eventLog: this.db.eventLog,
      bleIngestionLog: this.db.bleIngestionLog,
      historicalSummary,
      serverTime: nowIso,
    };
  }

  public tickSimulation(): FacilityStateSnapshot {
    if (this.db.simulationState.mode !== 'simulation') {
      return this.getSnapshot();
    }

    const nowIso = new Date().toISOString();
    this.db.simulationState.tickCounter += 1;

    const tick = generateSimulatedTick(
      this.db.simulationState,
      nowIso,
      this.db.settings.dataFreshnessThresholdSec
    );

    this.recordNewTick(tick, nowIso);
    this.persistToDisk();
    return this.getSnapshot();
  }

  private recordNewTick(tick: TickSnapshot, nowIso: string): void {
    this.db.history.push(tick);
    if (this.db.history.length > MAX_HISTORY_TICKS) {
      this.db.history.splice(0, this.db.history.length - MAX_HISTORY_TICKS);
    }

    const baseline = computeBaselineComparison(this.db.history, tick);
    const anomalies = detectAnomalies(
      tick,
      baseline,
      this.db.settings.anomalySensitivity
    );

    for (const anomaly of anomalies) {
      this.db.anomalyHistory.unshift(anomaly);
    }
    if (this.db.anomalyHistory.length > MAX_ANOMALY_HISTORY) {
      this.db.anomalyHistory.length = MAX_ANOMALY_HISTORY;
    }

    const forecast = generateDemandForecast(
      this.db.history,
      this.db.settings.forecastHorizonMinutes,
      nowIso
    );
    this.db.forecastHistory.unshift(forecast);
    if (this.db.forecastHistory.length > MAX_FORECAST_HISTORY) {
      this.db.forecastHistory.length = MAX_FORECAST_HISTORY;
    }
  }

  public controlSimulation(
    action: 'start' | 'pause' | 'reset' | 'tick' | 'switch_mode',
    mode?: 'simulation' | 'ble_gateway'
  ): FacilityStateSnapshot {
    const nowIso = new Date().toISOString();

    if (action === 'start') {
      this.db.simulationState.isRunning = true;
      this.db.simulationState.mode = 'simulation';
      this.pushEvent({
        eventId: `evt-${Date.now()}`,
        eventType: 'simulation_started',
        affectedChannel: 'all',
        description: 'Operator started continuous multi-channel telemetry simulation.',
        timestamp: nowIso,
        simulatedStatus: true,
        sourceType: 'simulated',
      });
    } else if (action === 'pause') {
      this.db.simulationState.isRunning = false;
      this.pushEvent({
        eventId: `evt-${Date.now()}`,
        eventType: 'simulation_paused',
        affectedChannel: 'all',
        description: 'Operator paused telemetry simulation stream.',
        timestamp: nowIso,
        simulatedStatus: true,
        sourceType: 'simulated',
      });
    } else if (action === 'reset') {
      this.db = createInitialDb();
      this.pushEvent({
        eventId: `evt-reset-${Date.now()}`,
        eventType: 'simulation_reset',
        affectedChannel: 'all',
        description:
          'Simulation reset to baseline 48-sample historical sequence and normal load states.',
        timestamp: nowIso,
        simulatedStatus: true,
        sourceType: 'simulated',
      });
    } else if (action === 'tick') {
      return this.tickSimulation();
    } else if (action === 'switch_mode' && mode) {
      this.db.simulationState.mode = mode;
      if (mode === 'ble_gateway') {
        this.db.simulationState.isRunning = false;
      }
      this.pushEvent({
        eventId: `evt-mode-${Date.now()}`,
        eventType: mode === 'simulation' ? 'simulation_started' : 'ble_packet_ingested',
        affectedChannel: 'system',
        description:
          mode === 'simulation'
            ? 'Switched active telemetry source to Local Simulation Mode.'
            : 'Switched active telemetry source to GAO 217030 BLE Gateway Ingestion Mode (awaiting real gateway packets).',
        timestamp: nowIso,
        simulatedStatus: mode === 'simulation',
        sourceType: mode === 'simulation' ? 'simulated' : 'measured',
      });
    }

    this.persistToDisk();
    return this.getSnapshot();
  }

  public setManualLoadState(
    channelId: ChannelId,
    loadState: LoadState
  ): FacilityStateSnapshot {
    const nowIso = new Date().toISOString();
    const prev = this.db.simulationState.loadStates[channelId];
    this.db.simulationState.loadStates[channelId] = loadState;

    this.pushEvent({
      eventId: `evt-load-${Date.now()}`,
      eventType: 'manual_load_change',
      affectedChannel: channelId,
      description: `Simulated manual load-state input: ${CHANNEL_DEFINITIONS[channelId].name} changed from ${prev} to ${loadState} (software simulation only; no physical actuation).`,
      timestamp: nowIso,
      simulatedStatus: true,
      sourceType: 'simulated',
    });

    // Immediately generate an updated tick reflecting the new simulated load state
    this.db.simulationState.tickCounter += 1;
    const tick = generateSimulatedTick(
      this.db.simulationState,
      nowIso,
      this.db.settings.dataFreshnessThresholdSec
    );
    this.recordNewTick(tick, nowIso);
    this.persistToDisk();
    return this.getSnapshot();
  }

  public triggerDisturbance(
    type: DisturbanceType,
    targetChannel: ChannelId | 'all' = 'all',
    magnitudeFactor = 1.4
  ): FacilityStateSnapshot {
    const nowIso = new Date().toISOString();

    this.db.simulationState.activeDisturbance = {
      type,
      targetChannel,
      magnitudeFactor,
      activatedAt: type === 'none' ? null : nowIso,
    };

    const eventTypeMap: Record<DisturbanceType, SimulationEvent['eventType']> = {
      none: 'disturbance_cleared',
      demand_increase: 'demand_increase',
      demand_decrease: 'demand_decrease',
      anomaly: 'anomaly_injected',
      missing_data: 'missing_data_injected',
      stale_ble: 'stale_ble_injected',
    };

    const labelMap: Record<DisturbanceType, string> = {
      none: 'Cleared active simulated disturbance; restored baseline operation.',
      demand_increase: `Simulated demand increase triggered (${targetChannel}, factor ×${magnitudeFactor.toFixed(2)}).`,
      demand_decrease: `Simulated demand decrease triggered (${targetChannel}, factor ×${magnitudeFactor.toFixed(2)}).`,
      anomaly: `Simulated electrical fault / anomaly injected on ${targetChannel}.`,
      missing_data: `Simulated missing telemetry drop injected on ${targetChannel}.`,
      stale_ble: `Simulated stale BLE timestamp condition injected on ${targetChannel}.`,
    };

    this.pushEvent({
      eventId: `evt-dist-${Date.now()}`,
      eventType: eventTypeMap[type],
      affectedChannel: targetChannel,
      description: labelMap[type],
      timestamp: nowIso,
      simulatedStatus: true,
      sourceType: 'simulated',
    });

    this.db.simulationState.tickCounter += 1;
    const tick = generateSimulatedTick(
      this.db.simulationState,
      nowIso,
      this.db.settings.dataFreshnessThresholdSec
    );
    this.recordNewTick(tick, nowIso);
    this.persistToDisk();
    return this.getSnapshot();
  }

  public ingestBlePayload(payload: Partial<RawBleGatewayPayload>): {
    result: BleIngestionResult;
    snapshot: FacilityStateSnapshot;
  } {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const tickId = `ble-tick-${nowMs}`;

    const lastTimestampByChannel: Partial<Record<ChannelId, string>> = {};
    (['ch1', 'ch2', 'ch3'] as ChannelId[]).forEach((id) => {
      const existing = this.db.lastMeasuredByChannel[id];
      if (existing) lastTimestampByChannel[id] = existing.timestamp;
    });

    const observedLoadState: LoadState =
      payload.channelId && this.db.simulationState.loadStates[payload.channelId]
        ? this.db.simulationState.loadStates[payload.channelId]
        : 'ON';

    const result = decodeAndValidateBlePayload(payload, {
      nowMs,
      freshnessThresholdSec: this.db.settings.dataFreshnessThresholdSec,
      lastTimestampByChannel,
      observedLoadState,
      tickId,
    });

    this.db.bleIngestionLog.unshift(result);
    if (this.db.bleIngestionLog.length > MAX_BLE_LOG) {
      this.db.bleIngestionLog.length = MAX_BLE_LOG;
    }

    if (result.accepted && result.reading) {
      const reading = result.reading;
      this.db.lastMeasuredByChannel[reading.channelId] = reading;

      // Construct a measured tick snapshot preserving real readings per channel
      // without silently overwriting missing measured channels with simulated values.
      const prevLatest = this.db.history[this.db.history.length - 1];
      const channels = {} as Record<ChannelId, SensorReading>;
      let measuredTotal = 0;
      let validCount = 0;

      (['ch1', 'ch2', 'ch3'] as ChannelId[]).forEach((chId) => {
        if (chId === reading.channelId) {
          channels[chId] = reading;
        } else if (this.db.lastMeasuredByChannel[chId]) {
          const cached = this.db.lastMeasuredByChannel[chId]!;
          channels[chId] = cached;
        } else if (
          this.db.simulationState.mode === 'simulation' &&
          prevLatest?.channels[chId]
        ) {
          // If still in hybrid demo, keep previous channel state tagged with its original sourceType
          channels[chId] = prevLatest.channels[chId];
        } else {
          channels[chId] = {
            readingId: `missing-${chId}-${nowMs}`,
            tickId,
            channelId: chId,
            voltage: null,
            current: null,
            power: null,
            timestamp: nowIso,
            sourceType: 'measured',
            loadState: this.db.simulationState.loadStates[chId],
            status: 'Missing',
            isValid: false,
            isStale: false,
            validationNote: 'Awaiting measured BLE packet for this channel.',
          };
        }

        const c = channels[chId];
        if (c.isValid && !c.isStale && c.power !== null) {
          if (c.sourceType === 'measured') measuredTotal += c.power;
          validCount += 1;
        }
      });

      const simulatedTotal = (['ch1', 'ch2', 'ch3'] as ChannelId[]).reduce((sum, chId) => {
        const c = channels[chId];
        if (c.sourceType === 'simulated' && c.isValid && !c.isStale && c.power !== null) {
          return sum + c.power;
        }
        return sum;
      }, 0);

      const totalPowerW = Number((measuredTotal + simulatedTotal).toFixed(3));
      const newTick: TickSnapshot = {
        tickId,
        timestamp: nowIso,
        sourceType: measuredTotal > 0 && simulatedTotal === 0 ? 'measured' : 'measured',
        channels,
        totalPowerW,
        measuredOnlyPowerW: Number(measuredTotal.toFixed(3)),
        simulatedOnlyPowerW: Number(simulatedTotal.toFixed(3)),
        validChannelCount: validCount,
        isSimulatedGridDisturbance: false,
      };

      this.recordNewTick(newTick, nowIso);
      this.pushEvent({
        eventId: `evt-ble-ok-${nowMs}`,
        eventType: 'ble_packet_ingested',
        affectedChannel: reading.channelId,
        description: `Measured BLE packet accepted from ${result.gatewayId} on ${reading.channelId}: ${reading.voltage} V × ${reading.current} A = ${reading.power} W.`,
        timestamp: nowIso,
        simulatedStatus: false,
        sourceType: 'measured',
      });
    } else {
      this.pushEvent({
        eventId: `evt-ble-err-${nowMs}`,
        eventType: 'ble_packet_rejected',
        affectedChannel: payload.channelId ?? 'system',
        description: `Rejected BLE packet from ${result.gatewayId}: ${result.error}`,
        timestamp: nowIso,
        simulatedStatus: false,
        sourceType: 'measured',
      });
    }

    this.persistToDisk();
    return { result, snapshot: this.getSnapshot() };
  }

  public updateSettings(partial: Partial<SystemSettings>): FacilityStateSnapshot {
    const nowIso = new Date().toISOString();
    const next: SystemSettings = {
      ...this.db.settings,
      ...partial,
      simulationIntervalMs: Math.max(
        1000,
        Math.min(60000, Number(partial.simulationIntervalMs ?? this.db.settings.simulationIntervalMs))
      ),
      forecastHorizonMinutes: Math.max(
        1,
        Math.min(30, Number(partial.forecastHorizonMinutes ?? this.db.settings.forecastHorizonMinutes))
      ),
      dataFreshnessThresholdSec: Math.max(
        5,
        Math.min(300, Number(partial.dataFreshnessThresholdSec ?? this.db.settings.dataFreshnessThresholdSec))
      ),
      chartWindowPoints: Math.max(
        15,
        Math.min(200, Number(partial.chartWindowPoints ?? this.db.settings.chartWindowPoints))
      ),
    };

    this.db.settings = next;
    // Recompute latest forecast with updated horizon
    const updatedForecast = generateDemandForecast(
      this.db.history,
      next.forecastHorizonMinutes,
      nowIso
    );
    this.db.forecastHistory.unshift(updatedForecast);
    if (this.db.forecastHistory.length > MAX_FORECAST_HISTORY) {
      this.db.forecastHistory.length = MAX_FORECAST_HISTORY;
    }

    this.pushEvent({
      eventId: `evt-settings-${Date.now()}`,
      eventType: 'settings_updated',
      affectedChannel: 'system',
      description: `System settings updated: interval ${next.simulationIntervalMs}ms, forecast horizon ${next.forecastHorizonMinutes}m, freshness threshold ${next.dataFreshnessThresholdSec}s.`,
      timestamp: nowIso,
      simulatedStatus: false,
      sourceType: this.db.simulationState.mode === 'simulation' ? 'simulated' : 'measured',
    });

    this.persistToDisk();
    return this.getSnapshot();
  }
}
