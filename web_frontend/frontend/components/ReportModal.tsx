'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, FileText, Download, Eye, Loader2, CheckCircle,
  FileCode, FileSpreadsheet, ChevronRight, Sparkles,
} from 'lucide-react'
import { useDashboardStore } from '../store/useStore'
import { cn } from '@/lib/utils'
import {
  buildShipmentJourney, buildOperationsReport, buildIncidentReport,
  type ReportType, type ReportData, type ProgressFn,
} from '../reports/reportData'
import { renderReportHTML } from '../reports/reportTemplate'
import { downloadPDF, downloadHTML } from '../reports/pdfEngine'

const REPORT_TYPES: { type: ReportType; label: string; desc: string; icon: string; badge?: string }[] = [
  {
    type: 'SHIPMENT_JOURNEY',
    label: 'Shipment Journey',
    desc: 'Full journey analysis — risk, routes, weather, cost & system performance',
    icon: '🚛',
    badge: 'Per Shipment',
  },
  {
    type: 'OPERATIONS',
    label: 'Operations Summary',
    desc: 'Period overview — KPIs, carriers, corridors, prediction accuracy',
    icon: '📊',
    badge: 'Fleet-wide',
  },
  {
    type: 'INCIDENT',
    label: 'Incident Analysis',
    desc: 'Post-disruption deep-dive — detection, response, lessons learned',
    icon: '🔴',
    badge: 'Post-event',
  },
]

const PERIOD_OPTIONS = ['Last 24 hours', 'Last 7 days', 'Last 30 days']

const PROGRESS_STEPS: Record<ReportType, string[]> = {
  SHIPMENT_JOURNEY: [
    'Fetching shipment data...',
    'Computing AI predictions...',
    'Rendering charts & weather...',
    'Generating PDF report...',
  ],
  OPERATIONS: [
    'Fetching fleet data...',
    'Computing KPIs & accuracy...',
    'Analysing corridors & carriers...',
    'Generating PDF report...',
  ],
  INCIDENT: [
    'Fetching incident data...',
    'Computing detection timeline...',
    'Fetching route alternatives...',
    'Generating PDF report...',
  ],
}

interface Props {
  open: boolean
  onClose: () => void
  initialType?: ReportType
}

export function ReportModal({ open, onClose, initialType }: Props) {
  const { shipments, selectedShipmentId } = useDashboardStore()
  const [reportType, setReportType] = useState<ReportType>(initialType ?? 'SHIPMENT_JOURNEY')
  const [selectedId, setSelectedId] = useState(selectedShipmentId ?? shipments[0]?.id ?? '')
  const [period, setPeriod] = useState('Last 7 days')
  const [step, setStep] = useState<'config' | 'generating' | 'preview'>('config')
  const [progress, setProgress] = useState({ step: 0, total: 4, label: '' })
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Sync initialType when modal opens
  useEffect(() => {
    if (open) {
      setReportType(initialType ?? 'SHIPMENT_JOURNEY')
      setSelectedId(selectedShipmentId ?? shipments[0]?.id ?? '')
      setStep('config')
      setReportData(null)
      setPreviewHtml('')
      setIframeLoaded(false)
    }
  }, [open, initialType, selectedShipmentId])

  const onProgress: ProgressFn = (s, t, label) => setProgress({ step: s, total: t, label })

  const handleGenerate = async () => {
    setStep('generating')
    setProgress({ step: 0, total: 4, label: '' })
    try {
      let data: ReportData
      const shipment = shipments.find(s => s.id === selectedId) ?? shipments[0]

      if (reportType === 'SHIPMENT_JOURNEY') {
        data = await buildShipmentJourney(shipment, onProgress)
      } else if (reportType === 'OPERATIONS') {
        data = await buildOperationsReport(shipments, period, onProgress)
      } else {
        data = await buildIncidentReport(shipment, onProgress)
      }

      setReportData(data)
      setPreviewHtml(renderReportHTML(data))
      setIframeLoaded(false)
      setStep('preview')
    } catch (e) {
      console.error(e)
      setStep('config')
    }
  }

  const handleDownloadPDF = async () => {
    if (!reportData) return
    setDownloading(true)
    try { await downloadPDF(reportData) } finally { setDownloading(false) }
  }

  const handleDownloadHTML = () => {
    if (!reportData) return
    downloadHTML(reportData)
  }

  const handleDownloadCSV = () => {
    if (!reportData) return
    let csv = ''
    if (reportData.type === 'SHIPMENT_JOURNEY') {
      csv = [
        'Field,Value',
        `Booking ID,${reportData.shipment.id}`,
        `Origin,${reportData.shipment.origin}`,
        `Destination,${reportData.shipment.destination}`,
        `Cargo Type,${reportData.shipment.cargoType}`,
        `Risk Score,${reportData.prediction.riskScore}%`,
        `Risk Level,${reportData.prediction.riskLevel}`,
        `Delay Probability,${reportData.prediction.delayProb}%`,
        `ETA,${reportData.shipment.eta}`,
        `Early Warning,${reportData.performance.earlyWarningHours}h`,
        `Prediction Accuracy,${reportData.performance.predictionAccuracy}%`,
      ].join('\n')
    } else if (reportData.type === 'OPERATIONS') {
      csv = [
        'Carrier,On-Time %,Avg Risk,Shipments',
        ...reportData.carrierPerf.map(c => `${c.carrier},${c.onTimePct},${c.avgDelay},${c.shipments}`),
      ].join('\n')
    } else {
      csv = [
        'Time,Action,Actor,Outcome',
        ...reportData.timeline.map(t => `${t.time},"${t.action}",${t.actor},${t.outcome}`),
      ].join('\n')
    }
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `NEXUS-${reportData.reportId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setStep('config')
    setReportData(null)
    setPreviewHtml('')
    setIframeLoaded(false)
  }

  const needsShipment = reportType !== 'OPERATIONS'
  const progressPct = progress.total > 0 ? Math.round((progress.step / progress.total) * 100) : 0
  const steps = PROGRESS_STEPS[reportType]

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-4xl md:max-h-[90vh] z-50 glass-card flex flex-col overflow-hidden"
          >
            {/* ── Modal Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-violet-500/10">
                  <FileText className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Generate Report</h2>
                  <p className="text-xs text-slate-400">
                    {step === 'config' ? 'Select report type and options'
                      : step === 'generating' ? 'Building your intelligence report...'
                      : 'Preview ready — download or share'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {step === 'preview' && (
                  <button
                    onClick={reset}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 border border-white/10 rounded-lg transition-colors"
                  >
                    ← New Report
                  </button>
                )}
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* ── Step Indicator (config only) ── */}
            {step === 'config' && (
              <div className="flex items-center gap-1 px-6 py-2 border-b border-white/5 flex-shrink-0 bg-white/[0.02]">
                {['Choose Type', 'Select Options', 'Generate'].map((s, i) => (
                  <div key={s} className="flex items-center gap-1">
                    <div className={cn(
                      'flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold',
                      i === 0 ? 'bg-violet-500 text-white' : 'bg-white/10 text-slate-500'
                    )}>{i + 1}</div>
                    <span className={cn('text-xs', i === 0 ? 'text-violet-400' : 'text-slate-600')}>{s}</span>
                    {i < 2 && <ChevronRight className="h-3 w-3 text-slate-700 mx-1" />}
                  </div>
                ))}
              </div>
            )}

            {/* ── Body ── */}
            <div className="flex-1 overflow-hidden flex flex-col">

              {/* CONFIG STEP */}
              {step === 'config' && (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Report type cards */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                      Report Type
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {REPORT_TYPES.map(rt => (
                        <button
                          key={rt.type}
                          onClick={() => setReportType(rt.type)}
                          className={cn(
                            'p-4 rounded-xl border-2 text-left transition-all relative group',
                            reportType === rt.type
                              ? 'border-violet-500/60 bg-violet-500/10 shadow-[0_0_20px_rgba(139,92,246,0.15)]'
                              : 'border-white/10 hover:border-white/20 bg-white/5',
                          )}
                        >
                          {rt.badge && (
                            <span className={cn(
                              'absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded tracking-wider',
                              reportType === rt.type ? 'bg-violet-500/30 text-violet-300' : 'bg-white/10 text-slate-500'
                            )}>
                              {rt.badge}
                            </span>
                          )}
                          <div className="text-2xl mb-2">{rt.icon}</div>
                          <p className={cn('text-sm font-semibold mb-1', reportType === rt.type ? 'text-violet-300' : 'text-white')}>
                            {rt.label}
                          </p>
                          <p className="text-xs text-slate-500 leading-snug">{rt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    {/* Shipment selector */}
                    {needsShipment && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Shipment
                        </label>
                        <select
                          value={selectedId}
                          onChange={e => setSelectedId(e.target.value)}
                          className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500/50 appearance-none cursor-pointer"
                        >
                          {shipments.map(s => (
                            <option key={s.id} value={s.id} className="bg-slate-900">
                              {s.id} — {s.origin.split(',')[0]} → {s.destination.split(',')[0]} [{s.riskLevel.toUpperCase()} {s.riskScore}%]
                            </option>
                          ))}
                        </select>
                        {selectedId && (() => {
                          const sh = shipments.find(s => s.id === selectedId)
                          if (!sh) return null
                          return (
                            <div className={cn(
                              'mt-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2',
                              sh.riskLevel === 'critical' ? 'bg-red-500/10 text-red-400' :
                              sh.riskLevel === 'high' ? 'bg-orange-500/10 text-orange-400' :
                              sh.riskLevel === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                            )}>
                              <span className="font-bold uppercase">{sh.riskLevel}</span>
                              <span>— {sh.origin.split(',')[0]} → {sh.destination.split(',')[0]}</span>
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* Period */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Time Period
                      </label>
                      <div className="flex flex-col gap-2">
                        {PERIOD_OPTIONS.map(p => (
                          <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={cn(
                              'px-3 py-2 text-xs rounded-lg border transition-all text-left',
                              period === p
                                ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                                : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20',
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Export formats info */}
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <p className="text-xs text-slate-500 mb-2 font-medium">Available export formats after generation:</p>
                    <div className="flex gap-4">
                      {[
                        { icon: '📄', label: 'PDF', desc: 'Print-ready A4' },
                        { icon: '🌐', label: 'HTML', desc: 'Shareable link' },
                        { icon: '📊', label: 'CSV', desc: 'Raw data export' },
                      ].map(f => (
                        <div key={f.label} className="flex items-center gap-2">
                          <span>{f.icon}</span>
                          <div>
                            <p className="text-xs font-medium text-slate-300">{f.label}</p>
                            <p className="text-[10px] text-slate-600">{f.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* GENERATING STEP */}
              {step === 'generating' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
                  {/* Animated icon */}
                  <div className="relative">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                      className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-violet-500 border-r-violet-500/30"
                      style={{ width: 88, height: 88, margin: -4 }}
                    />
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center">
                      <Sparkles className="h-9 w-9 text-violet-400" />
                    </div>
                  </div>

                  <div className="text-center w-full max-w-sm">
                    <p className="text-white font-semibold text-lg mb-1">Generating intelligence report...</p>
                    <p className="text-slate-400 text-sm mb-6">
                      Step {progress.step} of {progress.total}: {progress.label}
                    </p>

                    {/* Progress bar */}
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                      <motion.div
                        className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPct}%` }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Step bullets */}
                    <div className="text-left space-y-2">
                      {steps.map((s, i) => {
                        const done = i < progress.step
                        const active = i === progress.step - 1
                        return (
                          <div key={i} className={cn('flex items-center gap-2 text-xs transition-all',
                            done ? 'text-emerald-400' : active ? 'text-violet-300' : 'text-slate-600')}>
                            {done
                              ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                              : active
                              ? <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
                              : <div className="h-3.5 w-3.5 rounded-full border border-white/20 flex-shrink-0" />
                            }
                            {s}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* PREVIEW STEP */}
              {step === 'preview' && previewHtml && (
                <div className="flex-1 overflow-hidden relative">
                  {!iframeLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
                        <p className="text-slate-600 text-sm">Rendering preview...</p>
                      </div>
                    </div>
                  )}
                  <iframe
                    ref={iframeRef}
                    srcDoc={previewHtml}
                    onLoad={() => setIframeLoaded(true)}
                    className="w-full h-full border-0 bg-white"
                    title="Report Preview"
                  />
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="px-6 py-4 border-t border-white/10 flex-shrink-0">
              {step === 'config' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-slate-400 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={needsShipment && !selectedId}
                    className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-violet-500/20 border border-violet-500/40 rounded-lg hover:bg-violet-500/30 transition-colors disabled:opacity-40 ml-auto"
                  >
                    <Eye className="h-4 w-4" />
                    Generate Preview
                  </button>
                </div>
              )}

              {step === 'preview' && reportData && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">{reportData.reportId}</span>
                    <span className="text-slate-500">· {reportData.generatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={handleDownloadCSV}
                      title="Download CSV"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                      CSV
                    </button>
                    <button
                      onClick={handleDownloadHTML}
                      title="Download HTML"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <FileCode className="h-4 w-4 text-amber-400" />
                      HTML
                    </button>
                    <button
                      onClick={handleDownloadPDF}
                      disabled={downloading}
                      className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-violet-500/20 border border-violet-500/40 rounded-lg hover:bg-violet-500/30 transition-colors disabled:opacity-50"
                    >
                      {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Download PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
