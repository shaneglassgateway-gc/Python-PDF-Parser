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
    suggested_squares: s1.suggested_waste?.squares || 0,
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
    suggested_squares: (s1.suggested_waste?.squares || 0) + (s2.suggested_waste?.squares || 0),
    pitch_breakdown: mergePitchBreakdowns(s1.pitch_breakdown, s2.pitch_breakdown)
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
