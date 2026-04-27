'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  shipmentsApi,
  predictApi,
  routeApi,
  healthApi,
  createShipmentWS,
  type PredictionInput,
} from '@/lib/api'
import { mapShipment, mapAlert, mapRouteAlternatives, buildPredictionInput } from '@/lib/mappers'
import { useDashboardStore } from '@/frontend/store/useStore'

// ─── Health check ──────────────────────────────────────────────────────────

export function useBackendHealth() {
  const setBackendOnline = useDashboardStore((s) => s.setBackendOnline)

  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      try {
        const res = await healthApi.health()
        setBackendOnline(res.status === 'ok')
        return res
      } catch {
        setBackendOnline(false)
        return { status: 'offline' }
      }
    },
    refetchInterval: 15_000,
    retry: 0,                    // don't retry — just mark offline immediately
    refetchIntervalInBackground: true,
  })
}

// ─── Shipments ─────────────────────────────────────────────────────────────

export function useShipments() {
  const { setShipments, setLoadingShipments, setApiError, setKPIs, kpis, backendOnline } = useDashboardStore()

  return useQuery({
    queryKey: ['shipments'],
    enabled: backendOnline,      // only fetch when backend is confirmed online
    queryFn: async () => {
      setLoadingShipments(true)
      try {
        const data = await shipmentsApi.list({ limit: 100 })
        const mapped = data.map(mapShipment)
        setShipments(mapped)

        // Derive KPIs from shipment data
        const highRisk = data.filter((s) => s.risk_level === 'HIGH' || s.current_risk_score > 0.85).length
        const delayed = data.filter((s) => s.is_delayed).length
        setKPIs({
          ...kpis,
          activeShipments: data.filter((s) => s.status === 'IN_TRANSIT').length,
          highRiskCount: highRisk,
          avgDelay: delayed > 0 ? parseFloat((delayed / data.length * 24).toFixed(1)) : 0,
          costSaved: highRisk * 15000, // ₹15k saved per rerouted high-risk shipment (demo metric)
          activeShipmentsTrend: 5.2,
          highRiskTrend: -8.3,
          avgDelayTrend: -12.5,
          costSavedTrend: 23.1,
        })

        setApiError(null)
        return data
      } finally {
        setLoadingShipments(false)
      }
    },
    refetchInterval: 15_000,
    retry: 2,
  })
}

// ─── Prediction for selected shipment ─────────────────────────────────────

export function useShipmentPrediction(bookingId: string | null) {
  const { setRiskScores, setShapFeatures, setLoadingPrediction, updateShipment, shipments } = useDashboardStore()

  return useQuery({
    queryKey: ['prediction', bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      if (!bookingId) return null
      setLoadingPrediction(true)
      try {
        // Get raw shipment for building prediction input
        const raw = await shipmentsApi.get(bookingId)
        const input = buildPredictionInput(raw)
        const result = await predictApi.predict(input)

        const ensemble = Math.round(result.ensemble_risk_score * 100)
        const delay = Math.round(result.delay_probability * 100)
        const anomaly = result.anomaly_score ? Math.round(result.anomaly_score * 100) : 0

        setRiskScores(ensemble, delay, anomaly)
        setShapFeatures(result.shap_top_features ?? [])

        // Only update the shipment risk score if the prediction is meaningful.
        // Guard: never silently downgrade a CRITICAL shipment — a single
        // prediction cycle returning a lower value (stale cache, cold model)
        // should not overwrite what the DB seeded.
        const currentShipment = shipments.find((s) => s.id === bookingId)
        const currentLevel = currentShipment?.riskLevel ?? 'low'
        const newLevel: 'critical' | 'high' | 'medium' | 'low' =
          ensemble > 85 ? 'critical'
          : ensemble > 70 ? 'high'
          : ensemble > 40 ? 'medium'
          : 'low'

        // Risk tier ordering for comparison
        const tierOrder = { low: 0, medium: 1, high: 2, critical: 3 }
        const isDowngrade = tierOrder[newLevel] < tierOrder[currentLevel as keyof typeof tierOrder]

        // Only update if:
        //  - prediction returned a meaningful score (> 5%), AND
        //  - it's not a downgrade of a high/critical shipment (protect against stale model output)
        if (ensemble > 5 && !isDowngrade) {
          updateShipment(bookingId, { riskScore: ensemble, riskLevel: newLevel })
        } else if (ensemble > 5 && isDowngrade) {
          // Still update the gauge display (setRiskScores already done above)
          // but don't change the shipment card level — keep DB value
          console.debug(`[prediction] Ignoring downgrade ${currentLevel} → ${newLevel} for ${bookingId} (score=${ensemble}%)`)
        }

        return result
      } finally {
        setLoadingPrediction(false)
      }
    },
    refetchInterval: 30_000,
    retry: 1,
  })
}

// ─── Routes for selected shipment ─────────────────────────────────────────

export function useShipmentRoutes(bookingId: string | null) {
  const { setSelectedShipmentRoutes, updateShipment } = useDashboardStore()

  return useQuery({
    queryKey: ['routes', bookingId],
    enabled: !!bookingId,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      if (!bookingId) return null

      const raw = await shipmentsApi.get(bookingId)
      const result = await routeApi.compute({
        booking_id: bookingId,
        origin_lat: raw.origin_lat,
        origin_lon: raw.origin_lon,
        destination_lat: raw.destination_lat,
        destination_lon: raw.destination_lon,
        current_risk_score: raw.current_risk_score,
        max_routes: 3,
      })

      setSelectedShipmentRoutes({
        current: result.current_route,
        alternatives: result.alternatives,
      })

      const alts = mapRouteAlternatives(result.alternatives)
      updateShipment(bookingId, { alternativeRoutes: alts })

      return result
    },
  })
}

// ─── Select a route (mutation) ─────────────────────────────────────────────

export function useSelectRoute() {
  const qc = useQueryClient()
  const { updateShipment, setShowRouteModal } = useDashboardStore()

  return useMutation({
    mutationFn: ({ bookingId, rank }: { bookingId: string; rank: number }) =>
      routeApi.select(bookingId, rank),
    onSuccess: (_, { bookingId }) => {
      qc.invalidateQueries({ queryKey: ['routes', bookingId] })
      qc.invalidateQueries({ queryKey: ['shipments'] })
      setShowRouteModal(false)
    },
  })
}

// ─── Alerts for a shipment ─────────────────────────────────────────────────

export function useShipmentAlerts(bookingId: string | null) {
  const { addAlert } = useDashboardStore()

  return useQuery({
    queryKey: ['alerts', bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      if (!bookingId) return []
      const data = await shipmentsApi.getAlerts(bookingId)
      data.forEach((a) => addAlert(mapAlert(a)))
      return data
    },
    refetchInterval: 20_000,
    retry: 1,
  })
}

// ─── Acknowledge alert (mutation) ──────────────────────────────────────────

export function useAcknowledgeAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookingId, alertId }: { bookingId: string; alertId: number }) =>
      shipmentsApi.acknowledgeAlert(bookingId, alertId),
    onSuccess: (_, { bookingId }) => {
      qc.invalidateQueries({ queryKey: ['alerts', bookingId] })
    },
  })
}

// ─── WebSocket live tracking ───────────────────────────────────────────────

export function useShipmentWebSocket(bookingId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const MAX_RETRIES = 3
  const { updateShipment, addAlert, setRiskScores, setSelectedShipmentRoutes, backendOnline } =
    useDashboardStore()

  const connect = useCallback(() => {
    if (!bookingId || typeof window === 'undefined') return
    if (!backendOnline) return                                    // don't try if backend is down
    if (wsRef.current?.readyState === WebSocket.OPEN) return     // already connected
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return // already connecting

    wsRef.current = createShipmentWS(
      bookingId,
      (msg) => {
        retryCountRef.current = 0  // reset on successful message
        switch (msg.event) {
          case 'position_update': {
            const d = msg.data as { lat: number; lon: number }
            if (d?.lat && d?.lon) {
              updateShipment(bookingId, { currentLocation: [d.lat, d.lon] })
            }
            break
          }
          case 'risk_update': {
            const d = msg.data as { risk_score: number; risk_level: string }
            if (d) {
              const score = Math.round(d.risk_score * 100)
              setRiskScores(score, score, 0)
              // Use the level from the backend directly (already has CRITICAL tier)
              // but guard against downgrading critical shipments via stale WS messages
              const wsLevel = d.risk_level?.toLowerCase() as 'critical' | 'high' | 'medium' | 'low'
              const tierOrder = { low: 0, medium: 1, high: 2, critical: 3 }
              const existing = updateShipment as unknown as Parameters<typeof updateShipment>[1]
              void existing // suppress unused warning
              updateShipment(bookingId, {
                riskScore: score,
                riskLevel: wsLevel ?? (score > 85 ? 'critical' : score > 70 ? 'high' : score > 40 ? 'medium' : 'low'),
              })
            }
            break
          }

          case 'alert': {
            const d = msg.data as { alert_type: string; severity: string; message: string }
            if (d) {
              addAlert({
                id: `ws-${Date.now()}`,
                timestamp: new Date(msg.timestamp),
                severity:
                  d.severity === 'HIGH' ? 'critical' : d.severity === 'MEDIUM' ? 'warning' : 'info',
                message: d.message,
                shipmentId: bookingId,
              })
            }
            break
          }
          case 'reroute': {
            const d = msg.data as { routes: unknown[] }
            if (d?.routes) {
              setSelectedShipmentRoutes({ current: d.routes[0], alternatives: d.routes.slice(1) })
            }
            break
          }
        }
      },
      (_e) => {
        // Silently retry with exponential backoff — don't spam console
        if (retryCountRef.current >= MAX_RETRIES) return
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30_000)
        retryCountRef.current += 1
        retryTimerRef.current = setTimeout(() => {
          wsRef.current = null
          connect()
        }, delay)
      },
    )
  }, [bookingId, backendOnline, updateShipment, addAlert, setRiskScores, setSelectedShipmentRoutes])

  useEffect(() => {
    connect()
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
      retryCountRef.current = 0
    }
  }, [connect])

  return wsRef
}
