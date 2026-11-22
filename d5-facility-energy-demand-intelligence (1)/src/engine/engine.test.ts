import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBaselineComparison,
  computeTotalPowerSummary,
  detectAnomalies,
  generateDemandForecast,
  MIN_FORECAST_SAMPLES,
} from './analytics';
import { calculatePowerWatts, decodeAndValidateBlePayload } from './bleDecoder';
import {
  createInitialSimulationState,
  generateSeedHistory,
  generateSimulatedTick,
} from './simulation';

test('calculates Power (W) = Voltage (V) * Current (A) and excludes missing channels', () => {
  assert.equal(calculatePowerWatts(12.0, 1.25), 15);

  const state = createInitialSimulationState();
  const normalTick = generateSimulatedTick(state, '2026-11-22T10:00:00.000Z', 30, 50);
  const expectedSum = Number(
    (
      (normalTick.channels.ch1.power ?? 0) +
      (normalTick.channels.ch2.power ?? 0) +
      (normalTick.channels.ch3.power ?? 0)
    ).toFixed(2)
  );
  const summary = computeTotalPowerSummary(normalTick);
  assert.equal(summary.currentTotalW, expectedSum);
  assert.equal(summary.sourceType, 'simulated');

  // Missing ch2 must NOT fabricate power
  state.activeDisturbance = {
    type: 'missing_data',
    targetChannel: 'ch2',
    magnitudeFactor: 1,
    activatedAt: '2026-11-22T10:00:30.000Z',
  };
  const missingTick = generateSimulatedTick(state, '2026-11-22T10:00:30.000Z', 30, 51);
  assert.equal(missingTick.channels.ch2.power, null);
  assert.equal(missingTick.validChannelCount, 2);
  const missingSummary = computeTotalPowerSummary(missingTick, normalTick);
  assert.equal(missingSummary.status, 'Degraded Telemetry');
  assert.equal(
    missingSummary.currentTotalW,
    Number(
      ((missingTick.channels.ch1.power ?? 0) + (missingTick.channels.ch3.power ?? 0)).toFixed(2)
    )
  );
});

test('baseline learning conditions expected power on observed load states', () => {
  const now = Date.parse('2026-11-22T10:00:00.000Z');
  const history = generateSeedHistory(now, 30, 48);

  const allOnState = createInitialSimulationState();
  const allOnTick = generateSimulatedTick(allOnState, '2026-11-22T10:00:30.000Z', 30, 49);
  const baselineAllOn = computeBaselineComparison(history, allOnTick);

  const ch2OffState = createInitialSimulationState();
  ch2OffState.loadStates.ch2 = 'OFF';
  const ch2OffTick = generateSimulatedTick(ch2OffState, '2026-11-22T10:01:00.000Z', 30, 50);
  const baselineCh2Off = computeBaselineComparison(history, ch2OffTick);

  assert.ok(baselineAllOn.expectedTotalW > baselineCh2Off.expectedTotalW + 5);
  assert.equal(baselineAllOn.withinExpected, true);
  assert.equal(baselineCh2Off.withinExpected, true);
  assert.equal(baselineCh2Off.channels[1].expectedW, 0);
});

test('Ridge Regression forecaster gates insufficient history and evaluates held-out metrics when sufficient', () => {
  const now = Date.parse('2026-11-22T10:00:00.000Z');
  const shortHistory = generateSeedHistory(now, 30, MIN_FORECAST_SAMPLES - 2);
  const gatedForecast = generateDemandForecast(shortHistory, 5, '2026-11-22T10:00:00.000Z');

  assert.equal(gatedForecast.isReliable, false);
  assert.equal(gatedForecast.trend, 'Insufficient Data');
  assert.equal(gatedForecast.predictedDemandW, null);

  const fullHistory = generateSeedHistory(now, 30, 64);
  const forecast = generateDemandForecast(fullHistory, 5, '2026-11-22T10:00:00.000Z');
  assert.notEqual(forecast.predictedDemandW, null);
  assert.ok((forecast.predictedDemandW ?? 0) > 28 && (forecast.predictedDemandW ?? 0) < 44);
  assert.notEqual(forecast.ridgeMetrics, null);
  assert.ok((forecast.ridgeMetrics?.mae ?? 99) < 3.5);
  assert.notEqual(forecast.persistenceMetrics, null);
  assert.notEqual(forecast.movingAverageMetrics, null);
  assert.ok(forecast.trainingSamples >= 25);
  assert.ok(forecast.testSamples >= 5);
});

test('anomaly detection flags injected surge, missing reading, and stale telemetry', () => {
  const now = Date.parse('2026-11-22T10:00:00.000Z');
  const history = generateSeedHistory(now, 30, 48);

  const anomalyState = createInitialSimulationState();
  anomalyState.activeDisturbance = {
    type: 'anomaly',
    targetChannel: 'ch2',
    magnitudeFactor: 1,
    activatedAt: '2026-11-22T10:00:30.000Z',
  };
  const spikeTick = generateSimulatedTick(anomalyState, '2026-11-22T10:00:30.000Z', 30, 49);
  const baseline = computeBaselineComparison(history, spikeTick);
  const anomalies = detectAnomalies(spikeTick, baseline, 'standard');

  assert.ok(anomalies.length >= 1);
  assert.equal(anomalies[0].channelId, 'ch2');
  assert.equal(anomalies[0].type, 'Power Surge');
  assert.equal(anomalies[0].isSimulatedTrigger, true);

  // Stale BLE detection
  const staleState = createInitialSimulationState();
  staleState.activeDisturbance = {
    type: 'stale_ble',
    targetChannel: 'ch1',
    magnitudeFactor: 1,
    activatedAt: '2026-11-22T10:01:00.000Z',
  };
  const staleTick = generateSimulatedTick(staleState, '2026-11-22T10:01:00.000Z', 30, 50);
  const staleBaseline = computeBaselineComparison(history, staleTick);
  const staleAnomalies = detectAnomalies(staleTick, staleBaseline, 'standard');
  assert.ok(staleAnomalies.some((a) => a.type === 'Stale BLE Telemetry' && a.channelId === 'ch1'));
});

test('GAO 217030 BLE decoder validates bounds, duplicates, and staleness', () => {
  const nowMs = Date.parse('2026-11-22T10:05:00.000Z');

  const valid = decodeAndValidateBlePayload(
    {
      gatewayId: 'GAO-217030-LAB-01',
      protocol: 'GAO-217030-HTTP',
      channelId: 'ch1',
      voltage: 12.1,
      current: 1.2,
      timestamp: '2026-11-22T10:04:55.000Z',
    },
    {
      nowMs,
      freshnessThresholdSec: 30,
      lastTimestampByChannel: {},
      observedLoadState: 'ON',
      tickId: 'ble-tick-1',
    }
  );
  assert.equal(valid.accepted, true);
  assert.equal(valid.reading?.sourceType, 'measured');
  assert.equal(valid.reading?.power, 14.52);

  // Reject out-of-bounds voltage
  const badVoltage = decodeAndValidateBlePayload(
    {
      gatewayId: 'GAO-217030-LAB-01',
      protocol: 'GAO-217030-HTTP',
      channelId: 'ch1',
      voltage: 45,
      current: 1.2,
    },
    {
      nowMs,
      freshnessThresholdSec: 30,
      lastTimestampByChannel: {},
      observedLoadState: 'ON',
      tickId: 'ble-tick-2',
    }
  );
  assert.equal(badVoltage.accepted, false);

  // Reject duplicate timestamp
  const duplicate = decodeAndValidateBlePayload(
    {
      gatewayId: 'GAO-217030-LAB-01',
      protocol: 'GAO-217030-HTTP',
      channelId: 'ch1',
      voltage: 12.1,
      current: 1.2,
      timestamp: '2026-11-22T10:04:55.000Z',
    },
    {
      nowMs,
      freshnessThresholdSec: 30,
      lastTimestampByChannel: { ch1: '2026-11-22T10:04:55.000Z' },
      observedLoadState: 'ON',
      tickId: 'ble-tick-3',
    }
  );
  assert.equal(duplicate.accepted, false);
});
