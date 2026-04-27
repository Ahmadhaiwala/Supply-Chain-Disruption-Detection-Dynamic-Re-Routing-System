'use client'

import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useDashboardStore, type RiskLevel } from '../store/useStore'
import { cn } from '@/lib/utils'
import { Maximize2 } from 'lucide-react'

// ─── All react-leaflet imports done lazily inside a single dynamic component ──
// This avoids SSR issues and the "useMap outside MapContainer" problem entirely.
import dynamic from 'next/dynamic'

const MapInner = dynamic(() => import('./MapInner'), { ssr: false })

const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
}

const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    label: 'Dark',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    label: 'Satellite',
  },
  nolabels: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    label: 'Minimal',
  },
}

export function LiveMap() {
  const { shipments, selectedShipmentId, setSelectedShipment, setShowRouteModal } = useDashboardStore()
  const [mounted, setMounted] = useState(false)
  const [tileKey, setTileKey] = useState<keyof typeof TILE_LAYERS>('dark')
  const fitAllRef = useRef<(() => void) | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const selectedShipment = shipments.find(s => s.id === selectedShipmentId)

  if (!mounted) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="glass-card h-full flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading map...</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card h-full overflow-hidden relative"
    >
      {/* The actual Leaflet map — all react-leaflet code lives in MapInner */}
      <MapInner
        shipments={shipments}
        selectedShipmentId={selectedShipmentId}
        tileUrl={TILE_LAYERS[tileKey].url}
        tileAttribution={TILE_LAYERS[tileKey].attribution}
        onSelectShipment={(id) => {
          setSelectedShipment(id)
          const s = shipments.find(sh => sh.id === id)
          if (s && (s.riskLevel === 'high' || s.riskLevel === 'critical')) {
            setShowRouteModal(true)
          }
        }}
        onFitAllReady={(fn) => { fitAllRef.current = fn }}
      />

      {/* ── Tile toggle ── */}
      <div className="absolute top-3 right-3 z-[1000] glass-inner p-1 flex gap-1">
        {(Object.keys(TILE_LAYERS) as (keyof typeof TILE_LAYERS)[]).map(key => (
          <button
            key={key}
            onClick={() => setTileKey(key)}
            className={cn(
              'px-2 py-1 text-xs font-medium rounded-md transition-all',
              tileKey === key ? 'bg-cyan-500/30 text-cyan-400' : 'text-slate-400 hover:text-white',
            )}
          >
            {TILE_LAYERS[key].label}
          </button>
        ))}
      </div>

      {/* ── Fit all ── */}
      <div className="absolute top-12 right-3 z-[1000] glass-inner">
        <button
          onClick={() => fitAllRef.current?.()}
          className="p-2 hover:bg-white/10 transition-colors rounded-lg"
          title="Fit all shipments"
        >
          <Maximize2 className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      {/* ── Risk legend ── */}
      <div className="absolute top-3 left-3 z-[1000] glass-inner p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">Risk Level</p>
        {(Object.entries(RISK_COLORS) as [RiskLevel, string][]).map(([level, color]) => (
          <div key={level} className="flex items-center gap-2 mb-1">
            <div
              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}` }}
            />
            <span className="text-xs text-slate-400 capitalize">{level}</span>
          </div>
        ))}
        <div className="pt-1.5 mt-1 border-t border-white/10 flex items-center gap-2">
          <div className="w-5 border-t-2 border-dashed border-cyan-400 opacity-70" />
          <span className="text-xs text-slate-500">Alt route</span>
        </div>
      </div>

      {/* ── Selected shipment card ── */}
      {selectedShipment && (
        <motion.div
          key={selectedShipment.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-3 left-3 z-[1000] glass-inner p-3 min-w-[220px]"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-white truncate">{selectedShipment.id}</span>
            <span
              className="px-2 py-0.5 text-xs font-bold uppercase rounded-full ml-2 flex-shrink-0"
              style={{
                background: `${RISK_COLORS[selectedShipment.riskLevel]}22`,
                color: RISK_COLORS[selectedShipment.riskLevel],
              }}
            >
              {selectedShipment.riskLevel}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate mb-1">
            {selectedShipment.origin} → {selectedShipment.destination}
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">ETA: {selectedShipment.eta}</span>
            <span className="font-bold" style={{ color: RISK_COLORS[selectedShipment.riskLevel] }}>
              {selectedShipment.riskScore}% risk
            </span>
          </div>
          {(selectedShipment.alternativeRoutes?.length ?? 0) > 0 && (
            <p className="text-xs text-cyan-400 mt-1.5 pt-1.5 border-t border-white/10">
              {selectedShipment.alternativeRoutes!.length} alt route(s) on map
            </p>
          )}
        </motion.div>
      )}

      {/* ── Count badge ── */}
      <div className="absolute bottom-3 right-3 z-[1000] glass-inner px-3 py-1.5">
        <span className="text-xs text-slate-400">
          <span className="text-white font-bold">{shipments.length}</span> shipments · USA
        </span>
      </div>
    </motion.div>
  )
}
