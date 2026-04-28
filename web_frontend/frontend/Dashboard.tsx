'use client'

import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { KPICards } from './components/KPICards'
import { RiskGauge } from './components/RiskGauge'
import { ShipmentsList } from './components/ShipmentsList'
import { LiveMap } from './components/LiveMap'
import { AlertTicker } from './components/AlertTicker'
import { RouteModal } from './components/RouteModal'
import { AlertsView } from './components/AlertsView'
import { AnalyticsView } from './components/AnalyticsView'
import { ShipmentsView } from './components/ShipmentsView'
import { SettingsView } from './components/SettingsView'
import { AdvisorPanel, AdvisorFAB } from './components/AdvisorPanel'
import { ReplayView } from './components/ReplayView'
import { ReportModal } from './components/ReportModal'
import { useDashboardStore } from './store/useStore'
import { useShipments, useBackendHealth, useShipmentPrediction, useShipmentWebSocket } from '@/hooks/useApi'
import { cn } from '@/lib/utils'

function DashboardMain() {
  const { selectedShipmentId } = useDashboardStore()
  useShipmentPrediction(selectedShipmentId)
  useShipmentWebSocket(selectedShipmentId)

  return (
    <main className="pt-16 pb-6 px-3 sm:px-4 md:px-6">
      {/* KPI Cards */}
      <section className="mb-4 md:mb-6 pt-4">
        <KPICards />
      </section>

      {/* Main grid — stacks on mobile, side-by-side on desktop */}
      <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-12 md:gap-6 mb-4 md:mb-6">
        {/* Map — full width on mobile, center on desktop */}
        <div className="md:col-span-6 md:order-2">
          <div className="h-[280px] sm:h-[360px] md:h-[500px]">
            <LiveMap />
          </div>
        </div>

        {/* Shipments list — below map on mobile */}
        <div className="md:col-span-3 md:order-1">
          <div className="h-[320px] md:h-[500px]">
            <ShipmentsList />
          </div>
        </div>

        {/* Risk gauge — compact row on mobile */}
        <div className="md:col-span-3 md:order-3">
          <div className="h-[240px] sm:h-[280px] md:h-[500px]">
            <RiskGauge />
          </div>
        </div>
      </div>

      {/* Alert ticker */}
      <section>
        <AlertTicker />
      </section>
    </main>
  )
}

export default function Dashboard() {
  const {
    sidebarCollapsed, activeView, shipments,
    showReportModal, reportInitType, setShowReportModal,
  } = useDashboardStore()
  const [advisorOpen, setAdvisorOpen] = useState(false)

  useBackendHealth()
  useShipments()

  const hasHighRiskAlert = shipments.some(s => s.riskLevel === 'high' || s.riskLevel === 'critical')

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      {/* Content — no margin on mobile (sidebar is overlay), margin on md+ */}
      <div className={cn(
        'transition-[margin] duration-300 ease-in-out',
        'ml-0',
        sidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-[240px]',
      )}>
        <Header />

        {activeView === 'dashboard'  && <DashboardMain />}
        {activeView === 'shipments'  && <ShipmentsView />}
        {activeView === 'map'        && (
          <main className="pt-16 pb-6 px-3 sm:px-4 md:px-6">
            <div className="pt-4 h-[calc(100vh-80px)]">
              <LiveMap />
            </div>
          </main>
        )}
        {activeView === 'alerts'     && <AlertsView />}
        {activeView === 'analytics'  && <AnalyticsView />}
        {activeView === 'replay'     && <ReplayView />}
        {activeView === 'settings'   && <SettingsView />}
      </div>

      <RouteModal />

      <ReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        initialType={reportInitType ?? undefined}
      />

      <AdvisorFAB onClick={() => setAdvisorOpen(true)} hasAlert={hasHighRiskAlert} />
      <AdvisorPanel open={advisorOpen} onClose={() => setAdvisorOpen(false)} />
    </div>
  )
}
