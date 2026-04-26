'use client'

import { motion } from 'framer-motion'
import { useDashboardStore } from '../store/useStore'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

function getRiskColor(score: number): string {
  if (score < 33) return '#10b981' // emerald
  if (score < 66) return '#f59e0b' // amber
  return '#ef4444' // red
}

function getRiskLabel(score: number): string {
  if (score < 33) return 'LOW'
  if (score < 66) return 'MEDIUM'
  return 'HIGH'
}

interface MiniGaugeProps {
  value: number
  label: string
  size?: number
}

function MiniGauge({ value, label, size = 80 }: MiniGaugeProps) {
  const color = getRiskColor(value)
  const data = [
    { value: value },
    { value: 100 - value },
  ]

  return (
    <div className="flex flex-col items-center">
      <div style={{ width: size, height: size }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.35}
              outerRadius={size * 0.45}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="rgba(255,255,255,0.1)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-white">{value}%</span>
        </div>
      </div>
      <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{label}</span>
    </div>
  )
}

export function RiskGauge() {
  const { ensembleRiskScore, delayProbability, anomalyScore, isLoadingPrediction, selectedShipmentId } = useDashboardStore()

  const mainColor = getRiskColor(ensembleRiskScore)
  const riskLabel = getRiskLabel(ensembleRiskScore)
  const mainData = [{ value: ensembleRiskScore }, { value: 100 - ensembleRiskScore }]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-5 h-full flex flex-col"
    >
      <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">
        Ensemble Risk Score
      </h3>

      {!selectedShipmentId && !isLoadingPrediction && ensembleRiskScore === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-sm text-slate-500">Select a shipment</p>
          <p className="text-xs text-slate-600">to view its risk prediction</p>
        </div>
      ) : (
        <>
          {isLoadingPrediction ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="relative w-full aspect-square max-w-[200px] mx-auto mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                          <feMergeNode in="coloredBlur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <Pie
                      data={mainData}
                      cx="50%"
                      cy="50%"
                      innerRadius="60%"
                      outerRadius="85%"
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                      stroke="none"
                      style={{ filter: 'url(#glow)' }}
                    >
                      <Cell fill={mainColor} />
                      <Cell fill="rgba(255,255,255,0.05)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.span
                    key={ensembleRiskScore}
                    initial={{ scale: 1.2, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-4xl font-bold text-white tabular-nums"
                  >
                    {ensembleRiskScore}%
                  </motion.span>
                  <span className="text-sm font-bold uppercase tracking-wider mt-1" style={{ color: mainColor }}>
                    {riskLabel}
                  </span>
                </div>
              </div>

              <div className="flex justify-around pt-4 border-t border-white/10">
                <MiniGauge value={delayProbability} label="Delay" />
                <MiniGauge value={anomalyScore} label="Anomaly" />
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  )
}
