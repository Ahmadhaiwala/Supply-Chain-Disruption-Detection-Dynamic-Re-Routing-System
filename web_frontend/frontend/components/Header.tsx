'use client'

import { useState } from 'react'
import { Bell, Search, User, X } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export function Header() {
  const { sidebarCollapsed, alerts, shipments, setSelectedShipment, setShowRouteModal, setActiveView } =
    useDashboardStore()
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length

  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)

  const results = query.trim().length > 1
    ? shipments.filter(
        (s) =>
          s.id.toLowerCase().includes(query.toLowerCase()) ||
          s.origin.toLowerCase().includes(query.toLowerCase()) ||
          s.destination.toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 5)
    : []

  const handleSelect = (id: string) => {
    setSelectedShipment(id)
    setActiveView('dashboard')
    setQuery('')
    setShowResults(false)
    const s = shipments.find((sh) => sh.id === id)
    if (s && (s.riskLevel === 'high' || s.riskLevel === 'critical')) {
      setShowRouteModal(true)
    }
  }

  return (
    <header
      className="fixed top-0 right-0 z-30 h-16 glass-card border-b border-white/10 flex items-center justify-between px-6"
      style={{
        left: sidebarCollapsed ? 72 : 240,
        transition: 'left 0.3s ease-in-out',
      }}
    >
      {/* Left — Title */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight text-white">Supply Chain Command Center</h1>
        <span className="px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-cyan-400 bg-cyan-400/10 rounded-full border border-cyan-400/20">
          Live
        </span>
      </div>

      {/* Center — Search */}
      <div className="flex-1 max-w-md mx-8 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowResults(true) }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          placeholder="Search shipments, routes, alerts..."
          className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setShowResults(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <AnimatePresence>
          {showResults && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full mt-2 w-full glass-card border border-white/10 rounded-xl overflow-hidden z-50"
            >
              {results.map((s) => (
                <button
                  key={s.id}
                  onMouseDown={() => handleSelect(s.id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{s.id}</p>
                    <p className="text-xs text-slate-400">{s.origin} → {s.destination}</p>
                  </div>
                  <span
                    className={cn(
                      'px-2 py-0.5 text-xs font-medium uppercase rounded-full',
                      s.riskLevel === 'critical' && 'bg-red-500/20 text-red-400',
                      s.riskLevel === 'high' && 'bg-orange-500/20 text-orange-400',
                      s.riskLevel === 'medium' && 'bg-amber-500/20 text-amber-400',
                      s.riskLevel === 'low' && 'bg-emerald-500/20 text-emerald-400',
                    )}
                  >
                    {s.riskLevel}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setActiveView('alerts')}
          className="relative p-2 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-colors"
        >
          <Bell className="h-5 w-5 text-slate-400" />
          {criticalAlerts > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
              {criticalAlerts}
            </span>
          )}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setActiveView('settings')}
          className="flex items-center gap-2 p-1.5 pr-3 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-colors"
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-medium text-white">Admin</span>
        </motion.button>
      </div>
    </header>
  )
}
