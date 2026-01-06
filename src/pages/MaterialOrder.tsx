import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, CheckCircle, AlertCircle, Printer, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { apiBase } from '../lib/utils'
import { getStructure1Measurements, getCombinedMeasurements } from '../../eagleview-types'
import { calculateMaterialQuantities, applyMaterialPrices, MaterialItem, MaterialOrderRule } from '../utils/calculations'

export default function MaterialOrder() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [data, setData] = useState<any | null>(null)
  const [includeDetached, setIncludeDetached] = useState(false)
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [prices, setPrices] = useState<any[]>([])
  const [rules, setRules] = useState<MaterialOrderRule[]>([])
  const [colors, setColors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`${apiBase()}/api/estimates/material-prices`).then(r=>r.json()).then(j=>setPrices(j.materialPrices||[])).catch(()=>{})
    fetch(`${apiBase()}/api/estimates/material-order-rules`).then(r=>r.json()).then(j=>setRules(j.materialOrderRules||[])).catch(()=>{})
  }, [])

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = async (file: File) => {
    setError(null)
    setSuccess(false)
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await fetch(`${apiBase()}/api/estimates/parse-eagleview`, { method: 'POST', body: formData })
      const result = await resp.json()
      if (!resp.ok || !result?.success) {
        const msg = result?.error || 'Failed to parse EagleView file'
        const det = result?.detail ? `: ${result.detail}` : ''
        throw new Error(`${msg}${det}`)
      }
      setData(result.data)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setUploading(false)
    }
  }

  const buildMeasurements = () => {
    const meas = includeDetached ? getCombinedMeasurements(data) : getStructure1Measurements(data)
    return {
      roofArea: ((meas?.total_area_sqft || 0) / 100) || 0,
      roofAreaRounded: Math.ceil(((meas?.suggested_squares || 0))) || Math.ceil(((meas?.total_area_sqft || 0) / 100) || 0),
      eavesLength: meas?.eaves_ft || 0,
      rakesLength: meas?.rakes_ft || 0,
      valleysLength: meas?.valleys_ft || 0,
      hipsLength: meas?.hips_ft || 0,
      ridgesLength: meas?.ridges_ft || 0,
      pitch: 0,
      stories: 1,
      hasTrailerAccess: false,
      hasSecondLayer: false,
      lowPitchArea: 0,
      hasRidgeVent: false,
      pitchBreakdown: ((meas?.pitch_breakdown || []) as any[]).map(p => ({ pitch: String(p.pitch||''), squares: ((p.area_sqft||0)/100)||0 }))
    }
  }

  const compute = () => {
    if (!data) return
    const m = buildMeasurements()
    const items = calculateMaterialQuantities(m, rules)
    const priced = applyMaterialPrices(items, prices)
    setMaterials(priced)
  }

  useEffect(() => { if (data) compute() }, [data, includeDetached, rules, prices])

  const setColor = (id: string, value: string) => {
    setColors(p => ({ ...p, [id]: value }))
  }

  const onPrint = () => {
    window.print()
  }

  const onDownload = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">New Material Order</h1>
          <p className="text-gray-600">Upload an EagleView report to build a supplier-ready order</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload EagleView Report</h2>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileInput} className="hidden" disabled={uploading || parsing} />
              {uploading ? (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-600">Uploading and parsing EagleView file...</p>
                </div>
              ) : success ? (
                <div className="flex flex-col items-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mb-4" />
                  <p className="text-green-600 font-medium">EagleView file parsed successfully!</p>
                  {data && (
                    <div className="mt-4 text-sm text-gray-600">
                      {Array.isArray((data as any)?.structures) && (
                        <p>Structures detected: {(data as any).structures.length}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <UploadCloud className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">
                    Drag and drop your EagleView PDF here, or{' '}
                    <button onClick={() => fileInputRef.current?.click()} className="text-blue-600 hover:text-blue-700 font-medium" disabled={uploading || parsing}>
                      browse to select a file
                    </button>
                  </p>
                  <p className="text-sm text-gray-500">Maximum file size: 50MB</p>
                </div>
              )}
            </div>
            {error && (
              <div className="mt-4 flex items-center text-red-600">
                <AlertCircle className="h-4 w-4 mr-2" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>

          {data && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={includeDetached} onChange={(e)=>setIncludeDetached(e.target.checked)} />
                  <span>Include Detached Structure</span>
                </label>
                <div className="flex space-x-2">
                  <button onClick={onPrint} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center">
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </button>
                  <button onClick={onDownload} className="px-3 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Unit</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Price</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Total</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Color</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {materials.map(item => (
                      <tr key={item.id}>
                        <td className="px-4 py-2 text-sm text-gray-900">{item.itemName}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{item.unitOfMeasure}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{item.quantity}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">${item.pricePerUnit.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">${item.totalCost.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          <select value={colors[item.id] || ''} onChange={(e)=>setColor(item.id, e.target.value)} className="border rounded px-2 py-1">
                            <option value="">Select Color</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
