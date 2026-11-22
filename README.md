D5 Facility Energy Demand Intelligence is a full-stack Physical AI / AIoT web application for monitoring 3-channel electrical loads (an LED strip and two ventilation fans), forecasting short-term power demand with regularized Ridge Regression, comparing consumption against state-conditioned baselines, and detecting anomalies. It runs a realistic local simulation engine with manual software-only load-state toggles, keeps simulated data strictly separated from GAO 217030 BLE gateway packets, persists history and logs on the backend, and supports CSV exports and optional Gemini operational briefings while leaving all physical load control strictly manual.

d5-facility-energy-demand-intelligence/
├── .env.example                 # Environment variable template (GEMINI_API_KEY, APP_URL)
├── index.html                   # HTML entry point & Google Fonts (Plus Jakarta Sans, JetBrains Mono)
├── metadata.json                # Application metadata & server-side Gemini capability config
├── package.json                 # Dependencies & scripts (dev, build, start, lint)
├── tsconfig.json                # TypeScript compiler configuration
├── vite.config.ts               # Vite + Tailwind CSS v4 configuration
├── server.ts                    # Express + Vite server, simulation loop, REST API, CSV export, Gemini endpoint
├── server/
│   └── store.ts                 # Persistent store managing history, forecasts, anomalies, BLE logs & settings
├── data/
│   └── d5_facility_db.json      # Local persistent JSON database
└── src/
    ├── main.tsx                 # React DOM bootstrap
    ├── index.css                # Tailwind v4 global styles & tabular numeral rules
    ├── App.tsx                  # Root app state, live polling & 10-page navigation router
    ├── api/
    │   └── client.ts            # Typed frontend API client for backend endpoints
    ├── engine/
    │   ├── types.ts             # Shared TypeScript interfaces for telemetry, AI models & BLE payloads
    │   ├── simulation.ts        # 3-channel load simulator & deterministic 64-sample history seeder
    │   ├── analytics.ts         # Total power, state-conditioned baseline, Ridge Regression & anomaly scorer
    │   ├── bleDecoder.ts        # GAO 217030 BLE payload decoder & bounds/staleness validator
    │   └── engine.test.ts       # Unit tests for math, ML forecasting, anomaly detection & BLE validation
    └── components/
        ├── Layout.tsx           # Sidebar navigation, mobile drawer, live status header & alert banners
        ├── ChannelCard.tsx      # Per-channel V/A/W card, sparkline & simulated ON/OFF load toggle
        ├── PowerChart.tsx       # Interactive Recharts multi-channel live line chart with filters
        ├── OverviewPage.tsx     # Main dashboard summary, quick controls & Gemini briefing panel
        ├── LiveMonitoringPage.tsx      # High-resolution telemetry stream & freshness diagnostics
        ├── ForecastPage.tsx            # Ridge Regression forecast vs. Persistence & Moving-Average baselines
        ├── AnomalyPage.tsx             # Active anomaly alerts, z-score history & CSV export
        ├── BaselinePage.tsx            # State-conditioned expected vs. actual baseline comparison
        ├── HistoricalAnalyticsPage.tsx # Time/channel filters, min/avg/peak KPIs & CSV export
        ├── SimulationControlPage.tsx   # Disturbance injection, fault simulation & load-state workbench
        ├── DeviceIntegrationPage.tsx   # GAO 217030 BLE pipeline readiness & packet ingestion tester
        ├── EventLogsPage.tsx           # Searchable simulation & telemetry audit trail
        └── SettingsPage.tsx            # Persistent runtime configuration & operational documentation

Hassan's email :- kharodiyahassan96@gmail.com
Saad's email :- 9saad2005@gmail.com
