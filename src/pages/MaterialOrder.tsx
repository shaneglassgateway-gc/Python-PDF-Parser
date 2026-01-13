import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UploadCloud, CheckCircle, AlertCircle, Printer, Download } from 'lucide-react'
import jsPDF from 'jspdf'
import { supabase } from '../lib/supabase'
import { apiBase } from '../lib/utils'
import { getStructure1Measurements, getCombinedMeasurements } from '../../eagleview-types'
import { calculateMaterialQuantities, applyMaterialPrices, MaterialItem, MaterialOrderRule } from '../utils/calculations'

export default function MaterialOrder() {
  const navigate = useNavigate()
  const params = useParams()
  const id = params.id
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
  const [poName, setPoName] = useState('')
  const [poAddress, setPoAddress] = useState('')
  const pdfSectionRef = useRef<HTMLDivElement>(null)
  const [estimatorName, setEstimatorName] = useState('')
  const [estimatorEmail, setEstimatorEmail] = useState('')
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({})
  const [ridgeVentEnabled, setRidgeVentEnabled] = useState(false)
  const [loadedOrder, setLoadedOrder] = useState(false)
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

  useEffect(() => {
    const loadExistingOrder = async () => {
      if (!id) return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const resp = await fetch(`${apiBase()}/api/material-orders/${id}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
        if (!resp.ok) return
        const result = await resp.json()
        const order = result.materialOrder
        if (!order) return
        setPoName(order.po_name || '')
        setPoAddress(order.address || '')
        setEstimatorName(order.estimator_name || '')
        setEstimatorEmail(order.estimator_email || '')
        // normalize items array
        const itemsArr: any[] = Array.isArray(order.items) ? order.items : []
        // populate colors from saved items
        const colorMap: Record<string, string> = {}
        itemsArr.forEach((it: any) => {
          if (it.color) colorMap[it.id] = it.color
        })
        setColors(colorMap)
        // populate materials directly, preserving prices and totals
        setMaterials(itemsArr.map((it: any) => ({
          id: it.id,
          itemName: it.itemName,
          unitOfMeasure: it.unitOfMeasure,
          quantity: it.quantity,
          pricePerUnit: it.pricePerUnit,
          totalCost: it.totalCost,
          category: undefined
        })))
        // populate accessory quantities from items
        const acc = { ...accessories }
        const findItem = (pid: string) => itemsArr.find((x: any) => String(x.id).startsWith(pid))
        const tv = findItem('accessory-turtleVents')
        if (tv) { acc.turtleVentsEnabled = true; acc.turtleVentsQty = tv.quantity || 0 }
        const bf = findItem('accessory-baseFlashing')
        if (bf) { acc.baseFlashingEnabled = true; acc.baseFlashingQty = bf.quantity || 0 }
        const ck = findItem('accessory-chimneyKit')
        if (ck) { acc.chimneyKitEnabled = true; acc.chimneyKitQty = ck.quantity || 0 }
        const mc = findItem('accessory-multicap')
        if (mc) { acc.multicapEnabled = true; acc.multicapQty = mc.quantity || 0 }
        const leadSizes = Object.keys(acc.leadBootQty) as Array<keyof typeof acc.leadBootQty>
        leadSizes.forEach(sz => {
          const specLabel = (LEAD_BOOT_SPECS[sz]?.label || sz)
          const li = findItem(`accessory-leadBoots-${specLabel}`)
          acc.leadBootQty[sz] = li ? (li.quantity || 0) : 0
        })
        setAccessories(acc)
        // ensure UI shows the editing section
        setData({ property: { address: order.address || '' }, structures: [] })
        setSuccess(true)
        setLoadedOrder(true)
      } catch {}
    }
    loadExistingOrder()
  }, [id])

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
      const totalSq = ((Number((measRaw as any)?.total_area_sqft ?? 0))/100)||0
      const suggested = Number((measRaw as any)?.suggested_squares ?? 0)
      return {
        roofArea: totalSq,
        roofAreaRounded: suggested > 0 ? suggested : totalSq,
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
        hasRidgeVent: ridgeVentEnabled,
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
    const applied = priced.map(it => {
      const override = qtyOverrides[it.id]
      if (typeof override === 'number' && !Number.isNaN(override)) {
        const q = Math.max(0, override)
        return { ...it, quantity: q, totalCost: q * (it.pricePerUnit || 0) }
      }
      return it
    })
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
    const sorted = [...applied].sort((a, b) => {
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
        if (isRidgeVent(it.itemName)) {
          next[it.id] = 'Black'
        }
        if (isCaulkTube(it.itemName)) {
          next[it.id] = 'Clear Plastic Cartridge'
        }
      })
      return next
    })
  }

  useEffect(() => { if (data && !loadedOrder) compute() }, [data, includeDetached, rules, prices, accessories, qtyOverrides, ridgeVentEnabled, loadedOrder])
  useEffect(() => {
    if (data) {
      const addr = (data as any)?.property?.address || ''
      setPoAddress(prev => prev || addr)
    }
  }, [data])
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user as any
      const fn = user?.user_metadata?.first_name || ''
      const ln = user?.user_metadata?.last_name || ''
      const name = `${fn} ${ln}`.trim() || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.display_name || ''
      const email = user?.email || ''
      setEstimatorName(name || '')
      setEstimatorEmail(email || '')
    })
  }, [])

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
    if (isMulticap(name)) return false
    if (n.includes('shingle')) return true
    if (n.includes('hip ridge')) return true
    if (n.includes('hip and ridge')) return true
    if (n.includes('drip edge')) return true
    if (isRidgeVent(name)) return true
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
  const isRidgeVent = (name?: string) => {
    const n = norm(name)
    return n.includes('ridge vent')
  }
  const isTurtleVent = (name?: string) => {
    const n = norm(name)
    return n.includes('750') || n.includes('slant back') || n.includes('roof louver') || n.includes('vent')
  }
  const isBaseFlashing = (name?: string) => {
    const n = norm(name)
    return n.includes('base flashing') || /4\s*-?\s*n\s*-?\s*1/.test(n) || n.includes('4n1')
  }
  const isMulticap = (name?: string) => {
    const n = norm(name)
    return n.includes('multicap') || (n.includes('furnace') && n.includes('cap')) || (n.includes('vent') && n.includes('cap'))
  }
  const isChimneyKit = (name?: string) => norm(name).includes('chimney flashing kit')
  const isCaulkTube = (name?: string) => {
    const n = norm(name)
    return n.includes('caulk') || n.includes('cartridge') || n.includes('sealant') || n.includes('elastomeric')
  }
  const defaultColorFor = (name?: string) => {
    if (isDripEdge(name)) return 'White'
    if (isChimneyKit(name)) return 'Black'
    if (isRidgeVent(name)) return 'Black'
    if (isCaulkTube(name)) return 'Clear Plastic Cartridge'
    return ''
  }
  const colorChoicesFor = (name?: string) => {
    if (isDripEdge(name)) return DRIP_EDGE_COLORS
    if (isBaseFlashing(name)) return BASE_FLASHING_COLORS
    if (isTurtleVent(name)) return TURTLE_VENT_COLORS
    return SHINGLE_COLORS
  }
  const isAccessoryId = (id?: string) => String(id || '').startsWith('accessory-')
  const setRowQty = (id: string, value: string) => {
    const num = Math.max(0, parseInt(value.replace(/\D/g, ''), 10) || 0)
    setQtyOverrides(p => ({ ...p, [id]: num }))
  }

  const onPrint = () => {
    window.print()
  }

  const onDownload = () => {
    generatePdf()
  }
  const saveOrder = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const total_cost = materials.reduce((sum, it) => sum + ((qtyOverrides[it.id] ?? it.quantity) * (it.pricePerUnit || 0)), 0)
      const payload = {
        po_name: poName,
        address: poAddress,
        estimator_name: estimatorName,
        estimator_email: estimatorEmail,
        items: materials.map(it => ({
          id: it.id,
          itemName: it.itemName,
          unitOfMeasure: it.unitOfMeasure,
          quantity: qtyOverrides[it.id] ?? it.quantity,
          pricePerUnit: it.pricePerUnit,
          totalCost: (qtyOverrides[it.id] ?? it.quantity) * (it.pricePerUnit || 0),
          color: needsColor(it.itemName) ? (isChimneyKit(it.itemName) || isCaulkTube(it.itemName) ? defaultColorFor(it.itemName) : (colors[it.id] ?? defaultColorFor(it.itemName))) : null,
        })),
        total_cost
      }
      const url = id ? `${apiBase()}/api/material-orders/${id}` : `${apiBase()}/api/material-orders`
      const method = id ? 'PATCH' : 'POST'
      const resp = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      })
      if (!resp.ok) throw new Error('Failed to save material order')
      const result = await resp.json()
      const saved = result.materialOrder
      if (!id && saved?.id) {
        navigate(`/material-order/${saved.id}`, { replace: true })
      }
    } catch {}
  }
  const generatePdf = async () => {
    await saveOrder()
    const pdf = new jsPDF('p', 'pt', 'a4')
    const marginLeft = 40
    const marginTop = 40
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const fmtMoney = (n?: number) => `$${Number(n || 0).toFixed(2)}`
    const availableWidth = pageWidth - marginLeft * 2
    const proportions = [0.36, 0.1, 0.1, 0.14, 0.14, 0.16] // name, unit, qty, price, total, color
    const colXs: number[] = []
    const colWs: number[] = []
    let accX = marginLeft
    proportions.forEach(p => {
      const w = Math.floor(availableWidth * p)
      colXs.push(accX)
      colWs.push(w)
      accX += w
    })

    const headerHeight = 28
    const baseRowHeight = 24
    const headerTop = marginTop + 130
    const lineHeight = 14
    const topPad = 10
    const bottomPad = 10
    const tableStartY = headerTop + headerHeight + 1
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
    const logoData = await loadLogo()
    if (logoData) {
      const logoW = 96
      const logoH = 96
      pdf.addImage(logoData, 'PNG', pageWidth - marginLeft - logoW, marginTop - 6, logoW, logoH)
    }
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`PO Name: ${poName || ''}`, marginLeft, marginTop + 6)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Address: ${poAddress || ''}`, marginLeft, marginTop + 24)
    pdf.text(`Account # 597478`, marginLeft, marginTop + 40)
    pdf.text(`Estimator: ${estimatorName || ''}`, marginLeft, marginTop + 56)
    pdf.text(`Estimator Email: ${estimatorEmail || ''}`, marginLeft, marginTop + 72)
    const drawHeader = () => {
      pdf.setFillColor(240, 240, 240)
      pdf.rect(marginLeft, headerTop, availableWidth, headerHeight, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      const headers = ['Name', 'Unit', 'Quantity', 'Price', 'Total', 'Color']
      headers.forEach((h, i) => {
        pdf.text(h, colXs[i] + 6, headerTop + 18)
      })
      // column lines
      pdf.setDrawColor(200, 200, 200)
      for (let i = 0; i < colXs.length; i++) {
        pdf.line(colXs[i], headerTop, colXs[i], headerTop + headerHeight)
      }
      // right boundary
      pdf.line(marginLeft + availableWidth, headerTop, marginLeft + availableWidth, headerTop + headerHeight)
      // bottom line
      pdf.line(marginLeft, headerTop + headerHeight, marginLeft + availableWidth, headerTop + headerHeight)
    }
    const drawRow = (rowTop: number, item: MaterialItem) => {
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      const nameCellWidth = colWs[0] - 12
      const nameLines = pdf.splitTextToSize(String(item.itemName), nameCellWidth)
      const colorCellWidth = colWs[5] - 12
      const colorText = needsColor(item.itemName)
        ? (isChimneyKit(item.itemName) || isCaulkTube(item.itemName)
            ? defaultColorFor(item.itemName)
            : (colors[item.id] ?? defaultColorFor(item.itemName)))
        : '—'
      const colorLines = pdf.splitTextToSize(String(colorText || ''), colorCellWidth)
      const nameLinesCount = Array.isArray(nameLines) ? nameLines.length : 1
      const colorLinesCount = Array.isArray(colorLines) ? colorLines.length : 1
      const linesCount = Math.max(nameLinesCount, colorLinesCount)
      const rowH = Math.max(baseRowHeight, topPad + linesCount * lineHeight + bottomPad)
      // vertical lines for the row
      pdf.setDrawColor(220, 220, 220)
      for (let i = 0; i < colXs.length; i++) {
        pdf.line(colXs[i], rowTop, colXs[i], rowTop + rowH)
      }
      pdf.line(marginLeft + availableWidth, rowTop, marginLeft + availableWidth, rowTop + rowH)
      // top separator for row
      pdf.line(marginLeft, rowTop, marginLeft + availableWidth, rowTop)
      // text with controlled spacing
      let yText = rowTop + topPad
      const renderLines = (lines: string | string[], x: number) => {
        const arr = Array.isArray(lines) ? lines : [String(lines)]
        let yy = yText
        for (const ln of arr) {
          pdf.text(String(ln), x, yy)
          yy += lineHeight
        }
      }
      renderLines(nameLines, colXs[0] + 6)
      pdf.text(String(item.unitOfMeasure || ''), colXs[1] + 6, yText)
      pdf.text(String(item.quantity ?? 0), colXs[2] + 6, yText)
      pdf.text(fmtMoney(item.pricePerUnit), colXs[3] + 6, yText)
      pdf.text(fmtMoney(item.totalCost), colXs[4] + 6, yText)
      renderLines(colorLines, colXs[5] + 6)
      // bottom separator
      pdf.line(marginLeft, rowTop + rowH, marginLeft + availableWidth, rowTop + rowH)
      return rowH
    }
    drawHeader()
    let y = tableStartY
    for (const item of materials) {
      // Precompute row height for pagination check
      const nameCellWidth = colWs[0] - 12
      const colorCellWidth = colWs[5] - 12
      const nameLines = pdf.splitTextToSize(String(item.itemName), nameCellWidth)
      const colorText = needsColor(item.itemName)
        ? (isChimneyKit(item.itemName) || isCaulkTube(item.itemName)
            ? defaultColorFor(item.itemName)
            : (colors[item.id] ?? defaultColorFor(item.itemName)))
        : '—'
      const colorLines = pdf.splitTextToSize(String(colorText || ''), colorCellWidth)
      const nameLinesCount = Array.isArray(nameLines) ? nameLines.length : 1
      const colorLinesCount = Array.isArray(colorLines) ? colorLines.length : 1
      const neededH = Math.max(baseRowHeight, topPad + Math.max(nameLinesCount, colorLinesCount) * lineHeight + bottomPad)
      if (y + neededH + 16 > pageHeight - marginTop) {
        pdf.addPage()
        if (logoData) {
          const logoW = 96
          const logoH = 96
          pdf.addImage(logoData, 'PNG', pageWidth - marginLeft - logoW, marginTop - 6, logoW, logoH)
        }
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'bold')
        pdf.text(`PO Name: ${poName || ''}`, marginLeft, marginTop + 6)
        pdf.setFont('helvetica', 'normal')
        pdf.text(`Address: ${poAddress || ''}`, marginLeft, marginTop + 24)
        drawHeader()
        y = tableStartY
      }
      const h = drawRow(y, item)
      y += h
    }
    const fileSafeName = (poName || 'Material_Order').replace(/[^a-z0-9_\-]+/gi, '_')
    pdf.save(`${fileSafeName}.pdf`)
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
                  <button onClick={saveOrder} className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center">
                    Save
                  </button>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PO Name</label>
                  <input type="text" value={poName} onChange={(e)=>setPoName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input type="text" value={poAddress} onChange={(e)=>setPoAddress(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
              </div>
              <div ref={pdfSectionRef}>
                {(() => {
                  const m = buildMeasurements()
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm text-gray-700">
                      <div>Effective Squares: {Math.ceil(((m as any).roofAreaRounded > 0 ? (m as any).roofAreaRounded : (m as any).roofArea) || 0)}</div>
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
                      <input type="checkbox" checked={ridgeVentEnabled} onChange={(e)=>setRidgeVentEnabled(e.target.checked)} />
                      <span>Ridge Vent</span>
                    </label>
                    <div className="text-sm text-gray-600">
                      {ridgeVentEnabled ? 'Enabled' : 'Disabled'}
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
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {isAccessoryId(item.id) ? (
                            <span>{item.quantity}</span>
                          ) : (
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={(qtyOverrides[item.id] ?? item.quantity) || 0}
                              onChange={(e)=>setRowQty(item.id, e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-right"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">${item.pricePerUnit.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          ${((qtyOverrides[item.id] ?? item.quantity) * item.pricePerUnit).toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {needsColor(item.itemName) ? (
                            isChimneyKit(item.itemName) || isCaulkTube(item.itemName) || isRidgeVent(item.itemName) ? (
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
              <div className="mt-4 flex justify-end">
                <button onClick={generatePdf} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Generate Material Order</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
