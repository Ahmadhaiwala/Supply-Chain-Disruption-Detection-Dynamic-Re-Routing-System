'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Ship, Package, Droplets, Thermometer, ArrowRight } from 'lucide-react'
import { useDashboardStore, type RiskLevel, type Shipment } from '../store/useStore'
import { cn } from '@/lib/utils'

const cargoIcons = {
  container: Package,
  bulk: Ship,
  tanker: Droplets,
  refrigerated: Thermometer,
}

const riskColors: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  medium: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
}

const filterTabs = [
  { key: 'all', label: 'All' },
  { key: 'normal', label: 'Normal' },
  { key: 'warning', label: 'Warning' },
  { key: 'critical', label: 'Critical' },
] as const

function ShipmentCard({ shipment }: { shipment: Shipment }) {
  const { selectedShipmentId, setSelectedShipment, setShowRouteModal } = useDashboardStore()
  const isSelected = selectedShipmentId === shipment.id
  const CargoIcon = cargoIcons[shipment.cargoType]
  const riskStyle = riskColors[shipment.riskLevel]

  const handleClick = () => {
    setSelectedShipment(shipment.id)
    if (shipment.riskLevel === 'critical' || shipment.riskLevel === 'high') {
      setShowRouteModal(true)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      whileHover={{ scale: 1.02 }}
      onClick={handleClick}
      className={cn(
        'glass-inner p-3 cursor-pointer transition-all',
        isSelected && 'ring-1 ring-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10">
            <CargoIcon className="h-4 w-4 text-cyan-400" />
          </div>
          <span className="text-sm font-medium text-white">{shipment.id}</span>
        </div>
        <span
          className={cn(
            'px-2 py-0.5 text-xs font-medium uppercase rounded-full border',
            riskStyle.bg,
            riskStyle.text,
            riskStyle.border
          )}
        >
          {shipment.riskLevel}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
        <span className="truncate">{shipment.origin}</span>
        <ArrowRight className="h-3 w-3 flex-shrink-0 text-cyan-500" />
        <span className="truncate">{shipment.destination}</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">ETA: {shipment.eta}</span>
        <span className={cn('font-medium', riskStyle.text)}>
          Risk: {shipment.riskScore}%
        </span>
      </div>
    </motion.div>
  )
}

export function ShipmentsList() {
  const { shipments, activeFilter, setActiveFilter } = useDashboardStore()

  const filteredShipments = shipments.filter((s) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'normal') return s.riskLevel === 'low'
    if (activeFilter === 'warning') return s.riskLevel === 'medium' || s.riskLevel === 'high'
    if (activeFilter === 'critical') return s.riskLevel === 'critical'
    return true
  })

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-card p-4 h-full flex flex-col"
    >
      <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-3">
        Active Shipments
      </h3>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3 p-1 bg-black/40 rounded-lg">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all',
              activeFilter === tab.key
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-slate-400 hover:text-white'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Shipments list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        <AnimatePresence mode="popLayout">
          {filteredShipments.map((shipment) => (
            <ShipmentCard key={shipment.id} shipment={shipment} />
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-3 pt-3 border-t border-white/10">
        <p className="text-xs text-slate-500">
          Showing {filteredShipments.length} of {shipments.length} shipments
        </p>
      </div>
    </motion.div>
  )
}
