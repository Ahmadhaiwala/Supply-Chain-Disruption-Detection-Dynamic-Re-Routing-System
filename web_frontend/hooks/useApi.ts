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
      const res = await healthApi.health()
      setBackendOnline(res.status === 'ok')
      return res
    },
    refetchInterval: 30_000,
    retry: 1,
  })
}

// ─── Shipments ─────────────────────────────────────────────────────────────

export function useShipments() {
  const { setShipments, setLoadingShipments, setApiError, setKPIs, kpis } = useDashboardStore()

  return useQuery({
    queryKey: ['shipments'],
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
  const { setRiskScores, setShapFeatures, setLoadingPrediction, updateShipment } = useDashboardStore()

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

        // Update shipment risk in store
        updateShipment(bookingId, {
          riskScore: ensemble,
          riskLevel:
            ensemble > 85 ? 'critical' : ensemble > 70 ? 'high' : ensemble > 40 ? 'medium' : 'low',
        })

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
  const { setSelectedShipmentRoutes, setLoadingRoutes, updateShipment, shipments } = useDashboardStore()

  return useQuery({
    queryKey: ['routes', bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      if (!bookingId) return null
      setLoadingRoutes(true)
      try {
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

        // Attach alternative routes to shipment in store
        const alts = mapRouteAlternatives(result.alternatives)
        updateShipment(bookingId, { alternativeRoutes: alts })

        return result
      } finally {
        setLoadingRoutes(false)
      }
    },
    retry: 1,
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
  const { updateShipment, addAlert, setRiskScores, setSelectedShipmentRoutes } = useDashboardStore()

  const connect = useCallback(() => {
    if (!bookingId || typeof window === 'undefined') return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    wsRef.current = createShipmentWS(
      bookingId,
      (msg) => {
        switch (msg.event) {
          case 'position_update': {
            const d = msg.data as { lat: number; lon: number }
            if (d?.lat && d?.lon) {
              updateShipment(bookingId, { currentLocation: [d.lat, d.lon] })
            }
            break
          }
          case 'risk_update': {
            const d = msg.data as { risk_score: number; risk_level: string; recommendation: string }
            if (d) {
              const score = Math.round(d.risk_score * 100)
              setRiskScores(score, score, 0)
              updateShipment(bookingId, {
                riskScore: score,
                riskLevel:
                  score > 85 ? 'critical' : score > 70 ? 'high' : score > 40 ? 'medium' : 'low',
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
      (e) => console.warn('WS error', e),
    )
  }, [bookingId, updateShipment, addAlert, setRiskScores, setSelectedShipmentRoutes])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return wsRef
}
