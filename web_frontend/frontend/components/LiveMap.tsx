'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useDashboardStore, type RiskLevel } from '../store/useStore'
import dynamic from 'next/dynamic'

// Dynamically import map components to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
)
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
)
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
)

const riskColors: Record<RiskLevel, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
}

export function LiveMap() {
  const { shipments, selectedShipmentId, setSelectedShipment } = useDashboardStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card h-full flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading map...</p>
        </div>
      </motion.div>
    )
  }

  const selectedShipment = shipments.find((s) => s.id === selectedShipmentId)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card h-full overflow-hidden relative"
    >
      {/* Map legend */}
      <div className="absolute top-4 right-4 z-[1000] glass-inner p-3 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">
          Risk Levels
        </p>
        {Object.entries(riskColors).map(([level, color]) => (
          <div key={level} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
            />
            <span className="text-xs text-slate-400 capitalize">{level}</span>
          </div>
        ))}
      </div>

      {/* Selected shipment info */}
      {selectedShipment && (
        <div className="absolute bottom-4 left-4 z-[1000] glass-inner p-3 min-w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">{selectedShipment.id}</span>
            <span
              className="px-2 py-0.5 text-xs font-medium uppercase rounded-full"
              style={{
                backgroundColor: `${riskColors[selectedShipment.riskLevel]}20`,
                color: riskColors[selectedShipment.riskLevel],
              }}
            >
              {selectedShipment.riskLevel}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {selectedShipment.origin} → {selectedShipment.destination}
          </p>
          <p className="text-xs text-slate-500 mt-1">ETA: {selectedShipment.eta}</p>
        </div>
      )}

      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {shipments.map((shipment) => {
          const color = riskColors[shipment.riskLevel]
          const isSelected = selectedShipmentId === shipment.id

          return (
            <div key={shipment.id}>
              {/* Route polyline */}
              <Polyline
                positions={shipment.route as [number, number][]}
                pathOptions={{
                  color,
                  weight: isSelected ? 3 : 2,
                  opacity: isSelected ? 1 : 0.6,
                  dashArray: shipment.riskLevel === 'critical' ? '10, 10' : undefined,
                }}
              />

              {/* Alternative routes for high/critical risk */}
              {isSelected &&
                shipment.alternativeRoutes?.map((alt, idx) => (
                  <Polyline
                    key={`alt-${idx}`}
                    positions={alt.route as [number, number][]}
                    pathOptions={{
                      color: '#06b6d4',
                      weight: 2,
                      opacity: 0.5,
                      dashArray: '5, 10',
                    }}
                  />
                ))}

              {/* Current location marker */}
              <Marker position={shipment.currentLocation as [number, number]}>
                <Popup>
                  <div className="p-1">
                    <p className="font-medium">{shipment.id}</p>
                    <p className="text-sm text-gray-600">
                      {shipment.origin} → {shipment.destination}
                    </p>
                    <p className="text-sm">Risk: {shipment.riskScore}%</p>
                  </div>
                </Popup>
              </Marker>
            </div>
          )
        })}
      </MapContainer>
    </motion.div>
  )
}
