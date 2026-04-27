/**
 * HTML template engine — generates print-ready HTML for each report type.
 * White background, clean typography, suitable for PDF conversion.
 */
import type { ReportData, ShipmentJourneyData, OperationsData, IncidentData } from './reportData'

const RISK_COLOR = (r: number) => r >= 70 ? '#dc2626' : r >= 40 ? '#d97706' : '#059669'
const RISK_LABEL = (r: number) => r >= 70 ? 'HIGH' : r >= 40 ? 'MEDIUM' : 'LOW'

const BASE_STYLES = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; font-size: 13px; line-height: 1.5; }
    .page { max-width: 800px; margin: 0 auto; padding: 32px; }
    h1 { font-size: 22px; font-weight: 700; color: #0f172a; }
    h2 { font-size: 15px; font-weight: 600; color: #0f172a; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
    h3 { font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #0891b2; }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-box { width: 36px; height: 36px; background: linear-gradient(135deg, #0891b2, #1d4ed8); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 16px; }
    .logo-text { font-size: 20px; font-weight: 800; color: #0891b2; letter-spacing: -0.5px; }
    .meta { text-align: right; font-size: 11px; color: #64748b; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-high { background: #fee2e2; color: #dc2626; }
    .badge-medium { background: #fef3c7; color: #d97706; }
    .badge-low { background: #d1fae5; color: #059669; }
    .badge-delayed { background: #fee2e2; color: #dc2626; }
    .badge-ontime { background: #d1fae5; color: #059669; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    .card-value { font-size: 24px; font-weight: 700; color: #0f172a; }
    .card-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    tr:last-child td { border-bottom: none; }
    .timeline { display: flex; gap: 0; margin: 12px 0; overflow-x: auto; }
    .tl-item { flex: 1; min-width: 100px; text-align: center; position: relative; }
    .tl-item::before { content: ''; position: absolute; top: 14px; left: 50%; right: -50%; height: 2px; background: #e2e8f0; z-index: 0; }
    .tl-item:last-child::before { display: none; }
    .tl-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px; font-size: 14px; position: relative; z-index: 1; background: #fff; border: 2px solid #e2e8f0; }
    .tl-time { font-size: 10px; color: #94a3b8; }
    .tl-label { font-size: 10px; color: #475569; margin-top: 2px; }
    .bar-chart { margin: 8px 0; }
    .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .bar-label { width: 140px; font-size: 11px; color: #475569; text-align: right; flex-shrink: 0; }
    .bar-track { flex: 1; height: 14px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; }
    .bar-val { width: 36px; font-size: 11px; color: #64748b; }
    .section { margin-bottom: 20px; }
    .kpi-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    .kpi-card { flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
    .highlight-box { background: #eff6ff; border-left: 4px solid #0891b2; padding: 10px 14px; border-radius: 0 6px 6px 0; margin: 8px 0; font-size: 12px; color: #1e40af; }
    .warn-box { background: #fffbeb; border-left: 4px solid #d97706; padding: 10px 14px; border-radius: 0 6px 6px 0; margin: 8px 0; font-size: 12px; color: #92400e; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
`

function header(reportId: string, generatedAt: Date, subtitle: string) {
  return `
    <div class="header">
      <div class="logo">
        <div class="logo-box">N</div>
        <div>
          <div class="logo-text">NEXUS</div>
          <div style="font-size:11px;color:#64748b">Supply Chain Intelligence</div>
        </div>
      </div>
      <div class="meta">
        <div style="font-weight:600;color:#0f172a">${subtitle}</div>
        <div>Report ID: ${reportId}</div>
        <div>Generated: ${generatedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
      </div>
    </div>`
}

function footer() {
  return `<div class="footer">Generated by NEXUS Supply Chain Intelligence · Confidential · For internal use only</div>`
}

// ─── Shipment Journey ──────────────────────────────────────────────────────
function renderShipmentJourney(d: ShipmentJourneyData): string {
  const riskBadge = `<span class="badge badge-${d.prediction.riskLevel.toLowerCase()}">${d.prediction.riskLevel}</span>`
  const outcomeBadge = d.shipment.riskLevel === 'low' || d.shipment.riskLevel === 'medium'
    ? `<span class="badge badge-ontime">ON TIME</span>`
    : `<span class="badge badge-delayed">DELAYED</span>`

  const shapMax = Math.max(...d.prediction.shapFeatures.map(f => f.value), 0.01)
  const shapBars = d.prediction.shapFeatures.map(f => `
    <div class="bar-row">
      <div class="bar-label">${f.feature}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(f.value / shapMax * 100)}%;background:${f.value > 0.2 ? '#dc2626' : '#d97706'}"></div></div>
      <div class="bar-val">${Math.round(f.value * 100)}%</div>
    </div>`).join('')

  const tlItems = d.timeline.map(t => `
    <div class="tl-item">
      <div class="tl-icon" style="border-color:${t.color}">${t.icon}</div>
      <div class="tl-time">${t.time}</div>
      <div class="tl-label">${t.event.slice(0, 30)}</div>
    </div>`).join('')

  const altRows = d.routes.alternatives.map(a => `
    <tr>
      <td>${a.label}${a.recommended ? ' ⭐' : ''}</td>
      <td><span style="color:${RISK_COLOR(a.risk)};font-weight:600">${a.risk}%</span></td>
      <td>${Math.round(a.etaMin / 60)}h ${a.etaMin % 60}m</td>
      <td>${a.distKm.toFixed(0)} km</td>
      <td>${a.extraCost > 0 ? `+$${a.extraCost.toLocaleString()}` : 'Base'}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shipment Journey Report</title>${BASE_STYLES}</head><body><div class="page">
    ${header(d.reportId, d.generatedAt, 'Shipment Journey Report')}

    <h2>Executive Summary</h2>
    <div class="grid-2">
      <div class="card">
        <h3>Shipment Details</h3>
        <table>
          <tr><td style="color:#64748b">Booking ID</td><td><strong>${d.shipment.id}</strong></td></tr>
          <tr><td style="color:#64748b">Route</td><td>${d.shipment.origin} → ${d.shipment.destination}</td></tr>
          <tr><td style="color:#64748b">Cargo</td><td>${d.shipment.cargoType}</td></tr>
          <tr><td style="color:#64748b">Carrier</td><td>${String(d.raw.carrier_id ?? 'N/A')}</td></tr>
          <tr><td style="color:#64748b">Distance</td><td>${Number(d.raw.distance_km ?? 0).toFixed(0)} km</td></tr>
          <tr><td style="color:#64748b">ETA</td><td>${d.shipment.eta}</td></tr>
        </table>
      </div>
      <div class="card">
        <h3>Risk & Outcome</h3>
        <div style="margin-bottom:10px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">Ensemble Risk Score</div>
          <div style="font-size:32px;font-weight:800;color:${RISK_COLOR(d.prediction.riskScore)}">${d.prediction.riskScore}%</div>
          <div style="margin-top:4px">${riskBadge} ${outcomeBadge}</div>
        </div>
        <div style="font-size:12px;color:#475569;margin-top:8px">${d.prediction.recommendation}</div>
      </div>
    </div>

    <h2>Event Timeline</h2>
    <div class="timeline">${tlItems}</div>

    <h2>Risk Analysis</h2>
    <div class="grid-2">
      <div class="card">
        <h3>SHAP Feature Importance</h3>
        <div class="bar-chart">${shapBars || '<p style="color:#94a3b8;font-size:12px">No SHAP data available</p>'}</div>
      </div>
      <div class="card">
        <h3>Performance Metrics</h3>
        <table>
          <tr><td style="color:#64748b">Delay Probability</td><td><strong>${d.prediction.delayProb}%</strong></td></tr>
          <tr><td style="color:#64748b">Early Warning</td><td><strong>${d.performance.earlyWarningHours}h</strong> before disruption</td></tr>
          <tr><td style="color:#64748b">Prediction Accuracy</td><td><strong>${d.performance.predictionAccuracy}%</strong></td></tr>
          <tr><td style="color:#64748b">ETA Error</td><td><strong>±${d.performance.etaErrorHours}h</strong></td></tr>
        </table>
      </div>
    </div>

    <h2>Route Comparison</h2>
    <table>
      <thead><tr><th>Route</th><th>Risk</th><th>ETA</th><th>Distance</th><th>Extra Cost</th></tr></thead>
      <tbody>
        <tr style="background:#fef2f2">
          <td>${d.routes.current.label}</td>
          <td><span style="color:${RISK_COLOR(d.routes.current.risk)};font-weight:600">${d.routes.current.risk}%</span></td>
          <td>${Math.round(d.routes.current.etaMin / 60)}h ${d.routes.current.etaMin % 60}m</td>
          <td>${d.routes.current.distKm.toFixed(0)} km</td>
          <td>Base</td>
        </tr>
        ${altRows}
      </tbody>
    </table>

    <h2>Weather Conditions</h2>
    <div class="grid-2">
      ${['Origin', 'Destination'].map((loc, i) => {
        const w = i === 0 ? d.weather.origin : d.weather.destination
        return `<div class="card">
          <h3>${loc}: ${i === 0 ? d.shipment.origin : d.shipment.destination}</h3>
          <table>
            <tr><td style="color:#64748b">Condition</td><td>${w.condition}</td></tr>
            <tr><td style="color:#64748b">Temperature</td><td>${w.tempF.toFixed(0)}°F</td></tr>
            <tr><td style="color:#64748b">Precipitation</td><td>${w.precipMm.toFixed(1)} mm</td></tr>
            <tr><td style="color:#64748b">Wind</td><td>${w.windMph.toFixed(0)} mph</td></tr>
            <tr><td style="color:#64748b">Severity</td><td><span style="color:${RISK_COLOR(w.severity * 20)}">${w.severity.toFixed(1)}/5</span></td></tr>
          </table>
        </div>`
      }).join('')}
    </div>

    ${footer()}
  </div></body></html>`
}

// ─── Operations Report ─────────────────────────────────────────────────────
function renderOperations(d: OperationsData): string {
  const kpiCards = [
    { label: 'Total Shipments', value: d.kpis.total, color: '#0891b2' },
    { label: 'Active', value: d.kpis.active, color: '#0891b2' },
    { label: 'Disrupted', value: d.kpis.disrupted, color: '#dc2626' },
    { label: 'On-Time Rate', value: `${d.kpis.onTimeRate}%`, color: '#059669' },
    { label: 'Avg Risk', value: `${d.kpis.avgRisk}%`, color: '#d97706' },
    { label: 'Cost Saved', value: `$${(d.kpis.costSaved / 1000).toFixed(0)}K`, color: '#059669' },
  ].map(k => `<div class="kpi-card"><div class="card-value" style="color:${k.color}">${k.value}</div><div class="card-label">${k.label}</div></div>`).join('')

  const riskMax = Math.max(...d.riskDist.map(r => r.value), 1)
  const riskBars = d.riskDist.map(r => `
    <div class="bar-row">
      <div class="bar-label">${r.name}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.value / riskMax * 100)}%;background:${r.color}"></div></div>
      <div class="bar-val">${r.value}</div>
    </div>`).join('')

  const carrierRows = d.carrierPerf.map(c => `
    <tr>
      <td>${c.carrier}</td>
      <td><span style="color:${c.onTimePct >= 80 ? '#059669' : '#dc2626'};font-weight:600">${c.onTimePct}%</span></td>
      <td>${c.avgDelay}%</td>
      <td>${c.shipments}</td>
    </tr>`).join('')

  const total = d.accuracy.correct + d.accuracy.falsePositive + d.accuracy.missed
  const accPct = total > 0 ? Math.round(d.accuracy.correct / total * 100) : 0

  const recs = d.recommendations.map(r => `<div class="highlight-box">💡 ${r}</div>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Operations Report</title>${BASE_STYLES}</head><body><div class="page">
    ${header(d.reportId, d.generatedAt, `Operations Report — ${d.period}`)}

    <h2>KPI Summary</h2>
    <div class="kpi-row">${kpiCards}</div>

    <div class="grid-2">
      <div class="section">
        <h2>Risk Distribution</h2>
        <div class="bar-chart">${riskBars}</div>
      </div>
      <div class="section">
        <h2>Prediction Accuracy</h2>
        <div class="card" style="text-align:center">
          <div style="font-size:40px;font-weight:800;color:${accPct >= 80 ? '#059669' : '#d97706'}">${accPct}%</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">Overall Accuracy</div>
          <table style="margin-top:12px">
            <tr><td style="color:#64748b">Correct</td><td style="color:#059669;font-weight:600">${d.accuracy.correct}</td></tr>
            <tr><td style="color:#64748b">False Positives</td><td style="color:#d97706;font-weight:600">${d.accuracy.falsePositive}</td></tr>
            <tr><td style="color:#64748b">Missed</td><td style="color:#dc2626;font-weight:600">${d.accuracy.missed}</td></tr>
          </table>
        </div>
      </div>
    </div>

    <h2>Carrier Performance</h2>
    <table>
      <thead><tr><th>Carrier</th><th>On-Time %</th><th>Avg Risk</th><th>Shipments</th></tr></thead>
      <tbody>${carrierRows}</tbody>
    </table>

    <h2>Recommendations</h2>
    ${recs}

    ${footer()}
  </div></body></html>`
}

// ─── Incident Report ───────────────────────────────────────────────────────
function renderIncident(d: IncidentData): string {
  const tlRows = d.timeline.map(t => `
    <tr>
      <td style="font-family:monospace;color:#64748b">${t.time}</td>
      <td><strong>${t.action}</strong></td>
      <td>${t.actor}</td>
      <td>${t.outcome}</td>
    </tr>`).join('')

  const altRows = d.alternatives.map(a => `
    <tr>
      <td>${a.label}${a.recommended ? ' ⭐' : ''}</td>
      <td><span style="color:${RISK_COLOR(a.risk)};font-weight:600">${a.risk}%</span></td>
      <td>${a.cost > 0 ? `+$${a.cost.toLocaleString()}` : 'Base'}</td>
    </tr>`).join('')

  const lessons = d.lessons.map(l => `<div class="warn-box">📌 ${l}</div>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Incident Analysis Report</title>${BASE_STYLES}</head><body><div class="page">
    ${header(d.reportId, d.generatedAt, 'Incident Analysis Report')}

    <h2>Incident Summary</h2>
    <div class="card">
      <table>
        <tr><td style="color:#64748b">Shipment</td><td><strong>${d.shipment.id}</strong></td></tr>
        <tr><td style="color:#64748b">Route</td><td>${d.shipment.origin} → ${d.shipment.destination}</td></tr>
        <tr><td style="color:#64748b">Incident</td><td>${d.incident.summary}</td></tr>
        <tr><td style="color:#64748b">Detected At</td><td>${new Date(d.incident.detectedAt).toLocaleString()}</td></tr>
        <tr><td style="color:#64748b">Location</td><td>${d.incident.location}</td></tr>
        <tr><td style="color:#64748b">Early Warning</td><td><strong>${d.incident.earlyWarningHours}h</strong> before impact</td></tr>
        <tr><td style="color:#64748b">Response Time</td><td><strong>${d.incident.responseTimeMin} min</strong></td></tr>
        <tr><td style="color:#64748b">Outcome</td><td>${d.outcome}</td></tr>
      </table>
    </div>

    <h2>Response Timeline</h2>
    <table>
      <thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Outcome</th></tr></thead>
      <tbody>${tlRows}</tbody>
    </table>

    <h2>Alternative Routes Considered</h2>
    <table>
      <thead><tr><th>Route</th><th>Risk</th><th>Extra Cost</th></tr></thead>
      <tbody>${altRows || '<tr><td colspan="3" style="color:#94a3b8">No alternatives computed</td></tr>'}</tbody>
    </table>

    <h2>Lessons & Recommendations</h2>
    ${lessons}

    ${footer()}
  </div></body></html>`
}

// ─── Main renderer ─────────────────────────────────────────────────────────
export function renderReportHTML(data: ReportData): string {
  if (data.type === 'SHIPMENT_JOURNEY') return renderShipmentJourney(data)
  if (data.type === 'OPERATIONS') return renderOperations(data)
  return renderIncident(data)
}
