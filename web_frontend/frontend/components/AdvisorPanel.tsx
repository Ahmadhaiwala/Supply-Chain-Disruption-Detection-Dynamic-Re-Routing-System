'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Send, Bot, Sparkles, AlertTriangle, Navigation,
  CloudRain, Clock, ChevronRight, RotateCcw,
} from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { cn } from '@/lib/utils'
import {
  detectIntent, generateResponse, getQuickChips,
  type Message, type BotMessage, type ExplanationPayload,
  type ComparisonPayload, type WhatIfPayload, type WeatherPayload,
} from '../advisor/intent'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts'

// ─── Risk colours ──────────────────────────────────────────────────────────
const RISK_COLOR = (pct: number) =>
  pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#10b981'

// ─── Typing indicator ──────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-2 w-2 rounded-full bg-slate-500"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  )
}

// ─── Mini risk gauge ───────────────────────────────────────────────────────
function MiniGauge({ value, size = 64 }: { value: number; size?: number }) {
  const color = RISK_COLOR(value)
  const data = [{ v: value }, { v: 100 - value }]
  return (
    <div style={{ width: size, height: size }} className="relative flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="v" cx="50%" cy="50%"
            innerRadius="55%" outerRadius="80%"
            startAngle={90} endAngle={-270} stroke="none">
            <Cell fill={color} />
            <Cell fill="rgba(255,255,255,0.06)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold" style={{ color }}>{value}%</span>
      </div>
    </div>
  )
}

// ─── SHAP bar chart ────────────────────────────────────────────────────────
function ShapChart({ features }: { features: { feature: string; value: number }[] }) {
  const data = features.slice(0, 4).map((f) => ({
    name: f.feature.length > 18 ? f.feature.slice(0, 16) + '…' : f.feature,
    value: Math.round(f.value * 100),
  }))
  return (
    <div className="h-28 w-full mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive>
            {data.map((_, i) => (
              <Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#f59e0b'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Route comparison mini-cards ───────────────────────────────────────────
function RouteCards({ payload, onExecute }: {
  payload: ComparisonPayload
  onExecute: (label: string) => void
}) {
  const { current, alternatives } = payload
  const best = alternatives.find((a) => a.is_recommended) ?? alternatives[0]

  return (
    <div className="flex gap-2 mt-2 flex-wrap">
      {/* Current */}
      <div className="flex-1 min-w-[120px] p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
        <p className="text-xs text-red-400 font-medium mb-1 truncate">{current.label}</p>
        <p className="text-lg font-bold text-white">{Math.round(current.delay_risk * 100)}%</p>
        <p className="text-xs text-slate-500">risk</p>
        <p className="text-xs text-slate-400 mt-1">
          {Math.round(current.estimated_eta_minutes / 60)}h ETA
        </p>
      </div>

      {/* Best alternative */}
      {best && (
        <div className="flex-1 min-w-[120px] p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/40 relative">
          <span className="absolute -top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold uppercase bg-cyan-500 text-black rounded">
            Best
          </span>
          <p className="text-xs text-cyan-400 font-medium mb-1 truncate">{best.label}</p>
          <p className="text-lg font-bold text-white">{Math.round(best.delay_risk * 100)}%</p>
          <p className="text-xs text-slate-500">risk</p>
          <p className="text-xs text-slate-400 mt-1">
            {Math.round(best.estimated_eta_minutes / 60)}h · +${best.extra_cost_inr.toLocaleString()}
          </p>
          <button
            onClick={() => onExecute(best.label)}
            className="mt-2 w-full text-xs py-1 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 transition-colors"
          >
            Execute →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Weather card ──────────────────────────────────────────────────────────
function WeatherCard({ payload }: { payload: WeatherPayload }) {
  const { origin, destination } = payload
  const condIcon = (c: string) =>
    c.includes('Rain') ? '🌧' : c.includes('Snow') ? '❄' : c.includes('Cloud') ? '☁' : '☀'

  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {[{ label: 'Origin', wx: origin }, { label: 'Destination', wx: destination }].map(({ label, wx }) => (
        <div key={label} className="p-2.5 rounded-lg bg-slate-800/60 border border-white/10">
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-lg">{condIcon(wx.condition)}</span>
            <span className="text-sm font-bold text-white">{wx.temperature_f.toFixed(0)}°F</span>
          </div>
          <p className="text-xs text-slate-400">{wx.condition}</p>
          <p className="text-xs text-slate-500">{wx.precipitation_mm.toFixed(1)}mm · {wx.wind_speed_mph.toFixed(0)} mph</p>
        </div>
      ))}
    </div>
  )
}

// ─── What-if result ────────────────────────────────────────────────────────
function WhatIfCard({ payload }: { payload: WhatIfPayload }) {
  const improved = payload.newRisk < payload.originalRisk
  return (
    <div className="mt-2 p-3 rounded-lg bg-slate-800/60 border border-white/10">
      <div className="flex items-center gap-4 mb-2">
        <div className="text-center">
          <p className="text-xs text-slate-500">Now</p>
          <p className="text-xl font-bold" style={{ color: RISK_COLOR(payload.originalRisk) }}>
            {payload.originalRisk}%
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-600" />
        <div className="text-center">
          <p className="text-xs text-slate-500">After {payload.delayHours}h</p>
          <p className="text-xl font-bold" style={{ color: RISK_COLOR(payload.newRisk) }}>
            {payload.newRisk}%
          </p>
        </div>
        <div className={cn(
          'ml-auto px-2 py-1 rounded text-xs font-bold',
          improved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400',
        )}>
          {improved ? `↓ ${payload.originalRisk - payload.newRisk}%` : `↑ ${payload.newRisk - payload.originalRisk}%`}
        </div>
      </div>
      {payload.missesDeadline && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 mt-1">
          <AlertTriangle className="h-3 w-3" />
          Likely misses delivery window
        </div>
      )}
    </div>
  )
}

// ─── Markdown-lite renderer ────────────────────────────────────────────────
function MdText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        // Bold: **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        return (
          <p key={i} className={cn('text-sm leading-relaxed', line === '' && 'h-2')}>
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j} className="font-semibold text-white">{part.slice(2, -2)}</strong>
                : <span key={j} className="text-slate-300">{part}</span>
            )}
          </p>
        )
      })}
    </div>
  )
}

// ─── Single message bubble ─────────────────────────────────────────────────
function MessageBubble({
  msg,
  onExecuteRoute,
}: {
  msg: Message
  onExecuteRoute: (label: string) => void
}) {
  const isUser = msg.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="h-3.5 w-3.5 text-white" />
        </div>
      )}

      <div className={cn('max-w-[85%] space-y-2', isUser && 'items-end flex flex-col')}>
        {/* Text bubble */}
        <div className={cn(
          'px-3.5 py-2.5 rounded-2xl',
          isUser
            ? 'bg-cyan-500/20 border border-cyan-500/30 rounded-tr-sm'
            : 'bg-slate-800/80 border border-white/10 rounded-tl-sm',
        )}>
          {isUser
            ? <p className="text-sm text-cyan-100">{msg.text}</p>
            : <MdText text={msg.text} />
          }
        </div>

        {/* Rich payload */}
        {!isUser && (msg as BotMessage).payload && (() => {
          const p = (msg as BotMessage).payload!

          if (p.type === 'explanation') {
            return (
              <div className="w-full space-y-2">
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-white/10">
                  <MiniGauge value={p.riskScore} />
                  <div>
                    <p className="text-xs text-slate-400">Ensemble Risk</p>
                    <p className="text-sm font-bold" style={{ color: RISK_COLOR(p.riskScore) }}>
                      {p.riskLevel} — {p.riskScore}%
                    </p>
                    <p className="text-xs text-slate-500">Delay prob: {p.delayProb}%</p>
                  </div>
                </div>
                {p.shapFeatures.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-slate-800/60 border border-white/10">
                    <p className="text-xs text-slate-400 mb-1">Risk factor contributions</p>
                    <ShapChart features={p.shapFeatures} />
                  </div>
                )}
                <button
                  onClick={() => onExecuteRoute('view-alternatives')}
                  className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <Navigation className="h-3 w-3" />
                  View alternative routes →
                </button>
              </div>
            )
          }

          if (p.type === 'comparison') {
            return (
              <div className="w-full">
                <RouteCards payload={p} onExecute={onExecuteRoute} />
              </div>
            )
          }

          if (p.type === 'whatif') {
            return <WhatIfCard payload={p} />
          }

          if (p.type === 'weather') {
            return (
              <div className="w-full space-y-2">
                <WeatherCard payload={p} />
                <div className={cn(
                  'text-xs px-2.5 py-1.5 rounded-lg',
                  p.corridorRisk > 0.7
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : p.corridorRisk > 0.4
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                )}>
                  Corridor risk: {Math.round(p.corridorRisk * 100)}% — {p.recommendation}
                </div>
              </div>
            )
          }

          return null
        })()}

        {/* Timestamp */}
        <p className="text-[10px] text-slate-600 px-1">
          {msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </motion.div>
  )
}

// ─── Main panel ────────────────────────────────────────────────────────────
interface AdvisorPanelProps {
  open: boolean
  onClose: () => void
}

export function AdvisorPanel({ open, onClose }: AdvisorPanelProps) {
  const { selectedShipmentId, shipments, backendOnline, setShowRouteModal } = useDashboardStore()
  const selectedShipment = shipments.find((s) => s.id === selectedShipmentId)

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'bot',
      timestamp: new Date(),
      text:
        "Hello! I'm the **NEXUS Advisor**.\n\nI can explain risk predictions, compare routes, analyze weather, and run what-if scenarios.\n\nSelect a shipment and ask me anything.",
      payload: { type: 'fallback' },
    } as BotMessage,
  ])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: new Date(),
    }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setIsThinking(true)

    // Small delay for UX realism
    await new Promise((r) => setTimeout(r, 600))

    const intent = detectIntent(text)
    const response = await generateResponse(intent, text, selectedShipmentId, shipments)
    setMessages((m) => [...m, response])
    setIsThinking(false)
  }, [isThinking, selectedShipmentId, shipments])

  const handleExecuteRoute = useCallback((label: string) => {
    if (label === 'view-alternatives') {
      setShowRouteModal(true)
      return
    }
    // Trigger route modal with a note
    setShowRouteModal(true)
    sendMessage(`Execute the ${label} route`)
  }, [setShowRouteModal, sendMessage])

  const chips = getQuickChips(selectedShipment?.riskLevel ?? null)

  const hasHighRiskAlert = shipments.some(
    (s) => s.riskLevel === 'high' || s.riskLevel === 'critical'
  )

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop (subtle) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/20"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[400px] flex flex-col"
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(24px)',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-900',
                    backendOnline ? 'bg-emerald-500' : 'bg-slate-500',
                  )} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">NEXUS Advisor</p>
                  <p className="text-xs text-slate-500">
                    {backendOnline ? 'Online · AI Route Intelligence' : 'Offline'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMessages([{
                    id: 'welcome-reset',
                    role: 'bot',
                    timestamp: new Date(),
                    text: 'Conversation cleared. How can I help?',
                    payload: { type: 'fallback' },
                  } as BotMessage])}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-500 hover:text-slate-300"
                  title="Clear chat"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* ── Active shipment context ── */}
            {selectedShipment && (
              <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 bg-slate-800/30 flex-shrink-0">
                <div
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: RISK_COLOR(selectedShipment.riskScore) }}
                />
                <p className="text-xs text-slate-400 truncate">
                  Analysing: <span className="text-white font-medium">{selectedShipment.id}</span>
                  {' · '}{selectedShipment.origin} → {selectedShipment.destination}
                </p>
              </div>
            )}

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onExecuteRoute={handleExecuteRoute}
                />
              ))}

              {isThinking && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2"
                >
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="bg-slate-800/80 border border-white/10 rounded-2xl rounded-tl-sm">
                    <TypingDots />
                  </div>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* ── Quick chips ── */}
            <div className="px-4 py-2 border-t border-white/5 flex gap-1.5 overflow-x-auto flex-shrink-0 scrollbar-hide">
              {chips.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => sendMessage(chip.text)}
                  disabled={isThinking}
                  className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/60 border border-white/10 rounded-full hover:border-cyan-500/40 hover:text-cyan-400 transition-all disabled:opacity-40"
                >
                  <span>{chip.icon}</span>
                  {chip.label}
                </button>
              ))}
            </div>

            {/* ── Input ── */}
            <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-800/60 border border-white/10 rounded-xl focus-within:border-cyan-500/40 transition-colors">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                  placeholder="Ask about routes, risks, or predictions..."
                  disabled={isThinking}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isThinking}
                  className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-slate-700 text-center mt-1.5">
                Template-based NLG · Data from NEXUS API
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Floating trigger button ───────────────────────────────────────────────
export function AdvisorFAB({ onClick, hasAlert }: { onClick: () => void; hasAlert: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg"
      style={{
        boxShadow: hasAlert
          ? '0 0 0 0 rgba(6,182,212,0.7)'
          : '0 4px 24px rgba(6,182,212,0.3)',
      }}
      animate={hasAlert ? {
        boxShadow: [
          '0 0 0 0 rgba(6,182,212,0.7)',
          '0 0 0 12px rgba(6,182,212,0)',
          '0 0 0 0 rgba(6,182,212,0)',
        ],
      } : {}}
      transition={hasAlert ? { duration: 1.5, repeat: Infinity } : {}}
      title="NEXUS Advisor"
    >
      <Sparkles className="h-6 w-6 text-white" />
      {hasAlert && (
        <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
      )}
    </motion.button>
  )
}
