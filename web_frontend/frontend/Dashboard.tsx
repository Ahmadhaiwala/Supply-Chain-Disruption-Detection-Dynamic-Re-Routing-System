'use client'

import { useEffect, useState } from 'react'
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

function DashboardMain() {
  const { selectedShipmentId } = useDashboardStore()

  // Fetch prediction + live tracking whenever a shipment is selected
  useShipmentPrediction(selectedShipmentId)
  useShipmentWebSocket(selectedShipmentId)

  return (
    <main className="pt-20 pb-6 px-4 md:px-6">
      <section className="mb-6">
        <KPICards />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 mb-6">
        <div className="lg:col-span-3 order-2 lg:order-1">
          <div className="h-[400px] md:h-[500px]">
            <ShipmentsList />
          </div>
        </div>
        <div className="lg:col-span-6 order-1 lg:order-2">
          <div className="h-[400px] md:h-[500px]">
            <LiveMap />
          </div>
        </div>
        <div className="lg:col-span-3 order-3">
          <div className="h-[400px] md:h-[500px]">
            <RiskGauge />
          </div>
        </div>
      </div>

      <section>
        <AlertTicker />
      </section>
    </main>
  )
}

export default function Dashboard() {
  const { sidebarCollapsed, activeView, shipments, showReportModal, reportInitType, setShowReportModal } = useDashboardStore()
  const [advisorOpen, setAdvisorOpen] = useState(false)

  // Bootstrap: health check + load shipments on mount
  useBackendHealth()
  useShipments()

  const hasHighRiskAlert = shipments.some(
    (s) => s.riskLevel === 'high' || s.riskLevel === 'critical'
  )

  const contentStyle = {
    marginLeft: sidebarCollapsed ? 72 : 240,
    transition: 'margin-left 0.3s ease-in-out',
  }

  const mobileContentStyle = {
    marginLeft: 0,
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div className="md:hidden" style={mobileContentStyle}>
        <Header />
      </div>
      <div className="hidden md:block" style={contentStyle}>
        <Header />

        {activeView === 'dashboard' && <DashboardMain />}
        {activeView === 'shipments' && <ShipmentsView />}
        {activeView === 'map' && (
          <main className="pt-20 pb-6 px-4 md:px-6">
            <div className="h-[calc(100vh-100px)]">
              <LiveMap />
            </div>
          </main>
        )}
        {activeView === 'alerts' && <AlertsView />}
        {activeView === 'analytics' && <AnalyticsView />}
        {activeView === 'replay' && <ReplayView />}
        {activeView === 'settings' && <SettingsView />}
      </div>
      {/* Mobile content wrapper end — closing the desktop one */}
      <div className="md:hidden pt-20 pb-6 px-4">
        {activeView === 'dashboard' && <DashboardMain />}
        {activeView === 'shipments' && <ShipmentsView />}
        {activeView === 'map' && (
          <main className="pb-6">
            <div className="h-[calc(100vh-100px)]">
              <LiveMap />
            </div>
          </main>
        )}
        {activeView === 'alerts' && <AlertsView />}
        {activeView === 'analytics' && <AnalyticsView />}
        {activeView === 'replay' && <ReplayView />}
        {activeView === 'settings' && <SettingsView />}
      </div>

      <RouteModal />

      {/* Report Modal */}
      <ReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        initialType={reportInitType ?? undefined}
      />

      {/* AI Advisor */}
      <AdvisorFAB onClick={() => setAdvisorOpen(true)} hasAlert={hasHighRiskAlert} />
      <AdvisorPanel open={advisorOpen} onClose={() => setAdvisorOpen(false)} />
    </div>
  )
}
