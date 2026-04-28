'use client'

import {
  LayoutDashboard, Ship, Map, AlertTriangle,
  BarChart3, Settings, ChevronLeft, ChevronRight, Clock, X,
} from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { cn } from '@/lib/utils'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',  view: 'dashboard'  as const },
  { icon: Ship,            label: 'Shipments',  view: 'shipments'  as const },
  { icon: Map,             label: 'Live Map',   view: 'map'        as const },
  { icon: AlertTriangle,   label: 'Alerts',     view: 'alerts'     as const },
  { icon: BarChart3,       label: 'Analytics',  view: 'analytics'  as const },
  { icon: Clock,           label: 'Replay',     view: 'replay'     as const },
  { icon: Settings,        label: 'Settings',   view: 'settings'   as const },
]

export function Sidebar() {
  const {
    sidebarCollapsed, toggleSidebar,
    mobileSidebarOpen, setMobileSidebarOpen,
    activeView, setActiveView, backendOnline,
  } = useDashboardStore()

  const handleNav = (view: typeof navItems[number]['view']) => {
    setActiveView(view)
    setMobileSidebarOpen(false)   // always close on mobile after tap
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen flex flex-col',
          'glass-card border-r border-white/10',
          'transition-transform duration-300 ease-in-out',
          // Mobile: slide in/out
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: always visible, width controlled
          'md:translate-x-0',
          sidebarCollapsed ? 'md:w-[72px]' : 'md:w-[240px]',
          'w-[260px]',
        )}
      >
        {/* Logo row */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <svg width="28" height="28" viewBox="0 0 180 180" fill="none">
                <line x1="32" y1="90" x2="148" y2="90" stroke="#06b6d4" strokeWidth="8" strokeLinecap="round"/>
                <line x1="90" y1="32" x2="90" y2="148" stroke="#06b6d4" strokeWidth="8" strokeLinecap="round"/>
                <line x1="42" y1="42" x2="138" y2="138" stroke="#a5f3fc" strokeWidth="5" strokeLinecap="round" opacity="0.6"/>
                <line x1="138" y1="42" x2="42" y2="138" stroke="#a5f3fc" strokeWidth="5" strokeLinecap="round" opacity="0.6"/>
                <circle cx="90" cy="90" r="28" fill="#0e7490"/>
                <circle cx="32" cy="90" r="12" fill="#06b6d4"/>
                <circle cx="148" cy="90" r="12" fill="#06b6d4"/>
                <circle cx="90" cy="32" r="12" fill="#06b6d4"/>
                <circle cx="90" cy="148" r="12" fill="#06b6d4"/>
                <rect x="68" y="80" width="30" height="18" rx="3" fill="white"/>
                <rect x="98" y="84" width="16" height="14" rx="2" fill="white"/>
                <rect x="100" y="86" width="10" height="7" rx="1" fill="#0e7490" opacity="0.8"/>
                <circle cx="76" cy="100" r="6" fill="#0e7490"/>
                <circle cx="104" cy="100" r="6" fill="#0e7490"/>
              </svg>
            </div>
            {/* Label hidden when collapsed on desktop */}
            <span className={cn(
              'font-bold text-lg tracking-tight text-white truncate',
              sidebarCollapsed && 'md:hidden',
            )}>
              NEXUS
            </span>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Desktop collapse */}
            <button
              onClick={toggleSidebar}
              className="hidden md:flex p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            {/* Mobile close */}
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeView === item.view
              return (
                <li key={item.label}>
                  <button
                    onClick={() => handleNav(item.view)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-200',
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                        : 'text-slate-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    <item.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]')} />
                    <span className={cn(
                      'text-sm font-medium whitespace-nowrap',
                      sidebarCollapsed && 'md:hidden',
                    )}>
                      {item.label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Status */}
        <div className="p-4 border-t border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className={cn('h-2 w-2 rounded-full flex-shrink-0', backendOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')} />
            <span className={cn('text-xs text-slate-400 truncate', sidebarCollapsed && 'md:hidden')}>
              {backendOnline ? 'System Online' : 'Backend Offline'}
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
