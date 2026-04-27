'use client'
import { useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import type { ReplayEvent, HistoryShipment } from '@/lib/api'

const RISK_COLOR = (score: number) =>
  score > 0.7 ? '#ef4444' : score > 0.4 ? '#f59e0b' : '#10b981'

interface Props {
  shipment: HistoryShipment
  events: ReplayEvent[]
  cursorTime: number
}

export default function ReplayMapInner({ shipment, events, cursorTime }: Props) {
  // GPS events up to cursor
  const gpsEvents = useMemo(() =>
    events
      .filter(e => e.type === 'gps_update' && e.lat != null && e.lon != null)
      .filter(e => new Date(e.timestamp).getTime() <= cursorTime)
      .map(e => [e.lat!, e.lon!] as [number, number]),
    [events, cursorTime])

  // Full ghost trail
  const fullTrail = useMemo(() =>
    events
      .filter(e => e.type === 'gps_update' && e.lat != null && e.lon != null)
      .map(e => [e.lat!, e.lon!] as [number, number]),
    [events])

  // Current position = last GPS point up to cursor
  const currentPos = gpsEvents.length > 0
    ? gpsEvents[gpsEvents.length - 1]
    : [shipment.origin_lat, shipment.origin_lon] as [number, number]

  // Risk at cursor
  const predAtCursor = useMemo(() => {
    const preds = events
      .filter(e => e.type === 'prediction' && e.risk_score != null)
      .filter(e => new Date(e.timestamp).getTime() <= cursorTime)
    return preds.length > 0 ? preds[preds.length - 1].risk_score! : shipment.current_risk_score
  }, [events, cursorTime, shipment.current_risk_score])

  const color = RISK_COLOR(predAtCursor)
  const center: [number, number] = [
    (shipment.origin_lat + shipment.destination_lat) / 2,
    (shipment.origin_lon + shipment.destination_lon) / 2,
  ]

  return (
    <MapContainer center={center} zoom={5}
      style={{ height: '100%', width: '100%', background: '#0a0e1a' }}
      zoomControl={true}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; CARTO' />

      {/* Ghost trail (full path, faint) */}
      {fullTrail.length > 1 && (
        <Polyline positions={fullTrail}
          pathOptions={{ color: '#475569', weight: 1.5, opacity: 0.3, dashArray: '4 6' }} />
      )}

      {/* Travelled path */}
      {gpsEvents.length > 1 && (
        <Polyline positions={gpsEvents}
          pathOptions={{ color, weight: 3, opacity: 0.85 }} />
      )}

      {/* Origin */}
      <CircleMarker center={[shipment.origin_lat, shipment.origin_lon]} radius={5}
        pathOptions={{ color: '#0a0e1a', fillColor: '#06b6d4', fillOpacity: 0.9, weight: 1.5 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>
          <span style={{ fontSize: 10 }}>Origin</span>
        </Tooltip>
      </CircleMarker>

      {/* Destination */}
      <CircleMarker center={[shipment.destination_lat, shipment.destination_lon]} radius={5}
        pathOptions={{ color, fillColor: '#0a0e1a', fillOpacity: 0.9, weight: 2 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>
          <span style={{ fontSize: 10 }}>Destination</span>
        </Tooltip>
      </CircleMarker>

      {/* Current truck position */}
      <CircleMarker center={currentPos} radius={9}
        pathOptions={{ color: '#0a0e1a', fillColor: color, fillOpacity: 1, weight: 2 }}>
        <Tooltip direction="top" offset={[0, -12]}>
          <div style={{ fontSize: 11 }}>
            <strong>{shipment.booking_id}</strong><br />
            Risk: {Math.round(predAtCursor * 100)}%
          </div>
        </Tooltip>
      </CircleMarker>

      {/* Non-GPS event markers */}
      {events
        .filter(e => e.type !== 'gps_update' && e.lat != null && e.lon != null)
        .filter(e => new Date(e.timestamp).getTime() <= cursorTime)
        .map(e => (
          <CircleMarker key={e.id}
            center={[e.lat!, e.lon!]} radius={5}
            pathOptions={{
              color: '#0a0e1a',
              fillColor: e.type === 'alert' ? '#f59e0b' : e.type === 'disruption' ? '#ef4444' : '#10b981',
              fillOpacity: 0.9, weight: 1,
            }}>
            <Tooltip><span style={{ fontSize: 10 }}>{e.details}</span></Tooltip>
          </CircleMarker>
        ))}
    </MapContainer>
  )
}
