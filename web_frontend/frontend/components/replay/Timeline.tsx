'use client'
import { useRef, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EVENT_META, type EventType, type PlaySpeed, type ReplayState } from './types'
import type { ReplayEvent } from '@/lib/api'

interface TimelineProps {
  events: ReplayEvent[]
  state: ReplayState
  onCursorChange: (t: number) => void
  onPlayPause: () => void
  onSpeedChange: (s: PlaySpeed) => void
  onStep: (dir: 1 | -1) => void
}

const SPEEDS: PlaySpeed[] = [1, 2, 5, 10]

function EventMarker({ event, pct, isHovered, onClick, onHover }: {
  event: ReplayEvent
  pct: number
  isHovered: boolean
  onClick: () => void
  onHover: (id: string | null) => void
}) {
  const meta = EVENT_META[event.type as EventType] ?? EVENT_META.gps_update
  const size = isHovered ? 14 : event.type === 'gps_update' ? 6 : 10

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 cursor-pointer group"
      style={{ left: `${pct}%`, zIndex: isHovered ? 20 : 10 }}
      onClick={onClick}
      onMouseEnter={() => onHover(event.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Marker shape */}
      <div
        className="rounded-full transition-all duration-150"
        style={{
          width: size, height: size,
          background: meta.color,
          boxShadow: isHovered ? `0 0 10px ${meta.color}` : undefined,
          transform: event.type === 'disruption' ? 'rotate(45deg)' : undefined,
          borderRadius: event.type === 'route_exec' ? '2px' : undefined,
        }}
      />

      {/* Tooltip */}
      {isHovered && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="glass-card px-2.5 py-1.5 text-xs whitespace-nowrap border border-white/10">
            <p className="font-medium text-white">{meta.emoji} {meta.label}</p>
            <p className="text-slate-400">{new Date(event.timestamp).toLocaleTimeString()}</p>
            <p className="text-slate-300 max-w-[180px] truncate">{event.details}</p>
            {event.risk_score != null && (
              <p style={{ color: meta.color }}>Risk: {Math.round(event.risk_score * 100)}%</p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

export function Timeline({ events, state, onCursorChange, onPlayPause, onSpeedChange, onStep }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const { minT, maxT, range } = useMemo(() => {
    if (!events.length) {
      const now = Date.now()
      return { minT: now - 86400000, maxT: now, range: 86400000 }
    }
    const times = events.map(e => new Date(e.timestamp).getTime())
    const minT = Math.min(...times)
    const maxT = Math.max(...times)
    return { minT, maxT, range: Math.max(maxT - minT, 3600000) }
  }, [events])

  const cursorPct = range > 0 ? ((state.cursorTime - minT) / range) * 100 : 0

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onCursorChange(minT + pct * range)
  }, [minT, range, onCursorChange])

  // Tick marks
  const ticks = useMemo(() => {
    const count = 8
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = minT + (range / count) * i
      return { pct: (i / count) * 100, label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    })
  }, [minT, range])

  return (
    <div className="glass-card p-4 mb-4">
      {/* Controls row */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          <button onClick={() => onStep(-1)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
            <SkipBack className="h-4 w-4" />
          </button>
          <button onClick={onPlayPause}
            className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
            {state.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={() => onStep(1)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1 p-1 bg-black/30 rounded-lg">
          {SPEEDS.map(s => (
            <button key={s} onClick={() => onSpeedChange(s)}
              className={cn('px-2 py-1 text-xs font-medium rounded-md transition-all',
                state.speed === s ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-white')}>
              {s}x
            </button>
          ))}
        </div>

        {/* Current time */}
        <span className="text-xs font-mono text-slate-400 ml-auto">
          {new Date(state.cursorTime).toLocaleString()}
        </span>

        {/* Legend */}
        <div className="flex items-center gap-3">
          {(Object.entries(EVENT_META) as [EventType, typeof EVENT_META[EventType]][])
            .filter(([k]) => k !== 'status_change')
            .map(([k, v]) => (
              <div key={k} className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full" style={{ background: v.color }} />
                <span className="text-[10px] text-slate-500">{v.label}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Track */}
      <div className="relative">
        {/* Tick labels */}
        <div className="relative h-4 mb-1">
          {ticks.map((t, i) => (
            <span key={i} className="absolute text-[9px] text-slate-600 -translate-x-1/2"
              style={{ left: `${t.pct}%` }}>
              {t.label}
            </span>
          ))}
        </div>

        {/* Track bar */}
        <div ref={trackRef} onClick={handleTrackClick}
          className="relative h-8 bg-slate-800/60 rounded-full cursor-pointer border border-white/10 overflow-visible">

          {/* Progress fill */}
          <div className="absolute left-0 top-0 bottom-0 rounded-full bg-cyan-500/10"
            style={{ width: `${Math.max(0, Math.min(100, cursorPct))}%` }} />

          {/* Tick lines */}
          {ticks.map((t, i) => (
            <div key={i} className="absolute top-0 bottom-0 w-px bg-white/5"
              style={{ left: `${t.pct}%` }} />
          ))}

          {/* Event markers */}
          {events.map(ev => {
            const t = new Date(ev.timestamp).getTime()
            const pct = range > 0 ? ((t - minT) / range) * 100 : 0
            if (pct < 0 || pct > 100) return null
            return (
              <EventMarker key={ev.id} event={ev} pct={pct}
                isHovered={state.hoveredEventId === ev.id}
                onClick={() => onCursorChange(t)}
                onHover={(id) => {}} />
            )
          })}

          {/* Cursor */}
          <motion.div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none"
            style={{ left: `${Math.max(0, Math.min(100, cursorPct))}%` }}
            animate={{ left: `${Math.max(0, Math.min(100, cursorPct))}%` }}
            transition={{ type: 'tween', duration: 0.1 }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-white shadow-[0_0_8px_white]" />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
