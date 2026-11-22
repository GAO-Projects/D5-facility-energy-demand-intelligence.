import type {
  ChannelId,
  DisturbanceType,
  FacilityStateSnapshot,
  LoadState,
  RawBleGatewayPayload,
  SystemSettings,
} from '../engine/types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function fetchFacilityState(): Promise<FacilityStateSnapshot> {
  return requestJson<FacilityStateSnapshot>('/api/state');
}

export function controlSimulation(
  action: 'start' | 'pause' | 'reset' | 'tick' | 'switch_mode',
  mode?: 'simulation' | 'ble_gateway'
): Promise<FacilityStateSnapshot> {
  return requestJson<FacilityStateSnapshot>('/api/simulation/control', {
    method: 'POST',
    body: JSON.stringify({ action, mode }),
  });
}

export function setManualLoadState(
  channelId: ChannelId,
  loadState: LoadState
): Promise<FacilityStateSnapshot> {
  return requestJson<FacilityStateSnapshot>('/api/simulation/load-state', {
    method: 'POST',
    body: JSON.stringify({ channelId, loadState }),
  });
}

export function triggerSimulationEvent(
  type: DisturbanceType,
  targetChannel: ChannelId | 'all' = 'all',
  magnitudeFactor = 1.4
): Promise<FacilityStateSnapshot> {
  return requestJson<FacilityStateSnapshot>('/api/simulation/event', {
    method: 'POST',
    body: JSON.stringify({ type, targetChannel, magnitudeFactor }),
  });
}

export async function ingestBleTestPayload(payload: Partial<RawBleGatewayPayload>) {
  const res = await fetch('/api/ingest/ble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { status: res.status, ...data };
}

export function updateSystemSettings(
  settings: Partial<SystemSettings>
): Promise<FacilityStateSnapshot> {
  return requestJson<FacilityStateSnapshot>('/api/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export function requestAiExplanation(focus: string): Promise<{
  explanation: string;
  model: string;
  generatedAt: string;
}> {
  return requestJson('/api/ai/explain', {
    method: 'POST',
    body: JSON.stringify({ focus }),
  });
}

export function getCsvExportUrl(
  type: 'readings' | 'events' | 'anomalies',
  channel: ChannelId | 'all' = 'all'
): string {
  return `/api/export/csv?type=${encodeURIComponent(type)}&channel=${encodeURIComponent(channel)}`;
}
