import { CHANNEL_DEFINITIONS } from './simulation';
import type {
  AnomalyRecord,
  BaselineChannelComparison,
  BaselineComparison,
  BaselineMetrics,
  ChannelId,
  DataSourceType,
  ForecastRecord,
  HistoricalSummary,
  LoadState,
  SeverityLevel,
  TickSnapshot,
  TotalPowerSummary,
} from './types';

export const MIN_FORECAST_SAMPLES = 24;
export const RIDGE_MODEL_VERSION = 'RidgeReg-Window6-v1.0';

export function buildStateSignature(loadStates: Record<ChannelId, LoadState>): string {
  return `ch1:${loadStates.ch1}|ch2:${loadStates.ch2}|ch3:${loadStates.ch3}`;
}

export function computeTotalPowerSummary(
  latestTick: TickSnapshot,
  previousTick?: TickSnapshot
): TotalPowerSummary {
  const validReadings = (['ch1', 'ch2', 'ch3'] as ChannelId[])
    .map((id) => latestTick.channels[id])
    .filter((r) => r.isValid && !r.isStale && r.power !== null);

  let measuredTotalW = 0;
  let simulatedTotalW = 0;
  let hasMeasured = false;
  let hasSimulated = false;

  for (const reading of validReadings) {
    if (reading.sourceType === 'measured') {
      measuredTotalW += reading.power ?? 0;
      hasMeasured = true;
    } else {
      simulatedTotalW += reading.power ?? 0;
      hasSimulated = true;
    }
  }

  // Strictly sum valid readings; do not include invalid/missing channels
  const currentTotalW = Number((measuredTotalW + simulatedTotalW).toFixed(2));
  const previousTotalW = previousTick ? Number(previousTick.totalPowerW.toFixed(2)) : currentTotalW;
  const deltaW = Number((currentTotalW - previousTotalW).toFixed(2));
  const percentChange =
    previousTotalW > 0.05 ? Number(((deltaW / previousTotalW) * 100).toFixed(2)) : 0;

  let sourceType: TotalPowerSummary['sourceType'] = 'none';
  if (hasMeasured && hasSimulated) sourceType = 'mixed';
  else if (hasMeasured) sourceType = 'measured';
  else if (hasSimulated) sourceType = 'simulated';

  let status: TotalPowerSummary['status'] = 'Nominal';
  if (validReadings.length === 0) status = 'No Valid Readings';
  else if (validReadings.length < 3) status = 'Degraded Telemetry';
  else if (percentChange > 15) status = 'Elevated';
  else if (percentChange < -15) status = 'Reduced';

  return {
    currentTotalW,
    previousTotalW,
    deltaW,
    percentChange,
    status,
    sourceType,
    measuredTotalW: Number(measuredTotalW.toFixed(2)),
    simulatedTotalW: Number(simulatedTotalW.toFixed(2)),
    lastUpdated: latestTick.timestamp,
  };
}

function meanAndStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  if (values.length === 1) return { mean, std: 0.35 };
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return { mean, std: Math.max(Math.sqrt(variance), 0.25) };
}

/**
 * State-conditioned baseline learner:
 * Learns expected power distribution from non-disturbed historical ticks conditioned on
 * observed channel load states (ON/OFF). Never uses an arbitrary hardcoded total threshold.
 */
export function computeBaselineComparison(
  history: TickSnapshot[],
  latestTick: TickSnapshot
): BaselineComparison {
  const currentStates: Record<ChannelId, LoadState> = {
    ch1: latestTick.channels.ch1.loadState,
    ch2: latestTick.channels.ch2.loadState,
    ch3: latestTick.channels.ch3.loadState,
  };
  const stateSignature = buildStateSignature(currentStates);

  // Filter out ticks that were injected simulated grid disturbances or incomplete
  const cleanHistory = history.filter(
    (t) =>
      t.tickId !== latestTick.tickId &&
      !t.isSimulatedGridDisturbance &&
      t.validChannelCount === 3
  );

  // 1. Per-channel conditioned baseline learning
  const channelComparisons: BaselineChannelComparison[] = (
    ['ch1', 'ch2', 'ch3'] as ChannelId[]
  ).map((chId) => {
    const targetState = currentStates[chId];
    const actualReading = latestTick.channels[chId];
    const actualW =
      actualReading.isValid && !actualReading.isStale ? actualReading.power : null;

    const stateSamples = cleanHistory
      .map((t) => t.channels[chId])
      .filter(
        (r) =>
          r.loadState === targetState &&
          r.isValid &&
          !r.isStale &&
          r.power !== null &&
          r.status !== 'Anomaly'
      )
      .map((r) => r.power as number);

    let expectedW = 0;
    let stdDevW = 0.35;
    let confidenceLabel: BaselineChannelComparison['confidenceLabel'] = 'Learned';

    if (stateSamples.length >= 3) {
      const stats = meanAndStd(stateSamples);
      expectedW = stats.mean;
      stdDevW = stats.std;
    } else if (targetState === 'OFF') {
      expectedW = 0;
      stdDevW = 0.15;
      confidenceLabel = stateSamples.length > 0 ? 'Learned' : 'Insufficient History';
    } else {
      confidenceLabel = 'Insufficient History';
      const fallbackAll = cleanHistory
        .map((t) => t.channels[chId].power)
        .filter((p): p is number => p !== null);
      if (fallbackAll.length > 0) {
        const stats = meanAndStd(fallbackAll);
        expectedW = stats.mean;
        stdDevW = stats.std;
      }
    }

    expectedW = Number(expectedW.toFixed(2));
    stdDevW = Number(stdDevW.toFixed(2));

    const deltaW =
      actualW !== null ? Number((actualW - expectedW).toFixed(2)) : null;
    const percentDiff =
      actualW !== null && expectedW > 0.2
        ? Number((((actualW - expectedW) / expectedW) * 100).toFixed(1))
        : actualW !== null && expectedW <= 0.2
          ? Number((actualW * 100).toFixed(1))
          : null;

    const toleranceW = Math.max(stdDevW * 3, 1.2);
    const withinExpected =
      deltaW !== null ? Math.abs(deltaW) <= toleranceW : false;

    return {
      channelId: chId,
      channelName: CHANNEL_DEFINITIONS[chId].name,
      loadState: targetState,
      actualW,
      expectedW,
      stdDevW,
      deltaW,
      percentDiff,
      sampleCount: stateSamples.length,
      withinExpected,
      confidenceLabel,
    };
  });

  // 2. Joint state-signature baseline learning
  const matchingJointTicks = cleanHistory.filter((t) => {
    const sig = buildStateSignature({
      ch1: t.channels.ch1.loadState,
      ch2: t.channels.ch2.loadState,
      ch3: t.channels.ch3.loadState,
    });
    return sig === stateSignature;
  });

  let expectedTotalW = 0;
  let expectedStdDevW = 0.6;
  let sampleCount = matchingJointTicks.length;
  let confidenceLabel: BaselineComparison['confidenceLabel'] = 'Learned';

  if (matchingJointTicks.length >= 4) {
    const stats = meanAndStd(matchingJointTicks.map((t) => t.totalPowerW));
    expectedTotalW = stats.mean;
    expectedStdDevW = stats.std;
  } else {
    // Sum learned per-channel expectations when exact 3-channel combination is unseen
    expectedTotalW = channelComparisons.reduce((acc, c) => acc + c.expectedW, 0);
    expectedStdDevW = Math.sqrt(
      channelComparisons.reduce((acc, c) => acc + c.stdDevW ** 2, 0)
    );
    sampleCount = Math.min(...channelComparisons.map((c) => c.sampleCount));
    confidenceLabel =
      sampleCount >= 3 ? 'Per-Channel Fallback' : 'Insufficient History';
  }

  expectedTotalW = Number(expectedTotalW.toFixed(2));
  expectedStdDevW = Number(Math.max(expectedStdDevW, 0.4).toFixed(2));

  const actualTotalW = Number(latestTick.totalPowerW.toFixed(2));
  const deltaW = Number((actualTotalW - expectedTotalW).toFixed(2));
  const percentDiff =
    expectedTotalW > 0.25
      ? Number(((deltaW / expectedTotalW) * 100).toFixed(1))
      : Number((deltaW * 100).toFixed(1));

  const totalToleranceW = Math.max(expectedStdDevW * 3, 2.2);
  const withinExpected =
    latestTick.validChannelCount === 3 && Math.abs(deltaW) <= totalToleranceW;

  return {
    stateSignature,
    actualTotalW,
    expectedTotalW,
    expectedStdDevW,
    deltaW,
    percentDiff,
    withinExpected,
    sampleCount,
    confidenceLabel,
    channels: channelComparisons,
  };
}

/**
 * Solves A * x = b via Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(matrixA: number[][], vectorB: number[]): number[] | null {
  const n = vectorB.length;
  const A = matrixA.map((row) => [...row]);
  const b = [...vectorB];

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    if (Math.abs(A[i][i]) < 1e-10) {
      return null;
    }

    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
      b[k] -= factor * b[i];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * x[j];
    }
    x[i] = sum / A[i][i];
  }

  return x;
}

function standardizeFeatures(
  XTrain: number[][]
): { means: number[]; stds: number[]; scaledTrain: number[][] } {
  const n = XTrain.length;
  const p = XTrain[0].length;
  const means = new Array(p).fill(0);
  const stds = new Array(p).fill(1);

  // Leave last column (bias = 1) unscaled
  for (let j = 0; j < p - 1; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += XTrain[i][j];
    means[j] = sum / n;

    let sq = 0;
    for (let i = 0; i < n; i++) sq += (XTrain[i][j] - means[j]) ** 2;
    stds[j] = Math.max(Math.sqrt(sq / Math.max(1, n - 1)), 1e-4);
  }

  const applyScale = (row: number[]) =>
    row.map((val, j) => (j === p - 1 ? 1 : (val - means[j]) / stds[j]));

  return {
    means,
    stds,
    scaledTrain: XTrain.map(applyScale),
  };
}

function applyFeatureScaling(
  row: number[],
  means: number[],
  stds: number[]
): number[] {
  const p = row.length;
  return row.map((val, j) => (j === p - 1 ? 1 : (val - means[j]) / stds[j]));
}

function fitRidgeRegression(
  features: number[][],
  targets: number[],
  lambda = 4.0
): number[] | null {
  if (features.length === 0) return null;
  const p = features[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);

  for (let i = 0; i < features.length; i++) {
    const row = features[i];
    const y = targets[i];
    for (let j = 0; j < p; j++) {
      Xty[j] += row[j] * y;
      for (let k = 0; k < p; k++) {
        XtX[j][k] += row[j] * row[k];
      }
    }
  }

  // Regularize all weights except intercept (last element)
  for (let j = 0; j < p - 1; j++) {
    XtX[j][j] += lambda;
  }
  XtX[p - 1][p - 1] += 1e-6;

  return solveLinearSystem(XtX, Xty);
}

function predictRow(weights: number[], row: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i] * row[i];
  }
  return Math.max(0, sum);
}

function computeErrorMetrics(
  actuals: number[],
  predictions: number[]
): BaselineMetrics {
  if (actuals.length === 0) return { mae: 0, rmse: 0 };
  let absSum = 0;
  let sqSum = 0;
  for (let i = 0; i < actuals.length; i++) {
    const err = actuals[i] - predictions[i];
    absSum += Math.abs(err);
    sqSum += err * err;
  }
  return {
    mae: Number((absSum / actuals.length).toFixed(3)),
    rmse: Number(Math.sqrt(sqSum / actuals.length).toFixed(3)),
  };
}

/**
 * Regularized Ridge Regression short-term demand forecaster.
 * - Uses standardized sliding time-window features (lagged power, rolling mean, slope, load states).
 * - Splits available sequence chronologically into training (70%) and held-out test (30%).
 * - Evaluates against Persistence and Moving-Average baselines.
 * - Gates output if sample history is insufficient (< MIN_FORECAST_SAMPLES).
 */
export function generateDemandForecast(
  history: TickSnapshot[],
  horizonMinutes: number,
  nowIso: string
): ForecastRecord {
  const validHistory = history.filter((t) => t.validChannelCount > 0);
  const latest = validHistory[validHistory.length - 1];
  const currentDemandW = latest ? Number(latest.totalPowerW.toFixed(2)) : 0;
  const sourceType: DataSourceType = latest?.sourceType ?? 'simulated';

  // Map horizon minutes cleanly into discrete sequence lookahead steps
  const horizonSteps = Math.max(1, Math.min(4, Math.ceil(horizonMinutes / 2)));

  if (validHistory.length < MIN_FORECAST_SAMPLES) {
    return {
      forecastId: `fc-${Date.parse(nowIso)}`,
      timestamp: nowIso,
      horizonMinutes,
      currentDemandW,
      predictedDemandW: null,
      lowerBoundW: null,
      upperBoundW: null,
      trend: 'Insufficient Data',
      confidencePercent: null,
      isReliable: false,
      statusMessage: `Insufficient historical readings (${validHistory.length}/${MIN_FORECAST_SAMPLES} samples required to train and evaluate Ridge Regression).`,
      modelVersion: RIDGE_MODEL_VERSION,
      trainingSamples: validHistory.length,
      testSamples: 0,
      ridgeMetrics: null,
      persistenceMetrics: null,
      movingAverageMetrics: null,
      featureWeights: [],
      sourceType,
    };
  }

  const windowSize = 4;
  const X: number[][] = [];
  const y: number[] = [];
  const persistenceEval: number[] = [];
  const maEval: number[] = [];

  for (let t = windowSize - 1; t < validHistory.length - horizonSteps; t++) {
    const curr = validHistory[t];
    const w0 = validHistory[t].totalPowerW;
    const w1 = validHistory[t - 1].totalPowerW;
    const w2 = validHistory[t - 2].totalPowerW;
    const w3 = validHistory[t - 3].totalPowerW;
    const rollingMean = (w0 + w1 + w2 + w3) / 4;
    const slope = (w0 - w3) / 3;

    // Stationary autoregressive features relative to local window
    X.push([
      w0 - rollingMean,
      w0 - w1,
      w1 - w2,
      slope,
      1, // bias
    ]);
    y.push(validHistory[t + horizonSteps].totalPowerW);
    persistenceEval.push(curr.totalPowerW);
    maEval.push(rollingMean);
  }

  if (X.length < 10) {
    return {
      forecastId: `fc-${Date.parse(nowIso)}`,
      timestamp: nowIso,
      horizonMinutes,
      currentDemandW,
      predictedDemandW: null,
      lowerBoundW: null,
      upperBoundW: null,
      trend: 'Insufficient Data',
      confidencePercent: null,
      isReliable: false,
      statusMessage: `Insufficient training windows (${X.length}/10 minimum) for ${horizonMinutes}m horizon.`,
      modelVersion: RIDGE_MODEL_VERSION,
      trainingSamples: X.length,
      testSamples: 0,
      ridgeMetrics: null,
      persistenceMetrics: null,
      movingAverageMetrics: null,
      featureWeights: [],
      sourceType,
    };
  }

  const splitIndex = Math.max(8, Math.floor(X.length * 0.7));
  const XTrainRaw = X.slice(0, splitIndex);
  const yTrainRaw = y.slice(0, splitIndex);
  const XTestRaw = X.slice(splitIndex);
  const yTest = y.slice(splitIndex);
  const persistenceTest = persistenceEval.slice(splitIndex);
  const maTest = maEval.slice(splitIndex);

  // Predict residual delta (y(t+h) - y(t)) anchored to current demand
  const yTrainDelta = yTrainRaw.map((target, idx) => target - persistenceEval[idx]);

  const { means, stds, scaledTrain } = standardizeFeatures(XTrainRaw);
  const scaledTest = XTestRaw.map((row) => applyFeatureScaling(row, means, stds));

  const weights = fitRidgeRegression(scaledTrain, yTrainDelta, 15.0);
  if (!weights) {
    return {
      forecastId: `fc-${Date.parse(nowIso)}`,
      timestamp: nowIso,
      horizonMinutes,
      currentDemandW,
      predictedDemandW: null,
      lowerBoundW: null,
      upperBoundW: null,
      trend: 'Insufficient Data',
      confidencePercent: null,
      isReliable: false,
      statusMessage: 'Model matrix ill-conditioned; waiting for additional variance in readings.',
      modelVersion: RIDGE_MODEL_VERSION,
      trainingSamples: XTrainRaw.length,
      testSamples: XTestRaw.length,
      ridgeMetrics: null,
      persistenceMetrics: null,
      movingAverageMetrics: null,
      featureWeights: [],
      sourceType,
    };
  }

  const ridgeTestPreds = scaledTest.map((row, idx) => {
    let delta = 0;
    for (let i = 0; i < weights.length; i++) delta += weights[i] * row[i];
    return Math.max(0, persistenceTest[idx] + delta);
  });
  const ridgeMetrics = computeErrorMetrics(yTest, ridgeTestPreds);
  const persistenceMetrics = computeErrorMetrics(yTest, persistenceTest);
  const movingAverageMetrics = computeErrorMetrics(yTest, maTest);

  // Predict next horizon from latest window
  const n = validHistory.length;
  const w0 = validHistory[n - 1].totalPowerW;
  const w1 = validHistory[n - 2].totalPowerW;
  const w2 = validHistory[n - 3].totalPowerW;
  const w3 = validHistory[n - 4].totalPowerW;
  const latestRollingMean = (w0 + w1 + w2 + w3) / 4;
  const latestSlope = (w0 - w3) / 3;
  const latestRowRaw = [
    w0 - latestRollingMean,
    w0 - w1,
    w1 - w2,
    latestSlope,
    1,
  ];
  const latestRowScaled = applyFeatureScaling(latestRowRaw, means, stds);

  // Allow negative predicted delta cleanly without clamping the delta at 0
  let rawDelta = 0;
  for (let i = 0; i < weights.length; i++) {
    rawDelta += weights[i] * latestRowScaled[i];
  }
  const predictedDemandW = Number(Math.max(0, w0 + rawDelta).toFixed(2));
  const intervalMargin = Math.max(ridgeMetrics.rmse * 1.96, 1.0);
  const lowerBoundW = Number(Math.max(0, predictedDemandW - intervalMargin).toFixed(2));
  const upperBoundW = Number((predictedDemandW + intervalMargin).toFixed(2));

  const deltaFromCurrent = predictedDemandW - currentDemandW;
  const trend: ForecastRecord['trend'] =
    deltaFromCurrent > 0.9
      ? 'Increasing'
      : deltaFromCurrent < -0.9
        ? 'Decreasing'
        : 'Stable';

  // Confidence derived strictly from normalized held-out RMSE relative to mean demand
  const meanDemand = Math.max(
    yTest.reduce((acc, v) => acc + v, 0) / Math.max(1, yTest.length),
    5
  );
  const normalizedError = ridgeMetrics.rmse / meanDemand;
  const confidencePercent = Number(
    Math.max(25, Math.min(98, (1 - normalizedError) * 100)).toFixed(1)
  );
  const isReliable = confidencePercent >= 55 && XTestRaw.length >= 3;

  return {
    forecastId: `fc-${Date.parse(nowIso)}`,
    timestamp: nowIso,
    horizonMinutes,
    currentDemandW,
    predictedDemandW,
    lowerBoundW,
    upperBoundW,
    trend,
    confidencePercent,
    isReliable,
    statusMessage: isReliable
      ? `Trained on ${XTrainRaw.length} standardized windows; evaluated on ${XTestRaw.length} held-out sequences.`
      : `Low forecast reliability (${confidencePercent}%): volatile recent demand increases held-out RMSE.`,
    modelVersion: RIDGE_MODEL_VERSION,
    trainingSamples: XTrainRaw.length,
    testSamples: XTestRaw.length,
    ridgeMetrics,
    persistenceMetrics,
    movingAverageMetrics,
    featureWeights: weights.map((w) => Number(w.toFixed(4))),
    sourceType,
  };
}

/**
 * Reproducible anomaly scoring based on state-conditioned baseline deviations,
 * load-state mismatches, missing readings, and stale BLE timestamps.
 */
export function detectAnomalies(
  latestTick: TickSnapshot,
  baseline: BaselineComparison,
  sensitivity: 'standard' | 'strict' | 'relaxed' = 'standard'
): AnomalyRecord[] {
  const anomalies: AnomalyRecord[] = [];
  const zThreshold =
    sensitivity === 'strict' ? 2.4 : sensitivity === 'relaxed' ? 3.8 : 3.0;

  for (const chComp of baseline.channels) {
    const reading = latestTick.channels[chComp.channelId];
    const isSimulatedTrigger =
      latestTick.sourceType === 'simulated' &&
      (latestTick.isSimulatedGridDisturbance ||
        reading.status === 'Missing' ||
        reading.status === 'Stale' ||
        reading.status === 'Anomaly');

    if (reading.status === 'Missing' || reading.power === null) {
      anomalies.push({
        anomalyId: `anom-${reading.readingId}-missing`,
        channelId: chComp.channelId,
        channelName: chComp.channelName,
        anomalyScore: 88,
        zScore: 0,
        severity: 'high',
        type: 'Missing Reading',
        explanation: `${chComp.channelName} failed to report a valid telemetry sample at ${reading.timestamp}. No synthetic value was substituted.`,
        observedW: null,
        expectedW: chComp.expectedW,
        timestamp: latestTick.timestamp,
        dataSource: reading.sourceType,
        isSimulatedTrigger,
      });
      continue;
    }

    if (reading.isStale) {
      anomalies.push({
        anomalyId: `anom-${reading.readingId}-stale`,
        channelId: chComp.channelId,
        channelName: chComp.channelName,
        anomalyScore: 76,
        zScore: 0,
        severity: 'medium',
        type: 'Stale BLE Telemetry',
        explanation: `${chComp.channelName} timestamp (${reading.timestamp}) exceeds the configured freshness threshold. Last observed power: ${reading.power.toFixed(2)} W.`,
        observedW: reading.power,
        expectedW: chComp.expectedW,
        timestamp: latestTick.timestamp,
        dataSource: reading.sourceType,
        isSimulatedTrigger,
      });
      continue;
    }

    // Check ON/OFF state mismatch
    if (reading.loadState === 'OFF' && reading.power > 1.2) {
      anomalies.push({
        anomalyId: `anom-${reading.readingId}-mismatch`,
        channelId: chComp.channelId,
        channelName: chComp.channelName,
        anomalyScore: 84,
        zScore: 5.5,
        severity: 'high',
        type: 'State Mismatch',
        explanation: `${chComp.channelName} load state is OFF, yet observed draw is ${reading.power.toFixed(2)} W (${reading.current?.toFixed(2)} A @ ${reading.voltage?.toFixed(2)} V).`,
        observedW: reading.power,
        expectedW: 0,
        timestamp: latestTick.timestamp,
        dataSource: reading.sourceType,
        isSimulatedTrigger,
      });
      continue;
    }

    // Check z-score deviation against learned conditioned baseline
    const sigma = Math.max(chComp.stdDevW, 0.45);
    const diff = reading.power - chComp.expectedW;
    const zScore = Number((Math.abs(diff) / sigma).toFixed(2));

    if (zScore >= zThreshold && Math.abs(diff) >= 1.5) {
      const score = Math.min(99, Math.round(45 + zScore * 9));
      const severity: SeverityLevel =
        score >= 90 ? 'critical' : score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low';
      const type = diff > 0 ? 'Power Surge' : 'Power Drop';

      anomalies.push({
        anomalyId: `anom-${reading.readingId}`,
        channelId: chComp.channelId,
        channelName: chComp.channelName,
        anomalyScore: score,
        zScore,
        severity,
        type,
        explanation: `${chComp.channelName} observed ${reading.power.toFixed(2)} W vs. learned ${reading.loadState}-state baseline of ${chComp.expectedW.toFixed(2)} W (${diff > 0 ? '+' : ''}${diff.toFixed(2)} W, z = ${zScore.toFixed(2)}).`,
        observedW: reading.power,
        expectedW: chComp.expectedW,
        timestamp: latestTick.timestamp,
        dataSource: reading.sourceType,
        isSimulatedTrigger,
      });
    }
  }

  return anomalies;
}

export function computeHistoricalSummary(
  history: TickSnapshot[],
  anomalyHistory: AnomalyRecord[]
): HistoricalSummary {
  if (history.length === 0) {
    return {
      totalReadings: 0,
      measuredReadings: 0,
      simulatedReadings: 0,
      averagePowerW: 0,
      peakPowerW: 0,
      minPowerW: 0,
      channelAverages: { ch1: 0, ch2: 0, ch3: 0 },
      channelPeaks: { ch1: 0, ch2: 0, ch3: 0 },
      anomalyCount: anomalyHistory.length,
    };
  }

  let totalSum = 0;
  let peakPowerW = -Infinity;
  let minPowerW = Infinity;
  let measuredReadings = 0;
  let simulatedReadings = 0;

  const chSums: Record<ChannelId, number> = { ch1: 0, ch2: 0, ch3: 0 };
  const chCounts: Record<ChannelId, number> = { ch1: 0, ch2: 0, ch3: 0 };
  const chPeaks: Record<ChannelId, number> = { ch1: 0, ch2: 0, ch3: 0 };

  for (const tick of history) {
    totalSum += tick.totalPowerW;
    if (tick.totalPowerW > peakPowerW) peakPowerW = tick.totalPowerW;
    if (tick.totalPowerW < minPowerW) minPowerW = tick.totalPowerW;

    (['ch1', 'ch2', 'ch3'] as ChannelId[]).forEach((chId) => {
      const r = tick.channels[chId];
      if (r.sourceType === 'measured') measuredReadings += 1;
      else simulatedReadings += 1;

      if (r.power !== null && r.isValid && !r.isStale) {
        chSums[chId] += r.power;
        chCounts[chId] += 1;
        if (r.power > chPeaks[chId]) chPeaks[chId] = r.power;
      }
    });
  }

  return {
    totalReadings: history.length * 3,
    measuredReadings,
    simulatedReadings,
    averagePowerW: Number((totalSum / history.length).toFixed(2)),
    peakPowerW: Number((peakPowerW === -Infinity ? 0 : peakPowerW).toFixed(2)),
    minPowerW: Number((minPowerW === Infinity ? 0 : minPowerW).toFixed(2)),
    channelAverages: {
      ch1: Number((chCounts.ch1 ? chSums.ch1 / chCounts.ch1 : 0).toFixed(2)),
      ch2: Number((chCounts.ch2 ? chSums.ch2 / chCounts.ch2 : 0).toFixed(2)),
      ch3: Number((chCounts.ch3 ? chSums.ch3 / chCounts.ch3 : 0).toFixed(2)),
    },
    channelPeaks: {
      ch1: Number(chPeaks.ch1.toFixed(2)),
      ch2: Number(chPeaks.ch2.toFixed(2)),
      ch3: Number(chPeaks.ch3.toFixed(2)),
    },
    anomalyCount: anomalyHistory.length,
  };
}
