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
  const effectiveSquares = Math.max(0, measurements.roofAreaRounded ?? Math.ceil(measurements.roofArea))
  
  rules.forEach(rule => {
    let quantity = 0
    
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
      case 'roof_area_sq / 10':
        quantity = Math.ceil(effectiveSquares / 10)
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
    
    materials.push({
      id: rule.id,
      itemName: rule.materialName,
      unitOfMeasure: rule.unitOfMeasure,
      pricePerUnit: 0, // Will be populated from material prices
      category: rule.category,
      quantity,
      totalCost: 0 // Will be calculated after prices are applied
    })
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
  
  // Base installation cost
  const baseInstall = laborRates.find(rate => rate.conditionType === 'Standard Install')
  if (baseInstall) {
    laborItems.push({
      id: baseInstall.id,
      conditionType: baseInstall.conditionType,
      description: baseInstall.description,
      ratePerSquare: baseInstall.ratePerSquare,
      ratePerLinearFoot: baseInstall.ratePerLinearFoot,
      quantity: measurements.roofArea,
      totalCost: measurements.roofArea * (baseInstall.ratePerSquare || 0)
    })
  }
  
  // Story-based upcharges
  if (measurements.stories >= 2) {
    const secondStory = laborRates.find(rate => rate.conditionType === 'Second Story')
    if (secondStory) {
      laborItems.push({
        id: secondStory.id,
        conditionType: secondStory.conditionType,
        description: secondStory.description,
        ratePerSquare: secondStory.ratePerSquare,
        ratePerLinearFoot: secondStory.ratePerLinearFoot,
        quantity: measurements.roofArea,
        totalCost: measurements.roofArea * (secondStory.ratePerSquare || 0)
      })
    }
  }
  
  if (measurements.stories >= 3) {
    const thirdStory = laborRates.find(rate => rate.conditionType === 'Third Story')
    if (thirdStory) {
      laborItems.push({
        id: thirdStory.id,
        conditionType: thirdStory.conditionType,
        description: thirdStory.description,
        ratePerSquare: thirdStory.ratePerSquare,
        ratePerLinearFoot: thirdStory.ratePerLinearFoot,
        quantity: measurements.roofArea,
        totalCost: measurements.roofArea * (thirdStory.ratePerSquare || 0)
      })
    }
  }
  
  // Pitch-based upcharges
  const pitchUpcharges = [
    { min: 8/12, max: 9/12, type: 'High Pitch 8/12' },
    { min: 9/12, max: 10/12, type: 'High Pitch 9/12' },
    { min: 10/12, max: 11/12, type: 'High Pitch 10/12' },
    { min: 11/12, max: 12/12, type: 'High Pitch 11/12' },
    { min: 12/12, max: 100, type: 'High Pitch 12/12+' }
  ]
  
  for (const upcharge of pitchUpcharges) {
    if (measurements.pitch >= upcharge.min && measurements.pitch < upcharge.max) {
      const rate = laborRates.find(rate => rate.conditionType === upcharge.type)
      if (rate) {
        laborItems.push({
          id: rate.id,
          conditionType: rate.conditionType,
          description: rate.description,
          ratePerSquare: rate.ratePerSquare,
          ratePerLinearFoot: rate.ratePerLinearFoot,
          quantity: measurements.roofArea,
          totalCost: measurements.roofArea * (rate.ratePerSquare || 0)
        })
      }
      break
    }
  }
  
  // Other conditions
  if (!measurements.hasTrailerAccess) {
    const noTrailer = laborRates.find(rate => rate.conditionType === 'No Trailer Access')
    if (noTrailer) {
      laborItems.push({
        id: noTrailer.id,
        conditionType: noTrailer.conditionType,
        description: noTrailer.description,
        ratePerSquare: noTrailer.ratePerSquare,
        ratePerLinearFoot: noTrailer.ratePerLinearFoot,
        quantity: measurements.roofArea,
        totalCost: measurements.roofArea * (noTrailer.ratePerSquare || 0)
      })
    }
  }
  
  if (measurements.hasSecondLayer) {
    const secondLayer = laborRates.find(rate => rate.conditionType === '2nd Layer')
    if (secondLayer) {
      laborItems.push({
        id: secondLayer.id,
        conditionType: secondLayer.conditionType,
        description: secondLayer.description,
        ratePerSquare: secondLayer.ratePerSquare,
        ratePerLinearFoot: secondLayer.ratePerLinearFoot,
        quantity: measurements.roofArea,
        totalCost: measurements.roofArea * (secondLayer.ratePerSquare || 0)
      })
    }
  }
  
  // Ridge vent installation
  const ridgeVent = laborRates.find(rate => rate.conditionType === 'Ridge Vent Install')
  if (ridgeVent && measurements.ridgesLength > 0) {
    laborItems.push({
      id: ridgeVent.id,
      conditionType: ridgeVent.conditionType,
      description: ridgeVent.description,
      ratePerSquare: ridgeVent.ratePerSquare,
      ratePerLinearFoot: ridgeVent.ratePerLinearFoot,
      quantity: measurements.ridgesLength,
      totalCost: measurements.ridgesLength * (ridgeVent.ratePerLinearFoot || 0)
    })
  }
  
  return laborItems
}

export function calculateTotalCosts(
  materials: MaterialItem[],
  labor: LaborItem[],
  profitMargin: number = 0.20
) {
  const totalMaterialCost = materials.reduce((sum, item) => sum + item.totalCost, 0)
  const totalLaborCost = labor.reduce((sum, item) => sum + item.totalCost, 0)
  const subtotal = totalMaterialCost + totalLaborCost
  const profit = subtotal * profitMargin
  const totalCost = subtotal + profit
  
  return {
    totalMaterialCost,
    totalLaborCost,
    subtotal,
    profit,
    totalCost,
    profitMargin
  }
}
