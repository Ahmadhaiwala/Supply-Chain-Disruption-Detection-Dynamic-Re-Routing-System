/**
 * Maps backend API types → frontend store types.
 */
import type { BackendShipment, BackendAlert, PredictionResponse, RouteOption } from './api'
import type { Shipment, Alert, RiskLevel } from '@/frontend/store/useStore'

// Backend risk level (uppercase) → frontend (lowercase)
function mapRiskLevel(level: string): RiskLevel {
  const map: Record<string, RiskLevel> = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  }
  // score > 0.85 → critical (backend doesn't have critical, we derive it)
  return map[level?.toUpperCase()] ?? 'low'
}

function mapCargoType(
  cargo: string | null,
): 'container' | 'bulk' | 'tanker' | 'refrigerated' {
  if (!cargo) return 'container'
  const c = cargo.toLowerCase()
  if (c.includes('reefer') || c.includes('refrigerat') || c.includes('cold')) return 'refrigerated'
  if (c.includes('tank') || c.includes('liquid')) return 'tanker'
  if (c.includes('bulk') || c.includes('grain') || c.includes('coal')) return 'bulk'
  return 'container'
}

function formatETA(eta: string | null): string {
  if (!eta) return 'N/A'
  try {
    return new Date(eta).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return eta
  }
}

// Rough reverse-geocode for known Indian coordinates
function coordsToCity(lat: number, lon: number): string {
  const cities: [number, number, string][] = [
    [13.155, 80.196, 'Chennai, TN'],
    [12.74, 77.82, 'Hosur, KA'],
    [12.839, 79.954, 'Kanchipuram, TN'],
    [11.871, 79.739, 'Pondicherry'],
    [11.872, 79.632, 'Pondicherry'],
    [18.75, 73.877, 'Pune, MH'],
    [13.087, 80.184, 'Tiruvallur, TN'],
    [13.202, 80.131, 'Tiruvallur, TN'],
    [26.131, 91.749, 'Guwahati, AS'],
    [12.786, 79.975, 'Kanchipuram, TN'],
    [28.635, 76.693, 'Jhajjar, HR'],
    [22.749, 86.281, 'Jharkhand'],
    [17.942, 74.546, 'Solapur, MH'],
    [9.973, 78.281, 'Madurai, TN'],
    [12.223, 76.690, 'Mysuru, KA'],
    [28.430, 77.017, 'Delhi NCR'],
    [23.442, 72.150, 'Ahmedabad, GJ'],
    [28.373, 76.835, 'Rewari, HR'],
    [12.930, 79.931, 'Kanchipuram, TN'],
    [13.215, 80.32, 'Chennai, TN'],
    [12.766, 77.786, 'Hosur, KA'],
    [12.751, 77.804, 'Hosur, KA'],
    [13.102, 80.194, 'Chennai, TN'],
    [12.777, 80.025, 'Chennai, TN'],
    [26.55, 75.463, 'Jaipur, RJ'],
    [26.85, 80.92, 'Lucknow, UP'],
    [18.76, 73.86, 'Pune, MH'],
    [23.349, 72.056, 'Ahmedabad, GJ'],
    [12.722, 77.676, 'Bengaluru, KA'],
  ]
  let best = `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`
  let minDist = Infinity
  for (const [clat, clon, name] of cities) {
    const d = Math.abs(lat - clat) + Math.abs(lon - clon)
    if (d < minDist && d < 0.5) { minDist = d; best = name }
  }
  return best
}

export function mapShipment(s: BackendShipment): Shipment {
  const riskLevel: RiskLevel =
    s.current_risk_score > 0.85
      ? 'critical'
      : mapRiskLevel(s.risk_level)

  return {
    id: s.booking_id,
    origin: coordsToCity(s.origin_lat, s.origin_lon),
    destination: coordsToCity(s.destination_lat, s.destination_lon),
    cargoType: mapCargoType(s.cargo_type),
    riskLevel,
    riskScore: Math.round(s.current_risk_score * 100),
    eta: formatETA(s.planned_eta),
    currentLocation: [
      s.current_lat ?? s.origin_lat,
      s.current_lon ?? s.origin_lon,
    ],
    route: [
      [s.origin_lat, s.origin_lon],
      [s.current_lat ?? s.origin_lat, s.current_lon ?? s.origin_lon],
      [s.destination_lat, s.destination_lon],
    ],
    // alternativeRoutes populated separately from /route endpoint
    alternativeRoutes: [],
    // Extra fields for detail views
    _raw: s,
  } as Shipment
}

export function mapAlert(a: BackendAlert): Alert {
  const severityMap: Record<string, Alert['severity']> = {
    LOW: 'info',
    MEDIUM: 'warning',
    HIGH: 'critical',
  }
  return {
    id: String(a.id),
    timestamp: new Date(a.created_at),
    severity: severityMap[a.severity?.toUpperCase()] ?? 'info',
    message: a.message,
    shipmentId: a.booking_id,
  }
}

export function mapRouteAlternatives(
  routes: RouteOption[],
): NonNullable<Shipment['alternativeRoutes']> {
  return routes.map((r) => ({
    route: r.waypoints,
    riskScore: Math.round(r.delay_risk * 100),
    costDelta: r.extra_cost_inr,
    etaDelta: r.estimated_eta_minutes
      ? `+${Math.round(r.estimated_eta_minutes / 60)}h`
      : 'N/A',
    label: r.label,
    rank: r.rank,
    isRecommended: r.is_recommended,
  }))
}

export function buildPredictionInput(s: BackendShipment) {
  const now = new Date()
  return {
    booking_id: s.booking_id,
    hour_of_day: now.getHours(),
    day_of_week: now.getDay(),
    is_weekend: now.getDay() === 0 || now.getDay() === 6 ? 1 : 0,
    is_peak_hour: (now.getHours() >= 8 && now.getHours() <= 10) ||
      (now.getHours() >= 17 && now.getHours() <= 19) ? 1 : 0,
    month: now.getMonth() + 1,
    origin_lat: s.origin_lat,
    origin_lon: s.origin_lon,
    destination_lat: s.destination_lat,
    destination_lon: s.destination_lon,
    distance_km: s.distance_km ?? 100,
    vehicle_type: s.vehicle_type ?? '',
    corridor_congestion_index: 0.3,
    nearby_disruptions_count: 0,
    carrier_ontime_rate: 0.8,
    route_historical_delay_rate: 0.2,
    weather_severity: 0,
    precipitation_mm: 0,
    event_flag_accident: 0,
    delay_rate_t1h: 0,
    delay_rate_t2h: 0,
    delay_rate_t3h: 0,
  }
}
