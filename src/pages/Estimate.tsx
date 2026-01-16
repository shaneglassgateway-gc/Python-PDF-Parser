import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Mail, Calculator, Building, DollarSign, HardHat } from 'lucide-react'
import jsPDF from 'jspdf'
import { supabase } from '../lib/supabase'
import { apiBase } from '../lib/utils'
import { 
  calculateMaterialQuantities, 
  applyMaterialPrices, 
  calculateLaborCosts, 
  calculateTotalCosts,
  RoofMeasurements,
  MaterialItem,
  LaborItem
} from '../utils/calculations'

interface Estimate {
  id: string
  customer_name: string
  customer_address: string
  project_type: string
  notes: string
  roof_measurements: RoofMeasurements
  material_costs: MaterialItem[]
  labor_costs: LaborItem[]
  total_material_cost: number
  total_labor_cost: number
  total_cost: number
  profit_margin: number
  status: string
  created_at: string
}

interface MaterialPrice {
  id: string
  item_name: string
  unit_of_measure: string
  price_per_unit: number
  category: string
}

interface LaborRate {
  id: string
  condition_type: string
  description: string
  rate_per_square?: number
  rate_per_linear_foot?: number
}

interface MaterialOrderRule {
  id: string
  material_name: string
  unit_of_measure: string
  quantity_formula: string
  description: string
  category: string
}

export default function Estimate() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [materialPrices, setMaterialPrices] = useState<MaterialPrice[]>([])
  const [laborRates, setLaborRates] = useState<LaborRate[]>([])
  const [materialRules, setMaterialRules] = useState<MaterialOrderRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contributionPct, setContributionPct] = useState(0.40)
  const [materialCosts, setMaterialCosts] = useState<MaterialItem[]>([])
  const [laborCosts, setLaborCosts] = useState<LaborItem[]>([])
  const [totalCosts, setTotalCosts] = useState({
    totalMaterialCost: 0,
    totalLaborCost: 0,
    subtotal: 0,
    profit: 0,
    totalCost: 0,
    profitMargin: 0.40
  })
  const financedTag = '[financed]'
  const [isAdmin, setIsAdmin] = useState(false)
  const [estimatorName, setEstimatorName] = useState('')

  useEffect(() => {
    loadEstimate()
    loadPricingData()
  }, [id])

  useEffect(() => {
    if (estimate && materialPrices.length > 0 && laborRates.length > 0 && materialRules.length > 0) {
      calculateCosts()
    }
  }, [estimate, materialPrices, laborRates, materialRules, contributionPct])

  const loadEstimate = async () => {
    try {
      const dev = (import.meta as any).env?.VITE_DEV_NO_AUTH === 'true'
      let session: any = null
      if (!dev) {
        const sres = await supabase.auth.getSession()
        session = sres.data.session
        if (!session) throw new Error('You must be logged in to view estimates')
      }
      setIsAdmin(((session as any)?.user?.user_metadata?.role) === 'admin')

      const response = await fetch(`${apiBase()}/api/estimates/${id}`, dev ? {} : {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })

      if (!response.ok) {
        throw new Error('Failed to load estimate')
      }

      const result = await response.json()
      setEstimate(result.estimate)
      const raw = result.estimate.profit_margin
      const cm = (typeof raw === 'number' && raw >= 0.35 && raw <= 0.60) ? raw : 0.40
      setContributionPct(cm)
      if (!dev) {
        const user = (session?.user as any) || {}
        const fn = user?.user_metadata?.first_name || ''
        const ln = user?.user_metadata?.last_name || ''
        const name = `${fn} ${ln}`.trim() || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.display_name || ''
        setEstimatorName(name || '')
      } else {
        setEstimatorName('Gateway Estimator')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load estimate')
    } finally {
      setLoading(false)
    }
  }

  const loadPricingData = async () => {
    try {
      const base = apiBase()
      const [materialPricesRes, laborRatesRes, materialRulesRes] = await Promise.all([
        fetch(`${base}/api/estimates/material-prices`),
        fetch(`${base}/api/estimates/labor-rates`),
        fetch(`${base}/api/estimates/material-order-rules`)
      ])

      if (!materialPricesRes.ok || !laborRatesRes.ok || !materialRulesRes.ok) {
        throw new Error('Failed to load pricing data')
      }

      const [materialPricesData, laborRatesData, materialRulesData] = await Promise.all([
        materialPricesRes.json(),
        laborRatesRes.json(),
        materialRulesRes.json()
      ])

      setMaterialPrices(materialPricesData?.materialPrices ?? [])
      setLaborRates(laborRatesData?.laborRates ?? [])
      setMaterialRules(materialRulesData?.materialOrderRules ?? [])
    } catch (err) {
      console.error('Failed to load pricing data:', err)
    }
  }

  const calculateCosts = async () => {
    if (!estimate) return

    try {
      // Convert database types to calculation types
      const priceData = materialPrices.map(price => ({
        itemName: price.item_name,
        pricePerUnit: price.price_per_unit,
        unitOfMeasure: price.unit_of_measure,
        category: price.category
      }))

      const ruleData = materialRules.map(rule => ({
        id: rule.id,
        materialName: rule.material_name,
        unitOfMeasure: rule.unit_of_measure,
        quantityFormula: rule.quantity_formula,
        description: rule.description,
        category: rule.category
      }))

      const laborData = laborRates.map(rate => ({
        id: rate.id,
        conditionType: rate.condition_type,
        description: rate.description,
        ratePerSquare: rate.rate_per_square,
        ratePerLinearFoot: rate.rate_per_linear_foot
      }))

      // Calculate material quantities and costs
      const materials = calculateMaterialQuantities(estimate.roof_measurements, ruleData)
      
      const accessoryMap: Record<string, { name: string; unit: string; category: string }> = {
        leadBoots: { name: 'Mayco Industries Lead Boot with 12" x 12" x 14" Base', unit: 'EA', category: 'Accessories' },
        pvcBoots: { name: 'TRI-BUILT 4-N-1 Aluminum Base Flashing', unit: 'PC', category: 'Accessories' },
        turtleVents: { name: 'TRI-BUILT 750-S Aluminum Slant Back Roof Louver with Screen', unit: 'PC', category: 'Accessories' },
        rainCap: { name: 'TRI-BUILT Multicap Vent Cap', unit: 'PC', category: 'Accessories' },
        brickChimneyFlashing: { name: 'FlashMaster 32" Chimney Flashing Kit', unit: 'EA', category: 'Accessories' },
      }
      const extras: any[] = Array.isArray((estimate as any).accessories) ? (estimate as any).accessories : []
      const accessoryItems = extras
        .filter((a: any) => a && accessoryMap[a.key] && a.quantity > 0)
        .map((a: any) => {
          const meta = accessoryMap[a.key]
          return {
            id: `accessory-${a.key}`,
            itemName: meta.name,
            unitOfMeasure: meta.unit,
            pricePerUnit: 0,
            category: meta.category,
            quantity: a.quantity,
            totalCost: 0,
          }
        })
      
      const materialsWithPrices = applyMaterialPrices([...materials, ...accessoryItems], priceData)
      setMaterialCosts(materialsWithPrices)

      // Calculate labor costs
      const labor = calculateLaborCosts(estimate.roof_measurements, laborData)
      setLaborCosts(labor)

      // Calculate total costs
      const x = 0.86 - contributionPct
      const totals = calculateTotalCosts(materialsWithPrices, labor, x)
      const isFinanced = String(estimate.notes || '').toLowerCase().includes('financed')
      const totalsWithFee = isFinanced ? { ...totals, totalCost: totals.totalCost + 500 } : totals
      setTotalCosts(totalsWithFee)

      // Update estimate with calculated costs
      const updatedEstimate = {
        ...estimate,
        material_costs: materialsWithPrices,
        labor_costs: labor,
        total_material_cost: totals.totalMaterialCost,
        total_labor_cost: totals.totalLaborCost,
        total_cost: totalsWithFee.totalCost,
        profit_margin: contributionPct
      }

      // Save the updated estimate
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await fetch(`${apiBase()}/api/estimates/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(updatedEstimate)
        })
      }
    } catch (err) {
      console.error('Failed to calculate costs:', err)
      setError('Failed to calculate costs')
    }
  }

  const handleContributionPctChange = (newPct: number) => {
    setContributionPct(newPct)
  }

  const handleExportPDF = () => {
    if (!estimate) return
    const pdf = new jsPDF('p', 'pt', 'a4')
    const marginLeft = 40
    const marginTop = 40
    const pageWidth = pdf.internal.pageSize.getWidth()
    const loadLogo = () =>
      new Promise<string | null>(resolve => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')
          if (!ctx) return resolve(null)
          ctx.drawImage(img, 0, 0)
          resolve(c.toDataURL('image/png'))
        }
        img.onerror = () => resolve(null)
        img.src = '/logo.png'
      })
    loadLogo().then(logoData => {
      if (logoData) {
        const logoW = 96
        const logoH = 96
        pdf.addImage(logoData, 'PNG', pageWidth - marginLeft - logoW, marginTop - 6, logoW, logoH)
      }
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Gateway General Contractors', pageWidth / 2, marginTop, { align: 'center' })
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(12)
      pdf.text(`Name: ${estimate.customer_name || ''}`, marginLeft, marginTop + 24)
      pdf.text(`Address: ${estimate.customer_address || ''}`, marginLeft, marginTop + 42)
      pdf.text(`Estimator: ${estimatorName || ''}`, marginLeft, marginTop + 60)
      const sectionTop = marginTop + 100
      const pageH = pdf.internal.pageSize.getHeight()
      const availableW = pageWidth - marginLeft * 2
      const gap = 24
      const tableW = Math.floor((availableW - gap) / 2)
      const tableH = Math.floor(pageH * 0.5)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(13)
      pdf.text('Materials', marginLeft, sectionTop)
      pdf.text('Labor', marginLeft + tableW + gap, sectionTop)
      const leftTop = sectionTop + 16
      const rightTop = sectionTop + 16
      const colPerc = [0.65, 0.15, 0.20]
      const colWs = colPerc.map(p => Math.floor(tableW * p))
      const leftXs = [marginLeft, marginLeft + colWs[0], marginLeft + colWs[0] + colWs[1]]
      const rightXs = [marginLeft + tableW + gap, marginLeft + tableW + gap + colWs[0], marginLeft + tableW + gap + colWs[0] + colWs[1]]
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setFillColor(245,245,245)
      pdf.rect(marginLeft, leftTop, tableW, 22, 'F')
      pdf.rect(marginLeft + tableW + gap, rightTop, tableW, 22, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.text('Name', leftXs[0] + 6, leftTop + 14)
      pdf.text('Unit', leftXs[1] + 6, leftTop + 14)
      pdf.text('Qty', leftXs[2] + 6, leftTop + 14)
      pdf.text('Name', rightXs[0] + 6, rightTop + 14)
      pdf.text('Unit', rightXs[1] + 6, rightTop + 14)
      pdf.text('Qty', rightXs[2] + 6, rightTop + 14)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      const matRows = materialCosts.map(m => ({ name: m.itemName, unit: m.unitOfMeasure, qty: m.quantity }))
      const labRows = laborCosts.map(l => ({
        name: l.conditionType,
        unit: (!l.ratePerSquare && !l.ratePerLinearFoot) ? '' : (l.ratePerSquare ? 'SQ' : 'LF'),
        qty: l.quantity
      }))
      let ly = leftTop + 22
      let ry = rightTop + 22
      const drawRow = (x0: number[], y0: number, row: {name:string;unit:string;qty:any}) => {
        const nameLines = pdf.splitTextToSize(String(row.name || ''), colWs[0] - 12)
        const lines = Array.isArray(nameLines) ? nameLines.slice(0, 2) : [String(nameLines)]
        const lineH = 11
        const rowH = Math.max(18, 4 + lines.length * lineH + 4)
        pdf.text(lines, x0[0] + 6, y0 + 12)
        pdf.text(String(row.unit || ''), x0[1] + 6, y0 + 12)
        pdf.text(String(row.qty ?? 0), x0[2] + 6, y0 + 12)
        pdf.setDrawColor(230,230,230)
        pdf.line(x0[0], y0 + rowH, x0[0] + tableW, y0 + rowH)
        return rowH
      }
      let mi = 0
      while (mi < matRows.length) {
        const nextH = drawRow(leftXs, ly, matRows[mi])
        ly += nextH
        mi++
      }
      let li = 0
      while (li < labRows.length) {
        const nextH = drawRow(rightXs, ry, labRows[li])
        ry += nextH
        li++
      }
      const usedLeftH = Math.max(22, ly - leftTop)
      const usedRightH = Math.max(22, ry - rightTop)
      pdf.setDrawColor(200,200,200)
      pdf.rect(marginLeft, leftTop, tableW, usedLeftH)
      pdf.rect(marginLeft + tableW + gap, rightTop, tableW, usedRightH)
      pdf.setDrawColor(220,220,220)
      pdf.line(leftXs[1], leftTop, leftXs[1], leftTop + usedLeftH)
      pdf.line(leftXs[2], leftTop, leftXs[2], leftTop + usedLeftH)
      pdf.line(rightXs[1], rightTop, rightXs[1], rightTop + usedRightH)
      pdf.line(rightXs[2], rightTop, rightXs[2], rightTop + usedRightH)
      const otherSpacing = 20
      const otherTop = ry + otherSpacing
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(13)
      pdf.text('Other Trades', marginLeft + tableW + gap, otherTop)
      const otherHeaderTop = otherTop + 12
      const otherColPerc = [0.65, 0.15, 0.20]
      const otherColWs = otherColPerc.map(p => Math.floor(tableW * p))
      const otherXs = [marginLeft + tableW + gap, marginLeft + tableW + gap + otherColWs[0], marginLeft + tableW + gap + otherColWs[0] + otherColWs[1]]
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setFillColor(245,245,245)
      pdf.rect(marginLeft + tableW + gap, otherHeaderTop, tableW, 22, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.text('Name', otherXs[0] + 6, otherHeaderTop + 14)
      pdf.text('Unit', otherXs[1] + 6, otherHeaderTop + 14)
      pdf.text('Qty', otherXs[2] + 6, otherHeaderTop + 14)
      const otherItems = [
        { name: 'Other trades (gutters, siding) not included in scope of work', unit: '', qty: '' }
      ]
      let oy = otherHeaderTop + 22
      const drawOtherRow = (x0: number[], y0: number, row: {name:string;unit:string;qty:any}) => {
        const nameLines = pdf.splitTextToSize(String(row.name || ''), otherColWs[0] - 12)
        const lines = Array.isArray(nameLines) ? nameLines.slice(0, 3) : [String(nameLines)]
        const lineH = 12
        const rowH = Math.max(18, 4 + lines.length * lineH + 4)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        pdf.text(lines, x0[0] + 6, y0 + 12)
        pdf.text(String(row.unit || ''), x0[1] + 6, y0 + 12)
        pdf.text(String(row.qty ?? ''), x0[2] + 6, y0 + 12)
        pdf.setDrawColor(230,230,230)
        pdf.line(x0[0], y0 + rowH, x0[0] + tableW, y0 + rowH)
        return rowH
      }
      const leftBottomY = leftTop + Math.max(22, ly - leftTop)
      for (let i = 0; i < otherItems.length; i++) {
        const nextH = drawOtherRow(otherXs, oy, otherItems[i])
        if (oy + nextH > leftBottomY) {
          oy = leftBottomY
          break
        }
        oy += nextH
      }
      const usedOtherH = Math.max(22, oy - otherHeaderTop)
      pdf.setDrawColor(200,200,200)
      pdf.rect(marginLeft + tableW + gap, otherHeaderTop, tableW, usedOtherH)
      pdf.setDrawColor(220,220,220)
      pdf.line(otherXs[1], otherHeaderTop, otherXs[1], otherHeaderTop + usedOtherH)
      pdf.line(otherXs[2], otherHeaderTop, otherXs[2], otherHeaderTop + usedOtherH)
      let y = Math.max(leftBottomY, oy) + 24
      // Move to next page if needed
      const pageH2 = pdf.internal.pageSize.getHeight()
      if (y + 140 > pageH2 - marginTop) {
        pdf.addPage()
        y = marginTop
      }
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(14)
      pdf.text('Contract Total', marginLeft, y)
      pdf.setFontSize(18)
      pdf.setTextColor(34, 197, 94)
      pdf.text(`$${(totalCosts.totalCost || 0).toFixed(2)}`, marginLeft + 150, y)
      pdf.setTextColor(0)
      y += 28
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.text('GoodLeap Financing Options', marginLeft, y)
      const financeTotal = (totalCosts.totalCost || 0) + 500
      const opt5 = 0.02327 * financeTotal
      const opt10 = 0.01515 * financeTotal
      const opt15 = 0.0128 * financeTotal
      const boxTop = y + 12
      const boxGap = 16
      const boxW = Math.floor((availableW - boxGap * 2) / 3)
      // Compute scale-to-fit for boxes + fine print to keep on one page
      const fineText = 'The payment amounts displayed are estimates of financing plan payments. The actual payment will be based on the homeowner’s credit worthiness, and financing plan selected. This is an estimate only, and not a offer or contract for financing. This includes a $500 Loan Origination Fee.'
      const fineLinesProbe = pdf.splitTextToSize(fineText, availableW)
      const probeFineH = (Array.isArray(fineLinesProbe) ? fineLinesProbe.length : 1) * 10
      const pageH4 = pdf.internal.pageSize.getHeight()
      const expectedTotalH = (boxTop - marginTop) + 150 + 20 + probeFineH
      let scaleAll = 1
      const maxH = pageH4 - marginTop - 12
      if (expectedTotalH > maxH) {
        scaleAll = Math.max(0.7, Math.min(0.95, maxH / expectedTotalH))
      }
      const boxHeight = Math.floor(150 * scaleAll)
      const bx1 = marginLeft
      const bx2 = marginLeft + boxW + boxGap
      const bx3 = marginLeft + boxW * 2 + boxGap * 2
      const drawFinanceBox = (x: number, planNum: number, monthly: number, factorPct: number, periodLabel: string, s: number) => {
        const h = boxHeight
        const pad = 10
        const cw = boxW - pad * 2
        pdf.setDrawColor(200,200,200)
        pdf.setFillColor(250,250,250)
        pdf.rect(x, boxTop, boxW, h, 'F')
        pdf.setDrawColor(225,225,225)
        pdf.line(x, boxTop + Math.floor(28 * s), x + boxW, boxTop + Math.floor(28 * s))
        const monthlyY = boxTop + h - Math.floor(16 * s)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(Math.max(8, Math.floor(12 * s)))
        pdf.text(`GoodLeap Plan ${planNum}`, x + pad, boxTop + Math.floor(18 * s))
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(Math.max(7, Math.floor(9 * s)))
        const subtitle = 'First payment date will be determined by\ncustomer within 60 days of project completion.'
        const subLines = pdf.splitTextToSize(subtitle, cw)
        let subY = boxTop + Math.floor(44 * s)
        const subLineH = Math.max(9, Math.floor(12 * s))
        const subArr = Array.isArray(subLines) ? subLines : [String(subLines)]
        for (const ln of subArr) {
          pdf.text(String(ln), x + pad, subY)
          subY += subLineH
        }
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(Math.max(8, Math.floor(10 * s)))
        let aprY = subY + Math.floor(4 * s)
        pdf.text('APR 12.99%', x + pad, aprY)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(Math.max(8, Math.floor(10 * s)))
        let spacing = Math.max(10, Math.floor(12 * s))
        let termY = aprY + spacing
        let factorY = termY + spacing
        const gapBelowMonthly = Math.max(30, Math.floor(44 * s))
        const maxFactorY = monthlyY - gapBelowMonthly
        if (factorY > maxFactorY) {
          spacing = Math.max(10, Math.floor((maxFactorY - aprY) / 2))
          termY = aprY + spacing
          factorY = termY + spacing
        }
        const minSep = Math.max(10, Math.floor(10 * s))
        const centerY = Math.floor((aprY + factorY) / 2)
        termY = Math.min(Math.max(centerY, aprY + minSep), factorY - minSep)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(Math.max(8, Math.floor(10 * s)))
        pdf.text(`Term: ${periodLabel}`, x + pad, termY)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(Math.max(8, Math.floor(10 * s)))
        pdf.text(`Payment Factor: ${factorPct.toFixed(3)}%`, x + pad, factorY)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(Math.max(12, Math.floor(16 * s)))
        pdf.setTextColor(34, 197, 94)
        pdf.text(`$${monthly.toFixed(2)}/mo`, x + pad, monthlyY)
        pdf.setTextColor(0)
      }
      drawFinanceBox(bx1, 1, opt5, 0.02327 * 100, '5 Years', scaleAll)
      drawFinanceBox(bx2, 2, opt10, 0.01515 * 100, '10 Years', scaleAll)
      drawFinanceBox(bx3, 3, opt15, 0.0128 * 100, '15 Years', scaleAll)
      const fineTop = boxTop + boxHeight + 20
      const pageH3 = pdf.internal.pageSize.getHeight()
      const pageBottom = pageH3 - marginTop
      let fy = fineTop
      pdf.setFont('helvetica', 'normal')
      let fineFontSize = Math.max(6, Math.floor(8 * scaleAll))
      pdf.setFontSize(fineFontSize)
      pdf.setTextColor(100, 100, 100)
      const linesCount = Array.isArray(fineLinesProbe) ? fineLinesProbe.length : 1
      const lineH = Math.max(7, Math.ceil(fineFontSize * 1.2))
      let fineHeight = linesCount * lineH
      if (fy + fineHeight > pageBottom) {
        const room = pageBottom - fy
        const ratio = room / fineHeight
        const newFont = Math.max(6, Math.floor(fineFontSize * Math.min(1, ratio)))
        fineFontSize = newFont
        pdf.setFontSize(fineFontSize)
        const newLineH = Math.max(7, Math.ceil(fineFontSize * 1.2))
        const newFineHeight = linesCount * newLineH
        if (fy + newFineHeight > pageBottom) {
          fy = Math.max(marginTop + 4, pageBottom - newFineHeight)
        }
      }
      pdf.text(fineLinesProbe, marginLeft, fy)
      pdf.setTextColor(0)
      const fileSafeName = String(estimate.customer_name || 'Estimate').replace(/[^a-z0-9_\-]+/gi, '_')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      pdf.save(`Estimate_${fileSafeName}_${stamp}.pdf`)
    })
  }

  const handleEmailQuote = () => {
    // TODO: Implement email functionality
    alert('Email functionality will be implemented soon!')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading estimate...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Estimate</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/upload')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go to Upload
          </button>
        </div>
      </div>
    )
  }

  if (!estimate) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/history')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to History
            </button>
            <div className="flex space-x-3">
              <button
                onClick={handleExportPDF}
                className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </button>
              <button
                onClick={handleEmailQuote}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Mail className="h-4 w-4 mr-2" />
                Email Quote
              </button>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Customer Information</h3>
                <p className="text-gray-900 font-medium">{estimate.customer_name}</p>
                <p className="text-gray-600 text-sm">{estimate.customer_address}</p>
                <p className="text-gray-600 text-sm mt-1">Project: {estimate.project_type}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Roof Measurements</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Area: {estimate.roof_measurements.roofArea.toFixed(1)} squares</p>
                  <p>Pitch: {estimate.roof_measurements.pitch.toFixed(2)}</p>
                  <p>Stories: {estimate.roof_measurements.stories}</p>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Total Estimate</h3>
                <p className="text-2xl font-bold text-green-600">
                  ${totalCosts.totalCost.toLocaleString()}
                </p>
                <p className="text-gray-600 text-sm">
                  ${totalCosts.totalMaterialCost.toLocaleString()} materials + ${totalCosts.totalLaborCost.toLocaleString()} labor
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Contribution Margin</h3>
                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min="0.35"
                    max="0.60"
                    step="0.01"
                    value={contributionPct}
                    onChange={(e) => handleContributionPctChange(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-lg font-medium text-gray-900">
                    {Math.round(contributionPct * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Material Costs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center">
                <Building className="h-5 w-5 text-blue-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Material Costs</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {materialCosts.map((material) => (
                  <div key={material.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{material.itemName}</p>
                      <p className="text-sm text-gray-600">
                        {material.quantity} {material.unitOfMeasure}
                        {isAdmin ? ` × $${material.pricePerUnit.toFixed(2)}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      {isAdmin && <p className="font-medium text-gray-900">${material.totalCost.toFixed(2)}</p>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                  <p className="text-lg font-semibold text-gray-900">Total Materials</p>
                  <p className="text-lg font-semibold text-gray-900">
                    ${totalCosts.totalMaterialCost.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Labor Costs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center">
                <HardHat className="h-5 w-5 text-orange-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Labor Costs</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {laborCosts.map((labor) => (
                  <div key={labor.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{labor.conditionType}</p>
                      <p className="text-sm text-gray-600">{labor.description}</p>
                      <p className="text-sm text-gray-600">
                        {labor.quantity} {labor.ratePerSquare ? 'squares' : 'linear feet'} × ${(labor.ratePerSquare || labor.ratePerLinearFoot || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">${labor.totalCost.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                  <p className="text-lg font-semibold text-gray-900">Total Labor</p>
                  <p className="text-lg font-semibold text-gray-900">
                    ${totalCosts.totalLaborCost.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-8">
          <div className="p-6">
            <div className="flex items-center mb-4">
              <Calculator className="h-5 w-5 text-green-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Cost Summary</h2>
            </div>
              <div className={`grid grid-cols-1 ${String(estimate?.notes || '').toLowerCase().includes('financed') ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6`}>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Materials</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${totalCosts.totalMaterialCost.toFixed(2)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Labor</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${totalCosts.totalLaborCost.toFixed(2)}
                </p>
              </div>
                {String(estimate?.notes || '').toLowerCase().includes('financed') && (
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Loan Origination Fee</p>
                    <p className="text-2xl font-bold text-gray-900">$500.00</p>
                  </div>
                )}
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Total with Contribution</p>
                <p className="text-3xl font-bold text-green-600">
                  ${totalCosts.totalCost.toFixed(2)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {Math.round(contributionPct * 100)}% contribution margin
                </p>
              </div>
            </div>
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">
                Materials + Labor + Material Sales Tax (8%): ${((totalCosts as any).materialTax || 0).toFixed(2)} • Subtotal: ${totalCosts.subtotal.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
