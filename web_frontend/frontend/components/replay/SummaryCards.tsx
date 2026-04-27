'use client'
import { motion } from 'framer-motion'
import { Ship, Target, ShieldCheck, AlertTriangle, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { historyApi, type PerformanceSummary } from '@/lib/api'

const CARDS = [
  { key: 'total_shipments',       label: 'Shipments Analyzed', icon: Ship,          color: 'text-cyan-400',    fmt: (v: number) => v.toString() },
  { key: 'prediction_accuracy',   label: 'Prediction Accuracy', icon: Target,        color: 'text-emerald-400', fmt: (v: number) => `${Math.round(v * 100)}%` },
  { key: 'delays_prevented',      label: 'Delays Prevented',    icon: ShieldCheck,   color: 'text-blue-400',    fmt: (v: number) => v.toString() },
  { key: 'false_alarms',          label: 'False Alarms',        icon: AlertTriangle, color: 'text-amber-400',   fmt: (v: number) => v.toString() },
  { key: 'avg_early_warning_hours', label: 'Avg Early Warning', icon: Clock,         color: 'text-purple-400',  fmt: (v: number) => `${v.toFixed(1)}h` },
]

export function SummaryCards() {
  const { data } = useQuery({
    queryKey: ['history-summary'],
    queryFn: () => historyApi.getSummary(),
    staleTime: 60_000,
  })

  const summary = data ?? {
    total_shipments: 0, prediction_accuracy: 0, delays_prevented: 0,
    false_alarms: 0, avg_early_warning_hours: 0,
  } as PerformanceSummary

  return (
    <div className="grid grid-cols-5 gap-3 mb-4">
      {CARDS.map((c, i) => {
        const Icon = c.icon
        const val = summary[c.key as keyof PerformanceSummary] as number
        return (
          <motion.div key={c.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="glass-card p-3 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-black/30 ${c.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-slate-500 leading-none mb-0.5">{c.label}</p>
              <p className={`text-xl font-bold ${c.color}`}>{c.fmt(val)}</p>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
