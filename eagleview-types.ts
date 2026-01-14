/**
 * TypeScript interfaces for EagleView Parser2 output
 * Use these in your estimates.ts and Upload.tsx
 */

// ============================================
// INTERFACES
// ============================================

export interface EagleViewWaste {
  waste_percent: number;
  area_sqft: number;
  squares: number;
  is_suggested: boolean;
}

export interface EagleViewPitch {
  pitch: string;
  area_sqft: number;
  percent_of_roof: number;
}

export interface EagleViewStructureMeasurements {
  ridges_ft: number;
  hips_ft: number;
  valleys_ft: number;
  rakes_ft: number;
  eaves_ft: number;
  flashing_ft: number;
  step_flashing_ft: number;
  drip_edge_ft: number;
}

export interface EagleViewStructure {
  structure_number: number;
  total_area_sqft: number;
  total_facets: number;
  predominant_pitch: string;
  complexity: string | null;
  measurements: EagleViewStructureMeasurements;  // <-- NESTED!
  pitch_breakdown: EagleViewPitch[];
  suggested_waste: EagleViewWaste | null;
  all_waste_calculations: EagleViewWaste[];
}

export interface EagleViewRoofMeasurements {
  total_area_sqft: number;
  total_facets: number;
  predominant_pitch: string;
  num_stories: string;
  ridges_ft: number;
  hips_ft: number;
  valleys_ft: number;
  rakes_ft: number;
  eaves_ft: number;
  flashing_ft: number;
  step_flashing_ft: number;
  drip_edge_ft: number;
  estimated_attic_sqft: number;
}

export interface EagleViewParserOutput {
  property: {
    address: string;
    latitude: number | null;
    longitude: number | null;
  };
  report_info: {
    report_number: string;
    report_date: string;
    prepared_for_contact: string;
    prepared_for_company: string;
  };
  roof_measurements: EagleViewRoofMeasurements;  // Combined totals
  wall_measurements: any | null;
  pitch_breakdown: EagleViewPitch[];
  suggested_waste: EagleViewWaste | null;
  all_waste_calculations: EagleViewWaste[];
  windows_doors: any[];
  structures: EagleViewStructure[];  // Individual structures (empty for single-structure reports)
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if report has multiple structures
 */
export function hasMultipleStructures(data: EagleViewParserOutput): boolean {
  return data.structures && data.structures.length > 1;
}

/**
 * Get Structure 1 measurements (main house)
 */
export function getStructure1(data: EagleViewParserOutput): EagleViewStructure | null {
  if (data.structures && data.structures.length > 0) {
    return data.structures.find(s => s.structure_number === 1) || data.structures[0];
  }
  return null;
}

/**
 * Get Structure 2 measurements (detached structure)
 */
export function getStructure2(data: EagleViewParserOutput): EagleViewStructure | null {
  if (data.structures && data.structures.length > 1) {
    return data.structures.find(s => s.structure_number === 2) || data.structures[1];
  }
  return null;
}
export function getStructure3(data: EagleViewParserOutput): EagleViewStructure | null {
  if (data.structures && data.structures.length > 2) {
    return data.structures.find(s => s.structure_number === 3) || data.structures[2];
  }
  return null;
}

/**
 * Get roof measurements for Structure 1 only
 * Use this when "Include Detached Structure" is OFF
 */
export function getStructure1Measurements(data: EagleViewParserOutput) {
  const s1 = getStructure1(data);
  
  if (!s1) {
    // Single structure report - use top-level measurements
    return {
      total_area_sqft: data.roof_measurements.total_area_sqft,
      ridges_ft: data.roof_measurements.ridges_ft,
      hips_ft: data.roof_measurements.hips_ft,
      valleys_ft: data.roof_measurements.valleys_ft,
      rakes_ft: data.roof_measurements.rakes_ft,
      eaves_ft: data.roof_measurements.eaves_ft,
      flashing_ft: data.roof_measurements.flashing_ft,
      step_flashing_ft: data.roof_measurements.step_flashing_ft,
      drip_edge_ft: data.roof_measurements.drip_edge_ft,
      predominant_pitch: data.roof_measurements.predominant_pitch,
      suggested_squares: data.suggested_waste?.squares || 0,
      pitch_breakdown: data.pitch_breakdown
    };
  }
  
  // Multi-structure report - return Structure 1 only
  return {
    total_area_sqft: s1.total_area_sqft,
    ridges_ft: s1.measurements.ridges_ft,      // <-- Access via .measurements
    hips_ft: s1.measurements.hips_ft,
    valleys_ft: s1.measurements.valleys_ft,
    rakes_ft: s1.measurements.rakes_ft,
    eaves_ft: s1.measurements.eaves_ft,
    flashing_ft: s1.measurements.flashing_ft,
    step_flashing_ft: s1.measurements.step_flashing_ft,
    drip_edge_ft: s1.measurements.drip_edge_ft,
    predominant_pitch: s1.predominant_pitch,
    suggested_squares: (s1.suggested_waste?.squares ?? data.suggested_waste?.squares ?? 0),
    pitch_breakdown: s1.pitch_breakdown
  };
}

/**
 * Get combined measurements for Structure 1 + Structure 2
 * Use this when "Include Detached Structure" is ON
 */
export function getCombinedMeasurements(data: EagleViewParserOutput) {
  const s1 = getStructure1(data);
  const s2 = getStructure2(data);
  
  if (!s1 || !s2) {
    // Not a multi-structure report, return Structure 1 / top-level
    return getStructure1Measurements(data);
  }
  
  // Combine measurements from both structures
  const s1Squares = (s1.suggested_waste?.squares ?? data.suggested_waste?.squares ?? 0);
  let s2Squares = (s2.suggested_waste?.squares ?? 0);
  if (!s2Squares || s2Squares <= 0) {
    const baseSquares = (s2.total_area_sqft || 0) / 100;
    let wastePct = 12;
    const pred = (s2.predominant_pitch || '').trim();
    const steep = /^(\d+)\s*\/\s*12$/.exec(pred);
    const steepVal = steep ? parseInt(steep[1], 10) : 0;
    if (baseSquares > 0 && baseSquares < 2) {
      wastePct = 94;
    } else if (steepVal >= 10) {
      wastePct = 18;
    }
    s2Squares = baseSquares * (1 + wastePct / 100);
  }
  const s1Rounded = Math.ceil(s1Squares || 0);
  const s2Rounded = Math.ceil(s2Squares || 0);
  return {
    total_area_sqft: s1.total_area_sqft + s2.total_area_sqft,
    ridges_ft: s1.measurements.ridges_ft + s2.measurements.ridges_ft,
    hips_ft: s1.measurements.hips_ft + s2.measurements.hips_ft,
    valleys_ft: s1.measurements.valleys_ft + s2.measurements.valleys_ft,
    rakes_ft: s1.measurements.rakes_ft + s2.measurements.rakes_ft,
    eaves_ft: s1.measurements.eaves_ft + s2.measurements.eaves_ft,
    flashing_ft: s1.measurements.flashing_ft + s2.measurements.flashing_ft,
    step_flashing_ft: s1.measurements.step_flashing_ft + s2.measurements.step_flashing_ft,
    drip_edge_ft: s1.measurements.drip_edge_ft + s2.measurements.drip_edge_ft,
    predominant_pitch: s1.predominant_pitch,  // Use main structure's pitch
    suggested_squares: s1Rounded + s2Rounded,
    pitch_breakdown: mergePitchBreakdowns(s1.pitch_breakdown, s2.pitch_breakdown)
  };
}

export function getSelectedMeasurements(data: EagleViewParserOutput, include2: boolean, include3: boolean) {
  const s1 = getStructure1(data);
  if (!s1) return getStructure1Measurements(data);
  const structs: EagleViewStructure[] = [s1];
  if (include2) {
    const s2 = getStructure2(data);
    if (s2) structs.push(s2);
  }
  if (include3) {
    const s3 = getStructure3(data);
    if (s3) structs.push(s3);
  }
  if (structs.length === 1) return getStructure1Measurements(data);
  const sumSquares = (s: EagleViewStructure) => {
    let sq = s.suggested_waste?.squares ?? 0;
    if (!sq || sq <= 0) {
      const base = (s.total_area_sqft || 0) / 100;
      let waste = 12;
      const pred = (s.predominant_pitch || '').trim();
      const steep = /^(\d+)\s*\/\s*12$/.exec(pred);
      const steepVal = steep ? parseInt(steep[1], 10) : 0;
      if (base > 0 && base < 2) {
        waste = 94;
      } else if (steepVal >= 10) {
        waste = 18;
      }
      sq = base * (1 + waste / 100);
    }
    return Math.ceil(sq || 0);
  };
  const totalArea = structs.reduce((a, s) => a + (s.total_area_sqft || 0), 0);
  const ridges = structs.reduce((a, s) => a + (s.measurements.ridges_ft || 0), 0);
  const hips = structs.reduce((a, s) => a + (s.measurements.hips_ft || 0), 0);
  const valleys = structs.reduce((a, s) => a + (s.measurements.valleys_ft || 0), 0);
  const rakes = structs.reduce((a, s) => a + (s.measurements.rakes_ft || 0), 0);
  const eaves = structs.reduce((a, s) => a + (s.measurements.eaves_ft || 0), 0);
  const flashing = structs.reduce((a, s) => a + (s.measurements.flashing_ft || 0), 0);
  const stepFlashing = structs.reduce((a, s) => a + (s.measurements.step_flashing_ft || 0), 0);
  const dripEdge = structs.reduce((a, s) => a + (s.measurements.drip_edge_ft || 0), 0);
  const pitches = mergePitchBreakdowns(structs[0].pitch_breakdown, structs.slice(1).reduce((acc, st) => mergePitchBreakdowns(acc, st.pitch_breakdown), [] as EagleViewPitch[]));
  return {
    total_area_sqft: totalArea,
    ridges_ft: ridges,
    hips_ft: hips,
    valleys_ft: valleys,
    rakes_ft: rakes,
    eaves_ft: eaves,
    flashing_ft: flashing,
    step_flashing_ft: stepFlashing,
    drip_edge_ft: dripEdge,
    predominant_pitch: structs[0].predominant_pitch,
    suggested_squares: structs.reduce((a, s) => a + sumSquares(s), 0),
    pitch_breakdown: pitches
  };
}

/**
 * Merge pitch breakdowns from two structures
 */
function mergePitchBreakdowns(
  pitches1: EagleViewPitch[], 
  pitches2: EagleViewPitch[]
): EagleViewPitch[] {
  const merged = new Map<string, EagleViewPitch>();
  
  for (const p of pitches1) {
    merged.set(p.pitch, { ...p });
  }
  
  for (const p of pitches2) {
    if (merged.has(p.pitch)) {
      const existing = merged.get(p.pitch)!;
      existing.area_sqft += p.area_sqft;
      // Recalculate percent later if needed
    } else {
      merged.set(p.pitch, { ...p });
    }
  }
  
  return Array.from(merged.values());
}

// ============================================
// USAGE EXAMPLE FOR YOUR estimates.ts
// ============================================
/*
import { 
  EagleViewParserOutput, 
  hasMultipleStructures,
  getStructure1Measurements,
  getCombinedMeasurements 
} from './eagleview-types';

// In your API route:
const parserOutput: EagleViewParserOutput = JSON.parse(stdout);

// Check for multi-structure
const isMultiStructure = hasMultipleStructures(parserOutput);

// Get measurements based on toggle
const includeDetached = req.body.includeDetachedStructure;
const measurements = includeDetached 
  ? getCombinedMeasurements(parserOutput)
  : getStructure1Measurements(parserOutput);

// Use measurements for your estimate
const squares = measurements.suggested_squares;
const ridges = measurements.ridges_ft;
const rakes = measurements.rakes_ft;
// etc...
*/
