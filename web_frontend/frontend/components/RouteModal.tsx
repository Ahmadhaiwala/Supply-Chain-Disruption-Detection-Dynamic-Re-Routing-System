'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, DollarSign, AlertTriangle, Check, Loader2, Navigation } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import { useShipmentRoutes, useSelectRoute } from '@/hooks/useApi'

export function RouteModal() {
  const {
    showRouteModal,
    setShowRouteModal,
    shipments,
    selectedShipmentId,
    shapFeatures,
  } = useDashboardStore()

  const selectedShipment = shipments.find((s) => s.id === selectedShipmentId)

  // Single hook call — isFetching is the only loading signal we need
  const { isFetching, data: routeData, error } = useShipmentRoutes(
    showRouteModal ? selectedShipmentId : null
  )

  const { mutate: selectRoute, isPending: isSelecting } = useSelectRoute()

  if (!showRouteModal || !selectedShipment) return null

  const handleExecuteRoute = (rank: number) => {
    if (!selectedShipmentId) return
    if (rank === 0) {
      setShowRouteModal(false)
      return
    }
    selectRoute({ bookingId: selectedShipmentId, rank })
  }

  // Alternatives come from the store (updated by the hook's onSuccess)
  const alternatives = selectedShipment.alternativeRoutes ?? []

  // SHAP data — real from backend or sensible fallback
  const shapData =
    shapFeatures.length > 0
      ? shapFeatures.map((f) => ({
          feature: f.feature.replace(/_/g, ' '),
          impact: f.shap_value,
          positive: f.shap_value < 0,
        }))
      : [
          { feature: 'Traffic Congestion', impact: 0.38, positive: false },
          { feature: 'Weather Severity',   impact: 0.28, positive: false },
          { feature: 'Route Risk Level',   impact: 0.18, positive: false },
          { feature: 'Driver Fatigue',     impact: 0.10, positive: false },
          { feature: 'Supplier Reliability', impact: -0.12, positive: true },
          { feature: 'Cargo Condition',    impact: -0.06, positive: true },
        ]

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowRouteModal(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-4xl z-50 glass-card p-6 overflow-y-auto max-h-[90vh]"
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className={cn('h-5 w-5', selectedShipment.riskLevel === 'critical' ? 'text-red-300' : 'text-red-400')} />
                <h2 className="text-xl font-bold text-white">Route Decision Required</h2>
              </div>
              <p className="text-sm text-slate-400">
                {selectedShipment.riskLevel === 'critical' ? '🔴 Critical' : 'High'} risk detected for{' '}
                <span className="text-white font-medium">{selectedShipment.id}</span>.
                Review alternative routes below.
              </p>
            </div>

            <button
              onClick={() => setShowRouteModal(false)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>

          {/* ── Loading ── */}
          {isFetching && alternatives.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="relative">
                <Navigation className="h-8 w-8 text-cyan-400" />
                <Loader2 className="h-14 w-14 text-cyan-500/30 animate-spin absolute -inset-3" />
              </div>
              <p className="text-slate-300 font-medium">Computing optimal routes...</p>
              <p className="text-xs text-slate-500">Running A* on USA road network graph</p>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="flex items-center gap-3 p-4 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">
                Failed to compute routes. Showing cached data if available.
              </p>
            </div>
          )}

          {/* ── Route cards ── */}
          {(!isFetching || alternatives.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

              {/* Current route */}
              <div className={cn(
                'glass-inner p-4 border-2',
                selectedShipment.riskLevel === 'critical' ? 'border-red-600/70' : 'border-red-500/50'
              )}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Current Route
                  </span>
                  <span className={cn(
                    'px-2 py-0.5 text-xs font-bold uppercase rounded-full',
                    selectedShipment.riskLevel === 'critical'
                      ? 'text-red-300 bg-red-600/30 ring-1 ring-red-500/50'
                      : selectedShipment.riskLevel === 'high'
                      ? 'text-red-400 bg-red-500/20'
                      : 'text-amber-400 bg-amber-500/20'
                  )}>
                    {selectedShipment.riskLevel === 'critical' ? '🔴 Critical' : 'High Risk'}
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className={cn('h-4 w-4', selectedShipment.riskLevel === 'critical' ? 'text-red-300' : 'text-red-400')} />
                    <span className="text-white">Risk: {selectedShipment.riskScore}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <DollarSign className="h-4 w-4" />
                    <span>Base cost</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Clock className="h-4 w-4" />
                    <span>ETA: {selectedShipment.eta}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleExecuteRoute(0)}
                  className="w-full mt-4 px-4 py-2 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  Keep Current Route
                </button>
              </div>


              {/* Alternative routes */}
              {alternatives.length > 0
                ? alternatives.slice(0, 2).map((route, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'glass-inner p-4 border-2 transition-colors',
                        route.isRecommended
                          ? 'border-cyan-500/80 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                          : 'border-cyan-500/40 hover:border-cyan-500/70',
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-400 truncate pr-1">
                          {route.label ?? `Alternative ${idx + 1}`}
                        </span>
                        <span
                          className={cn(
                            'px-2 py-0.5 text-xs font-medium uppercase rounded-full flex-shrink-0',
                            route.isRecommended
                              ? 'text-cyan-400 bg-cyan-500/20'
                              : route.riskScore < 50
                                ? 'text-emerald-400 bg-emerald-500/20'
                                : 'text-amber-400 bg-amber-500/20',
                          )}
                        >
                          {route.isRecommended ? '★ Best' : route.riskScore < 50 ? 'Lower Risk' : 'Moderate'}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 text-sm">
                          <AlertTriangle
                            className={cn(
                              'h-4 w-4 flex-shrink-0',
                              route.riskScore < 50 ? 'text-emerald-400' : 'text-amber-400',
                            )}
                          />
                          <span className="text-white">Risk: {route.riskScore}%</span>
                          {selectedShipment.riskScore > route.riskScore && (
                            <span className="text-emerald-400 text-xs">
                              ↓{selectedShipment.riskScore - route.riskScore}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <DollarSign className="h-4 w-4 flex-shrink-0" />
                          <span>
                            {route.costDelta > 0
                              ? `+$${route.costDelta.toLocaleString()}`
                              : 'Same cost'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Clock className="h-4 w-4 flex-shrink-0" />
                          <span>{route.etaDelta}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleExecuteRoute(route.rank ?? idx + 2)}
                        disabled={isSelecting}
                        className="w-full mt-4 px-4 py-2 text-sm font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSelecting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Execute Route
                      </button>
                    </div>
                  ))
                : /* Still loading or no data — show skeleton cards */
                  [1, 2].map((n) => (
                    <div key={n} className="glass-inner p-4 border-2 border-white/10 animate-pulse">
                      <div className="h-3 w-24 bg-white/10 rounded mb-4" />
                      <div className="space-y-3">
                        <div className="h-3 w-full bg-white/10 rounded" />
                        <div className="h-3 w-3/4 bg-white/10 rounded" />
                        <div className="h-3 w-1/2 bg-white/10 rounded" />
                      </div>
                      <div className="h-9 w-full bg-white/10 rounded-lg mt-4" />
                    </div>
                  ))}
            </div>
          )}

          {/* ── SHAP explanation ── */}
          <div className="glass-inner p-4">
            <h3 className="text-sm font-medium uppercase tracking-wider text-slate-400 mb-4">
              Risk Factor Analysis (SHAP Explanation)
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={shapData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, bottom: 0, left: 130 }}
                >
                  <XAxis
                    type="number"
                    domain={[-0.5, 0.5]}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    stroke="#64748b"
                    fontSize={11}
                  />
                  <YAxis
                    type="category"
                    dataKey="feature"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    width={125}
                  />
                  <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                    {shapData.map((entry, index) => (
                      <Cell key={index} fill={entry.positive ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-red-500" />
                <span className="text-slate-400">Increases Risk</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-emerald-500" />
                <span className="text-slate-400">Decreases Risk</span>
              </div>
            </div>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  )
}
