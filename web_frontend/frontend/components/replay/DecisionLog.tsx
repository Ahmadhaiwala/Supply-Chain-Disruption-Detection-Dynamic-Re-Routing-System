'use client'
import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EVENT_META, type EventType } from './types'
import type { ReplayEvent } from '@/lib/api'

type LogFilter = 'all' | 'correct' | 'missed' | 'false_alarm'

interface DecisionRow {
  id: string
  time: string
  event: string
  predictedRisk: number | null
  action: string
  actualOutcome: string
  result: 'correct' | 'missed' | 'false_alarm' | 'neutral'
}

function buildDecisions(events: ReplayEvent[], isDelayed: boolean): DecisionRow[] {
  return events
    .filter(e => e.type !== 'gps_update')
    .map(e => {
      const meta = EVENT_META[e.type as EventType] ?? EVENT_META.gps_update
      const risk = e.risk_score

      let action = '—'
      let actualOutcome = isDelayed ? 'Delayed' : 'On Time'
      let result: DecisionRow['result'] = 'neutral'

      if (e.type === 'prediction') {
        action = risk != null && risk > 0.7 ? 'Alert dispatched' : 'Monitoring'
        result = risk != null && risk > 0.5 && isDelayed ? 'correct'
          : risk != null && risk > 0.5 && !isDelayed ? 'false_alarm'
          : risk != null && risk <= 0.5 && isDelayed ? 'missed'
          : 'neutral'
      } else if (e.type === 'route_exec') {
        action = 'Route executed'
        result = 'correct'
        actualOutcome = 'Rerouted'
      } else if (e.type === 'alert') {
        action = 'Alert triggered'
        result = isDelayed ? 'correct' : 'false_alarm'
      } else if (e.type === 'disruption') {
        action = 'Disruption logged'
        result = isDelayed ? 'correct' : 'false_alarm'
      }

      return {
        id: e.id,
        time: new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        event: `${meta.emoji} ${meta.label}`,
        predictedRisk: risk,
        action,
        actualOutcome,
        result,
      }
    })
}

const RESULT_CONFIG = {
  correct:     { icon: CheckCircle,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Correct' },
  missed:      { icon: XCircle,      color: 'text-red-400',     bg: 'bg-red-500/10',     label: 'Missed' },
  false_alarm: { icon: AlertTriangle,color: 'text-amber-400',   bg: 'bg-amber-500/10',   label: 'False Alarm' },
  neutral:     { icon: CheckCircle,  color: 'text-slate-500',   bg: 'bg-slate-500/10',   label: '—' },
}

const FILTERS: { key: LogFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'correct', label: 'Correct' },
  { key: 'missed', label: 'Missed' },
  { key: 'false_alarm', label: 'False Alarm' },
]

interface Props {
  events: ReplayEvent[]
  isDelayed: boolean
}

export function DecisionLog({ events, isDelayed }: Props) {
  const [filter, setFilter] = useState<LogFilter>('all')
  const rows = useMemo(() => buildDecisions(events, isDelayed), [events, isDelayed])
  const filtered = filter === 'all' ? rows : rows.filter(r => r.result === filter)

  return (
    <div className="h-full flex flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <Filter className="h-3.5 w-3.5 text-slate-500" />
        <div className="flex gap-1 p-1 bg-black/30 rounded-lg">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn('px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                filter === f.key ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-white')}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} events</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900/90">
            <tr className="border-b border-white/10">
              {['Time', 'Event', 'Predicted Risk', 'Action Taken', 'Actual Outcome', 'Result'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium uppercase tracking-wider text-slate-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((row, i) => {
              const cfg = RESULT_CONFIG[row.result]
              const Icon = cfg.icon
              return (
                <motion.tr key={row.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="hover:bg-white/5 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-slate-400">{row.time}</td>
                  <td className="px-3 py-2.5 text-white">{row.event}</td>
                  <td className="px-3 py-2.5">
                    {row.predictedRisk != null
                      ? <span className={cn('font-bold',
                          row.predictedRisk > 0.7 ? 'text-red-400' :
                          row.predictedRisk > 0.4 ? 'text-amber-400' : 'text-emerald-400')}>
                          {Math.round(row.predictedRisk * 100)}%
                        </span>
                      : <span className="text-slate-600">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{row.action}</td>
                  <td className="px-3 py-2.5 text-slate-300">{row.actualOutcome}</td>
                  <td className="px-3 py-2.5">
                    {row.result !== 'neutral' && (
                      <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full w-fit', cfg.bg, cfg.color)}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    )}
                  </td>
                </motion.tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-600">
                  No events match this filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
