'use client'

import dynamic from 'next/dynamic'

// Dynamic import to avoid SSR issues with Leaflet
const Dashboard = dynamic(() => import('@/frontend/Dashboard'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading NEXUS Dashboard...</p>
      </div>
    </div>
  ),
})

export default function Page() {
  return <Dashboard />
}
