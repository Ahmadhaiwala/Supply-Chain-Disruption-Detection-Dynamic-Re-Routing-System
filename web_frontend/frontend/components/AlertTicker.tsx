'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react'
import { useDashboardStore, type Alert } from '../store/useStore'
import { cn } from '@/lib/utils'

const severityConfig = {
  info: {
    icon: Info,
    borderColor: 'border-l-cyan-500',
    iconColor: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  warning: {
    icon: AlertCircle,
    borderColor: 'border-l-amber-500',
    iconColor: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  critical: {
    icon: AlertTriangle,
    borderColor: 'border-l-red-500',
    iconColor: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AlertItem({ alert }: { alert: Alert }) {
  const config = severityConfig[alert.severity]
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex-shrink-0 flex items-center gap-3 px-4 py-2 glass-inner border-l-2 mx-2',
        config.borderColor
      )}
    >
      <div className={cn('p-1.5 rounded-lg', config.bgColor)}>
        <Icon className={cn('h-4 w-4', config.iconColor)} />
      </div>
      
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 font-mono">
          {formatTime(alert.timestamp)}
        </span>
        <span className="text-sm text-white">{alert.message}</span>
      </div>

      {alert.severity !== 'info' && (
        <button className={cn(
          'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors',
          config.bgColor,
          config.iconColor,
          'hover:brightness-125'
        )}>
          Act
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </motion.div>
  )
}

export function AlertTicker() {
  const { alerts } = useDashboardStore()

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center">
        {/* Static label */}
        <div className="flex-shrink-0 px-3 sm:px-4 py-3 border-r border-white/10 bg-black/40">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Live Alerts
          </span>
        </div>

        {/* Scrolling alerts container */}
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-marquee hover:[animation-play-state:paused]">
            {/* Double the alerts for seamless loop */}
            {[...alerts, ...alerts].map((alert, idx) => (
              <AlertItem key={`${alert.id}-${idx}`} alert={alert} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
