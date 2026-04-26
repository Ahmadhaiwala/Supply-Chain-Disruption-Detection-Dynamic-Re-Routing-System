/**
 * Typed API client for the Supply Chain backend.
 * Base URL: http://localhost:8000
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
export const WS_BASE = API_BASE.replace(/^http/, 'ws')

// ─── Backend response types ────────────────────────────────────────────────

export interface BackendShipment {
  id: number
  booking_id: string
  origin_lat: number
  origin_lon: number
  destination_lat: number
  destination_lon: number
  current_lat: number | null
  current_lon: number | null
  planned_eta: string | null
  actual_eta: string | null
  vehicle_type: string | null
  distance_km: number | null
  cargo_type: string | null
  carrier_id: string | null
  status: 'IN_TRANSIT' | 'DELIVERED' | 'DELAYED'
  is_delayed: boolean
  current_risk_score: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  created_at: string
  updated_at: string | null
}

export interface BackendAlert {
  id: number
  booking_id: string
  alert_type: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  message: string
  is_acknowledged: boolean
  created_at: string
}

export interface PredictionResponse {
  booking_id: string
  delay_probability: number
  eta_prediction_minutes: number | null
  eta_lower_bound_minutes: number | null
  eta_upper_bound_minutes: number | null
  anomaly_score: number | null
  is_anomaly: boolean
  ensemble_risk_score: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  shap_top_features: { feature: string; shap_value: number }[] | null
  recommendation: string
  predicted_at: string
}

export interface RouteOption {
  rank: number
  label: string
  waypoints: [number, number][]
  estimated_eta_minutes: number
  delay_risk: number
  extra_cost_inr: number
  distance_km: number
  is_recommended: boolean
}

export interface RouteResponse {
  booking_id: string
  current_route: RouteOption
  alternatives: RouteOption[]
  computed_at: string
}

export interface PredictionInput {
  booking_id: string
  hour_of_day: number
  day_of_week: number
  is_weekend: number
  is_peak_hour: number
  month: number
  origin_lat: number
  origin_lon: number
  destination_lat: number
  destination_lon: number
  distance_km: number
  corridor_congestion_index?: number
  nearby_disruptions_count?: number
  carrier_ontime_rate?: number
  route_historical_delay_rate?: number
  vehicle_type?: string
  weather_severity?: number
  temperature_celsius?: number
  precipitation_mm?: number
  event_flag_accident?: number
  delay_rate_t1h?: number
  delay_rate_t2h?: number
  delay_rate_t3h?: number
  speed_variance?: number
  stop_count?: number
  route_deviation_km?: number
}

export interface InfoResponse {
  app: string
  version: string
  graph_nodes: number
  graph_edges: number
  active_ws_connections: number
  risk_thresholds: { low_max: number; medium_max: number }
}

// ─── Generic fetch wrapper ─────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ─── Shipments ─────────────────────────────────────────────────────────────

export const shipmentsApi = {
  list: (params?: { status?: string; risk_level?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.risk_level) qs.set('risk_level', params.risk_level)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    return apiFetch<BackendShipment[]>(`/shipments?${qs}`)
  },

  get: (bookingId: string) =>
    apiFetch<BackendShipment>(`/shipments/${bookingId}`),

  create: (data: Partial<BackendShipment>) =>
    apiFetch<BackendShipment>('/shipments', { method: 'POST', body: JSON.stringify(data) }),

  update: (bookingId: string, data: Partial<BackendShipment>) =>
    apiFetch<BackendShipment>(`/shipments/${bookingId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (bookingId: string) =>
    apiFetch<void>(`/shipments/${bookingId}`, { method: 'DELETE' }),

  getAlerts: (bookingId: string) =>
    apiFetch<BackendAlert[]>(`/shipments/${bookingId}/alerts`),

  acknowledgeAlert: (bookingId: string, alertId: number) =>
    apiFetch<{ message: string }>(`/shipments/${bookingId}/alerts/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ alert_id: alertId }),
    }),
}

// ─── Predictions ───────────────────────────────────────────────────────────

export const predictApi = {
  predict: (input: PredictionInput) =>
    apiFetch<PredictionResponse>('/predict', { method: 'POST', body: JSON.stringify(input) }),

  batch: (inputs: PredictionInput[]) =>
    apiFetch<PredictionResponse[]>('/predict/batch', { method: 'POST', body: JSON.stringify(inputs) }),

  explain: (bookingId: string) =>
    apiFetch<PredictionResponse>(`/predict/explain/${bookingId}`),
}

// ─── Routing ───────────────────────────────────────────────────────────────

export const routeApi = {
  compute: (data: {
    booking_id: string
    origin_lat: number
    origin_lon: number
    destination_lat: number
    destination_lon: number
    current_risk_score?: number
    max_routes?: number
  }) => apiFetch<RouteResponse>('/route', { method: 'POST', body: JSON.stringify(data) }),

  get: (bookingId: string) =>
    apiFetch<RouteOption[]>(`/route/${bookingId}`),

  select: (bookingId: string, routeRank: number) => {
    const qs = new URLSearchParams({ booking_id: bookingId, route_rank: String(routeRank) })
    return apiFetch<{ message: string; selected_route: RouteOption }>(`/route/select?${qs}`, {
      method: 'POST',
    })
  },
}

// ─── Health ────────────────────────────────────────────────────────────────

export const healthApi = {
  info: () => apiFetch<InfoResponse>('/info'),
  health: () => apiFetch<{ status: string }>('/health'),
}

// ─── WebSocket helper ──────────────────────────────────────────────────────

export function createShipmentWS(
  bookingId: string,
  onMessage: (event: { event: string; booking_id: string; data: unknown; timestamp: string }) => void,
  onError?: (e: Event) => void,
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/${bookingId}`)
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data))
    } catch {
      // ignore parse errors
    }
  }
  if (onError) ws.onerror = onError
  return ws
}
