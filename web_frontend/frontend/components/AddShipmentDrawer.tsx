'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Loader2, CheckCircle, AlertTriangle, MapPin, Truck, Package, Calendar } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { shipmentsApi, predictApi } from '@/lib/api'
import { buildPredictionInput } from '@/lib/mappers'
import { useDashboardStore } from '../store/useStore'
import { cn } from '@/lib/utils'

// ─── US city options with coordinates ─────────────────────────────────────────
const US_CITIES = [
  { label: 'Los Angeles, CA',    lat: 34.0522,  lon: -118.2437 },
  { label: 'Chicago, IL',        lat: 41.8781,  lon: -87.6298  },
  { label: 'New York, NY',       lat: 40.7128,  lon: -74.0060  },
  { label: 'Houston, TX',        lat: 29.7604,  lon: -95.3698  },
  { label: 'Phoenix, AZ',        lat: 33.4484,  lon: -112.0740 },
  { label: 'Philadelphia, PA',   lat: 39.9526,  lon: -75.1652  },
  { label: 'San Antonio, TX',    lat: 29.4241,  lon: -98.4936  },
  { label: 'Dallas, TX',         lat: 32.7767,  lon: -96.7970  },
  { label: 'San Francisco, CA',  lat: 37.7749,  lon: -122.4194 },
  { label: 'Seattle, WA',        lat: 47.6062,  lon: -122.3321 },
  { label: 'Denver, CO',         lat: 39.7392,  lon: -104.9903 },
  { label: 'Boston, MA',         lat: 42.3601,  lon: -71.0589  },
  { label: 'Nashville, TN',      lat: 36.1627,  lon: -86.7816  },
  { label: 'Charlotte, NC',      lat: 35.2271,  lon: -80.8431  },
  { label: 'Atlanta, GA',        lat: 33.7490,  lon: -84.3880  },
  { label: 'Miami, FL',          lat: 25.7617,  lon: -80.1918  },
  { label: 'Minneapolis, MN',    lat: 44.9778,  lon: -93.2650  },
  { label: 'Portland, OR',       lat: 45.5051,  lon: -122.6750 },
  { label: 'Las Vegas, NV',      lat: 36.1699,  lon: -115.1398 },
  { label: 'Kansas City, MO',    lat: 39.0997,  lon: -94.5786  },
  { label: 'Indianapolis, IN',   lat: 39.7684,  lon: -86.1581  },
  { label: 'Columbus, OH',       lat: 39.9612,  lon: -82.9988  },
  { label: 'Detroit, MI',        lat: 42.3314,  lon: -83.0458  },
  { label: 'Memphis, TN',        lat: 35.1495,  lon: -90.0490  },
  { label: 'Louisville, KY',     lat: 38.2527,  lon: -85.7585  },
  { label: 'Baltimore, MD',      lat: 39.2904,  lon: -76.6122  },
  { label: 'Washington, DC',     lat: 38.9072,  lon: -77.0369  },
  { label: 'Oklahoma City, OK',  lat: 35.4676,  lon: -97.5164  },
  { label: 'Omaha, NE',          lat: 41.2565,  lon: -95.9345  },
  { label: 'Salt Lake City, UT', lat: 40.7608,  lon: -111.8910 },
  { label: 'Savannah, GA (Port)',lat: 32.0835,  lon: -81.0998  },
  { label: 'Port of LA',         lat: 33.7395,  lon: -118.2707 },
  { label: 'Port of Houston',    lat: 29.7355,  lon: -95.0890  },
]

const CARGO_TYPES = [
  'Electronics', 'Automotive Parts', 'Pharmaceuticals', 'Food & Beverage',
  'Industrial Equipment', 'Consumer Goods', 'Chemicals', 'Refrigerated Goods',
  'Hazardous Materials', 'E-commerce Parcels', 'Raw Materials', 'Machinery',
]

const VEHICLE_TYPES = [
  '53ft Dry Van', '48ft Flatbed', 'Reefer Trailer', 'Tanker',
  'Step Deck', 'Double Drop', 'LTL Freight', 'Intermodal Container',
]

const CARRIERS = [
  'J.B. Hunt Transport', 'Werner Enterprises', 'Schneider National',
  'Swift Transportation', 'Knight Transportation', 'Old Dominion Freight',
  'XPO Logistics', 'FedEx Freight', 'UPS Freight', 'Amazon Logistics',
  'C.H. Robinson', 'Echo Global Logistics',
]

// ─── Form state ───────────────────────────────────────────────────────────────
interface FormState {
  booking_id: string
  origin_city: string
  destination_city: string
  cargo_type: string
  vehicle_type: string
  carrier_id: string
  planned_eta: string   // datetime-local string
  distance_km: string
}

const DEFAULT_FORM: FormState = {
  booking_id: '',
  origin_city: '',
  destination_city: '',
  cargo_type: 'Electronics',
  vehicle_type: '53ft Dry Van',
  carrier_id: 'J.B. Hunt Transport',
  planned_eta: '',
  distance_km: '',
}

function generateBookingId(): string {
  const prefix = 'US'
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  const num = Math.floor(Math.random() * 9000 + 1000)
  return `${prefix}-${rand}-${num}`
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  open: boolean
  onClose: () => void
}

export function AddShipmentDrawer({ open, onClose }: Props) {
  const qc = useQueryClient()
  const { addAlert } = useDashboardStore()

  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM, booking_id: generateBookingId() })
  const [step, setStep] = useState<'form' | 'predicting' | 'done' | 'error'>('form')
  const [prediction, setPrediction] = useState<{
    risk_score: number
    risk_level: string
    delay_prob: number
    recommendation: string
  } | null>(null)
  const [errors, setErrors] = useState<Partial<FormState>>({})

  const set = (key: keyof FormState, val: string) => {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  // Auto-calculate distance when both cities are selected
  const originCity = US_CITIES.find(c => c.label === form.origin_city)
  const destCity = US_CITIES.find(c => c.label === form.destination_city)

  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
  }

  const autoDistance = originCity && destCity
    ? haversine(originCity.lat, originCity.lon, destCity.lat, destCity.lon)
    : null

  const { mutateAsync: createShipment, isPending } = useMutation({
    mutationFn: (data: Parameters<typeof shipmentsApi.create>[0]) => shipmentsApi.create(data),
  })

  const validate = (): boolean => {
    const e: Partial<FormState> = {}
    if (!form.booking_id.trim()) e.booking_id = 'Required'
    if (!form.origin_city) e.origin_city = 'Select origin'
    if (!form.destination_city) e.destination_city = 'Select destination'
    if (form.origin_city === form.destination_city && form.origin_city) {
      e.destination_city = 'Must differ from origin'
    }
    if (!form.cargo_type) e.cargo_type = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    if (!originCity || !destCity) return

    const dist = (autoDistance ?? Number(form.distance_km)) || 500
    const midLat = (originCity.lat + destCity.lat) / 2
    const midLon = (originCity.lon + destCity.lon) / 2

    try {
      // 1. Create shipment
      await createShipment({
        booking_id: form.booking_id,
        origin_lat: originCity.lat,
        origin_lon: originCity.lon,
        destination_lat: destCity.lat,
        destination_lon: destCity.lon,
        current_lat: midLat,
        current_lon: midLon,
        planned_eta: form.planned_eta ? new Date(form.planned_eta).toISOString() : undefined,
        vehicle_type: form.vehicle_type,
        distance_km: dist,
        cargo_type: form.cargo_type,
        carrier_id: form.carrier_id,
      } as any)

      // 2. Run prediction
      setStep('predicting')
      const input = buildPredictionInput({
        booking_id: form.booking_id,
        origin_lat: originCity.lat,
        origin_lon: originCity.lon,
        destination_lat: destCity.lat,
        destination_lon: destCity.lon,
        distance_km: dist,
        current_risk_score: 0.3,
        vehicle_type: form.vehicle_type,
      } as any)

      const pred = await predictApi.predict(input)

      const riskScore = Math.round(pred.ensemble_risk_score * 100)
      setPrediction({
        risk_score: riskScore,
        risk_level: pred.risk_level,
        delay_prob: Math.round(pred.delay_probability * 100),
        recommendation: pred.recommendation,
      })

      // 3. Add alert if high risk
      if (pred.risk_level === 'HIGH' || pred.ensemble_risk_score > 0.7) {
        addAlert({
          id: `new-${Date.now()}`,
          timestamp: new Date(),
          severity: 'warning',
          message: `New shipment ${form.booking_id} added with ${pred.risk_level} risk (${riskScore}%). ${pred.recommendation}`,
          shipmentId: form.booking_id,
        })
      }

      // 4. Refresh shipments list
      qc.invalidateQueries({ queryKey: ['shipments'] })
      setStep('done')

    } catch (err: any) {
      console.error('Add shipment failed:', err)
      setStep('error')
    }
  }

  const handleClose = () => {
    setStep('form')
    setPrediction(null)
    setErrors({})
    setForm({ ...DEFAULT_FORM, booking_id: generateBookingId() })
    onClose()
  }

  const riskColor = (level: string) => {
    if (level === 'HIGH') return '#ef4444'
    if (level === 'MEDIUM') return '#f59e0b'
    return '#10b981'
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg glass-card border-l border-white/10 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Plus className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Add New Shipment</h2>
                  <p className="text-xs text-slate-400">Create and run instant risk prediction</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* ── FORM ── */}
              {(step === 'form' || step === 'error') && (
                <>
                  {step === 'error' && (
                    <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                      <p className="text-sm text-red-300">Failed to create shipment. Check backend is running.</p>
                    </div>
                  )}

                  {/* Booking ID */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                      Booking ID
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={form.booking_id}
                        onChange={e => set('booking_id', e.target.value)}
                        className={cn(
                          'flex-1 px-3 py-2.5 bg-black/40 border rounded-lg text-sm text-white',
                          'placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60 transition-all',
                          errors.booking_id ? 'border-red-500/60' : 'border-white/10',
                        )}
                        placeholder="US-XXXX-0000"
                      />
                      <button
                        onClick={() => set('booking_id', generateBookingId())}
                        className="px-3 py-2 text-xs text-slate-400 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors whitespace-nowrap"
                      >
                        Generate
                      </button>
                    </div>
                    {errors.booking_id && <p className="text-xs text-red-400 mt-1">{errors.booking_id}</p>}
                  </div>

                  {/* Origin / Destination */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                        <MapPin className="inline h-3 w-3 mr-1" />Origin
                      </label>
                      <select
                        value={form.origin_city}
                        onChange={e => set('origin_city', e.target.value)}
                        className={cn(
                          'w-full px-3 py-2.5 bg-black/40 border rounded-lg text-sm text-white',
                          'focus:outline-none focus:border-cyan-500/60 transition-all appearance-none',
                          errors.origin_city ? 'border-red-500/60' : 'border-white/10',
                        )}
                      >
                        <option value="" className="bg-slate-900">Select city...</option>
                        {US_CITIES.map(c => (
                          <option key={c.label} value={c.label} className="bg-slate-900">{c.label}</option>
                        ))}
                      </select>
                      {errors.origin_city && <p className="text-xs text-red-400 mt-1">{errors.origin_city}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                        <MapPin className="inline h-3 w-3 mr-1" />Destination
                      </label>
                      <select
                        value={form.destination_city}
                        onChange={e => set('destination_city', e.target.value)}
                        className={cn(
                          'w-full px-3 py-2.5 bg-black/40 border rounded-lg text-sm text-white',
                          'focus:outline-none focus:border-cyan-500/60 transition-all appearance-none',
                          errors.destination_city ? 'border-red-500/60' : 'border-white/10',
                        )}
                      >
                        <option value="" className="bg-slate-900">Select city...</option>
                        {US_CITIES.map(c => (
                          <option key={c.label} value={c.label} className="bg-slate-900">{c.label}</option>
                        ))}
                      </select>
                      {errors.destination_city && <p className="text-xs text-red-400 mt-1">{errors.destination_city}</p>}
                    </div>
                  </div>

                  {/* Auto distance */}
                  {autoDistance && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
                      <span className="text-xs text-slate-400">Estimated distance:</span>
                      <span className="text-sm font-bold text-cyan-400">{autoDistance.toLocaleString()} km</span>
                      <span className="text-xs text-slate-500 ml-auto">
                        ~{Math.round(autoDistance / 104.6)}h drive
                      </span>
                    </div>
                  )}

                  {/* Cargo type */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                      <Package className="inline h-3 w-3 mr-1" />Cargo Type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {CARGO_TYPES.map(c => (
                        <button
                          key={c}
                          onClick={() => set('cargo_type', c)}
                          className={cn(
                            'px-2 py-2 text-xs rounded-lg border transition-all text-left',
                            form.cargo_type === c
                              ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                              : 'bg-black/20 border-white/10 text-slate-400 hover:border-white/20 hover:text-white',
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Vehicle type */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                      <Truck className="inline h-3 w-3 mr-1" />Vehicle Type
                    </label>
                    <select
                      value={form.vehicle_type}
                      onChange={e => set('vehicle_type', e.target.value)}
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/60 transition-all appearance-none"
                    >
                      {VEHICLE_TYPES.map(v => (
                        <option key={v} value={v} className="bg-slate-900">{v}</option>
                      ))}
                    </select>
                  </div>

                  {/* Carrier */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                      Carrier
                    </label>
                    <select
                      value={form.carrier_id}
                      onChange={e => set('carrier_id', e.target.value)}
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/60 transition-all appearance-none"
                    >
                      {CARRIERS.map(c => (
                        <option key={c} value={c} className="bg-slate-900">{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Planned ETA */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                      <Calendar className="inline h-3 w-3 mr-1" />Planned ETA (optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={form.planned_eta}
                      onChange={e => set('planned_eta', e.target.value)}
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/60 transition-all [color-scheme:dark]"
                    />
                  </div>
                </>
              )}

              {/* ── PREDICTING ── */}
              {step === 'predicting' && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-cyan-500/20 flex items-center justify-center">
                      <Truck className="h-7 w-7 text-cyan-400" />
                    </div>
                    <Loader2 className="h-20 w-20 text-cyan-500/40 animate-spin absolute -inset-2" />
                  </div>
                  <p className="text-white font-medium">Running risk prediction...</p>
                  <p className="text-xs text-slate-500 text-center">
                    XGBoost + Isolation Forest + LightGBM ensemble
                  </p>
                </div>
              )}

              {/* ── DONE ── */}
              {step === 'done' && prediction && (
                <div className="space-y-4">
                  {/* Success banner */}
                  <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-emerald-400">Shipment created successfully</p>
                      <p className="text-xs text-slate-400">{form.booking_id}</p>
                    </div>
                  </div>

                  {/* Risk result */}
                  <div className="glass-inner p-5 text-center">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-3">
                      Ensemble Risk Score
                    </p>
                    <div
                      className="text-5xl font-bold mb-2"
                      style={{ color: riskColor(prediction.risk_level) }}
                    >
                      {prediction.risk_score}%
                    </div>
                    <span
                      className="px-3 py-1 text-sm font-bold uppercase rounded-full"
                      style={{
                        background: `${riskColor(prediction.risk_level)}22`,
                        color: riskColor(prediction.risk_level),
                      }}
                    >
                      {prediction.risk_level} RISK
                    </span>
                    <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                      {prediction.recommendation}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass-inner p-3 text-center">
                      <p className="text-xs text-slate-500 mb-1">Delay Probability</p>
                      <p className="text-2xl font-bold text-white">{prediction.delay_prob}%</p>
                    </div>
                    <div className="glass-inner p-3 text-center">
                      <p className="text-xs text-slate-500 mb-1">Distance</p>
                      <p className="text-2xl font-bold text-white">
                        {autoDistance ? `${autoDistance.toLocaleString()} km` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Route summary */}
                  <div className="glass-inner p-3 flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    <span className="text-slate-300 truncate">{form.origin_city}</span>
                    <span className="text-cyan-500 flex-shrink-0">→</span>
                    <span className="text-slate-300 truncate">{form.destination_city}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex-shrink-0 flex gap-3">
              {(step === 'form' || step === 'error') && (
                <>
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-400 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isPending || !form.origin_city || !form.destination_city}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-cyan-500/20 border border-cyan-500/40 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Create & Predict
                  </button>
                </>
              )}

              {step === 'predicting' && (
                <div className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  Analysing route risk...
                </div>
              )}

              {step === 'done' && (
                <>
                  <button
                    onClick={() => {
                      setStep('form')
                      setPrediction(null)
                      setForm({ ...DEFAULT_FORM, booking_id: generateBookingId() })
                    }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-400 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Add Another
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-cyan-500/20 border border-cyan-500/40 rounded-lg hover:bg-cyan-500/30 transition-colors"
                  >
                    Done
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
