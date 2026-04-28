'use client'

import { useState } from 'react'
import { Bell, Search, User, X, Plus, FileText, Menu } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { AddShipmentDrawer } from './AddShipmentDrawer'

export function Header() {
  const { sidebarCollapsed, setMobileSidebarOpen, alerts, shipments, setSelectedShipment, setShowRouteModal, setActiveView, setShowReportModal } =
    useDashboardStore()
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length

  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

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
    <>
      <header
        className={cn(
          'fixed top-0 right-0 left-0 z-30 h-16 glass-card border-b border-white/10 flex items-center justify-between px-4 md:px-6',
          'transition-[left] duration-300 ease-in-out',
          sidebarCollapsed ? 'md:left-[72px]' : 'md:left-[240px]',
        )}
    >
      {/* Left — Hamburger + Title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base md:text-lg font-bold tracking-tight text-white truncate">Supply Chain Command Center</h1>
        <span className="hidden sm:inline-flex px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-cyan-400 bg-cyan-400/10 rounded-full border border-cyan-400/20">
          Live
        </span>
      </div>

      {/* Center — Search (hidden on mobile) */}
      <div className="hidden md:block flex-1 max-w-md mx-8 relative">
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
      <div className="flex items-center gap-2 md:gap-3">
        {/* Quick add shipment */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Shipment</span>
        </motion.button>

        {/* Export Report */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowReportModal(true)}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded-lg hover:bg-violet-500/20 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          Export
        </motion.button>
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
          className="hidden sm:flex items-center gap-2 p-1.5 pr-3 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-colors"
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-medium text-white">Admin</span>
        </motion.button>
      </div>
    </header>
    <AddShipmentDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
