'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, AlertCircle, Info, Check, RefreshCw } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { useShipmentAlerts, useAcknowledgeAlert } from '@/hooks/useApi'
import { cn } from '@/lib/utils'

const severityConfig = {
  info: { icon: Info, border: 'border-l-cyan-500', iconColor: 'text-cyan-400', bg: 'bg-cyan-500/10', label: 'INFO' },
  warning: { icon: AlertCircle, border: 'border-l-amber-500', iconColor: 'text-amber-400', bg: 'bg-amber-500/10', label: 'WARNING' },
  critical: { icon: AlertTriangle, border: 'border-l-red-500', iconColor: 'text-red-400', bg: 'bg-red-500/10', label: 'CRITICAL' },
}

export function AlertsView() {
  const { alerts, selectedShipmentId, shipments } = useDashboardStore()
  const { mutate: acknowledge } = useAcknowledgeAlert()

  // Load alerts for selected shipment
  useShipmentAlerts(selectedShipmentId)

  const grouped = {
    critical: alerts.filter((a) => a.severity === 'critical'),
    warning: alerts.filter((a) => a.severity === 'warning'),
    info: alerts.filter((a) => a.severity === 'info'),
  }

  return (
    <main className="pt-20 pb-6 px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Alerts Center</h2>
          <p className="text-sm text-slate-400 mt-1">
            {alerts.length} total alerts — {grouped.critical.length} critical
          </p>
        </div>
        <div className="flex gap-3">
          {(['critical', 'warning', 'info'] as const).map((sev) => {
            const cfg = severityConfig[sev]
            return (
              <div key={sev} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg', cfg.bg)}>
                <cfg.icon className={cn('h-4 w-4', cfg.iconColor)} />
                <span className={cn('text-xs font-medium', cfg.iconColor)}>
                  {grouped[sev].length} {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="glass-card p-12 flex flex-col items-center gap-3 text-center">
            <Check className="h-10 w-10 text-emerald-400" />
            <p className="text-white font-medium">No active alerts</p>
            <p className="text-sm text-slate-400">All shipments are operating normally</p>
          </div>
        )}

        {alerts.map((alert, i) => {
          const cfg = severityConfig[alert.severity]
          const Icon = cfg.icon
          const shipment = shipments.find((s) => s.id === alert.shipmentId)

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={cn('glass-card p-4 border-l-4 flex items-start gap-4', cfg.border)}
            >
              <div className={cn('p-2 rounded-lg flex-shrink-0', cfg.bg)}>
                <Icon className={cn('h-5 w-5', cfg.iconColor)} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-xs font-bold uppercase tracking-wider', cfg.iconColor)}>
                    {cfg.label}
                  </span>
                  {alert.shipmentId && (
                    <span className="text-xs text-slate-500">• {alert.shipmentId}</span>
                  )}
                  {shipment && (
                    <span className="text-xs text-slate-500">
                      ({shipment.origin} → {shipment.destination})
                    </span>
                  )}
                </div>
                <p className="text-sm text-white">{alert.message}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {alert.timestamp.toLocaleString('en-IN')}
                </p>
              </div>

              {alert.severity !== 'info' && (
                <button
                  onClick={() => {
                    if (alert.shipmentId) {
                      acknowledge({ bookingId: alert.shipmentId, alertId: Number(alert.id) })
                    }
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  Acknowledge
                </button>
              )}
            </motion.div>
          )
        })}
      </div>
    </main>
  )
}
