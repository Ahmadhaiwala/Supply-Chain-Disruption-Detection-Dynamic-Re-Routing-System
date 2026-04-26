'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Ship, AlertTriangle, Clock, DollarSign } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { cn } from '@/lib/utils'

const kpiConfig = [
  {
    key: 'activeShipments',
    label: 'ACTIVE SHIPMENTS',
    icon: Ship,
    format: (v: number) => v.toLocaleString(),
    trendKey: 'activeShipmentsTrend',
    gradientFrom: 'from-cyan-500/20',
    gradientTo: 'to-transparent',
    iconColor: 'text-cyan-400',
  },
  {
    key: 'highRiskCount',
    label: 'HIGH RISK',
    icon: AlertTriangle,
    format: (v: number) => v.toString(),
    trendKey: 'highRiskTrend',
    gradientFrom: 'from-red-500/20',
    gradientTo: 'to-transparent',
    iconColor: 'text-red-400',
    invertTrend: true,
  },
  {
    key: 'avgDelay',
    label: 'AVG DELAY',
    icon: Clock,
    format: (v: number) => `${v.toFixed(1)}h`,
    trendKey: 'avgDelayTrend',
    gradientFrom: 'from-amber-500/20',
    gradientTo: 'to-transparent',
    iconColor: 'text-amber-400',
    invertTrend: true,
  },
  {
    key: 'costSaved',
    label: 'COST SAVED TODAY',
    icon: DollarSign,
    format: (v: number) => `$${(v / 1000).toFixed(1)}K`,
    trendKey: 'costSavedTrend',
    gradientFrom: 'from-emerald-500/20',
    gradientTo: 'to-transparent',
    iconColor: 'text-emerald-400',
  },
]

export function KPICards() {
  const { kpis, isLoadingShipments } = useDashboardStore()

  return (
    <div className="grid grid-cols-4 gap-4">
      {kpiConfig.map((config, index) => {
        const value = kpis[config.key as keyof typeof kpis] as number
        const trend = kpis[config.trendKey as keyof typeof kpis] as number
        const isPositive = config.invertTrend ? trend < 0 : trend > 0

        return (
          <motion.div
            key={config.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-card p-4 relative overflow-hidden group"
          >
            <div className={cn('absolute top-0 left-0 right-0 h-1 bg-gradient-to-r', config.gradientFrom, config.gradientTo)} />

            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">{config.label}</p>
                {isLoadingShipments && value === 0 ? (
                  <div className="h-9 w-20 bg-white/10 rounded animate-pulse" />
                ) : (
                  <p className="text-3xl font-bold text-white tabular-nums">{config.format(value)}</p>
                )}
              </div>
              <div className={cn('p-2 rounded-xl bg-black/40', config.iconColor)}>
                <config.icon className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-400" />
              )}
              <span className={cn('text-xs font-medium', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                {Math.abs(trend).toFixed(1)}%
              </span>
              <span className="text-xs text-slate-500 ml-1">vs yesterday</span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
