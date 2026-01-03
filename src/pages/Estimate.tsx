import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Mail, Calculator, Building, DollarSign, HardHat } from 'lucide-react'
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
    profitMargin: 0.20
  })

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
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('You must be logged in to view estimates')
      }

      const response = await fetch(`${apiBase()}/api/estimates/${id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load estimate')
      }

      const result = await response.json()
      setEstimate(result.estimate)
      const savedCM = result.estimate.profit_margin ?? 0.40
      const clamped = Math.min(0.60, Math.max(0.35, savedCM))
      setContributionPct(clamped)
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
      const materialsWithPrices = applyMaterialPrices(materials, priceData)
      setMaterialCosts(materialsWithPrices)

      // Calculate labor costs
      const labor = calculateLaborCosts(estimate.roof_measurements, laborData)
      setLaborCosts(labor)

      // Calculate total costs
      const x = 0.88 - contributionPct
      const totals = calculateTotalCosts(materialsWithPrices, labor, x)
      setTotalCosts(totals)

      // Update estimate with calculated costs
      const updatedEstimate = {
        ...estimate,
        material_costs: materialsWithPrices,
        labor_costs: labor,
        total_material_cost: totals.totalMaterialCost,
        total_labor_cost: totals.totalLaborCost,
        total_cost: totals.totalCost,
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
    // TODO: Implement PDF export
    alert('PDF export will be implemented soon!')
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
                        {material.quantity} {material.unitOfMeasure} × ${material.pricePerUnit.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">${material.totalCost.toFixed(2)}</p>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          </div>
        </div>
      </div>
    </div>
  )
}
