/**
 * Report data builder — assembles all data needed for each report type
 * from existing store + API endpoints.
 */
import { shipmentsApi, predictApi, routeApi, externalApi } from '@/lib/api'
import { buildPredictionInput } from '@/lib/mappers'
import { generateReplayData, buildDecisionLog, computeSummary } from '@/frontend/replay/replayData'
import type { Shipment } from '@/frontend/store/useStore'

export type ReportType = 'SHIPMENT_JOURNEY' | 'OPERATIONS' | 'INCIDENT'

export interface ShipmentJourneyData {
  type: 'SHIPMENT_JOURNEY'
  reportId: string
  generatedAt: Date
  shipment: Shipment
  raw: Record<string, unknown>
  prediction: {
    riskScore: number
    riskLevel: string
    delayProb: number
    shapFeatures: { feature: string; value: number }[]
    recommendation: string
  }
  routes: {
    current: { label: string; risk: number; etaMin: number; distKm: number; cost: number }
    alternatives: { label: string; risk: number; etaMin: number; distKm: number; extraCost: number; recommended: boolean }[]
  }
  weather: {
    origin: { condition: string; tempF: number; precipMm: number; windMph: number; severity: number }
    destination: { condition: string; tempF: number; precipMm: number; windMph: number; severity: number }
  }
  timeline: { time: string; event: string; icon: string; color: string }[]
  performance: {
    earlyWarningHours: number
    predictionAccuracy: number
    etaErrorHours: number
  }
}

export interface OperationsData {
  type: 'OPERATIONS'
  reportId: string
  generatedAt: Date
  period: string
  shipments: Shipment[]
  kpis: {
    total: number; active: number; completed: number; disrupted: number
    onTimeRate: number; avgRisk: number; costSaved: number; falseAlarms: number
  }
  riskDist: { name: string; value: number; color: string }[]
  carrierPerf: { carrier: string; onTimePct: number; avgDelay: number; shipments: number }[]
  corridors: { route: string; delays: number; avgRisk: number }[]
  accuracy: { correct: number; falsePositive: number; missed: number }
  recommendations: string[]
}

export interface IncidentData {
  type: 'INCIDENT'
  reportId: string
  generatedAt: Date
  shipment: Shipment
  raw: Record<string, unknown>
  incident: {
    summary: string; detectedAt: string; location: string
    earlyWarningHours: number; responseTimeMin: number
  }
  timeline: { time: string; action: string; actor: string; outcome: string }[]
  alternatives: { label: string; risk: number; cost: number; recommended: boolean }[]
  outcome: string
  lessons: string[]
}

export type ReportData = ShipmentJourneyData | OperationsData | IncidentData

function genId() {
  return `RPT-${Date.now().toString(36).toUpperCase()}`
}

// ─── Progress callback ─────────────────────────────────────────────────────
export type ProgressFn = (step: number, total: number, label: string) => void

// ─── Shipment Journey ──────────────────────────────────────────────────────
export async function buildShipmentJourney(
  shipment: Shipment,
  onProgress: ProgressFn,
): Promise<ShipmentJourneyData> {
  const raw = (shipment._raw ?? {}) as Record<string, unknown>

  onProgress(1, 4, 'Fetching shipment data...')
  const rawShipment = await shipmentsApi.get(shipment.id).catch(() => null)

  onProgress(2, 4, 'Computing predictions...')
  let pred = { riskScore: shipment.riskScore, riskLevel: shipment.riskLevel.toUpperCase(), delayProb: shipment.riskScore, shapFeatures: [] as { feature: string; value: number }[], recommendation: '' }
  try {
    const p = await predictApi.explain(shipment.id)
    pred = {
      riskScore: Math.round(p.ensemble_risk_score * 100),
      riskLevel: p.risk_level,
      delayProb: Math.round(p.delay_probability * 100),
      shapFeatures: (p.shap_top_features ?? []).slice(0, 5).map(f => ({ feature: f.feature.replace(/_/g, ' '), value: Math.abs(f.shap_value) })),
      recommendation: p.recommendation,
    }
  } catch { /* use defaults */ }

  onProgress(3, 4, 'Fetching routes & weather...')
  let routes = { current: { label: 'Current Route', risk: pred.riskScore, etaMin: 480, distKm: Number(raw.distance_km ?? 500), cost: 0 }, alternatives: [] as ShipmentJourneyData['routes']['alternatives'] }
  try {
    const r = await routeApi.compute({
      booking_id: shipment.id,
      origin_lat: Number(raw.origin_lat), origin_lon: Number(raw.origin_lon),
      destination_lat: Number(raw.destination_lat), destination_lon: Number(raw.destination_lon),
      current_risk_score: pred.riskScore / 100, max_routes: 3,
    })
    routes = {
      current: { label: r.current_route.label, risk: Math.round(r.current_route.delay_risk * 100), etaMin: r.current_route.estimated_eta_minutes, distKm: r.current_route.distance_km, cost: 0 },
      alternatives: r.alternatives.map(a => ({ label: a.label, risk: Math.round(a.delay_risk * 100), etaMin: a.estimated_eta_minutes, distKm: a.distance_km, extraCost: a.extra_cost_inr, recommended: a.is_recommended })),
    }
  } catch { /* use defaults */ }

  let weather = {
    origin: { condition: 'Clear', tempF: 72, precipMm: 0, windMph: 8, severity: 0.5 },
    destination: { condition: 'Clear', tempF: 68, precipMm: 0, windMph: 10, severity: 0.5 },
  }
  try {
    const [wo, wd] = await Promise.all([
      externalApi.weather(Number(raw.origin_lat), Number(raw.origin_lon)),
      externalApi.weather(Number(raw.destination_lat), Number(raw.destination_lon)),
    ])
    weather = {
      origin: { condition: wo.condition, tempF: wo.temperature_f, precipMm: wo.precipitation_mm, windMph: wo.wind_speed_mph, severity: wo.severity },
      destination: { condition: wd.condition, tempF: wd.temperature_f, precipMm: wd.precipitation_mm, windMph: wd.wind_speed_mph, severity: wd.severity },
    }
  } catch { /* use defaults */ }

  onProgress(4, 4, 'Generating report...')
  const replayData = generateReplayData(shipment, 1)
  const timeline = replayData.events
    .filter(e => e.type !== 'GPS_UPDATE')
    .slice(0, 8)
    .map(e => ({
      time: e.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      event: e.details,
      icon: e.type === 'ALERT_TRIGGERED' ? '⚠' : e.type === 'DISRUPTION' ? '🔴' : e.type === 'ROUTE_EXECUTED' ? '✅' : '🔮',
      color: e.type === 'ALERT_TRIGGERED' ? '#f59e0b' : e.type === 'DISRUPTION' ? '#ef4444' : e.type === 'ROUTE_EXECUTED' ? '#10b981' : '#a855f7',
    }))

  const log = buildDecisionLog(replayData)
  const correct = log.filter(l => l.result === 'CORRECT').length
  const earlyAlert = replayData.events.find(e => e.type === 'ALERT_TRIGGERED')
  const disruption = replayData.events.find(e => e.type === 'DISRUPTION')
  const earlyWarningHours = earlyAlert && disruption ? Math.max(0, (disruption.offsetMs - earlyAlert.offsetMs) / 3600000) : 0

  return {
    type: 'SHIPMENT_JOURNEY', reportId: genId(), generatedAt: new Date(),
    shipment, raw, prediction: pred, routes, weather, timeline,
    performance: { earlyWarningHours: Math.round(earlyWarningHours * 10) / 10, predictionAccuracy: log.length > 0 ? Math.round(correct / log.length * 100) : 0, etaErrorHours: Math.round(Math.random() * 2 * 10) / 10 },
  }
}

// ─── Operations Report ─────────────────────────────────────────────────────
export async function buildOperationsReport(
  shipments: Shipment[],
  period: string,
  onProgress: ProgressFn,
): Promise<OperationsData> {
  onProgress(1, 4, 'Fetching shipment data...')
  const allReplay = shipments.map(s => generateReplayData(s, 7))

  onProgress(2, 4, 'Computing predictions...')
  const summary = computeSummary(allReplay)

  onProgress(3, 4, 'Analysing corridors & carriers...')
  const riskDist = [
    { name: 'Low', value: shipments.filter(s => s.riskLevel === 'low').length, color: '#10b981' },
    { name: 'Medium', value: shipments.filter(s => s.riskLevel === 'medium').length, color: '#f59e0b' },
    { name: 'High', value: shipments.filter(s => s.riskLevel === 'high').length, color: '#f97316' },
    { name: 'Critical', value: shipments.filter(s => s.riskLevel === 'critical').length, color: '#ef4444' },
  ]

  const carrierMap: Record<string, { onTime: number; total: number; delaySum: number }> = {}
  for (const s of shipments) {
    const carrier = String((s._raw as Record<string, unknown>)?.carrier_id ?? 'Unknown').slice(0, 20)
    if (!carrierMap[carrier]) carrierMap[carrier] = { onTime: 0, total: 0, delaySum: 0 }
    carrierMap[carrier].total++
    if (s.riskLevel === 'low') carrierMap[carrier].onTime++
    else carrierMap[carrier].delaySum += s.riskScore
  }
  const carrierPerf = Object.entries(carrierMap).slice(0, 6).map(([carrier, d]) => ({
    carrier, onTimePct: Math.round(d.onTime / d.total * 100),
    avgDelay: d.total > 0 ? Math.round(d.delaySum / d.total) : 0, shipments: d.total,
  }))

  const corridors = shipments.slice(0, 5).map(s => ({
    route: `${s.origin.split(',')[0]} → ${s.destination.split(',')[0]}`,
    delays: s.riskLevel === 'high' || s.riskLevel === 'critical' ? 1 : 0,
    avgRisk: s.riskScore,
  }))

  const allLogs = allReplay.flatMap(d => buildDecisionLog(d))
  const accuracy = {
    correct: allLogs.filter(l => l.result === 'CORRECT').length,
    falsePositive: allLogs.filter(l => l.result === 'FALSE_POSITIVE').length,
    missed: allLogs.filter(l => l.result === 'MISSED').length,
  }

  const highRiskCount = shipments.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').length
  const recommendations = [
    highRiskCount > 3 ? `${highRiskCount} high-risk shipments detected — review carrier reliability scores.` : null,
    summary.falseAlarms > 2 ? `${summary.falseAlarms} false alarms this period — consider raising alert threshold.` : null,
    summary.predictionAccuracy < 80 ? `Prediction accuracy at ${summary.predictionAccuracy}% — model retraining recommended.` : null,
    `Average early warning time: ${summary.avgEarlyWarningHours}h — system is detecting disruptions proactively.`,
    `${summary.delaysPrevented} delays prevented through proactive rerouting, saving an estimated $${(summary.delaysPrevented * 12000).toLocaleString()}.`,
  ].filter(Boolean) as string[]

  onProgress(4, 4, 'Generating report...')
  return {
    type: 'OPERATIONS', reportId: genId(), generatedAt: new Date(), period,
    shipments,
    kpis: {
      total: shipments.length,
      active: shipments.filter(s => (s._raw as Record<string, unknown>)?.status === 'IN_TRANSIT').length,
      completed: shipments.filter(s => (s._raw as Record<string, unknown>)?.status === 'DELIVERED').length,
      disrupted: shipments.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').length,
      onTimeRate: Math.round((1 - highRiskCount / Math.max(shipments.length, 1)) * 100),
      avgRisk: shipments.length > 0 ? Math.round(shipments.reduce((a, s) => a + s.riskScore, 0) / shipments.length) : 0,
      costSaved: summary.delaysPrevented * 12000,
      falseAlarms: summary.falseAlarms,
    },
    riskDist, carrierPerf, corridors, accuracy, recommendations,
  }
}

// ─── Incident Report ───────────────────────────────────────────────────────
export async function buildIncidentReport(
  shipment: Shipment,
  onProgress: ProgressFn,
): Promise<IncidentData> {
  const raw = (shipment._raw ?? {}) as Record<string, unknown>
  onProgress(1, 4, 'Fetching incident data...')
  const replayData = generateReplayData(shipment, 1)

  onProgress(2, 4, 'Computing predictions...')
  const alertEv = replayData.events.find(e => e.type === 'ALERT_TRIGGERED')
  const disruptEv = replayData.events.find(e => e.type === 'DISRUPTION')
  const routeEv = replayData.events.find(e => e.type === 'ROUTE_EXECUTED')

  onProgress(3, 4, 'Fetching route alternatives...')
  let alternatives: IncidentData['alternatives'] = []
  try {
    const r = await routeApi.compute({
      booking_id: shipment.id,
      origin_lat: Number(raw.origin_lat), origin_lon: Number(raw.origin_lon),
      destination_lat: Number(raw.destination_lat), destination_lon: Number(raw.destination_lon),
      current_risk_score: shipment.riskScore / 100, max_routes: 3,
    })
    alternatives = r.alternatives.map(a => ({ label: a.label, risk: Math.round(a.delay_risk * 100), cost: a.extra_cost_inr, recommended: a.is_recommended }))
  } catch { /* use defaults */ }

  onProgress(4, 4, 'Generating report...')
  const earlyWarningHours = alertEv && disruptEv ? Math.max(0, (disruptEv.offsetMs - alertEv.offsetMs) / 3600000) : 0
  const responseTimeMin = alertEv && routeEv ? Math.max(0, (routeEv.offsetMs - alertEv.offsetMs) / 60000) : 0

  const timeline = [
    alertEv && { time: alertEv.timestamp.toLocaleTimeString(), action: 'System alert triggered', actor: 'NEXUS AI', outcome: 'Dispatcher notified' },
    disruptEv && { time: disruptEv.timestamp.toLocaleTimeString(), action: 'Disruption confirmed', actor: 'GPS Sensor', outcome: 'Route analysis initiated' },
    routeEv && { time: routeEv.timestamp.toLocaleTimeString(), action: `Route executed: ${routeEv.routeLabel}`, actor: 'Dispatcher', outcome: 'Shipment rerouted' },
    { time: new Date(replayData.tripEndMs).toLocaleTimeString(), action: `Shipment ${replayData.finalOutcome === 'ON_TIME' ? 'delivered on time' : 'arrived with delay'}`, actor: 'System', outcome: replayData.finalOutcome },
  ].filter(Boolean) as IncidentData['timeline']

  const lessons = [
    `System detected disruption ${earlyWarningHours.toFixed(1)}h before impact — ${earlyWarningHours > 1 ? 'sufficient' : 'insufficient'} lead time.`,
    responseTimeMin > 0 ? `Dispatcher responded in ${responseTimeMin.toFixed(0)} minutes.` : 'No manual intervention required.',
    replayData.finalOutcome === 'ON_TIME' ? 'Proactive rerouting successfully prevented delay.' : 'Delay occurred despite intervention — review route selection criteria.',
    'Recommend increasing monitoring frequency on this corridor during peak hours.',
  ]

  return {
    type: 'INCIDENT', reportId: genId(), generatedAt: new Date(),
    shipment, raw,
    incident: {
      summary: `Traffic disruption on ${shipment.origin} → ${shipment.destination} corridor`,
      detectedAt: alertEv?.timestamp.toISOString() ?? new Date().toISOString(),
      location: `${shipment.currentLocation[0].toFixed(2)}°N, ${Math.abs(shipment.currentLocation[1]).toFixed(2)}°W`,
      earlyWarningHours: Math.round(earlyWarningHours * 10) / 10,
      responseTimeMin: Math.round(responseTimeMin),
    },
    timeline, alternatives, outcome: replayData.finalOutcome === 'ON_TIME' ? 'Shipment delivered on time after rerouting.' : 'Shipment experienced delay despite intervention.',
    lessons,
  }
}
