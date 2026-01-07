export interface RoofMeasurements {
  roofArea: number // in squares (1 square = 100 sq ft)
  roofAreaRounded?: number // effective squares (suggested waste rounded up)
  eavesLength: number // in linear feet
  rakesLength: number // in linear feet
  valleysLength: number // in linear feet
  hipsLength: number // in linear feet
  ridgesLength: number // in linear feet
  pitch: number // pitch ratio (e.g., 6/12 = 0.5)
  stories: number
  hasTrailerAccess: boolean
  hasSecondLayer: boolean
  lowPitchArea: number // area with pitch ≤ 2/12
  hasRidgeVent?: boolean
  thirdStory?: boolean
  handLoadMaterials?: boolean
  pitchBreakdown?: Array<{ pitch: string; squares: number }>
}

export interface MaterialItem {
  id: string
  itemName: string
  unitOfMeasure: string
  pricePerUnit: number
  category: string
  quantity: number
  totalCost: number
}

export interface LaborItem {
  id: string
  conditionType: string
  description: string
  ratePerSquare?: number
  ratePerLinearFoot?: number
  quantity: number
  totalCost: number
}

export interface MaterialOrderRule {
  id: string
  materialName: string
  unitOfMeasure: string
  quantityFormula: string
  description: string
  category: string
}

export interface LaborRate {
  id: string
  conditionType: string
  description: string
  ratePerSquare?: number
  ratePerLinearFoot?: number
}

export function calculateMaterialQuantities(
  measurements: RoofMeasurements,
  rules: MaterialOrderRule[]
): MaterialItem[] {
  const materials: MaterialItem[] = []
  const effectiveSquares = Math.max(0, Math.ceil(measurements.roofAreaRounded ?? measurements.roofArea))
  
  rules.forEach(rule => {
    let quantity = 0
    const nameLower = String(rule.materialName || '').toLowerCase()
    const isRidgeVentMaterial = /\bridge\s*vent\b/.test(nameLower)
    if (isRidgeVentMaterial && !measurements.hasRidgeVent) {
      return
    }
    
    // Calculate quantity based on formula
    switch (rule.quantityFormula) {
      case 'roof_area_sq / 3':
        // Shingle bundles: 3 bundles per square, use suggested waste rounded
        quantity = Math.ceil(effectiveSquares * 3)
        break
      case 'hip_ridge_lf / 30':
        quantity = Math.ceil((measurements.hipsLength + measurements.ridgesLength) / 30)
        break
      case 'ridge_lf / 4':
        quantity = Math.ceil(measurements.ridgesLength / 4)
        break
      case 'roof_area_sq / 10':
        quantity = Math.ceil(effectiveSquares / 10)
        break
      case '(eaves_lf + rakes_lf) / 100':
        quantity = Math.ceil((measurements.eavesLength + measurements.rakesLength) / 100)
        break
      case '(eaves_lf + rakes_lf) / 10':
        quantity = Math.ceil((measurements.eavesLength + measurements.rakesLength) / 10 + 5)
        break
      case 'valleys_lf / 66':
        quantity = Math.ceil(measurements.valleysLength / 66)
        break
      case 'roof_area_sq / 15':
        quantity = Math.ceil(effectiveSquares / 15)
        break
      case 'low_pitch_area_sq':
        quantity = Math.ceil(measurements.lowPitchArea)
        break
      case 'low_pitch_area_sq / 2':
        quantity = Math.ceil(measurements.lowPitchArea / 2)
        break
      default:
        quantity = 0
    }
    
    if (quantity > 0) {
      materials.push({
        id: rule.id,
        itemName: rule.materialName,
        unitOfMeasure: rule.unitOfMeasure,
        pricePerUnit: 0,
        category: rule.category,
        quantity,
        totalCost: 0
      })
    }
  })
  
  return materials
}

export function applyMaterialPrices(
  materials: MaterialItem[],
  prices: Array<{ itemName: string; pricePerUnit: number; unitOfMeasure?: string; category?: string }>
): MaterialItem[] {
  const norm = (s?: string) =>
    String(s || '')
      .toLowerCase()
      .replace(/™|®|\\.|,/g, '')
      .replace(/&/g, ' and ')
      .replace(/hip\\s*and\\s*ridge|hip\\s*ridge/g, 'hip ridge')
      .replace(/drip\\s*edge/g, 'drip edge')
      .replace(/ice\\s*and\\s*water|ice\\s*water/g, 'ice water')
      .replace(/synthetic\\s*roofing\\s*underlayment/g, 'synthetic underlayment')
      .replace(/\\s+/g, ' ')
      .trim()
  const normUnit = (u?: string) => {
    const m = String(u || '').toLowerCase().trim()
    if (m === 'bdl') return 'bundle'
    if (m === 'rl') return 'roll'
    if (m === 'pc') return 'piece'
    if (m === 'ctn') return 'carton'
    if (m === 'bx') return 'box'
    if (m === 'tb') return 'tube'
    if (m === 'ea') return 'each'
    return m
  }
  return materials.map(material => {
    if ((material.pricePerUnit || 0) > 0) {
      const totalCost = material.quantity * material.pricePerUnit
      return { ...material, totalCost }
    }
    const mName = norm(material.itemName)
    const mUnit = normUnit(material.unitOfMeasure)
    const mCat = String(material.category || '').toLowerCase()
    let best: { pricePerUnit: number } | null = null
    let bestScore = -1
    for (const p of prices) {
      const pName = norm(p.itemName)
      const pUnit = normUnit(p.unitOfMeasure)
      const pCat = String(p.category || '').toLowerCase()
      let score = 0
      if (pName === mName) score = 3
      else if (pCat && mCat && pCat === mCat && pUnit === mUnit) score = 2
      else if (pName.includes(mName) || mName.includes(pName)) score = 1
      if (score > bestScore) {
        bestScore = score
        best = { pricePerUnit: p.pricePerUnit }
      }
    }
    const pricePerUnit = best?.pricePerUnit || 0
    const totalCost = material.quantity * pricePerUnit
    
    return {
      ...material,
      pricePerUnit,
      totalCost
    }
  })
}

export function calculateLaborCosts(
  measurements: RoofMeasurements,
  laborRates: LaborRate[]
): LaborItem[] {
  const laborItems: LaborItem[] = []
  const effectiveSquares = Math.max(0, measurements.roofAreaRounded ?? Math.ceil(measurements.roofArea))
  const defaults: Record<string, { ps?: number; plf?: number }> = {
    'Standard Install': { ps: 95 },
    'No Trailer Access': { ps: 20 },
    'Second Story': { ps: 10 },
    'Third Story': { ps: 40 },
    '2nd Layer': { ps: 15 },
    'Hand Load Materials': { ps: 10 },
    'High Pitch 8/12': { ps: 10 },
    'High Pitch 9/12': { ps: 15 },
    'High Pitch 10/12': { ps: 20 },
    'High Pitch 11/12': { ps: 25 },
    'High Pitch 12/12+': { ps: 30 },
    'Ridge Vent Install': { plf: 2 },
    'Mansard Install': { ps: 350 },
    'Excess Weight Dump Fee': { ps: 750 },
  }
  
  // Base installation cost
  const baseInstall = laborRates.find(rate => rate.conditionType === 'Standard Install')
  if (baseInstall) {
    const rps = defaults['Standard Install'].ps ?? baseInstall.ratePerSquare ?? 0
    laborItems.push({
      id: baseInstall.id,
      conditionType: baseInstall.conditionType,
      description: baseInstall.description,
      ratePerSquare: rps,
      ratePerLinearFoot: baseInstall.ratePerLinearFoot,
      quantity: effectiveSquares,
      totalCost: effectiveSquares * rps
    })
  }
  
  // Story-based upcharges
  if (measurements.thirdStory) {
    const thirdStory = laborRates.find(rate => rate.conditionType === 'Third Story')
    if (thirdStory) {
      const rps = defaults['Third Story'].ps ?? thirdStory.ratePerSquare ?? 0
      laborItems.push({
        id: thirdStory.id,
        conditionType: thirdStory.conditionType,
        description: thirdStory.description,
        ratePerSquare: rps,
        ratePerLinearFoot: thirdStory.ratePerLinearFoot,
        quantity: effectiveSquares,
        totalCost: effectiveSquares * rps
      })
    }
  } else if (measurements.stories >= 2) {
    const secondStory = laborRates.find(rate => rate.conditionType === 'Second Story')
    if (secondStory) {
      const rps = defaults['Second Story'].ps ?? secondStory.ratePerSquare ?? 0
      laborItems.push({
        id: secondStory.id,
        conditionType: secondStory.conditionType,
        description: secondStory.description,
        ratePerSquare: rps,
        ratePerLinearFoot: secondStory.ratePerLinearFoot,
        quantity: effectiveSquares,
        totalCost: effectiveSquares * rps
      })
    }
  }
  
  // Pitch-based upcharges
  const pitchUpcharges = [
    { label: '8/12', type: 'High Pitch 8/12' },
    { label: '9/12', type: 'High Pitch 9/12' },
    { label: '10/12', type: 'High Pitch 10/12' },
    { label: '11/12', type: 'High Pitch 11/12' },
    { label: '12/12+', type: 'High Pitch 12/12+' }
  ]
  const breakdown = measurements.pitchBreakdown || []
  for (const part of breakdown) {
    const match = pitchUpcharges.find(u => part.pitch.startsWith(u.label))
    if (!match) continue
    const rate = laborRates.find(rate => rate.conditionType === match.type)
    if (!rate) continue
    const sq = Math.max(0, part.squares || 0)
    const rps = defaults[match.type].ps ?? rate.ratePerSquare ?? 0
    laborItems.push({
      id: rate.id,
      conditionType: rate.conditionType,
      description: rate.description,
      ratePerSquare: rps,
      ratePerLinearFoot: rate.ratePerLinearFoot,
      quantity: sq,
      totalCost: sq * rps
    })
  }
  
  // Other conditions
  if (!measurements.hasTrailerAccess) {
    const noTrailer = laborRates.find(rate => rate.conditionType === 'No Trailer Access')
    if (noTrailer) {
      const rps = defaults['No Trailer Access'].ps ?? noTrailer.ratePerSquare ?? 0
      laborItems.push({
        id: noTrailer.id,
        conditionType: noTrailer.conditionType,
        description: noTrailer.description,
        ratePerSquare: rps,
        ratePerLinearFoot: noTrailer.ratePerLinearFoot,
        quantity: effectiveSquares,
        totalCost: effectiveSquares * rps
      })
    }
  }
  
  if (measurements.hasSecondLayer) {
    const secondLayer = laborRates.find(rate => rate.conditionType === '2nd Layer')
    if (secondLayer) {
      const rps = defaults['2nd Layer'].ps ?? secondLayer.ratePerSquare ?? 0
      laborItems.push({
        id: secondLayer.id,
        conditionType: secondLayer.conditionType,
        description: secondLayer.description,
        ratePerSquare: rps,
        ratePerLinearFoot: secondLayer.ratePerLinearFoot,
        quantity: effectiveSquares,
        totalCost: effectiveSquares * rps
      })
    }
  }
  
  // Ridge vent installation
  const ridgeVent = laborRates.find(rate => rate.conditionType === 'Ridge Vent Install')
  if (ridgeVent && measurements.hasRidgeVent && measurements.ridgesLength > 0) {
    const rlf = defaults['Ridge Vent Install'].plf ?? ridgeVent.ratePerLinearFoot ?? 0
    laborItems.push({
      id: ridgeVent.id,
      conditionType: ridgeVent.conditionType,
      description: ridgeVent.description,
      ratePerSquare: ridgeVent.ratePerSquare,
      ratePerLinearFoot: rlf,
      quantity: measurements.ridgesLength,
      totalCost: measurements.ridgesLength * rlf
    })
  }

  // Hand load materials
  const handLoad = laborRates.find(rate => rate.conditionType === 'Hand Load Materials')
  if (handLoad && measurements.handLoadMaterials) {
    const rps = defaults['Hand Load Materials'].ps ?? handLoad.ratePerSquare ?? 0
    laborItems.push({
      id: handLoad.id,
      conditionType: handLoad.conditionType,
      description: handLoad.description,
      ratePerSquare: rps,
      ratePerLinearFoot: handLoad.ratePerLinearFoot,
      quantity: effectiveSquares,
      totalCost: effectiveSquares * rps
    })
  }

  // Base dump fee
  const baseDump = laborRates.find(rate => rate.conditionType === 'Dump Fee')
  const baseFee = baseDump?.ratePerSquare || baseDump?.ratePerLinearFoot || 450
  laborItems.push({
    id: baseDump?.id || 'dump-fee-base',
    conditionType: 'Dump Fee',
    description: baseDump?.description || 'Standard Dump Fee',
    quantity: 1,
    totalCost: baseFee
  } as any)
  
  // Excess weight dump fee: +$750 at 30SQ and for every additional 30SQ
  const extraCount = Math.max(0, Math.floor(effectiveSquares / 30))
  if (extraCount > 0) {
    const dumpExtra = laborRates.find(rate => rate.conditionType === 'Excess Weight Dump Fee')
    const perOcc = dumpExtra?.ratePerSquare || dumpExtra?.ratePerLinearFoot || 750
    laborItems.push({
      id: dumpExtra?.id || 'dump-fee-extra',
      conditionType: 'Excess Weight Dump Fee',
      description: dumpExtra?.description || 'Excess Weight Dump Fee',
      quantity: extraCount,
      totalCost: extraCount * perOcc
    } as any)
  }
  
  return laborItems
}

export function calculateTotalCosts(
  materials: MaterialItem[],
  labor: LaborItem[],
  contributionX: number = 0.46
) {
  const totalMaterialCost = materials.reduce((sum, item) => sum + item.totalCost, 0)
  const totalLaborCost = labor.reduce((sum, item) => sum + item.totalCost, 0)
  const materialTax = totalMaterialCost * 0.08
  const subtotal = totalMaterialCost + materialTax + totalLaborCost
  const x = Math.max(0.26, Math.min(0.51, contributionX))
  const totalCost = x > 0 ? subtotal / x : subtotal
  const profit = totalCost - subtotal
  const profitMargin = (totalCost > 0) ? (profit / totalCost) : 0
  
  return {
    totalMaterialCost,
    totalLaborCost,
    materialTax,
    subtotal,
    profit,
    totalCost,
    profitMargin
  }
}
