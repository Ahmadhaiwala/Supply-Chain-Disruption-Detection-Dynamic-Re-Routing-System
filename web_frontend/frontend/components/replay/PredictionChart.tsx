'use client'
import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import type { PredictionPoint } from '@/lib/api'

interface Props {
  series: PredictionPoint[]
  cursorTime: number
  bookingId: string
  isDelayed: boolean
}

export function PredictionChart({ series, cursorTime, bookingId, isDelayed }: Props) {
  const data = useMemo(() =>
    series.map(p => ({
      t: new Date(p.timestamp).getTime(),
      label: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      predicted: Math.round(p.predicted * 100),
      actual: p.actual != null ? Math.round(p.actual * 100) : null,
    })), [series])

  // Accuracy
  const correct = series.filter(p => {
    if (p.actual == null) return false
    const predHigh = p.predicted > 0.5
    const actHigh = p.actual > 0.5
    return predHigh === actHigh
  }).length
  const total = series.filter(p => p.actual != null).length
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : null

  // Alert timestamps (where predicted > 70%)
  const alertTimes = series
    .filter(p => p.predicted > 0.7)
    .map(p => new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    .slice(0, 3)

  const cursorLabel = new Date(cursorTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="h-full flex flex-col">
      {/* Accuracy badge */}
      <div className="flex items-center gap-4 mb-3 flex-shrink-0">
        <div className="glass-inner px-3 py-1.5 flex items-center gap-2">
          <span className="text-xs text-slate-400">Prediction Accuracy</span>
          {accuracy != null
            ? <span className={`text-sm font-bold ${accuracy >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {accuracy}% ({correct}/{total})
              </span>
            : <span className="text-sm text-slate-500">—</span>
          }
        </div>
        <div className="glass-inner px-3 py-1.5 flex items-center gap-2">
          <span className="text-xs text-slate-400">Actual Outcome</span>
          <span className={`text-sm font-bold ${isDelayed ? 'text-red-400' : 'text-emerald-400'}`}>
            {isDelayed ? 'DELAYED' : 'ON TIME'}
          </span>
        </div>
        <div className="glass-inner px-3 py-1.5 flex items-center gap-2">
          <span className="text-xs text-slate-400">Shipment</span>
          <span className="text-sm font-mono text-white">{bookingId}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" stroke="#475569" fontSize={10} tickLine={false} />
            <YAxis stroke="#475569" fontSize={10} tickLine={false}
              tickFormatter={v => `${v}%`} domain={[0, 100]} />

            {/* Risk zone bands */}
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4}
              label={{ value: 'HIGH', fill: '#ef4444', fontSize: 9, position: 'right' }} />
            <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.4}
              label={{ value: 'MED', fill: '#f59e0b', fontSize: 9, position: 'right' }} />

            {/* Alert fire lines */}
            {alertTimes.map((t, i) => (
              <ReferenceLine key={i} x={t} stroke="#f59e0b" strokeOpacity={0.5} strokeWidth={1.5} />
            ))}

            {/* Cursor */}
            <ReferenceLine x={cursorLabel} stroke="white" strokeOpacity={0.6} strokeWidth={1.5} />

            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v: number, name: string) => [`${v}%`, name === 'predicted' ? 'Predicted' : 'Actual']}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />

            <Area type="monotone" dataKey="predicted" name="Predicted"
              stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 3"
              fill="url(#predGrad)" dot={false} />
            <Area type="monotone" dataKey="actual" name="Actual"
              stroke="#10b981" strokeWidth={2}
              fill="url(#actGrad)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
