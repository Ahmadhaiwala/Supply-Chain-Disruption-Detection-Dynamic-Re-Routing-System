'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { API_BASE } from '@/lib/api'
import { cn } from '@/lib/utils'

export function SettingsView() {
  const { backendOnline } = useDashboardStore()
  const [apiUrl, setApiUrl] = useState(API_BASE)
  const [riskLow, setRiskLow] = useState(40)
  const [riskMedium, setRiskMedium] = useState(70)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <main className="pt-20 pb-6 px-6 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-sm text-slate-400 mt-1">Configure backend connection and risk thresholds</p>
      </div>

      <div className="space-y-6">
        {/* Backend connection */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            {backendOnline ? (
              <Wifi className="h-4 w-4 text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-400" />
            )}
            Backend Connection
            <span
              className={cn(
                'ml-auto px-2 py-0.5 text-xs font-medium rounded-full',
                backendOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400',
              )}
            >
              {backendOnline ? 'Connected' : 'Disconnected'}
            </span>
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">API Base URL</label>
              <input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Set NEXT_PUBLIC_API_URL env variable to change permanently
              </p>
            </div>
          </div>
        </motion.div>

        {/* Risk thresholds */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-5"
        >
          <h3 className="text-sm font-medium text-white mb-4">Risk Thresholds</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-slate-400">Low → Medium threshold</label>
                <span className="text-xs font-medium text-amber-400">{riskLow}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={60}
                value={riskLow}
                onChange={(e) => setRiskLow(Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-slate-400">Medium → High threshold</label>
                <span className="text-xs font-medium text-red-400">{riskMedium}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={90}
                value={riskMedium}
                onChange={(e) => setRiskMedium(Number(e.target.value))}
                className="w-full accent-red-400"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <div className="flex-1 h-2 rounded-full bg-emerald-500/60" style={{ maxWidth: `${riskLow}%` }} />
              <div className="flex-1 h-2 rounded-full bg-amber-500/60" style={{ maxWidth: `${riskMedium - riskLow}%` }} />
              <div className="flex-1 h-2 rounded-full bg-red-500/60" />
            </div>
          </div>
        </motion.div>

        {/* Refresh intervals */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5"
        >
          <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-cyan-400" />
            Data Refresh Intervals
          </h3>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Shipments list', value: '15 seconds' },
              { label: 'Risk predictions', value: '30 seconds' },
              { label: 'Alerts', value: '20 seconds' },
              { label: 'Health check', value: '30 seconds' },
              { label: 'WebSocket (live)', value: 'Real-time' },
            ].map((item) => (
              <div key={item.label} className="flex justify-between">
                <span className="text-slate-400">{item.label}</span>
                <span className="text-cyan-400 font-mono text-xs">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <button
          onClick={handleSave}
          className={cn(
            'flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg transition-all',
            saved
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30',
          )}
        >
          <Save className="h-4 w-4" />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </main>
  )
}
