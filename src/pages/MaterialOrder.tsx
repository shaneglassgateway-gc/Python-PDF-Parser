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
  const [accessories, setAccessories] = useState({
    turtleVentsEnabled: false,
    turtleVentsQty: 0,
    baseFlashingEnabled: false,
    baseFlashingQty: 0,
    chimneyKitEnabled: false,
    chimneyKitQty: 0,
    multicapEnabled: false,
    multicapQty: 0,
    leadBootQty: { '1.5"': 0, '2"': 0, '3"': 0, '4"': 0, '5"': 0 },
  })
  const LEAD_BOOT_SPECS: Record<string, { label: string; price: number }> = {
    '1.5"': { label: '1-1/2"', price: 23.29 },
    '2"': { label: '2"', price: 27.37 },
    '3"': { label: '3"', price: 28.91 },
    '4"': { label: '4"', price: 31.54 },
    '5"': { label: '5"', price: 64.81 },
  }
  const incQty = (key: keyof typeof accessories) => {
    setAccessories(p => {
      const next: any = { ...p, [key]: Math.max(0, (p as any)[key] + 1) }
      if (key === 'turtleVentsQty') next.turtleVentsEnabled = true
      if (key === 'baseFlashingQty') next.baseFlashingEnabled = true
      if (key === 'chimneyKitQty') next.chimneyKitEnabled = true
      if (key === 'multicapQty') next.multicapEnabled = true
      return next
    })
  }
  const decQty = (key: keyof typeof accessories) => {
    setAccessories(p => ({ ...p, [key]: Math.max(0, (p as any)[key] - 1) }))
  }
  const setQtySanitized = (key: keyof typeof accessories, value: string) => {
    const digits = value.replace(/\D/g, '')
    const num = digits === '' ? 0 : Math.max(0, parseInt(digits, 10))
    setAccessories(p => ({ ...p, [key]: num }))
  }
  const incLead = (size: keyof typeof accessories.leadBootQty) => {
    setAccessories(p => ({ ...p, leadBootQty: { ...p.leadBootQty, [size]: (p.leadBootQty[size] + 1) } }))
  }
  const decLead = (size: keyof typeof accessories.leadBootQty) => {
    setAccessories(p => ({ ...p, leadBootQty: { ...p.leadBootQty, [size]: Math.max(0, p.leadBootQty[size] - 1) } }))
  }
  const setLeadQty = (size: keyof typeof accessories.leadBootQty, value: string) => {
    const digits = value.replace(/\D/g, '')
    const num = digits === '' ? 0 : Math.max(0, parseInt(digits, 10))
    setAccessories(p => ({ ...p, leadBootQty: { ...p.leadBootQty, [size]: num } }))
  }
  const SHINGLE_COLORS = [
    'Rustic Black',
    'Rustic Hickory',
    'Natural Timber',
    'Weathered wood',
    'Oxford Grey',
    'Virginia Slate',
    'Rustic Evergreen',
    'Thunderstorm Grey',
    'Old English Pewter',
    'Autumn Brown',
    'Mountain Slate',
    'Shadow Grey',
    'Rustic Slate',
    'Black Walnut',
    'Painted Desert',
    'Antique Slate',
    'Rustic Cedar',
  ]
  const DRIP_EDGE_COLORS = [
    'Teritone',
    'Brown',
    'Black',
    'Almond',
    'Clay',
    'White',
  ]
  const TURTLE_VENT_COLORS = [
    'Black',
    'Mill Finish',
    'Weathered Bronze',
    'White',
    'Brown',
  ]
  const BASE_FLASHING_COLORS = [
    'Brown',
    'Mill Finish',
    'Grey',
    'Black',
  ]

  useEffect(() => {
    fetch(`${apiBase()}/api/estimates/material-prices`).then(r=>r.json()).then(j=>{
      const rows = j.materialPrices || []
      const mapped = rows.map((p: any) => ({
        itemName: p.item_name ?? p.itemName,
        pricePerUnit: p.price_per_unit ?? p.pricePerUnit,
        unitOfMeasure: p.unit_of_measure ?? p.unitOfMeasure,
        category: p.category,
      }))
      setPrices(mapped)
    }).catch(()=>{})
    fetch(`${apiBase()}/api/estimates/material-order-rules`).then(r=>r.json()).then(j=>{
      const rows = j.materialOrderRules || []
      const mapped = rows.map((rule: any) => ({
        id: rule.id,
        materialName: rule.material_name ?? rule.materialName,
        unitOfMeasure: rule.unit_of_measure ?? rule.unitOfMeasure,
        quantityFormula: rule.quantity_formula ?? rule.quantityFormula,
        description: rule.description,
        category: rule.category,
      }))
      setRules(mapped)
    }).catch(()=>{})
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
    try {
      const parsed = data || {}
      const hasStructs = Array.isArray((parsed as any)?.structures) && (parsed as any).structures.length > 0
      const measRaw = includeDetached && hasStructs ? getCombinedMeasurements(parsed) : getStructure1Measurements(parsed)
      if (!measRaw) {
        const roof = (parsed as any)?.roof_measurements || {}
        return {
          roofArea: ((parseFloat(roof?.total_area_sqft || 0))/100)||0,
          roofAreaRounded: Math.ceil(((parseFloat(roof?.total_area_sqft || 0))/100)||0),
          eavesLength: parseFloat(roof?.eaves_ft || 0) || 0,
          rakesLength: parseFloat(roof?.rakes_ft || 0) || 0,
          valleysLength: parseFloat(roof?.valleys_ft || 0) || 0,
          hipsLength: parseFloat(roof?.hips_ft || 0) || 0,
          ridgesLength: parseFloat(roof?.ridges_ft || 0) || 0,
          pitch: 0,
          stories: 1,
          hasTrailerAccess: false,
          hasSecondLayer: false,
          lowPitchArea: 0,
          hasRidgeVent: false,
          pitchBreakdown: [],
        }
      }
      return {
        roofArea: ((Number((measRaw as any)?.total_area_sqft ?? 0))/100)||0,
        roofAreaRounded: Math.ceil(Number((measRaw as any)?.suggested_squares ?? 0)) || Math.ceil(((Number((measRaw as any)?.total_area_sqft ?? 0))/100)||0),
        eavesLength: Number((measRaw as any)?.eaves_ft ?? 0) || 0,
        rakesLength: Number((measRaw as any)?.rakes_ft ?? 0) || 0,
        valleysLength: Number((measRaw as any)?.valleys_ft ?? 0) || 0,
        hipsLength: Number((measRaw as any)?.hips_ft ?? 0) || 0,
        ridgesLength: Number((measRaw as any)?.ridges_ft ?? 0) || 0,
        pitch: 0,
        stories: 1,
        hasTrailerAccess: false,
        hasSecondLayer: false,
        lowPitchArea: 0,
        hasRidgeVent: false,
        pitchBreakdown: (((measRaw as any)?.pitch_breakdown || []) as any[]).map((p:any)=>({ pitch: String(p.pitch||''), squares: ((Number(p.area_sqft ?? 0))/100)||0 })),
      }
    } catch {
      return {
        roofArea: 0,
        roofAreaRounded: 0,
        eavesLength: 0,
        rakesLength: 0,
        valleysLength: 0,
        hipsLength: 0,
        ridgesLength: 0,
        pitch: 0,
        stories: 1,
        hasTrailerAccess: false,
        hasSecondLayer: false,
        lowPitchArea: 0,
        hasRidgeVent: false,
        pitchBreakdown: [],
      }
    }
  }

  const compute = () => {
    if (!data) return
    const m = buildMeasurements()
    const items = calculateMaterialQuantities(m, rules)
    const extras: MaterialItem[] = []
    ;(['1.5"','2"','3"','4"','5"'] as const).forEach(sz => {
      const qty = accessories.leadBootQty[sz]
      if (qty > 0) {
        const spec = LEAD_BOOT_SPECS[sz] || { label: sz, price: 0 }
        extras.push({
          id: `accessory-leadBoots-${spec.label}`,
          itemName: `Mayco Industries ${spec.label} Lead Boot with 12" x 12" x 14" Base`,
          unitOfMeasure: 'EA',
          pricePerUnit: spec.price,
          category: 'Accessories',
          quantity: qty,
          totalCost: 0,
        })
      }
    })
    if (accessories.baseFlashingQty > 0) {
      extras.push({
        id: 'accessory-baseFlashing',
        itemName: 'TRI-BUILT 4-N-1 Aluminum Base Flashing',
        unitOfMeasure: 'PC',
        pricePerUnit: 0,
        category: 'Accessories',
        quantity: accessories.baseFlashingQty,
        totalCost: 0,
      })
    }
    if (accessories.turtleVentsQty > 0) {
      extras.push({
        id: 'accessory-turtleVents',
        itemName: 'TRI-BUILT 750-S Aluminum Slant Back Roof Louver with Screen',
        unitOfMeasure: 'PC',
        pricePerUnit: 0,
        category: 'Accessories',
        quantity: accessories.turtleVentsQty,
        totalCost: 0,
      })
    }
    if (accessories.chimneyKitQty > 0) {
      extras.push({
        id: 'accessory-chimneyKit',
        itemName: 'FlashMaster 32" Chimney Flashing Kit',
        unitOfMeasure: 'EA',
        pricePerUnit: 0,
        category: 'Accessories',
        quantity: accessories.chimneyKitQty,
        totalCost: 0,
      })
    }
    if (accessories.multicapQty > 0) {
      extras.push({
        id: 'accessory-multicap',
        itemName: 'TRI-BUILT Multicap Vent Cap',
        unitOfMeasure: 'PC',
        pricePerUnit: 0,
        category: 'Accessories',
        quantity: accessories.multicapQty,
        totalCost: 0,
      })
    }
    const priced = applyMaterialPrices([...items, ...extras], prices)
    const norm = (s?: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/™|®|\.|,|"|'/g, '')
        .replace(/&/g, ' and ')
        .replace(/\s+/g, ' ')
        .trim()
    const priority = (name?: string) => {
      const n = norm(name)
      if (!n) return 999
      if (n.includes('shingle') && !n.includes('starter') && !n.includes('hip ridge')) return 1
      if (n.includes('hip ridge') || n.includes('hip and ridge')) return 2
      if (n.includes('ridge vent')) return 3
      if (n.includes('synthetic') && n.includes('underlayment')) return 4
      if (n.includes('starter')) return 5
      if (n.includes('roof edge') || n.includes('drip edge') || n.includes('style sr')) return 6
      if ((n.includes('ice') && n.includes('water')) || n.includes('ice water')) return 7
      if (n.includes('coil') && (n.includes('roofing') || n.includes('roof')) && n.includes('nail')) return 8
      if (n.includes('staple')) return 9
      if (n.includes('lead boot') || n.includes('pvc boot')) return 10
      if (n.includes('multicap') || (n.includes('vent') && n.includes('cap'))) return 11
      if (n.includes('elastomeric') || n.includes('sealant')) return 12
      if (n.includes('chimney') && n.includes('flashing')) return 13
      if (n.includes('750') || n.includes('slant back') || n.includes('roof louver')) return 14
      return 500
    }
    const sorted = [...priced].sort((a, b) => {
      const pa = priority(a.itemName)
      const pb = priority(b.itemName)
      if (pa !== pb) return pa - pb
      const na = norm(a.itemName)
      const nb = norm(b.itemName)
      return na.localeCompare(nb)
    })
    setMaterials(sorted)
    setColors(prev => {
      const next = { ...prev }
      priced.forEach(it => {
        if (isDripEdge(it.itemName) && !next[it.id]) {
          next[it.id] = 'White'
        }
        if (isChimneyKit(it.itemName)) {
          next[it.id] = 'Black'
        }
        if (isCaulkTube(it.itemName)) {
          next[it.id] = 'Clear Plastic Cartridge'
        }
      })
      return next
    })
  }

  useEffect(() => { if (data) compute() }, [data, includeDetached, rules, prices, accessories])

  const setColor = (id: string, value: string) => {
    setColors(p => ({ ...p, [id]: value }))
  }
  const norm = (s?: string) => String(s || '')
    .toLowerCase()
    .replace(/™|®|\.|,|"|'/g, '')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
  const needsColor = (name?: string) => {
    const n = norm(name)
    if (!n) return false
    if (n.includes('starter')) return false
    if (n.includes('shingle')) return true
    if (n.includes('hip ridge')) return true
    if (n.includes('hip and ridge')) return true
    if (n.includes('drip edge')) return true
    if (isDripEdge(name)) return true
    if (isTurtleVent(name)) return true
    if (isBaseFlashing(name)) return true
    if (isChimneyKit(name)) return true
    if (isCaulkTube(name)) return true
    return false
  }
  const isDripEdge = (name?: string) => {
    const n = norm(name)
    return n.includes('drip edge') || n.includes('roof edge') || n.includes('style sr') || n.includes('sr roof edge')
  }
  const isTurtleVent = (name?: string) => {
    const n = norm(name)
    return n.includes('750') || n.includes('slant back') || n.includes('roof louver') || n.includes('vent')
  }
  const isBaseFlashing = (name?: string) => {
    const n = norm(name)
    return n.includes('base flashing') || /4\s*-?\s*n\s*-?\s*1/.test(n) || n.includes('4n1')
  }
  const isChimneyKit = (name?: string) => norm(name).includes('chimney flashing kit')
  const isCaulkTube = (name?: string) => {
    const n = norm(name)
    return n.includes('caulk') || n.includes('cartridge') || n.includes('sealant') || n.includes('elastomeric')
  }
  const defaultColorFor = (name?: string) => {
    if (isDripEdge(name)) return 'White'
    if (isChimneyKit(name)) return 'Black'
    if (isCaulkTube(name)) return 'Clear Plastic Cartridge'
    return ''
  }
  const colorChoicesFor = (name?: string) => {
    if (isDripEdge(name)) return DRIP_EDGE_COLORS
    if (isBaseFlashing(name)) return BASE_FLASHING_COLORS
    if (isTurtleVent(name)) return TURTLE_VENT_COLORS
    return SHINGLE_COLORS
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

              {(() => {
                const m = buildMeasurements()
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm text-gray-700">
                    <div>Effective Squares: {Math.ceil(Number((m as any).roofAreaRounded ?? (m as any).roofArea ?? 0))}</div>
                    <div>Eaves+Rakes LF: {Number((m.eavesLength || 0) + (m.rakesLength || 0)).toFixed(0)}</div>
                    <div>Ridges+Hips LF: {Number((m.ridgesLength || 0) + (m.hipsLength || 0)).toFixed(0)}</div>
                  </div>
                )
              })()}

              <div className="mb-4">
                <h3 className="text-md font-semibold text-gray-900 mb-2">Roofing Accessories</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between border rounded-md p-3">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" checked={accessories.turtleVentsEnabled} onChange={(e)=>setAccessories(p=>({...p,turtleVentsEnabled:e.target.checked}))} />
                      <span>750 Turtle Vents</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <button type="button" onClick={()=>decQty('turtleVentsQty')} className="px-2 py-1 border border-gray-300 rounded">-</button>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={accessories.turtleVentsQty || ''} onChange={(e)=>setQtySanitized('turtleVentsQty', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right" />
                      <button type="button" onClick={()=>incQty('turtleVentsQty')} className="px-2 py-1 border border-gray-300 rounded">+</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border rounded-md p-3">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" checked={accessories.baseFlashingEnabled} onChange={(e)=>setAccessories(p=>({...p,baseFlashingEnabled:e.target.checked}))} />
                      <span>4-N-1 Base Flashing</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <button type="button" onClick={()=>decQty('baseFlashingQty')} className="px-2 py-1 border border-gray-300 rounded">-</button>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={accessories.baseFlashingQty || ''} onChange={(e)=>setQtySanitized('baseFlashingQty', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right" />
                      <button type="button" onClick={()=>incQty('baseFlashingQty')} className="px-2 py-1 border border-gray-300 rounded">+</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border rounded-md p-3">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" checked={accessories.chimneyKitEnabled} onChange={(e)=>setAccessories(p=>({...p,chimneyKitEnabled:e.target.checked}))} />
                      <span>Chimney Flashing Kits</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <button type="button" onClick={()=>decQty('chimneyKitQty')} className="px-2 py-1 border border-gray-300 rounded">-</button>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={accessories.chimneyKitQty || ''} onChange={(e)=>setQtySanitized('chimneyKitQty', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right" />
                      <button type="button" onClick={()=>incQty('chimneyKitQty')} className="px-2 py-1 border border-gray-300 rounded">+</button>
                    </div>
                  </div>

                  <div className="border rounded-md p-3">
                    <div className="font-medium mb-2">Lead Boots</div>
                    <div className="grid grid-cols-1 gap-3">
                      {(['1.5"','2"','3"','4"','5"'] as const).map(sz => (
                        <div key={sz} className="flex items-center justify-between">
                          <span>{sz}</span>
                          <div className="flex items-center space-x-2">
                            <button type="button" onClick={()=>decLead(sz)} className="px-2 py-1 border border-gray-300 rounded">-</button>
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={accessories.leadBootQty[sz] || ''} onChange={(e)=>setLeadQty(sz, e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right" />
                            <button type="button" onClick={()=>incLead(sz)} className="px-2 py-1 border border-gray-300 rounded">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between border rounded-md p-3">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" checked={accessories.multicapEnabled} onChange={(e)=>setAccessories(p=>({...p,multicapEnabled:e.target.checked}))} />
                      <span>Furnace Cap (Multicap Vent Cap)</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <button type="button" onClick={()=>decQty('multicapQty')} className="px-2 py-1 border border-gray-300 rounded">-</button>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={accessories.multicapQty || ''} onChange={(e)=>setQtySanitized('multicapQty', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded-md text-right" />
                      <button type="button" onClick={()=>incQty('multicapQty')} className="px-2 py-1 border border-gray-300 rounded">+</button>
                    </div>
                  </div>
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
                          {needsColor(item.itemName) ? (
                            isChimneyKit(item.itemName) || isCaulkTube(item.itemName) ? (
                              <span className="text-gray-700">{defaultColorFor(item.itemName)}</span>
                            ) : (
                              <select value={colors[item.id] ?? defaultColorFor(item.itemName)} onChange={(e)=>setColor(item.id, e.target.value)} className="border rounded px-2 py-1">
                                <option value="">Select Color</option>
                                {colorChoicesFor(item.itemName).map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            )
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
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
