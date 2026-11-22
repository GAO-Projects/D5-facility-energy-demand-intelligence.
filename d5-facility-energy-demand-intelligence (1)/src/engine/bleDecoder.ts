import type {
  BleIngestionResult,
  ChannelId,
  LoadState,
  RawBleGatewayPayload,
  SensorReading,
} from './types';

export const VALID_CHANNELS: readonly ChannelId[] = ['ch1', 'ch2', 'ch3'] as const;

export const VOLTAGE_BOUNDS = { min: 0, max: 30 } as const; // Low-voltage DC bench limits
export const CURRENT_BOUNDS = { min: 0, max: 10 } as const;

export function isValidChannelId(value: unknown): value is ChannelId {
  return value === 'ch1' || value === 'ch2' || value === 'ch3';
}

export function calculatePowerWatts(voltage: number, current: number): number {
  return Number((voltage * current).toFixed(3));
}

export function isTimestampStale(
  isoTimestamp: string,
  nowMs: number,
  freshnessThresholdSec: number
): boolean {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return true;
  const ageSeconds = (nowMs - parsed) / 1000;
  return ageSeconds > freshnessThresholdSec;
}

/**
 * Modular payload decoder & validator for the GAO 217030 BLE Gateway.
 * Strict rules:
 * - Rejects out-of-bounds voltage/current rather than clamping/fabricating.
 * - Rejects duplicate timestamps for the same channel.
 * - Flags stale telemetry without mutating the incoming timestamp.
 */
export function decodeAndValidateBlePayload(
  payload: Partial<RawBleGatewayPayload>,
  options: {
    nowMs: number;
    freshnessThresholdSec: number;
    lastTimestampByChannel: Partial<Record<ChannelId, string>>;
    observedLoadState: LoadState;
    tickId: string;
  }
): BleIngestionResult {
  const receivedAt = new Date(options.nowMs).toISOString();
  const gatewayId =
    typeof payload.gatewayId === 'string' && payload.gatewayId.trim().length > 0
      ? payload.gatewayId.trim()
      : 'GAO-217030-UNSPECIFIED';

  if (!isValidChannelId(payload.channelId)) {
    return {
      accepted: false,
      gatewayId,
      receivedAt,
      error: `Invalid channelId "${String(payload.channelId)}". Expected ch1, ch2, or ch3.`,
    };
  }

  if (
    typeof payload.voltage !== 'number' ||
    !Number.isFinite(payload.voltage) ||
    payload.voltage < VOLTAGE_BOUNDS.min ||
    payload.voltage > VOLTAGE_BOUNDS.max
  ) {
    return {
      accepted: false,
      gatewayId,
      receivedAt,
      error: `Invalid voltage reading (${String(payload.voltage)} V). Allowed range: ${VOLTAGE_BOUNDS.min}–${VOLTAGE_BOUNDS.max} V.`,
    };
  }

  if (
    typeof payload.current !== 'number' ||
    !Number.isFinite(payload.current) ||
    payload.current < CURRENT_BOUNDS.min ||
    payload.current > CURRENT_BOUNDS.max
  ) {
    return {
      accepted: false,
      gatewayId,
      receivedAt,
      error: `Invalid current reading (${String(payload.current)} A). Allowed range: ${CURRENT_BOUNDS.min}–${CURRENT_BOUNDS.max} A.`,
    };
  }

  const timestamp =
    typeof payload.timestamp === 'string' && !Number.isNaN(Date.parse(payload.timestamp))
      ? new Date(payload.timestamp).toISOString()
      : receivedAt;

  const prevTs = options.lastTimestampByChannel[payload.channelId];
  if (prevTs && prevTs === timestamp) {
    return {
      accepted: false,
      gatewayId,
      receivedAt,
      error: `Duplicate reading timestamp (${timestamp}) rejected for ${payload.channelId}.`,
    };
  }

  const stale = isTimestampStale(timestamp, options.nowMs, options.freshnessThresholdSec);
  const voltage = Number(payload.voltage.toFixed(3));
  const current = Number(payload.current.toFixed(3));
  const power = calculatePowerWatts(voltage, current);

  const reading: SensorReading = {
    readingId: `ble-${payload.channelId}-${options.nowMs}-${Math.random().toString(36).slice(2, 7)}`,
    tickId: options.tickId,
    channelId: payload.channelId,
    voltage,
    current,
    power,
    timestamp,
    sourceType: 'measured',
    loadState: options.observedLoadState,
    status: stale ? 'Stale' : power < 0.25 ? 'Standby' : 'Nominal',
    isValid: !stale,
    isStale: stale,
    validationNote: stale
      ? `BLE packet timestamp exceeds freshness threshold (${options.freshnessThresholdSec}s).`
      : `Decoded from ${payload.protocol ?? 'GAO-217030-HTTP'} (${gatewayId}).`,
  };

  return {
    accepted: true,
    gatewayId,
    receivedAt,
    reading,
  };
}
