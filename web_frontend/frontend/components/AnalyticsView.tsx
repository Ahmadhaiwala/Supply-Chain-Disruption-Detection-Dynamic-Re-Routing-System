'use client'

import { motion } from 'framer-motion'
import { FileText } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell,
  PieChart, Pie, Tooltip, LineChart, Line, CartesianGrid, Legend,
} from 'recharts'

export function AnalyticsView() {
  const { shipments, kpis, setShowReportModal } = useDashboardStore()

  // Risk distribution
  const riskDist = [
    { name: 'Low', value: shipments.filter((s) => s.riskLevel === 'low').length, color: '#10b981' },
    { name: 'Medium', value: shipments.filter((s) => s.riskLevel === 'medium').length, color: '#f59e0b' },
    { name: 'High', value: shipments.filter((s) => s.riskLevel === 'high').length, color: '#f97316' },
    { name: 'Critical', value: shipments.filter((s) => s.riskLevel === 'critical').length, color: '#ef4444' },
  ]

  // Cargo type distribution
  const cargoDist = ['container', 'bulk', 'tanker', 'refrigerated'].map((type) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    count: shipments.filter((s) => s.cargoType === type).length,
  }))

  // Risk score histogram (buckets of 10)
  const histogram = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${i * 10 + 10}%`,
    count: shipments.filter((s) => s.riskScore >= i * 10 && s.riskScore < (i + 1) * 10).length,
  }))

  // Simulated trend data (7 days)
  const trendData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return {
      day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      highRisk: Math.max(0, kpis.highRiskCount + Math.round((Math.random() - 0.5) * 4)),
      delayed: Math.max(0, Math.round(kpis.avgDelay * 2 + (Math.random() - 0.5) * 3)),
      costSaved: Math.round(kpis.costSaved * (0.8 + Math.random() * 0.4)),
    }
  })

  return (
    <main className="pt-20 pb-6 px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Analytics</h2>
          <p className="text-sm text-slate-400 mt-1">
            Performance metrics across {shipments.length} tracked shipments
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowReportModal(true, 'OPERATIONS')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded-lg hover:bg-violet-500/20 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Export Operations Report
        </motion.button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Risk Distribution Pie */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="col-span-4 glass-card p-5"
        >
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">
            Risk Distribution
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  stroke="none"
                >
                  {riskDist.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {riskDist.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                <span className="text-xs text-slate-400">{d.name}: {d.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Cargo Type Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="col-span-4 glass-card p-5"
        >
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">
            Shipments by Cargo Type
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cargoDist} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {cargoDist.map((_, i) => (
                    <Cell key={i} fill={['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Risk Score Histogram */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-4 glass-card p-5"
        >
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">
            Risk Score Distribution
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="range" stroke="#64748b" fontSize={9} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {histogram.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        i < 4 ? '#10b981' : i < 7 ? '#f59e0b' : '#ef4444'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 7-day trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="col-span-8 glass-card p-5"
        >
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">
            7-Day Trend — High Risk & Delays
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Line type="monotone" dataKey="highRisk" stroke="#ef4444" strokeWidth={2} dot={false} name="High Risk" />
                <Line type="monotone" dataKey="delayed" stroke="#f59e0b" strokeWidth={2} dot={false} name="Delayed" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* KPI summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="col-span-4 glass-card p-5"
        >
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">
            Summary
          </h3>
          <div className="space-y-4">
            {[
              { label: 'Total Shipments', value: shipments.length },
              { label: 'Active (In Transit)', value: shipments.filter((s) => (s._raw as Record<string,unknown>)?.status === 'IN_TRANSIT').length },
              { label: 'Delayed', value: shipments.filter((s) => (s._raw as Record<string,unknown>)?.is_delayed).length },
              { label: 'High + Critical Risk', value: shipments.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical').length },
              { label: 'Avg Risk Score', value: `${shipments.length ? Math.round(shipments.reduce((a, s) => a + s.riskScore, 0) / shipments.length) : 0}%` },
              { label: 'Cost Saved (est.)', value: `₹${(kpis.costSaved / 1000).toFixed(0)}K` },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{item.label}</span>
                <span className="text-sm font-bold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </main>
  )
}
