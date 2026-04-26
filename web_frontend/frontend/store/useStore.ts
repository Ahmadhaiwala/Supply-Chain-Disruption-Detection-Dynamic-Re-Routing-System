import { create } from 'zustand'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface Shipment {
  id: string
  origin: string
  destination: string
  cargoType: 'container' | 'bulk' | 'tanker' | 'refrigerated'
  riskLevel: RiskLevel
  riskScore: number
  eta: string
  currentLocation: [number, number]
  route: [number, number][]
  alternativeRoutes?: {
    route: [number, number][]
    riskScore: number
    costDelta: number
    etaDelta: string
    label?: string
    rank?: number
    isRecommended?: boolean
  }[]
  // Raw backend data for detail views
  _raw?: Record<string, unknown>
}

export interface Alert {
  id: string
  timestamp: Date
  severity: 'info' | 'warning' | 'critical'
  message: string
  shipmentId?: string
}

export interface KPI {
  activeShipments: number
  highRiskCount: number
  avgDelay: number
  costSaved: number
  activeShipmentsTrend: number
  highRiskTrend: number
  avgDelayTrend: number
  costSavedTrend: number
}

export interface ShapFeature {
  feature: string
  shap_value: number
}

interface DashboardState {
  // UI State
  sidebarCollapsed: boolean
  selectedShipmentId: string | null
  showRouteModal: boolean
  activeFilter: 'all' | 'normal' | 'warning' | 'critical'
  activeView: 'dashboard' | 'shipments' | 'map' | 'alerts' | 'analytics' | 'settings'

  // Loading / error
  isLoadingShipments: boolean
  isLoadingPrediction: boolean
  isLoadingRoutes: boolean
  apiError: string | null
  backendOnline: boolean

  // Data State
  shipments: Shipment[]
  alerts: Alert[]
  kpis: KPI
  ensembleRiskScore: number
  delayProbability: number
  anomalyScore: number
  shapFeatures: ShapFeature[]
  selectedShipmentRoutes: {
    current: unknown
    alternatives: unknown[]
  } | null

  // Actions — UI
  toggleSidebar: () => void
  setSelectedShipment: (id: string | null) => void
  setShowRouteModal: (show: boolean) => void
  setActiveFilter: (filter: 'all' | 'normal' | 'warning' | 'critical') => void
  setActiveView: (view: DashboardState['activeView']) => void

  // Actions — Data
  addAlert: (alert: Alert) => void
  updateShipment: (id: string, updates: Partial<Shipment>) => void
  setShipments: (shipments: Shipment[]) => void
  setKPIs: (kpis: KPI) => void
  setRiskScores: (ensemble: number, delay: number, anomaly: number) => void
  setShapFeatures: (features: ShapFeature[]) => void
  setSelectedShipmentRoutes: (routes: DashboardState['selectedShipmentRoutes']) => void
  setLoadingShipments: (v: boolean) => void
  setLoadingPrediction: (v: boolean) => void
  setLoadingRoutes: (v: boolean) => void
  setApiError: (err: string | null) => void
  setBackendOnline: (v: boolean) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  // Initial UI State
  sidebarCollapsed: false,
  selectedShipmentId: null,
  showRouteModal: false,
  activeFilter: 'all',
  activeView: 'dashboard',

  // Loading / error
  isLoadingShipments: false,
  isLoadingPrediction: false,
  isLoadingRoutes: false,
  apiError: null,
  backendOnline: false,

  // Initial Data State — empty, filled by API hooks
  shipments: [],
  alerts: [],
  kpis: {
    activeShipments: 0,
    highRiskCount: 0,
    avgDelay: 0,
    costSaved: 0,
    activeShipmentsTrend: 0,
    highRiskTrend: 0,
    avgDelayTrend: 0,
    costSavedTrend: 0,
  },
  ensembleRiskScore: 0,
  delayProbability: 0,
  anomalyScore: 0,
  shapFeatures: [],
  selectedShipmentRoutes: null,

  // UI Actions
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSelectedShipment: (id) => set({ selectedShipmentId: id }),
  setShowRouteModal: (show) => set({ showRouteModal: show }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setActiveView: (view) => set({ activeView: view }),

  // Data Actions
  addAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts].slice(0, 50) })),
  updateShipment: (id, updates) =>
    set((s) => ({
      shipments: s.shipments.map((sh) => (sh.id === id ? { ...sh, ...updates } : sh)),
    })),
  setShipments: (shipments) => set({ shipments }),
  setKPIs: (kpis) => set({ kpis }),
  setRiskScores: (ensemble, delay, anomaly) =>
    set({ ensembleRiskScore: ensemble, delayProbability: delay, anomalyScore: anomaly }),
  setShapFeatures: (features) => set({ shapFeatures: features }),
  setSelectedShipmentRoutes: (routes) => set({ selectedShipmentRoutes: routes }),
  setLoadingShipments: (v) => set({ isLoadingShipments: v }),
  setLoadingPrediction: (v) => set({ isLoadingPrediction: v }),
  setLoadingRoutes: (v) => set({ isLoadingRoutes: v }),
  setApiError: (err) => set({ apiError: err }),
  setBackendOnline: (v) => set({ backendOnline: v }),
}))
