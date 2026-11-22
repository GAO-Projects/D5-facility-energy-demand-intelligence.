export type ChannelId = 'ch1' | 'ch2' | 'ch3';

export type DataSourceType = 'measured' | 'simulated';

export type LoadState = 'ON' | 'OFF';

export type ConnectionStatus =
  | 'Connected'
  | 'Disconnected'
  | 'Stale Data'
  | 'Simulation Mode';

export type ChannelStatus =
  | 'Nominal'
  | 'Elevated'
  | 'Low Draw'
  | 'Standby'
  | 'Anomaly'
  | 'Missing'
  | 'Stale';

export type DisturbanceType =
  | 'none'
  | 'demand_increase'
  | 'demand_decrease'
  | 'anomaly'
  | 'missing_data'
  | 'stale_ble';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ChannelDefinition {
  id: ChannelId;
  name: string;
  shortName: string;
  nominalVoltage: number;
  nominalCurrent: number;
  description: string;
}

export interface SensorReading {
  readingId: string;
  tickId: string;
  channelId: ChannelId;
  voltage: number | null; // V; null if missing
  current: number | null; // A; null if missing
  power: number | null; // W = V * A; null if missing
  timestamp: string; // ISO 8601
  sourceType: DataSourceType;
  loadState: LoadState;
  status: ChannelStatus;
  isValid: boolean;
  isStale: boolean;
  validationNote?: string;
}

export interface TickSnapshot {
  tickId: string;
  timestamp: string;
  sourceType: DataSourceType;
  channels: Record<ChannelId, SensorReading>;
  totalPowerW: number;
  measuredOnlyPowerW: number;
  simulatedOnlyPowerW: number;
  validChannelCount: number;
  isSimulatedGridDisturbance: boolean;
}

export interface TotalPowerSummary {
  currentTotalW: number;
  previousTotalW: number;
  deltaW: number;
  percentChange: number;
  status: 'Nominal' | 'Elevated' | 'Reduced' | 'Degraded Telemetry' | 'No Valid Readings';
  sourceType: DataSourceType | 'mixed' | 'none';
  measuredTotalW: number;
  simulatedTotalW: number;
  lastUpdated: string | null;
}

export interface BaselineChannelComparison {
  channelId: ChannelId;
  channelName: string;
  loadState: LoadState;
  actualW: number | null;
  expectedW: number;
  stdDevW: number;
  deltaW: number | null;
  percentDiff: number | null;
  sampleCount: number;
  withinExpected: boolean;
  confidenceLabel: 'Learned' | 'Per-Channel Fallback' | 'Insufficient History';
}

export interface BaselineComparison {
  stateSignature: string;
  actualTotalW: number;
  expectedTotalW: number;
  expectedStdDevW: number;
  deltaW: number;
  percentDiff: number;
  withinExpected: boolean;
  sampleCount: number;
  confidenceLabel: 'Learned' | 'Per-Channel Fallback' | 'Insufficient History';
  channels: BaselineChannelComparison[];
}

export interface BaselineMetrics {
  mae: number;
  rmse: number;
}

export interface ForecastRecord {
  forecastId: string;
  timestamp: string;
  horizonMinutes: number;
  currentDemandW: number;
  predictedDemandW: number | null;
  lowerBoundW: number | null;
  upperBoundW: number | null;
  trend: 'Increasing' | 'Decreasing' | 'Stable' | 'Insufficient Data';
  confidencePercent: number | null;
  isReliable: boolean;
  statusMessage: string;
  modelVersion: string;
  trainingSamples: number;
  testSamples: number;
  ridgeMetrics: BaselineMetrics | null;
  persistenceMetrics: BaselineMetrics | null;
  movingAverageMetrics: BaselineMetrics | null;
  featureWeights: number[];
  sourceType: DataSourceType;
}

export interface AnomalyRecord {
  anomalyId: string;
  channelId: ChannelId | 'system';
  channelName: string;
  anomalyScore: number; // 0-100
  zScore: number;
  severity: SeverityLevel;
  type:
    | 'Power Surge'
    | 'Power Drop'
    | 'State Mismatch'
    | 'Missing Reading'
    | 'Stale BLE Telemetry'
    | 'Nominal';
  explanation: string;
  observedW: number | null;
  expectedW: number | null;
  timestamp: string;
  dataSource: DataSourceType;
  isSimulatedTrigger: boolean;
}

export type SimulationEventType =
  | 'simulation_started'
  | 'simulation_paused'
  | 'simulation_reset'
  | 'manual_load_change'
  | 'demand_increase'
  | 'demand_decrease'
  | 'anomaly_injected'
  | 'missing_data_injected'
  | 'stale_ble_injected'
  | 'disturbance_cleared'
  | 'ble_packet_ingested'
  | 'ble_packet_rejected'
  | 'settings_updated';

export interface SimulationEvent {
  eventId: string;
  eventType: SimulationEventType;
  affectedChannel: ChannelId | 'all' | 'system';
  description: string;
  timestamp: string;
  simulatedStatus: boolean;
  sourceType: DataSourceType;
}

export interface SystemSettings {
  simulationIntervalMs: number;
  forecastHorizonMinutes: number;
  dataFreshnessThresholdSec: number;
  displayUnit: 'W' | 'kW';
  chartWindowPoints: number;
  anomalySensitivity: 'standard' | 'strict' | 'relaxed';
}

export interface SimulationState {
  isRunning: boolean;
  mode: 'simulation' | 'ble_gateway';
  loadStates: Record<ChannelId, LoadState>;
  activeDisturbance: {
    type: DisturbanceType;
    targetChannel: ChannelId | 'all';
    magnitudeFactor: number;
    activatedAt: string | null;
  };
  tickCounter: number;
}

export interface RawBleGatewayPayload {
  gatewayId: string;
  protocol: 'GAO-217030-HTTP' | 'GAO-217030-MQTT';
  nodeMac?: string;
  channelId: ChannelId;
  voltage: number;
  current: number;
  timestamp?: string;
  rssi?: number;
  sequenceNumber?: number;
}

export interface BleIngestionResult {
  accepted: boolean;
  reading?: SensorReading;
  error?: string;
  gatewayId: string;
  receivedAt: string;
}

export interface HistoricalSummary {
  totalReadings: number;
  measuredReadings: number;
  simulatedReadings: number;
  averagePowerW: number;
  peakPowerW: number;
  minPowerW: number;
  channelAverages: Record<ChannelId, number>;
  channelPeaks: Record<ChannelId, number>;
  anomalyCount: number;
}

export interface FacilityStateSnapshot {
  connectionStatus: ConnectionStatus;
  simulationState: SimulationState;
  settings: SystemSettings;
  latestTick: TickSnapshot;
  totalPower: TotalPowerSummary;
  baselineComparison: BaselineComparison;
  latestForecast: ForecastRecord;
  activeAnomalies: AnomalyRecord[];
  history: TickSnapshot[];
  forecastHistory: ForecastRecord[];
  anomalyHistory: AnomalyRecord[];
  eventLog: SimulationEvent[];
  bleIngestionLog: BleIngestionResult[];
  historicalSummary: HistoricalSummary;
  serverTime: string;
}
