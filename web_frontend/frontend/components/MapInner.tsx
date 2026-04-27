'use client'

/**
 * MapInner — all react-leaflet code lives here.
 * Loaded via dynamic() with ssr:false from LiveMap.tsx.
 * This avoids every SSR / hook-outside-provider issue.
 */
import { useEffect, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  Tooltip,
  useMap,
} from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import type { Shipment, RiskLevel } from '../store/useStore'

const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
}

// ─── Inner controller — must be a child of MapContainer ───────────────────────
function MapController({
  selectedShipmentId,
  shipments,
  onFitAllReady,
}: {
  selectedShipmentId: string | null
  shipments: Shipment[]
  onFitAllReady: (fn: () => void) => void
}) {
  const map = useMap()

  // Expose fitAll to parent
  useEffect(() => {
    onFitAllReady(() => {
      if (shipments.length === 0) return
      const lats = shipments.map(s => s.currentLocation[0])
      const lons = shipments.map(s => s.currentLocation[1])
      map.fitBounds(
        [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
        { padding: [40, 40], animate: true },
      )
    })
  }, [map, shipments, onFitAllReady])

  // Pan to selected shipment
  useEffect(() => {
    if (!selectedShipmentId) return
    const s = shipments.find(sh => sh.id === selectedShipmentId)
    if (s) {
      map.setView([s.currentLocation[0], s.currentLocation[1]], 7, { animate: true })
    }
  }, [map, selectedShipmentId, shipments])

  return null
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface MapInnerProps {
  shipments: Shipment[]
  selectedShipmentId: string | null
  tileUrl: string
  tileAttribution: string
  onSelectShipment: (id: string) => void
  onFitAllReady: (fn: () => void) => void
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function MapInner({
  shipments,
  selectedShipmentId,
  tileUrl,
  tileAttribution,
  onSelectShipment,
  onFitAllReady,
}: MapInnerProps) {
  return (
    <MapContainer
      center={[39.5, -98.35]}
      zoom={4}
      style={{ height: '100%', width: '100%', background: '#0a0e1a' }}
      zoomControl={true}
    >
      <TileLayer url={tileUrl} attribution={tileAttribution} />

      <MapController
        selectedShipmentId={selectedShipmentId}
        shipments={shipments}
        onFitAllReady={onFitAllReady}
      />

      {shipments.map(shipment => {
        const color = RISK_COLORS[shipment.riskLevel]
        const isSelected = shipment.id === selectedShipmentId

        return (
          <ShipmentLayer
            key={shipment.id}
            shipment={shipment}
            color={color}
            isSelected={isSelected}
            onSelect={onSelectShipment}
          />
        )
      })}
    </MapContainer>
  )
}

// ─── Per-shipment layer ───────────────────────────────────────────────────────
function ShipmentLayer({
  shipment,
  color,
  isSelected,
  onSelect,
}: {
  shipment: Shipment
  color: string
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const route = shipment.route as [number, number][]
  const current = shipment.currentLocation as [number, number]
  const origin = route[0]
  const dest = route[route.length - 1]

  return (
    <>
      {/* Main route polyline */}
      <Polyline
        positions={route}
        pathOptions={{
          color,
          weight: isSelected ? 4 : 2.5,
          opacity: isSelected ? 1 : 0.55,
          dashArray:
            shipment.riskLevel === 'critical' ? '12 8' :
            shipment.riskLevel === 'high' ? '8 5' : undefined,
        }}
      />

      {/* Alternative routes (selected only) */}
      {isSelected && shipment.alternativeRoutes?.map((alt, idx) => (
        <Polyline
          key={`alt-${idx}`}
          positions={alt.route as [number, number][]}
          pathOptions={{
            color: '#06b6d4',
            weight: 2.5,
            opacity: 0.75,
            dashArray: '6 8',
          }}
        />
      ))}

      {/* Origin dot */}
      <CircleMarker
        center={origin}
        radius={4}
        pathOptions={{
          color: '#0a0e1a',
          fillColor: color,
          fillOpacity: 0.9,
          weight: 1.5,
        }}
      />

      {/* Destination ring */}
      <CircleMarker
        center={dest}
        radius={5}
        pathOptions={{
          color,
          fillColor: '#0a0e1a',
          fillOpacity: 0.9,
          weight: 2,
        }}
      />

      {/* Truck marker (current position) */}
      <CircleMarker
        center={current}
        radius={isSelected ? 10 : 7}
        pathOptions={{
          color: '#0a0e1a',
          fillColor: color,
          fillOpacity: 1,
          weight: isSelected ? 2.5 : 1.5,
        }}
        eventHandlers={{ click: () => onSelect(shipment.id) }}
      >
        <Tooltip direction="top" offset={[0, -10]} opacity={1}>
          <div style={{
            background: '#1e293b', color: '#fff',
            padding: '6px 10px', borderRadius: 6,
            fontSize: 12, minWidth: 160, lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700 }}>{shipment.id}</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>
              {shipment.origin} → {shipment.destination}
            </div>
            <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{
                background: `${color}33`, color,
                padding: '1px 7px', borderRadius: 99,
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              }}>
                {shipment.riskLevel}
              </span>
              <span style={{ color: '#cbd5e1', fontSize: 11 }}>
                {shipment.riskScore}% risk
              </span>
            </div>
          </div>
        </Tooltip>

        <Popup>
          <div style={{ minWidth: 180, fontFamily: 'sans-serif' }}>
            <strong style={{ fontSize: 13 }}>{shipment.id}</strong>
            <div style={{ color: '#64748b', fontSize: 12, margin: '4px 0' }}>
              {shipment.origin} → {shipment.destination}
            </div>
            <div style={{ fontSize: 12 }}>
              <span style={{ color, fontWeight: 700 }}>
                {shipment.riskLevel.toUpperCase()}
              </span>
              {' · '}Risk: {shipment.riskScore}%
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              ETA: {shipment.eta}
            </div>
            {shipment.riskLevel === 'high' || shipment.riskLevel === 'critical' ? (
              <div style={{
                marginTop: 6, padding: '4px 8px',
                background: '#ef444422', color: '#ef4444',
                borderRadius: 4, fontSize: 11,
              }}>
                ⚠ Click to view reroute options
              </div>
            ) : null}
          </div>
        </Popup>
      </CircleMarker>
    </>
  )
}
