'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Package, Ship, Droplets, Thermometer, ArrowRight, RefreshCw, Plus, Loader2, FileText, Download } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { useShipments } from '@/hooks/useApi'
import { cn } from '@/lib/utils'
import type { RiskLevel } from '../store/useStore'
import { AddShipmentDrawer } from './AddShipmentDrawer'

const riskColors: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  medium: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
}

const cargoIcons = {
  container: Package,
  bulk: Ship,
  tanker: Droplets,
  refrigerated: Thermometer,
}

export function ShipmentsView() {
  const { shipments, isLoadingShipments, setSelectedShipment, setShowRouteModal, setActiveView, setShowReportModal } =
    useDashboardStore()
  const { refetch } = useShipments()
  const [filter, setFilter] = useState<'all' | 'LOW' | 'MEDIUM' | 'HIGH'>('all')
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const filtered = shipments.filter((s) => {
    const matchFilter =
      filter === 'all' ||
      s.riskLevel.toUpperCase() === filter ||
      (filter === 'HIGH' && s.riskLevel === 'critical')
    const matchSearch =
      !search ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.origin.toLowerCase().includes(search.toLowerCase()) ||
      s.destination.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const handleSelect = (id: string) => {
    setSelectedShipment(id)
    setActiveView('dashboard')
    const s = shipments.find((sh) => sh.id === id)
    if (s && (s.riskLevel === 'high' || s.riskLevel === 'critical')) {
      setShowRouteModal(true)
    }
  }

  const handleExportShipment = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedShipment(id)
    setShowReportModal(true, 'SHIPMENT_JOURNEY')
  }

  return (
    <>
      <main className="pt-20 pb-6 px-4 md:px-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Shipments</h2>
          <p className="text-sm text-slate-400 mt-1">{shipments.length} total shipments tracked</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => refetch()}
            disabled={isLoadingShipments}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {isLoadingShipments ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
          <button
            onClick={() => setShowReportModal(true, 'OPERATIONS')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded-lg hover:bg-violet-500/20 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Export Report
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-500/20 border border-cyan-500/40 rounded-lg hover:bg-cyan-500/30 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Shipment
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, origin, destination..."
          className="flex-1 sm:max-w-sm px-4 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all"
        />
        <div className="flex gap-1 p-1 bg-black/40 rounded-lg self-start">
          {(['all', 'LOW', 'MEDIUM', 'HIGH'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize',
                filter === f ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white',
              )}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoadingShipments && shipments.length === 0 ? (
        <div className="glass-card p-12 flex items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 text-cyan-400 animate-spin" />
          <span className="text-slate-400">Loading shipments...</span>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/10">
                {['Booking ID', 'Cargo', 'Origin → Destination', 'Distance', 'ETA', 'Risk', 'Status', 'Report', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((s, i) => {
                const CargoIcon = cargoIcons[s.cargoType]
                const risk = riskColors[s.riskLevel]
                const raw = s._raw as Record<string, unknown> | undefined
                return (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => handleSelect(s.id)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-white">{s.id}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CargoIcon className="h-4 w-4 text-cyan-400" />
                        <span className="text-sm text-slate-300 capitalize">{s.cargoType}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-slate-300">
                        <span className="truncate max-w-[120px]">{s.origin}</span>
                        <ArrowRight className="h-3 w-3 text-cyan-500 flex-shrink-0" />
                        <span className="truncate max-w-[120px]">{s.destination}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {raw?.distance_km ? `${Number(raw.distance_km).toFixed(0)} km` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{s.eta}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 text-xs font-medium uppercase rounded-full border',
                          risk.bg,
                          risk.text,
                          risk.border,
                        )}
                      >
                        {s.riskLevel} {s.riskScore}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 text-xs font-medium rounded-full',
                          raw?.status === 'DELAYED'
                            ? 'bg-red-500/20 text-red-400'
                            : raw?.status === 'DELIVERED'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-cyan-500/20 text-cyan-400',
                        )}
                      >
                        {String(raw?.status ?? 'IN_TRANSIT').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => handleExportShipment(e, s.id)}
                        title="Export Shipment Report"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelect(s.id)
                        }}
                        className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        View →
                      </button>
                    </td>
                  </motion.tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500 text-sm">
                    No shipments match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
    <AddShipmentDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
