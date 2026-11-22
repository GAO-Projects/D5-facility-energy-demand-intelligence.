import { calculatePowerWatts } from './bleDecoder';
import type {
  ChannelDefinition,
  ChannelId,
  ChannelStatus,
  LoadState,
  SensorReading,
  SimulationState,
  TickSnapshot,
} from './types';

export const CHANNEL_DEFINITIONS: Record<ChannelId, ChannelDefinition> = {
  ch1: {
    id: 'ch1',
    name: 'LED Demonstration Load',
    shortName: 'LED Load',
    nominalVoltage: 12.02,
    nominalCurrent: 1.24,
    description: '12V DC solid-state LED luminaire strip demonstration channel.',
  },
  ch2: {
    id: 'ch2',
    name: 'Fan Demonstration Load 1',
    shortName: 'Fan Load 1',
    nominalVoltage: 12.0,
    nominalCurrent: 0.86,
    description: '12V DC brushless axial ventilation fan unit #1.',
  },
  ch3: {
    id: 'ch3',
    name: 'Fan Demonstration Load 2',
    shortName: 'Fan Load 2',
    nominalVoltage: 11.98,
    nominalCurrent: 0.94,
    description: '12V DC brushless axial ventilation fan unit #2.',
  },
};

/**
 * Deterministic smooth pseudo-noise helper so simulated channels exhibit realistic
 * correlated electrical drift rather than uniform white noise.
 */
function smoothWave(step: number, phase: number, amplitude: number): number {
  const slow = Math.sin(step * 0.19 + phase);
  const medium = Math.cos(step * 0.47 + phase * 1.7) * 0.55;
  const micro = Math.sin(step * 1.13 + phase * 0.4) * 0.25;
  return ((slow + medium + micro) / 1.8) * amplitude;
}

export function createInitialSimulationState(): SimulationState {
  return {
    isRunning: true,
    mode: 'simulation',
    loadStates: {
      ch1: 'ON',
      ch2: 'ON',
      ch3: 'ON',
    },
    activeDisturbance: {
      type: 'none',
      targetChannel: 'all',
      magnitudeFactor: 1,
      activatedAt: null,
    },
    tickCounter: 64,
  };
}

export function generateSimulatedTick(
  state: SimulationState,
  timestampIso: string,
  freshnessThresholdSec: number,
  stepOverride?: number
): TickSnapshot {
  const step = stepOverride ?? state.tickCounter;
  const tickId = `sim-tick-${step}-${Date.parse(timestampIso)}`;
  const activeCount = (['ch1', 'ch2', 'ch3'] as ChannelId[]).filter(
    (id) => state.loadStates[id] === 'ON'
  ).length;

  // Shared bus voltage slightly droops under higher simultaneous load
  const busVoltageOffset = -0.04 * activeCount + smoothWave(step, 0.3, 0.08);

  const channels = {} as Record<ChannelId, SensorReading>;
  let totalPowerW = 0;
  let validChannelCount = 0;

  (['ch1', 'ch2', 'ch3'] as ChannelId[]).forEach((chId, index) => {
    const def = CHANNEL_DEFINITIONS[chId];
    const loadState: LoadState = state.loadStates[chId];
    const disturbance = state.activeDisturbance;
    const isTargeted =
      disturbance.targetChannel === 'all' || disturbance.targetChannel === chId;

    // Missing data simulation
    if (disturbance.type === 'missing_data' && isTargeted) {
      channels[chId] = {
        readingId: `sim-${chId}-${step}`,
        tickId,
        channelId: chId,
        voltage: null,
        current: null,
        power: null,
        timestamp: timestampIso,
        sourceType: 'simulated',
        loadState,
        status: 'Missing',
        isValid: false,
        isStale: false,
        validationNote: 'Simulated missing telemetry packet (no value fabricated).',
      };
      return;
    }

    // Stale BLE data simulation (freeze timestamp back beyond freshness threshold)
    let effectiveTimestamp = timestampIso;
    let isStale = false;
    if (disturbance.type === 'stale_ble' && isTargeted) {
      const staleAgeMs = (freshnessThresholdSec + 25) * 1000;
      effectiveTimestamp = new Date(Date.parse(timestampIso) - staleAgeMs).toISOString();
      isStale = true;
    }

    const voltage = Number((def.nominalVoltage + busVoltageOffset + index * 0.015).toFixed(3));
    let current =
      loadState === 'ON'
        ? def.nominalCurrent + smoothWave(step, index * 2.1 + 0.7, 0.045)
        : 0.0;

    let status: ChannelStatus = loadState === 'ON' ? 'Nominal' : 'Standby';
    let note = 'Simulated baseline operation.';

    if (isTargeted && disturbance.type !== 'none') {
      if (disturbance.type === 'demand_increase') {
        const multiplier = disturbance.magnitudeFactor || 1.38;
        current = loadState === 'ON' ? current * multiplier : 0.42;
        status = 'Elevated';
        note = `Simulated demand increase event (×${multiplier.toFixed(2)}).`;
      } else if (disturbance.type === 'demand_decrease') {
        const multiplier = disturbance.magnitudeFactor || 0.56;
        current = loadState === 'ON' ? current * multiplier : 0;
        status = loadState === 'ON' ? 'Low Draw' : 'Standby';
        note = `Simulated demand decrease event (×${multiplier.toFixed(2)}).`;
      } else if (disturbance.type === 'anomaly') {
        // Channel-specific realistic abnormal behavior:
        // e.g., stalled fan overcurrent or LED driver surge
        const spike = chId === 'ch2' ? 2.15 : chId === 'ch1' ? 1.85 : 1.78;
        current = loadState === 'ON' ? current * spike : 0.95;
        status = 'Anomaly';
        note = 'Simulated abnormal load draw / fault event.';
      }
    }

    current = Number(Math.max(0, current).toFixed(3));
    const power = calculatePowerWatts(voltage, current);

    if (isStale) {
      status = 'Stale';
      note = `Simulated stale BLE reading (${freshnessThresholdSec + 25}s old).`;
    } else {
      totalPowerW += power;
      validChannelCount += 1;
    }

    channels[chId] = {
      readingId: `sim-${chId}-${step}`,
      tickId,
      channelId: chId,
      voltage,
      current,
      power,
      timestamp: effectiveTimestamp,
      sourceType: 'simulated',
      loadState,
      status,
      isValid: !isStale,
      isStale,
      validationNote: note,
    };
  });

  totalPowerW = Number(totalPowerW.toFixed(3));
  const isSimulatedGridDisturbance =
    state.activeDisturbance.type === 'demand_increase' ||
    state.activeDisturbance.type === 'demand_decrease' ||
    state.activeDisturbance.type === 'anomaly';

  return {
    tickId,
    timestamp: timestampIso,
    sourceType: 'simulated',
    channels,
    totalPowerW,
    measuredOnlyPowerW: 0,
    simulatedOnlyPowerW: totalPowerW,
    validChannelCount,
    isSimulatedGridDisturbance,
  };
}

/**
 * Generates an initial deterministic 48-sample historical sequence spanning the past
 * ~24 minutes (30s spacing) across realistic ON/OFF schedules so baseline learning
 * and Ridge Regression forecasting have authentic historical training data on first boot.
 */
export function generateSeedHistory(
  endTimeMs: number,
  freshnessThresholdSec: number,
  count = 64
): TickSnapshot[] {
  const ticks: TickSnapshot[] = [];
  const spacingMs = 30_000;

  for (let i = 0; i < count; i++) {
    const ts = new Date(endTimeMs - (count - 1 - i) * spacingMs).toISOString();
    // Realistic facility operational schedule across early/mid history,
    // settling into steady 3-channel active monitoring in recent samples
    const ch1On: LoadState = i >= 6 && i <= 9 ? 'OFF' : 'ON';
    const ch2On: LoadState = i >= 16 && i <= 19 ? 'OFF' : 'ON';
    const ch3On: LoadState = i >= 26 && i <= 29 ? 'OFF' : 'ON';

    const seedState: SimulationState = {
      isRunning: true,
      mode: 'simulation',
      loadStates: { ch1: ch1On, ch2: ch2On, ch3: ch3On },
      activeDisturbance: {
        type: 'none',
        targetChannel: 'all',
        magnitudeFactor: 1,
        activatedAt: null,
      },
      tickCounter: i,
    };

    ticks.push(generateSimulatedTick(seedState, ts, freshnessThresholdSec, i));
  }

  return ticks;
}
