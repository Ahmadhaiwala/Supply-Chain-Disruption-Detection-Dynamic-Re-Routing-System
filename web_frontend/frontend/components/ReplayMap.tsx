'use client'

import { useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import type { ReplayShipmentData } from '../replay/replayData'

const RISK_COLOR = (r: number) => r >= 70 ? '#ef4444' : r >= 40 ? '#f59e0b' : '#10b981'

interface Props {
  data: ReplayShipmentData
  cursorMs: number
}

export default function ReplayMap({ data, cursorMs }: Props) {
  const cursorOffset = cursorMs - data.tripStartMs
  const progress = Math.max(0, Math.min(1, cursorOffset / data.durationMs))

  // Current position: interpolate along full path
  const pathIdx = Math.floor(progress * (data.fullPath.length - 1))
  const nextIdx = Math.min(pathIdx + 1, data.fullPath.length - 1)
  const localT = (progress * (data.fullPath.length - 1)) - pathIdx
  const curPos: [number, number] = [
    data.fullPath[pathIdx][0] + (data.fullPath[nextIdx][0] - data.fullPath[pathIdx][0]) * localT,
    data.fullPath[pathIdx][1] + (data.fullPath[nextIdx][1] - data.fullPath[pathIdx][1]) * localT,
  ]

  // Travelled path (ghost trail up to cursor)
  const travelledPath = data.fullPath.slice(0, pathIdx + 1)

  // Current risk from nearest prediction event
  const currentRisk = useMemo(() => {
    const pred = [...data.events]
      .filter(e => e.type === 'PREDICTION_MADE' && e.offsetMs <= cursorOffset)
      .pop()
    return pred?.riskScore ?? 20
  }, [data.events, cursorOffset])

  const color = RISK_COLOR(currentRisk)

  // Check if a reroute happened before cursor
  const rerouted = data.events.some(e => e.type === 'ROUTE_EXECUTED' && e.offsetMs <= cursorOffset)

  const center: [number, number] = [
    (data.originCoords[0] + data.destCoords[0]) / 2,
    (data.originCoords[1] + data.destCoords[1]) / 2,
  ]

  return (
    <MapContainer center={center} zoom={5}
      style={{ height: '100%', width: '100%', background: '#0a0e1a' }}
      zoomControl={false}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; CARTO'
      />

      {/* Ghost trail — full planned path */}
      <Polyline positions={data.fullPath} pathOptions={{ color: '#334155', weight: 1.5, opacity: 0.4, dashArray: '4 6' }} />

      {/* Travelled path */}
      {travelledPath.length > 1 && (
        <Polyline positions={travelledPath} pathOptions={{ color, weight: 3, opacity: 0.8 }} />
      )}

      {/* Origin */}
      <CircleMarker center={data.originCoords} radius={5}
        pathOptions={{ color: '#0a0e1a', fillColor: '#06b6d4', fillOpacity: 1, weight: 1.5 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>
          <span style={{ fontSize: 11 }}>{data.origin}</span>
        </Tooltip>
      </CircleMarker>

      {/* Destination */}
      <CircleMarker center={data.destCoords} radius={5}
        pathOptions={{ color: '#06b6d4', fillColor: '#0a0e1a', fillOpacity: 1, weight: 2 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>
          <span style={{ fontSize: 11 }}>{data.destination}</span>
        </Tooltip>
      </CircleMarker>

      {/* Current truck position */}
      <CircleMarker center={curPos} radius={9}
        pathOptions={{ color: '#0a0e1a', fillColor: color, fillOpacity: 1, weight: 2.5 }}>
        <Tooltip direction="top" offset={[0, -12]}>
          <div style={{ fontSize: 11 }}>
            <strong>{data.bookingId}</strong><br />
            Risk: {currentRisk}% · {rerouted ? 'Rerouted' : 'Original route'}
          </div>
        </Tooltip>
      </CircleMarker>

      {/* Alert event markers */}
      {data.events
        .filter(e => (e.type === 'ALERT_TRIGGERED' || e.type === 'DISRUPTION') && e.offsetMs <= cursorOffset)
        .map(e => (
          <CircleMarker key={e.id} center={[e.lat, e.lon]} radius={5}
            pathOptions={{ color: e.type === 'DISRUPTION' ? '#ef4444' : '#f59e0b', fillColor: e.type === 'DISRUPTION' ? '#ef4444' : '#f59e0b', fillOpacity: 0.7, weight: 1 }}>
            <Tooltip><span style={{ fontSize: 11 }}>{e.details}</span></Tooltip>
          </CircleMarker>
        ))}
    </MapContainer>
  )
}
