# D5 Facility Energy Demand Intelligence

An enterprise Physical AI and AIoT energy monitoring, demand forecasting, and anomaly detection web application built with React, TypeScript, Recharts, Tailwind CSS, and Express.

> **Strict Scope Boundary:** This system is designed strictly for energy monitoring, forecasting, and analytical diagnostics. It does **not** automatically switch loads, dim LED strips, control fans, implement PWM actuation, or send physical commands to actuators. Operators retain complete manual control of all physical loads.

---

## Key Capabilities

- **Multi-Channel Power Monitoring**: Tracks Voltage (V), Current (A), and computed Power ($P = V \times I$) across three low-voltage demonstration channels:
  - `ch1`: LED Demonstration Load
  - `ch2`: Fan Demonstration Load 1
  - `ch3`: Fan Demonstration Load 2
- **Total Measured Power**: Sums valid, non-stale channel readings while strictly separating `MEASURED` BLE telemetry from `SIMULATED` readings.
- **Live Simulation Engine**: Operates fully without hardware connected, supporting continuous baseline drift, manual software-only `Sim ON` / `Sim OFF` load toggles, demand increases/decreases, anomaly injection, missing readings, and stale BLE simulation.
- **AI Demand Forecasting**: Trains a standardized **Regularized Ridge Regression** model on sliding time-window features using chronological train/test splits (70% / 30%) and evaluates held-out MAE and RMSE against **Persistence** and **Moving-Average** baselines, with automatic gating when historical data is insufficient (`< 24` samples).
- **State-Conditioned Baseline Comparison**: Learns normal consumption ($\mu, \sigma$) conditioned on observed channel `ON`/`OFF` combinations and flags deviations in watts and percentage.
- **Reproducible Anomaly Detection**: Computes state-conditioned z-scores, detects load-state mismatches, missing readings, and stale telemetry, and clearly distinguishes simulated test triggers from observed deviations.
- **GAO 217030 BLE Gateway Readiness**: Includes a modular payload decoder and HTTP ingestion endpoint (`POST /api/ingest/ble`) with bounds checking (`0–30 V`, `0–10 A`), duplicate-timestamp rejection, and freshness validation.
- **Historical Analytics & CSV Export**: Provides time-range and channel filters, min/average/peak metrics, and CSV downloads for readings, event logs, and anomaly records.
- **Grounded Gemini Briefings**: Optional server-side `@google/genai` (`gemini-4-hydrogen`) natural-language operational summaries grounded strictly in the computed model outputs.

---

## Application Pages

1. **Overview Dashboard** — Total power KPIs, 3 channel cards, live multi-channel chart, forecast/baseline/anomaly summaries, quick simulation controls, and Gemini briefing panel.
2. **Live Monitoring** — Real-time telemetry stream, sparklines, and per-channel freshness/validation diagnostics.
3. **AI Demand Forecast** — Configurable forecast horizon (`1m`–`15m`), 95% confidence bounds, Ridge vs. Persistence/Moving-Average MAE & RMSE comparison, and feature coefficients.
4. **Anomaly Detection** — Active alerts, severity/channel filters, z-score explanations, and anomaly CSV export.
5. **Baseline Analysis** — State-signature matching, expected vs. actual bar chart, and per-channel learned $(\mu, \sigma)$ breakdown.
6. **Historical Analytics** — Retained telemetry statistics, channel-wise comparison charts, and CSV exports.
7. **Simulation Control** — Manual software-only load-state toggles, disturbance magnitude controls, and fault/staleness injection workbench.
8. **Device Integration** — GAO 217030 BLE architecture overview, mode switcher, interactive HTTP packet tester, and ingestion audit log.
9. **Event Logs** — Searchable chronological trail of simulation events, manual load toggles, BLE packets, and settings updates.
10. **Settings** — Persistent runtime configuration (simulation interval, forecast horizon, freshness threshold, display unit, anomaly sensitivity) and documentation.

---

## Project Folder Structure

```text
d5-facility-energy-demand-intelligence/
├── .env.example                 # Environment variable template (GEMINI_API_KEY, APP_URL)
├── index.html                   # HTML entry point & Google Fonts
├── metadata.json                # Application metadata & server-side Gemini capability
├── package.json                 # Dependencies & scripts
├── tsconfig.json                # TypeScript configuration
├── vite.config.ts               # Vite + Tailwind CSS v4 configuration
├── README.md                    # Project documentation
├── server.ts                    # Express + Vite server, simulation loop, REST API, CSV & Gemini routes
├── server/
│   └── store.ts                 # Persistent JSON store for telemetry, forecasts, anomalies & settings
├── data/
│   └── d5_facility_db.json      # Local persistent storage file (auto-generated on first run)
└── src/
    ├── main.tsx                 # React entry point
    ├── index.css                # Tailwind v4 global styles & tabular numeral rules
    ├── App.tsx                  # Root application state, polling loop & 10-page navigation
    ├── api/
    │   └── client.ts            # Typed frontend API client
    ├── engine/
    │   ├── types.ts             # Shared TypeScript interfaces
    │   ├── simulation.ts        # 3-channel simulator & deterministic 64-sample history seeder
    │   ├── analytics.ts         # Total power, baseline learner, Ridge Regression & anomaly scorer
    │   ├── bleDecoder.ts        # GAO 217030 BLE payload decoder & validator
    │   └── engine.test.ts       # Unit tests for analytics, simulation & BLE validation
    └── components/
        ├── Layout.tsx
        ├── ChannelCard.tsx
        ├── PowerChart.tsx
        ├── OverviewPage.tsx
        ├── LiveMonitoringPage.tsx
        ├── ForecastPage.tsx
        ├── AnomalyPage.tsx
        ├── BaselinePage.tsx
        ├── HistoricalAnalyticsPage.tsx
        ├── SimulationControlPage.tsx
        ├── DeviceIntegrationPage.tsx
        ├── EventLogsPage.tsx
        └── SettingsPage.tsx
```

---

## Tech Stack & Dependencies

- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), Recharts, Lucide React, Motion
- **Backend**: Node.js, Express 4, `tsx`, `dotenv`
- **AI Integration**: `@google/genai` (server-side only via `/api/ai/explain`)

---

## Setup & Running Locally

### 1. Prerequisites
- Node.js `>= 20`
- npm

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
- `GEMINI_API_KEY`: Optional server-side API key used only for the **Generate AI Briefing** / **Explain Anomalies with Gemini** natural-language summary buttons. All numerical forecasting, baseline learning, and anomaly scoring run locally without an API key.
- `APP_URL`: Runtime URL when deployed.

### 4. Start the Application
Development server (Express + Vite middleware on port `3000`):
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

Production build and start:
```bash
npm run build
npm start
```

### 5. Run Tests & Type Checking
```bash
# Run analytical engine unit tests
npx tsx --test src/engine/engine.test.ts

# TypeScript type check
npm run lint
```

---

## How to Test Simulation & AI Forecasting

1. **Simulation Stream**: Open **Overview Dashboard** or **Simulation Control**. The simulation streams automatically; use **Pause Simulation**, **Start Simulation**, **Step Tick**, or **Reset** as needed.
2. **Manual Load-State Changes**: Click `Sim ON` / `Sim OFF` on any channel card to observe immediate changes in channel wattage, total power, state-conditioned baseline expectation, and event logs.
3. **Demand & Fault Events**: Trigger **Simulate Demand Increase**, **Simulate Demand Decrease**, **Simulate Anomaly**, **Simulate Missing Data**, or **Simulate Stale BLE Data** and observe the anomaly score, z-score explanation, and telemetry warning banners.
4. **AI Forecasting**: Navigate to **AI Demand Forecast**, switch the horizon (`1m`, `3m`, `5m`, `10m`, `15m`), and compare Ridge Regression MAE/RMSE against the Persistence and Moving-Average baselines.

---

## Future BLE Hardware Integration (GAO 217030)

Intended hardware pipeline:
`3× BLE Power-Monitoring Nodes → GAO 217030 BLE Gateway → HTTP/MQTT Forwarder → POST /api/ingest/ble → Payload Decoder → AI Analytics → Dashboard`

Example JSON payload accepted by `POST /api/ingest/ble`:
```json
{
  "gatewayId": "GAO-217030-D5-GW01",
  "protocol": "GAO-217030-HTTP",
  "channelId": "ch1",
  "voltage": 12.08,
  "current": 1.21,
  "timestamp": "2026-11-22T12:00:00.000Z"
}
```
You can test valid and invalid packets directly from the **Device Integration** page.

---

## Known Limitations & Unverified Integrations

- **No Live Physical Hardware Attached**: Physical BLE power-monitoring nodes and a live GAO 217030 BLE Gateway are not connected in this demonstration environment. Hardware connectivity is modeled via the validated HTTP ingestion interface (`/api/ingest/ble`) and has not been physically tested against live BLE hardware.
- **Gemini Briefings Require API Key**: Without `GEMINI_API_KEY` configured in server secrets, `/api/ai/explain` returns an HTTP `503` configuration notice rather than fabricating AI commentary.
- **Local JSON Persistence**: Historical readings, events, anomalies, and settings are persisted locally in `data/d5_facility_db.json` (capped at rolling history limits) rather than an external SQL/time-series database.
