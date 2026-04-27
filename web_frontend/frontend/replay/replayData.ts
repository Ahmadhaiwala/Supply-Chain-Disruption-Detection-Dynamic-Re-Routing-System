/**
 * Replay data layer — synthesises realistic history from existing shipments.
 * Deterministic per booking_id so replays are consistent.
 */
import type { Shipment } from '@/frontend/store/useStore'

export type EventType = 'GPS_UPDATE' | 'ALERT_TRIGGERED' | 'DISRUPTION' | 'ROUTE_EXECUTED' | 'PREDICTION_MADE'

export interface ReplayEvent {
  id: string
  type: EventType
  timestamp: Date
  offsetMs: number
  bookingId: string
  lat: number
  lon: number
  riskScore: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  delayProbability: number
  details: string
  routeLabel?: string
  predictedOutcome?: 'DELAYED' | 'ON_TIME'
  actualOutcome?: 'DELAYED' | 'ON_TIME'
}

export interface ReplayShipmentData {
  bookingId: string
  origin: string
  destination: string
  originCoords: [number, number]
  destCoords: [number, number]
  tripStartMs: number
  tripEndMs: number
  durationMs: number
  finalOutcome: 'DELAYED' | 'ON_TIME'
  events: ReplayEvent[]
  fullPath: [number, number][]
}

export interface DecisionLogEntry {
  time: Date
  event: string
  predictedRisk: number
  action: string
  actualOutcome: 'DELAYED' | 'ON_TIME'
  result: 'CORRECT' | 'FALSE_POSITIVE' | 'MISSED' | 'N/A'
}

export interface ReplaySummary {
  totalShipments: number
  predictionAccuracy: number
  delaysPrevented: number
  falseAlarms: number
  avgEarlyWarningHours: number
}

// ─── Seeded RNG ────────────────────────────────────────────────────────────
function seededRng(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}
function strSeed(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function lerp(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function buildPath(start: [number, number], end: [number, number], rng: () => number, steps = 20): [number, number][] {
  const path: [number, number][] = [start]
  for (let i = 1; i < steps; i++) {
    const base = lerp(start, end, i / steps)
    path.push([base[0] + (rng() - 0.5) * 0.25, base[1] + (rng() - 0.5) * 0.25])
  }
  path.push(end)
  return path
}

function buildRiskCurve(isDelayed: boolean, rng: () => number, steps: number): number[] {
  const curve: number[] = []
  let risk = 15 + rng() * 15
  for (let i = 0; i < steps; i++) {
    const t = i / steps
    const target = isDelayed
      ? (t < 0.3 ? 20 : t < 0.6 ? 60 : t < 0.8 ? 82 : 75)
      : (t < 0.5 ? 18 : 14)
    risk = risk * 0.75 + target * 0.25 + (rng() - 0.5) * 7
    curve.push(Math.max(5, Math.min(95, Math.round(risk))))
  }
  return curve
}

export function generateReplayData(shipment: Shipment, daysAgo = 3): ReplayShipmentData {
  const rng = seededRng(strSeed(shipment.id))
  const raw = shipment._raw as Record<string, unknown> | undefined
  const isDelayed = shipment.riskLevel === 'high' || shipment.riskLevel === 'critical'
  const finalOutcome: 'DELAYED' | 'ON_TIME' = isDelayed ? 'DELAYED' : 'ON_TIME'

  const now = Date.now()
  const tripStartMs = now - daysAgo * 24 * 3600 * 1000
  const distKm = Number(raw?.distance_km ?? 500)
  const tripDurationMs = (distKm / 104.6) * 3600 * 1000 * (isDelayed ? 1.3 : 1.0)
  const tripEndMs = tripStartMs + tripDurationMs

  const origin = shipment.route[0] as [number, number]
  const dest = shipment.route[shipment.route.length - 1] as [number, number]
  const fullPath = buildPath(origin, dest, rng, 24)
  const STEPS = 20
  const riskCurve = buildRiskCurve(isDelayed, rng, STEPS)

  const events: ReplayEvent[] = []
  let idx = 0

  const add = (type: EventType, frac: number, details: string, extra: Partial<ReplayEvent> = {}) => {
    const offsetMs = frac * tripDurationMs
    const pi = Math.min(Math.floor(frac * fullPath.length), fullPath.length - 1)
    const ri = Math.min(Math.floor(frac * STEPS), STEPS - 1)
    const risk = riskCurve[ri]
    events.push({
      id: `${shipment.id}-${idx++}`, type,
      timestamp: new Date(tripStartMs + offsetMs), offsetMs,
      bookingId: shipment.id,
      lat: fullPath[pi][0], lon: fullPath[pi][1],
      riskScore: risk,
      riskLevel: risk >= 70 ? 'HIGH' : risk >= 40 ? 'MEDIUM' : 'LOW',
      delayProbability: Math.round(risk * 0.9 + rng() * 10),
      details, ...extra,
    })
  }

  // GPS updates every 5%
  for (let i = 0; i <= 20; i++) add('GPS_UPDATE', i / 20, `Position update — ${i * 5}% complete`)

  // Predictions
  add('PREDICTION_MADE', 0.05, 'Initial risk assessment', { predictedOutcome: isDelayed ? 'DELAYED' : 'ON_TIME', actualOutcome: finalOutcome })
  add('PREDICTION_MADE', 0.40, 'Mid-route prediction', { predictedOutcome: isDelayed ? 'DELAYED' : 'ON_TIME', actualOutcome: finalOutcome })
  add('PREDICTION_MADE', 0.70, 'Late-route prediction', { predictedOutcome: isDelayed ? 'DELAYED' : 'ON_TIME', actualOutcome: finalOutcome })

  if (isDelayed) {
    add('ALERT_TRIGGERED', 0.30, 'Risk threshold crossed — HIGH alert triggered')
    add('DISRUPTION', 0.45, 'Traffic congestion detected on corridor')
    if (rng() > 0.4) add('ROUTE_EXECUTED', 0.52, 'Dispatcher executed alternative route', { routeLabel: 'Via Bypass' })
    if (rng() > 0.5) add('ALERT_TRIGGERED', 0.72, 'Continued delay — ETA revised')
  } else {
    if (rng() > 0.6) add('ALERT_TRIGGERED', 0.40, 'Minor congestion — resolved automatically')
    add('ROUTE_EXECUTED', 0.95, 'Delivered on time', { routeLabel: 'Original Route' })
  }

  events.sort((a, b) => a.offsetMs - b.offsetMs)
  return { bookingId: shipment.id, origin: shipment.origin, destination: shipment.destination, originCoords: origin, destCoords: dest, tripStartMs, tripEndMs, durationMs: tripDurationMs, finalOutcome, events, fullPath }
}

export function buildDecisionLog(data: ReplayShipmentData): DecisionLogEntry[] {
  return data.events
    .filter(e => e.type === 'PREDICTION_MADE' || e.type === 'ALERT_TRIGGERED' || e.type === 'ROUTE_EXECUTED')
    .map(e => ({
      time: e.timestamp,
      event: e.type === 'PREDICTION_MADE' ? 'Prediction Made' : e.type === 'ALERT_TRIGGERED' ? 'Alert Triggered' : `Route: ${e.routeLabel}`,
      predictedRisk: e.riskScore,
      action: e.type === 'PREDICTION_MADE' ? `Predicted: ${e.predictedOutcome}` : e.type === 'ALERT_TRIGGERED' ? 'Dispatcher notified' : `Switched to ${e.routeLabel}`,
      actualOutcome: data.finalOutcome,
      result: (e.type === 'PREDICTION_MADE'
        ? (e.predictedOutcome === data.finalOutcome ? 'CORRECT' : e.predictedOutcome === 'DELAYED' ? 'FALSE_POSITIVE' : 'MISSED')
        : e.type === 'ALERT_TRIGGERED'
          ? (data.finalOutcome === 'DELAYED' ? 'CORRECT' : 'FALSE_POSITIVE')
          : 'N/A') as DecisionLogEntry['result'],
    }))
    .sort((a, b) => a.time.getTime() - b.time.getTime())
}

export function computeSummary(allData: ReplayShipmentData[]): ReplaySummary {
  let correct = 0, total = 0, falseAlarms = 0, delaysPrevented = 0, earlySum = 0, earlyCount = 0
  for (const d of allData) {
    for (const e of d.events) {
      if (e.type === 'PREDICTION_MADE') {
        total++
        if (e.predictedOutcome === d.finalOutcome) correct++
        else if (e.predictedOutcome === 'DELAYED') falseAlarms++
      }
    }
    const hasRoute = d.events.some(e => e.type === 'ROUTE_EXECUTED')
    if (hasRoute && d.finalOutcome === 'ON_TIME') delaysPrevented++
    const alert = d.events.find(e => e.type === 'ALERT_TRIGGERED')
    const disrupt = d.events.find(e => e.type === 'DISRUPTION')
    if (alert && disrupt && disrupt.offsetMs > alert.offsetMs) {
      earlySum += (disrupt.offsetMs - alert.offsetMs) / 3600000; earlyCount++
    }
  }
  return {
    totalShipments: allData.length,
    predictionAccuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    delaysPrevented, falseAlarms,
    avgEarlyWarningHours: earlyCount > 0 ? Math.round((earlySum / earlyCount) * 10) / 10 : 0,
  }
}
