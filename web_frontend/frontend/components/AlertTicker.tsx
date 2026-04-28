'use client'

import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { useDashboardStore, type Alert } from '../store/useStore'
import { cn } from '@/lib/utils'

const severityConfig = {
  info:     { icon: Info,          borderColor: 'border-l-cyan-500',  iconColor: 'text-cyan-400',  bgColor: 'bg-cyan-500/10' },
  warning:  { icon: AlertCircle,   borderColor: 'border-l-amber-500', iconColor: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  critical: { icon: AlertTriangle, borderColor: 'border-l-red-500',   iconColor: 'text-red-400',   bgColor: 'bg-red-500/10' },
}

function AlertItem({ alert }: { alert: Alert }) {
  const cfg = severityConfig[alert.severity]
  const Icon = cfg.icon
  const time = alert.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={cn(
      'flex-shrink-0 flex items-center gap-2 px-3 py-2 glass-inner border-l-2 mx-1.5',
      cfg.borderColor,
    )}>
      <div className={cn('p-1 rounded-md flex-shrink-0', cfg.bgColor)}>
        <Icon className={cn('h-3.5 w-3.5', cfg.iconColor)} />
      </div>
      <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">{time}</span>
      <span className="text-xs text-white whitespace-nowrap max-w-[200px] sm:max-w-none truncate">
        {alert.message}
      </span>
    </div>
  )
}

export function AlertTicker() {
  const { alerts } = useDashboardStore()

  if (alerts.length === 0) return null

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center">
        <div className="flex-shrink-0 px-3 py-2.5 border-r border-white/10 bg-black/40">
          <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap">
            Live Alerts
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-marquee hover:[animation-play-state:paused]">
            {[...alerts, ...alerts].map((alert, idx) => (
              <AlertItem key={`${alert.id}-${idx}`} alert={alert} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
