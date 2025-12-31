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
class EagleViewReport:
    # Property Info
    address: str
    report_number: str
    report_date: str
    prepared_for_contact: str
    prepared_for_company: str
    
    # Measurements
    roof: RoofMeasurements
    walls: Optional[WallMeasurements]
    pitch_breakdown: List[PitchBreakdown]
    waste_calculations: List[WasteCalculation]
    suggested_waste: Optional[WasteCalculation]
    windows_doors: List[WindowDoor]
    
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
        
        # Drip edge - may appear as "Drip Edge (Eaves + Rakes)" or just extraction from eaves + rakes
        drip_edge_match = re.search(r'Drip\s+Edge\s*\([^)]*\)\s*=\s*([\d,]+(?:\.\d+)?)\s*ft', self.text_content)
        if drip_edge_match:
            drip_edge = float(drip_edge_match.group(1).replace(",", ""))
        else:
            # Calculate from eaves + rakes if not explicitly stated
            drip_edge = (eaves or 0) + (rakes or 0) if (eaves or rakes) else 0
        
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
            
            # Determine suggested waste percentage
            # EagleView typically marks one column as "Suggested" - usually 10% for normal complexity
            # Look for explicit "Suggested" marker position or use the bolded/highlighted one
            suggested_pct = None
            
            # Check if there's explicit text indicating suggested percentage
            suggested_match = re.search(
                r'(\d+)%\s*\n?\s*Area.*?Suggested|Suggested.*?(\d+)%',
                self.text_content,
                re.IGNORECASE | re.DOTALL
            )
            
            # In most EagleView reports, 10% is suggested for normal complexity
            # The pattern shows columns with "Measured" under 0% and "Suggested" typically under 10%
            # Count position of "Suggested" label if it appears after the table
            full_waste_section = re.search(
                r'Waste\s*%\s*([\d%\s]+).*?Measured\s*(Suggested)?',
                self.text_content,
                re.IGNORECASE | re.DOTALL
            )
            
            if full_waste_section and 'Suggested' in self.text_content:
                # Find which column has the suggested marker
                # Typically it's the 4th column (index 3) which is 10%
                # But let's check if 10% exists in the values
                if '10' in pct_values:
                    suggested_pct = 10
                else:
                    # Default to middle value
                    mid_idx = len(pct_values) // 2
                    suggested_pct = int(pct_values[mid_idx]) if pct_values else None
            
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
            latitude=coords["latitude"],
            longitude=coords["longitude"]
        )
    
    def to_dict(self, report: EagleViewReport) -> Dict[str, Any]:
        """Convert report to dictionary"""
        return {
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
