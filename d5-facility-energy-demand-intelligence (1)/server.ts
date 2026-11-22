import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { FacilityStore } from './server/store';
import type { ChannelId, DisturbanceType, LoadState } from './src/engine/types';

const PORT = 3000;

function escapeCsv(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const store = new FacilityStore();

  // Dynamic background simulation loop synchronized with settings.simulationIntervalMs
  let simTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleNextTick = () => {
    if (simTimer) clearTimeout(simTimer);
    const snap = store.getSnapshot();
    const interval = snap.settings.simulationIntervalMs;
    simTimer = setTimeout(() => {
      try {
        const current = store.getSnapshot();
        if (
          current.simulationState.isRunning &&
          current.simulationState.mode === 'simulation'
        ) {
          store.tickSimulation();
        }
      } catch (err) {
        console.error('Simulation background tick error:', err);
      } finally {
        scheduleNextTick();
      }
    }, interval);
  };
  scheduleNextTick();

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, serverTime: new Date().toISOString() });
  });

  // Full facility snapshot
  app.get('/api/state', (_req, res) => {
    try {
      res.json(store.getSnapshot());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Simulation controls: start, pause, reset, tick, switch_mode
  app.post('/api/simulation/control', (req, res) => {
    try {
      const { action, mode } = req.body ?? {};
      if (!['start', 'pause', 'reset', 'tick', 'switch_mode'].includes(action)) {
        res.status(400).json({ error: 'Invalid simulation control action.' });
        return;
      }
      const snapshot = store.controlSimulation(action, mode);
      scheduleNextTick();
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Manual simulated load state (software-only; never physical actuation)
  app.post('/api/simulation/load-state', (req, res) => {
    try {
      const { channelId, loadState } = req.body ?? {};
      if (!['ch1', 'ch2', 'ch3'].includes(channelId)) {
        res.status(400).json({ error: 'Invalid channelId. Must be ch1, ch2, or ch3.' });
        return;
      }
      if (loadState !== 'ON' && loadState !== 'OFF') {
        res.status(400).json({ error: 'Invalid loadState. Must be ON or OFF.' });
        return;
      }
      const snapshot = store.setManualLoadState(
        channelId as ChannelId,
        loadState as LoadState
      );
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Simulation demand events / anomalies / missing data / stale BLE
  app.post('/api/simulation/event', (req, res) => {
    try {
      const { type, targetChannel = 'all', magnitudeFactor = 1.4 } = req.body ?? {};
      const validTypes: DisturbanceType[] = [
        'none',
        'demand_increase',
        'demand_decrease',
        'anomaly',
        'missing_data',
        'stale_ble',
      ];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: 'Invalid simulation disturbance type.' });
        return;
      }
      const snapshot = store.triggerDisturbance(
        type as DisturbanceType,
        targetChannel,
        Number(magnitudeFactor)
      );
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Modular GAO 217030 BLE Gateway HTTP/MQTT ingestion endpoint
  app.post('/api/ingest/ble', (req, res) => {
    try {
      const { result, snapshot } = store.ingestBlePayload(req.body ?? {});
      res.status(result.accepted ? 200 : 422).json({ result, snapshot });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Update system settings
  app.post('/api/settings', (req, res) => {
    try {
      const snapshot = store.updateSettings(req.body ?? {});
      scheduleNextTick();
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // CSV Export for historical readings, anomalies, or events
  app.get('/api/export/csv', (req, res) => {
    try {
      const snapshot = store.getSnapshot();
      const exportType = String(req.query.type ?? 'readings');
      const channelFilter = String(req.query.channel ?? 'all');

      let csv = '';
      let filename = `d5-facility-${exportType}-${Date.now()}.csv`;

      if (exportType === 'events') {
        const headers = [
          'Event ID',
          'Timestamp',
          'Event Type',
          'Affected Channel',
          'Source Type',
          'Simulated',
          'Description',
        ];
        const rows = snapshot.eventLog
          .filter(
            (e) =>
              channelFilter === 'all' ||
              e.affectedChannel === channelFilter ||
              e.affectedChannel === 'all'
          )
          .map((e) =>
            [
              e.eventId,
              e.timestamp,
              e.eventType,
              e.affectedChannel,
              e.sourceType,
              e.simulatedStatus,
              e.description,
            ]
              .map(escapeCsv)
              .join(',')
          );
        csv = [headers.join(','), ...rows].join('\n');
      } else if (exportType === 'anomalies') {
        const headers = [
          'Anomaly ID',
          'Timestamp',
          'Channel',
          'Type',
          'Severity',
          'Anomaly Score',
          'Z-Score',
          'Observed (W)',
          'Expected (W)',
          'Data Source',
          'Simulated Trigger',
          'Explanation',
        ];
        const rows = snapshot.anomalyHistory
          .filter((a) => channelFilter === 'all' || a.channelId === channelFilter)
          .map((a) =>
            [
              a.anomalyId,
              a.timestamp,
              a.channelName,
              a.type,
              a.severity,
              a.anomalyScore,
              a.zScore,
              a.observedW,
              a.expectedW,
              a.dataSource,
              a.isSimulatedTrigger,
              a.explanation,
            ]
              .map(escapeCsv)
              .join(',')
          );
        csv = [headers.join(','), ...rows].join('\n');
      } else {
        const headers = [
          'Tick ID',
          'Timestamp',
          'Channel ID',
          'Source Type',
          'Load State',
          'Voltage (V)',
          'Current (A)',
          'Power (W)',
          'Status',
          'Valid',
          'Stale',
          'Total Tick Power (W)',
        ];
        const rows: string[] = [];
        for (const tick of snapshot.history) {
          (['ch1', 'ch2', 'ch3'] as ChannelId[]).forEach((chId) => {
            if (channelFilter !== 'all' && chId !== channelFilter) return;
            const r = tick.channels[chId];
            rows.push(
              [
                tick.tickId,
                r.timestamp,
                r.channelId,
                r.sourceType,
                r.loadState,
                r.voltage,
                r.current,
                r.power,
                r.status,
                r.isValid,
                r.isStale,
                tick.totalPowerW,
              ]
                .map(escapeCsv)
                .join(',')
            );
          });
        }
        csv = [headers.join(','), ...rows].join('\n');
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Server-side Gemini API natural-language briefing grounded in computed model outputs
  app.post('/api/ai/explain', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0 || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in server environment secrets. Add it in Settings > Secrets to enable natural-language Gemini operational briefings.',
      });
      return;
    }

    try {
      const snapshot = store.getSnapshot();
      const focus = String(req.body?.focus ?? 'overview');

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const groundedContext = {
        focus,
        connectionStatus: snapshot.connectionStatus,
        mode: snapshot.simulationState.mode,
        totalPower: snapshot.totalPower,
        baselineComparison: {
          expectedTotalW: snapshot.baselineComparison.expectedTotalW,
          actualTotalW: snapshot.baselineComparison.actualTotalW,
          deltaW: snapshot.baselineComparison.deltaW,
          percentDiff: snapshot.baselineComparison.percentDiff,
          withinExpected: snapshot.baselineComparison.withinExpected,
          stateSignature: snapshot.baselineComparison.stateSignature,
        },
        forecast: {
          horizonMinutes: snapshot.latestForecast.horizonMinutes,
          predictedDemandW: snapshot.latestForecast.predictedDemandW,
          trend: snapshot.latestForecast.trend,
          confidencePercent: snapshot.latestForecast.confidencePercent,
          isReliable: snapshot.latestForecast.isReliable,
          ridgeMAE: snapshot.latestForecast.ridgeMetrics?.mae ?? null,
          persistenceMAE: snapshot.latestForecast.persistenceMetrics?.mae ?? null,
          movingAverageMAE: snapshot.latestForecast.movingAverageMetrics?.mae ?? null,
        },
        activeAnomalies: snapshot.activeAnomalies.slice(0, 5),
      };

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze this D5 Facility Energy Demand telemetry snapshot and provide a concise, grounded operational summary (max 4 bullet points). Reference the exact numerical values, clearly distinguish simulated vs measured data, and strictly respect that operators retain manual control (never suggest automatic load switching).\n\nSnapshot JSON:\n${JSON.stringify(groundedContext, null, 2)}`,
        config: {
          systemInstruction:
            'You are an industrial facility energy analyst. Report strictly based on the provided numerical model outputs. Never invent metrics or recommend automatic physical load actuation.',
        },
      });

      res.json({
        explanation: response.text ?? 'No commentary returned by model.',
        model: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(502).json({
        error: `Gemini API request failed: ${(err as Error).message}`,
      });
    }
  });

  // Mount Vite middleware in dev or serve static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`D5 Facility Energy Demand Intelligence server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
