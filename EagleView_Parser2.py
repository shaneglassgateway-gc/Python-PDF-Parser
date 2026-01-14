#!/usr/bin/env python3
"""
EagleView PDF Report Parser
Extracts roof, wall, window/door measurements from EagleView Premium reports.
"""

import pdfplumber
import re
import json
from dataclasses import dataclass, asdict
from typing import Optional, List, Dict, Any, Tuple


@dataclass
class RoofMeasurements:
    total_area_sqft: float
    total_facets: int
    predominant_pitch: str
    num_stories: str
    ridges_ft: float
    hips_ft: float
    valleys_ft: float
    rakes_ft: float
    eaves_ft: float
    flashing_ft: float
    step_flashing_ft: float
    drip_edge_ft: float
    estimated_attic_sqft: Optional[float] = None


@dataclass
class WallMeasurements:
    total_wall_area_sqft: float
    total_wall_facets: int
    total_siding_area_sqft: float
    total_masonry_area_sqft: float


@dataclass
class PitchBreakdown:
    pitch: str
    area_sqft: float
    percent_of_roof: float


@dataclass
class WindowDoor:
    label: str
    area_sqft: float
    perimeter_ft: float
    width_ft: float
    height_ft: float
    wall_direction: str


@dataclass
class WasteCalculation:
    waste_percent: int
    area_sqft: float
    squares: float
    is_suggested: bool = False


@dataclass
class Structure:
    """Individual structure measurements for multi-structure reports"""
    structure_number: int
    total_area_sqft: float
    total_facets: int
    predominant_pitch: str
    ridges_ft: float
    hips_ft: float
    valleys_ft: float
    rakes_ft: float
    eaves_ft: float
    flashing_ft: float
    step_flashing_ft: float
    drip_edge_ft: float
    pitch_breakdown: List['PitchBreakdown']
    waste_calculations: List['WasteCalculation']
    suggested_waste: Optional['WasteCalculation']
    complexity: Optional[str] = None  # Simple, Normal, Complex


@dataclass
class EagleViewReport:
    # Property Info
    address: str
    report_number: str
    report_date: str
    prepared_for_contact: str
    prepared_for_company: str
    
    # Combined Measurements (All Structures)
    roof: RoofMeasurements
    walls: Optional[WallMeasurements]
    pitch_breakdown: List[PitchBreakdown]
    waste_calculations: List[WasteCalculation]
    suggested_waste: Optional[WasteCalculation]
    windows_doors: List[WindowDoor]
    
    # Individual Structures (for multi-structure reports)
    structures: List[Structure]
    
    # Coordinates
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class EagleViewParser:
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.text_content = ""
        self.pages_text = []
        
    def extract_text(self):
        """Extract all text from PDF"""
        with pdfplumber.open(self.pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                self.pages_text.append(page_text)
            self.text_content = "\n".join(self.pages_text)
        return self.text_content
    
    def _extract_number(self, pattern: str, text: str = None) -> Optional[float]:
        """Extract a number using regex pattern"""
        if text is None:
            text = self.text_content
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                # Remove commas and convert to float
                return float(match.group(1).replace(",", ""))
            except (ValueError, IndexError):
                return None
        return None
    
    def _extract_string(self, pattern: str, text: str = None) -> Optional[str]:
        """Extract a string using regex pattern"""
        if text is None:
            text = self.text_content
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        return None
    
    def parse_property_info(self) -> Dict[str, str]:
        """Extract property information"""
        # Address - look for street number followed by street name and state/zip
        # Use a more specific pattern to avoid capturing dates
        address_match = re.search(
            r'(\d{1,6}\s+[A-Za-z][A-Za-z0-9\s]+(?:Lane|Ln|Street|St|Road|Rd|Ave|Avenue|Dr|Drive|Ct|Court|Blvd|Boulevard|Way|Circle|Cir|Place|Pl)[^,]*,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)',
            self.text_content
        )
        address = address_match.group(1).strip() if address_match else ""
        
        # Report number - specifically look for "Report: XXXXXXXX" format
        report_num = self._extract_string(r'Report:\s*(\d{6,})')
        
        # Date
        date_match = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', self.text_content)
        report_date = date_match.group(1) if date_match else ""
        
        # Prepared for
        contact = self._extract_string(r'Contact:\s*([^\n]+)')
        company = self._extract_string(r'Company:\s*([^\n]+)')
        
        return {
            "address": address,
            "report_number": report_num or "",
            "report_date": report_date,
            "prepared_for_contact": contact or "",
            "prepared_for_company": company or ""
        }
    
    def parse_roof_measurements(self) -> RoofMeasurements:
        """Extract roof measurements from the report"""
        
        # Total roof area
        total_area = self._extract_number(r'Total\s+(?:Roof\s+)?Area\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*sq\s*ft')
        if not total_area:
            total_area = self._extract_number(r'Total\s+Area\s*\(All\s+Pitches\)\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*sq\s*ft')
        
        # Total facets
        total_facets = self._extract_number(r'Total\s+(?:Roof\s+)?Facets\s*[=:]\s*(\d+)')
        
        # Predominant pitch
        pitch = self._extract_string(r'Predominant\s+Pitch\s*[=:]\s*(\d+/\d+)')
        
        # Number of stories
        stories = self._extract_string(r'Number\s+of\s+Stories\s*[=:>]\s*([^\n]+)')
        
        # Line lengths - use more specific patterns
        ridges = self._extract_number(r'Ridges?\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*ft')
        
        # Hips - must not match "Ridges/Hips" combined
        hips_match = re.search(r'(?<!/)\bHips?\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*ft', self.text_content)
        hips = float(hips_match.group(1).replace(",", "")) if hips_match else 0
        
        valleys = self._extract_number(r'Valleys?\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*ft')
        rakes = self._extract_number(r'Rakes?(?:\†)?\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*ft')
        eaves = self._extract_number(r'Eaves?(?:/Starter)?(?:\‡)?\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*ft')
        flashing = self._extract_number(r'(?<!Step\s)Flashing\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*ft')
        step_flashing = self._extract_number(r'Step\s+[Ff]lashing\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*ft')
        
        # Drip edge - explicit or computed from eaves + rakes
        drip_edge = None
        drip_edge_match = re.search(r'Drip\s+Edge\s*\([^)]*\)\s*=\s*([\d,]+(?:\.\d+)?)\s*ft', self.text_content)
        if drip_edge_match:
            drip_edge = float(drip_edge_match.group(1).replace(",", ""))
        else:
            drip_edge = (eaves or 0) + (rakes or 0)
        
        # Estimated attic
        attic = self._extract_number(r'Estimated\s+Attic\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*sq\s*ft')
        
        return RoofMeasurements(
            total_area_sqft=total_area or 0,
            total_facets=int(total_facets) if total_facets else 0,
            predominant_pitch=pitch or "",
            num_stories=stories or "",
            ridges_ft=ridges or 0,
            hips_ft=hips,
            valleys_ft=valleys or 0,
            rakes_ft=rakes or 0,
            eaves_ft=eaves or 0,
            flashing_ft=flashing or 0,
            step_flashing_ft=step_flashing or 0,
            drip_edge_ft=drip_edge or 0,
            estimated_attic_sqft=attic
        )
    
    def parse_wall_measurements(self) -> Optional[WallMeasurements]:
        """Extract wall measurements if present"""
        
        total_wall = self._extract_number(r'Total\s+Wall\s+Area\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*(?:sq\s*)?ft')
        wall_facets = self._extract_number(r'Total\s+Wall\s+Facets\s*[=:]\s*(\d+)')
        siding = self._extract_number(r'Total\s+Siding\s+Area\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*(?:sq\s*)?ft')
        masonry = self._extract_number(r'Total\s+Masonry\s+Area\s*[=:]\s*([\d,]+(?:\.\d+)?)\s*(?:sq\s*)?ft')
        
        if total_wall or siding or masonry:
            return WallMeasurements(
                total_wall_area_sqft=total_wall or 0,
                total_wall_facets=int(wall_facets) if wall_facets else 0,
                total_siding_area_sqft=siding or 0,
                total_masonry_area_sqft=masonry or 0
            )
        return None
    
    def parse_pitch_breakdown(self) -> List[PitchBreakdown]:
        """Extract pitch breakdown from Areas per Pitch table"""
        pitches = []
        
        # Look for the pitch table pattern
        # Format: Roof Pitches | 3/12 | 6/12 | 9/12 etc
        pitch_section = re.search(
            r'Areas?\s+per\s+Pitch.*?Roof\s+Pitches?\s+([\d/\s]+)\s*Area\s*\(sq\s*ft\)\s*([\d.,\s]+)\s*%\s*of\s*Roof\s*([\d.%\s]+)',
            self.text_content,
            re.DOTALL | re.IGNORECASE
        )
        
        if pitch_section:
            pitch_values = re.findall(r'(\d+/\d+)', pitch_section.group(1))
            area_values = re.findall(r'([\d,]+\.?\d*)', pitch_section.group(2))
            percent_values = re.findall(r'([\d.]+)%?', pitch_section.group(3))
            
            for i, pitch in enumerate(pitch_values):
                if i < len(area_values) and i < len(percent_values):
                    try:
                        area = float(area_values[i].replace(",", ""))
                        pct = float(percent_values[i])
                        pitches.append(PitchBreakdown(
                            pitch=pitch,
                            area_sqft=area,
                            percent_of_roof=pct
                        ))
                    except ValueError:
                        continue
        
        return pitches
    
    def parse_waste_calculations(self) -> Tuple[List[WasteCalculation], Optional[WasteCalculation]]:
        """Extract waste calculation table and identify suggested waste"""
        waste_calcs = []
        suggested_waste = None
        
        # Look for waste calculation table
        # Pattern: Waste % | 0% | 5% | 8% | 10% ...
        # The table has "Measured" under 0% and "Suggested" under the recommended percentage
        waste_section = re.search(
            r'Waste\s*%\s*([\d%\s]+)\s*Area\s*\(Sq\s*ft\)\s*([\d,\s]+)\s*Squares\s*\*?\s*([\d.\s]+)(?:.*?(Measured))?(?:.*?(Suggested))?',
            self.text_content,
            re.IGNORECASE | re.DOTALL
        )
        
        if waste_section:
            pct_values = re.findall(r'(\d+)%?', waste_section.group(1))
            area_values = re.findall(r'(\d+)', waste_section.group(2))
            sq_values = re.findall(r'([\d.]+)', waste_section.group(3))

            # Primary: detect the column with an explicit "Suggested" label, regardless of position.
            suggested_pct = None
            table_text = waste_section.group(0)
            # Try to associate Suggested with a nearby percent explicitly in the same textual vicinity
            inline_match = re.search(r'(\d+)%[^\n]{0,120}?Suggested', table_text, re.IGNORECASE)
            if not inline_match:
                inline_match = re.search(r'Suggested[^\n]{0,120}?(\d+)%', table_text, re.IGNORECASE)
            if inline_match:
                try:
                    suggested_pct = int(inline_match.group(1))
                except ValueError:
                    suggested_pct = None

            # Fallback: heuristic based on pitch complexity if explicit label not found
            if suggested_pct is None:
                try:
                    pitch_section = re.search(
                        r'Areas?\s+per\s+Pitch.*?Roof\s+Pitches?\s+([\d/\s]+)\s*Area\s*\(sq\s*ft\)\s*([\d.,\s]+)\s*%\s*of\s*Roof\s*([\d.%\s]+)',
                        self.text_content,
                        re.DOTALL | re.IGNORECASE
                    )
                    pitches_in_section = []
                    if pitch_section:
                        pitches_in_section = re.findall(r'(\d+)/12', pitch_section.group(1))
                    steep_pitches = [int(p) for p in pitches_in_section if int(p) >= 12]
                    has_steep = len(steep_pitches) > 0
                    has_multiple_pitches = len(set(pitches_in_section)) > 1
                    if has_steep:
                        suggested_idx = 6
                    elif has_multiple_pitches:
                        suggested_idx = 4
                    else:
                        suggested_idx = 3
                except Exception:
                    suggested_idx = max(0, min(3, (len(pct_values) // 2)))
                suggested_idx = min(suggested_idx, len(pct_values) - 1) if pct_values else 0
                suggested_pct = int(pct_values[suggested_idx]) if pct_values else None

            for i, pct in enumerate(pct_values):
                if i < len(area_values) and i < len(sq_values):
                    try:
                        pct_int = int(pct)
                        is_suggested = (pct_int == suggested_pct)
                        
                        wc = WasteCalculation(
                            waste_percent=pct_int,
                            area_sqft=float(area_values[i]),
                            squares=float(sq_values[i]),
                            is_suggested=is_suggested
                        )
                        waste_calcs.append(wc)
                        
                        if is_suggested:
                            suggested_waste = wc
                            
                    except ValueError:
                        continue
        
        return waste_calcs, suggested_waste
    
    def _parse_structure_waste(self, structure_text: str, struct_num: int) -> Tuple[List[WasteCalculation], Optional[WasteCalculation]]:
        """Parse waste calculations for a single structure section"""
        waste_calcs = []
        suggested_waste = None
        
        waste_section = re.search(
            r'Waste\s*%\s*([\d%\s]+)\s*Area\s*\(Sq\s*ft\)\s*([\d,\s]+)\s*Squares\s*\*?\s*([\d.\s]+)',
            structure_text,
            re.IGNORECASE
        )
        table_full = re.search(
            r'Waste\s*%\s*[\s\S]*?Squares[\s\S]*?(?=Roof\s+Pitches|Structure\s+\d+|All\s+Structures|REPORT|PAGE|\Z)',
            structure_text,
            re.IGNORECASE
        )
        
        if waste_section:
            pct_values = re.findall(r'(\d+)%?', waste_section.group(1))
            area_values = re.findall(r'(\d+)', waste_section.group(2))
            sq_values = re.findall(r'([\d.]+)', waste_section.group(3))
            table_text = (table_full.group(0) if table_full else waste_section.group(0))
            suggested_pct = None
            # PRIMARY: PDF coordinate-based column alignment
            page_index = None
            for idx, ptxt in enumerate(self.pages_text):
                if re.search(rf'\bStructure[\s:#\-]*{struct_num}\b', ptxt, re.IGNORECASE):
                    if ('Waste' in ptxt) and ('Suggested' in ptxt):
                        page_index = idx
                        break
            if page_index is not None:
                try:
                    import pdfplumber as _pp
                    with _pp.open(self.pdf_path) as pdf:
                        page = pdf.pages[page_index]
                        words = page.extract_words()
                        sug_words = [w for w in words if re.search(r'^suggested$', w.get('text',''), re.IGNORECASE)]
                        if sug_words:
                            sug_word = sug_words[0]
                            sug_center_x = (sug_word['x0'] + sug_word['x1']) / 2
                            sug_top = sug_word['top']
                            candidates = []
                            for w in words:
                                text = w.get('text','')
                                w_top = w['top']
                                if w_top >= sug_top or (sug_top - w_top) > 150:
                                    continue
                                m = re.match(r'^(\d{1,2})%$', text)
                                if m:
                                    pct_val = int(m.group(1))
                                    w_center_x = (w['x0'] + w['x1']) / 2
                                    x_dist = abs(w_center_x - sug_center_x)
                                    if x_dist < 60:
                                        candidates.append((pct_val, x_dist))
                            if candidates:
                                candidates.sort(key=lambda x: x[1])
                                suggested_pct = candidates[0][0]
                except Exception:
                    pass
            # FALLBACK: text proximity if coordinates failed
            if suggested_pct is None:
                sug_label = re.search(r'Suggested', table_text, re.IGNORECASE)
                if sug_label:
                    try:
                        sug_pos = sug_label.start()
                        percent_tokens = list(re.finditer(r'(\d+)\s*%', table_text))
                        if percent_tokens:
                            nearest = min(percent_tokens, key=lambda m: abs(m.start() - sug_pos))
                            suggested_pct = int(nearest.group(1))
                    except Exception:
                        suggested_pct = None
                page_index = None
                for idx, ptxt in enumerate(self.pages_text):
                    if re.search(rf'\bStructure[\s:#\-]*{struct_num}\b', ptxt, re.IGNORECASE):
                        page_index = idx
                        break
                if page_index is not None:
                    try:
                        import pdfplumber as _pp
                        with _pp.open(self.pdf_path) as pdf:
                            page = pdf.pages[page_index]
                            words = page.extract_words()
                            sug_words = [w for w in words if re.search(r'suggested', w.get('text',''), re.IGNORECASE)]
                            if sug_words:
                                w = sug_words[-1]
                                # search above Suggested for a percent token near same column
                                candidates = []
                                for i in range(len(words)):
                                    t = words[i].get('text','')
                                    if re.fullmatch(r'\d{1,2}', t):
                                        # check for % token nearby
                                        neigh = words[i+1].get('text','') if i+1 < len(words) else ''
                                        if neigh.strip() == '%':
                                            # within horizontal proximity and above
                                            if abs(((words[i]['x0'] + words[i]['x1'])/2) - ((w['x0'] + w['x1'])/2)) < 50 and words[i]['top'] < w['top'] and (w['top'] - words[i]['top']) < 200:
                                                candidates.append((int(t), w['top'] - words[i]['top'], abs(((words[i]['x0'] + words[i]['x1'])/2) - ((w['x0'] + w['x1'])/2))))
                                if candidates:
                                    candidates.sort(key=lambda x: (x[1], x[2]))
                                    suggested_pct = candidates[0][0]
                    except Exception:
                        pass
            if suggested_pct is None:
                pitch_section = re.search(
                    r'Roof\s+Pitches?\s+([\d/\s]+)\s*Area\s*\(sq\s*ft\)',
                    structure_text,
                    re.IGNORECASE
                )
                pitches_in_section = []
                if pitch_section:
                    pitches_in_section = re.findall(r'(\d+)/12', pitch_section.group(1))
                steep_pitches = [int(p) for p in pitches_in_section if int(p) >= 12]
                has_steep = len(steep_pitches) > 0
                num_unique_pitches = len(set(pitches_in_section))
                has_high_pitch = any(int(p) >= 10 for p in pitches_in_section)
                if has_steep:
                    suggested_idx = 6
                elif num_unique_pitches >= 3 or (num_unique_pitches >= 2 and has_high_pitch):
                    suggested_idx = 5
                elif num_unique_pitches == 2:
                    suggested_idx = 5
                else:
                    suggested_idx = 3
                if pct_values and int(pct_values[-1]) > 50:
                    suggested_idx = len(pct_values) - 1
                suggested_idx = min(suggested_idx, len(pct_values) - 1) if pct_values else 0
                suggested_pct = int(pct_values[suggested_idx]) if pct_values else None
            
            for i, pct in enumerate(pct_values):
                if i < len(area_values) and i < len(sq_values):
                    try:
                        pct_int = int(pct)
                        is_suggested = (pct_int == suggested_pct)
                        wc = WasteCalculation(
                            waste_percent=pct_int,
                            area_sqft=float(area_values[i]),
                            squares=float(sq_values[i]),
                            is_suggested=is_suggested
                        )
                        waste_calcs.append(wc)
                        if is_suggested:
                            suggested_waste = wc
                    except ValueError:
                        continue
        else:
            pass
        
        return waste_calcs, suggested_waste
    
    def _parse_structure_pitches(self, structure_text: str) -> List[PitchBreakdown]:
        """Parse pitch breakdown for a single structure section"""
        pitches = []
        
        # Look for pitch table in structure section
        pitch_section = re.search(
            r'Roof\s+Pitches?\s+([\d/\s]+)\s*Area\s*\(sq\s*ft\)\s*([\d.,\s]+)\s*%\s*of\s*Roof\s*([\d.%\s]+)',
            structure_text,
            re.IGNORECASE
        )
        
        if pitch_section:
            pitch_values = re.findall(r'(\d+/\d+)', pitch_section.group(1))
            area_values = re.findall(r'([\d,]+\.?\d*)', pitch_section.group(2))
            percent_values = re.findall(r'([\d.]+)%?', pitch_section.group(3))
            
            for i, pitch in enumerate(pitch_values):
                if i < len(area_values) and i < len(percent_values):
                    try:
                        area = float(area_values[i].replace(",", ""))
                        pct = float(percent_values[i])
                        pitches.append(PitchBreakdown(
                            pitch=pitch,
                            area_sqft=area,
                            percent_of_roof=pct
                        ))
                    except ValueError:
                        continue
        
        return pitches
    
    def parse_structures(self) -> List[Structure]:
        """Parse individual structure data using REPORT SUMMARY sections (from UPDATEDevParser)"""
        structures = []
        # Identify REPORT SUMMARY Structure sections
        report_summary_sections = list(re.finditer(
            r'REPORT\s+SUMMARY\s*\n\s*Structure\s*#?\s*(\d+)',
            self.text_content,
            re.IGNORECASE
        ))
        if len(report_summary_sections) < 1:
            report_summary_sections = list(re.finditer(
                r'Structure\s*#?\s*(\d+)\s*\n\s*Areas\s+per\s+Pitch',
                self.text_content,
                re.IGNORECASE
            ))
        if len(report_summary_sections) < 1:
            return structures
        all_structures_match = re.search(r'All\s+Structures\s*\n\s*Areas\s+per\s+Pitch', self.text_content, re.IGNORECASE)
        all_structures_pos = all_structures_match.start() if all_structures_match else len(self.text_content)
        # Measurements by Structure (optional)
        struct_measurements = {}
        mbs_match = re.search(
            r'Measurements\s+by\s+Structure.*?Structure.*?Area.*?Ridges.*?\n(.*?)(?:All\s+values|Online)',
            self.text_content,
            re.DOTALL | re.IGNORECASE
        )
        if mbs_match:
            rows = re.findall(
                r'(\d+)\s+([\d,]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)',
                mbs_match.group(1)
            )
            for row in rows:
                struct_num = int(row[0])
                struct_measurements[struct_num] = {
                    'area': float(row[1].replace(',', '')),
                    'ridges': float(row[2]),
                    'hips': float(row[3]),
                    'valleys': float(row[4]),
                    'rakes': float(row[5]),
                    'eaves': float(row[6]),
                    'flashing': float(row[7]),
                    'step_flashing': float(row[8]),
                    'parapets': float(row[9])
                }
        # Parse each REPORT SUMMARY section
        for i, match in enumerate(report_summary_sections):
            struct_num = int(match.group(1))
            start_pos = match.start()
            end_pos = report_summary_sections[i + 1].start() if i + 1 < len(report_summary_sections) else all_structures_pos
            struct_text = self.text_content[start_pos:end_pos]
            pitch_breakdown = self._parse_structure_pitches(struct_text)
            waste_calcs, suggested_waste = self._parse_structure_waste(struct_text, struct_num)
            # Predominant pitch and facets
            pred_pitch_match = re.search(r'Predominant\s+Pitch\s*[=:]\s*(\d+/\d+)', struct_text, re.IGNORECASE)
            predominant_pitch = pred_pitch_match.group(1) if pred_pitch_match else ""
            facets_match = re.search(r'Total\s+Roof\s+Facets\s*[=:]\s*(\d+)', struct_text, re.IGNORECASE)
            total_facets = int(facets_match.group(1)) if facets_match else 0
            # Measurements
            if struct_num in struct_measurements:
                meas = struct_measurements[struct_num]
                total_area = meas['area']
                ridges = meas['ridges']
                hips = meas['hips']
                valleys = meas['valleys']
                rakes = meas['rakes']
                eaves = meas['eaves']
                flashing = meas['flashing']
                step_flashing = meas['step_flashing']
            else:
                area_match = re.search(r'Total\s+Area\s*\(All\s+Pitches\)\s*[=:]\s*([\d,]+)', struct_text, re.IGNORECASE)
                total_area = float(area_match.group(1).replace(',', '')) if area_match else 0
                ridges_match = re.search(r'Ridges\s*[=:]\s*([\d.]+)', struct_text, re.IGNORECASE)
                ridges = float(ridges_match.group(1)) if ridges_match else 0
                hips_match = re.search(r'(?<!/)\bHips?\s*[=:]\s*([\d.]+)', struct_text, re.IGNORECASE)
                hips = float(hips_match.group(1)) if hips_match else 0
                valleys_match = re.search(r'Valleys\s*[=:]\s*([\d.]+)', struct_text, re.IGNORECASE)
                valleys = float(valleys_match.group(1)) if valleys_match else 0
                rakes_match = re.search(r'Rakes\s*[=:]\s*([\d.]+)', struct_text, re.IGNORECASE)
                rakes = float(rakes_match.group(1)) if rakes_match else 0
                eaves_match = re.search(r'Eaves\s*[=:]\s*([\d.]+)', struct_text, re.IGNORECASE)
                eaves = float(eaves_match.group(1)) if eaves_match else 0
                flashing_match = re.search(r'(?<!Step\s)Flashing\s*[=:]\s*([\d.]+)', struct_text, re.IGNORECASE)
                flashing = float(flashing_match.group(1)) if flashing_match else 0
                step_flashing_match = re.search(r'Step\s+[Ff]lashing\s*[=:]\s*([\d.]+)', struct_text, re.IGNORECASE)
                step_flashing = float(step_flashing_match.group(1)) if step_flashing_match else 0
            drip_edge = rakes + eaves
            # Complexity heuristic
            pitches_in_section = [p.pitch for p in pitch_breakdown]
            steep_pitches = [p for p in pitches_in_section if int(p.split('/')[0]) >= 12]
            if steep_pitches:
                complexity = "Complex"
            elif len(set(pitches_in_section)) > 2:
                complexity = "Normal"
            else:
                complexity = "Simple"
            structure = Structure(
                structure_number=struct_num,
                total_area_sqft=total_area,
                total_facets=total_facets,
                predominant_pitch=predominant_pitch,
                ridges_ft=ridges,
                hips_ft=hips,
                valleys_ft=valleys,
                rakes_ft=rakes,
                eaves_ft=eaves,
                flashing_ft=flashing,
                step_flashing_ft=step_flashing,
                drip_edge_ft=drip_edge,
                pitch_breakdown=pitch_breakdown,
                waste_calculations=waste_calcs,
                suggested_waste=suggested_waste,
                complexity=complexity
            )
            structures.append(structure)
        return structures
    
    def parse_windows_doors(self) -> List[WindowDoor]:
        """Extract window and door measurements"""
        windows_doors = []
        
        # Find all window/door entries in the text
        # Pattern matches: I1 10.0 14.0 2.0 x 5.0
        all_entries = re.findall(
            r'([A-Z]\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*x\s*([\d.]+)',
            self.text_content
        )
        
        # In EagleView reports, window/door labels have prefixes that correspond to wall labels
        # We can map them based on the Elevation diagrams or the wall area diagram
        # Common patterns: 
        #   North: I, J, M, Q, S, V entries
        #   East: B, K, N, W entries
        #   South: A, D, F, G, H, L, R, T entries
        #   West: C, E, O, P, U entries
        
        # Get direction mapping from the window/door section
        direction_map = {}
        
        # Parse each direction's entries from the elevation diagrams or window/door tables
        wd_sections = re.findall(
            r'(North|East|South|West)\s+(?:East|South|West|North)?\s*(?:Window/Door|Perimeter|Siding).*?(?=(?:North|East|South|West|Total\s+[\d,]+\s+[\d.]+|PAGE|\Z))',
            self.text_content,
            re.DOTALL | re.IGNORECASE
        )
        
        # Alternative: find direction associations from elevation summaries
        # Pattern: Wall | Siding | Masonry | Window & Door Area | etc with direction headers
        for direction in ['North', 'East', 'South', 'West']:
            # Find this direction's window/door entries in elevation diagrams
            elev_pattern = rf'{direction}\s+ELEVATION.*?Window\s*&\s*Door.*?Count\s*(.*?)(?=(?:Note:|©|\Z))'
            elev_match = re.search(elev_pattern, self.text_content, re.DOTALL | re.IGNORECASE)
            
            if elev_match:
                section_text = elev_match.group(1)
                # Find wall labels in this section
                wall_labels = re.findall(r'\b([A-Z])\s+[\d.]+\s+[\d.]+', section_text)
                for label in wall_labels:
                    direction_map[label] = direction
        
        # Also try to extract from the window/door table directly
        wd_section = re.search(
            r'WINDOW\s+AND\s+DOOR\s+DIAGRAM.*?(?=ELEVATION|REPORT\s+SUMMARY|\Z)',
            self.text_content,
            re.DOTALL | re.IGNORECASE
        )
        
        if wd_section:
            wd_text = wd_section.group(0)
            
            # Look for entries grouped by direction
            # The table shows directions as headers
            current_direction = None
            lines = wd_text.split('\n')
            
            for line in lines:
                # Check for direction markers
                dir_match = re.match(r'^(North|East|South|West)\b', line, re.IGNORECASE)
                if dir_match:
                    current_direction = dir_match.group(1).title()
                
                # Look for window/door entries
                entry_match = re.search(r'([A-Z]\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*x\s*([\d.]+)', line)
                if entry_match and current_direction:
                    label = entry_match.group(1)
                    # Map the wall letter to this direction
                    wall_letter = label[0]
                    if wall_letter not in direction_map:
                        direction_map[wall_letter] = current_direction
        
        # Now create WindowDoor objects using the direction mapping
        seen_labels = set()
        for entry in all_entries:
            label = entry[0]
            if label in seen_labels:
                continue
            seen_labels.add(label)
            
            wall_letter = label[0]
            direction = direction_map.get(wall_letter, 'Unknown')
            
            try:
                windows_doors.append(WindowDoor(
                    label=label,
                    area_sqft=float(entry[1]),
                    perimeter_ft=float(entry[2]),
                    width_ft=float(entry[3]),
                    height_ft=float(entry[4]),
                    wall_direction=direction
                ))
            except (ValueError, IndexError):
                continue
        
        return windows_doors
    
    def parse_coordinates(self) -> Dict[str, Optional[float]]:
        """Extract GPS coordinates"""
        lat = self._extract_number(r'Latitude\s*[=:]\s*([-\d.]+)')
        lon = self._extract_number(r'Longitude\s*[=:]\s*([-\d.]+)')
        return {"latitude": lat, "longitude": lon}
    
    def parse(self) -> EagleViewReport:
        """Parse the complete EagleView report"""
        self.extract_text()
        
        property_info = self.parse_property_info()
        roof = self.parse_roof_measurements()
        walls = self.parse_wall_measurements()
        pitches = self.parse_pitch_breakdown()
        waste_calcs, suggested_waste = self.parse_waste_calculations()
        windows_doors = self.parse_windows_doors()
        coords = self.parse_coordinates()
        structures = self.parse_structures()
        
        return EagleViewReport(
            address=property_info["address"],
            report_number=property_info["report_number"],
            report_date=property_info["report_date"],
            prepared_for_contact=property_info["prepared_for_contact"],
            prepared_for_company=property_info["prepared_for_company"],
            roof=roof,
            walls=walls,
            pitch_breakdown=pitches,
            waste_calculations=waste_calcs,
            suggested_waste=suggested_waste,
            windows_doors=windows_doors,
            structures=structures,
            latitude=coords["latitude"],
            longitude=coords["longitude"]
        )
    
    def to_dict(self, report: EagleViewReport) -> Dict[str, Any]:
        """Convert report to dictionary"""
        result = {
            "property": {
                "address": report.address,
                "latitude": report.latitude,
                "longitude": report.longitude
            },
            "report_info": {
                "report_number": report.report_number,
                "report_date": report.report_date,
                "prepared_for_contact": report.prepared_for_contact,
                "prepared_for_company": report.prepared_for_company
            },
            "roof_measurements": asdict(report.roof),
            "wall_measurements": asdict(report.walls) if report.walls else None,
            "pitch_breakdown": [asdict(p) for p in report.pitch_breakdown],
            "suggested_waste": asdict(report.suggested_waste) if report.suggested_waste else None,
            "all_waste_calculations": [asdict(w) for w in report.waste_calculations],
            "windows_doors": [asdict(wd) for wd in report.windows_doors]
        }
        
        # Add structures if present (multi-structure reports)
        if report.structures:
            result["structures"] = []
            for struct in report.structures:
                struct_dict = {
                    "structure_number": struct.structure_number,
                    "total_area_sqft": struct.total_area_sqft,
                    "total_facets": struct.total_facets,
                    "predominant_pitch": struct.predominant_pitch,
                    "complexity": struct.complexity,
                    "measurements": {
                        "ridges_ft": struct.ridges_ft,
                        "hips_ft": struct.hips_ft,
                        "valleys_ft": struct.valleys_ft,
                        "rakes_ft": struct.rakes_ft,
                        "eaves_ft": struct.eaves_ft,
                        "flashing_ft": struct.flashing_ft,
                        "step_flashing_ft": struct.step_flashing_ft,
                        "drip_edge_ft": struct.drip_edge_ft
                    },
                    "pitch_breakdown": [asdict(p) for p in struct.pitch_breakdown],
                    "suggested_waste": asdict(struct.suggested_waste) if struct.suggested_waste else None,
                    "all_waste_calculations": [asdict(w) for w in struct.waste_calculations]
                }
                result["structures"].append(struct_dict)
        
        return result
    
    def to_json(self, report: EagleViewReport, indent: int = 2) -> str:
        """Convert report to JSON string"""
        return json.dumps(self.to_dict(report), indent=indent)


def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python eagleview_parser.py <pdf_path> [output_json]")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    parser = EagleViewParser(pdf_path)
    report = parser.parse()
    json_output = parser.to_json(report)
    
    if output_path:
        with open(output_path, 'w') as f:
            f.write(json_output)
        print(f"Report saved to {output_path}")
    else:
        print(json_output)


if __name__ == "__main__":
    main()
