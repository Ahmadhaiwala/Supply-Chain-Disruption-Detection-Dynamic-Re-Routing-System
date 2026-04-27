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

// US city lookup from coordinates
function coordsToCity(lat: number, lon: number): string {
  const cities: [number, number, string][] = [
    [40.71, -74.01, 'New York, NY'],
    [34.05, -118.24, 'Los Angeles, CA'],
    [41.88, -87.63, 'Chicago, IL'],
    [29.76, -95.37, 'Houston, TX'],
    [33.45, -112.07, 'Phoenix, AZ'],
    [39.95, -75.17, 'Philadelphia, PA'],
    [29.42, -98.49, 'San Antonio, TX'],
    [32.78, -96.80, 'Dallas, TX'],
    [30.33, -81.66, 'Jacksonville, FL'],
    [37.77, -122.42, 'San Francisco, CA'],
    [47.61, -122.33, 'Seattle, WA'],
    [39.74, -104.98, 'Denver, CO'],
    [42.36, -71.06, 'Boston, MA'],
    [36.17, -86.78, 'Nashville, TN'],
    [35.23, -80.84, 'Charlotte, NC'],
    [33.75, -84.39, 'Atlanta, GA'],
    [25.76, -80.19, 'Miami, FL'],
    [28.54, -81.38, 'Orlando, FL'],
    [35.15, -90.05, 'Memphis, TN'],
    [38.63, -90.20, 'St. Louis, MO'],
    [39.10, -94.58, 'Kansas City, MO'],
    [41.26, -95.93, 'Omaha, NE'],
    [44.98, -93.27, 'Minneapolis, MN'],
    [43.04, -87.91, 'Milwaukee, WI'],
    [39.77, -86.16, 'Indianapolis, IN'],
    [42.33, -83.05, 'Detroit, MI'],
    [41.50, -81.69, 'Cleveland, OH'],
    [39.96, -82.99, 'Columbus, OH'],
    [38.25, -85.76, 'Louisville, KY'],
    [38.91, -77.04, 'Washington, DC'],
    [39.29, -76.61, 'Baltimore, MD'],
    [35.47, -97.52, 'Oklahoma City, OK'],
    [30.27, -97.74, 'Austin, TX'],
    [29.95, -90.07, 'New Orleans, LA'],
    [40.76, -111.89, 'Salt Lake City, UT'],
    [36.17, -115.14, 'Las Vegas, NV'],
    [35.08, -106.65, 'Albuquerque, NM'],
    [32.22, -110.97, 'Tucson, AZ'],
    [32.72, -117.16, 'San Diego, CA'],
    [38.58, -121.49, 'Sacramento, CA'],
    [45.51, -122.68, 'Portland, OR'],
    [32.08, -81.10, 'Savannah, GA'],
    [33.74, -118.27, 'Port of LA'],
    [29.74, -95.09, 'Port of Houston'],
    [40.68, -74.04, 'Port of NY/NJ'],
    [47.60, -122.34, 'Port of Seattle'],
  ]
  let best = `${lat.toFixed(1)}°N, ${Math.abs(lon).toFixed(1)}°W`
  let minDist = Infinity
  for (const [clat, clon, name] of cities) {
    const d = Math.abs(lat - clat) + Math.abs(lon - clon)
    if (d < minDist && d < 1.5) { minDist = d; best = name }
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
  const hour = now.getHours()

  // Derive realistic features from actual shipment risk & dataset row fields
  const raw = s as Record<string, unknown>

  // Use dataset columns directly if available (they come from _raw via the shipment record)
  const trafficLevel    = typeof raw.traffic_congestion_level === 'number'
    ? raw.traffic_congestion_level
    : (s.current_risk_score * 10)  // proxy: high risk → high congestion

  const weatherSeverity = typeof raw.weather_condition_severity === 'number'
    ? raw.weather_condition_severity
    : Math.min(10, s.current_risk_score * 12)  // scale risk score to 0-10

  const disruption      = typeof raw.disruption_likelihood_score === 'number'
    ? raw.disruption_likelihood_score
    : s.current_risk_score  // already [0,1]

  const driverScore     = typeof raw.driver_behavior_score === 'number'
    ? raw.driver_behavior_score
    : Math.max(0.3, 1.0 - s.current_risk_score * 0.8)

  const fatigueScore    = typeof raw.fatigue_monitoring_score === 'number'
    ? raw.fatigue_monitoring_score
    : Math.min(0.9, s.current_risk_score * 0.7)

  const portCongestion  = typeof raw.port_congestion_level === 'number'
    ? raw.port_congestion_level
    : s.current_risk_score * 8

  const fuelRate        = typeof raw.fuel_consumption_rate === 'number'
    ? raw.fuel_consumption_rate
    : 4.5 + s.current_risk_score * 4  // higher risk → worse fuel efficiency

  const etaVariation    = typeof raw.eta_variation_hours === 'number'
    ? raw.eta_variation_hours
    : s.current_risk_score * 3  // hours behind schedule

  const routeRisk       = typeof raw.route_risk_level === 'number'
    ? raw.route_risk_level
    : s.current_risk_score * 10

  return {
    booking_id: s.booking_id,
    hour_of_day: hour,
    day_of_week: now.getDay(),
    is_weekend: now.getDay() === 0 || now.getDay() === 6 ? 1 : 0,
    is_peak_hour: (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19) ? 1 : 0,
    month: now.getMonth() + 1,
    origin_lat: s.origin_lat,
    origin_lon: s.origin_lon,
    destination_lat: s.destination_lat,
    destination_lon: s.destination_lon,
    distance_km: s.distance_km ?? 500,

    // ── Real-time operational features (0-10 scale) ──
    // These map to feature_engineering.py as-is (multiply by 10 happens inside)
    corridor_congestion_index: trafficLevel / 10,   // [0,1] → * 10 inside FE
    weather_severity: weatherSeverity / 2,           // FE does * 2, so pass /2 to get correct 0-10 range

    // ── Sensor & logistics features ──
    fuel_consumption_rate: fuelRate,
    eta_variation_hours: etaVariation,
    loading_unloading_time: typeof raw.loading_unloading_time === 'number'
      ? raw.loading_unloading_time : 2.0,
    handling_equipment_availability: typeof raw.handling_equipment_availability === 'number'
      ? raw.handling_equipment_availability : Math.max(0.4, 1.0 - s.current_risk_score * 0.5),
    order_fulfillment_status: typeof raw.order_fulfillment_status === 'number'
      ? raw.order_fulfillment_status : Math.max(0.5, 1.0 - s.current_risk_score * 0.4),
    port_congestion_level: portCongestion,
    shipping_costs: typeof raw.shipping_costs === 'number'
      ? raw.shipping_costs : 350 + s.current_risk_score * 300,
    carrier_ontime_rate: typeof raw.supplier_reliability_score === 'number'
      ? raw.supplier_reliability_score : Math.max(0.4, 1.0 - s.current_risk_score * 0.5),
    lead_time_days: typeof raw.lead_time_days === 'number'
      ? raw.lead_time_days : 3.0,
    temperature_celsius: typeof raw.iot_temperature === 'number'
      ? raw.iot_temperature : 20.0,
    cargo_condition_status: typeof raw.cargo_condition_status === 'number'
      ? raw.cargo_condition_status : Math.max(0.5, 1.0 - s.current_risk_score * 0.3),
    route_historical_delay_rate: routeRisk / 10,     // FE does * 10, so pass /10
    customs_clearance_time: typeof raw.customs_clearance_time === 'number'
      ? raw.customs_clearance_time : 1.0 + s.current_risk_score * 3,
    driver_behavior_score: driverScore,
    fatigue_monitoring_score: fatigueScore,
    disruption_likelihood_score: disruption,

    // Legacy fields (unused by current FE pipeline but kept for compat)
    nearby_disruptions_count: 0,
    event_flag_accident: 0,
    delay_rate_t1h: 0,
    delay_rate_t2h: 0,
    delay_rate_t3h: 0,
    precipitation_mm: typeof raw.precipitation_mm === 'number' ? raw.precipitation_mm : 0,
  }
}

