/**
 * PDF engine — renders HTML to PDF using jsPDF + html2canvas.
 * Renders into a hidden iframe, captures with html2canvas, embeds in jsPDF.
 */
import type { ReportData } from './reportData'
import { renderReportHTML } from './reportTemplate'

export async function downloadPDF(data: ReportData): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: html2canvas } = await import('html2canvas')

  const html = renderReportHTML(data)

  // Create hidden container
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;z-index:-1'
  container.innerHTML = html
  document.body.appendChild(container)

  try {
    await new Promise(r => setTimeout(r, 200)) // let fonts render

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 800,
    })

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    const pdfW = pdf.internal.pageSize.getWidth()
    const pdfH = pdf.internal.pageSize.getHeight()
    const imgH = (canvas.height * pdfW) / canvas.width

    let y = 0
    let remaining = imgH

    while (remaining > 0) {
      if (y > 0) pdf.addPage()
      const sliceH = Math.min(pdfH, remaining)
      pdf.addImage(imgData, 'PNG', 0, -y, pdfW, imgH)
      y += pdfH
      remaining -= sliceH
    }

    const filename = `NEXUS-${data.reportId}-${data.type.toLowerCase().replace('_', '-')}.pdf`
    pdf.save(filename)
  } finally {
    document.body.removeChild(container)
  }
}

export function downloadHTML(data: ReportData): void {
  const html = renderReportHTML(data)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `NEXUS-${data.reportId}.html`
  a.click()
  URL.revokeObjectURL(url)
}
