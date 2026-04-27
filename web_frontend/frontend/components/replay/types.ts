// Replay shared types
export type DatePreset = '24h' | '7d' | '30d' | 'custom'
export type PlaySpeed = 1 | 2 | 5 | 10
export type ReplayTab = 'map' | 'predictions' | 'decisions'

export interface ReplayState {
  selectedIds: string[]
  datePreset: DatePreset
  startDate: string
  endDate: string
  cursorTime: number   // unix ms
  isPlaying: boolean
  speed: PlaySpeed
  activeTab: ReplayTab
  hoveredEventId: string | null
}

export const EVENT_META = {
  gps_update:    { color: '#06b6d4', label: 'GPS Update',        emoji: '📍' },
  alert:         { color: '#f59e0b', label: 'Alert Triggered',   emoji: '⚠' },
  disruption:    { color: '#ef4444', label: 'Disruption',        emoji: '🔴' },
  route_exec:    { color: '#10b981', label: 'Route Executed',    emoji: '✅' },
  prediction:    { color: '#8b5cf6', label: 'Prediction Made',   emoji: '🔮' },
  status_change: { color: '#64748b', label: 'Status Change',     emoji: '📋' },
} as const

export type EventType = keyof typeof EVENT_META
