/**
 * NEXUS Advisor — Intent Parser & NLG Engine
 * Template-based, no LLM. Regex/keyword matching → structured response.
 */

import {
  predictApi,
  routeApi,
  externalApi,
  shipmentsApi,
  type PredictionResponse,
  type RouteOption,
  type WeatherResponse,
} from '@/lib/api'
import { buildPredictionInput } from '@/lib/mappers'

// ─── Message types ─────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'bot'

export interface BaseMessage {
  id: string
  role: MessageRole
  text: string
  timestamp: Date
}

export interface ExplanationPayload {
  type: 'explanation'
  bookingId: string
  riskScore: number
  riskLevel: string
  delayProb: number
  shapFeatures: { feature: string; value: number }[]
  recommendation: string
}

export interface ComparisonPayload {
  type: 'comparison'
  bookingId: string
  current: RouteOption
  alternatives: RouteOption[]
}

export interface WhatIfPayload {
  type: 'whatif'
  originalRisk: number
  newRisk: number
  newRiskLevel: string
  delayHours: number
  verdict: string
  missesDeadline: boolean
}

export interface WeatherPayload {
  type: 'weather'
  origin: WeatherResponse
  destination: WeatherResponse
  corridorRisk: number
  recommendation: string
}

export interface FallbackPayload {
  type: 'fallback'
}

export type BotPayload =
  | ExplanationPayload
  | ComparisonPayload
  | WhatIfPayload
  | WeatherPayload
  | FallbackPayload

export interface BotMessage extends BaseMessage {
  role: 'bot'
  payload?: BotPayload
}

export interface UserMessage extends BaseMessage {
  role: 'user'
}

export type Message = UserMessage | BotMessage

// ─── Intent detection ──────────────────────────────────────────────────────

export type Intent =
  | 'EXPLANATION'
  | 'COMPARISON'
  | 'WHATIF'
  | 'WEATHER'
  | 'STATUS'
  | 'FALLBACK'

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase()

  if (/why|risky|flagged|high risk|explain risk|what.s wrong/.test(t)) return 'EXPLANATION'
  if (/compare|vs|versus|alternative|which route|better route/.test(t)) return 'COMPARISON'
  if (/what if|wait|delay|if i wait|postpone/.test(t)) return 'WHATIF'
  if (/weather|rain|storm|wind|temperature|forecast|snow/.test(t)) return 'WEATHER'
  if (/status|where|location|eta|arrival|how far/.test(t)) return 'STATUS'

  return 'FALLBACK'
}

// Extract hours from "wait 2 hours", "delay 3h", etc.
export function extractHours(text: string): number {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h)/i)
  return match ? parseFloat(match[1]) : 2
}

// ─── Response generators ───────────────────────────────────────────────────

function msgId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export async function generateResponse(
  intent: Intent,
  userText: string,
  bookingId: string | null,
  shipments: import('@/frontend/store/useStore').Shipment[],
): Promise<BotMessage> {
  const now = new Date()

  // Resolve which shipment to use
  const shipment = bookingId
    ? shipments.find((s) => s.id === bookingId)
    : shipments.find((s) => s.riskLevel === 'critical' || s.riskLevel === 'high')

  if (!shipment && intent !== 'FALLBACK') {
    return {
      id: msgId(),
      role: 'bot',
      timestamp: now,
      text: 'No shipment is currently selected. Click a shipment on the map or list first.',
      payload: { type: 'fallback' },
    }
  }

  try {
    switch (intent) {
      case 'EXPLANATION': {
        const raw = shipment!._raw as Record<string, unknown>
        let pred: PredictionResponse

        try {
          pred = await predictApi.explain(shipment!.id)
        } catch {
          // Fallback: run fresh prediction
          const input = buildPredictionInput(raw as any)
          pred = await predictApi.predict(input)
        }

        const riskPct = Math.round(pred.ensemble_risk_score * 100)
        const delayPct = Math.round(pred.delay_probability * 100)
        const shap = (pred.shap_top_features ?? []).slice(0, 4).map((f) => ({
          feature: f.feature.replace(/_/g, ' '),
          value: Math.abs(f.shap_value),
        }))

        const topDriver = shap[0]
        const naturalText = buildExplanationText(shipment!.id, riskPct, delayPct, shap, pred.risk_level)

        return {
          id: msgId(),
          role: 'bot',
          timestamp: now,
          text: naturalText,
          payload: {
            type: 'explanation',
            bookingId: shipment!.id,
            riskScore: riskPct,
            riskLevel: pred.risk_level,
            delayProb: delayPct,
            shapFeatures: shap,
            recommendation: pred.recommendation,
          },
        }
      }

      case 'COMPARISON': {
        const raw = shipment!._raw as Record<string, unknown>
        const result = await routeApi.compute({
          booking_id: shipment!.id,
          origin_lat: Number(raw.origin_lat),
          origin_lon: Number(raw.origin_lon),
          destination_lat: Number(raw.destination_lat),
          destination_lon: Number(raw.destination_lon),
          current_risk_score: Number(raw.current_risk_score) || 0.5,
          max_routes: 3,
        })

        const best = result.alternatives.find((a) => a.is_recommended) ?? result.alternatives[0]
        const saving = best
          ? Math.round((result.current_route.delay_risk - best.delay_risk) * 100)
          : 0

        const text = best
          ? `Route comparison for **${shipment!.id}**:\n\nCurrent route carries ${Math.round(result.current_route.delay_risk * 100)}% delay risk. ` +
            `**${best.label}** reduces risk to ${Math.round(best.delay_risk * 100)}% — a ${saving}% improvement. ` +
            `Extra cost: $${best.extra_cost_inr.toLocaleString()}. ` +
            (best.is_recommended ? 'This is the recommended route.' : '')
          : `Only one route available for ${shipment!.id}.`

        return {
          id: msgId(),
          role: 'bot',
          timestamp: now,
          text,
          payload: {
            type: 'comparison',
            bookingId: shipment!.id,
            current: result.current_route,
            alternatives: result.alternatives,
          },
        }
      }

      case 'WHATIF': {
        const delayHours = extractHours(userText)
        const raw = shipment!._raw as Record<string, unknown>
        const now2 = new Date()

        // Re-predict with shifted time
        const shiftedHour = (now2.getHours() + delayHours) % 24
        const isPeak = (shiftedHour >= 7 && shiftedHour <= 9) || (shiftedHour >= 16 && shiftedHour <= 19)

        const input = buildPredictionInput(raw as any)
        const shifted = {
          ...input,
          hour_of_day: Math.round(shiftedHour),
          is_peak_hour: isPeak ? 1 : 0,
          // Waiting reduces congestion slightly
          corridor_congestion_index: Math.max(0, (input.corridor_congestion_index ?? 0.4) - 0.15),
        }

        const pred = await predictApi.predict(shifted)
        const originalRisk = shipment!.riskScore
        const newRisk = Math.round(pred.ensemble_risk_score * 100)
        const improved = newRisk < originalRisk

        // Check if waiting causes a deadline miss (heuristic: ETA + delay > 8h)
        const etaHours = Number(raw.distance_km ?? 500) / 104.6
        const missesDeadline = delayHours > etaHours * 0.3

        const verdict = buildWhatIfVerdict(originalRisk, newRisk, delayHours, missesDeadline, improved)

        return {
          id: msgId(),
          role: 'bot',
          timestamp: now,
          text: verdict,
          payload: {
            type: 'whatif',
            originalRisk,
            newRisk,
            newRiskLevel: pred.risk_level,
            delayHours,
            verdict,
            missesDeadline,
          },
        }
      }

      case 'WEATHER': {
        const raw = shipment!._raw as Record<string, unknown>
        const oLat = Number(raw.origin_lat)
        const oLon = Number(raw.origin_lon)
        const dLat = Number(raw.destination_lat)
        const dLon = Number(raw.destination_lon)

        const [corridor, wxOrigin, wxDest] = await Promise.all([
          externalApi.corridor(oLat, oLon, dLat, dLon),
          externalApi.weather(oLat, oLon),
          externalApi.weather(dLat, dLon),
        ])

        const text = buildWeatherText(shipment!.id, wxOrigin, wxDest, corridor.summary)

        return {
          id: msgId(),
          role: 'bot',
          timestamp: now,
          text,
          payload: {
            type: 'weather',
            origin: wxOrigin,
            destination: wxDest,
            corridorRisk: corridor.summary.corridor_risk,
            recommendation: corridor.summary.recommendation,
          },
        }
      }

      case 'STATUS': {
        const s = shipment!
        const raw = s._raw as Record<string, unknown>
        const dist = Number(raw.distance_km ?? 0)
        const text =
          `**${s.id}** is currently **${String(raw.status ?? 'IN_TRANSIT').replace('_', ' ')}**.\n\n` +
          `Route: ${s.origin} → ${s.destination} (${dist.toFixed(0)} km)\n` +
          `Risk: ${s.riskScore}% ${s.riskLevel.toUpperCase()}\n` +
          `ETA: ${s.eta}\n` +
          `Carrier: ${String(raw.carrier_id ?? 'Unknown')}`

        return {
          id: msgId(),
          role: 'bot',
          timestamp: now,
          text,
          payload: { type: 'fallback' },
        }
      }

      default:
        return fallbackMessage()
    }
  } catch (err) {
    return {
      id: msgId(),
      role: 'bot',
      timestamp: now,
      text: `I couldn't fetch the data right now. Make sure the backend is running at localhost:8000.`,
      payload: { type: 'fallback' },
    }
  }
}

// ─── NLG helpers ───────────────────────────────────────────────────────────

function buildExplanationText(
  id: string,
  risk: number,
  delay: number,
  shap: { feature: string; value: number }[],
  level: string,
): string {
  const top = shap.slice(0, 3)
  const drivers = top
    .map((f, i) => {
      const pct = Math.round(f.value * 100)
      return `${i + 1}. **${f.feature}** contributes ${pct}% to risk`
    })
    .join('\n')

  return (
    `**${id}** is flagged **${level} RISK** with an ensemble score of ${risk}%.\n\n` +
    `Delay probability: ${delay}%\n\n` +
    `Top risk drivers:\n${drivers}\n\n` +
    `${level === 'HIGH' ? '⚠ Immediate rerouting is recommended.' : 'Monitor closely and prepare alternatives.'}`
  )
}

function buildWhatIfVerdict(
  original: number,
  newRisk: number,
  hours: number,
  missesDeadline: boolean,
  improved: boolean,
): string {
  const delta = original - newRisk
  const direction = improved ? `drops to ${newRisk}%` : `increases to ${newRisk}%`

  let verdict = `If you wait **${hours} hour${hours !== 1 ? 's' : ''}**, risk ${direction} (was ${original}%).`

  if (improved && delta > 20) {
    verdict += ` That's a significant improvement.`
  } else if (improved && delta <= 10) {
    verdict += ` The improvement is marginal.`
  } else if (!improved) {
    verdict += ` Waiting makes things worse.`
  }

  if (missesDeadline) {
    verdict += `\n\n⚠ **Warning:** This delay likely causes a missed delivery window. Not recommended.`
  } else if (improved && delta > 15) {
    verdict += `\n\n✅ **Verdict:** Waiting is beneficial if no hard deadline exists.`
  } else {
    verdict += `\n\n**Verdict:** Proceed now — the risk reduction doesn't justify the delay.`
  }

  return verdict
}

function buildWeatherText(
  id: string,
  origin: WeatherResponse,
  dest: WeatherResponse,
  summary: { avg_congestion: number; max_weather_severity: number; corridor_risk: number; recommendation: string },
): string {
  const worstSeverity = Math.max(origin.severity, dest.severity)
  const severityLabel = worstSeverity > 3.5 ? 'Severe' : worstSeverity > 2 ? 'Moderate' : 'Mild'

  return (
    `Weather analysis for **${id}** corridor:\n\n` +
    `**Origin:** ${origin.condition}, ${origin.temperature_f.toFixed(0)}°F, ` +
    `${origin.precipitation_mm.toFixed(1)}mm precip, wind ${origin.wind_speed_mph.toFixed(0)} mph\n` +
    `**Destination:** ${dest.condition}, ${dest.temperature_f.toFixed(0)}°F, ` +
    `${dest.precipitation_mm.toFixed(1)}mm precip, wind ${dest.wind_speed_mph.toFixed(0)} mph\n\n` +
    `Overall severity: **${severityLabel}** (${worstSeverity.toFixed(1)}/5)\n` +
    `Corridor risk: ${Math.round(summary.corridor_risk * 100)}%\n\n` +
    `${summary.recommendation}`
  )
}

function fallbackMessage(): BotMessage {
  return {
    id: msgId(),
    role: 'bot',
    timestamp: new Date(),
    text:
      "I can help with:\n\n" +
      "• **\"Why is this risky?\"** — SHAP explanation\n" +
      "• **\"Compare alternatives\"** — Route comparison\n" +
      "• **\"What if I wait 2 hours?\"** — Scenario analysis\n" +
      "• **\"Explain the weather\"** — Weather deep-dive\n" +
      "• **\"What's the status?\"** — Shipment status\n\n" +
      "Select a shipment first, then ask away.",
    payload: { type: 'fallback' },
  }
}

// ─── Quick-action chips ────────────────────────────────────────────────────

export interface QuickChip {
  label: string
  intent: Intent
  text: string
  icon: string
}

export function getQuickChips(riskLevel: string | null): QuickChip[] {
  const base: QuickChip[] = [
    { label: 'Why is this risky?', intent: 'EXPLANATION', text: 'Why is this shipment flagged high risk?', icon: '⚠' },
    { label: 'Compare routes', intent: 'COMPARISON', text: 'Compare current route vs alternatives', icon: '🗺' },
    { label: 'Weather impact', intent: 'WEATHER', text: 'Explain the weather conditions on this route', icon: '🌧' },
    { label: 'What if I wait 2h?', intent: 'WHATIF', text: 'What if I wait 2 hours before departing?', icon: '⏱' },
    { label: 'Shipment status', intent: 'STATUS', text: "What's the current status of this shipment?", icon: '📍' },
  ]

  // Prioritise explanation chip for high-risk shipments
  if (riskLevel === 'high' || riskLevel === 'critical') {
    return base
  }
  return [base[4], base[2], base[1], base[3]]
}
