'use client'

import { useEffect } from 'react'
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
import { useDashboardStore } from './store/useStore'
import { useShipments, useBackendHealth, useShipmentPrediction, useShipmentWebSocket } from '@/hooks/useApi'

function DashboardMain() {
  const { sidebarCollapsed, selectedShipmentId } = useDashboardStore()

  // Fetch prediction whenever a shipment is selected
  useShipmentPrediction(selectedShipmentId)
  useShipmentWebSocket(selectedShipmentId)

  return (
    <main className="pt-20 pb-6 px-6">
      <section className="mb-6">
        <KPICards />
      </section>

      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-3">
          <div className="h-[500px]">
            <ShipmentsList />
          </div>
        </div>
        <div className="col-span-6">
          <div className="h-[500px]">
            <LiveMap />
          </div>
        </div>
        <div className="col-span-3">
          <div className="h-[500px]">
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
  const { sidebarCollapsed, activeView } = useDashboardStore()

  // Bootstrap: health check + load shipments on mount
  useBackendHealth()
  useShipments()

  const contentStyle = {
    marginLeft: sidebarCollapsed ? 72 : 240,
    transition: 'margin-left 0.3s ease-in-out',
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div style={contentStyle}>
        <Header />

        {activeView === 'dashboard' && <DashboardMain />}
        {activeView === 'shipments' && <ShipmentsView />}
        {activeView === 'map' && (
          <main className="pt-20 pb-6 px-6">
            <div className="h-[calc(100vh-100px)]">
              <LiveMap />
            </div>
          </main>
        )}
        {activeView === 'alerts' && <AlertsView />}
        {activeView === 'analytics' && <AnalyticsView />}
        {activeView === 'settings' && <SettingsView />}
      </div>

      <RouteModal />
    </div>
  )
}
