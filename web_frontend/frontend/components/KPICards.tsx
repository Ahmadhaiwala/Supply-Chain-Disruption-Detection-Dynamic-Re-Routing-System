'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Ship, AlertTriangle, Clock, DollarSign } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { cn } from '@/lib/utils'

const kpiConfig = [
  {
    key: 'activeShipments',
    label: 'ACTIVE',
    fullLabel: 'ACTIVE SHIPMENTS',
    icon: Ship,
    format: (v: number) => v.toLocaleString(),
    trendKey: 'activeShipmentsTrend',
    gradientFrom: 'from-cyan-500/20',
    iconColor: 'text-cyan-400',
  },
  {
    key: 'highRiskCount',
    label: 'HIGH RISK',
    fullLabel: 'HIGH RISK',
    icon: AlertTriangle,
    format: (v: number) => v.toString(),
    trendKey: 'highRiskTrend',
    gradientFrom: 'from-red-500/20',
    iconColor: 'text-red-400',
    invertTrend: true,
  },
  {
    key: 'avgDelay',
    label: 'AVG DELAY',
    fullLabel: 'AVG DELAY',
    icon: Clock,
    format: (v: number) => `${v.toFixed(1)}h`,
    trendKey: 'avgDelayTrend',
    gradientFrom: 'from-amber-500/20',
    iconColor: 'text-amber-400',
    invertTrend: true,
  },
  {
    key: 'costSaved',
    label: 'SAVED',
    fullLabel: 'COST SAVED TODAY',
    icon: DollarSign,
    format: (v: number) => `$${(v / 1000).toFixed(0)}K`,
    trendKey: 'costSavedTrend',
    gradientFrom: 'from-emerald-500/20',
    iconColor: 'text-emerald-400',
  },
]

export function KPICards() {
  const { kpis, isLoadingShipments } = useDashboardStore()

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
      {kpiConfig.map((config, index) => {
        const value = kpis[config.key as keyof typeof kpis] as number
        const trend = kpis[config.trendKey as keyof typeof kpis] as number
        const isPositive = config.invertTrend ? trend < 0 : trend > 0

        return (
          <motion.div
            key={config.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="glass-card p-3 sm:p-4 relative overflow-hidden"
          >
            {/* Top accent bar */}
            <div className={cn('absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r to-transparent', config.gradientFrom)} />

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {/* Short label on mobile, full on sm+ */}
                <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-400 mb-1 truncate">
                  <span className="sm:hidden">{config.label}</span>
                  <span className="hidden sm:inline">{config.fullLabel}</span>
                </p>
                {isLoadingShipments && value === 0 ? (
                  <div className="h-7 sm:h-9 w-16 bg-white/10 rounded animate-pulse" />
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums leading-none">
                    {config.format(value)}
                  </p>
                )}
              </div>
              <div className={cn('p-1.5 sm:p-2 rounded-xl bg-black/40 flex-shrink-0', config.iconColor)}>
                <config.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>

            <div className="mt-2 sm:mt-3 flex items-center gap-1">
              {isPositive
                ? <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400 flex-shrink-0" />
                : <TrendingDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-red-400 flex-shrink-0" />
              }
              <span className={cn('text-xs font-medium', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                {Math.abs(trend).toFixed(1)}%
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 ml-0.5 truncate">vs yesterday</span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
