'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, SkipBack, SkipForward, Clock, ChevronDown, Search, CheckCircle, XCircle, AlertTriangle, Navigation, Star, MapPin, Filter } from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { cn } from '@/lib/utils'
import { generateReplayData, buildDecisionLog, computeSummary, type ReplayShipmentData, type ReplayEvent, type EventType } from '../replay/replayData'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import dynamic from 'next/dynamic'

const ReplayMap = dynamic(() => import('./ReplayMap'), { ssr: false })

// ─── Constants ─────────────────────────────────────────────────────────────
const SPEEDS = [1, 2, 5, 10] as const
const EVENT_STYLES: Record<EventType, { color: string; label: string; shape: string }> = {
  GPS_UPDATE:       { color: '#06b6d4', label: 'GPS Update',    shape: 'circle' },
  ALERT_TRIGGERED:  { color: '#f59e0b', label: 'Alert',         shape: 'triangle' },
  DISRUPTION:       { color: '#ef4444', label: 'Disruption',    shape: 'diamond' },
  ROUTE_EXECUTED:   { color: '#10b981', label: 'Route Executed',shape: 'square' },
  PREDICTION_MADE:  { color: '#a855f7', label: 'Prediction',    shape: 'star' },
}
const RISK_COLOR = (r: number) => r >= 70 ? '#ef4444' : r >= 40 ? '#f59e0b' : '#10b981'

// ─── Event marker SVG ──────────────────────────────────────────────────────
function EventMarker({ type, size = 10 }: { type: EventType; size?: number }) {
  const { color, shape } = EVENT_STYLES[type]
  const s = size
  if (shape === 'circle')   return <circle r={s / 2} fill={color} />
  if (shape === 'triangle') return <polygon points={`0,${s} ${s / 2},0 ${s},${s}`} fill={color} transform={`translate(-${s/2},-${s/2})`} />
  if (shape === 'diamond')  return <polygon points={`0,-${s/2} ${s/2},0 0,${s/2} -${s/2},0`} fill={color} />
  if (shape === 'square')   return <rect x={-s/2} y={-s/2} width={s} height={s} fill={color} />
  // star
  return <polygon points="0,-6 1.8,-1.8 6,-1.8 2.8,1.2 4,6 0,3.2 -4,6 -2.8,1.2 -6,-1.8 -1.8,-1.8" fill={color} />
}

// ─── Summary cards ─────────────────────────────────────────────────────────
function SummaryCards({ data }: { data: ReplayShipmentData[] }) {
  const s = useMemo(() => computeSummary(data), [data])
  const cards = [
    { label: 'Shipments Analyzed', value: s.totalShipments, icon: '📦', color: 'text-cyan-400' },
    { label: 'Prediction Accuracy', value: `${s.predictionAccuracy}%`, icon: '🎯', color: 'text-purple-400' },
    { label: 'Delays Prevented', value: s.delaysPrevented, icon: '✅', color: 'text-emerald-400' },
    { label: 'False Alarms', value: s.falseAlarms, icon: '⚠', color: 'text-amber-400' },
    { label: 'Avg Early Warning', value: `${s.avgEarlyWarningHours}h`, icon: '⏱', color: 'text-blue-400' },
  ]
  return (
    <div className="grid grid-cols-5 gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className="glass-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{c.icon}</span>
            <span className="text-xs text-slate-500 uppercase tracking-wider">{c.label}</span>
          </div>
          <p className={cn('text-2xl font-bold', c.color)}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Timeline scrubber ─────────────────────────────────────────────────────
interface TimelineProps {
  data: ReplayShipmentData
  cursorMs: number
  onScrub: (ms: number) => void
  playing: boolean
  onPlay: () => void
  speed: number
  onSpeed: (s: number) => void
  onStep: (dir: 1 | -1) => void
}

function Timeline({ data, cursorMs, onScrub, playing, onPlay, speed, onSpeed, onStep }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ ev: ReplayEvent; x: number } | null>(null)

  const pct = ((cursorMs - data.tripStartMs) / data.durationMs) * 100

  const handleTrackClick = (e: React.MouseEvent) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onScrub(data.tripStartMs + frac * data.durationMs)
  }

  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  // Deduplicate GPS events for display (show every 4th)
  const visibleEvents = data.events.filter((e, i) => e.type !== 'GPS_UPDATE' || i % 4 === 0)

  return (
    <div className="glass-card p-4">
      {/* Controls row */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => onStep(-1)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"><SkipBack className="h-4 w-4" /></button>
        <button onClick={onPlay} className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button onClick={() => onStep(1)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"><SkipForward className="h-4 w-4" /></button>
        <div className="flex gap-1 ml-2">
          {SPEEDS.map(s => (
            <button key={s} onClick={() => onSpeed(s)}
              className={cn('px-2 py-1 text-xs rounded-md transition-all', speed === s ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-white')}>
              {s}x
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-500 font-mono">{fmtTime(cursorMs)}</span>
      </div>

      {/* Track */}
      <div ref={trackRef} onClick={handleTrackClick} className="relative h-10 bg-slate-800/60 rounded-lg cursor-pointer overflow-visible">
        {/* Risk gradient background */}
        <div className="absolute inset-0 rounded-lg overflow-hidden">
          <div className="h-full w-full" style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.15) 0%, rgba(245,158,11,0.15) 50%, rgba(239,68,68,0.15) 80%, rgba(239,68,68,0.1) 100%)' }} />
        </div>

        {/* Event markers */}
        {visibleEvents.map(ev => {
          const x = ((ev.offsetMs) / data.durationMs) * 100
          return (
            <div key={ev.id} className="absolute top-0 bottom-0 flex items-center" style={{ left: `${x}%` }}
              onMouseEnter={() => setTooltip({ ev, x })} onMouseLeave={() => setTooltip(null)}>
              <svg width="14" height="14" viewBox="-7 -7 14 14" className="cursor-pointer hover:scale-150 transition-transform">
                <EventMarker type={ev.type} size={10} />
              </svg>
            </div>
          )
        })}

        {/* Cursor */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none" style={{ left: `${pct}%` }}>
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-white border-2 border-slate-900" />
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div className="absolute bottom-12 z-10 glass-card px-3 py-2 text-xs pointer-events-none whitespace-nowrap"
            style={{ left: `${Math.min(tooltip.x, 80)}%` }}>
            <p className="font-medium text-white">{EVENT_STYLES[tooltip.ev.type].label}</p>
            <p className="text-slate-400">{tooltip.ev.timestamp.toLocaleTimeString()}</p>
            <p className="text-slate-300">{tooltip.ev.details}</p>
          </div>
        )}
      </div>

      {/* Time axis */}
      <div className="flex justify-between mt-1 text-[10px] text-slate-600">
        <span>{fmtTime(data.tripStartMs)}</span>
        <span>{fmtTime(data.tripStartMs + data.durationMs / 2)}</span>
        <span>{fmtTime(data.tripEndMs)}</span>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 flex-wrap">
        {Object.entries(EVENT_STYLES).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="-5 -5 10 10"><EventMarker type={type as EventType} size={8} /></svg>
            <span className="text-[10px] text-slate-500">{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab 2: Prediction vs Reality chart ────────────────────────────────────
function PredictionChart({ data, cursorMs }: { data: ReplayShipmentData; cursorMs: number }) {
  const chartData = data.events
    .filter(e => e.type === 'GPS_UPDATE' || e.type === 'PREDICTION_MADE')
    .map(e => ({
      t: e.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      offsetMs: e.offsetMs,
      predicted: e.delayProbability,
      actual: data.finalOutcome === 'DELAYED' ? (e.offsetMs / data.durationMs > 0.5 ? 100 : 0) : 0,
    }))

  const alertOffsets = data.events.filter(e => e.type === 'ALERT_TRIGGERED')
  const predictions = data.events.filter(e => e.type === 'PREDICTION_MADE')
  const correct = predictions.filter(e => e.predictedOutcome === data.finalOutcome).length

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Prediction vs Reality</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
          Correct {correct}/{predictions.length} ({Math.round(correct / Math.max(predictions.length, 1) * 100)}%)
        </span>
      </div>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#94a3b8' }} />
            {/* Risk zones */}
            <Area type="monotone" dataKey={() => 40} fill="rgba(16,185,129,0.05)" stroke="none" />
            <Area type="monotone" dataKey={() => 70} fill="rgba(245,158,11,0.05)" stroke="none" />
            {/* Alert lines */}
            {alertOffsets.map(e => (
              <ReferenceLine key={e.id} x={e.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1} />
            ))}
            <Area type="monotone" dataKey="predicted" stroke="#a855f7" strokeWidth={2} strokeDasharray="6 3" fill="url(#predGrad)" name="Predicted Risk %" />
            <Area type="monotone" dataKey="actual" stroke={data.finalOutcome === 'DELAYED' ? '#ef4444' : '#10b981'} strokeWidth={2} fill="none" name="Actual Outcome" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-purple-500" style={{ borderTop: '2px dashed #a855f7' }} /><span className="text-slate-400">Predicted Risk</span></div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-0.5" style={{ background: data.finalOutcome === 'DELAYED' ? '#ef4444' : '#10b981' }} /><span className="text-slate-400">Actual Outcome</span></div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 border-t border-dashed border-amber-400" /><span className="text-slate-400">Alert fired</span></div>
      </div>
    </div>
  )
}

// ─── Tab 3: Decision log ───────────────────────────────────────────────────
function DecisionLog({ data }: { data: ReplayShipmentData }) {
  const [filter, setFilter] = useState<'ALL' | 'CORRECT' | 'MISSED' | 'FALSE_POSITIVE'>('ALL')
  const log = useMemo(() => buildDecisionLog(data), [data])
  const filtered = filter === 'ALL' ? log : log.filter(e => e.result === filter)

  const resultStyle = (r: string) => ({
    CORRECT:        'bg-emerald-500/20 text-emerald-400',
    FALSE_POSITIVE: 'bg-red-500/20 text-red-400',
    MISSED:         'bg-amber-500/20 text-amber-400',
    'N/A':          'bg-slate-500/20 text-slate-400',
  }[r] ?? 'bg-slate-500/20 text-slate-400')

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Decision Log</h3>
        <div className="flex gap-1">
          {(['ALL', 'CORRECT', 'MISSED', 'FALSE_POSITIVE'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-2 py-1 text-xs rounded-md transition-all', filter === f ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-white')}>
              {f === 'FALSE_POSITIVE' ? 'False Alarm' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              {['Time', 'Event', 'Risk', 'Action', 'Actual', 'Result'].map(h => (
                <th key={h} className="px-2 py-2 text-left text-slate-500 font-medium uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((e, i) => (
              <tr key={i} className="hover:bg-white/5 transition-colors">
                <td className="px-2 py-2 text-slate-400 font-mono whitespace-nowrap">{e.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-2 py-2 text-white">{e.event}</td>
                <td className="px-2 py-2">
                  <span style={{ color: RISK_COLOR(e.predictedRisk) }} className="font-bold">{e.predictedRisk}%</span>
                </td>
                <td className="px-2 py-2 text-slate-300">{e.action}</td>
                <td className="px-2 py-2">
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', e.actualOutcome === 'DELAYED' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400')}>
                    {e.actualOutcome}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', resultStyle(e.result))}>{e.result}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-8 text-center text-slate-600">No entries match filter</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Shipment selector ─────────────────────────────────────────────────────
function ShipmentSelector({ shipments, selected, onSelect }: {
  shipments: import('@/frontend/store/useStore').Shipment[]
  selected: string[]
  onSelect: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const filtered = shipments.filter(s =>
    !q || s.id.toLowerCase().includes(q.toLowerCase()) ||
    s.origin.toLowerCase().includes(q.toLowerCase()) ||
    s.destination.toLowerCase().includes(q.toLowerCase())
  )

  const toggle = (id: string) => {
    if (selected.includes(id)) onSelect(selected.filter(s => s !== id))
    else if (selected.length < 3) onSelect([...selected, id])
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 glass-inner border border-white/10 rounded-lg text-sm text-white hover:border-white/20 transition-colors min-w-[200px]">
        <span className="flex-1 text-left truncate">
          {selected.length === 0 ? 'Select shipments...' : selected.join(', ')}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute top-full mt-1 w-72 glass-card border border-white/10 rounded-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-white/10">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-black/30 rounded-lg">
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." autoFocus
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none" />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.map(s => {
                const isSelected = selected.includes(s.id)
                const riskColor = s.riskLevel === 'critical' || s.riskLevel === 'high' ? 'text-red-400' : s.riskLevel === 'medium' ? 'text-amber-400' : 'text-emerald-400'
                return (
                  <button key={s.id} onClick={() => toggle(s.id)}
                    className={cn('w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors text-left', isSelected && 'bg-cyan-500/10')}>
                    <div className={cn('h-4 w-4 rounded border flex items-center justify-center flex-shrink-0', isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-white/20')}>
                      {isSelected && <span className="text-[10px] text-white font-bold">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{s.id}</p>
                      <p className="text-xs text-slate-500 truncate">{s.origin} → {s.destination}</p>
                    </div>
                    <span className={cn('text-xs font-bold uppercase', riskColor)}>{s.riskLevel}</span>
                  </button>
                )
              })}
            </div>
            <div className="p-2 border-t border-white/10 text-xs text-slate-500 text-center">
              {selected.length}/3 selected · Max 3
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Date range picker ─────────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: 'Last 24h', days: 1 },
  { label: 'Last 7d', days: 7 },
  { label: 'Last 30d', days: 30 },
]

function DateRangePicker({ days, onDays }: { days: number; onDays: (d: number) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-black/30 rounded-lg">
      {DATE_PRESETS.map(p => (
        <button key={p.days} onClick={() => onDays(p.days)}
          className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-all', days === p.days ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white')}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main ReplayView ───────────────────────────────────────────────────────
export function ReplayView() {
  const { shipments } = useDashboardStore()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [days, setDays] = useState(7)
  const [activeTab, setActiveTab] = useState<'map' | 'chart' | 'log'>('chart')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(2)
  const [cursorMs, setCursorMs] = useState(0)
  const [focusIdx, setFocusIdx] = useState(0)  // which selected shipment is in focus
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)

  // Auto-select first high-risk shipment
  useEffect(() => {
    if (selectedIds.length === 0 && shipments.length > 0) {
      const high = shipments.find(s => s.riskLevel === 'high' || s.riskLevel === 'critical')
      setSelectedIds([high?.id ?? shipments[0].id])
    }
  }, [shipments])

  // Generate replay data for selected shipments
  const replayDataMap = useMemo(() => {
    const map: Record<string, ReplayShipmentData> = {}
    for (const id of selectedIds) {
      const s = shipments.find(sh => sh.id === id)
      if (s) map[id] = generateReplayData(s, days)
    }
    return map
  }, [selectedIds, shipments, days])

  const focusData = replayDataMap[selectedIds[focusIdx]] ?? Object.values(replayDataMap)[0]

  // Init cursor to trip start
  useEffect(() => {
    if (focusData) setCursorMs(focusData.tripStartMs)
  }, [focusData?.bookingId])

  // Playback loop
  useEffect(() => {
    if (!playing || !focusData) return
    const tick = (now: number) => {
      if (lastTickRef.current === 0) { lastTickRef.current = now }
      const realDelta = now - lastTickRef.current
      lastTickRef.current = now
      // 1x = 1 real second = 1 simulated hour
      const simDelta = realDelta * speed * 3600
      setCursorMs(prev => {
        const next = prev + simDelta
        if (next >= focusData.tripEndMs) { setPlaying(false); return focusData.tripEndMs }
        // Auto-pause on critical events
        const crossed = focusData.events.find(e =>
          (e.type === 'ALERT_TRIGGERED' || e.type === 'ROUTE_EXECUTED') &&
          e.riskLevel === 'HIGH' &&
          prev < focusData.tripStartMs + e.offsetMs &&
          next >= focusData.tripStartMs + e.offsetMs
        )
        if (crossed) { setPlaying(false); return focusData.tripStartMs + crossed.offsetMs }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    lastTickRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing, speed, focusData])

  const handleStep = (dir: 1 | -1) => {
    if (!focusData) return
    const events = focusData.events
    const curOffset = cursorMs - focusData.tripStartMs
    if (dir === 1) {
      const next = events.find(e => e.offsetMs > curOffset + 100)
      if (next) setCursorMs(focusData.tripStartMs + next.offsetMs)
    } else {
      const prev = [...events].reverse().find(e => e.offsetMs < curOffset - 100)
      if (prev) setCursorMs(focusData.tripStartMs + prev.offsetMs)
    }
  }

  // Current event at cursor
  const currentEvent = focusData?.events.reduce<ReplayEvent | null>((best, e) => {
    const offset = cursorMs - focusData.tripStartMs
    if (e.offsetMs <= offset) return e
    return best
  }, null)

  const allReplayData = Object.values(replayDataMap)

  return (
    <main className="pt-20 pb-4 px-6 h-screen flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 mb-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-cyan-400" />
            Historical Replay
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Scrub through past events · Predictions vs Reality</p>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <DateRangePicker days={days} onDays={setDays} />
          <ShipmentSelector shipments={shipments} selected={selectedIds} onSelect={setSelectedIds} />
        </div>
      </div>

      {/* ── Summary cards ── */}
      {allReplayData.length > 0 && <SummaryCards data={allReplayData} />}

      {/* ── No data state ── */}
      {allReplayData.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Clock className="h-12 w-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Select shipments to replay</p>
            <p className="text-xs text-slate-600 mt-1">Use the dropdown above to choose up to 3 shipments</p>
          </div>
        </div>
      )}

      {focusData && (
        <>
          {/* ── Multi-shipment tabs (if >1 selected) ── */}
          {selectedIds.length > 1 && (
            <div className="flex gap-1 mb-3 flex-shrink-0">
              {selectedIds.map((id, i) => (
                <button key={id} onClick={() => setFocusIdx(i)}
                  className={cn('px-3 py-1.5 text-xs rounded-lg transition-all', focusIdx === i ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-white bg-white/5')}>
                  {id}
                </button>
              ))}
            </div>
          )}

          {/* ── Timeline ── */}
          <div className="flex-shrink-0 mb-4">
            <Timeline data={focusData} cursorMs={cursorMs} onScrub={setCursorMs}
              playing={playing} onPlay={() => setPlaying(p => !p)}
              speed={speed} onSpeed={setSpeed} onStep={handleStep} />
          </div>

          {/* ── Detail panel ── */}
          <div className="flex-1 glass-card overflow-hidden flex flex-col min-h-0">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-white/10 flex-shrink-0">
              {([['map', 'Map Replay', '🗺'], ['chart', 'Prediction vs Reality', '📈'], ['log', 'Decision Log', '📋']] as const).map(([key, label, icon]) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px',
                    activeTab === key ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white')}>
                  <span>{icon}</span>{label}
                </button>
              ))}
              {/* Current event badge */}
              {currentEvent && (
                <div className="ml-auto flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/60 border border-white/10 text-xs mb-1">
                  <svg width="8" height="8" viewBox="-4 -4 8 8"><EventMarker type={currentEvent.type} size={6} /></svg>
                  <span className="text-slate-300">{currentEvent.details}</span>
                </div>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'map' && (
                <ReplayMap data={focusData} cursorMs={cursorMs} />
              )}
              {activeTab === 'chart' && (
                <PredictionChart data={focusData} cursorMs={cursorMs} />
              )}
              {activeTab === 'log' && (
                <DecisionLog data={focusData} />
              )}
            </div>
          </div>
        </>
      )}
    </main>
  )
}
